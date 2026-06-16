#!/usr/bin/env node

/**
 * Generate PHP API reference docs (classes + functions) for each product repo.
 *
 * Output:
 *   docs/<product-id>/api/**
 *
 * Usage:
 *   npm run api:generate
 *   npm run api:generate -- --product gravityview
 *   npm run api:generate -- --list
 *   npm run api:generate -- --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    product: null,
    dryRun: false,
    list: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--product') {
      args.product = argv[i + 1] ?? null;
      i++;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--list') {
      args.list = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  npm run api:generate
  npm run api:generate -- --product <id>
  npm run api:generate -- --list
  npm run api:generate -- --dry-run`);
      process.exit(0);
    }
  }

  return args;
}

function loadConfig() {
  const configPath = path.join(PROJECT_ROOT, 'repos-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function loadTypeLinks() {
  const typeLinksPath = path.join(PROJECT_ROOT, 'type-links.json');
  try {
    const raw = fs.readFileSync(typeLinksPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Object.entries(parsed?.types ?? {});
    const map = new Map();
    for (const [k, v] of entries) {
      if (!k || !v) continue;
      map.set(String(k).replace(/^\\+/, ''), String(v));
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Scan existing API docs across all products to build cross-product type links.
 * This allows types like \GV\View referenced in gravityview-advanced-filtering
 * to link to the gravityview docs.
 */
function buildCrossProductTypeLinks(docsDir) {
  const map = new Map();
  if (!fs.existsSync(docsDir)) return map;

  // Scan all product directories
  const productDirs = fs.readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const productId of productDirs) {
    const classesDir = path.join(docsDir, productId, 'api', 'classes');
    if (!fs.existsSync(classesDir)) continue;

    const classFiles = fs.readdirSync(classesDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith('.md') && f.name !== 'index.md');

    for (const file of classFiles) {
      const filePath = path.join(classesDir, file.name);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Extract FQCN from title frontmatter
        const titleMatch = content.match(/^---[\s\S]*?title:\s*(.+?)[\r\n]/m);
        if (!titleMatch) continue;
        const fqcn = titleMatch[1].trim().replace(/^\\+/, '');
        if (!fqcn) continue;

        const slug = file.name.replace(/\.md$/, '');
        const url = `/docs/${productId}/api/classes/${slug}/`;

        // Add both with and without namespace prefix
        map.set(fqcn, url);
        // Also add the fully qualified version with backslash
        if (!fqcn.startsWith('\\')) {
          map.set(`\\${fqcn}`, url);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return map;
}

function collectMarkdownFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectMarkdownFiles(p));
      continue;
    }
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.md')) continue;
    if (ent.name === 'index.md') continue;
    out.push(p);
  }
  return out;
}

/**
 * Parse a symbol reference (from @see or backtick) and add to result.
 * Handles: ClassName, \Namespace\ClassName, ClassName::methodName, \Namespace\Class::method
 */
function parseSymbolReference(ref, result) {
  // Remove trailing parentheses and trim
  const cleaned = ref.replace(/\(\)$/, '').replace(/^\\+/, '').trim();
  if (!cleaned) return;

  // Check for Class::$property pattern (property references)
  const propertyMatch = cleaned.match(/^(.+)::\$(\w+)$/);
  if (propertyMatch) {
    const className = propertyMatch[1].replace(/^\\+/, '');
    const propertyName = propertyMatch[2];
    result.classes.add(className);
    if (!result.properties.has(className)) {
      result.properties.set(className, new Set());
    }
    result.properties.get(className).add(propertyName);
    return;
  }

  // Check for Class::method pattern
  const methodMatch = cleaned.match(/^(.+)::(\w+)$/);
  if (methodMatch) {
    const className = methodMatch[1].replace(/^\\+/, '');
    const methodName = methodMatch[2];
    result.classes.add(className);
    if (!result.methods.has(className)) {
      result.methods.set(className, new Set());
    }
    result.methods.get(className).add(methodName);
    return;
  }

  // Check if it looks like a function (starts with lowercase, no namespace separator)
  const isFunction = /^[a-z_]/.test(cleaned) && !cleaned.includes('\\');
  if (isFunction) {
    result.functions.add(cleaned);
    return;
  }

  // Otherwise treat as class reference if it starts with uppercase
  const lastPart = cleaned.split('\\').pop() || '';
  if (/^[A-Z]/.test(lastPart)) {
    result.classes.add(cleaned);
  }
}

/**
 * Extract referenced symbols from markdown text.
 * Returns: { classes: Set, methods: Map<className, Set<methodName>>, functions: Set }
 */
function extractReferencedSymbolsFromText(markdown) {
  const text = String(markdown ?? '');
  const result = {
    classes: new Set(),
    methods: new Map(),
    properties: new Map(),
    functions: new Set(),
  };

  // 1. Extract {@see ...} patterns (inline docblock references)
  // Matches: {@see \GV\View::as_data()} or \{@see \get_bloginfo()\}
  for (const m of text.matchAll(/\\?\{@see\s+\\?([^}]+)\}/g)) {
    parseSymbolReference(m[1].trim(), result);
  }

  // 2. Extract See Also section backtick entries
  // Matches: - `ClassName::methodName` or - `\Namespace\Class::method`
  for (const m of text.matchAll(/^-\s+`([^`]+)`/gm)) {
    parseSymbolReference(m[1].trim(), result);
  }

  // 3. Extract namespaced types from backticks (for type references in tables)
  const found = new Set();
  for (const m of text.matchAll(/\`([^\`]+)\`/g)) {
    const inner = (m[1] ?? '').trim();
    if (inner) found.add(inner);
  }

  // Also capture namespaced types in raw text / HTML (eg <a> \GV\View </a>).
  for (const m of text.matchAll(/\\[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+/g)) {
    const inner = (m[0] ?? '').trim();
    if (inner) found.add(inner);
  }

  // Process found type references
  for (const raw of found) {
    const cleaned = String(raw)
      .replace(/\\\|/g, '|')
      .replace(/\s+/g, ' ')
      .trim();

    const pieces = cleaned
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    for (let p of pieces) {
      p = p.replace(/\[\]$/g, '').trim();
      p = p.replace(/^\?/, '').trim();
      p = p.replace(/^\\+/, '').trim();
      if (!p) continue;

      // Handle Class::method references
      if (p.includes('::')) {
        parseSymbolReference(p, result);
        continue;
      }

      // Handle class/type references
      if (
        /^\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+$/.test(`\\${p}`) ||
        /^[A-Z][A-Za-z0-9_]*$/.test(p)
      ) {
        result.classes.add(p);
      }
    }
  }

  return result;
}

/**
 * Collect all referenced symbols from hooks documentation.
 * Returns: { classes: Set, methods: Map, properties: Map, functions: Set }
 */
function collectReferencedSymbolsFromHooksDocs({ outputBaseDir, productId }) {
  const base = path.join(outputBaseDir, productId);
  const actionsDir = path.join(base, 'actions');
  const filtersDir = path.join(base, 'filters');
  const files = [...collectMarkdownFiles(actionsDir), ...collectMarkdownFiles(filtersDir)];

  const result = {
    classes: new Set(),
    methods: new Map(),
    properties: new Map(),
    functions: new Set(),
  };

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const extracted = extractReferencedSymbolsFromText(content);

    // Merge classes
    for (const c of extracted.classes) result.classes.add(c);

    // Merge methods
    for (const [className, methods] of extracted.methods) {
      if (!result.methods.has(className)) {
        result.methods.set(className, new Set());
      }
      for (const m of methods) {
        result.methods.get(className).add(m);
      }
    }

    // Merge properties
    for (const [className, properties] of extracted.properties) {
      if (!result.properties.has(className)) {
        result.properties.set(className, new Set());
      }
      for (const p of properties) {
        result.properties.get(className).add(p);
      }
    }

    // Merge functions
    for (const f of extracted.functions) result.functions.add(f);
  }

  return result;
}

/**
 * Extract class references from property types of already-referenced classes.
 * This ensures that if a class is included, classes referenced in its property types are also included.
 * @param {Array} allClasses - All extracted classes from PHP
 * @param {Object} referencedSymbols - Current set of referenced symbols
 * @returns {void} - Modifies referencedSymbols in place
 */
function expandReferencesFromPropertyTypes(allClasses, referencedSymbols) {
  // Build a set of classes we need to scan (those already referenced)
  const classesToScan = new Set(referencedSymbols.classes);
  const scanned = new Set();

  // Keep expanding until no new classes are added
  while (classesToScan.size > 0) {
    const className = classesToScan.values().next().value;
    classesToScan.delete(className);
    if (scanned.has(className)) continue;
    scanned.add(className);

    // Find this class in allClasses
    const classData = allClasses.find((c) => {
      const fqcn = String(c.fqcn || '').replace(/^\\+/, '');
      return fqcn === className || fqcn.endsWith(`\\${className}`);
    });

    if (!classData?.properties) continue;

    // Extract class references from property types
    for (const prop of classData.properties) {
      // Get type from @var docblock tag or native type
      const doc = parseDocblock(prop.docblock);
      const varTag = parseVarTagValue((doc.tags?.var ?? [])[0]);
      const typeStr = String(varTag?.type || prop.type || '');
      if (!typeStr) continue;

      // Split union types and process each
      const types = typeStr.split(/\s*\|\s*/);
      for (let t of types) {
        // Remove array suffix and nullable prefix
        t = t.replace(/\[\]+$/g, '').replace(/^\?/, '').replace(/^\\+/, '').trim();
        if (!t) continue;

        // Check if it looks like a namespaced class
        if (t.includes('\\') && /^[A-Za-z_]/.test(t)) {
          if (!referencedSymbols.classes.has(t)) {
            referencedSymbols.classes.add(t);
            classesToScan.add(t);
          }
        }
      }
    }
  }
}

/**
 * Extract function and class references from @see tags in parsed PHP class docblocks.
 * This ensures that symbols referenced via @see in API docs (not just hooks docs) are included.
 * Only processes classes that are already referenced or marked @api/@public to avoid pulling
 * in references from classes that won't be documented.
 * @param {Array} allClasses - All extracted classes from PHP
 * @param {Object} referencedSymbols - Current set of referenced symbols
 * @returns {void} - Modifies referencedSymbols in place
 */
function expandReferencesFromClassDocSee(allClasses, referencedSymbols) {
  /**
   * Process a single @see tag and extract references
   * @param {string} ref - The @see tag value
   */
  function processSeeRef(ref) {
    ref = String(ref ?? '').trim();
    if (!ref) return;

    // Match ClassName::methodName() pattern (e.g., "GravityView_Merge_Tags::replace_variables()")
    // Also handles \ClassName::method() with leading backslash
    const methodMatch = ref.match(/^\\?([A-Za-z_][A-Za-z0-9_\\]*)::(\w+)\(\)/);
    if (methodMatch) {
      const className = methodMatch[1];
      const methodName = methodMatch[2];
      // Normalize class name (strip leading backslash, convert namespace separators)
      const normalizedClass = className.replace(/^\\/, '').replace(/\\/g, '\\');
      referencedSymbols.classes.add(normalizedClass);
      if (!referencedSymbols.methods.has(normalizedClass)) {
        referencedSymbols.methods.set(normalizedClass, new Set());
      }
      referencedSymbols.methods.get(normalizedClass).add(methodName);
      return;
    }

    // Match standalone function names (starts with lowercase, no ::, optionally has ())
    const funcMatch = ref.match(/^\\?([a-z_][a-z0-9_]*)\s*\(?\)?/i);
    if (funcMatch && /^[a-z_]/.test(funcMatch[1]) && !ref.includes('::')) {
      referencedSymbols.functions.add(funcMatch[1]);
    }
  }

  // Build a set of classes we should process (referenced or marked @api/@public)
  const classesToProcess = new Set();
  for (const classData of allClasses) {
    const fqcn = classData.fqcn || classData.name;
    const shortName = classData.name;
    const classDoc = parseDocblock(classData.docblock);

    // Check if class is already referenced
    const isReferenced =
      referencedSymbols.classes.has(fqcn) ||
      referencedSymbols.classes.has(shortName) ||
      referencedSymbols.methods.has(fqcn) ||
      referencedSymbols.methods.has(shortName);

    // Check if class or any method has @api or @public
    const markedPublic =
      isMarkedPublicApi(classDoc) ||
      (classData.methods ?? []).some((m) => isMarkedPublicApi(parseDocblock(m.docblock)));

    if (isReferenced || markedPublic) {
      classesToProcess.add(fqcn);
    }
  }

  // Now process @see tags only from classes we're going to document
  for (const classData of allClasses) {
    const fqcn = classData.fqcn || classData.name;
    if (!classesToProcess.has(fqcn)) continue;

    // Check class-level @see tags
    const classDoc = parseDocblock(classData.docblock);
    for (const seeTag of classDoc.tags?.see ?? []) {
      processSeeRef(seeTag);
    }

    // Check method-level @see tags
    for (const method of classData.methods ?? []) {
      const methodDoc = parseDocblock(method.docblock);
      for (const seeTag of methodDoc.tags?.see ?? []) {
        processSeeRef(seeTag);
      }
    }
  }
}

function checkPhpAvailable() {
  const result = spawnSync('php', ['-v'], { encoding: 'utf8', stdio: 'pipe' });
  return !result.error && result.status === 0;
}

function ensureDir(dir, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content, dryRun) {
  if (dryRun) return;
  fs.writeFileSync(filePath, content, 'utf8');
}

function rmDir(dir, dryRun) {
  if (dryRun) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function slugify(name) {
  return name
    .replace(/^\\+/, '')
    .replace(/[\\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function parseDocblock(raw) {
  if (!raw) {
    return {
      summary: '',
      description: '',
      tags: {},
      internal: false,
    };
  }

  const cleaned = raw
    .replace(/^\/\*\*\s?/, '')
    .replace(/\s?\*\/$/, '');

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd());

  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const tags = {};
  const descLines = [];
  let summary = '';
  let inTags = false;
  let lastTagName = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@')) {
      inTags = true;
    }

    if (!inTags) {
      if (!summary && trimmed !== '') {
        summary = trimmed;
      } else if (summary) {
        descLines.push(line);
      }
      continue;
    }

    if (trimmed.startsWith('@')) {
      const [tag, ...restParts] = trimmed.split(/\s+/);
      const name = tag.slice(1);
      const rest = restParts.join(' ').trim();
      tags[name] ??= [];
      tags[name].push(rest);
      lastTagName = name;
      continue;
    }

    // Continuation line for previous tag value (multiline tags).
    if (lastTagName && trimmed !== '') {
      const values = tags[lastTagName];
      if (Array.isArray(values) && values.length > 0) {
        values[values.length - 1] = `${values[values.length - 1]}\n${line}`.trim();
      }
    }
  }

  const description = descLines.join('\n').trim();
  const internal = (tags.internal?.length ?? 0) > 0;

  return { summary, description, tags, internal };
}

function hasMeaningfulDoc(doc) {
  if (!doc) return false;
  if (doc.summary || doc.description) return true;
  const tagKeys = Object.keys(doc.tags || {}).filter((k) => k !== 'internal');
  return tagKeys.some((k) => (doc.tags?.[k]?.length ?? 0) > 0);
}

/**
 * Check if a docblock contains @inheritDoc tag.
 */
function hasInheritDoc(doc) {
  if (!doc) return false;
  // Check for @inheritDoc or @inheritdoc tag
  if (doc.tags?.inheritDoc?.length || doc.tags?.inheritdoc?.length) return true;
  // Check for {@inheritDoc} or {@inheritdoc} in summary/description
  const text = `${doc.summary || ''} ${doc.description || ''}`;
  return /\{@inherit[Dd]oc\}/.test(text);
}

/**
 * Check if a docblock is explicitly marked as public API via @api or @public tags.
 */
function isMarkedPublicApi(doc) {
  if (!doc?.tags) return false;
  return !!(doc.tags.api?.length || doc.tags.public?.length);
}

/**
 * Build a map of class FQCN -> class data for quick lookup.
 */
function buildClassMap(allClasses) {
  const map = new Map();
  for (const c of allClasses) {
    const fqcn = String(c.fqcn || '').replace(/^\\+/, '');
    if (fqcn) map.set(fqcn, c);
    // Also map short name for fallback
    const shortName = fqcn.split('\\').pop();
    if (shortName && !map.has(shortName)) map.set(shortName, c);
  }
  return map;
}

/**
 * Find a method in parent classes/interfaces.
 * @param {string} methodName - Method name to find
 * @param {Array} parents - List of parent class/interface names
 * @param {Map} classMap - Map of FQCN -> class data
 * @param {Set} visited - Already visited classes (to prevent cycles)
 * @returns {Object|null} - Method data with parsed docblock, or null
 */
function findMethodInParents(methodName, parents, classMap, visited = new Set()) {
  for (const parentName of parents) {
    const cleanName = String(parentName).replace(/^\\+/, '');
    if (visited.has(cleanName)) continue;
    visited.add(cleanName);

    const parentClass = classMap.get(cleanName);
    if (!parentClass) continue;

    // Look for the method in this parent
    const method = (parentClass.methods || []).find((m) => m.name === methodName);
    if (method) {
      const md = parseDocblock(method.docblock);
      // If parent also has @inheritDoc, keep looking up the chain
      if (hasInheritDoc(md)) {
        const grandParents = [
          ...(Array.isArray(parentClass.extends) ? parentClass.extends : parentClass.extends ? [parentClass.extends] : []),
          ...(parentClass.implements || []),
        ];
        const inherited = findMethodInParents(methodName, grandParents, classMap, visited);
        if (inherited) return inherited;
      }
      return { method, doc: md };
    }

    // Not found in this parent, check its parents
    const grandParents = [
      ...(Array.isArray(parentClass.extends) ? parentClass.extends : parentClass.extends ? [parentClass.extends] : []),
      ...(parentClass.implements || []),
    ];
    const inherited = findMethodInParents(methodName, grandParents, classMap, visited);
    if (inherited) return inherited;
  }
  return null;
}

/**
 * Resolve @inheritDoc for a method by looking up parent class documentation.
 */
function resolveInheritDoc(method, methodDoc, classData, classMap) {
  if (!hasInheritDoc(methodDoc)) return methodDoc;

  const parents = [
    ...(Array.isArray(classData.extends) ? classData.extends : classData.extends ? [classData.extends] : []),
    ...(classData.implements || []),
  ];

  const inherited = findMethodInParents(method.name, parents, classMap);
  if (!inherited) return methodDoc;

  // Merge inherited doc with current doc (current takes precedence for non-empty values)
  return {
    summary: methodDoc.summary?.replace(/\{@inherit[Dd]oc\}/g, '').trim() || inherited.doc.summary,
    description: methodDoc.description?.replace(/\{@inherit[Dd]oc\}/g, '').trim() || inherited.doc.description,
    tags: {
      ...inherited.doc.tags,
      ...Object.fromEntries(
        Object.entries(methodDoc.tags || {}).filter(([k, v]) => v?.length > 0)
      ),
    },
    internal: methodDoc.internal,
  };
}

function extractDefaultFromParamDescription(description) {
  const text = String(description ?? '');
  const match = text.match(/\(\s*default\s*:\s*([^)]+)\)/i);
  if (!match?.[1]) return '';
  const raw = match[1].trim().replace(/^`(.+)`$/, '$1').trim();
  if (/^empty\s+string$/i.test(raw)) return "''";
  return phpShortArraySyntax(raw);
}

function parseParamTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;

  // Typical: "@param type $name Description"
  const match = v.match(
    /^(\S+)\s+(&)?(\.\.\.)?(\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)(?:\s+([\s\S]+))?$/
  );
  if (match) {
    const description = (match[5] ?? '').trim();
    return {
      type: match[1] ?? '',
      byRef: Boolean(match[2]),
      variadic: Boolean(match[3]),
      name: match[4] ?? '',
      default: extractDefaultFromParamDescription(description),
      description,
    };
  }

  // Fallback: "@param $name Description" or "@param type Description"
  const parts = v.split(/\s+/);
  if (parts[0]?.startsWith('$')) {
    const description = parts.slice(1).join(' ').trim();
    return { type: '', name: parts[0], default: extractDefaultFromParamDescription(description), description };
  }
  const description = parts.slice(1).join(' ').trim();
  return { type: parts[0] ?? '', name: '', default: extractDefaultFromParamDescription(description), description };
}

function parseReturnTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const parts = v.split(/\s+/);
  return { type: parts[0] ?? '', description: parts.slice(1).join(' ').trim() };
}

function parseThrowsTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const parts = v.split(/\s+/);
  return { type: parts[0] ?? '', description: parts.slice(1).join(' ').trim() };
}

function parseSinceTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const match = v.match(/^([0-9][0-9A-Za-z.\-_]*)(?:\s+([\s\S]+))?$/);
  if (match) return { version: match[1] ?? '', description: (match[2] ?? '').trim() };
  return { version: v, description: '' };
}

/**
 * Extract version numbers from parsed @since tags for use in frontmatter tags.
 * @param {Array<{version: string, description: string}>} since - Parsed since tags
 * @returns {string[]} - Array of version strings (e.g., ["1.0", "2.0"])
 */
function extractVersionTags(since) {
  if (!since || since.length === 0) return [];
  return since
    .map((s) => s.version)
    .filter((v) => v && /^[\d.]+/.test(v)) // Only include numeric versions
    .map((v) => v.match(/^[\d.]+/)[0]); // Extract just the numeric part
}

/**
 * Format version tags as YAML for frontmatter.
 * @param {string[]} tags - Array of version strings
 * @returns {string} - YAML tags block or empty string
 */
function formatTagsYaml(tags) {
  if (!tags || tags.length === 0) return '';
  return `tags:\n${tags.map((t) => `  - "${t}"`).join('\n')}\n`;
}

/**
 * Convert version to slug for since page links (e.g., "1.0" -> "1-0").
 */
function versionToSlug(version) {
  return String(version).replace(/\./g, '-');
}

function parseDeprecatedTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const match = v.match(/^([0-9][0-9A-Za-z.\-_]*)(?:\s+([\s\S]+))?$/);
  if (match) return { version: match[1] ?? '', description: (match[2] ?? '').trim() };
  return { version: '', description: v };
}

function parseVarTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;

  // Split into parts
  const parts = v.split(/\s+/);
  const type = parts[0] ?? '';

  // Skip variable name if present (e.g., $settings)
  let descStart = 1;
  if (parts[1]?.startsWith('$')) {
    descStart = 2;
  }

  let description = parts.slice(descStart).join(' ').trim();

  // Strip leading { if present (array shape docs - @type entries are parsed separately by parseDocblock)
  if (description === '{' || description.startsWith('{ ')) {
    description = '';
  }

  return { type, description };
}

/**
 * Format @type entries from tags into a readable description with proper list.
 * Input: ["string $slug - template slug", "string $css_source - url path"]
 * Output: "Array shape:<ul><li><code>$slug</code> (string): template slug</li>...</ul>"
 */
function formatTypeEntries(typeEntries) {
  if (!Array.isArray(typeEntries) || typeEntries.length === 0) return '';

  const formatted = typeEntries.map((entry) => {
    // Parse: "type $name - description" or "type $name description"
    const match = String(entry).match(/^(\S+)\s+(\$\w+)\s*(?:-\s*)?(.*)$/);
    if (!match) return null;
    const [, entryType, entryName, entryDesc] = match;
    return `<li><code>${escapeHtml(entryName)}</code> (${escapeHtml(entryType)})${entryDesc.trim() ? ': ' + escapeHtml(entryDesc.trim()) : ''}</li>`;
  }).filter(Boolean);

  if (formatted.length === 0) return '';
  return `Array shape:<ul>${formatted.join('')}</ul>`;
}

function splitTopLevelCommas(input) {
  const s = String(input ?? '');
  const out = [];
  let buf = '';
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote = null;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      buf += ch;
      escape = false;
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === '\\') {
        escape = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') paren++;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === '[') bracket++;
    if (ch === ']') bracket = Math.max(0, bracket - 1);
    if (ch === '{') brace++;
    if (ch === '}') brace = Math.max(0, brace - 1);

    if (ch === ',' && paren === 0 && bracket === 0 && brace === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function findMatchingParenIndex(text, openIndex) {
  const s = String(text ?? '');
  let depth = 1;
  let quote = null;
  let escape = false;

  for (let i = openIndex + 1; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function phpShortArraySyntax(text) {
  let s = String(text ?? '');
  while (true) {
    const start = s.search(/\barray\s*\(/i);
    if (start === -1) break;
    const open = s.indexOf('(', start);
    if (open === -1) break;
    const close = findMatchingParenIndex(s, open);
    if (close === -1) break;
    const inside = phpShortArraySyntax(s.slice(open + 1, close));
    s = `${s.slice(0, start)}[${inside}]${s.slice(close + 1)}`;
  }
  return s;
}

function extractSignatureParts(signature) {
  const sig = String(signature ?? '').trim();
  const firstParen = sig.indexOf('(');
  if (firstParen === -1) return { paramsRaw: '', returnType: '' };

  let depth = 0;
  let closeParen = -1;
  for (let i = firstParen; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }

  const paramsRaw = closeParen === -1 ? '' : sig.slice(firstParen + 1, closeParen);
  let returnType = '';
  if (closeParen !== -1) {
    const after = sig.slice(closeParen + 1).trim();
    const match = after.match(/^:\s*([\s\S]+)$/);
    if (match?.[1]) {
      returnType = match[1].trim();
    }
  }

  return { paramsRaw, returnType };
}

function parseSignatureParams(signature) {
  const { paramsRaw, returnType } = extractSignatureParts(signature);
  const parts = splitTopLevelCommas(paramsRaw);
  const params = [];

  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    // Skip comment-like segments (e.g., /** varargs */)
    if (/^\s*\/\*/.test(seg) || /\*\/\s*$/.test(seg)) continue;
    const nameMatch = seg.match(/(\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)/);
    // Skip segments without a valid parameter name
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const nameIndex = seg.indexOf(name);
    const before = seg.slice(0, nameIndex).trim();
    const after = seg.slice(nameIndex + name.length).trim();

    const byRef = /&\s*$/.test(before) || /&\s*\$/.test(seg);
    const variadic = before.includes('...') || seg.includes('...');
    const type = before.replace(/&/g, '').replace(/\.\.\./g, '').trim();

    let defaultValue = '';
    if (after.startsWith('=')) {
      defaultValue = phpShortArraySyntax(after.slice(1).trim());
    }

    params.push({
      name,
      type,
      default: defaultValue,
      byRef,
      variadic,
      raw: seg,
    });
  }

  return { params, returnType };
}

function mergeParams({ signature, doc }) {
  const sig = parseSignatureParams(signature);
  const docParams = (doc?.tags?.param ?? [])
    .map(parseParamTagValue)
    .filter(Boolean)
    .map((p) => ({ ...p, name: p.name || '' }));

  const byName = new Map();
  for (const p of docParams) {
    if (p.name) byName.set(p.name, p);
  }

  const merged = [];
  const seen = new Set();

  for (const sp of sig.params) {
    const dp = sp.name ? byName.get(sp.name) : null;
    merged.push({
      name: sp.name || dp?.name || '',
      type: (dp?.type || sp.type || '').trim(),
      default: sp.default || dp?.default || '',
      description: dp?.description || '',
      byRef: sp.byRef || Boolean(dp?.byRef),
      variadic: sp.variadic || Boolean(dp?.variadic),
    });
    if (sp.name) seen.add(sp.name);
  }

  for (const dp of docParams) {
    if (!dp.name) continue;
    if (seen.has(dp.name)) continue;
    merged.push({
      name: dp.name || '',
      type: (dp.type || '').trim(),
      default: dp.default || '',
      description: dp.description || '',
      byRef: Boolean(dp.byRef),
      variadic: Boolean(dp.variadic),
    });
  }

  return { params: merged, returnType: sig.returnType };
}

function renderTypeListInline(types, ctx) {
  const list = (types ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  return list.map((t) => codeInlineType(t, ctx)).join(', ');
}

function renderExamplesSection(tags, { heading = '##' } = {}) {
  const examples = tags?.example ?? [];
  if (!Array.isArray(examples) || examples.length === 0) return '';

  const blocks = examples
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .map((t) => {
      const looksLikePhp = /<\?php|\$[A-Za-z_]|->|::/.test(t);
      return looksLikePhp ? `\n\`\`\`php\n${t}\n\`\`\`\n` : `\n${t}\n`;
    })
    .join('\n');

  if (!blocks.trim()) return '';
  return `\n${heading} Examples\n${blocks}`;
}

function renderSeeAlsoSection(tags, typeLinkCtx, { heading = '##' } = {}) {
  // Note: @link is excluded because file header @link tags (e.g., @link http://www.gravitykit.com)
  // were incorrectly appearing in See Also sections.
  const items = []
    .concat(tags?.see ?? [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

  if (items.length === 0) return '';

  const list = items
    .map((v) => {
      if (/^https?:\/\//i.test(v)) return `- ${v}`;

      // Handle ClassName::methodName() with optional description
      // e.g., "GravityView_Merge_Tags::replace_variables() Moved in 1.8.4"
      const methodMatch = v.match(/^\\?([A-Za-z_][A-Za-z0-9_\\]*)::(\w+)\(\)\s*(.*)?$/);
      if (methodMatch) {
        const className = methodMatch[1];
        const methodName = methodMatch[2];
        const description = (methodMatch[3] || '').trim();
        const classUrl = resolveTypeUrl(className, typeLinkCtx);
        const methodRef = `\\${className}::${methodName}()`;
        if (classUrl) {
          const link = `[\`${methodRef}\`](${classUrl}#${methodName.toLowerCase()})`;
          return description ? `- ${link} ${description}` : `- ${link}`;
        }
        // No link available, but still format nicely
        return description ? `- \`${methodRef}\` ${description}` : `- \`${methodRef}\``;
      }

      // Handle standalone function references like "functionName()" or "gravityview_get_entry()"
      const funcMatch = v.match(/^\\?([a-z_][a-z0-9_]*)\(\)$/i);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const funcSlug = slugify(funcName);
        // Link to functions directory (relative path from classes/classname/ is ../../functions/)
        const funcUrl = `../../functions/${funcSlug}`;
        return `- [\`${funcName}()\`](${funcUrl})`;
      }

      const url = resolveTypeUrl(v, typeLinkCtx);
      if (url) return `- ${codeInlineType(v, typeLinkCtx)}`;
      return `- ${codeInline(v)}`;
    })
    .join('\n');

  return `\n${heading} See Also\n\n${list}\n`;
}

function renderParamsTable(params, typeLinkCtx) {
  const rows = (params ?? [])
    .filter((p) => p?.name || p?.type || p?.description || p?.default)
    .map((p) => {
      const displayName = `${p.byRef ? '&' : ''}${p.variadic ? '...' : ''}${p.name || ''}`;
      return `| ${codeTable(displayName)} | ${codeTableType(p.type || '', typeLinkCtx)} | ${codeTable(phpShortArraySyntax(p.default || ''))} | ${processInlineSeeRefs(mdEscape(cleanDescription(p.description)))} |`;
    })
    .join('\n');

  if (!rows) return '';
  return `| Name | Type | Default | Description |
| --- | --- | --- | --- |
${rows}
`;
}

/**
 * Render @since tags - single entry inline, multiple as bullet list.
 * Links version numbers to since tag pages.
 */
function renderSinceTags(since) {
  if (!since || since.length === 0) return '';

  const formatEntry = (v) => {
    // Render the version as plain text. Per-version "since" index pages are not
    // generated, so linking to ../../../since/<version>/ produced broken links.
    const ver = `\`${mdEscape(v.version)}\``;
    return v.description ? `${ver} (${mdEscape(v.description)})` : ver;
  };

  if (since.length === 1) {
    return `\n**Since:** ${formatEntry(since[0])}\n`;
  }

  const list = since.map((v) => `- ${formatEntry(v)}`).join('\n');
  return `\n**Since:**\n\n${list}\n`;
}

function formatSourceLabel(file, line) {
  if (!file) return '';
  return line ? `${file}:${line}` : file;
}

// --- PHP API JSON emitter (consumed by GravityKit/Docs-MCP via /api/php-api.json) ---
// Builds records matching the docs-mcp ApiSymbol contract from the already-parsed,
// already-public-filtered class/function objects. Reuses the same helpers the
// markdown pages use, so the JSON's public set and field derivation stay in lockstep.

function phpApiSince(symbol) {
  const first = (symbol?.tags?.since ?? []).map(parseSinceTagValue).filter(Boolean)[0];
  return first?.version || undefined;
}

function phpApiParams(symbol) {
  const merged = mergeParams({ signature: symbol.signature, doc: symbol });
  const params = merged.params
    .filter((p) => p.name)
    .map((p) => ({
      name: p.name,
      type: (p.type || '').trim() || undefined,
      description: (p.description || '').trim() || undefined,
    }));
  return params.length ? params : undefined;
}

function phpApiReturns(symbol) {
  const r = (symbol?.tags?.return ?? []).map(parseReturnTagValue).filter(Boolean)[0];
  if (!r) return undefined;
  const type = (r.type || '').trim();
  const description = (r.description || '').trim();
  if (!type && !description) return undefined;
  return { type: type || undefined, description: description || undefined };
}

function buildClassApiSymbol(c, productId) {
  const methods = (c.methods ?? []).map((m) => ({
    name: m.name,
    visibility: m.visibility || undefined,
    static: m.static ? true : undefined,
    signature: m.signature || undefined,
    summary: m.summary || undefined,
    description: m.description || undefined,
    params: phpApiParams(m),
    returns: phpApiReturns(m),
    since: phpApiSince(m),
    source: formatSourceLabel(m.file || c.file, m.line) || undefined,
  }));
  return {
    kind: 'class',
    name: c.name,
    fqcn: String(c.fqcn || '').replace(/^\\+/, '') || c.name,
    namespace: c.namespace || undefined,
    product: productId,
    summary: c.summary || undefined,
    description: c.description || undefined,
    since: phpApiSince(c),
    source: formatSourceLabel(c.file, c.line) || undefined,
    url: `/docs/${productId}/api/classes/${c.slug}/`,
    methods: methods.length ? methods : undefined,
  };
}

function buildFunctionApiSymbol(f, productId) {
  return {
    kind: 'function',
    name: f.name,
    fqcn: String(f.fqfn || '').replace(/^\\+/, '') || f.name,
    namespace: f.namespace || undefined,
    product: productId,
    signature: f.signature || undefined,
    summary: f.summary || undefined,
    description: f.description || undefined,
    since: phpApiSince(f),
    source: formatSourceLabel(f.file, f.line) || undefined,
    url: `/docs/${productId}/api/functions/${f.slug}/`,
    params: phpApiParams(f),
    returns: phpApiReturns(f),
  };
}

function resolveRepoRef(repoDir, fallbackRef) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' });
  if (!result.error && result.status === 0) {
    const sha = String(result.stdout || '').trim();
    if (sha) return sha;
  }
  return fallbackRef || 'develop';
}

function repoPathForSymbolFile({ product, file }) {
  const rel = String(file ?? '').replace(/^\/+/, '');
  if (!rel) return '';
  const srcDir = String(product?.srcDir ?? '').replace(/^\/+|\/+$/g, '');
  return srcDir ? `${srcDir}/${rel}` : rel;
}

function buildSourceUrl({ product, repoRef, file, line }) {
  if (!product?.repo || !repoRef || !file) return '';
  const repoPath = repoPathForSymbolFile({ product, file });
  if (!repoPath) return '';
  const anchor = line ? `#L${line}` : '';
  return `https://github.com/${product.repo}/blob/${repoRef}/${repoPath}${anchor}`;
}

function formatSourceMarkdown({ product, repoRef, file, line }) {
  const repoPath = repoPathForSymbolFile({ product, file });
  const label = formatSourceLabel(repoPath, line);
  if (!label) return '';
  // Don't link to GitHub (repos are private)
  return `\`${label}\``;
}

function mdEscape(text) {
  return (text ?? '')
    .replace(/</g, '&lt;')        // Escape HTML < to prevent tag interpretation
    .replace(/>/g, '&gt;')        // Escape HTML > to prevent tag interpretation
    .replace(/\|/g, '\\|')
    .replace(/  \r?\n/g, '<br>')  // Two trailing spaces + newline = <br>
    .replace(/\r?\n/g, ' ')       // Other newlines become spaces
    .replace(/  +/g, ' ')         // Collapse multiple spaces (but not <br>)
    .trim();
}

/**
 * Escape HTML entities in text to prevent markdown/HTML parsing issues.
 * Use this for summaries and short text that appear inline.
 */
function htmlEscape(text) {
  return String(text ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape HTML entities in description text, preserving PHPDoc <code> blocks.
 * Converts <code>...</code> to markdown fenced code blocks.
 * Use this for multi-line descriptions where code examples may appear.
 */
function htmlEscapeDescription(text) {
  return htmlEscape(text)
    // Convert <code> blocks to markdown fenced code blocks
    .replace(/&lt;code&gt;/gi, '\n```php\n')
    .replace(/&lt;\/code&gt;/gi, '\n```\n');
}

/**
 * Clean description text: strip leading em-dashes and similar prefixes.
 */
function cleanDescription(text) {
  return String(text ?? '')
    .replace(/^[\u2014\u2013—–-]+\s*/, '') // Strip leading em-dash, en-dash, hyphen
    .trim();
}

/**
 * Process {@see ...} patterns in text, converting them to markdown code references.
 * `{@see \GV\View::get_entries}` => `\GV\View::get_entries()`
 */
function processInlineSeeRefs(text) {
  return String(text ?? '')
    .replace(/\\?\{@see\s+([^}]+?)\\?\}/g, (match, ref) => {
      const cleaned = ref.trim();

      // Handle URL references - convert to markdown link
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        return `[${cleaned}](${cleaned})`;
      }

      // Handle class/method references
      const withoutParens = cleaned.replace(/\(\)$/, '');
      const hasMethod = withoutParens.includes('::');
      const display = withoutParens.startsWith('\\') ? withoutParens : `\\${withoutParens}`;
      return `\`${display}${hasMethod ? '()' : ''}\``;
    });
}

/**
 * Format function signature with WordPress-style spacing inside parentheses.
 * `func($arg)` => `func( $arg )`
 */
function wordpressFormatSignature(signature) {
  const sig = String(signature ?? '');
  // Find the parameter list between first ( and matching )
  const firstParen = sig.indexOf('(');
  if (firstParen === -1) return sig;

  let depth = 0;
  let closeParen = -1;
  for (let i = firstParen; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }

  if (closeParen === -1) return sig;

  const before = sig.slice(0, firstParen + 1);
  const params = sig.slice(firstParen + 1, closeParen);
  const after = sig.slice(closeParen);

  // If params are empty, don't add spaces
  if (!params.trim()) return sig;

  // Add spaces inside parentheses
  return `${before} ${params.trim()} ${after}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildLocalTypeSlugMap(classes) {
  const m = new Map();
  for (const c of classes ?? []) {
    const fqcn = String(c?.fqcn ?? '').replace(/^\\+/, '');
    const slug = String(c?.slug ?? '');
    if (!fqcn || !slug) continue;
    m.set(fqcn, slug);
  }
  return m;
}

function resolveTypeUrl(typeName, { localTypeSlugs, externalTypeLinks, classesLinkPrefix }) {
  const raw = String(typeName ?? '');
  const cleaned = raw.replace(/^\\+/, '');
  if (!cleaned) return null;

  const localSlug = localTypeSlugs?.get(cleaned);
  // Docusaurus doc routes don't include `.md` in links.
  if (localSlug) return `${classesLinkPrefix}${localSlug}`;

  const external = externalTypeLinks?.get(cleaned);
  if (external) return external;

  return null;
}

function linkifyTypeStringHtml(typeString, ctx, { escapePipes = false } = {}) {
  const s = String(typeString ?? '');
  if (!s) return '';

  // Split on | to handle union types, then process each type separately
  const unionParts = s.split(/\s*\|\s*/);

  const processedParts = unionParts.map((typePart) => {
    const trimmed = typePart.trim();
    if (!trimmed) return '';

    // Extract array suffix ([], [][], etc.) before processing the base type
    const arrayMatch = trimmed.match(/^(.+?)(\[\])+$/);
    const baseType = arrayMatch ? arrayMatch[1] : trimmed;
    const arraySuffix = arrayMatch ? trimmed.slice(arrayMatch[1].length) : '';

    // Check if this is a namespaced type that can be linked
    const nsRe = /^\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+$/;
    if (nsRe.test(baseType)) {
      const url = resolveTypeUrl(baseType, ctx);
      if (url) {
        // Include array suffix inside the link for cleaner appearance
        return `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(baseType)}${escapeHtml(arraySuffix)}</a>`;
      }
      return `<code>${escapeHtml(trimmed)}</code>`;
    }

    // Check if this is a known non-namespaced type (e.g., WP_Post)
    const classRe = /^[A-Z][A-Za-z0-9_]*$/;
    if (classRe.test(baseType)) {
      const url = resolveTypeUrl(baseType, ctx);
      if (url) {
        // Include array suffix inside the link for cleaner appearance
        return `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(baseType)}${escapeHtml(arraySuffix)}</a>`;
      }
      return `<code>${escapeHtml(trimmed)}</code>`;
    }

    // For primitives (null, string, int, bool, array, mixed, etc.) wrap in code
    return `<code>${escapeHtml(trimmed)}</code>`;
  }).filter(Boolean);

  // Join with spaced pipe separator
  const separator = escapePipes ? ' &#124; ' : ' | ';
  return processedParts.join(separator);
}

function codeInline(text) {
  const s = String(text ?? '');
  if (!s) return '``';
  return `\`${s.replace(/`/g, '\\`')}\``;
}

function codeInlineType(typeString, ctx) {
  const inner = linkifyTypeStringHtml(typeString, ctx);
  // linkifyTypeStringHtml now handles all code wrapping for each type part
  return inner || '';
}

function codeTable(text) {
  // Prevent table parsing issues and render pipes cleanly.
  const raw = String(text ?? '');
  if (raw.trim() === '') return '';
  const s = escapeHtml(raw).replace(/\|/g, '&#124;');
  return `<code>${s}</code>`;
}

function codeTableType(typeString, ctx) {
  // linkifyTypeStringHtml handles all code wrapping and pipe escaping
  return linkifyTypeStringHtml(typeString, ctx, { escapePipes: true });
}

function generateIndexMd({ productLabel, classCount, functionCount }) {
  const browseItems = ['- [Classes](./classes/)'];
  if (functionCount > 0) {
    browseItems.push('- [Functions](./functions/)');
  }

  const stats = [`- **Classes:** ${classCount}`];
  if (functionCount > 0) {
    stats.push(`- **Functions:** ${functionCount}`);
  }

  return `---
sidebar_position: 4
title: ${productLabel} API Reference
pagination_prev: null
pagination_next: null
---

# ${productLabel} API Reference

Generated from PHP source and PHPDoc comments.

${stats.join('\n')}

## Browse

${browseItems.join('\n')}
`;
}

function generateClassesIndexMd({ productLabel, classes }) {
  const items = classes
    .map((c) => `- [\`${c.fqcn}\`](./${c.slug})${c.summary ? ` — ${htmlEscape(c.summary)}` : ''}`)
    .join('\n');

  return `---
sidebar_position: 1
title: ${productLabel} Classes
---

# ${productLabel} Classes

${items || '_No documented classes found._'}
`;
}

function generateFunctionsIndexMd({ productLabel, functions }) {
  const items = functions
    .map((f) => `- [\`${f.fqfn}\`](./${f.slug})${f.summary ? ` — ${htmlEscape(f.summary)}` : ''}`)
    .join('\n');

  return `---
sidebar_position: 2
title: ${productLabel} Functions
---

# ${productLabel} Functions

${items || '_No documented functions found._'}
`;
}

function generateClassPage({ productLabel, classSymbol, product, repoRef, typeLinkCtx }) {
  const fqcn = classSymbol.fqcn;
  const shortName = classSymbol.name;
  const kind = classSymbol.kind;
  const source = formatSourceMarkdown({ product, repoRef, file: classSymbol.file, line: classSymbol.line });
  const extendsList = Array.isArray(classSymbol.extends) ? classSymbol.extends : [];
  const implementsList = Array.isArray(classSymbol.implements) ? classSymbol.implements : [];

  // Parse properties
  const properties = (classSymbol.properties ?? []).map((p) => {
    const doc = parseDocblock(p.docblock);
    const varTag = parseVarTagValue((doc.tags?.var ?? [])[0]);
    const propType = varTag?.type || p.type || '';

    // Build description: @var description, or @type entries, or summary
    let propDesc = cleanDescription(varTag?.description || doc.summary || '');
    const typeEntriesDesc = formatTypeEntries(doc.tags?.type);
    if (typeEntriesDesc) {
      propDesc = propDesc ? `${propDesc} ${typeEntriesDesc}` : typeEntriesDesc;
    }

    return {
      ...p,
      summary: propDesc,
      type: propType,
      tags: doc.tags,
      internal: doc.internal,
    };
  }).filter((p) => !p.internal && p.visibility !== 'private' && (p.type || p.summary));

  const propertyTableRows = properties.length
    ? properties
        .map((p) => {
          return `| \`$${p.name}\` | ${codeTableType(p.type, typeLinkCtx)} | ${mdEscape(processInlineSeeRefs(p.summary || ''))} |`;
        })
        .join('\n')
    : '';

  const methods = classSymbol.methods ?? [];
  const documentedMethods = methods.filter((m) => hasMeaningfulDoc(m));
  const methodTableRows = documentedMethods.length
    ? documentedMethods
        .map(
          (m) =>
            `| [\`${m.name}()\`](#${m.name.toLowerCase()}) | ${mdEscape(m.summary || '')} |`
        )
        .join('\n')
    : '';

  const methodSections = documentedMethods
    .map((m) => {
      const sourceLine = formatSourceMarkdown({ product, repoRef, file: m.file || classSymbol.file, line: m.line });
      const since = (m.tags?.since ?? []).map(parseSinceTagValue).filter(Boolean);
      const deprecated = (m.tags?.deprecated ?? []).map(parseDeprecatedTagValue).filter(Boolean);
      const throwsList = (m.tags?.throws ?? []).map(parseThrowsTagValue).filter(Boolean);
      const returnsList = (m.tags?.return ?? []).map(parseReturnTagValue).filter(Boolean);
      const { params, returnType } = mergeParams({ signature: m.signature, doc: m });
      const paramsTable = renderParamsTable(params, typeLinkCtx);
      const returnTag = returnsList[0] ?? null;
      const resolvedReturnType = (returnTag?.type || returnType || '').trim();
      const resolvedReturnDesc = cleanDescription(returnTag?.description || '');

      return `### \`${m.name}()\`

\`${wordpressFormatSignature(phpShortArraySyntax(m.signature || `function ${m.name}()`))}\`

${htmlEscape(m.summary || '')}
${m.description ? `\n${processInlineSeeRefs(htmlEscapeDescription(m.description))}\n` : ''}
${paramsTable ? `\n#### Parameters\n\n${paramsTable}\n` : ''}
${resolvedReturnType || resolvedReturnDesc ? `\n#### Returns\n\n- ${codeInlineType(resolvedReturnType, typeLinkCtx)}${resolvedReturnDesc ? ` — ${mdEscape(resolvedReturnDesc)}` : ''}\n` : ''}
${throwsList.length ? `\n#### Throws\n\n${throwsList.map((t) => `- ${codeInlineType(t.type, typeLinkCtx)}${t.description ? ` — ${mdEscape(cleanDescription(t.description))}` : ''}`).join('\n')}\n` : ''}
${renderExamplesSection(m.tags, { heading: '####' })}
${renderSeeAlsoSection(m.tags, typeLinkCtx, { heading: '####' })}
${renderSinceTags(since)}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => {
  const ver = d.version ? `\`${mdEscape(d.version)}\`` : '';
  const desc = d.description ? processInlineSeeRefs(htmlEscapeDescription(d.description)) : '';
  if (ver && desc) return `${ver} (${desc})`;
  if (ver) return ver;
  if (desc) return desc;
  return 'Yes';
}).join(', ')}\n` : ''}
${sourceLine ? `\n**Source:** ${sourceLine}\n` : ''}`;
    })
    .join('\n\n');

  const since = (classSymbol.tags?.since ?? []).map(parseSinceTagValue).filter(Boolean);
  const deprecated = (classSymbol.tags?.deprecated ?? []).map(parseDeprecatedTagValue).filter(Boolean);
  const versionTags = extractVersionTags(since);

  return `---
title: ${fqcn}
sidebar_label: ${shortName}
pagination_prev: null
pagination_next: null
${formatTagsYaml(versionTags)}---

# \`${fqcn}\`

${htmlEscape(classSymbol.summary || '')}
${classSymbol.description ? `\n${processInlineSeeRefs(htmlEscapeDescription(classSymbol.description))}\n` : ''}
${renderExamplesSection(classSymbol.tags, { heading: '##' })}
${renderSeeAlsoSection(classSymbol.tags, typeLinkCtx, { heading: '##' })}
${renderSinceTags(since)}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => {
  const ver = d.version ? `\`${mdEscape(d.version)}\`` : '';
  const desc = d.description ? processInlineSeeRefs(htmlEscapeDescription(d.description)) : '';
  if (ver && desc) return `${ver} (${desc})`;
  if (ver) return ver;
  if (desc) return desc;
  return 'Yes';
}).join(', ')}\n` : ''}
${source ? `\n**Source:** ${source}\n` : ''}

## Details

- **Kind:** \`${kind}\`
- **Namespace:** \`${classSymbol.namespace || '(global)'}\`
${extendsList.length ? `- **Extends:** ${renderTypeListInline(extendsList, typeLinkCtx)}` : ''}
${implementsList.length ? `- **Implements:** ${renderTypeListInline(implementsList, typeLinkCtx)}` : ''}
${properties.length ? `
## Properties

| Property | Type | Description |
| --- | --- | --- |
${propertyTableRows}
` : ''}
## Methods

${documentedMethods.length ? `| Method | Description |
| --- | --- |
${methodTableRows}
` : '_No documented public methods found._'}
${methodSections ? `\n## Method Reference\n\n${methodSections}\n` : ''}
`;
}

function generateFunctionPage({ functionSymbol, product, repoRef, typeLinkCtx }) {
  const fqfn = functionSymbol.fqfn;
  const shortName = functionSymbol.name;
  const source = formatSourceMarkdown({ product, repoRef, file: functionSymbol.file, line: functionSymbol.line });
  const since = (functionSymbol.tags?.since ?? []).map(parseSinceTagValue).filter(Boolean);
  const deprecated = (functionSymbol.tags?.deprecated ?? []).map(parseDeprecatedTagValue).filter(Boolean);
  const throwsList = (functionSymbol.tags?.throws ?? []).map(parseThrowsTagValue).filter(Boolean);
  const returnsList = (functionSymbol.tags?.return ?? []).map(parseReturnTagValue).filter(Boolean);
  const versionTags = extractVersionTags(since);

  const { params, returnType } = mergeParams({ signature: functionSymbol.signature, doc: functionSymbol });
  const paramsTable = renderParamsTable(params, typeLinkCtx);

  const returnTag = returnsList[0] ?? null;
  const resolvedReturnType = (returnTag?.type || returnType || '').trim();
  const resolvedReturnDesc = cleanDescription(returnTag?.description || '');

  const paramsSection = paramsTable ? `## Parameters\n\n${paramsTable}\n` : '';
  const returnsSection =
    resolvedReturnType || resolvedReturnDesc
      ? `## Returns\n\n- ${codeInlineType(resolvedReturnType, typeLinkCtx)}${resolvedReturnDesc ? ` — ${mdEscape(resolvedReturnDesc)}` : ''}\n`
      : '';
  const throwsSection = throwsList.length
    ? `## Throws\n\n${throwsList.map((t) => `- ${codeInlineType(t.type, typeLinkCtx)}${t.description ? ` — ${mdEscape(cleanDescription(t.description))}` : ''}`).join('\n')}\n`
    : '';

  return `---
title: ${fqfn}
sidebar_label: ${shortName}()
pagination_prev: null
pagination_next: null
${formatTagsYaml(versionTags)}---

# \`${fqfn}()\`

\`${wordpressFormatSignature(phpShortArraySyntax(functionSymbol.signature || `function ${shortName}()`))}\`

${htmlEscape(functionSymbol.summary || '')}
${functionSymbol.description ? `\n${processInlineSeeRefs(htmlEscapeDescription(functionSymbol.description))}\n` : ''}
${renderExamplesSection(functionSymbol.tags, { heading: '##' })}
${renderSeeAlsoSection(functionSymbol.tags, typeLinkCtx, { heading: '##' })}
${renderSinceTags(since)}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => {
  const ver = d.version ? `\`${mdEscape(d.version)}\`` : '';
  const desc = d.description ? processInlineSeeRefs(htmlEscapeDescription(d.description)) : '';
  if (ver && desc) return `${ver} (${desc})`;
  if (ver) return ver;
  if (desc) return desc;
  return 'Yes';
}).join(', ')}\n` : ''}
${source ? `\n**Source:** ${source}\n` : ''}

${paramsSection}${returnsSection}${throwsSection}`;
}

function ignoredDirNamesFromConfig(config) {
  const ignore = new Set([
    'vendor',
    'vendor_prefixed',
    'node_modules',
    'tests',
    'test',
    '.git',
    'build',
    'dist',
    'tmp',
    'temp',
  ]);

  const patterns = config?.defaults?.ignoreFiles ?? [];
  for (const pattern of patterns) {
    const match = typeof pattern === 'string' ? pattern.match(/^\*\*\/([^/]+)\/\*\*$/) : null;
    if (match?.[1]) ignore.add(match[1]);
  }

  return [...ignore];
}

function runExtractor({ inputDir, ignoreDirs }) {
  const extractorPath = path.join(PROJECT_ROOT, 'scripts', 'extract-php-api.php');
  const args = [extractorPath, '--root', inputDir, '--ignore', ignoreDirs.join(',')];

  const result = spawnSync('php', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 1024 * 1024 * 150,
  });

  if (result.error) {
    return { ok: false, reason: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, reason: (result.stderr || '').trim() || `Extractor exited with ${result.status}` };
  }

  try {
    return { ok: true, data: JSON.parse(result.stdout) };
  } catch (err) {
    return { ok: false, reason: `Failed to parse extractor output: ${err.message}` };
  }
}

function auditDocQuality({ product, repoRef, classes, functions }) {
  const report = {
    generatedAt: new Date().toISOString(),
    product: {
      id: product?.id ?? null,
      repo: product?.repo ?? null,
      ref: repoRef ?? null,
    },
    counts: {
      classes: Array.isArray(classes) ? classes.length : 0,
      functions: Array.isArray(functions) ? functions.length : 0,
      methods: 0,
      missingSummary: 0,
      missingParamTags: 0,
      missingParamDescriptions: 0,
      extraParamTags: 0,
      missingReturnTags: 0,
      missingReturnDescriptions: 0,
    },
    samples: {
      missingSummary: [],
      missingParamTags: [],
      missingParamDescriptions: [],
      extraParamTags: [],
      missingReturnTags: [],
      missingReturnDescriptions: [],
    },
  };

  const pushSample = (key, item) => {
    const list = report.samples[key];
    if (!Array.isArray(list)) return;
    if (list.length >= 50) return;
    list.push(item);
  };

  const auditOne = ({ kind, name, signature, tags, summary }) => {
    if (!String(summary ?? '').trim()) {
      report.counts.missingSummary++;
      pushSample('missingSummary', { kind, name });
    }

    const sig = parseSignatureParams(signature || '');
    const sigParams = sig.params ?? [];
    const sigParamNames = new Set(sigParams.map((p) => p?.name).filter(Boolean));

    const docParams = (tags?.param ?? [])
      .map(parseParamTagValue)
      .filter(Boolean)
      .map((p) => ({ ...p, name: String(p.name ?? '').trim() }));
    const docByName = new Map(docParams.filter((p) => p.name).map((p) => [p.name, p]));

    for (const sp of sigParams) {
      if (!sp?.name) continue;
      const dp = docByName.get(sp.name);
      if (!dp) {
        report.counts.missingParamTags++;
        pushSample('missingParamTags', { kind, name, param: sp.name });
        continue;
      }
      if (!String(dp.description ?? '').trim()) {
        report.counts.missingParamDescriptions++;
        pushSample('missingParamDescriptions', { kind, name, param: sp.name });
      }
    }

    for (const dp of docParams) {
      if (!dp?.name) continue;
      if (sigParamNames.has(dp.name)) continue;
      report.counts.extraParamTags++;
      pushSample('extraParamTags', { kind, name, param: dp.name });
    }

    const returnType = String(sig.returnType ?? '').trim();
    const returnTags = (tags?.return ?? []).map(parseReturnTagValue).filter(Boolean);
    if (returnType && returnTags.length === 0) {
      report.counts.missingReturnTags++;
      pushSample('missingReturnTags', { kind, name, returnType });
    }
    for (const rt of returnTags) {
      if (!String(rt.description ?? '').trim()) {
        report.counts.missingReturnDescriptions++;
        pushSample('missingReturnDescriptions', { kind, name, returnType: rt.type || '' });
      }
    }
  };

  for (const c of classes ?? []) {
    auditOne({
      kind: `${c.kind || 'class'}`,
      name: c.fqcn || c.name || '',
      signature: '',
      tags: c.tags,
      summary: c.summary,
    });

    const methods = c.methods ?? [];
    report.counts.methods += methods.length;
    for (const m of methods) {
      auditOne({
        kind: 'method',
        name: `${c.fqcn || c.name}::${m.name}()`,
        signature: m.signature || '',
        tags: m.tags,
        summary: m.summary,
      });
    }
  }

  for (const f of functions ?? []) {
    auditOne({
      kind: 'function',
      name: f.fqfn || f.name || '',
      signature: f.signature || '',
      tags: f.tags,
      summary: f.summary,
    });
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig();
  const configTypeLinks = loadTypeLinks();
  const products = Array.isArray(config.products) ? config.products : [];

  if (args.list) {
    for (const p of products) {
      if (p?.id) console.log(p.id);
    }
    process.exit(0);
  }

  if (!checkPhpAvailable()) {
    console.warn('⚠️  PHP not found; skipping API generation. Install PHP to enable class/function docs.');
    process.exit(0);
  }

  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir || './repos');
  const outputBaseDir = path.resolve(PROJECT_ROOT, config.outputDir || './docs');

  // Build cross-product type links from existing API docs
  const crossProductLinks = buildCrossProductTypeLinks(outputBaseDir);

  // Merge: config type links take precedence over cross-product links
  const externalTypeLinks = new Map([...crossProductLinks, ...configTypeLinks]);
  const ignoreDirs = ignoredDirNamesFromConfig(config);

  const selected = args.product
    ? products.filter((p) => p?.id === args.product)
    : products;

  if (args.product && selected.length === 0) {
    console.error(`❌ Unknown product id: ${args.product}`);
    process.exit(1);
  }

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const allPhpApiSymbols = [];

  for (const product of selected) {
    if (!product?.id || !product?.repo) continue;
    const repoName = String(product.repo).split('/')[1];
    const repoDir = path.join(reposDir, repoName);
    const inputDir = product.srcDir ? path.join(repoDir, product.srcDir) : repoDir;
    const repoRef = resolveRepoRef(repoDir, product.branch || config?.defaults?.branch || 'develop');

    if (!fs.existsSync(inputDir)) {
      console.warn(
        `⚠️  Skipping ${product.id}: repo not cloned (${inputDir}). Run: npm run repos:clone -- --product ${product.id}`
      );
      skipCount++;
      continue;
    }

    const productLabel = product.label || product.id;
    const outputDir = path.join(outputBaseDir, product.id, 'api');

    console.log(`▶ Generating API docs: ${product.id} (${productLabel})`);

    const referencedSymbols = collectReferencedSymbolsFromHooksDocs({ outputBaseDir, productId: product.id });
    const hasReferenceFilter = referencedSymbols.classes.size > 0 || referencedSymbols.methods.size > 0;
    if (hasReferenceFilter) {
      const totalRefs = referencedSymbols.classes.size + referencedSymbols.methods.size + referencedSymbols.functions.size;
      console.log(`ℹ️  ${product.id}: limiting API to ${totalRefs} symbols referenced in @see docblocks`);
    }

    const extracted = runExtractor({ inputDir, ignoreDirs });
    if (!extracted.ok) {
      console.error(`❌ ${product.id}: ${extracted.reason}`);
      failCount++;
      continue;
    }

    const allClasses = Array.isArray(extracted.data?.classes) ? extracted.data.classes : [];
    const allFunctions = Array.isArray(extracted.data?.functions) ? extracted.data.functions : [];

    // Build class map for @inheritDoc resolution
    const classMap = buildClassMap(allClasses);

    // Expand references to include classes referenced in property types of already-referenced classes
    if (hasReferenceFilter) {
      const beforeCount = referencedSymbols.classes.size;
      expandReferencesFromPropertyTypes(allClasses, referencedSymbols);
      const addedFromProps = referencedSymbols.classes.size - beforeCount;
      if (addedFromProps > 0) {
        console.log(`ℹ️  ${product.id}: added ${addedFromProps} classes from property types`);
      }

      // Iteratively expand @see references until no new symbols are found
      // This ensures transitively referenced classes are included
      let totalAddedSeeClasses = 0;
      let totalAddedSeeFuncs = 0;
      let iterations = 0;
      const maxIterations = 10; // Prevent infinite loops
      while (iterations < maxIterations) {
        const beforeSeeClassCount = referencedSymbols.classes.size;
        const beforeSeeFuncCount = referencedSymbols.functions.size;
        expandReferencesFromClassDocSee(allClasses, referencedSymbols);
        const addedSeeClasses = referencedSymbols.classes.size - beforeSeeClassCount;
        const addedSeeFuncs = referencedSymbols.functions.size - beforeSeeFuncCount;
        totalAddedSeeClasses += addedSeeClasses;
        totalAddedSeeFuncs += addedSeeFuncs;
        iterations++;
        // Stop when no new symbols are added
        if (addedSeeClasses === 0 && addedSeeFuncs === 0) break;
      }
      if (totalAddedSeeClasses > 0 || totalAddedSeeFuncs > 0) {
        const parts = [];
        if (totalAddedSeeClasses > 0) parts.push(`${totalAddedSeeClasses} classes`);
        if (totalAddedSeeFuncs > 0) parts.push(`${totalAddedSeeFuncs} functions`);
        const iterNote = iterations > 1 ? ` (${iterations} iterations)` : '';
        console.log(`ℹ️  ${product.id}: added ${parts.join(' and ')} from @see tags in class docs${iterNote}`);
      }
    }

    const classes = allClasses
      .map((c) => {
        const doc = parseDocblock(c.docblock);
        const methods = Array.isArray(c.methods)
          ? c.methods
              .filter((m) => m?.visibility === 'public')
              .map((m) => {
                const md = parseDocblock(m.docblock);
                // Resolve @inheritDoc by looking up parent class documentation
                const resolvedDoc = resolveInheritDoc(m, md, c, classMap);
                return {
                  ...m,
                  summary: resolvedDoc.summary,
                  description: resolvedDoc.description,
                  tags: resolvedDoc.tags,
                  internal: resolvedDoc.internal,
                };
              })
              .filter((m) => !m.internal)
          : [];

        const fqcn = String(c.fqcn || '').replace(/^\\+/, '');

        // Check if class itself or any of its methods are referenced in @see
        const classReferenced = referencedSymbols.classes.has(fqcn);
        const referencedMethods = referencedSymbols.methods.get(fqcn) || new Set();
        const hasReferencedMethods = referencedMethods.size > 0;
        const isReferenced = classReferenced || hasReferencedMethods;

        // Include if: explicitly marked @api/@public, referenced in @see, or has meaningful docs (when no filter)
        const markedPublic = isMarkedPublicApi(doc) || methods.some((m) => isMarkedPublicApi(m));
        const publicApi = markedPublic || (hasReferenceFilter
          ? isReferenced
          : (hasMeaningfulDoc(doc) || methods.some((m) => hasMeaningfulDoc(m))));

        return {
          ...c,
          slug: slugify(c.fqcn),
          referenced: isReferenced,
          referencedMethods,
          summary: doc.summary,
          description: doc.description,
          tags: doc.tags,
          internal: doc.internal,
          methods,
          publicApi,
        };
      })
      .filter((c) => !c.internal && c.publicApi)
      .sort((a, b) => a.fqcn.localeCompare(b.fqcn));

    const localTypeSlugs = buildLocalTypeSlugMap(classes);
    // Use '../' prefix because Docusaurus URLs end with trailing slash,
    // so from /classes/gv-view/ we need ../gv-field to reach /classes/gv-field/
    const classTypeLinkCtx = { localTypeSlugs, externalTypeLinks, classesLinkPrefix: '../' };
    // From /functions/gravityview_get_entry/ we need ../../classes/gv-view to reach /classes/gv-view/
    const functionTypeLinkCtx = { localTypeSlugs, externalTypeLinks, classesLinkPrefix: '../../classes/' };

    // Filter functions - only include if referenced in @see or has meaningful docs (when no filter)
    const functions = allFunctions
      .map((f) => {
        const doc = parseDocblock(f.docblock);
        const fqfn = String(f.fqfn || '').replace(/^\\+/, '');
        const funcName = String(f.name || '');

        // Check if function is referenced in @see
        const isReferenced = referencedSymbols.functions.has(fqfn) || referencedSymbols.functions.has(funcName);

        // Include if: explicitly marked @api/@public, referenced in @see, or has meaningful docs (when no filter)
        const markedPublic = isMarkedPublicApi(doc);
        const publicApi = markedPublic || (hasReferenceFilter
          ? isReferenced
          : (hasMeaningfulDoc(doc) && !funcName.startsWith('_')));

        return {
          ...f,
          slug: slugify(f.fqfn),
          summary: doc.summary,
          description: doc.description,
          tags: doc.tags,
          internal: doc.internal,
          referenced: isReferenced,
          publicApi,
        };
      })
      .filter((f) => !f.internal && f.publicApi)
      .sort((a, b) => a.fqfn.localeCompare(b.fqfn));

    // Accumulate this product's public symbols for the consolidated php-api.json.
    // Done before the zero-skip below so products with symbols always contribute.
    for (const c of classes) allPhpApiSymbols.push(buildClassApiSymbol(c, product.id));
    for (const f of functions) allPhpApiSymbols.push(buildFunctionApiSymbol(f, product.id));

    rmDir(outputDir, args.dryRun);
    ensureDir(outputDir, args.dryRun);

    // Skip API generation entirely if no classes or functions
    if (classes.length === 0 && functions.length === 0) {
      console.log(`✅ ${product.id}: 0 classes, 0 functions (skipping API generation)`);
      okCount++;
      continue;
    }

    writeFile(
      path.join(outputDir, '_category_.json'),
      JSON.stringify({ label: 'API Reference', position: 4 }, null, 2) + '\n',
      args.dryRun
    );

    writeFile(
      path.join(outputDir, 'index.md'),
      generateIndexMd({ productLabel, classCount: classes.length, functionCount: functions.length }),
      args.dryRun
    );

    const report = auditDocQuality({ product, repoRef, classes, functions });
    writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', args.dryRun);
    const issues =
      report.counts.missingSummary +
      report.counts.missingParamTags +
      report.counts.missingParamDescriptions +
      report.counts.extraParamTags +
      report.counts.missingReturnTags +
      report.counts.missingReturnDescriptions;
    if (issues > 0) {
      console.warn(
        `⚠️  ${product.id}: ${issues} doc issues (missing summary: ${report.counts.missingSummary}, missing @param: ${report.counts.missingParamTags}, missing param desc: ${report.counts.missingParamDescriptions}, missing @return: ${report.counts.missingReturnTags})`
      );
    }

    // Only create classes directory if there are classes
    if (classes.length > 0) {
      const classesDir = path.join(outputDir, 'classes');
      ensureDir(classesDir, args.dryRun);

      writeFile(
        path.join(classesDir, '_category_.json'),
        JSON.stringify({ label: 'Classes', position: 1 }, null, 2) + '\n',
        args.dryRun
      );

      writeFile(
        path.join(classesDir, 'index.md'),
        generateClassesIndexMd({
          productLabel,
          classes: classes.map((c) => ({ fqcn: c.fqcn, slug: c.slug, summary: c.summary })),
        }),
        args.dryRun
      );

      for (const c of classes) {
        writeFile(
          path.join(classesDir, `${c.slug}.md`),
          generateClassPage({ productLabel, classSymbol: c, product, repoRef, typeLinkCtx: classTypeLinkCtx }),
          args.dryRun
        );
      }
    }

    // Only create functions directory if there are functions
    if (functions.length > 0) {
      const functionsDir = path.join(outputDir, 'functions');
      ensureDir(functionsDir, args.dryRun);

      writeFile(
        path.join(functionsDir, '_category_.json'),
        JSON.stringify({ label: 'Functions', position: 2 }, null, 2) + '\n',
        args.dryRun
      );

      writeFile(
        path.join(functionsDir, 'index.md'),
        generateFunctionsIndexMd({
          productLabel,
          functions: functions.map((f) => ({ fqfn: f.fqfn, slug: f.slug, summary: f.summary })),
        }),
        args.dryRun
      );

      for (const f of functions) {
        writeFile(
          path.join(functionsDir, `${f.slug}.md`),
          generateFunctionPage({ functionSymbol: f, product, repoRef, typeLinkCtx: functionTypeLinkCtx }),
          args.dryRun
        );
      }
    }

    console.log(`✅ ${product.id}: ${classes.length} classes, ${functions.length} functions`);
    okCount++;
  }

  // Write the consolidated PHP API JSON (full runs only — a single --product run
  // must not overwrite the all-products file). Lives at static/api/php-api.json,
  // served at https://www.gravitykit.dev/api/php-api.json for the docs MCP.
  if (!args.product) {
    const apiJsonDir = path.join(PROJECT_ROOT, 'static', 'api');
    ensureDir(apiJsonDir, args.dryRun);
    allPhpApiSymbols.sort((a, b) => (a.fqcn || a.name).localeCompare(b.fqcn || b.name));
    writeFile(
      path.join(apiJsonDir, 'php-api.json'),
      JSON.stringify({ generated: new Date().toISOString(), symbols: allPhpApiSymbols }, null, 2) + '\n',
      args.dryRun
    );
    console.log(`📦 Wrote static/api/php-api.json (${allPhpApiSymbols.length} symbols)`);
  }

  console.log(`\nDone. OK: ${okCount}, skipped: ${skipCount}, failed: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main();

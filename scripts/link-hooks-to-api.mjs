#!/usr/bin/env node

/**
 * Link internal hook parameter types (eg \GV\View) to local API class docs.
 *
 * This runs as a post-processing step after API docs are generated, because it
 * relies on `docs/<product>/api/classes/*` existing.
 *
 * Usage:
 *   node scripts/link-hooks-to-api.mjs
 *   node scripts/link-hooks-to-api.mjs --product gravityview
 *   node scripts/link-hooks-to-api.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { product: null, dryRun: false, list: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--product') {
      args.product = argv[i + 1] ?? null;
      i++;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--list') {
      args.list = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log(`Usage:
  node scripts/link-hooks-to-api.mjs
  node scripts/link-hooks-to-api.mjs --product <id>
  node scripts/link-hooks-to-api.mjs --dry-run
  node scripts/link-hooks-to-api.mjs --list`);
      process.exit(0);
    }
  }
  return args;
}

function slugify(name) {
  return String(name ?? '')
    .replace(/^\\+/, '')
    .replace(/[\\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
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

function listProducts(docsDir) {
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function splitUnionPreserve(typeText) {
  const s = String(typeText ?? '');
  const tokens = [];
  const seps = [];
  let i = 0;

  while (i < s.length) {
    const idxEsc = s.indexOf('\\|', i);
    const idxRaw = s.indexOf('|', i);
    const idx = idxEsc === -1 ? idxRaw : idxRaw === -1 ? idxEsc : Math.min(idxEsc, idxRaw);
    if (idx === -1) break;
    tokens.push(s.slice(i, idx));
    seps.push(s.startsWith('\\|', idx) ? '\\|' : '|');
    i = idx + (s.startsWith('\\|', idx) ? 2 : 1);
  }

  tokens.push(s.slice(i));
  return { tokens, seps };
}

function looksLikeClassName(token) {
  const t = String(token ?? '').trim();
  if (!t) return false;
  if (t.includes('::') || t.includes('(')) return false;
  const cleaned = t.replace(/^\?/, '').replace(/^\\+/, '').replace(/\[\]$/g, '').trim();
  if (!cleaned.includes('\\')) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+$/.test(cleaned);
}

/**
 * Collect available methods for each class from API class docs.
 * Returns Map<classSlug, Set<methodName>>
 */
function collectMethodsByClass(classesDir) {
  const methodsByClass = new Map();
  if (!fs.existsSync(classesDir)) return methodsByClass;

  const files = fs.readdirSync(classesDir).filter((f) => f.endsWith('.md') && f !== 'index.md');

  for (const file of files) {
    const slug = file.replace(/\.md$/i, '');
    const content = fs.readFileSync(path.join(classesDir, file), 'utf8');

    // Extract method names from ### `methodName()` headers
    const methods = new Set();
    const methodPattern = /^###\s+`(\w+)\(\)`/gm;
    for (const m of content.matchAll(methodPattern)) {
      methods.add(m[1]);
    }

    methodsByClass.set(slug, methods);
  }

  return methodsByClass;
}

/**
 * Resolve a symbol reference (Class::method or Class) to a markdown link.
 * Returns the linked markdown or null if not resolvable.
 * Supports cross-product linking via globalClassMap.
 */
function resolveSymbolLink(ref, ctx) {
  const { classesDir, classSlugs, methodsByClass, fromDir, globalClassMap, docsDir } = ctx;

  // Clean the reference: remove trailing (), leading backslashes
  const cleaned = ref.replace(/\(\)$/, '').trim();

  // Check for Class::method pattern
  const methodMatch = cleaned.match(/^\\?(.+)::(\w+)$/);
  if (methodMatch) {
    const className = methodMatch[1].replace(/^\\+/, '');
    const methodName = methodMatch[2];
    const slug = slugify(className);

    if (classSlugs.has(slug)) {
      const classMethods = methodsByClass.get(slug) || new Set();

      // Get the actual classesDir for this class (may be from another product)
      const classInfo = globalClassMap?.get(slug);
      const targetClassesDir = classInfo?.classesDir || classesDir;
      const targetPath = path.join(targetClassesDir, `${slug}.md`);

      let rel = path.relative(fromDir, targetPath).split(path.sep).join('/');
      // Docusaurus URLs have trailing slash, so each page is treated as a directory.
      // Add extra ../ to account for the source file's "virtual directory"
      rel = '../' + rel;
      const url = rel.replace(/\.md$/i, '');

      // Add method anchor if method exists
      const anchor = classMethods.has(methodName) ? `#${methodName.toLowerCase()}` : '';
      const display = cleaned.startsWith('\\') ? cleaned : `\\${cleaned}`;
      return `[\`${display}()\`](${url}${anchor})`;
    }
  }

  // Handle class-only reference (with namespace)
  const classOnly = cleaned.replace(/^\\+/, '');
  if (classOnly.includes('\\')) {
    const slug = slugify(classOnly);
    if (classSlugs.has(slug)) {
      // Get the actual classesDir for this class (may be from another product)
      const classInfo = globalClassMap?.get(slug);
      const targetClassesDir = classInfo?.classesDir || classesDir;
      const targetPath = path.join(targetClassesDir, `${slug}.md`);

      let rel = path.relative(fromDir, targetPath).split(path.sep).join('/');
      // Docusaurus URLs have trailing slash, so each page is treated as a directory.
      // Add extra ../ to account for the source file's "virtual directory"
      rel = '../' + rel;
      const url = rel.replace(/\.md$/i, '');
      const display = cleaned.startsWith('\\') ? cleaned : `\\${cleaned}`;
      return `[\`${display}\`](${url})`;
    }
  }

  return null;
}

function renderTypeSpan(inner, { classesDir, classSlugs, fromDir, globalClassMap }) {
  const raw = String(inner ?? '').trim();
  if (!raw.includes('\\')) return null;

  const { tokens, seps } = splitUnionPreserve(raw);
  const rendered = [];
  let linkedAny = false;

  for (let idx = 0; idx < tokens.length; idx++) {
    const tokRaw = tokens[idx];
    const tok = String(tokRaw ?? '').trim();

    let base = tok.replace(/^\?/, '').trim();
    let arraySuffix = '';
    if (base.endsWith('[]')) {
      base = base.slice(0, -2);
      arraySuffix = '[]';
    }

    const hasClass = looksLikeClassName(base);
    const cleaned = base.replace(/^\\+/, '');
    const slug = hasClass ? slugify(cleaned) : '';

    if (hasClass && slug && classSlugs.has(slug)) {
      // Get the actual classesDir for this class (may be from another product)
      const classInfo = globalClassMap?.get(slug);
      const targetClassesDir = classInfo?.classesDir || classesDir;
      const targetPath = path.join(targetClassesDir, `${slug}.md`);

      let rel = path.relative(fromDir, targetPath).split(path.sep).join('/');
      // Docusaurus URLs have trailing slash, so each page is treated as a directory.
      // Add extra ../ to account for the source file's "virtual directory"
      rel = '../' + rel;
      const url = rel.replace(/\.md$/i, '');
      const display = tok.startsWith('\\') ? tok : `\\${tok}`;
      rendered.push(`<a href="${escapeHtmlAttribute(url)}">${escapeHtml(display.replace(/\[\]$/g, ''))}</a>${escapeHtml(arraySuffix)}`);
      linkedAny = true;
    } else {
      rendered.push(escapeHtml(tokRaw));
    }

    if (idx < seps.length) {
      rendered.push('&#124;');
    }
  }

  if (!linkedAny) return null;
  // Don't wrap in <code> since it contains links - MDX would convert to <pre>
  return rendered.join('');
}

function linkHookFile({ filePath, classesDir, classSlugs, methodsByClass, globalClassMap, docsDir, dryRun }) {
  const original = fs.readFileSync(filePath, 'utf8');
  const fromDir = path.dirname(filePath);
  const ctx = { classesDir, classSlugs, methodsByClass, fromDir, globalClassMap, docsDir };

  let updated = original;

  // 1. Handle {@see ...} inline patterns (escaped or not)
  // Matches: \{@see \GV\View::as_data()\} or {@see \get_bloginfo()}
  // Note: Both braces may be escaped with backslashes, use lazy match
  updated = updated.replace(/\\?\{@see\s+(.*?)\\?\}/g, (match, ref) => {
    const linked = resolveSymbolLink(ref.trim(), ctx);
    if (linked) {
      // Replace with just the link (removing the @see wrapper)
      return linked;
    }
    return match;
  });

  // 2. Handle See Also section backtick entries with :: method references
  // Matches: - `ClassName::methodName` or - `\Namespace\Class::method`
  updated = updated.replace(/^(-\s+)`([^`]+::[^`]+)`$/gm, (match, prefix, ref) => {
    const linked = resolveSymbolLink(ref.trim(), ctx);
    if (linked) {
      return `${prefix}${linked}`;
    }
    return match;
  });

  // 3. Handle See Also section backtick entries for classes (without ::)
  // Matches: - `\Namespace\ClassName` in See Also sections
  updated = updated.replace(/^(-\s+)`(\\[^`]+)`$/gm, (match, prefix, ref) => {
    // Skip if it contains ::
    if (ref.includes('::')) return match;
    const linked = resolveSymbolLink(ref.trim(), ctx);
    if (linked) {
      return `${prefix}${linked}`;
    }
    return match;
  });

  // 4. Handle inline backtick type references (existing logic)
  updated = updated.replace(/\`([^\`]+)\`/g, (match, inner, offset) => {
    const before = updated[offset - 1] ?? '';
    const after = updated.slice(offset + match.length, offset + match.length + 2);
    if (before === '[' && after === '](') return match; // already linked

    const html = renderTypeSpan(inner, { classesDir, classSlugs, fromDir, globalClassMap });
    return html ?? match;
  });

  if (updated === original) return { changed: false };
  if (!dryRun) fs.writeFileSync(filePath, updated, 'utf8');
  return { changed: true };
}

function main() {
  const args = parseArgs(process.argv);
  const docsDir = path.join(PROJECT_ROOT, 'docs');
  const products = listProducts(docsDir);

  if (args.list) {
    for (const p of products) console.log(p);
    process.exit(0);
  }

  const selected = args.product ? products.filter((p) => p === args.product) : products;
  if (args.product && selected.length === 0) {
    console.error(`Unknown product id: ${args.product}`);
    process.exit(1);
  }

  // Build global map of all classes across all products for cross-product linking
  // Map: slug -> { productId, classesDir }
  const globalClassMap = new Map();
  const globalMethodsByClass = new Map();
  for (const productId of products) {
    const classesDir = path.join(docsDir, productId, 'api', 'classes');
    if (!fs.existsSync(classesDir)) continue;

    const files = fs.readdirSync(classesDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
    for (const file of files) {
      const slug = file.replace(/\.md$/i, '');
      // First product to define a class wins (usually gravityview core)
      if (!globalClassMap.has(slug)) {
        globalClassMap.set(slug, { productId, classesDir });
      }
    }

    // Collect methods for this product's classes
    const methods = collectMethodsByClass(classesDir);
    for (const [slug, methodSet] of methods) {
      if (!globalMethodsByClass.has(slug)) {
        globalMethodsByClass.set(slug, methodSet);
      }
    }
  }

  let changedFiles = 0;

  for (const productId of selected) {
    const productDir = path.join(docsDir, productId);
    const classesDir = path.join(productDir, 'api', 'classes');

    // Use global class map for cross-product linking
    const classSlugs = new Set(globalClassMap.keys());
    const methodsByClass = globalMethodsByClass;

    // Create a context that knows about cross-product classes
    const crossProductClassesDir = (slug) => {
      const info = globalClassMap.get(slug);
      return info ? info.classesDir : classesDir;
    };

    const hookFiles = [
      ...collectMarkdownFiles(path.join(productDir, 'actions')),
      ...collectMarkdownFiles(path.join(productDir, 'filters')),
      ...collectMarkdownFiles(path.join(productDir, 'api', 'functions')),
    ];

    let productChanged = 0;
    for (const filePath of hookFiles) {
      const res = linkHookFile({
        filePath,
        classesDir,
        classSlugs,
        methodsByClass,
        globalClassMap,
        docsDir,
        dryRun: args.dryRun,
      });
      if (res.changed) {
        productChanged++;
        changedFiles++;
      }
    }

    if (productChanged > 0) {
      console.log(`${args.dryRun ? '[DRY RUN] ' : ''}${productId}: updated ${productChanged} hook files`);
    }
  }

  console.log(`${args.dryRun ? '[DRY RUN] ' : ''}Done. Updated files: ${changedFiles}`);
}

main();


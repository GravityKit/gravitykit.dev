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

function extractReferencedTypesFromText(markdown) {
  const text = String(markdown ?? '');
  const found = new Set();

  // Types sometimes appear as [`\WP_Post`](...) links; capture the code-span text.
  for (const m of text.matchAll(/\[\`([^\`]+)\`\]\([^)]+\)/g)) {
    const inner = (m[1] ?? '').trim();
    if (inner) found.add(inner);
  }

  // Also capture any inline code spans.
  for (const m of text.matchAll(/\`([^\`]+)\`/g)) {
    const inner = (m[1] ?? '').trim();
    if (inner) found.add(inner);
  }

  // Also capture namespaced types in raw text / HTML (eg <a> \GV\View </a>).
  for (const m of text.matchAll(/\\[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+/g)) {
    const inner = (m[0] ?? '').trim();
    if (inner) found.add(inner);
  }

  const types = new Set();
  for (const raw of found) {
    const cleaned = String(raw)
      .replace(/\\\|/g, '|') // unescape markdown table pipe
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
      if (
        /^\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+$/.test(`\\${p}`) ||
        /^[A-Z][A-Za-z0-9_]*$/.test(p)
      ) {
        types.add(p);
      }
    }
  }

  return types;
}

function collectReferencedTypesFromHooksDocs({ outputBaseDir, productId }) {
  const base = path.join(outputBaseDir, productId);
  const actionsDir = path.join(base, 'actions');
  const filtersDir = path.join(base, 'filters');
  const files = [...collectMarkdownFiles(actionsDir), ...collectMarkdownFiles(filtersDir)];
  const types = new Set();
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const t of extractReferencedTypesFromText(content)) {
      types.add(t);
    }
  }
  return types;
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

function parseDeprecatedTagValue(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const match = v.match(/^([0-9][0-9A-Za-z.\-_]*)(?:\s+([\s\S]+))?$/);
  if (match) return { version: match[1] ?? '', description: (match[2] ?? '').trim() };
  return { version: '', description: v };
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
    const nameMatch = seg.match(/(\$[A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)/);
    const name = nameMatch?.[1] ?? '';
    const nameIndex = nameMatch ? seg.indexOf(nameMatch[1]) : -1;
    const before = nameIndex >= 0 ? seg.slice(0, nameIndex).trim() : seg;
    const after = nameIndex >= 0 ? seg.slice(nameIndex + name.length).trim() : '';

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
  const items = []
    .concat(tags?.see ?? [])
    .concat(tags?.link ?? [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

  if (items.length === 0) return '';

  const list = items
    .map((v) => {
      if (/^https?:\/\//i.test(v)) return `- ${v}`;
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
      return `| ${codeTable(displayName)} | ${codeTableType(p.type || '', typeLinkCtx)} | ${codeTable(phpShortArraySyntax(p.default || ''))} | ${mdEscape(p.description || '')} |`;
    })
    .join('\n');

  if (!rows) return '';
  return `| Name | Type | Default | Description |
| --- | --- | --- | --- |
${rows}
`;
}

function formatSourceLabel(file, line) {
  if (!file) return '';
  return line ? `${file}:${line}` : file;
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
  const url = buildSourceUrl({ product, repoRef, file, line });
  return url ? `[\`${label}\`](${url})` : `\`${label}\``;
}

function mdEscape(text) {
  return (text ?? '').replace(/\|/g, '\\|');
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

  const parts = [];

  // Link namespaced types first.
  const nsRe = /\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+/g;
  let last = 0;
  for (const match of s.matchAll(nsRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    parts.push(s.slice(last, start));
    const t = match[0];
    const url = resolveTypeUrl(t, ctx);
    if (url) {
      parts.push({ type: 'link', text: t, url });
    } else {
      parts.push(t);
    }
    last = end;
  }
  parts.push(s.slice(last));

  const out = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      // Link known non-namespaced types (e.g., WP_Post) if explicitly mapped.
      const re = /\b[A-Z][A-Za-z0-9_]*\b/g;
      let idx = 0;
      for (const m of part.matchAll(re)) {
        const st = m.index ?? 0;
        const en = st + m[0].length;
        const token = m[0];
        out.push(part.slice(idx, st));
        const url = resolveTypeUrl(token, ctx);
        if (url) {
          out.push({ type: 'link', text: token, url });
        } else {
          out.push(token);
        }
        idx = en;
      }
      out.push(part.slice(idx));
      continue;
    }
    out.push(part);
  }

  const escapeChunk = (v) => {
    const escaped = escapeHtml(v);
    return escapePipes ? escaped.replace(/\|/g, '&#124;') : escaped;
  };

  return out
    .map((p) => {
      if (typeof p === 'string') return escapeChunk(p);
      return `<a href="${escapeHtmlAttribute(p.url)}">${escapeChunk(p.text)}</a>`;
    })
    .join('');
}

function codeInline(text) {
  const s = String(text ?? '');
  if (!s) return '``';
  return `\`${s.replace(/`/g, '\\`')}\``;
}

function codeInlineType(typeString, ctx) {
  const inner = linkifyTypeStringHtml(typeString, ctx);
  if (!inner) return '<code></code>';
  return `<code>${inner}</code>`;
}

function codeTable(text) {
  // Prevent table parsing issues and render pipes cleanly.
  const raw = String(text ?? '');
  if (raw.trim() === '') return '';
  const s = escapeHtml(raw).replace(/\|/g, '&#124;');
  return `<code>${s}</code>`;
}

function codeTableType(typeString, ctx) {
  const inner = linkifyTypeStringHtml(typeString, ctx, { escapePipes: true });
  if (!inner.trim()) return '';
  return `<code>${inner}</code>`;
}

function generateIndexMd({ productLabel, classCount, functionCount }) {
  return `---
sidebar_position: 4
title: ${productLabel} API Reference
---

# ${productLabel} API Reference

Generated from PHP source and PHPDoc comments.

- **Classes:** ${classCount}
- **Functions:** ${functionCount}

## Browse

- [Classes](./classes/)
- [Functions](./functions/)
`;
}

function generateClassesIndexMd({ productLabel, classes }) {
  const items = classes
    .map((c) => `- [\`${c.fqcn}\`](./${c.slug})${c.summary ? ` — ${c.summary}` : ''}`)
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
    .map((f) => `- [\`${f.fqfn}\`](./${f.slug})${f.summary ? ` — ${f.summary}` : ''}`)
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

  const methods = classSymbol.methods ?? [];
  const methodTableRows = methods.length
    ? methods
        .map(
          (m) =>
            `| \`${m.name}()\` | ${mdEscape(m.summary || '')} | \`${mdEscape(phpShortArraySyntax(m.signature || ''))}\` |`
        )
        .join('\n')
    : '';

  const methodSections = methods
    .filter((m) => hasMeaningfulDoc(m))
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
      const resolvedReturnDesc = (returnTag?.description || '').trim();

      return `### \`${m.name}()\`

\`${phpShortArraySyntax(m.signature || `function ${m.name}()`)}\`

${m.summary || ''}
${m.description ? `\n${m.description}\n` : ''}
${paramsTable ? `\n#### Parameters\n\n${paramsTable}\n` : ''}
${resolvedReturnType || resolvedReturnDesc ? `\n#### Returns\n\n- ${codeInlineType(resolvedReturnType, typeLinkCtx)}${resolvedReturnDesc ? ` — ${mdEscape(resolvedReturnDesc)}` : ''}\n` : ''}
${throwsList.length ? `\n#### Throws\n\n${throwsList.map((t) => `- ${codeInlineType(t.type, typeLinkCtx)}${t.description ? ` — ${mdEscape(t.description)}` : ''}`).join('\n')}\n` : ''}
${renderExamplesSection(m.tags, { heading: '####' })}
${renderSeeAlsoSection(m.tags, typeLinkCtx, { heading: '####' })}
${since.length ? `\n**Since:** ${since.map((v) => `\`${mdEscape(v.version)}\`${v.description ? ` (${mdEscape(v.description)})` : ''}`).join(', ')}\n` : ''}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => `\`${mdEscape(d.version || '')}\`${d.description ? ` (${mdEscape(d.description)})` : ''}`).join(', ')}\n` : ''}
${sourceLine ? `\n**Source:** ${sourceLine}\n` : ''}`;
    })
    .join('\n\n');

  const since = (classSymbol.tags?.since ?? []).map(parseSinceTagValue).filter(Boolean);
  const deprecated = (classSymbol.tags?.deprecated ?? []).map(parseDeprecatedTagValue).filter(Boolean);

  return `---
title: ${fqcn}
sidebar_label: ${shortName}
---

# \`${fqcn}\`

${classSymbol.summary || ''}
${classSymbol.description ? `\n${classSymbol.description}\n` : ''}
${renderExamplesSection(classSymbol.tags, { heading: '##' })}
${renderSeeAlsoSection(classSymbol.tags, typeLinkCtx, { heading: '##' })}
${since.length ? `\n**Since:** ${since.map((v) => `\`${mdEscape(v.version)}\`${v.description ? ` (${mdEscape(v.description)})` : ''}`).join(', ')}\n` : ''}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => `\`${mdEscape(d.version || '')}\`${d.description ? ` (${mdEscape(d.description)})` : ''}`).join(', ')}\n` : ''}
${source ? `\n**Source:** ${source}\n` : ''}

## Details

- **Kind:** \`${kind}\`
- **Namespace:** \`${classSymbol.namespace || '(global)'}\`
${extendsList.length ? `- **Extends:** ${renderTypeListInline(extendsList, typeLinkCtx)}` : ''}
${implementsList.length ? `- **Implements:** ${renderTypeListInline(implementsList, typeLinkCtx)}` : ''}

## Methods

${methods.length ? `| Method | Description | Signature |
| --- | --- | --- |
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

  const { params, returnType } = mergeParams({ signature: functionSymbol.signature, doc: functionSymbol });
  const paramsTable = renderParamsTable(params, typeLinkCtx);

  const returnTag = returnsList[0] ?? null;
  const resolvedReturnType = (returnTag?.type || returnType || '').trim();
  const resolvedReturnDesc = (returnTag?.description || '').trim();

  const paramsSection = paramsTable ? `## Parameters\n\n${paramsTable}\n` : '';
  const returnsSection =
    resolvedReturnType || resolvedReturnDesc
      ? `## Returns\n\n- ${codeInlineType(resolvedReturnType, typeLinkCtx)}${resolvedReturnDesc ? ` — ${mdEscape(resolvedReturnDesc)}` : ''}\n`
      : '';
  const throwsSection = throwsList.length
    ? `## Throws\n\n${throwsList.map((t) => `- ${codeInlineType(t.type, typeLinkCtx)}${t.description ? ` — ${mdEscape(t.description)}` : ''}`).join('\n')}\n`
    : '';

  return `---
title: ${fqfn}
sidebar_label: ${shortName}()
---

# \`${fqfn}()\`

\`${phpShortArraySyntax(functionSymbol.signature || `function ${shortName}()`)}\`

${functionSymbol.summary || ''}
${functionSymbol.description ? `\n${functionSymbol.description}\n` : ''}
${renderExamplesSection(functionSymbol.tags, { heading: '##' })}
${renderSeeAlsoSection(functionSymbol.tags, typeLinkCtx, { heading: '##' })}
${since.length ? `\n**Since:** ${since.map((v) => `\`${mdEscape(v.version)}\`${v.description ? ` (${mdEscape(v.description)})` : ''}`).join(', ')}\n` : ''}
${deprecated.length ? `\n**Deprecated:** ${deprecated.map((d) => `\`${mdEscape(d.version || '')}\`${d.description ? ` (${mdEscape(d.description)})` : ''}`).join(', ')}\n` : ''}
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
  const externalTypeLinks = loadTypeLinks();
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

    const referencedTypes = collectReferencedTypesFromHooksDocs({ outputBaseDir, productId: product.id });
    const hasReferenceFilter = referencedTypes.size > 0;
    if (hasReferenceFilter) {
      console.log(`ℹ️  ${product.id}: limiting API classes to ${referencedTypes.size} types referenced in hooks docs`);
    }

    const extracted = runExtractor({ inputDir, ignoreDirs });
    if (!extracted.ok) {
      console.error(`❌ ${product.id}: ${extracted.reason}`);
      failCount++;
      continue;
    }

    const allClasses = Array.isArray(extracted.data?.classes) ? extracted.data.classes : [];
    const allFunctions = Array.isArray(extracted.data?.functions) ? extracted.data.functions : [];

    const classes = allClasses
      .map((c) => {
        const doc = parseDocblock(c.docblock);
        const methods = Array.isArray(c.methods)
          ? c.methods
              .filter((m) => m?.visibility === 'public')
              .map((m) => {
                const md = parseDocblock(m.docblock);
                return {
                  ...m,
                  summary: md.summary,
                  description: md.description,
                  tags: md.tags,
                  internal: md.internal,
                };
              })
              .filter((m) => !m.internal)
          : [];

        const fqcn = String(c.fqcn || '').replace(/^\\+/, '');
        const referenced = hasReferenceFilter ? referencedTypes.has(fqcn) : false;
        const publicApi = referenced || hasMeaningfulDoc(doc) || methods.some((m) => hasMeaningfulDoc(m));

        return {
          ...c,
          slug: slugify(c.fqcn),
          referenced,
          summary: doc.summary,
          description: doc.description,
          tags: doc.tags,
          internal: doc.internal,
          methods,
          publicApi,
        };
      })
      .filter((c) => !c.internal && c.publicApi)
      .filter((c) => (hasReferenceFilter ? Boolean(c.referenced) : true))
      .sort((a, b) => a.fqcn.localeCompare(b.fqcn));

    const localTypeSlugs = buildLocalTypeSlugMap(classes);
    const classTypeLinkCtx = { localTypeSlugs, externalTypeLinks, classesLinkPrefix: './' };
    const functionTypeLinkCtx = { localTypeSlugs, externalTypeLinks, classesLinkPrefix: '../classes/' };

    const functions = allFunctions
      .map((f) => {
        const doc = parseDocblock(f.docblock);
        return {
          ...f,
          slug: slugify(f.fqfn),
          summary: doc.summary,
          description: doc.description,
          tags: doc.tags,
          internal: doc.internal,
          publicApi: hasMeaningfulDoc(doc) && !String(f.name || '').startsWith('_'),
        };
      })
      .filter((f) => !f.internal && f.publicApi)
      .sort((a, b) => a.fqfn.localeCompare(b.fqfn));

    rmDir(outputDir, args.dryRun);
    ensureDir(outputDir, args.dryRun);

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

    const classesDir = path.join(outputDir, 'classes');
    const functionsDir = path.join(outputDir, 'functions');
    ensureDir(classesDir, args.dryRun);
    ensureDir(functionsDir, args.dryRun);

    writeFile(
      path.join(classesDir, '_category_.json'),
      JSON.stringify({ label: 'Classes', position: 1 }, null, 2) + '\n',
      args.dryRun
    );
    writeFile(
      path.join(functionsDir, '_category_.json'),
      JSON.stringify({ label: 'Functions', position: 2 }, null, 2) + '\n',
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
    writeFile(
      path.join(functionsDir, 'index.md'),
      generateFunctionsIndexMd({
        productLabel,
        functions: functions.map((f) => ({ fqfn: f.fqfn, slug: f.slug, summary: f.summary })),
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
    for (const f of functions) {
      writeFile(
        path.join(functionsDir, `${f.slug}.md`),
        generateFunctionPage({ functionSymbol: f, product, repoRef, typeLinkCtx: functionTypeLinkCtx }),
        args.dryRun
      );
    }

    console.log(`✅ ${product.id}: ${classes.length} classes, ${functions.length} functions`);
    okCount++;
  }

  console.log(`\nDone. OK: ${okCount}, skipped: ${skipCount}, failed: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main();

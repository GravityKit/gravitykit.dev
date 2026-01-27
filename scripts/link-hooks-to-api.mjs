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

function renderTypeSpan(inner, { classesDir, classSlugs, fromDir }) {
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
      const targetPath = path.join(classesDir, `${slug}.md`);
      const rel = path.relative(fromDir, targetPath).split(path.sep).join('/');
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
  return `<code>${rendered.join('')}</code>`;
}

function linkHookFile({ filePath, classesDir, classSlugs, dryRun }) {
  const original = fs.readFileSync(filePath, 'utf8');
  const fromDir = path.dirname(filePath);

  const updated = original.replace(/\`([^\`]+)\`/g, (match, inner, offset) => {
    const before = original[offset - 1] ?? '';
    const after = original.slice(offset + match.length, offset + match.length + 2);
    if (before === '[' && after === '](') return match; // already linked

    const html = renderTypeSpan(inner, { classesDir, classSlugs, fromDir });
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

  let changedFiles = 0;

  for (const productId of selected) {
    const productDir = path.join(docsDir, productId);
    const classesDir = path.join(productDir, 'api', 'classes');
    if (!fs.existsSync(classesDir)) continue;

    const classSlugs = new Set(
      fs
        .readdirSync(classesDir)
        .filter((f) => f.endsWith('.md') && f !== 'index.md')
        .map((f) => f.replace(/\.md$/i, ''))
    );

    const hookFiles = [
      ...collectMarkdownFiles(path.join(productDir, 'actions')),
      ...collectMarkdownFiles(path.join(productDir, 'filters')),
    ];

    let productChanged = 0;
    for (const filePath of hookFiles) {
      const res = linkHookFile({ filePath, classesDir, classSlugs, dryRun: args.dryRun });
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


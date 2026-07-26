#!/usr/bin/env node
/**
 * Interop drift alarm for the DTCG token artifact.
 *
 * Conformance and interoperability are different claims. `npm run tokens:generate`
 * already refuses to publish a file that fails the DTCG schema, but a
 * schema-valid file can still be useless: a token can carry a value that is
 * legal DTCG and wrong CSS. This script proves the stronger property by feeding
 * static/api/css-tokens.tokens.json to a real third-party consumer (Style
 * Dictionary), rebuilding CSS custom properties from it, and diffing the result
 * against the registry's own css_var -> default map.
 *
 * This is the check that caught `shadow.shadow_color`: a channel triplet
 * (`18 25 97`) typed as a DTCG colour renders as `#121961`, which turns
 * GravityView's `rgb(var(--gv-shadow-color) / <alpha>)` into invalid CSS and
 * silently kills every shadow. Nothing in the schema can see that.
 *
 * Differences are expected for exactly one class of token: values the emitter
 * resolved because DTCG has no expression language (`calc()`, the flattened
 * shadows). Those are identified by the registry value still being a CSS
 * expression, and reported rather than failed.
 *
 * Runs in drift-check.yml, NOT in the deploy. A Style Dictionary regression is
 * not a reason to block publishing a correct file.
 *
 * Usage: npm run tokens:verify   (after npm run tokens:generate)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SD from 'style-dictionary';

const EXTENSION_KEY = 'com.gravitykit.tokens';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(PROJECT_ROOT, 'static', 'api');
const TOKENS_FILE = path.join(API_DIR, 'css-tokens.tokens.json');
const FLAT_FILE = path.join(API_DIR, 'css-tokens.json');

if (!fs.existsSync(TOKENS_FILE) || !fs.existsSync(FLAT_FILE)) {
  console.error(`✗ Missing generated tokens. Run \`npm run tokens:generate\` first.`);
  process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const registry = JSON.parse(fs.readFileSync(FLAT_FILE, 'utf8')).tokens ?? [];
if (registry.length === 0) {
  console.error('✗ css-tokens.json carries no tokens; cannot verify.');
  process.exit(2);
}
const byVar = new Map(registry.map((r) => [r.css_var, r]));

/** Follow a registry var() chain to the literal the cascade would compute. */
function resolveDefault(value, seen = new Set()) {
  const match = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(String(value).trim());
  if (!match || seen.has(match[1])) return value;
  seen.add(match[1]);
  const target = byVar.get(match[1]);
  return target ? resolveDefault(target.default, seen) : value;
}

const nodes = [];
(function walk(node, trail) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const ext = node.$extensions?.[EXTENSION_KEY];
  if (ext?.cssVar) nodes.push({ path: trail.join('.'), cssVar: ext.cssVar, isToken: '$value' in node });
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith('$')) walk(child, [...trail, key]);
  }
}(doc, []));

const tokens = nodes.filter((n) => n.isToken);
const quarantined = nodes.filter((n) => !n.isToken);

SD.registerTransform({
  name: 'duration/css-dtcg',
  type: 'value',
  transitive: true,
  filter: (t) => t.$type === 'duration' && t.$value && typeof t.$value === 'object',
  transform: (t) => `${t.$value.value}${t.$value.unit}`,
});
SD.registerTransform({
  name: 'name/gv-cssvar',
  type: 'name',
  transform: (t) => (t.$extensions?.[EXTENSION_KEY]?.cssVar ?? `--${t.path.join('-')}`).replace(/^--/, ''),
});

const outFile = path.join(PROJECT_ROOT, 'node_modules', '.cache', 'token-interop.css');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await new SD({
  source: [TOKENS_FILE],
  platforms: {
    css: {
      prefix: '',
      transforms: SD.hooks.transformGroups.css
        .map((t) => (t === 'name/kebab' ? 'name/gv-cssvar' : t))
        .concat('duration/css-dtcg'),
      files: [{ destination: outFile, format: 'css/variables' }],
    },
  },
}).buildAllPlatforms();

const css = fs.readFileSync(outFile, 'utf8');
const emitted = new Map();
// Style Dictionary appends `/** $description */` after the semicolon.
for (const m of css.matchAll(/^\s*(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/gm)) emitted.set(m[1], m[2].trim());

const norm = (v) => String(v).toLowerCase().replace(/\s+/g, ' ').replace(/,\s*/g, ',')
  .replace(/^0px$/, '0').trim();

/** `cubic-bezier(0.2, 0.0, 0.0, 1.0)`, `cubic-bezier(.2,0,0,1)` and `linear` are one curve. */
function canonEasing(v) {
  const s = norm(v);
  if (s === 'linear') return 'cb:0,0,1,1';
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(s);
  if (!m) return null;
  const nums = m[1].split(',').map((x) => Number(x.trim()));
  return nums.length === 4 && nums.every(Number.isFinite) ? `cb:${nums.join(',')}` : null;
}

function canonColor(v) {
  const s = norm(v);
  const hex = /^#([0-9a-f]{6})$/.exec(s);
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return `rgb(${r},${g},${b},1)`;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (fn) {
    const p = fn[1].split(/[,/]/).map((x) => x.trim()).filter(Boolean);
    if (p.length >= 3) return `rgb(${p[0]},${p[1]},${p[2]},${p[3] ?? '1'})`;
  }
  return s === 'transparent' ? 'rgb(0,0,0,0)' : s;
}

const failures = [];
const resolvedDifferences = [];
let matched = 0;

for (const token of tokens) {
  const record = byVar.get(token.cssVar);
  if (!record) { failures.push(`${token.path}: cssVar ${token.cssVar} is not in the registry`); continue; }

  const got = emitted.get(token.cssVar);
  if (got === undefined) { failures.push(`${token.cssVar}: declared as a token but produced no CSS`); continue; }
  if (got.includes('[object Object]')) {
    failures.push(`${token.cssVar}: consumer rendered "[object Object]" (an unhandled DTCG value shape)`);
    continue;
  }

  const want = resolveDefault(record.default);
  const ease = canonEasing(got);
  const same = norm(got) === norm(want)
    || (ease !== null && ease === canonEasing(want))
    || canonColor(got) === canonColor(want);

  if (same) { matched += 1; continue; }
  // Expected only where the registry value is an expression the emitter had to
  // resolve. Anything else is a real divergence between the artifact and the CSS.
  if (/calc\(|rgb\(|var\(/.test(String(want))) resolvedDifferences.push(token.cssVar);
  else failures.push(`${token.cssVar}: emitted "${got}", registry says "${want}"`);
}

console.log('Token interop check (DTCG -> Style Dictionary -> CSS, vs registry)');
console.log(`  registry records     : ${registry.length}`);
console.log(`  DTCG tokens          : ${tokens.length}`);
console.log(`  quarantined groups   : ${quarantined.length}`);
console.log(`  reproduced exactly   : ${matched}`);
console.log(`  resolved expressions : ${resolvedDifferences.length} (expected; see derivedTokens)`);

const accounted = matched + resolvedDifferences.length + quarantined.length;
if (accounted !== registry.length) {
  failures.push(`accounting: ${accounted} of ${registry.length} records reached a known outcome`);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} interop failure(s):`);
  for (const f of failures) console.error(`   ${f}`);
  process.exit(1);
}

console.log(`\n✓ ${accounted} of ${registry.length} records accounted for; the artifact reproduces GravityView's CSS.`);

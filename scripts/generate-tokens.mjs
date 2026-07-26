#!/usr/bin/env node
/**
 * Generate static/api/css-tokens.json from GravityView's design-token registry.
 *
 * Runs `php tools/build-tokens-docs.php --json` against the cloned GravityView
 * repo (TokenRegistry.php is the single source of truth) and republishes the
 * tokens in the Docs-MCP envelope { generated, tokens: [...] }, served at
 * https://www.gravitykit.dev/api/css-tokens.json.
 *
 * No-ops gracefully when the token system / --json flag is not present on the
 * cloned branch yet (warns, writes an empty token set) so it can never break the
 * docs build before GravityView 3.0 lands on develop.
 *
 * Test hook: set GV_TOKENS_JSON=<file> to read a captured --json payload instead
 * of spawning php; GV_TOKENS_REPO=<dir> overrides the GravityView repo path.
 *
 * Usage: node scripts/generate-tokens.mjs   (wired into `npm run docs:generate`)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { buildDocument } from './lib/dtcg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Products that expose a TokenRegistry. GravityView is the only one today; a
// future product would add an entry and feed the same consolidated file.
const TOKEN_PRODUCTS = [{ id: 'gravityview', repoName: 'GravityView' }];

/**
 * Slugs whose CSS value the DTCG rule table legitimately cannot recognise:
 * `inherit`, `column`, `stretch`. Any OTHER token reaching the catch-all fails
 * the build, so a registry rewrite cannot silently demote tokens to metadata.
 * Widen this only after deciding the new form really has no DTCG type.
 */
const KNOWN_UNKNOWN_FORMS = [
  'typography.font_family',
  'typography.field_label_direction',
  'layout.grid_align',
];

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'repos-config.json'), 'utf8'));
}

function repoDirFor(config) {
  if (process.env.GV_TOKENS_REPO) return process.env.GV_TOKENS_REPO;
  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir || './repos');
  return path.join(reposDir, 'GravityView');
}

function anchor(slug) {
  return String(slug).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

/** Read the raw registry records for a product, or null if unavailable (graceful). */
function readRecords(product, config) {
  if (process.env.GV_TOKENS_JSON) {
    try {
      return JSON.parse(fs.readFileSync(process.env.GV_TOKENS_JSON, 'utf8'));
    } catch (e) {
      console.warn(`⚠️  could not read GV_TOKENS_JSON: ${e.message}`);
      return null;
    }
  }
  const repoDir = repoDirFor(config);
  const tool = path.join(repoDir, 'tools', 'build-tokens-docs.php');
  if (!fs.existsSync(tool)) {
    console.warn(`⚠️  ${product.id}: tools/build-tokens-docs.php not found (token system not on this branch yet) — skipping CSS tokens.`);
    return null;
  }
  const res = spawnSync('php', [tool, '--json'], { cwd: repoDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0 || !res.stdout) {
    console.warn(`⚠️  ${product.id}: \`build-tokens-docs.php --json\` failed (flag unsupported on this branch?) — skipping. ${(res.stderr || '').trim()}`);
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    console.warn(`⚠️  ${product.id}: could not parse --json output — skipping. ${e.message}`);
    return null;
  }
}

/** Enrich a raw registry record into the published token shape. */
export function toPublishedToken(record, productId) {
  return {
    ...record,
    product: productId,
    url: `/${productId}/css-tokens#${anchor(record.slug)}`,
  };
}

/**
 * sha256 over the canonicalized registry input.
 *
 * The DTCG artifact carries this instead of a build timestamp: the weekly deploy
 * cron would otherwise republish a byte-different file every Sunday, defeating
 * caching and making "did the design system change?" undecidable by hash.
 */
function digestOf(records) {
  const canonical = JSON.stringify(records, Object.keys(records[0] ?? {}).sort());
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

/** Validate the DTCG artifact against the DTCG's own published JSON Schema. */
function assertSchemaValid(document) {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'dtcg-format-2025.10.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(document)) return;
  const errors = (validate.errors ?? []).slice(0, 20)
    .map((e) => `  ${e.instancePath || '<root>'} ${e.message}`)
    .join('\n');
  throw new Error(`DTCG artifact fails the official 2025.10 schema:\n${errors}`);
}

function main() {
  const config = loadConfig();
  const tokens = [];
  const dtcgProducts = [];
  for (const product of TOKEN_PRODUCTS) {
    const records = readRecords(product, config);
    if (!Array.isArray(records)) continue;
    for (const r of records) tokens.push(toPublishedToken(r, product.id));
    dtcgProducts.push({ product, records });
    console.log(`✓ ${product.id}: ${records.length} CSS design tokens`);
  }

  const outDir = path.join(PROJECT_ROOT, 'static', 'api');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'css-tokens.json'),
    JSON.stringify({ generated: new Date().toISOString(), tokens }, null, 2) + '\n',
  );
  console.log(`📦 Wrote static/api/css-tokens.json (${tokens.length} tokens)`);

  // The interop artifact. Only GravityView registers tokens today; a second
  // product would need this to merge products into one document rather than
  // overwrite, so fail loudly rather than silently publish one product's tokens.
  if (dtcgProducts.length > 1) {
    throw new Error('Multiple token products: buildDocument emits a single product group; merge support is unimplemented.');
  }
  if (dtcgProducts.length === 1) {
    const { product, records } = dtcgProducts[0];
    const { document, report } = buildDocument(records, {
      productId: product.id,
      repo: `GravityKit/${product.repoName}`,
      registrySource: 'src/Settings/TokenRegistry.php',
      sourceDigest: digestOf(records),
      knownUnknownForms: KNOWN_UNKNOWN_FORMS,
    });
    assertSchemaValid(document);
    fs.writeFileSync(path.join(outDir, 'css-tokens.tokens.json'), JSON.stringify(document, null, 2) + '\n');
    const types = Object.entries(report.histogram).sort().map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`📦 Wrote static/api/css-tokens.tokens.json (DTCG 2025.10: ${report.tokens} tokens, ${report.metadataOnly.length} unrepresentable)`);
    console.log(`   types: ${types}`);
  }
}

main();

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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Products that expose a TokenRegistry. GravityView is the only one today; a
// future product would add an entry and feed the same consolidated file.
const TOKEN_PRODUCTS = [{ id: 'gravityview', repoName: 'GravityView' }];

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

function main() {
  const config = loadConfig();
  const tokens = [];
  for (const product of TOKEN_PRODUCTS) {
    const records = readRecords(product, config);
    if (!Array.isArray(records)) continue;
    for (const r of records) tokens.push(toPublishedToken(r, product.id));
    console.log(`✓ ${product.id}: ${records.length} CSS design tokens`);
  }

  const outDir = path.join(PROJECT_ROOT, 'static', 'api');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'css-tokens.json'),
    JSON.stringify({ generated: new Date().toISOString(), tokens }, null, 2) + '\n',
  );
  console.log(`📦 Wrote static/api/css-tokens.json (${tokens.length} tokens)`);
}

main();

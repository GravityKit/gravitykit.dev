#!/usr/bin/env node

/**
 * Generate relationship graphs for each product.
 *
 * Output:
 *   static/relations/<product-id>.json
 *
 * Usage:
 *   npm run relations:generate
 *   npm run relations:generate -- --product gravityview
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
  }

  return args;
}

function loadConfig() {
  const configPath = path.join(PROJECT_ROOT, 'repos-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function checkPhpAvailable() {
  const result = spawnSync('php', ['-v'], { encoding: 'utf8', stdio: 'pipe' });
  return !result.error && result.status === 0;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
  const extractorPath = path.join(PROJECT_ROOT, 'scripts', 'extract-relations.php');
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

function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig();
  const products = Array.isArray(config.products) ? config.products : [];

  if (!checkPhpAvailable()) {
    console.warn('⚠️  PHP not found; skipping relations generation.');
    process.exit(0);
  }

  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir || './repos');
  const outputDir = path.resolve(PROJECT_ROOT, 'static', 'relations');
  const ignoreDirs = ignoredDirNamesFromConfig(config);

  ensureDir(outputDir);

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

    if (!fs.existsSync(inputDir)) {
      console.warn(`⚠️  Skipping ${product.id}: repo not cloned`);
      skipCount++;
      continue;
    }

    console.log(`▶ Extracting relations: ${product.id}`);

    const extracted = runExtractor({ inputDir, ignoreDirs });
    if (!extracted.ok) {
      console.error(`❌ ${product.id}: ${extracted.reason}`);
      failCount++;
      continue;
    }

    // Add product metadata to output
    const output = {
      product: {
        id: product.id,
        label: product.label || product.id,
        repo: product.repo,
      },
      ...extracted.data,
    };

    const outputPath = path.join(outputDir, `${product.id}.json`);

    if (!args.dryRun) {
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    }

    const stats = extracted.data?.stats || {};
    console.log(
      `✅ ${product.id}: ${stats.classes || 0} classes, ${stats.interfaces || 0} interfaces, ${stats.traits || 0} traits`
    );
    okCount++;
  }

  console.log(`\nDone. OK: ${okCount}, skipped: ${skipCount}, failed: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main();

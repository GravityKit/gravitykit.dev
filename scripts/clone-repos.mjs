#!/usr/bin/env node

/**
 * Clone/Update GitHub Repositories for Hooks Documentation
 *
 * This script clones or updates all GravityKit product repositories
 * from GitHub for processing hooks documentation.
 *
 * Usage:
 *   npm run repos:clone          # Clone/update all repos
 *   npm run repos:clone -- --force  # Force fresh clone (delete existing)
 *   npm run repos:clone -- --product gravityview  # Clone specific product
 *   npm run repos:clone -- --parallel 4  # Set parallelism level
 *
 * Requirements:
 *   - Git must be installed and available in PATH
 *   - GitHub CLI (gh) recommended for authentication, or SSH keys configured
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logStep(message) {
  log(`\n${colors.bright}▶ ${message}${colors.reset}`);
}

/**
 * Load configuration from repos-config.json
 */
function loadConfig() {
  const configPath = path.join(PROJECT_ROOT, 'repos-config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Check if git is available
 */
function checkGitAvailable() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('Git is not installed or not available in PATH');
  }
  return true;
}

/**
 * Check if GH_TOKEN environment variable is set (for CI/CD)
 */
function checkGhTokenAvailable() {
  return !!process.env.GH_TOKEN;
}

/**
 * Check if GitHub CLI is available and authenticated
 */
function checkGhAvailable() {
  const result = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}

/**
 * Determine the best clone URL based on available authentication
 */
function getCloneUrl(repo, authMethod) {
  if (authMethod === 'token') {
    // Use HTTPS with token authentication (for CI/CD)
    // Format: https://x-access-token:TOKEN@github.com/repo.git
    const token = process.env.GH_TOKEN;
    return `https://x-access-token:${token}@github.com/${repo}.git`;
  }
  if (authMethod === 'gh') {
    // Use HTTPS with gh CLI handling authentication
    return `https://github.com/${repo}.git`;
  }
  // Default to SSH (assumes SSH keys are configured)
  return `git@github.com:${repo}.git`;
}

/**
 * Clone a repository
 */
function cloneRepo(repo, targetDir, branch, authMethod) {
  return new Promise((resolve) => {
    const url = getCloneUrl(repo, authMethod);
    const args = ['clone', '--depth', '1', '--branch', branch, url, targetDir];

    logInfo(`Cloning ${repo} (${branch}) → ${path.basename(targetDir)}`);

    const proc = spawn('git', args, {
      stdio: 'pipe',
      env: { ...process.env },
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, repo, action: 'cloned' });
      } else {
        resolve({
          ok: false,
          repo,
          action: 'clone_failed',
          error: stderr.trim(),
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        ok: false,
        repo,
        action: 'clone_failed',
        error: err.message,
      });
    });
  });
}

/**
 * Update an existing repository
 */
function updateRepo(repoDir, repo, branch) {
  return new Promise((resolve) => {
    logInfo(`Updating ${repo} → ${path.basename(repoDir)}`);

    // First, fetch the latest changes
    const fetchProc = spawnSync('git', ['fetch', 'origin', branch], {
      cwd: repoDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    if (fetchProc.status !== 0) {
      resolve({
        ok: false,
        repo,
        action: 'update_failed',
        error: fetchProc.stderr || 'Fetch failed',
      });
      return;
    }

    // Reset to origin/branch to ensure we have the latest
    const resetProc = spawnSync('git', ['reset', '--hard', `origin/${branch}`], {
      cwd: repoDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    if (resetProc.status === 0) {
      resolve({ ok: true, repo, action: 'updated' });
    } else {
      resolve({
        ok: false,
        repo,
        action: 'update_failed',
        error: resetProc.stderr || 'Reset failed',
      });
    }
  });
}

/**
 * Delete a directory recursively
 */
function deleteDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Process a single product
 */
async function processProduct(product, config, options) {
  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir);
  const branch = product.branch || config.defaults.branch || 'develop';
  const repoName = product.repo.split('/')[1]; // Extract repo name from org/repo
  const targetDir = path.join(reposDir, repoName);

  // Check if repo already exists
  const repoExists = fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, '.git'));

  if (options.force && repoExists) {
    logWarning(`Force mode: Deleting existing ${repoName}`);
    deleteDir(targetDir);
  }

  if (!repoExists || options.force) {
    return cloneRepo(product.repo, targetDir, branch, options.authMethod);
  } else {
    return updateRepo(targetDir, product.repo, branch);
  }
}

/**
 * Process products in parallel batches
 */
async function processProductsInParallel(products, config, options, parallelism) {
  const results = [];

  for (let i = 0; i < products.length; i += parallelism) {
    const batch = products.slice(i, i + parallelism);
    const batchResults = await Promise.all(
      batch.map((product) => processProduct(product, config, options))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    force: false,
    product: null,
    parallel: 4,
    help: false,
    list: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--product' || arg === '-p') {
      options.product = args[++i];
    } else if (arg === '--parallel' || arg === '-j') {
      options.parallel = parseInt(args[++i], 10) || 4;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list' || arg === '-l') {
      options.list = true;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
${colors.bright}Clone/Update GitHub Repositories for Hooks Documentation${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npm run repos:clone [options]

${colors.cyan}Options:${colors.reset}
  --force, -f           Force fresh clone (delete existing repos)
  --product, -p <id>    Clone/update only a specific product (exact ID match)
  --parallel, -j <n>    Number of parallel operations (default: 4)
  --list, -l            List all available product IDs
  --help, -h            Show this help message

${colors.cyan}Examples:${colors.reset}
  npm run repos:clone                    # Clone/update all repos
  npm run repos:clone -- --list          # Show all product IDs
  npm run repos:clone -- --force         # Force fresh clone of all
  npm run repos:clone -- -p gravityview  # Clone only GravityView (exact match)
  npm run repos:clone -- -j 8            # Use 8 parallel operations

${colors.cyan}Notes:${colors.reset}
  - Requires Git to be installed
  - Uses GitHub CLI (gh) if available, otherwise SSH
  - Repos are cloned with --depth 1 for faster downloads
  - Configuration is read from repos-config.json
`);
}

/**
 * Print list of available products
 */
function printProductList(products) {
  console.log(`
${colors.bright}Available Product IDs${colors.reset}

${products.map((p) => `  ${colors.cyan}${p.id}${colors.reset} → ${p.repo}`).join('\n')}

${colors.dim}Use: npm run repos:clone -- --product <id>${colors.reset}
`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    return 0;
  }

  // Load config early for --list
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logError(`Failed to load configuration: ${err.message}`);
    return 1;
  }

  if (options.list) {
    printProductList(config.products);
    return 0;
  }

  logStep('Configuration loaded');
  logSuccess(`Loaded ${config.products.length} products from repos-config.json`);

  logStep('Checking prerequisites');

  try {
    checkGitAvailable();
    logSuccess('Git is available');
  } catch (err) {
    logError(err.message);
    return 1;
  }

  // Determine authentication method: token (CI) > gh CLI > SSH
  if (checkGhTokenAvailable()) {
    options.authMethod = 'token';
    logSuccess('GH_TOKEN detected (using HTTPS with token auth)');
  } else if (checkGhAvailable()) {
    options.authMethod = 'gh';
    logSuccess('GitHub CLI is authenticated (using HTTPS)');
  } else {
    options.authMethod = 'ssh';
    logWarning('No token or GitHub CLI, using SSH authentication');
  }

  // Ensure repos directory exists
  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir);
  if (!fs.existsSync(reposDir)) {
    fs.mkdirSync(reposDir, { recursive: true });
    logInfo(`Created repos directory: ${reposDir}`);
  }

  // Filter products if specific one requested
  let products = config.products;
  if (options.product) {
    // Exact match on product ID
    const exactMatch = products.filter((p) => p.id === options.product);

    if (exactMatch.length > 0) {
      products = exactMatch;
    } else {
      // No exact match - show available options
      const similar = products.filter(
        (p) =>
          p.id.includes(options.product) ||
          p.repo.toLowerCase().includes(options.product.toLowerCase())
      );

      logError(`No product found with ID: ${options.product}`);
      if (similar.length > 0) {
        logInfo('Did you mean one of these?');
        similar.forEach((p) => console.log(`    ${p.id}`));
      }
      logInfo('Use --list to see all available product IDs');
      return 1;
    }
    logInfo(`Selected: ${products[0].id}`);
  }

  logStep(`Processing ${products.length} repositories (parallel: ${options.parallel})`);

  const results = await processProductsInParallel(
    products,
    config,
    options,
    options.parallel
  );

  // Print summary
  logStep('Summary');

  const cloned = results.filter((r) => r.ok && r.action === 'cloned');
  const updated = results.filter((r) => r.ok && r.action === 'updated');
  const failed = results.filter((r) => !r.ok);

  if (cloned.length > 0) {
    logSuccess(`Cloned: ${cloned.length}`);
    cloned.forEach((r) => console.log(`    ${r.repo}`));
  }

  if (updated.length > 0) {
    logSuccess(`Updated: ${updated.length}`);
    updated.forEach((r) => console.log(`    ${r.repo}`));
  }

  if (failed.length > 0) {
    logError(`Failed: ${failed.length}`);
    failed.forEach((r) => {
      console.log(`    ${r.repo}: ${r.error}`);
    });
  }

  console.log('');

  if (failed.length > 0) {
    logWarning('Some repositories failed. Check the errors above.');
    logInfo('You may need to:');
    logInfo('  1. Configure SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh');
    logInfo('  2. Install GitHub CLI: gh auth login');
    logInfo('  3. Check if you have access to the repositories');
    return 1;
  }

  logSuccess('All repositories processed successfully!');
  logInfo(`Repos are in: ${reposDir}`);
  logInfo('Next step: npm run hooks:generate');

  return 0;
}

process.exit(await main());

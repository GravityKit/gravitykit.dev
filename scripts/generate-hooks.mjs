#!/usr/bin/env node

/**
 * Regenerate Hooks Documentation from GitHub Repositories
 *
 * This script processes cloned GitHub repositories to generate
 * hooks documentation using wp-hooks-documentor.
 *
 * Usage:
 *   npm run hooks:generate          # Regenerate all hooks docs
 *   npm run hooks:generate -- --product gravityview  # Single product (exact ID)
 *   npm run hooks:generate -- --dry-run  # Preview without changes
 *   npm run hooks:generate -- --list     # List available product IDs
 *
 * Prerequisites:
 *   - wp-hooks-documentor installed globally: npm i -g github:GravityKit/wp-hooks-documentor
 *   - Repos cloned via: npm run repos:clone
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'templates', 'hooks');

/**
 * Load a template file
 */
function loadTemplate(name) {
  const templatePath = path.join(TEMPLATES_DIR, `${name}.md`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Render a template with variables
 * Supports {{variable}} and {{#condition}}...{{/condition}} blocks
 */
function renderTemplate(template, vars) {
  let result = template;

  // Handle conditional blocks: {{#condition}}...{{/condition}}
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, key, content) => {
    return vars[key] ? content : '';
  });

  // Handle simple variables: {{variable}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });

  return result;
}

// ANSI color codes
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
 * Check if wp-hooks-documentor is available
 */
function checkWpHooksDocumentor() {
  const result = spawnSync('wp-hooks-documentor', ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error || result.status !== 0) {
    return false;
  }
  return true;
}

/**
 * Copy directory recursively
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Delete directory recursively
 */
function deleteDirRecursive(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Rename directory to lowercase if it exists
 */
function lowercaseDirectory(dir, name) {
  const upperPath = path.join(dir, name);
  const lowerPath = path.join(dir, name.toLowerCase());

  if (fs.existsSync(upperPath) && upperPath !== lowerPath) {
    // Use a temp name to handle case-insensitive filesystems (macOS)
    const tempPath = path.join(dir, `_temp_${name.toLowerCase()}`);
    fs.renameSync(upperPath, tempPath);
    fs.renameSync(tempPath, lowerPath);
  }
}

/**
 * Run wp-hooks-documentor for a product
 */
function generateHooksDocs(product, config, options) {
  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir);
  const outputBaseDir = path.resolve(PROJECT_ROOT, config.outputDir);

  // Get repo directory name from repo path (org/repo -> repo)
  const repoName = product.repo.split('/')[1];
  const repoDir = path.join(reposDir, repoName);

  // Check if repo exists
  if (!fs.existsSync(repoDir)) {
    return {
      ok: false,
      id: product.id,
      reason: `Repository not cloned. Run: npm run repos:clone -- --product ${product.id}`,
    };
  }

  // Determine input directory (the cloned repo)
  const inputDir = product.srcDir
    ? path.join(repoDir, product.srcDir)
    : repoDir;

  if (!fs.existsSync(inputDir)) {
    return {
      ok: false,
      id: product.id,
      reason: `Source directory not found: ${inputDir}`,
    };
  }

  // Final output directory for this product's hooks
  const finalOutputDir = path.join(outputBaseDir, product.id);

  if (options.dryRun) {
    logInfo(`[DRY RUN] Would generate: ${product.id}`);
    logInfo(`  Input: ${path.relative(PROJECT_ROOT, inputDir)}`);
    logInfo(`  Output: ${path.relative(PROJECT_ROOT, finalOutputDir)}`);
    return { ok: true, id: product.id, action: 'dry_run' };
  }

  log(`\n${colors.cyan}=== ${product.label} (${product.id}) ===${colors.reset}`);
  logInfo(`Input:  ${path.relative(PROJECT_ROOT, inputDir)}`);
  logInfo(`Output: ${path.relative(PROJECT_ROOT, finalOutputDir)}`);

  // Create a temporary working directory for wp-hooks-documentor
  const tempWorkDir = path.join(PROJECT_ROOT, '.tmp-hooks-work', product.id);
  const tempOutputDir = path.join(tempWorkDir, 'output');

  try {
    // Clean up any previous temp directory
    deleteDirRecursive(tempWorkDir);
    fs.mkdirSync(tempWorkDir, { recursive: true });
    fs.mkdirSync(tempOutputDir, { recursive: true });

    // Create wp-hooks-doc.json in the temp directory with RELATIVE paths
    const hooksConfig = {
      input: inputDir,  // Absolute path to source
      outputDir: './output',  // Relative to temp work dir
      title: product.label,
      tagline: `Hooks documentation for ${product.label}`,
      ignoreFiles: config.defaults.ignoreFiles || [],
      ignoreHooks: config.defaults.ignoreHooks || [],
      customFields: config.defaults.customFields || {},
      // Don't build the site, just generate markdown
      skipBuild: true,
    };

    // Merge any product-specific overrides
    if (product.ignoreFiles) {
      hooksConfig.ignoreFiles = [...hooksConfig.ignoreFiles, ...product.ignoreFiles];
    }
    if (product.ignoreHooks) {
      hooksConfig.ignoreHooks = [...hooksConfig.ignoreHooks, ...product.ignoreHooks];
    }

    const configPath = path.join(tempWorkDir, 'wp-hooks-doc.json');
    fs.writeFileSync(configPath, JSON.stringify(hooksConfig, null, 2));

    // Run wp-hooks-documentor from the temp directory
    const result = spawnSync('wp-hooks-documentor', ['generate', '--skip-build'], {
      cwd: tempWorkDir,
      stdio: 'inherit',
      shell: false,
    });

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        return {
          ok: false,
          id: product.id,
          reason: 'wp-hooks-documentor not found. Install: npm i -g github:GravityKit/wp-hooks-documentor',
        };
      }
      return {
        ok: false,
        id: product.id,
        reason: result.error.message,
      };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        id: product.id,
        reason: `Exit code ${result.status}`,
      };
    }

    // Find where the hooks were generated
    // wp-hooks-documentor creates: output/docs/hooks/{Actions,Filters}
    const generatedHooksDir = path.join(tempOutputDir, 'docs', 'hooks');

    if (!fs.existsSync(generatedHooksDir)) {
      // Try alternative location
      const altHooksDir = path.join(tempOutputDir, 'hooks');
      if (fs.existsSync(altHooksDir)) {
        // Copy from alternative location
        deleteDirRecursive(finalOutputDir);
        copyDirRecursive(altHooksDir, finalOutputDir);
      } else {
        return {
          ok: false,
          id: product.id,
          reason: 'No hooks documentation was generated',
        };
      }
    } else {
      // Copy generated hooks to final location
      deleteDirRecursive(finalOutputDir);
      copyDirRecursive(generatedHooksDir, finalOutputDir);
    }

    // Rename Actions/Filters to lowercase for cleaner URLs
    lowercaseDirectory(finalOutputDir, 'Actions');
    lowercaseDirectory(finalOutputDir, 'Filters');

    // Generate index.md for the product and subdirectories
    generateProductIndex(product, finalOutputDir);
    generateActionsIndex(product, finalOutputDir);
    generateFiltersIndex(product, finalOutputDir);

    return { ok: true, id: product.id, action: 'generated' };
  } finally {
    // Clean up temp directory
    deleteDirRecursive(tempWorkDir);
  }
}

/**
 * Generate an index.md file for a product's hooks documentation
 */
function generateProductIndex(product, outputDir) {
  const indexPath = path.join(outputDir, 'index.md');

  // Check if actions and filters directories exist (lowercase)
  const actionsDir = path.join(outputDir, 'actions');
  const filtersDir = path.join(outputDir, 'filters');

  const hasActions = fs.existsSync(actionsDir) && fs.readdirSync(actionsDir).filter(f => f.endsWith('.md')).length > 0;
  const hasFilters = fs.existsSync(filtersDir) && fs.readdirSync(filtersDir).filter(f => f.endsWith('.md')).length > 0;

  const actionCount = hasActions ? fs.readdirSync(actionsDir).filter(f => f.endsWith('.md')).length : 0;
  const filterCount = hasFilters ? fs.readdirSync(filtersDir).filter(f => f.endsWith('.md')).length : 0;

  const template = loadTemplate('product-index');
  const content = renderTemplate(template, {
    label: product.label,
    repo: product.repo,
    totalHooks: actionCount + filterCount,
    actionCount,
    filterCount,
    hasActions,
    hasFilters,
  });

  fs.writeFileSync(indexPath, content);
}

/**
 * Generate an index.md file for the actions subdirectory
 */
function generateActionsIndex(product, outputDir) {
  const actionsDir = path.join(outputDir, 'actions');

  if (!fs.existsSync(actionsDir)) {
    return;
  }

  const hooks = fs.readdirSync(actionsDir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => f.replace('.md', ''));

  if (hooks.length === 0) {
    return;
  }

  const hookList = hooks
    .sort()
    .map(h => `- [${h}](./${h}.md)`)
    .join('\n');

  const template = loadTemplate('actions-index');
  const content = renderTemplate(template, {
    label: product.label,
    count: hooks.length,
    hookList,
  });

  fs.writeFileSync(path.join(actionsDir, 'index.md'), content);
}

/**
 * Generate an index.md file for the filters subdirectory
 */
function generateFiltersIndex(product, outputDir) {
  const filtersDir = path.join(outputDir, 'filters');

  if (!fs.existsSync(filtersDir)) {
    return;
  }

  const hooks = fs.readdirSync(filtersDir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => f.replace('.md', ''));

  if (hooks.length === 0) {
    return;
  }

  const hookList = hooks
    .sort()
    .map(h => `- [${h}](./${h}.md)`)
    .join('\n');

  const template = loadTemplate('filters-index');
  const content = renderTemplate(template, {
    label: product.label,
    count: hooks.length,
    hookList,
  });

  fs.writeFileSync(path.join(filtersDir, 'index.md'), content);
}

/**
 * Generate main hooks index page
 */
function generateMainIndex(config, results) {
  const outputDir = path.resolve(PROJECT_ROOT, config.outputDir);
  const indexPath = path.join(outputDir, 'index.md');

  const successfulProducts = results
    .filter((r) => r.ok && r.action === 'generated')
    .map((r) => config.products.find((p) => p.id === r.id))
    .filter(Boolean);

  const productList = successfulProducts
    .map((p) => `- [${p.label}](./${p.id}/)`)
    .join('\n') || '_No products generated yet. Run `npm run hooks:generate` to generate documentation._';

  const template = loadTemplate('main-index');
  const content = renderTemplate(template, {
    productList,
  });

  fs.writeFileSync(indexPath, content);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    product: null,
    dryRun: false,
    help: false,
    list: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--product' || arg === '-p') {
      options.product = args[++i];
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
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
${colors.bright}Regenerate Hooks Documentation from GitHub Repositories${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npm run hooks:generate [options]

${colors.cyan}Options:${colors.reset}
  --product, -p <id>    Generate docs for a specific product only (exact ID match)
  --dry-run, -n         Preview what would be generated without making changes
  --list, -l            List all available product IDs
  --help, -h            Show this help message

${colors.cyan}Examples:${colors.reset}
  npm run hooks:generate                      # Generate all hooks docs
  npm run hooks:generate -- --list            # Show all product IDs
  npm run hooks:generate -- -p gravityview    # Generate only GravityView
  npm run hooks:generate -- --dry-run         # Preview mode

${colors.cyan}Prerequisites:${colors.reset}
  1. Install wp-hooks-documentor: npm i -g github:GravityKit/wp-hooks-documentor
  2. Clone repositories: npm run repos:clone

${colors.cyan}Output:${colors.reset}
  Documentation is generated to: ${path.relative(process.cwd(), path.join(PROJECT_ROOT, 'docs/hooks'))}
`);
}

/**
 * Print list of available products
 */
function printProductList(products) {
  console.log(`
${colors.bright}Available Product IDs${colors.reset}

${products.map((p) => `  ${colors.cyan}${p.id}${colors.reset} → ${p.label}`).join('\n')}

${colors.dim}Use: npm run hooks:generate -- --product <id>${colors.reset}
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

  logStep('Loading configuration');

  let config;
  try {
    config = loadConfig();
    logSuccess(`Loaded ${config.products.length} products from repos-config.json`);
  } catch (err) {
    logError(`Failed to load configuration: ${err.message}`);
    return 1;
  }

  if (options.list) {
    printProductList(config.products);
    return 0;
  }

  logStep('Checking prerequisites');

  if (!checkWpHooksDocumentor()) {
    logError('wp-hooks-documentor is not installed or not in PATH');
    logInfo('Install it with: npm i -g github:GravityKit/wp-hooks-documentor');
    return 1;
  }
  logSuccess('wp-hooks-documentor is available');

  // Check repos directory
  const reposDir = path.resolve(PROJECT_ROOT, config.reposDir);
  if (!fs.existsSync(reposDir)) {
    logError(`Repos directory not found: ${reposDir}`);
    logInfo('Clone repositories first: npm run repos:clone');
    return 1;
  }

  // Count available repos
  const availableRepos = fs.readdirSync(reposDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .length;

  if (availableRepos === 0) {
    logError('No repositories found. Clone them first: npm run repos:clone');
    return 1;
  }
  logSuccess(`Found ${availableRepos} cloned repositories`);

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

  // Ensure output directory exists
  const outputDir = path.resolve(PROJECT_ROOT, config.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  logStep(`Generating hooks documentation for ${products.length} products`);

  if (options.dryRun) {
    logWarning('DRY RUN MODE - No files will be created or modified');
  }

  const results = [];
  for (const product of products) {
    const result = generateHooksDocs(product, config, options);
    results.push(result);

    // Stop on fatal errors (like missing tool)
    if (!result.ok && result.reason.includes('wp-hooks-documentor not found')) {
      break;
    }
  }

  // Generate main index if not dry run and we generated something
  if (!options.dryRun && results.some((r) => r.ok)) {
    generateMainIndex(config, results);
  }

  // Clean up temp work directory
  const tempWorkRoot = path.join(PROJECT_ROOT, '.tmp-hooks-work');
  deleteDirRecursive(tempWorkRoot);

  // Print summary
  logStep('Summary');

  const generated = results.filter((r) => r.ok && r.action === 'generated');
  const dryRuns = results.filter((r) => r.ok && r.action === 'dry_run');
  const failed = results.filter((r) => !r.ok);

  if (generated.length > 0) {
    logSuccess(`Generated: ${generated.length}`);
    generated.forEach((r) => console.log(`    ${r.id}`));
  }

  if (dryRuns.length > 0) {
    logInfo(`Would generate: ${dryRuns.length}`);
  }

  if (failed.length > 0) {
    logError(`Failed: ${failed.length}`);
    failed.forEach((r) => {
      console.log(`    ${r.id}: ${r.reason}`);
    });
  }

  console.log('');

  if (failed.length > 0) {
    logWarning('Some products failed. Check the errors above.');
    return 1;
  }

  if (!options.dryRun && generated.length > 0) {
    logSuccess('Hooks documentation generated successfully!');
    logInfo(`Output directory: ${path.relative(process.cwd(), outputDir)}`);
    logInfo('Next step: npm run build');
  }

  return 0;
}

process.exit(await main());

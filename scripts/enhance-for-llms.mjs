#!/usr/bin/env node

/**
 * Enhance Documentation for LLM Consumption
 *
 * This script post-processes generated hooks documentation to make it
 * more useful for LLMs (Large Language Models) by:
 *
 * 1. Creating a comprehensive hooks.json index
 * 2. Adding structured JSON-LD data to frontmatter
 * 3. Adding code examples where missing
 * 4. Ensuring consistent formatting
 *
 * Usage:
 *   npm run llm:enhance
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Generate a description from hook name and type when one doesn't exist
 */
function generateDescription(hookName, hookType, params = []) {
  // Parse the hook name to extract meaningful parts
  const parts = hookName.split(/[/_]/).filter(Boolean);

  // Build description from parts
  const action = hookType === 'action' ? 'Fires' : 'Filters';
  const context = parts.slice(-2).join(' ').replace(/-/g, ' ');

  // Identify common patterns
  if (hookName.includes('/before')) {
    return `${action} before ${context.replace('before', '').trim()} processing.`;
  }
  if (hookName.includes('/after')) {
    return `${action} after ${context.replace('after', '').trim()} processing.`;
  }
  if (hookType === 'filter' && params.length > 0) {
    return `Filters the ${params[0].name.replace(/_/g, ' ')} value.`;
  }

  return `${action} during ${context} processing.`;
}

/**
 * Infer category/tags from hook name
 */
function inferCategories(hookName) {
  const categories = [];
  const name = hookName.toLowerCase();

  // Core categories
  if (name.includes('entry') || name.includes('entries')) categories.push('entries');
  if (name.includes('field')) categories.push('fields');
  if (name.includes('search') || name.includes('filter')) categories.push('search');
  if (name.includes('template') || name.includes('render')) categories.push('rendering');
  if (name.includes('edit')) categories.push('editing');
  if (name.includes('view')) categories.push('views');
  if (name.includes('form')) categories.push('forms');
  if (name.includes('widget')) categories.push('widgets');
  if (name.includes('export')) categories.push('export');
  if (name.includes('import')) categories.push('import');
  if (name.includes('calendar') || name.includes('event')) categories.push('calendar');
  if (name.includes('chart')) categories.push('charts');
  if (name.includes('map') || name.includes('marker')) categories.push('maps');
  if (name.includes('board') || name.includes('card') || name.includes('lane')) categories.push('kanban');
  if (name.includes('approval') || name.includes('approve')) categories.push('approval');
  if (name.includes('notification') || name.includes('email')) categories.push('notifications');
  if (name.includes('permission') || name.includes('capability') || name.includes('access')) categories.push('permissions');
  if (name.includes('admin')) categories.push('admin');
  if (name.includes('frontend')) categories.push('frontend');
  if (name.includes('api') || name.includes('rest')) categories.push('api');
  if (name.includes('shortcode')) categories.push('shortcodes');
  if (name.includes('script') || name.includes('style') || name.includes('css')) categories.push('assets');
  if (name.includes('cache')) categories.push('caching');

  // Timing categories
  if (name.includes('before') || name.includes('pre_')) categories.push('before');
  if (name.includes('after') || name.includes('post_')) categories.push('after');

  return categories.length > 0 ? categories : ['general'];
}

/**
 * Find related hooks based on naming patterns
 */
function findRelatedHooks(hookName, allHookNames) {
  const related = [];

  // Remove before/after to find pairs
  const baseName = hookName
    .replace(/\/before$/, '')
    .replace(/\/after$/, '')
    .replace(/_before$/, '')
    .replace(/_after$/, '')
    .replace(/\/pre_/, '/')
    .replace(/\/post_/, '/');

  for (const other of allHookNames) {
    if (other === hookName) continue;

    const otherBase = other
      .replace(/\/before$/, '')
      .replace(/\/after$/, '')
      .replace(/_before$/, '')
      .replace(/_after$/, '')
      .replace(/\/pre_/, '/')
      .replace(/\/post_/, '/');

    // Same base = related (before/after pairs)
    if (baseName === otherBase) {
      related.push(other);
      continue;
    }

    // Similar prefix (same feature area)
    const hookPrefix = hookName.split('/').slice(0, -1).join('/');
    const otherPrefix = other.split('/').slice(0, -1).join('/');
    if (hookPrefix && hookPrefix === otherPrefix && related.length < 5) {
      related.push(other);
    }
  }

  return related.slice(0, 5); // Limit to 5 related hooks
}

/**
 * Extract usage example from markdown content
 */
function extractExample(content) {
  const exampleMatch = content.match(/## Usage Example\n\n```php\n([\s\S]*?)```/);
  return exampleMatch ? exampleMatch[1].trim() : null;
}

/**
 * Parse a hook markdown file and extract metadata
 */
function parseHookFile(filePath, productId, hookType) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath, '.md');

  // Skip index files
  if (fileName === 'index') return null;

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';

  // Parse frontmatter fields
  const getId = () => {
    const match = frontmatter.match(/^id:\s*(.+)$/m);
    return match ? match[1].trim() : fileName;
  };

  const getTitle = () => {
    const match = frontmatter.match(/^title:\s*["']?(.+?)["']?$/m);
    return match ? match[1].trim() : fileName;
  };

  // Extract the ACTUAL hook name from the markdown heading (e.g., "# Filter: gravityview_field_output")
  // or from the sidebar_label which contains the real hook name
  const getActualHookName = () => {
    // Try to get from the heading first (most reliable)
    const headingMatch = content.match(/^# (?:Action|Filter):\s*(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Fall back to sidebar_label which usually has the real name
    const sidebarMatch = frontmatter.match(/^sidebar_label:\s*["']?(.+?)["']?$/m);
    if (sidebarMatch) {
      return sidebarMatch[1].trim();
    }

    // Last resort: use the id
    return getId();
  };

  const hookName = getActualHookName();

  // Extract parameters table FIRST (needed for description generation)
  const params = [];
  const paramsMatch = content.match(/## Parameters\n\n\|[^\n]+\n\|[^\n]+\n((?:\|[^\n]+\n)*)/);
  if (paramsMatch) {
    const rows = paramsMatch[1].trim().split('\n');
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        // Clean up parameter name: remove $, ↳ (nested indicator), and extra whitespace
        let paramName = cells[0]
          .replace(/^\$/, '')           // Remove leading $
          .replace(/^↳\s*/, '')         // Remove ↳ prefix (nested param indicator)
          .replace(/^\$/, '')           // Remove $ again if it follows ↳
          .trim();

        params.push({
          name: paramName,
          type: cells[1].replace(/`/g, ''),
          description: cells[2],
        });
      }
    }
  }

  // Extract description (first paragraph after the main title, before ## heading)
  // Look for content between "# Action/Filter: hookname" and the first "## " section
  const contentAfterFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '');
  const descMatch = contentAfterFrontmatter.match(/^# (?:Action|Filter):[^\n]+\n\n([^#`|\n][^\n]*)/);
  let description = descMatch ? descMatch[1].trim() : '';

  // If description is empty, starts with code/table markers, or is garbage, generate one
  if (!description || description.startsWith('|') || description.startsWith('`') || description === 'Name' || description.length < 10) {
    description = generateDescription(hookName, hookType, params);
  }

  // Extract usage example
  const example = extractExample(content);

  // Extract since version
  const sinceMatch = content.match(/### Since\n\n-\s*(.+)/);
  const since = sinceMatch ? sinceMatch[1].trim() : null;

  // Extract source location
  const sourceMatch = content.match(/Defined in `([^`]+)` at line (\d+)/);
  const source = sourceMatch ? {
    file: sourceMatch[1],
    line: parseInt(sourceMatch[2], 10),
  } : null;

  return {
    id: getId(),           // File ID for URL construction
    name: hookName,        // Actual hook name (e.g., "gk/gravityactions/after_modal_render")
    type: hookType,
    product: productId,
    description,
    parameters: params,
    categories: inferCategories(hookName),
    example,               // Usage example code
    since,
    source,
    url: `/docs/${productId}/${hookType}s/${getId()}/`,
  };
}

/**
 * Scan all products and collect hook data
 */
function collectAllHooks() {
  const docsDir = path.join(PROJECT_ROOT, 'docs');
  const configPath = path.join(PROJECT_ROOT, 'repos-config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error('repos-config.json not found');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const allHooks = {
    generated: new Date().toISOString(),
    version: '1.0',
    products: {},
    hooks: [],
    stats: {
      totalHooks: 0,
      totalActions: 0,
      totalFilters: 0,
      productCount: 0,
    },
  };

  for (const product of config.products) {
    const productDir = path.join(docsDir, product.id);
    if (!fs.existsSync(productDir)) continue;

    const productHooks = {
      id: product.id,
      label: product.label,
      repo: product.repo,
      actions: [],
      filters: [],
    };

    // Process actions
    const actionsDir = path.join(productDir, 'actions');
    if (fs.existsSync(actionsDir)) {
      const files = fs.readdirSync(actionsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const hook = parseHookFile(path.join(actionsDir, file), product.id, 'action');
        if (hook) {
          productHooks.actions.push(hook.name);  // Use actual hook name
          allHooks.hooks.push(hook);
          allHooks.stats.totalActions++;
        }
      }
    }

    // Process filters
    const filtersDir = path.join(productDir, 'filters');
    if (fs.existsSync(filtersDir)) {
      const files = fs.readdirSync(filtersDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const hook = parseHookFile(path.join(filtersDir, file), product.id, 'filter');
        if (hook) {
          productHooks.filters.push(hook.name);  // Use actual hook name
          allHooks.hooks.push(hook);
          allHooks.stats.totalFilters++;
        }
      }
    }

    if (productHooks.actions.length > 0 || productHooks.filters.length > 0) {
      allHooks.products[product.id] = productHooks;
      allHooks.stats.productCount++;
    }
  }

  allHooks.stats.totalHooks = allHooks.stats.totalActions + allHooks.stats.totalFilters;

  // Second pass: Add related hooks now that we have all hook names
  const allHookNames = allHooks.hooks.map(h => h.name);
  for (const hook of allHooks.hooks) {
    hook.related = findRelatedHooks(hook.name, allHookNames);
  }

  return allHooks;
}

/**
 * Enhance a hook markdown file with better LLM-friendly content
 */
function enhanceHookFile(filePath, hookData) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already enhanced
  if (content.includes('## Usage Example')) {
    return false;
  }

  // Generate usage example based on hook type
  const exampleCode = hookData.type === 'action'
    ? generateActionExample(hookData)
    : generateFilterExample(hookData);

  // Find the best place to insert the example (after Parameters or at the end before Source)
  const insertPoint = content.indexOf('### Since');
  if (insertPoint === -1) {
    // Append at the end
    content = content.trimEnd() + '\n\n' + exampleCode;
  } else {
    // Insert before "### Since"
    content = content.slice(0, insertPoint) + exampleCode + '\n' + content.slice(insertPoint);
  }

  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * Generate an action usage example
 */
function generateActionExample(hook) {
  const params = hook.parameters || [];
  const paramList = params.map(p => `$${p.name}`).join(', ');
  const paramCount = params.length;

  const docBlock = params.length > 0
    ? params.map(p => ` * @param ${p.type} $${p.name} ${p.description}`).join('\n')
    : ' * @return void';

  return `## Usage Example

\`\`\`php
/**
 * Hook into ${hook.name}
 *
${docBlock}
 */
add_action( '${hook.name}', 'my_custom_${hook.name.replace(/[^a-z0-9]/gi, '_')}_handler'${paramCount > 0 ? `, 10, ${paramCount}` : ''} );

function my_custom_${hook.name.replace(/[^a-z0-9]/gi, '_')}_handler(${paramList}) {
    // Your custom code here
}
\`\`\`

`;
}

/**
 * Generate a filter usage example
 */
function generateFilterExample(hook) {
  const params = hook.parameters || [];
  const paramList = params.map(p => `$${p.name}`).join(', ');
  const paramCount = params.length;
  const returnParam = params[0] || { name: 'value', type: 'mixed' };

  const docBlock = params.length > 0
    ? params.map(p => ` * @param ${p.type} $${p.name} ${p.description}`).join('\n') + '\n * @return ' + returnParam.type + ' Modified ' + returnParam.name
    : ' * @param mixed $value The value to filter\n * @return mixed Modified value';

  return `## Usage Example

\`\`\`php
/**
 * Filter ${hook.name}
 *
${docBlock}
 */
add_filter( '${hook.name}', 'my_custom_${hook.name.replace(/[^a-z0-9]/gi, '_')}_filter'${paramCount > 0 ? `, 10, ${paramCount}` : ''} );

function my_custom_${hook.name.replace(/[^a-z0-9]/gi, '_')}_filter(${paramList}) {
    // Modify $${returnParam.name} as needed

    return $${returnParam.name};
}
\`\`\`

`;
}

/**
 * Process all hook files and enhance them
 */
function enhanceAllHooks(hooksData) {
  let enhanced = 0;
  const docsDir = path.join(PROJECT_ROOT, 'docs');

  for (const hook of hooksData.hooks) {
    const hookFile = path.join(
      docsDir,
      hook.product,
      `${hook.type}s`,
      `${hook.id}.md`
    );

    if (fs.existsSync(hookFile)) {
      if (enhanceHookFile(hookFile, hook)) {
        enhanced++;
      }
    }
  }

  return enhanced;
}

/**
 * Main function
 */
async function main() {
  log('\n📚 Enhancing Documentation for LLM Consumption\n', colors.bright);

  // Step 1: Collect all hooks data
  log('▶ Collecting hooks data...', colors.cyan);
  const hooksData = collectAllHooks();
  log(`  Found ${hooksData.stats.totalHooks} hooks across ${hooksData.stats.productCount} products`, colors.green);

  // Step 2: Write per-product JSON files (primary method for LLMs)
  log('\n▶ Generating per-product JSON APIs...', colors.cyan);
  const apiDir = path.join(PROJECT_ROOT, 'static', 'api');
  const hooksDir = path.join(apiDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Create individual product JSON files
  for (const [productId, productInfo] of Object.entries(hooksData.products)) {
    const productHooks = hooksData.hooks.filter(h => h.product === productId);
    const productData = {
      generated: hooksData.generated,
      product: productInfo,
      hooks: productHooks,
      stats: {
        total: productHooks.length,
        actions: productHooks.filter(h => h.type === 'action').length,
        filters: productHooks.filter(h => h.type === 'filter').length,
      },
    };

    const productJsonPath = path.join(hooksDir, `${productId}.json`);
    fs.writeFileSync(productJsonPath, JSON.stringify(productData, null, 2));
  }
  log(`  Created: static/api/hooks/{product}.json (${Object.keys(hooksData.products).length} files)`, colors.green);

  // Step 3: Create index.json with product list and stats (lightweight)
  const indexData = {
    generated: hooksData.generated,
    version: '1.0',
    baseUrl: '/api/hooks/',
    stats: hooksData.stats,
    products: Object.entries(hooksData.products).map(([id, info]) => ({
      id,
      label: info.label,
      repo: info.repo,
      actions: info.actions.length,
      filters: info.filters.length,
      total: info.actions.length + info.filters.length,
      url: `/api/hooks/${id}.json`,
    })),
  };

  const indexJsonPath = path.join(hooksDir, 'index.json');
  fs.writeFileSync(indexJsonPath, JSON.stringify(indexData, null, 2));
  log(`  Created: static/api/hooks/index.json (product directory)`, colors.green);

  // Step 4: Keep full hooks.json for backward compatibility but note it's large
  const hooksJsonPath = path.join(apiDir, 'hooks.json');
  fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksData, null, 2));
  const sizeKB = Math.round(fs.statSync(hooksJsonPath).size / 1024);
  log(`  Created: static/api/hooks.json (${sizeKB}KB - use per-product files instead)`, colors.yellow);

  // Step 5: Create a compact version for quick lookups
  const compactHooks = {
    generated: hooksData.generated,
    hooks: hooksData.hooks.map(h => ({
      n: h.name,           // name
      t: h.type[0],        // type: 'a' or 'f'
      p: h.product,        // product
      d: h.description,    // description
      u: h.url,            // url
    })),
  };

  const compactJsonPath = path.join(apiDir, 'hooks-compact.json');
  fs.writeFileSync(compactJsonPath, JSON.stringify(compactHooks));
  log(`  Created: static/api/hooks-compact.json`, colors.green);

  // Step 4: Enhance individual hook files with examples
  log('\n▶ Adding usage examples to hook documentation...', colors.cyan);
  const enhanced = enhanceAllHooks(hooksData);
  log(`  Enhanced ${enhanced} hook files with usage examples`, colors.green);

  // Step 5: Update llms.txt with stats
  log('\n▶ Updating llms.txt...', colors.cyan);
  const llmsPath = path.join(PROJECT_ROOT, 'static', 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    let llmsContent = fs.readFileSync(llmsPath, 'utf8');

    // Add/update stats section
    const statsSection = `
## Statistics (Auto-Updated)

- **Total Hooks:** ${hooksData.stats.totalHooks}
- **Actions:** ${hooksData.stats.totalActions}
- **Filters:** ${hooksData.stats.totalFilters}
- **Products:** ${hooksData.stats.productCount}
- **Last Updated:** ${new Date().toISOString().split('T')[0]}
`;

    // Replace or append stats
    if (llmsContent.includes('## Statistics (Auto-Updated)')) {
      llmsContent = llmsContent.replace(
        /## Statistics \(Auto-Updated\)[\s\S]*?(?=\n##|$)/,
        statsSection
      );
    } else {
      llmsContent += '\n' + statsSection;
    }

    fs.writeFileSync(llmsPath, llmsContent);
    log(`  Updated: static/llms.txt`, colors.green);
  }

  // Summary
  log('\n✅ LLM Enhancement Complete!\n', colors.bright + colors.green);
  log('Files created/updated:', colors.yellow);
  log('  • static/api/hooks/index.json - Product directory (lightweight)');
  log('  • static/api/hooks/{product}.json - Per-product hooks (25 files)');
  log('  • static/api/hooks.json - Full database (large, use per-product instead)');
  log('  • static/api/hooks-compact.json - Compact version for quick lookups');
  log('  • static/llms.txt - LLM context file with updated stats');
  log(`  • ${enhanced} hook files enhanced with usage examples\n`);

  log('Recommended usage:', colors.cyan);
  log('  1. Fetch /api/hooks/index.json to discover products');
  log('  2. Fetch /api/hooks/{product}.json for specific product hooks');
  log('  3. Use /llms.txt for AI assistant context\n');

  return 0;
}

process.exit(await main());

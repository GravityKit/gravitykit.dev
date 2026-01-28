#!/usr/bin/env node

/**
 * Generate Per-Product llms.txt Files
 *
 * Creates comprehensive llms.txt files for each product that include:
 * - Product overview and capabilities
 * - Top 10-15 most commonly used hooks with full examples
 * - Hooks organized by use case
 * - Common integration patterns
 * - Hook naming conventions and best practices
 *
 * Usage:
 *   node scripts/generate-product-llms.mjs
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
 * Generate a code example for a hook
 */
function generateHookExample(hook) {
  const params = hook.parameters || [];
  const paramList = params.map(p => `$${p.name}`).join(', ');
  const paramCount = params.length;

  if (hook.type === 'action') {
    return `\`\`\`php
add_action( '${hook.name}', function(${paramList}) {
    // Your code here
}${paramCount > 0 ? `, 10, ${paramCount}` : ''} );
\`\`\``;
  } else {
    const returnVar = params[0]?.name || 'value';
    return `\`\`\`php
add_filter( '${hook.name}', function(${paramList}) {
    // Modify $${returnVar} as needed
    return $${returnVar};
}${paramCount > 0 ? `, 10, ${paramCount}` : ''} );
\`\`\``;
  }
}

/**
 * Format parameters for display
 */
function formatParameters(hook) {
  const params = hook.parameters || [];
  if (params.length === 0) return 'None';

  return params.map(p => {
    const typeStr = p.type ? `(${p.type})` : '';
    return `\`$${p.name}\` ${typeStr}`;
  }).join(', ');
}

/**
 * Group hooks by category
 */
function groupHooksByCategory(hooks) {
  const groups = {};

  for (const hook of hooks) {
    const categories = hook.categories || ['general'];
    for (const category of categories) {
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(hook);
    }
  }

  return groups;
}

/**
 * Get category display name
 */
function getCategoryDisplayName(category) {
  const names = {
    'entries': 'Data & Entries',
    'fields': 'Field Customization',
    'search': 'Search & Filtering',
    'rendering': 'Display & Rendering',
    'editing': 'Entry Editing',
    'views': 'Views & Templates',
    'forms': 'Form Integration',
    'widgets': 'Widgets & Shortcodes',
    'export': 'Export & Output',
    'import': 'Import & Data Loading',
    'calendar': 'Calendar & Events',
    'charts': 'Charts & Visualization',
    'maps': 'Maps & Location',
    'kanban': 'Board & Kanban',
    'approval': 'Approval Workflows',
    'notifications': 'Notifications & Email',
    'permissions': 'Permissions & Access',
    'admin': 'Admin Interface',
    'frontend': 'Frontend Output',
    'api': 'API & REST',
    'shortcodes': 'Shortcodes',
    'assets': 'Assets & Scripts',
    'caching': 'Cache & Performance',
    'general': 'General'
  };

  return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Generate llms.txt content for a product
 */
function generateProductLLMSTxt(productData) {
  const { product, hooks, stats } = productData;

  // If no hooks, return minimal template
  if (!hooks || hooks.length === 0) {
    return `# ${product.label} - Developer Documentation

> Hooks documentation for ${product.label}

## Quick Stats

- **Total Hooks:** 0
- **Repository:** ${product.repo}
${product.version ? `- **Version:** ${product.version}\n` : ''}- **Hooks JSON:** \`/api/hooks/${product.id}.json\`
- **Relations JSON:** \`/relations/${product.id}.json\` (class relationships for code understanding)
- **Documentation:** \`/docs/${product.id}/\`

## Status

This product currently has no documented hooks. Hooks documentation will be added as they become available.

## Related Resources

- **Full Hook List:** \`/docs/${product.id}/actions/\` and \`/docs/${product.id}/filters/\`
- **Hooks JSON:** \`/api/hooks/${product.id}.json\`
- **Relations JSON:** \`/relations/${product.id}.json\`
- **Support:** https://www.gravitykit.com/support/
- **GitHub:** https://github.com/${product.repo}

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
  }

  // Get top hooks (most commonly used based on categories and naming patterns)
  const topHooks = hooks
    .slice()
    .sort((a, b) => {
      // Prioritize hooks with more categories (more versatile)
      const aCats = (a.categories || []).length;
      const bCats = (b.categories || []).length;
      if (aCats !== bCats) return bCats - aCats;

      // Prioritize shorter names (typically more fundamental)
      return a.name.length - b.name.length;
    })
    .slice(0, 10);

  // Group hooks by category
  const categoryGroups = groupHooksByCategory(hooks);

  // Sort categories by hook count
  const sortedCategories = Object.entries(categoryGroups)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 8); // Top 8 categories

  let content = `# ${product.label} - Developer Documentation

> Hooks documentation for ${product.label}

## Quick Stats

- **Total Hooks:** ${stats.total} (${stats.actions} actions, ${stats.filters} filters)
- **Repository:** ${product.repo}
${product.version ? `- **Version:** ${product.version}\n` : ''}- **Hooks JSON:** \`/api/hooks/${product.id}.json\`
- **Relations JSON:** \`/relations/${product.id}.json\` (class relationships for code understanding)
- **Documentation:** \`/docs/${product.id}/\`

## What You Can Do

This documentation helps you customize ${product.label} by hooking into its actions and filters:

- **Modify Output** - Change how data and fields display
- **Extend Functionality** - Add custom features and integrate with other systems
- **Control Behavior** - Customize queries, permissions, and workflows
- **Integrate Systems** - Connect with external APIs, databases, and services

## Most Commonly Used Hooks

These are the hooks you'll use most often when customizing ${product.label}:

`;

  // Add top hooks with examples
  for (const hook of topHooks) {
    content += `### \`${hook.name}\` (${hook.type})

${hook.description}

**Parameters:** ${formatParameters(hook)}

${generateHookExample(hook)}

`;
  }

  // Add hooks organized by use case
  content += `## Hooks by Use Case

Common customization scenarios organized by category:

`;

  for (const [category, categoryHooks] of sortedCategories) {
    content += `### ${getCategoryDisplayName(category)}

`;

    // List top 5 hooks per category
    const topCategoryHooks = categoryHooks.slice(0, 5);
    for (const hook of topCategoryHooks) {
      content += `- **\`${hook.name}\`** - ${hook.description}
`;
    }

    content += '\n';
  }

  // Add common patterns
  content += `## Common Integration Patterns

### Pattern 1: Modify Output

Most customizations involve changing how data displays:

\`\`\`php
// Example: Add custom HTML to output
add_filter( 'hook_name', function( $output, $data ) {
    // Modify $output based on conditions
    if ( $data['type'] === 'custom' ) {
        $output = '<div class="custom-wrapper">' . $output . '</div>';
    }
    return $output;
}, 10, 2 );
\`\`\`

### Pattern 2: Add Custom Functionality

Execute custom code at specific points:

\`\`\`php
// Example: Trigger action when something happens
add_action( 'hook_name', function( $data ) {
    // Log, track analytics, sync data, etc.
    error_log( 'Custom action triggered' );
    do_action( 'my_custom_action', $data );
}, 10, 1 );
\`\`\`

## Finding the Right Hook

1. **Browse by Category** - Use the grouped sections above to find hooks for your use case
2. **Search Documentation** - Visit \`/docs/${product.id}/\` to search all hooks
3. **Use JSON API** - Fetch \`/api/hooks/${product.id}.json\` for programmatic access
4. **Check Related Hooks** - Most hooks have "related" hooks listed in their documentation

## Hook Naming Patterns

Understanding ${product.label} hook naming helps you find what you need:

- \`product/.../\` - Modern namespaced hooks (preferred)
- \`product_...\` - Legacy underscore hooks (still supported)
- \`.../before_...\` - Fires before an action (preparation, validation)
- \`.../after_...\` - Fires after an action (cleanup, logging)

## Class Relationship Graph

For deep code understanding, fetch \`/relations/${product.id}.json\` which contains:

- **extends** - Parent class inheritance
- **implements** - Interface implementations
- **uses** - Trait usage
- **dependencies** - Constructor/method type-hinted dependencies
- **instantiates** - Classes created via \`new\`
- **staticCalls** - Static method calls to other classes
- **usedBy** - Reverse lookup (what uses this class)

This graph enables understanding ${product.label}'s architecture without direct code access.

## Pro Tips for AI Assistants

When helping developers with ${product.label}:

1. **Check Hook Type** - Actions for side effects, filters for modifying data
2. **Verify Parameters** - Ensure all required parameters are used correctly
3. **Consider Priority** - Default priority is 10; adjust if needed for execution order
4. **Note Dynamic Parts** - Hooks with \`{variable}\` require substitution
5. **Check Related Hooks** - Often multiple hooks work together for complete solutions
6. **Validate Syntax** - Ensure proper PHP syntax and WordPress hook patterns
7. **Test Safely** - Always test hooks in development before production

## Additional Resources

- **Full Hook List:** \`/docs/${product.id}/actions/\` and \`/docs/${product.id}/filters/\`
- **Hooks JSON:** \`/api/hooks/${product.id}.json\`
- **Relations JSON:** \`/relations/${product.id}.json\`
- **Support:** https://www.gravitykit.com/support/
- **GitHub:** https://github.com/${product.repo}

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
*Total hooks documented: ${stats.total}*
`;

  return content;
}

/**
 * Main entry point
 */
async function main() {
  log('\n📝 Generating Per-Product llms.txt Files\n', colors.bright);

  const hooksDir = path.join(PROJECT_ROOT, 'static', 'api', 'hooks');
  const docsDir = path.join(PROJECT_ROOT, 'docs');
  const staticDocsDir = path.join(PROJECT_ROOT, 'static', 'docs');

  // Read hooks index to get product list
  const indexPath = path.join(hooksDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    log('❌ Hooks index not found. Run npm run llm:enhance first.', colors.yellow);
    return 1;
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  log(`▶ Found ${index.products.length} products to process`, colors.cyan);

  let generated = 0;
  let skipped = 0;

  for (const productSummary of index.products) {
    const productJsonPath = path.join(hooksDir, `${productSummary.id}.json`);

    if (!fs.existsSync(productJsonPath)) {
      log(`  ⚠️  Skipping ${productSummary.id} - JSON not found`, colors.yellow);
      skipped++;
      continue;
    }

    // Read product hooks data
    const productData = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));

    // Generate llms.txt content
    const content = generateProductLLMSTxt(productData);

    // Write to both docs and static/docs directories
    const docsPaths = [
      path.join(docsDir, productSummary.id, 'llms.txt'),
      path.join(staticDocsDir, productSummary.id, 'llms.txt'),
    ];

    for (const llmsPath of docsPaths) {
      const dir = path.dirname(llmsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(llmsPath, content);
    }

    log(`  ✅ Generated ${productSummary.id} (${productData.stats.total} hooks)`, colors.green);
    generated++;
  }

  log(`\n✅ Generated ${generated} llms.txt files`, colors.bright + colors.green);
  if (skipped > 0) {
    log(`⚠️  Skipped ${skipped} products`, colors.yellow);
  }

  return 0;
}

process.exit(await main());

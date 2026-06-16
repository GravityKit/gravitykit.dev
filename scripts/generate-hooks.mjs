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
 *   - Dependencies installed: npm install
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
 * Load a template file.
 * @param {string} name
 * @returns {string}
 */
function loadTemplate(name) {
  const templatePath = path.join(TEMPLATES_DIR, `${name}.md`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Render a template with variables.
 * Supports {{variable}} and {{#condition}}...{{/condition}} blocks.
 * @param {string} template
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
  let result = template;

  // Handle conditional blocks: {{#condition}}...{{/condition}}
  // Process repeatedly to handle nested conditionals
  let prevResult;
  do {
    prevResult = result;
    result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, key, content) => {
      return vars[key] ? content : '';
    });
  } while (result !== prevResult);

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

/**
 * Log a message with optional ANSI color.
 * @param {string} message
 * @param {string} [color]
 * @returns {void}
 */
function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Log an informational message.
 * @param {string} message
 * @returns {void}
 */
function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

/**
 * Log a success message.
 * @param {string} message
 * @returns {void}
 */
function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

/**
 * Log a warning message.
 * @param {string} message
 * @returns {void}
 */
function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

/**
 * Log an error message.
 * @param {string} message
 * @returns {void}
 */
function logError(message) {
  log(`❌ ${message}`, colors.red);
}

/**
 * Log a step heading.
 * @param {string} message
 * @returns {void}
 */
function logStep(message) {
  log(`\n${colors.bright}▶ ${message}${colors.reset}`);
}

/**
 * Load configuration from repos-config.json.
 * @returns {object}
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
 * Check if wp-hooks-documentor is available (via npx for local install).
 * @returns {boolean}
 */
function checkWpHooksDocumentor() {
  // Try running via npx which finds locally installed packages
  const result = spawnSync('npx', ['wp-hooks-documentor', '--help'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  // If no error running the command, the tool is available
  if (!result.error && result.status === 0) {
    return true;
  }
  return false;
}

/**
 * Copy a directory recursively.
 * @param {string} src
 * @param {string} dest
 * @returns {void}
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
 * Copy hooks directory to destination, preserving API subdirectory.
 * @param {string} src - Source hooks directory
 * @param {string} dest - Destination product directory
 * @returns {void}
 */
function copyHooksPreservingApi(src, dest) {
  if (!fs.existsSync(src)) return;

  // Ensure destination directory exists
  fs.mkdirSync(dest, { recursive: true });

  // Only delete actions and filters directories (preserve API and other dirs)
  const actionsDir = path.join(dest, 'actions');
  const filtersDir = path.join(dest, 'filters');
  const actionsUpperDir = path.join(dest, 'Actions');
  const filtersUpperDir = path.join(dest, 'Filters');

  // Clean up existing hooks directories (both cases)
  if (fs.existsSync(actionsDir)) fs.rmSync(actionsDir, { recursive: true, force: true });
  if (fs.existsSync(filtersDir)) fs.rmSync(filtersDir, { recursive: true, force: true });
  if (fs.existsSync(actionsUpperDir)) fs.rmSync(actionsUpperDir, { recursive: true, force: true });
  if (fs.existsSync(filtersUpperDir)) fs.rmSync(filtersUpperDir, { recursive: true, force: true });

  // Copy hooks content from source
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip if this would overwrite the api directory
    if (entry.name.toLowerCase() === 'api') continue;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Delete a directory recursively.
 * @param {string} dir
 * @returns {void}
 */
function deleteDirRecursive(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Generate a _category_.json file for Docusaurus sidebar ordering.
 * Only generates if directory exists and has content.
 * @param {string} dir
 * @param {string} label
 * @param {number} position
 * @returns {void}
 */
function generateCategoryJson(dir, label, position) {
  if (!fs.existsSync(dir)) {
    return;
  }

  // Check if directory has any markdown files (excluding index.md)
  const hasContent = fs.readdirSync(dir).some(f => f.endsWith('.md') && f !== 'index.md');
  if (!hasContent) {
    // Remove empty directory
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }

  const categoryPath = path.join(dir, '_category_.json');
  const category = {
    label,
    position,
  };

  fs.writeFileSync(categoryPath, JSON.stringify(category, null, 2) + '\n');
}

/**
 * Rename a directory to lowercase if it exists.
 * @param {string} dir
 * @param {string} name
 * @returns {void}
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
 * Add tags to hook markdown files based on @since versions.
 * Also converts the Since section to link to the tag pages.
 * @param {string} outputDir
 * @returns {void}
 */
function addTagsToHooks(outputDir) {
  const dirs = ['actions', 'filters'];

  for (const subdir of dirs) {
    const dirPath = path.join(outputDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'index.md');

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      let content = fs.readFileSync(filePath, 'utf8');

      // Extract @since versions from the "### Since" section
      const sinceMatch = content.match(/### Since\n\n((?:- .+\n?)+)/);
      const tags = [];

      if (sinceMatch) {
        // Extract all versions (handles multiple "- version" lines)
        const versions = sinceMatch[1].match(/- ([^\n]+)/g);
        if (versions) {
          for (const v of versions) {
            let version = v.replace(/^- /, '').trim();
            // Skip versions with @link tags
            if (version.includes('{@link')) continue;
            // Extract just the version number (e.g., "1.18: Added feature" -> "1.18")
            const versionMatch = version.match(/^([\d.]+)/);
            if (versionMatch) {
              tags.push(versionMatch[1]);
            }
          }
        }

        // Convert Since section to use links to tag pages
        // Replace "- 1.0" with "- [1.0](../../since/1-0/)"
        // Path is ../../ because docs are in actions/ or filters/ subdirs
        let newSinceSection = sinceMatch[0];
        for (const tag of tags) {
          const tagSlug = tag.replace(/\./g, '-');
          newSinceSection = newSinceSection.replace(
            new RegExp(`- ${tag.replace(/\./g, '\\.')}(?!\\])`, 'g'),
            `- [${tag}](../../since/${tagSlug}/)`
          );
        }
        content = content.replace(sinceMatch[0], newSinceSection);
      }

      // Add tags to frontmatter if we have any
      if (tags.length > 0) {
        const tagsYaml = `tags:\n${tags.map(t => `  - "${t}"`).join('\n')}`;

        // Insert tags into frontmatter (before the closing ---)
        if (content.match(/^---\n[\s\S]*?\n---/)) {
          content = content.replace(/^(---\n[\s\S]*?)(---)/, `$1${tagsYaml}\n$2`);
        }
      }

      fs.writeFileSync(filePath, content);
    }
  }
}

/**
 * Clean up malformed content in hook markdown files.
 * Fixes:
 * - description frontmatter with @filter/@action prefix (strips prefix, keeps description)
 * - description frontmatter with \b word boundaries (removes them)
 * - Malformed "See Also" entries
 * @param {string} outputDir
 * @returns {void}
 */
function cleanupHookContent(outputDir) {
  const dirs = ['actions', 'filters'];

  for (const subdir of dirs) {
    const dirPath = path.join(outputDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'index.md');

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;

      // Fix description field with @filter/@action prefix
      // Pattern: description: "@filter  `hook_name` Actual description here"
      // Should become: description: "Actual description here"
      const descPatternWithTag = /^(description:\s*"?)@(?:filter|action)\s+`[^`]+`\s*/m;
      if (descPatternWithTag.test(content)) {
        content = content.replace(descPatternWithTag, '$1');
        modified = true;
      }

      // Fix description field with \b word boundaries
      // Pattern: description: "\bDocumentation\b \bfor\b..."
      // Should become: description: "Documentation for..."
      if (content.includes('\\b')) {
        content = content.replace(/\\b([^\\]+)\\b/g, '$1');
        modified = true;
      }

      // Fix malformed See Also entries like: - `The` - <code>hook_name</code> filter
      // Should become: - `hook_name`
      const seeAlsoPattern = /^-\s+`The`\s+-\s+<code>([^<]+)<\/code>(?:\s+filter)?$/gm;
      if (seeAlsoPattern.test(content)) {
        content = content.replace(seeAlsoPattern, '- `$1`');
        modified = true;
      }

      // Fix double-escaped type shapes inside inline code spans.
      // wp-hooks-documentor HTML-escapes `<`/`>` and wraps types in backticks
      // (e.g. `array&lt;string,bool&gt;`). Markdown/MDX renders inline-code content
      // literally — it does NOT decode entities — so the page shows the raw
      // "array&lt;string,bool&gt;" instead of "array<string,bool>". Decode the
      // entities INSIDE inline code spans only: prose outside backticks (e.g.
      // "name =&gt; value") must stay escaped, and fenced ``` blocks are skipped.
      // (API class docs use real <code> tags, where &lt; is correct — untouched.)
      if (/`[^`\n]*&(?:lt|gt|amp);/.test(content)) {
        const lines = content.split('\n');
        let inFence = false;
        let changedSpans = false;
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
          if (inFence) continue;
          const next = lines[i].replace(/`([^`\n]+)`/g, (_m, inner) =>
            '`' + inner.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '`'
          );
          if (next !== lines[i]) { lines[i] = next; changedSpans = true; }
        }
        if (changedSpans) {
          content = lines.join('\n');
          modified = true;
        }
      }

      // Fix @example blocks where wp-hooks-documentor peeled a leading code
      // COMMENT out of the example and rendered it as prose above the ```php
      // fence. Its example parser (hook-collector.js) treats any text before the
      // first add_filter/add_action/apply_filters/do_action/function as a
      // "description", which wrongly captures leading `//` comments. Move those
      // comment lines back inside the fence as the first code lines. Idempotent:
      // once the comment is inside the fence this no longer matches.
      {
        const exampleCommentRe = /(^#{2,3} (?:Examples?|Example \d+)[^\n]*\n)(?:[ \t]*\n)*((?:[ \t]*\/\/[^\n]*\n)+)(?:[ \t]*\n)*(^```php[^\n]*\n)/gm;
        const before = content;
        content = content.replace(exampleCommentRe, (_m, heading, comments, fence) => heading + '\n' + fence + comments);
        if (content !== before) {
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
      }
    }
  }
}

/**
 * Load type links configuration.
 * @returns {Record<string, string>}
 */
function loadTypeLinks() {
  const typeLinksPath = path.join(PROJECT_ROOT, 'type-links.json');
  if (!fs.existsSync(typeLinksPath)) {
    return {};
  }
  try {
    const config = JSON.parse(fs.readFileSync(typeLinksPath, 'utf8'));
    return config.types || {};
  } catch (err) {
    console.warn('Warning: Could not parse type-links.json:', err.message);
    return {};
  }
}

/**
 * Link parameter types in hook markdown files to their documentation.
 * Converts `GF_Field_Address` or `\\GF_Field_Address` to linked versions.
 * @param {string} outputDir
 * @returns {void}
 */
function linkParameterTypes(outputDir) {
  const typeLinks = loadTypeLinks();
  if (Object.keys(typeLinks).length === 0) return;

  const dirs = ['actions', 'filters'];

  for (const subdir of dirs) {
    const dirPath = path.join(outputDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'index.md');

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;

      // Process each type in the configuration
      for (const [typeName, url] of Object.entries(typeLinks)) {
        // Match `TypeName` or `\TypeName` in parameter tables
        // The backticks indicate it's a type in the markdown table
        // Capture the optional backslash to preserve it in the output
        const pattern = new RegExp('`(\\\\?)' + escapeRegExp(typeName) + '`', 'g');

        if (pattern.test(content)) {
          // Reset lastIndex after test() for replace() to work correctly
          pattern.lastIndex = 0;
          // Replace with linked version, preserving the original format (with or without backslash)
          content = content.replace(pattern, (match, backslash) => {
            return `[\`${backslash}${typeName}\`](${url})`;
          });
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
      }
    }
  }
}

/**
 * Ensure there is a blank line before headings.
 * @param {string} outputDir
 * @returns {void}
 */
function ensureSourceHeadingSpacing(outputDir) {
  const dirs = ['actions', 'filters'];

  for (const subdir of dirs) {
    const dirPath = path.join(outputDir, subdir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith('.md') && file !== 'index.md');

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf8');

      const updated = content.replace(
        /([^\n])\n(#{2,3}\s+Source)/g,
        '$1\n\n$2'
      );

      if (updated !== content) {
        fs.writeFileSync(filePath, updated);
      }
    }
  }
}

/**
 * Remove empty heading sections from hook markdown files.
 * @param {string} outputDir
 * @returns {void}
 */
function removeEmptySections(outputDir) {
  const dirs = ['actions', 'filters', 'Actions', 'Filters'];
  const headingRe = /^(#{2,6})\s+(.+?)\s*$/;

  for (const subdir of dirs) {
    const dirPath = path.join(outputDir, subdir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((file) => (file.endsWith('.md') || file.endsWith('.mdx')) && file !== 'index.md');

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const endsWithNewline = content.endsWith('\n');
      const lines = content.split(/\r?\n/);
      const output = [];
      let changed = false;
      let i = 0;

      while (i < lines.length) {
        const match = headingRe.exec(lines[i]);
        if (!match) {
          output.push(lines[i]);
          i += 1;
          continue;
        }

        const level = match[1].length;
        let j = i + 1;

        while (j < lines.length) {
          const nextMatch = headingRe.exec(lines[j]);
          if (nextMatch && nextMatch[1].length <= level) {
            break;
          }
          j += 1;
        }

        const sectionLines = lines.slice(i + 1, j);
        const isEmpty = sectionLines.every((line) => line.trim() === '');

        if (isEmpty) {
          changed = true;
          i = j;
          continue;
        }

        output.push(lines[i], ...sectionLines);
        i = j;
      }

      if (changed) {
        let nextContent = output.join('\n');
        if (endsWithNewline && !nextContent.endsWith('\n')) {
          nextContent += '\n';
        }
        if (nextContent !== content) {
          fs.writeFileSync(filePath, nextContent);
        }
      }
    }
  }
}

/**
 * Escape special regex characters in a string.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run wp-hooks-documentor for a product.
 * @param {object} product
 * @param {object} config
 * @param {object} options
 * @returns {{ok: boolean, id: string, reason?: string, action?: string}}
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
      // Replace slashes with dashes in hook IDs for cleaner URLs
      hookIdSlashReplacement: '-',
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

    // Run wp-hooks-documentor via npx from the temp directory
    const result = spawnSync('npx', ['wp-hooks-documentor', 'generate', '--skip-build'], {
      cwd: tempWorkDir,
      stdio: 'inherit',
      shell: false,
    });

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        return {
          ok: false,
          id: product.id,
          reason: 'wp-hooks-documentor not found. Run: npm install',
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
        // Copy from alternative location, preserving API directory
        copyHooksPreservingApi(altHooksDir, finalOutputDir);
      } else {
        return {
          ok: false,
          id: product.id,
          reason: 'No hooks documentation was generated',
        };
      }
    } else {
      // Copy generated hooks to final location, preserving API directory
      copyHooksPreservingApi(generatedHooksDir, finalOutputDir);
    }

    // Rename Actions/Filters to lowercase for cleaner URLs
    lowercaseDirectory(finalOutputDir, 'Actions');
    lowercaseDirectory(finalOutputDir, 'Filters');

    // Add tags to hook files based on @since versions
    addTagsToHooks(finalOutputDir);

    // Clean up malformed content from wp-hooks-documentor
    cleanupHookContent(finalOutputDir);

    // Link parameter types to their documentation
    linkParameterTypes(finalOutputDir);

    // Normalize spacing before "### Source" headings
    ensureSourceHeadingSpacing(finalOutputDir);

    // Remove empty sections like "## Returns" with no content
    removeEmptySections(finalOutputDir);

    // Generate index.md for the product and subdirectories
    generateProductIndex(product, finalOutputDir);
    generateActionsIndex(product, finalOutputDir);
    generateFiltersIndex(product, finalOutputDir);

    // Generate _category_.json files to control sidebar ordering
    generateCategoryJson(path.join(finalOutputDir, 'actions'), 'Actions', 2);
    generateCategoryJson(path.join(finalOutputDir, 'filters'), 'Filters', 3);

    return { ok: true, id: product.id, action: 'generated' };
  } finally {
    // Clean up temp directory
    deleteDirRecursive(tempWorkDir);
  }
}

/**
 * Generate an index.md file for a product's documentation.
 * @param {object} product
 * @param {string} outputDir
 * @returns {void}
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

  // Check for API documentation
  const apiClassesDir = path.join(outputDir, 'api', 'classes');
  const apiFunctionsDir = path.join(outputDir, 'api', 'functions');

  const hasClasses = fs.existsSync(apiClassesDir) && fs.readdirSync(apiClassesDir).filter(f => f.endsWith('.md')).length > 0;
  const hasFunctions = fs.existsSync(apiFunctionsDir) && fs.readdirSync(apiFunctionsDir).filter(f => f.endsWith('.md')).length > 0;
  const hasApi = hasClasses || hasFunctions;

  const classCount = hasClasses ? fs.readdirSync(apiClassesDir).filter(f => f.endsWith('.md')).length : 0;
  const functionCount = hasFunctions ? fs.readdirSync(apiFunctionsDir).filter(f => f.endsWith('.md')).length : 0;

  const template = loadTemplate('product-index');
  const content = renderTemplate(template, {
    label: product.label,
    repo: product.repo,
    totalHooks: actionCount + filterCount,
    actionCount,
    filterCount,
    hasActions,
    hasFilters,
    hasApi,
    classCount,
    functionCount,
    hasFunctions,
  });

  fs.writeFileSync(indexPath, content);
}

/**
 * Extract sidebar_label from a markdown file's frontmatter.
 * @param {string} filePath
 * @returns {string|null}
 */
function getHookLabel(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/sidebar_label:\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get hook info (filename and display label) from a directory.
 * @param {string} dir
 * @returns {Array<{filename: string, label: string}>}
 */
function getHooksFromDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => {
      const filename = f.replace('.md', '');
      const label = getHookLabel(path.join(dir, f)) || filename;
      return { filename, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Generate an index.md file for the actions subdirectory.
 * @param {object} product
 * @param {string} outputDir
 * @returns {void}
 */
function generateActionsIndex(product, outputDir) {
  const actionsDir = path.join(outputDir, 'actions');
  const hooks = getHooksFromDir(actionsDir);

  if (hooks.length === 0) {
    return;
  }

  const hookList = hooks
    .map(h => `- [${h.label}](./${h.filename}.md)`)
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
 * Generate an index.md file for the filters subdirectory.
 * @param {object} product
 * @param {string} outputDir
 * @returns {void}
 */
function generateFiltersIndex(product, outputDir) {
  const filtersDir = path.join(outputDir, 'filters');
  const hooks = getHooksFromDir(filtersDir);

  if (hooks.length === 0) {
    return;
  }

  const hookList = hooks
    .map(h => `- [${h.label}](./${h.filename}.md)`)
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
 * Generate main hooks index page.
 * @param {object} config
 * @param {Array<{ok: boolean, id: string, action?: string}>} results
 * @returns {void}
 */
function generateMainIndex(config, results) {
  const outputDir = path.resolve(PROJECT_ROOT, config.outputDir);
  const indexPath = path.join(outputDir, 'index.md');

  const successfulProducts = results
    .filter((r) => r.ok && r.action === 'generated')
    .map((r) => config.products.find((p) => p.id === r.id))
    .filter(Boolean);

  if (successfulProducts.length === 0) {
    const template = loadTemplate('main-index');
    const content = renderTemplate(template, {
      productList: '_No products generated yet. Run `npm run hooks:generate` to generate documentation._',
    });
    fs.writeFileSync(indexPath, content);
    return;
  }

  // Group products by category
  const categories = config.categories || {};
  const productsByCategory = {};

  successfulProducts.forEach((p) => {
    const cat = p.category || 'other';
    if (!productsByCategory[cat]) {
      productsByCategory[cat] = [];
    }
    productsByCategory[cat].push(p);
  });

  // Sort categories: parent categories first by position, then their children by position
  const allCats = Object.keys(productsByCategory)
    .map((catId) => ({
      id: catId,
      ...categories[catId],
      products: productsByCategory[catId],
    }));

  // Separate top-level and child categories
  const topLevel = allCats.filter((c) => !c.parent);
  const children = allCats.filter((c) => c.parent);

  // Sort top-level by position
  topLevel.sort((a, b) => (a.position || 99) - (b.position || 99));

  // Build sorted list: for each top-level, insert its children after it
  const sortedCategories = [];
  topLevel.forEach((cat) => {
    sortedCategories.push(cat);
    // Find children of this category and sort them by position
    const catChildren = children
      .filter((c) => c.parent === cat.id)
      .sort((a, b) => (a.position || 99) - (b.position || 99));
    sortedCategories.push(...catChildren);
  });

  // Build product list with category headers
  const productListParts = [];

  sortedCategories.forEach((cat) => {
    // Add category header
    if (cat.label) {
      productListParts.push(`\n### ${cat.label}\n`);
    }

    // Sort products alphabetically within category
    const sortedProducts = cat.products.sort((a, b) => a.label.localeCompare(b.label));

    sortedProducts.forEach((p) => {
      productListParts.push(`- [${p.label}](./${p.id}/)`);
    });
  });

  const productList = productListParts.join('\n');

  const template = loadTemplate('main-index');
  const content = renderTemplate(template, {
    productList,
  });

  fs.writeFileSync(indexPath, content);
}

/**
 * Parse command line arguments.
 * @param {string[]} args
 * @returns {{product: string|null, dryRun: boolean, help: boolean, list: boolean}}
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
 * Print help message.
 * @returns {void}
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
  1. Install dependencies: npm install
  2. Clone repositories: npm run repos:clone

${colors.cyan}Output:${colors.reset}
  Documentation is generated to: ${path.relative(process.cwd(), path.join(PROJECT_ROOT, 'docs/hooks'))}
`);
}

/**
 * Print list of available products.
 * @param {Array<{id: string, label: string}>} products
 * @returns {void}
 */
function printProductList(products) {
  console.log(`
${colors.bright}Available Product IDs${colors.reset}

${products.map((p) => `  ${colors.cyan}${p.id}${colors.reset} → ${p.label}`).join('\n')}

${colors.dim}Use: npm run hooks:generate -- --product <id>${colors.reset}
`);
}

/**
 * Main entry point.
 * @returns {Promise<number>}
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
    logError('wp-hooks-documentor is not installed');
    logInfo('Run: npm install');
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

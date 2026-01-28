#!/usr/bin/env node

/**
 * Generate index.md files for actions and filters directories
 * This enables the ./actions/ and ./filters/ links to work in Docusaurus
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, '..', 'docs');

// Load product config for proper labels
const configPath = path.join(__dirname, '..', 'repos-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const productLabels = new Map(
  (config.products || [])
    .filter(p => p.id && p.label)
    .map(p => [p.id, p.label])
);

/**
 * Find all actions and filters directories (lowercase).
 * @param {string} dir
 * @returns {string[]}
 */
function findCategoryDirs(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'actions' || entry.name === 'filters') {
        results.push(fullPath);
      } else {
        results.push(...findCategoryDirs(fullPath));
      }
    }
  }

  return results;
}

/**
 * Count markdown files in a directory (excluding index.md).
 * @param {string} dir
 * @returns {number}
 */
function countHooks(dir) {
  const files = fs.readdirSync(dir);
  return files.filter(f => f.endsWith('.md') && f !== 'index.md').length;
}

/**
 * Get product name from path using repos-config.json labels.
 * @param {string} dirPath
 * @returns {string}
 */
function getProductName(dirPath) {
  const parts = dirPath.split(path.sep);
  const docsIndex = parts.indexOf('docs');
  if (docsIndex !== -1 && parts[docsIndex + 1]) {
    const productId = parts[docsIndex + 1];
    // Use label from config, fallback to title case
    if (productLabels.has(productId)) {
      return productLabels.get(productId);
    }
    // Fallback: convert slug to title case
    return productId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return 'Unknown Product';
}

/**
 * Generate index.md content.
 * @param {string} dirPath
 * @param {string} category
 * @returns {string}
 */
function generateIndexContent(dirPath, category) {
  const productName = getProductName(dirPath);
  const hookCount = countHooks(dirPath);
  // category is lowercase ('actions' or 'filters')
  const isActions = category === 'actions';
  const hookType = isActions ? 'action' : 'filter';
  const hookTypePlural = isActions ? 'actions' : 'filters';
  // Capitalize for display
  const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
  // Actions at position 2, Filters at position 3 (product index is at 1)
  const sidebarPosition = isActions ? 2 : 3;

  const description = isActions
    ? `Actions allow you to run custom code at specific points during ${productName}'s execution.`
    : `Filters allow you to modify data as it passes through ${productName}.`;

  return `---
sidebar_position: ${sidebarPosition}
title: ${categoryTitle}
description: ${productName} ${hookTypePlural}
---

# ${categoryTitle}

${description}

**Total ${hookTypePlural}:** ${hookCount}

Browse the sidebar to explore all available ${hookTypePlural}.
`;
}

// Main execution
const categoryDirs = findCategoryDirs(docsDir);
let updated = 0;

for (const dir of categoryDirs) {
  const indexPath = path.join(dir, 'index.md');
  const category = path.basename(dir);

  const content = generateIndexContent(dir, category);
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log(`Updated ${indexPath}`);
  updated++;
}

console.log(`\nDone! Updated ${updated} index files.`);

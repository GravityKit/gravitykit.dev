/**
 * Read plugin versions from repository files
 *
 * Extracts version information from WordPress plugin headers in the repos directory.
 *
 * @module read-product-versions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Extract version from WordPress plugin header
 * @param {string} content - Plugin file content
 * @returns {string|null} Version string or null if not found
 */
function extractVersionFromHeader(content) {
  // Look for "Version: X.X.X" in plugin header
  const match = content.match(/^\s*\*\s*Version:\s*(.+)$/mi);
  return match ? match[1].trim() : null;
}

/**
 * Find main plugin file in a repository directory
 * @param {string} repoDir - Path to repository directory
 * @returns {string|null} Path to main plugin file or null if not found
 */
function findMainPluginFile(repoDir) {
  if (!fs.existsSync(repoDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(repoDir);

    // Look for PHP files that contain "Plugin Name:" header
    for (const file of files) {
      if (!file.endsWith('.php')) continue;

      const filePath = path.join(repoDir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if this is a plugin file (has "Plugin Name:" header)
        if (content.includes('Plugin Name:')) {
          return filePath;
        }
      } catch (err) {
        // Skip files we can't read
        continue;
      }
    }
  } catch (err) {
    return null;
  }

  return null;
}

/**
 * Read version for a single product from its repository
 * @param {string} productId - Product ID (directory name in repos/)
 * @param {string} repoName - Repository name (e.g., "GravityKit/GravityView")
 * @returns {string|null} Version string or null if not found
 */
export function readProductVersion(productId, repoName) {
  // Convert repo name to directory name (e.g., "GravityKit/GravityView" -> "GravityView")
  const repoDir = path.join(PROJECT_ROOT, 'repos', repoName.split('/').pop());

  const mainFile = findMainPluginFile(repoDir);
  if (!mainFile) {
    return null;
  }

  try {
    const content = fs.readFileSync(mainFile, 'utf8');
    return extractVersionFromHeader(content);
  } catch (err) {
    return null;
  }
}

/**
 * Read versions for all products from repos-config.json
 * @param {Array} products - Array of product configurations
 * @returns {Map<string, string>} Map of productId -> version
 */
export function readAllProductVersions(products) {
  const versions = new Map();

  for (const product of products) {
    if (!product.id || !product.repo) continue;

    const version = readProductVersion(product.id, product.repo);
    if (version) {
      versions.set(product.id, version);
    }
  }

  return versions;
}

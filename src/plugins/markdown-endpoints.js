import path from 'node:path';
import fs from 'node:fs/promises';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

/**
 * Copy markdown files from a source tree to a target tree.
 * @param {string} sourceDir
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
async function copyMarkdownTree(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyMarkdownTree(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), {recursive: true});
    await fs.copyFile(sourcePath, targetPath);
  }
}

/**
 * Normalize a route segment by trimming leading/trailing slashes.
 * @param {string} value
 * @returns {string}
 */
function normalizeRouteSegment(value) {
  if (!value) {
    return '';
  }

  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Docusaurus plugin to copy markdown files into public routes.
 * @param {import('@docusaurus/types').LoadContext} context
 * @param {{sourceDir?: string, routeBasePath?: string}} [options]
 * @returns {import('@docusaurus/types').Plugin<void>}
 */
export default function markdownEndpointsPlugin(context, options = {}) {
  const sourceDir = options.sourceDir ?? 'docs';
  const routeBasePath = options.routeBasePath ?? 'docs';

  return {
    name: 'markdown-endpoints-plugin',
    async postBuild({outDir}) {
      const sourceDirPath = path.resolve(context.siteDir, sourceDir);

      try {
        await fs.access(sourceDirPath);
      } catch {
        return;
      }

      const baseUrlPath = normalizeRouteSegment(context.siteConfig.baseUrl ?? '/');
      const routeBasePathNormalized = normalizeRouteSegment(routeBasePath);
      const targetDir = path.join(outDir, baseUrlPath, routeBasePathNormalized);

      await copyMarkdownTree(sourceDirPath, targetDir);
    },
  };
}

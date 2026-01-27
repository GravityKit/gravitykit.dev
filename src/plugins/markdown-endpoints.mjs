import path from 'node:path';
import fs from 'node:fs/promises';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

/**
 * Remove empty heading sections from markdown content.
 * @param {string} content
 * @returns {string}
 */
function stripEmptySections(content) {
  const lines = content.split(/\r?\n/);
  const headingPattern = /^(#{2,6})\s+(.+?)\s*$/;
  const lineInfo = [];
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const trimmed = line.trim();
    const isFence = trimmed.startsWith('```') || trimmed.startsWith('~~~');

    if (isFence) {
      const marker = trimmed.startsWith('```') ? '```' : '~~~';
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
      }
    }

    const match = !inFence ? headingPattern.exec(line) : null;
    lineInfo.push({
      isHeading: Boolean(match),
      depth: match ? match[1].length : 0,
    });
  }

  const output = [];
  const endsWithNewline = content.endsWith('\n');
  let index = 0;

  while (index < lines.length) {
    const info = lineInfo[index];

    if (info?.isHeading && info.depth >= 2) {
      let nextIndex = index + 1;

      while (nextIndex < lines.length) {
        const nextInfo = lineInfo[nextIndex];
        if (nextInfo?.isHeading && nextInfo.depth <= info.depth) {
          break;
        }
        nextIndex += 1;
      }

      const sectionLines = lines.slice(index + 1, nextIndex);
      const hasContent = sectionLines.some((line) => line.trim() !== '');

      if (!hasContent) {
        index = nextIndex;
        continue;
      }
    }

    output.push(lines[index]);
    index += 1;
  }

  let result = output.join('\n');
  if (endsWithNewline && !result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}

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

    const content = await fs.readFile(sourcePath, 'utf8');
    const cleaned = stripEmptySections(content);

    await fs.mkdir(path.dirname(targetPath), {recursive: true});
    await fs.writeFile(targetPath, cleaned);
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

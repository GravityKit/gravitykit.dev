import path from 'node:path';
import fs from 'node:fs/promises';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

/**
 * Walk a directory recursively and collect markdown files.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

/**
 * Extract a frontmatter block from content.
 * @param {string} content
 * @returns {{frontmatter: string, body: string}|null}
 */
function splitFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

/**
 * Get a frontmatter field value.
 * @param {string} frontmatter
 * @param {string} field
 * @returns {string|null}
 */
function getFrontmatterField(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  if (!match) {
    return null;
  }

  return parseYamlString(match[1].trim());
}

/**
 * Set or insert a frontmatter field value.
 * @param {string} frontmatter
 * @param {string} field
 * @param {string} value
 * @returns {string}
 */
function upsertFrontmatterField(frontmatter, field, value) {
  const lines = frontmatter.split('\n');
  const fieldIndex = lines.findIndex((line) => line.startsWith(`${field}:`));
  const titleIndex = lines.findIndex((line) => line.startsWith('title:'));
  const escapedValue = escapeYamlString(value);
  const nextLine = `${field}: "${escapedValue}"`;

  if (fieldIndex >= 0) {
    lines[fieldIndex] = nextLine;
    return lines.join('\n');
  }

  const insertIndex = titleIndex >= 0 ? titleIndex + 1 : lines.length;
  lines.splice(insertIndex, 0, nextLine);
  return lines.join('\n');
}

/**
 * Parse a YAML scalar string and strip wrapping quotes.
 * @param {string} value
 * @returns {string}
 */
function parseYamlString(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const inner = trimmed.slice(1, -1);
      return inner
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\b/g, '\b')
        .replace(/\\f/g, '\f')
        .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

/**
 * Escape a string for a YAML double-quoted scalar.
 * @param {string} value
 * @returns {string}
 */
function escapeYamlString(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\b/g, '\\b')
    .replace(/[\u0000-\u001f\u007f]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${hex}`;
    });
}

/**
 * Extract the first non-heading paragraph from markdown.
 * @param {string} body
 * @returns {string}
 */
function extractFirstParagraph(body) {
  const paragraphs = body.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      continue;
    }
    return trimmed;
  }
  return '';
}

/**
 * Detect if text contains HTML tags.
 * @param {string} value
 * @returns {boolean}
 */
function containsHtml(value) {
  return /<[^>]+>/.test(value);
}

/**
 * Detect if a paragraph is a table.
 * @param {string} value
 * @returns {boolean}
 */
function isTableParagraph(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('|') || trimmed.includes('\n|');
}

/**
 * Normalize description text by stripping markup and collapsing whitespace.
 * @param {string} value
 * @returns {string}
 */
function normalizeDescriptionText(value) {
  const withoutHtml = value.replace(/<[^>]+>/g, '');
  const withoutLinks = withoutHtml.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const withoutCode = withoutLinks.replace(/`+/g, '');
  return withoutCode.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve the hook name from frontmatter or markdown heading.
 * @param {string} body
 * @param {string} frontmatter
 * @param {string} filePath
 * @returns {string}
 */
function getHookName(body, frontmatter, filePath) {
  const headingMatch = body.match(/^#\s+(?:Action|Filter):\s*(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  const sidebarMatch = frontmatter.match(/^sidebar_label:\s*["']?(.+?)["']?$/m);
  if (sidebarMatch) {
    return sidebarMatch[1].trim();
  }

  const idMatch = frontmatter.match(/^id:\s*(.+)$/m);
  if (idMatch) {
    return idMatch[1].trim();
  }

  return path.basename(filePath, path.extname(filePath));
}

/**
 * Determine hook type from the file path.
 * @param {string} filePath
 * @returns {string}
 */
function getHookType(filePath) {
  if (filePath.match(/\/actions\//i)) {
    return 'action';
  }
  if (filePath.match(/\/filters\//i)) {
    return 'filter';
  }
  return 'hook';
}

/**
 * Generate a plain-text description for a hook.
 * @param {string} hookName
 * @param {string} hookType
 * @returns {string}
 */
function generateDescription(hookName, hookType) {
  const label = hookType === 'action' ? 'action' : hookType === 'filter' ? 'filter' : 'hook';
  return `Documentation for the ${hookName} ${label}.`;
}

/**
 * Normalize a single markdown file if its description contains HTML.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function normalizeFileDescription(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const parts = splitFrontmatter(content);
  if (!parts) {
    return false;
  }

  const {frontmatter, body} = parts;
  const frontmatterDescription = getFrontmatterField(frontmatter, 'description');
  const extractedDescription = frontmatterDescription ?? extractFirstParagraph(body);

  if (!containsHtml(extractedDescription)) {
    return false;
  }

  let normalized = normalizeDescriptionText(extractedDescription);
  const hookName = getHookName(body, frontmatter, filePath);
  const hookType = getHookType(filePath);

  if (!normalized || normalized.length < 10 || isTableParagraph(extractedDescription)) {
    normalized = generateDescription(hookName, hookType);
  }

  const updatedFrontmatter = upsertFrontmatterField(frontmatter, 'description', normalized);
  const updatedContent = `---\n${updatedFrontmatter}\n---\n${body}`;

  if (updatedContent === content) {
    return false;
  }

  await fs.writeFile(filePath, updatedContent);
  return true;
}

/**
 * Normalize markdown descriptions for hook docs.
 * @param {string} docsDir
 * @returns {Promise<void>}
 */
export async function normalizeDescriptions(docsDir) {
  const files = await collectMarkdownFiles(docsDir);
  const hookFiles = files.filter((filePath) => filePath.match(/\/(actions|filters)\//i));

  for (const filePath of hookFiles) {
    await normalizeFileDescription(filePath);
  }
}

/**
 * Docusaurus plugin to normalize hook descriptions before LLM generation.
 * @param {import('@docusaurus/types').LoadContext} context
 * @returns {import('@docusaurus/types').Plugin<void>}
 */
export default function normalizeDocDescriptionsPlugin(context) {
  return {
    name: 'normalize-doc-descriptions',
    async loadContent() {
      const docsDir = path.resolve(context.siteDir, 'docs');
      await normalizeDescriptions(docsDir);
      return null;
    },
  };
}

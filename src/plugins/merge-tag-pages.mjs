import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * One static page per merge tag, at /merge-tags/<tag>/, built from the artifact the deploy fetches
 * into static/api/merge-tags.json before `npm run build` (scripts/fetch-merge-tags.mjs).
 *
 * Built at build time rather than filled in by the browser, so each tag is real HTML that search
 * engines and the Docs MCP can index, with its own title for a shared link.
 *
 * No artifact, no pages: a local build without MERGE_TAGS_TOKEN still works, and says so. The
 * deploy cannot reach this state, because the fetch step fails the run first.
 */

// Paths the merge tag section already uses, which a tag must not take over.
const RESERVED = new Set(['fields', 'tags']);
// The form field tag has no name of its own in the catalog.
const SLUG_OVERRIDES = { '*field*': 'field' };
// A page shows this many captured examples; the rest live on /merge-tags.
const MAX_CAPTURES = 12;

export function tagSlug(name) {
  return SLUG_OVERRIDES[name] ?? name;
}

export function tagPageData(artifact, tag) {
  const modifiersById = new Map(artifact.modifiers.map((m) => [m.id, m]));
  const offered = (artifact.offers?.tags?.[tag.name] ?? []).map((item) => ({ ...item, modifier: modifiersById.get(item.id) })).filter((item) => item.modifier);
  const captures = (artifact.captures?.records ?? []).filter((record) => record.tag === tag.name);

  return {
    tag,
    slug: tagSlug(tag.name),
    offered,
    captures: captures.slice(0, MAX_CAPTURES),
    captureCount: captures.length,
    catalogGenerated: artifact.catalog_generated ?? null,
  };
}

export default function mergeTagPagesPlugin(context) {
  const artifactPath = path.join(context.siteDir, 'static', 'api', 'merge-tags.json');

  return {
    name: 'merge-tag-pages',

    async loadContent() {
      let body;

      try {
        body = await fs.readFile(artifactPath, 'utf8');
      } catch {
        console.warn(`[merge-tag-pages] ${path.relative(context.siteDir, artifactPath)} not found -- no per-tag pages built. Run npm run merge-tags:generate.`);
        return null;
      }

      const artifact = JSON.parse(body);
      const slugs = new Map();

      for (const tag of artifact.tags) {
        const slug = tagSlug(tag.name);

        if (!/^[a-z0-9_]+$/.test(slug) || RESERVED.has(slug) || slugs.has(slug)) {
          throw new Error(`[merge-tag-pages] {${tag.name}} cannot have the page /merge-tags/${slug}/: the path is invalid, reserved or taken`);
        }

        slugs.set(slug, tag.name);
      }

      return artifact;
    },

    async contentLoaded({ content, actions }) {
      if (!content) return;

      for (const tag of content.tags) {
        const data = tagPageData(content, tag);
        const dataPath = await actions.createData(`merge-tag-${data.slug}.json`, JSON.stringify(data));

        actions.addRoute({
          path: `/merge-tags/${data.slug}/`,
          component: '@site/src/components/merge-tags/TagPage.jsx',
          modules: { data: dataPath },
          exact: true,
        });
      }
    },
  };
}

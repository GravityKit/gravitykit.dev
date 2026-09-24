import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * /merge-tags/<tag>/ and /merge-tags/modifiers/<name>/, built from static/api/merge-tags.json at
 * build time so each is real, indexable HTML. Without the file no pages are built; the deploy
 * always has it, because its fetch step fails the run first.
 */

// Paths the merge tag section already uses, which a tag must not take over.
const RESERVED = new Set(['fields', 'tags', 'compare', 'modifiers']);
// The form field tag has no name of its own in the catalog.
const SLUG_OVERRIDES = { '*field*': 'field' };
export function tagSlug(name) {
  return SLUG_OVERRIDES[name] ?? name;
}

function scopePart(value) {
  if (value == null || value === '*') return '*';
  return Array.isArray(value) ? [...value].sort().join('|') : String(value);
}

/** A capture names its modifiers by name and scope; the catalog sets the same identity as `id`. */
export function modifierIdentity(ref) {
  return ref.id ?? `${ref.name}::${scopePart(ref.applies_to?.tags)}::${scopePart(ref.applies_to?.field_types)}`;
}

/**
 * The same tag with nothing after its field or name: `{Notes:2:maxwords:3}` -> `{Notes:2}`,
 * `{date_created:format:Y-m-d}` -> `{date_created}`. That plain render is an example's Before.
 */
export function plainTagOf(record) {
  if (record.tag === '*field*') {
    const field = /^\{([^:{}]*):(\d+(?:\.\w+)?)/.exec(record.in);
    return field ? `{${field[1]}:${field[2]}}` : null;
  }
  return `{${record.tag}}`;
}

function captureIndex(artifact) {
  const records = (artifact.captures?.records ?? []).filter((record) => !record.stub);
  const plainByIn = new Map(records.filter((record) => record.modifiers.length === 0).map((record) => [record.in, record]));

  const example = (record) => {
    const plain = record.modifiers.length ? plainByIn.get(plainTagOf(record)) : null;
    return {
      in: record.in,
      out: record.out,
      ...(plain ? { before: { in: plain.in, out: plain.out } } : {}),
      ...(record.fixture_age ? { note: 'Rendered against an entry nine days older, where the result differs.' } : {}),
    };
  };

  return { records, example };
}

export function tagPageData(artifact, tag) {
  const modifiersById = new Map(artifact.modifiers.map((m) => [m.id, m]));
  const offered = (artifact.offers?.tags?.[tag.name] ?? []).map((item) => ({ ...item, modifier: modifiersById.get(item.id) })).filter((item) => item.modifier);
  const { records, example } = captureIndex(artifact);
  const mine = records.filter((record) => record.tag === tag.name);

  // Form fields have hundreds of captures; their modifiers are shown on the modifier pages.
  const isField = tag.name === '*field*';

  return {
    tag,
    slug: tagSlug(tag.name),
    offered,
    plain: mine.filter((record) => record.modifiers.length === 0).map(example),
    withModifier: isField ? [] : mine.filter((record) => record.modifiers.length === 1).map((record) => ({ modifier: record.modifiers[0].name, ...example(record) })),
  };
}

export function modifierPageData(artifact, name) {
  const { records, example } = captureIndex(artifact);
  const offers = artifact.offers;
  const entries = artifact.modifiers.filter((modifier) => modifier.name === name);

  // Field types by the name people see in the form editor, from the offer grid's own rows
  // (the first row per type is the whole field: "Checkboxes", not "Checkboxes, one choice").
  const fieldTypeNames = {};
  for (const row of offers?.fields ?? []) fieldTypeNames[row.field_type] ??= row.label;

  return {
    name,
    fieldTypeNames,
    reasons: offers?.reasons ?? {},
    entries: entries.map((modifier) => {
      const uses = records.filter((record) => record.modifiers.some((ref) => modifierIdentity(ref) === modifier.id));
      const fieldRows = offers?.fields ?? [];

      const withheld = new Map();
      for (const row of fieldRows) {
        for (const item of row.withheld) {
          if (item.id !== modifier.id) continue;
          withheld.set(item.reason, [...(withheld.get(item.reason) ?? []), row.label]);
        }
      }

      return {
        modifier,
        examples: uses.filter((record) => record.modifiers.length === 1).map(example),
        offeredOnFields: fieldRows.filter((row) => row.offered.some((item) => item.id === modifier.id && !item.locked && !item.written)).map((row) => ({ key: row.key, label: row.label })),
        offeredOnTags: Object.entries(offers?.tags ?? {})
          .filter(([, list]) => list.some((item) => item.id === modifier.id))
          .map(([tagName]) => tagName),
        withheld: [...withheld.entries()].map(([reason, fields]) => ({ reason, fields })),
      };
    }),
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
        console.warn(`[merge-tag-pages] ${path.relative(context.siteDir, artifactPath)} not found -- no merge tag pages built. Run npm run merge-tags:generate.`);
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

      for (const modifier of artifact.modifiers) {
        if (!/^[a-z0-9_]+$/.test(modifier.name)) {
          throw new Error(`[merge-tag-pages] the modifier "${modifier.name}" cannot have the page /merge-tags/modifiers/${modifier.name}/`);
        }
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

      for (const name of [...new Set(content.modifiers.map((modifier) => modifier.name))]) {
        const dataPath = await actions.createData(`merge-tag-modifier-${name}.json`, JSON.stringify(modifierPageData(content, name)));

        actions.addRoute({
          path: `/merge-tags/modifiers/${name}/`,
          component: '@site/src/components/merge-tags/ModifierPage.jsx',
          modules: { data: dataPath },
          exact: true,
        });
      }
    },
  };
}

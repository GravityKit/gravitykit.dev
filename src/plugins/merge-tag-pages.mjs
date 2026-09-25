import path from 'node:path';
import fs from 'node:fs/promises';
import { dateFormatHelp, fieldTagOf, reasonsWithCapturedDate, worksOutsideViews } from '../components/merge-tags/data.mjs';

/**
 * /merge-tags/, /merge-tags/<tag>/ and /merge-tags/modifiers/<name>/, built from static/api/merge-tags.json at
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

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function textOf(html) {
  return html
    .replace(/<\/li>\s*<li[^>]*>/gi, ', ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** The label and value rows of a Gravity Forms field table ({all_fields}, {pricing_fields}). */
export function fieldTableRows(html) {
  const rows = [];
  const row = /<strong>([\s\S]*?)<\/strong>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g;
  for (let match = row.exec(html); match; match = row.exec(html)) rows.push([textOf(match[1]), textOf(match[2])]);
  return rows;
}

/**
 * How a field table differs from the same tag without the modifier: fields it adds, leaves
 * out, shows under another label, or shows differently. Null when either output is not a
 * field table, since a paragraph from :wpautop has no rows to compare.
 */
export function fieldTableDiff(beforeHtml, afterHtml) {
  const before = fieldTableRows(beforeHtml);
  const after = fieldTableRows(afterHtml);
  if (!before.length || !after.length) return null;
  const beforeByLabel = new Map(before);
  const afterByLabel = new Map(after);
  const gone = before.filter(([label]) => !afterByLabel.has(label));
  const fresh = after.filter(([label]) => !beforeByLabel.has(label));

  // A label that disappears while a new one appears with the same value is one field under
  // another label, the way :admin swaps in admin labels.
  const renamed = [];
  for (const [label, value] of gone) {
    const match = fresh.find(([newLabel, newValue]) => newValue === value && !renamed.some((r) => r.to === newLabel));
    if (match) renamed.push({ from: label, to: match[0] });
  }

  const added = fresh.filter(([label]) => !renamed.some((r) => r.to === label));
  return {
    added: added.map(([label]) => label),
    ...(added.length && added.every(([, value]) => value === '') ? { added_blank: true } : {}),
    removed: gone.filter(([label]) => !renamed.some((r) => r.from === label)).map(([label]) => label),
    renamed,
    changed: after
      .filter(([label, value]) => beforeByLabel.has(label) && beforeByLabel.get(label) !== value)
      .map(([label, value]) => ({ label, before: beforeByLabel.get(label), after: value })),
  };
}

/**
 * What each test-form field is, for a diff naming it: "Tracking Token" alone means nothing
 * to a reader, "Tracking Token, a Hidden field" does. Field types are named the way the
 * form editor names them, from the offer grid's rows.
 */
function fieldNotes(artifact) {
  const typeNames = {};
  for (const row of artifact.offers?.fields ?? []) typeNames[row.field_type] ??= row.label;
  const fields = new Map((artifact.captures?.fixture_fields ?? []).map((field) => [field.label, field]));

  return (diff) => {
    const kind = (label) => {
      const field = fields.get(label);
      if (!field) return null;
      if (field.admin_only) return 'an admin-only field';
      const name = typeNames[field.type];
      return name ? `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} field` : null;
    };
    return {
      ...diff,
      removed: diff.removed.map((label) => ({ label, kind: kind(label) })),
      renamed: diff.renamed.map((r) => ({ ...r, admin_label: fields.get(r.from)?.admin_label === r.to })),
    };
  };
}

function captureIndex(artifact) {
  const records = (artifact.captures?.records ?? []).filter((record) => !record.stub);
  const describe = fieldNotes(artifact);
  const plainByIn = new Map(records.filter((record) => record.modifiers.length === 0).map((record) => [record.in, record]));

  const example = (record) => {
    const plain = record.modifiers.length ? plainByIn.get(plainTagOf(record)) : null;
    const diff = plain ? fieldTableDiff(plain.out, record.out) : null;
    return {
      in: record.in,
      out: record.out,
      ...(plain ? { before: { in: plain.in, out: plain.out } } : {}),
      ...(diff ? { diff: describe(diff) } : {}),
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
    withModifier: isField
      ? []
      : mine
          .filter((record) => record.modifiers.length === 1)
          .map((record) => ({
            modifier: record.modifiers[0].name,
            modifierLabel: modifiersById.get(modifierIdentity(record.modifiers[0]))?.label,
            ...example(record),
          })),
  };
}

/**
 * The capture a modifier page leads with: a render of the modifier alone, on a field kind or tag
 * the picker offers it on, so the first example never contradicts the page's own lists. Field
 * modifiers read the per-field captures first (one per offer grid row, so the field kind is
 * known), then any capture on a test field of an offered kind. Null when nothing was captured.
 */
function leadExample(artifact, modifier, offeredRows, offeredTags, records, example) {
  const usable = (item) => item && !item.empty && !item.warnings?.length && !item.same && !item.unresolved && !item.error && item.out !== '';
  const fieldRows = artifact.field_examples?.rows ?? {};

  // A render that changes the output first; one that matches the plain field only when no other
  // exists, since some modifiers (like :formatted) exist to change nothing.
  const fromRows = (accept) => {
    for (const row of offeredRows) {
      const item = fieldRows[row.key]?.modifiers?.find((candidate) => candidate.id === modifier.id);
      if (accept(item)) return { in: item.in, out: item.out, same: !!item.same, field: { tag: fieldTagOf(item.in), kind: row.label } };
    }
    return null;
  };
  const fromGrid = fromRows(usable) ?? fromRows((item) => !!item && usable({ ...item, same: false }));
  if (fromGrid) return fromGrid;

  const alone = records.filter(
    (record) => record.modifiers.length === 1 && modifierIdentity(record.modifiers[0]) === modifier.id && record.out !== '',
  );

  if (offeredRows.length) {
    const fixtureTypes = new Map((artifact.captures?.fixture_fields ?? []).map((field) => [field.label, field.type]));
    for (const record of alone.filter((r) => r.tag === '*field*')) {
      const tag = fieldTagOf(record.in);
      const label = /^\{([^:{}]*):/.exec(record.in)?.[1];
      const part = /\.\w+\}$/.test(tag ?? '');
      const sameType = offeredRows.filter((row) => row.field_type === fixtureTypes.get(label));
      const row = sameType.find((r) => r.key.endsWith('-input') === part) ?? (part ? null : sameType[0]);
      if (row) return { ...example(record), field: { tag, kind: row.label } };
    }
  }

  const onTag = alone.find((record) => offeredTags.includes(record.tag));
  return onTag ? example(onTag) : null;
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
    reasons: reasonsWithCapturedDate(artifact),
    entries: entries.map((modifier) => {
      const uses = records.filter((record) => record.modifiers.some((ref) => modifierIdentity(ref) === modifier.id));
      const fieldRows = offers?.fields ?? [];

      // Works on and Left out both come from the offer grid, one row at a time, so a field kind
      // is in one list or the other. A row where it is locked is left out, with the lock's reason.
      const offeredRows = fieldRows.filter((row) => row.offered.some((item) => item.id === modifier.id && !item.locked && !item.written));
      const offeredOnTags = Object.entries(offers?.tags ?? {})
        .filter(([, list]) => list.some((item) => item.id === modifier.id))
        .map(([tagName]) => tagName);

      const withheld = new Map();
      for (const row of fieldRows) {
        for (const item of row.withheld) {
          if (item.id !== modifier.id) continue;
          withheld.set(item.reason, [...(withheld.get(item.reason) ?? []), row.label]);
        }
      }

      const locked = new Map();
      for (const row of fieldRows) {
        const item = row.offered.find((candidate) => candidate.id === modifier.id && candidate.locked);
        if (item) locked.set(item.locked, [...(locked.get(item.locked) ?? []), row.label]);
      }

      return {
        modifier,
        lead: leadExample(artifact, modifier, offeredRows, offeredOnTags, records, example),
        examples: uses.filter((record) => record.modifiers.length === 1).map(example),
        offeredOnFields: offeredRows.map((row) => ({ key: row.key, label: row.label })),
        offeredOnTags,
        withheld: [...withheld.entries()].map(([reason, fields]) => ({ reason, fields })),
        locked: [...locked.entries()].map(([why, fields]) => ({ why, fields })),
        dateFormat: dateFormatHelp(modifier),
        outsideViews: worksOutsideViews(artifact, modifier),
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
      // Built into the page so crawlers see the table. Only the keys it reads, since this ships in a JS chunk.
      const indexData = content
        ? {
            products: content.products,
            tags: content.tags,
            modifiers: content.modifiers,
            captures: { status: content.captures?.status, records: content.captures?.records ?? [] },
            offers: content.offers,
          }
        : null;
      const indexDataPath = await actions.createData('merge-tags-index.json', JSON.stringify(indexData));

      actions.addRoute({
        path: '/merge-tags/',
        component: '@site/src/components/merge-tags/IndexPage.jsx',
        modules: { data: indexDataPath },
        exact: true,
      });

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

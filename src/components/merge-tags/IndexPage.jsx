import { useEffect, useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import { MergeTagsNav, SECTIONS, productName, requiresText, sectionOf } from './shared';
import { HtmlPreview } from './Examples';
import styles from './merge-tags.module.css';
// The display helpers the reference shares with GravityKit/merge-tags' own page, fetched beside the
// artifact by scripts/fetch-merge-tags.mjs (docs-site/scripts/lib/display.mjs there). Change them
// there, not here.
import {
  entryDependenceBadge,
  hazardAnnotation,
  isLongCaptureOutput,
  looksLikeHtml,
  matchesEntryDependenceFilter,
  modifierIdentity,
  previewForTable,
  relationNames,
} from '@site/static/api/merge-tags-display.mjs';

/**
 * Merge tags reference at /merge-tags/, routed by src/plugins/merge-tag-pages.mjs, which
 * passes the artifact in as `data` at build time. The table is in the static HTML, so a
 * crawler or a plain fetch sees every tag and modifier; the filters work once the page
 * loads. One searchable table with filters, no authored taxonomy. Adding a tag or
 * modifier to a schema fragment changes this page on the next deploy with no edit here.
 *
 * Row shape differs from the tokens page because a merge tag doesn't preview
 * itself the way a color token does (SPEC "The tension in 'live preview'") --
 * every row's canonical render comes from a captured pair, not from the entry's
 * own definition, and that pair may be stub:true placeholder data rather than a
 * CI-verified render (Q1/Q4). The expandable row is where in/out/display and the
 * modifier's own metadata live, kept out of the table body so scanning stays fast.
 *
 * The display helpers (`modifierIdentity()`, `hazardAnnotation()`, the entry-dependence rules of
 * SPEC-entry-preview.md §3.N, the table previews) come from `merge-tags-display.mjs`, which
 * GravityKit/merge-tags bundles from `docs-site/scripts/lib/display.mjs` and publishes beside the
 * artifact; scripts/fetch-merge-tags.mjs fetches both. They used to be inlined here, and drifted.
 *
 * A PURE generated reference, not an interactive builder (SPEC-entry-preview.md
 * §3.J, §4.4): the plugin now renders live against real entries via the
 * Abilities API, so a site-less builder here could only ever show
 * approximations of what the plugin proves. Shipping both invites "why do these
 * disagree" with no good answer. What survives from the builder era is exactly
 * the part that was never an approximation -- gate-verified captured pairs
 * (EP39) -- now presented as documentation instead of interaction.
 */

// 'context' (the form: modifier, SPEC-FINAL 4.7) is a schema kind added after this list was
// first written -- omitting it here doesn't drop context rows from the table (they still match
// "all kinds" and free-text search), it only drops "context" as a Kind-filter option.



/** EP42's stamp value (SPEC-entry-preview.md §3.J, §4.5) -- the generator derives
 * this from the schema's own `reparses_input` + `kind` data, using the same
 * predicate the picker's panel warns on interactively, so the two can never
 * drift apart. */
const HAZARD_REPARSES_INPUT_ORDER = 'reparses-input-order';

/** One entry per hazard value the generator can produce, so a stamped record can
 * never reach this page with nothing to say about itself. */
const HAZARD_ANNOTATIONS = {
  [HAZARD_REPARSES_INPUT_ORDER]:
    'This modifier treats all text as a date. If an earlier step changed the text, the date comes out ' +
    "wrong, often as today's date. Put this modifier first.",
};













i;




/**
 * A small label beside a row's name. Tones are CSS classes (merge-tags.module.css .badge_*) so each
 * has its own light and dark colors: the info-contrast pair this used to borrow measured 2.25:1.
 * EP66-EP70 (SPEC-entry-preview.md §3.N): "varies" gets an informational tone (the more common
 * case, nothing to flag); "solid" reuses the neutral gray of `kind` -- both read as a structural
 * fact, never alarm-colored the way stub/hazard are.
 */
function badge(text, tone) {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`] ?? ''}`}>{text}</span>;
}

/** Copies a merge tag. Its name says which one, and the result is announced, not only shown. */
function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.copyButton}
        aria-label={`Copy ${text}`}
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? 'Copied' : 'Copy'}
      </button>
      <span role="status" className={styles.srOnly}>
        {done ? `Copied ${text}` : ''}
      </span>
    </>
  );
}

/** Every capture whose `tag` matches this entry's name, newest-captured first. */
function capturesForTag(catalog, tagName) {
  if (!catalog) return [];
  return (catalog.captures?.records || []).filter((c) => c.tag === tagName);
}

/** Captures demonstrating a specific modifier catalog entry, matched by scoped
 * identity (modifierIdentity()) -- CONTRACT.md "Modifier identity is scoped, not
 * a name": name, and even (name, product), are not unique in this catalog (e.g.
 * `value` is four distinct gravityforms entries scoped to different field
 * types). Matching on name alone would show one entry's captures on all four. */
function capturesForModifier(catalog, modifierEntry) {
  if (!catalog) return [];
  const wanted = modifierIdentity(modifierEntry);
  return (catalog.captures?.records || []).filter(
    (c) => Array.isArray(c.modifiers) && c.modifiers.some((m) => modifierIdentity(m) === wanted),
  );
}

/**
 * What a modifier is scoped to, rendered in the table itself rather than only on
 * expand -- this is the fix for showing four same-named `value` entries as one
 * indistinguishable row (CONTRACT.md "Modifier identity is scoped, not a name").
 * field_types is the more specific discriminator when present (three of the four
 * `value` entries differ only here); falls back to tags for a flag like the
 * fourth `value` entry, which has no field_types restriction at all.
 */
function scopeDescription(appliesTo, fieldTypeNames = {}) {
  if (!appliesTo) return 'Any tag';
  if (Array.isArray(appliesTo.field_types)) return appliesTo.field_types.map((type) => fieldTypeNames[type]?.[0] ?? type).join(', ');
  if (Array.isArray(appliesTo.tags)) return appliesTo.tags.map(tagDisplayName).join(', ');
  return 'Any tag';
}

/** `*field*` is the catalog's internal name for the form field tag; readers know it as "form fields". */
function tagDisplayName(name) {
  return name === '*field*' ? 'form fields' : `{${name}}`;
}

/** What goes after a modifier's colon, in words. */
const ARGUMENT_NAMES = { integer: 'a number', string: 'text', php_date_format: 'a date format', form_ref: 'a form ID' };

/** The kind of row, in the panel's own words ("What to show", "Change the output", "Other settings"). */
function rowTypeLabel(row) {
  if (row.type === 'tag') return 'Tag';
  return SECTIONS.find((section) => section.key === sectionOf(row.entry))?.title ?? 'Other settings';
}

/** Field type -> every name the form editor gives it ("checkbox" -> Checkboxes, "Checkboxes, one choice"). */
function fieldTypeNamesOf(catalog) {
  const names = {};
  for (const row of catalog?.offers?.fields ?? []) (names[row.field_type] ??= []).push(row.label);
  return names;
}

/** Everything a reader might type to find a row: names, syntax, what it works on, in the editor's words. */
function searchTextOf(row, fieldTypeNames) {
  const { entry, type } = row;
  const parts = [entry.name, entry.label, entry.syntax, entry.description, entry.group];
  if (type === 'tag') {
    parts.push(`{${entry.name}}`);
    if (entry.name === '*field*') parts.push('form field', 'field');
  } else {
    parts.push(`:${entry.name}`);
    const tags = entry.applies_to?.tags;
    if (Array.isArray(tags)) for (const tag of tags) parts.push(tag, tagDisplayName(tag));
    const types = entry.applies_to?.field_types;
    if (Array.isArray(types)) for (const fieldType of types) parts.push(fieldType, ...(fieldTypeNames[fieldType] ?? []));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Does a row match what was typed? Words must all appear. A merge tag as written
 * (`all_fields:noadmin`, `{Email:3:urlencode}`) matches the modifiers it names, on that tag.
 */
function matchesQuery(row, query, fieldTypeNames, tagNames) {
  const q = query.trim().toLowerCase().replace(/[{}]/g, '');
  if (!q) return true;
  if (q.includes(':')) {
    const [head, ...rest] = q.split(':').map((part) => part.trim());
    const tag = tagNames.has(head) ? head : '*field*';
    const modifierNames = rest.filter((part) => part && !/^\d+(\.\d+)?$/.test(part));
    if (row.type === 'tag') return modifierNames.length === 0 && row.entry.name === tag;
    if (!modifierNames.includes(row.entry.name)) return false;
    const tags = row.entry.applies_to?.tags;
    return !Array.isArray(tags) || tags.includes(tag);
  }
  const haystack = searchTextOf(row, fieldTypeNames);
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** A captured `out` can run 15-18KB in the non-HTML long-string case too (rare,
 * but not impossible) -- dumped inline that's not "detail", it's a page that's
 * thousands of pixels tall. Collapsed behind <details> above the threshold; the
 * short, common case (a date, a string, a number) renders exactly as before. */
function CaptureOutput({ out }) {
  if (looksLikeHtml(out)) {
    return <HtmlPreview html={out} />;
  }
  if (!isLongCaptureOutput(out)) {
    return <code style={{ background: 'var(--ifm-color-emphasis-100)', padding: '2px 6px', borderRadius: 4 }}>{out}</code>;
  }
  return (
    <details>
      <summary className={styles.detailMeta}>
        {out.length.toLocaleString()} characters. Expand to view.
      </summary>
      <pre style={{ maxHeight: 320, overflow: 'auto', background: 'var(--ifm-color-emphasis-100)', padding: 8, borderRadius: 4 }}>
        <code>{out}</code>
      </pre>
    </details>
  );
}

/**
 * EP42 (SPEC-entry-preview.md §3.J, §4.5): a hazard-stamped capture renders its
 * output SHOWN, never suppressed, plus this annotation explaining why it looks
 * wrong. `capture.hazard` is schema-derived by the generator from the same
 * reparses_input + kind predicate the picker's own panel warns on
 * interactively -- this and the panel's warning can never drift apart because
 * both read one flag.
 */
function HazardNotice({ annotation }) {
  if (!annotation) return null;
  return (
    <div
      style={{
        marginTop: 6,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        border: '1px solid var(--ifm-color-danger-dark)',
        background: 'var(--ifm-color-danger-contrast-background)',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 13,
      }}
    >
      <strong style={{ color: 'var(--ifm-color-danger-dark)' }}>Ordering hazard:</strong>
      <span>{annotation}</span>
    </div>
  );
}

function CapturePair({ capture }) {
  if (!capture) return <p className={styles.detailMeta}><em>No example output yet.</em></p>;
  return (
    <div style={{ fontSize: 13 }}>
      <dl className={styles.samplePair}>
        <dt>Sample Merge Tag</dt>
        <dd>
          <code>{capture.in}</code> <CopyButton text={capture.in} />
          {capture.stub ? badge('placeholder, not CI-verified', 'stub') : null}
          {capture.hazard ? badge('ordering hazard', 'hazard') : null}
        </dd>
        <dt>Sample Result</dt>
        <dd>
          <CaptureOutput out={capture.out} />
        </dd>
      </dl>
      {capture.hazard ? <HazardNotice annotation={hazardAnnotation(capture.hazard)} /> : null}
      {capture.display ? (
        <div className={styles.detailMeta}>
          On a real site this depends on when it is read ({capture.display.kind}); the output above is from the test entry's fixed date.
        </div>
      ) : null}
      <div className={styles.detailMeta}>
        Captured {capture.captured} with {Object.entries(capture.versions || {}).map(([p, v]) => `${productName(p)} ${v}`).join(', ')}.
      </div>
    </div>
  );
}

/**
 * Opens a row's details. A real button, so the details are reachable from the keyboard and a
 * screen reader hears whether they are open (WCAG 2.1.1, 4.1.2). A click anywhere else on the
 * row still toggles it, for mouse users.
 */
function RowToggle({ expanded, onToggle, controls, name }) {
  return (
    <button
      type="button"
      className={styles.rowToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      <span className={styles.srOnly}>Details for {name}</span>
    </button>
  );
}

/** A click on the row itself toggles it, unless it landed on a link or button inside. */
function rowClick(onToggle) {
  return (event) => {
    if (event.target.closest('a, button')) return;
    onToggle();
  };
}

function TagRow({ entry, catalog, expanded, onToggle, detailId }) {
  const captures = capturesForTag(catalog, entry.name);
  const canonical = captures[0];
  const entryDependence = entryDependenceBadge({ type: 'tag', entry });
  return (
    <>
      <tr onClick={rowClick(onToggle)} className={styles.clickableRow}>
        <td>
          <span className={styles.rowName}>
            <RowToggle expanded={expanded} onToggle={onToggle} controls={detailId} name={entry.syntax} />
            <a href={`/merge-tags/${entry.name === '*field*' ? 'field' : entry.name}/`}>
              <code>{entry.syntax}</code>
            </a>
          </span>
          {badge('Tag', 'kind')}
        </td>
        <td>{productName(entry.product)}</td>
        <td>{entry.group ? entry.group[0].toUpperCase() + entry.group.slice(1) : '—'}</td>
        <td className={styles.cellMuted}>
          {Array.isArray(entry.field_types) ? entry.field_types.join(', ') : '—'}
        </td>
        <td style={{ fontSize: 14 }}>
          {entry.label}
          {entryDependence ? badge(entryDependence.text, entryDependence.tone) : null}
        </td>
        <td style={{ fontSize: 13, fontFamily: 'var(--ifm-font-family-monospace)' }}>
          {canonical ? (
            <>
              {previewForTable(canonical.out)}
              {looksLikeHtml(canonical.out) ? badge('HTML', 'kind') : null}
              {canonical.hazard ? badge('ordering hazard', 'hazard') : null}
            </>
          ) : (
            <span className={styles.cellMuted} aria-label="No example">&mdash;</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr id={detailId}>
          <td colSpan={6} className={styles.detailCell}>
            {entry.description ? <p>{entry.description}</p> : null}
            {/* EP69/EP70: the same signal the panel's entry-cursor arrows show
                interactively, stated once here for a reader who only ever sees
                this static reference. */}
            <p className={styles.detailMeta}>
              {entryDependence?.tone === 'entryVaries'
                ? 'Changes from entry to entry.'
                : 'Same for every entry.'}
            </p>
            <CapturePair capture={canonical} />
            {entry.requires ? <p className={styles.detailMeta}>Requires {requiresText(entry.requires)}.</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}


function ModifierRow({ entry, catalog, expanded, onToggle, detailId, fieldTypeNames }) {
  const captures = capturesForModifier(catalog, entry);
  const canonical = captures[0];
  // EP67: only the five GravityMath aggregates return non-null -- every other
  // modifier inherits its entry-dependence from whatever tag it's attached to.
  const entryDependence = entryDependenceBadge({ type: 'modifier', entry });
  return (
    <>
      <tr onClick={rowClick(onToggle)} className={styles.clickableRow}>
        <td>
          <span className={styles.rowName}>
            <RowToggle expanded={expanded} onToggle={onToggle} controls={detailId} name={`:${entry.name}`} />
            <a href={`/merge-tags/modifiers/${entry.name}/`}>
              <code>:{entry.name}</code>
            </a>
          </span>
          {badge(rowTypeLabel({ type: 'modifier', entry }), 'kind')}
        </td>
        <td>{productName(entry.product)}</td>
        <td>{entry.arity === 1 ? `Takes ${ARGUMENT_NAMES[entry.argument?.type] ?? 'a value'}` : '—'}</td>
        <td className={styles.cellMuted}>{scopeDescription(entry.applies_to, fieldTypeNames)}</td>
        <td style={{ fontSize: 14 }}>
          {entry.label}
          {entryDependence ? badge(entryDependence.text, entryDependence.tone) : null}
        </td>
        <td style={{ fontSize: 13, fontFamily: 'var(--ifm-font-family-monospace)' }}>
          {canonical ? (
            <>
              {previewForTable(canonical.out)}
              {looksLikeHtml(canonical.out) ? badge('HTML', 'kind') : null}
              {canonical.hazard ? badge('ordering hazard', 'hazard') : null}
            </>
          ) : (
            <span className={styles.cellMuted} aria-label="No example">&mdash;</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr id={detailId}>
          <td colSpan={6} className={styles.detailCell}>
            {entry.description ? <p>{entry.description}</p> : null}
            {/* EP67: the one shipped case where a modifier changes the
                entry-dependence answer -- a per-entry field becoming a
                cross-entry total. */}
            {entryDependence ? (
              <p className={styles.detailMeta}>
                <strong>{entryDependence.text}:</strong> this modifier adds up, counts, or averages all entries in
                scope, so the result is the same for every entry.
              </p>
            ) : null}
            {captures.length ? captures.map((c) => <CapturePair key={c.in} capture={c} />) : <CapturePair capture={null} />}
            <p className={styles.detailMeta}>
              Works on {scopeDescription(entry.applies_to, fieldTypeNames)}
              {entry.conflicts_with?.length ? ` · can't be combined with ${relationNames(catalog, entry.conflicts_with).map((name) => `:${name}`).join(', ')}` : ''}
              {entry.implies?.length ? ` · also turns on ${relationNames(catalog, entry.implies).map((name) => `:${name}`).join(', ')}` : ''}
              {entry.requires ? ` · requires ${requiresText(entry.requires)}` : ''}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** What can follow a tag's colon: modifiers, a value (property, parameter or attributes), or nothing. */
function tagTakes(tag, catalog) {
  if (tag.name === '*field*' || catalog?.offers?.tags?.[tag.name]?.length) return 'modifiers';
  if (tag.parameter || tag.parameters?.length || tag.attributes?.length) return 'options';
  return 'none';
}

/** Filter state kept in the URL, so Back and a shared link bring the same view back. */
const URL_KEYS = { query: 'q', product: 'product', kind: 'type', entryDependence: 'changes', takes: 'takes' };
const FILTER_DEFAULTS = { query: '', product: 'all', kind: 'all', entryDependence: 'all', takes: 'all' };

function readFilters() {
  if (typeof window === 'undefined') return FILTER_DEFAULTS;
  const params = new URLSearchParams(window.location.search);
  const out = { ...FILTER_DEFAULTS };
  for (const [key, param] of Object.entries(URL_KEYS)) {
    const value = params.get(param);
    if (value) out[key] = value;
  }
  return out;
}

function writeFilters(filters) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, param] of Object.entries(URL_KEYS)) {
    if (filters[key] && filters[key] !== FILTER_DEFAULTS[key]) params.set(param, filters[key]);
    else params.delete(param);
  }
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
}

function MergeTagTable({ catalog }) {
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [fromUrl, setFromUrl] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const { query, product, kind, entryDependence, takes } = filters;
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  // Read the URL once on the client (the static HTML has no query string), then keep it in step.
  useEffect(() => {
    setFilters(readFilters());
    setFromUrl(true);
  }, []);
  useEffect(() => {
    if (fromUrl) writeFilters(filters);
  }, [filters, fromUrl]);

  // One list: tags first (kind "tag" isn't a schema kind, but the filter treats
  // it as one so "show me everything about {date_created}" is one search away
  // from "show me every :transform"), then every modifier.
  const rows = useMemo(() => {
    if (!catalog) return [];
    const tagRows = (catalog.tags || []).map((t) => ({ type: 'tag', kind: 'tag', key: `tag:${t.name}`, entry: t }));
    const modRows = (catalog.modifiers || []).map((m) => ({
      type: 'modifier',
      kind: sectionOf(m),
      key: `mod:${modifierIdentity(m)}`,
      entry: m,
    }));
    return [...tagRows, ...modRows];
  }, [catalog]);

  const fieldTypeNames = useMemo(() => fieldTypeNamesOf(catalog), [catalog]);
  const tagNames = useMemo(() => new Set((catalog?.tags || []).map((t) => t.name)), [catalog]);

  const products = useMemo(() => {
    if (!catalog) return [];
    return [...new Set((catalog.products || []).map((p) => productName(p.product)))].sort();
  }, [catalog]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const { entry, type, kind: rowKind } = row;
        if (product !== 'all' && productName(entry.product) !== product) return false;
        if (kind !== 'all' && rowKind !== kind) return false;
        if (!matchesEntryDependenceFilter(row, entryDependence)) return false;
        if (takes !== 'all' && (type !== 'tag' || tagTakes(entry, catalog) !== takes)) return false;
        return matchesQuery(row, query, fieldTypeNames, tagNames);
      }),
    [rows, query, product, kind, entryDependence, takes, catalog, fieldTypeNames, tagNames],
  );

  if (!rows.length) {
    return (
      <p>
        <em>No data yet. Check back soon.</em>
      </p>
    );
  }

  const filtersActive = Object.entries(filters).some(([key, value]) => value !== FILTER_DEFAULTS[key]);
  const count = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;

  return (
    <div>
      {catalog.captures?.status === 'stub' ? (
        <div className="alert alert--warning margin-bottom--md">
          <strong>Placeholder data.</strong> These outputs are placeholders.
        </div>
      ) : null}

      <div className={styles.filters}>
        {/* A placeholder is not an accessible name: not every screen reader exposes it as one,
            and it vanishes the moment the user types -- leaving the field unlabelled exactly when
            they most need to know what it filters. Same reason the selects carry aria-label. */}
        <input
          type="search"
          aria-label="Search tags and modifiers"
          placeholder="Search, or paste a tag like all_fields:noadmin"
          value={query}
          onChange={set('query')}
          className={styles.filterSearch}
        />
        <select aria-label="Filter by product" value={product} onChange={set('product')}>
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select aria-label="Filter by type" value={kind} onChange={set('kind')}>
          <option value="all">All types</option>
          <option value="tag">Tags</option>
          {SECTIONS.map((section) => (
            <option key={section.key} value={section.key}>
              {section.title}
            </option>
          ))}
        </select>
        <select aria-label="Filter by whether the output changes from entry to entry" value={entryDependence} onChange={set('entryDependence')}>
          <option value="all">Changes per entry or not</option>
          <option value="varies">Changes per entry</option>
          <option value="solid">Same for every entry</option>
        </select>
        <select aria-label="Filter tags by what follows the colon" value={takes} onChange={set('takes')}>
          <option value="all">Any tag</option>
          <option value="modifiers">Tags that take modifiers</option>
          <option value="options">Tags that take a value, like {'{user:display_name}'}</option>
          <option value="none">Tags that take nothing</option>
        </select>
        {filtersActive && (
          <button type="button" className={styles.clearFilters} onClick={() => setFilters(FILTER_DEFAULTS)}>
            Clear
          </button>
        )}
      </div>

      {/* Announced as it changes, for screen readers only: a filter that silently empties the table
          reads as a broken page, but a visible count of tags adds nothing a reader needs. */}
      <p role="status" aria-live="polite" className={styles.srOnly}>
        {count}
      </p>

      {filtered.length === 0 ? (
        <p className={styles.emptyState}>
          {query.trim() ? <>No matches for “{query.trim()}”. </> : <>Nothing matches these filters. </>}
          Try a tag like <code>all_fields</code>, a modifier like <code>urlencode</code>, or a field kind like <em>Radio</em>.
        </p>
      ) : (
        <div role="region" aria-label="Merge tags table, scrolls sideways" tabIndex={0} className={styles.tableScroll}>
          <table className={styles.mergeTagTable}>
            <thead>
              <tr>
                <th>Syntax</th>
                <th>Product</th>
                <th>Group or input</th>
                <th>Works on</th>
                <th>Label</th>
                <th>Example output</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => {
                const expanded = expandedKey === row.key;
                const toggle = () => setExpandedKey(expanded ? null : row.key);
                const detailId = `merge-tag-row-${index}`;
                return row.type === 'tag' ? (
                  <TagRow key={row.key} entry={row.entry} catalog={catalog} expanded={expanded} onToggle={toggle} detailId={detailId} />
                ) : (
                  <ModifierRow
                    key={row.key}
                    entry={row.entry}
                    catalog={catalog}
                    expanded={expanded}
                    onToggle={toggle}
                    detailId={detailId}
                    fieldTypeNames={fieldTypeNames}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Shown once after /merge-tags/tags/ redirects here, so a bookmark's page does not just vanish. */
function MovedNote() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get('from') === 'tag-options');
  }, []);
  if (!show) return null;

  const dismiss = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('from');
    const search = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    setShow(false);
  };

  return (
    <div className={`alert alert--info ${styles.movedNote}`} role="status">
      <span>
        Tag options is now part of this table: use the “Tags that take …” filter.
      </span>
      <button type="button" className={styles.clearFilters} onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}

export default function MergeTagsPage({ data }) {
  const catalog = data ?? { tags: [], modifiers: [], products: [], captures: { records: [] } };

  return (
    <Layout
      title="GravityKit merge tags"
      description="Every merge tag and modifier across GravityKit and the products it extends, with real examples."
    >
      <main className="container margin-vert--lg">
        <MergeTagsNav current="all" />
        {/* article: DocSearch's crawler reads headings and text inside it, and indexed nothing here without one. */}
        <article>
          <header>
            <h1>Merge tags</h1>
          </header>
          <p>
            Every merge tag in Gravity Forms and GravityKit, its modifiers, and its output. Outputs come from the
            real plugin code, run on a test entry.
          </p>
          <p>To see output for your own entries, use the merge tag picker in WordPress.</p>
          <MovedNote />
          <MergeTagTable catalog={catalog} />
        </article>
      </main>
    </Layout>
  );
}

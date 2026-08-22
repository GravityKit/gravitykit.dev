import { useEffect, useMemo, useState } from 'react';
import Layout from '@theme/Layout';

/**
 * Merge tags reference. Port of gravityview/css-tokens.jsx (SPEC-merge-tags-page.md
 * Q7, in the `merge-tags` repo): fetch-at-view-time over a generated artifact, one
 * searchable table with filters, no authored taxonomy. Adding a tag or modifier to
 * a schema fragment changes this page on the next deploy with no edit here.
 *
 * Row shape differs from the tokens page because a merge tag doesn't preview
 * itself the way a color token does (SPEC "The tension in 'live preview'") --
 * every row's canonical render comes from a captured pair, not from the entry's
 * own definition, and that pair may be stub:true placeholder data rather than a
 * CI-verified render (Q1/Q4). The expandable row is where in/out/display and the
 * modifier's own metadata live, kept out of the table body so scanning stays fast.
 *
 * `modifierIdentity()`, `hazardAnnotation()`, the entry-dependence helpers
 * (`tagEntryDependent`, `hasEntryDependenceOverride`, `entryDependenceBadge`,
 * `matchesEntryDependenceFilter` -- SPEC-entry-preview.md §3.N, EP66-EP73), and
 * the `table-output` helpers below are inlined from the source repo's
 * `docs-site/scripts/lib/{merge-tags,table-output}.mjs` rather than imported
 * across repos: `merge-tags.mjs` also pulls in `packages/core/dist/src/index.js`
 * (parse/serialize, used by the generator's own validation checks, not by this
 * page), which this clone does not vendor. This page only needs the pure
 * helpers themselves -- see that module's docblocks for the full rationale on
 * each.
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
const KIND_ORDER = ['parameter', 'representation', 'transform', 'flag', 'context'];

/** Normalize an applies_to.tags / applies_to.field_types value for use inside an
 * identity key: "*" and "missing" both mean "unrestricted" and must collapse to
 * the same token, and array order must not matter. */
function normalizeScopePart(value) {
  if (value == null || value === '*') return '*';
  if (Array.isArray(value)) return [...value].sort().join('|');
  return String(value);
}

/**
 * A modifier's stable identity (CONTRACT.md "Modifier identity is scoped, not a
 * name"). `name` alone is not unique in this catalog -- e.g. `value` is four
 * distinct gravityforms entries scoped to different field types -- so identity is
 * `name` + `applies_to.tags` + `applies_to.field_types`. Works on both a full
 * catalog modifier entry AND a capture record's modifier reference, since both
 * carry `name` + `applies_to`.
 */
function modifierIdentity(ref) {
  if (ref.id) return ref.id;
  const tags = normalizeScopePart(ref.applies_to?.tags);
  const fieldTypes = normalizeScopePart(ref.applies_to?.field_types);
  return `${ref.name}::${tags}::${fieldTypes}`;
}

/** EP42's stamp value (SPEC-entry-preview.md §3.J, §4.5) -- the generator derives
 * this from the schema's own `reparses_input` + `kind` data, using the same
 * predicate the picker's panel warns on interactively, so the two can never
 * drift apart. */
const HAZARD_REPARSES_INPUT_ORDER = 'reparses-input-order';

/** One entry per hazard value the generator can produce, so a stamped record can
 * never reach this page with nothing to say about itself. */
const HAZARD_ANNOTATIONS = {
  [HAZARD_REPARSES_INPUT_ORDER]:
    'This modifier re-reads the text the earlier steps produced and interprets it as a date. ' +
    'Because an earlier step already reshaped that text, the result is silently wrong — often ' +
    "today's date instead of the field's. Put the re-parsing modifier first so it reads the field's own value.",
};

function hazardAnnotation(hazard) {
  return hazard ? HAZARD_ANNOTATIONS[hazard] ?? null : null;
}

/**
 * EP66/EP68 (SPEC-entry-preview.md §3.N): does this tag's rendered value change
 * depending on which entry the reader is viewing? Absent (a future fragment, or
 * a third-party tag discovered at runtime with no catalog entry) defaults to
 * `true`, "may vary" -- the state EP66 argues cannot mislead. Every one of this
 * catalog's 48 shipped tags declares the field explicitly.
 */
function tagEntryDependent(tag) {
  return tag?.entry_dependent !== false;
}

/**
 * EP67: a modifier MAY carry its own `entry_dependent`, overriding the tag's
 * own answer for any render where that modifier is present -- shipped by
 * exactly one family (GravityMath's sum/count/avg/max/min turning a per-entry
 * field into a cross-entry aggregate), always downward (dependent ->
 * independent), never the reverse. Absent means no override.
 */
function hasEntryDependenceOverride(modifier) {
  return typeof modifier?.entry_dependent === 'boolean';
}

/**
 * EP69's state table, adapted for this page's row badge. A tag row always has
 * an answer; a modifier row only has one when it carries an EP67 override --
 * today exactly the five GravityMath aggregate entries. Every other modifier
 * returns null and the page renders no badge for it, because an ordinary
 * modifier's entry-dependence isn't a claim it can make about itself alone.
 */
function entryDependenceBadge(row) {
  if (row.type === 'tag') {
    return tagEntryDependent(row.entry)
      ? { text: 'Varies by entry', tone: 'entryVaries' }
      : { text: 'Solid value', tone: 'entrySolid' };
  }
  if (!hasEntryDependenceOverride(row.entry)) return null;
  return row.entry.entry_dependent === false
    ? { text: 'Forces a solid value', tone: 'entrySolid' }
    : { text: 'Forces varying by entry', tone: 'entryVaries' };
}

/**
 * The reference page's entry-dependence filter. 'all' matches every row.
 * 'varies' keeps entry-dependent tags (or defaulted ones) and NO modifier rows
 * -- EP67 shows no shipped modifier overrides toward "varies", so a modifier
 * row has no standalone claim to make there. 'solid' keeps solid tags PLUS
 * modifier rows that declare the EP67 override -- exactly the GravityMath
 * aggregate family, the single most interesting case this property produces.
 */
function matchesEntryDependenceFilter(row, filter) {
  if (filter === 'all') return true;
  if (row.type === 'tag') {
    return filter === 'solid' ? !tagEntryDependent(row.entry) : tagEntryDependent(row.entry);
  }
  if (filter === 'varies') return false;
  return hasEntryDependenceOverride(row.entry) && row.entry.entry_dependent === false;
}

/** Table-cell budget for the canonical-output preview column. Found live: some
 * `{all_fields}` captures run 15-18KB of raw HTML (the whole table GF emits),
 * and un-truncated one row's cell was taller than the viewport and pushed the
 * table's own header out of view -- the opposite of SPEC Q7's "scanning stays
 * fast". The full value stays available in the row's expanded CapturePair. */
const TABLE_OUTPUT_MAX_CHARS = 120;

function truncateForTable(text, maxChars = TABLE_OUTPUT_MAX_CHARS) {
  if (typeof text !== 'string') return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

/** Above this length, the expanded row's CapturePair collapses `out` behind a
 * <details> disclosure instead of dumping it inline -- same failure mode as the
 * table cell, one level down. */
const CAPTURE_OUT_INLINE_MAX_CHARS = 2000;

function isLongCaptureOutput(text, maxChars = CAPTURE_OUT_INLINE_MAX_CHARS) {
  return typeof text === 'string' && text.length > maxChars;
}

/** 68 of the artifact's 515 captures are HTML markup (`{all_fields}`,
 * `{pricing_fields}`, any `:wpautop`/`:html` transform) -- a table row or an
 * expanded capture showing that as a raw tag fragment reads as "code soup"
 * rather than "here's what this renders". Detected structurally (starts with an
 * opening tag), not by tag/modifier name, so a future HTML-emitting modifier is
 * covered automatically. */
const HTML_LIKE = /^\s*<[a-z][\s\S]*>/i;

function looksLikeHtml(text) {
  return typeof text === 'string' && HTML_LIKE.test(text);
}

/** Tags-stripped approximation for the scan table -- not a sanitizer, just a
 * display fallback so the collapsed row shows words instead of angle brackets. */
function stripHtmlForPreview(html) {
  if (typeof html !== 'string') return html;
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** What the table's "Canonical output" cell actually renders: HTML gets
 * stripped to text first, then everything goes through the same length budget. */
function previewForTable(text, maxChars = TABLE_OUTPUT_MAX_CHARS) {
  if (typeof text !== 'string') return text;
  const source = looksLikeHtml(text) ? stripHtmlForPreview(text) : text;
  return truncateForTable(source, maxChars);
}

function badge(text, tone) {
  const tones = {
    stub: { background: 'var(--ifm-color-warning-contrast-background)', color: 'var(--ifm-color-warning-dark)' },
    hazard: { background: 'var(--ifm-color-danger-contrast-background)', color: 'var(--ifm-color-danger-dark)' },
    kind: { background: 'var(--ifm-color-emphasis-200)', color: 'var(--ifm-color-emphasis-800)' },
    product: { background: 'var(--ifm-color-primary-contrast-background)', color: 'var(--ifm-color-primary-dark)' },
    // EP66-EP70 (SPEC-entry-preview.md §3.N): "varies" gets an informational
    // tone (the more common case, 26/48 tags -- nothing to flag); "solid"
    // reuses the same neutral gray as `kind` -- both read as "structural
    // fact", never alarm-colored the way stub/hazard are.
    entryVaries: { background: 'var(--ifm-color-info-contrast-background)', color: 'var(--ifm-color-info-dark)' },
    entrySolid: { background: 'var(--ifm-color-emphasis-200)', color: 'var(--ifm-color-emphasis-800)' },
  };
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        marginLeft: 6,
        whiteSpace: 'nowrap',
        ...tones[tone],
      }}
    >
      {text}
    </span>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${text}`}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      style={{
        marginLeft: 6,
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        color: 'var(--ifm-color-primary)',
        fontSize: 12,
      }}
    >
      {done ? '✓' : 'copy'}
    </button>
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
function scopeDescription(appliesTo) {
  if (!appliesTo) return 'any';
  if (Array.isArray(appliesTo.field_types)) return appliesTo.field_types.join(', ');
  if (Array.isArray(appliesTo.tags)) return appliesTo.tags.join(', ');
  return 'any';
}

/** 68 of the artifact's 515 captures are HTML markup (`{all_fields}`,
 * `{pricing_fields}`, any `:wpautop`/`:html` transform) -- shown as raw markup
 * this reads as code soup, not "here's what this renders". Rendered instead in
 * a sandboxed iframe (`sandbox=""` -- no scripts, no same-origin, nothing but
 * layout/paint) so what a reader sees is what GF/GravityView actually produce;
 * the literal captured markup is one click away via "View HTML source". */
function HtmlPreview({ html }) {
  const [showSource, setShowSource] = useState(false);
  return (
    <div>
      <iframe
        title="Rendered output"
        srcDoc={html}
        sandbox=""
        style={{ width: '100%', height: 240, border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 4, background: '#fff' }}
      />
      <button
        type="button"
        onClick={() => setShowSource((s) => !s)}
        style={{ marginTop: 4, cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--ifm-color-primary)', fontSize: 12, padding: 0 }}
      >
        {showSource ? 'Hide' : 'View'} HTML source ({html.length.toLocaleString()} characters)
      </button>
      {showSource ? (
        <pre style={{ maxHeight: 320, overflow: 'auto', background: 'var(--ifm-color-emphasis-100)', padding: 8, borderRadius: 4, marginTop: 4 }}>
          <code>{html}</code>
        </pre>
      ) : null}
    </div>
  );
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
      <summary style={{ cursor: 'pointer', color: 'var(--ifm-color-emphasis-600)' }}>
        {out.length.toLocaleString()} characters &mdash; expand to view
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
  if (!capture) return <p style={{ color: 'var(--ifm-color-emphasis-600)', fontStyle: 'italic' }}>No captured render for this entry yet.</p>;
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <code style={{ background: 'var(--ifm-color-emphasis-100)', padding: '2px 6px', borderRadius: 4 }}>{capture.in}</code>
        <span style={{ color: 'var(--ifm-color-emphasis-500)' }}>&rarr;</span>
        <CaptureOutput out={capture.out} />
        <CopyButton text={capture.in} />
        {capture.stub ? badge('placeholder, not CI-verified', 'stub') : null}
        {capture.hazard ? badge('ordering hazard', 'hazard') : null}
      </div>
      {capture.hazard ? <HazardNotice annotation={hazardAnnotation(capture.hazard)} /> : null}
      {capture.display ? (
        <div style={{ marginTop: 4, color: 'var(--ifm-color-emphasis-600)' }}>
          Renders relative to the reader's clock ({capture.display.kind}); the literal above is fixed to the capture fixture.
        </div>
      ) : null}
      <div style={{ marginTop: 4, color: 'var(--ifm-color-emphasis-600)' }}>
        Captured {capture.captured} against {Object.entries(capture.versions || {}).map(([p, v]) => `${p} ${v}`).join(', ')}.
      </div>
    </div>
  );
}

function TagRow({ entry, catalog, expanded, onToggle }) {
  const captures = capturesForTag(catalog, entry.name);
  const canonical = captures[0];
  const entryDependence = entryDependenceBadge({ type: 'tag', entry });
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <code>{entry.syntax}</code>
          {badge('tag', 'kind')}
        </td>
        <td>{entry.product}</td>
        <td>{entry.group}</td>
        <td style={{ fontSize: 13, color: 'var(--ifm-color-emphasis-600)' }}>
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
            <span style={{ color: 'var(--ifm-color-emphasis-500)' }}>&mdash;</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} style={{ background: 'var(--ifm-color-emphasis-0)' }}>
            {entry.description ? <p>{entry.description}</p> : null}
            {/* EP69/EP70: the same signal the panel's entry-cursor arrows show
                interactively, stated once here for a reader who only ever sees
                this static reference. */}
            <p style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>
              {entryDependence?.tone === 'entryVaries'
                ? 'Changes depending on which entry is being viewed.'
                : "Renders the same value no matter which entry is selected — a solid value, not read from the entry."}
            </p>
            <CapturePair capture={canonical} />
            {entry.requires ? (
              <p style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>
                Requires {Object.entries(entry.requires).map(([p, v]) => `${p} ${v}`).join(', ')}.
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ModifierRow({ entry, catalog, expanded, onToggle }) {
  const captures = capturesForModifier(catalog, entry);
  const canonical = captures[0];
  // EP67: only the five GravityMath aggregates return non-null -- every other
  // modifier inherits its entry-dependence from whatever tag it's attached to.
  const entryDependence = entryDependenceBadge({ type: 'modifier', entry });
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <code>:{entry.name}</code>
          {badge(entry.kind, 'kind')}
        </td>
        <td>{entry.product}</td>
        <td>{entry.arity === 1 ? entry.argument?.type || 'argument' : '—'}</td>
        <td style={{ fontSize: 13, color: 'var(--ifm-color-emphasis-600)' }}>{scopeDescription(entry.applies_to)}</td>
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
            <span style={{ color: 'var(--ifm-color-emphasis-500)' }}>&mdash;</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} style={{ background: 'var(--ifm-color-emphasis-0)' }}>
            {entry.description ? <p>{entry.description}</p> : null}
            {/* EP67: the one shipped case where a modifier changes the
                entry-dependence answer -- a per-entry field becoming a
                cross-entry total. */}
            {entryDependence ? (
              <p style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>
                <strong>{entryDependence.text}:</strong> the field this modifies normally changes per entry, but this
                modifier computes a total, count, or average across every entry in scope — not this one — so the
                result is the same no matter which entry is selected.
              </p>
            ) : null}
            {captures.length ? captures.map((c) => <CapturePair key={c.in} capture={c} />) : <CapturePair capture={null} />}
            <p style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>
              Applies to {Array.isArray(entry.applies_to?.tags) ? entry.applies_to.tags.join(', ') : 'every tag'}
              {entry.conflicts_with?.length ? ` · conflicts with ${entry.conflicts_with.join(', ')}` : ''}
              {entry.implies?.length ? ` · implies ${entry.implies.join(', ')}` : ''}
              {entry.requires ? ` · requires ${Object.entries(entry.requires).map(([p, v]) => `${p} ${v}`).join(', ')}` : ''}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MergeTagTable({ catalog }) {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('all');
  const [kind, setKind] = useState('all');
  // Its own control, not folded into `kind` -- entry-dependence (does the
  // VALUE change per entry?) is a different axis from Kind (what structural
  // role a token plays), and matchesEntryDependenceFilter()'s asymmetric
  // modifier rule can't be expressed as a flat equality check anyway.
  const [entryDependence, setEntryDependence] = useState('all');
  const [expandedKey, setExpandedKey] = useState(null);

  // One list: tags first (kind "tag" isn't a schema kind, but the filter treats
  // it as one so "show me everything about {date_created}" is one search away
  // from "show me every :transform"), then every modifier.
  const rows = useMemo(() => {
    if (!catalog) return [];
    const tagRows = (catalog.tags || []).map((t) => ({ type: 'tag', kind: 'tag', key: `tag:${t.name}`, entry: t }));
    const modRows = (catalog.modifiers || []).map((m) => ({
      type: 'modifier',
      kind: m.kind,
      key: `mod:${modifierIdentity(m)}`,
      entry: m,
    }));
    return [...tagRows, ...modRows];
  }, [catalog]);

  const products = useMemo(() => {
    if (!catalog) return [];
    return (catalog.products || []).map((p) => p.product).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const { entry, type, kind: rowKind } = row;
      if (product !== 'all' && entry.product !== product) return false;
      if (kind !== 'all' && rowKind !== kind) return false;
      if (!matchesEntryDependenceFilter(row, entryDependence)) return false;
      if (!q) return true;
      const haystack = [
        entry.name,
        entry.label,
        entry.syntax,
        entry.description,
        type === 'tag' ? entry.syntax : `:${entry.name}`,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, product, kind, entryDependence]);

  if (catalog === null) return <p>Loading merge tags…</p>;
  if (!rows.length) {
    return (
      <p>
        <em>The merge tag reference has no data yet. Check back once the schema and capture pass ship.</em>
      </p>
    );
  }

  return (
    <div>
      {catalog.captures?.status === 'stub' ? (
        <div
          style={{
            border: '1px solid var(--ifm-color-warning-dark)',
            background: 'var(--ifm-color-warning-contrast-background)',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          <strong>Placeholder data.</strong> The rendered outputs below are stand-ins, not verified against real PHP.
          They will be replaced once the CI capture pass ships (see SPEC-merge-tags-page.md Q1).
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '1rem 0' }}>
                {/* A placeholder is not an accessible name: not every screen reader exposes it as one,
            and it vanishes the moment the user types -- leaving the field unlabelled exactly when
            they most need to know what it filters. Same reason the selects carry aria-label. */}
<input
          type="search"
          aria-label="Search tags and modifiers"
          placeholder="Search tags and modifiers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '6px 10px', minWidth: 260, border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 6 }}
        />
        <select aria-label="Filter by product" value={product} onChange={(e) => setProduct(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="all">All kinds</option>
          <option value="tag">tag</option>
          {KIND_ORDER.filter((k) => k !== 'parameter').map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by whether the value varies per entry"
          value={entryDependence}
          onChange={(e) => setEntryDependence(e.target.value)}
          title="Whether a tag's rendered value changes depending on which entry is being viewed"
          style={{ padding: '6px 10px', borderRadius: 6 }}
        >
          <option value="all">Varies or solid</option>
          <option value="varies">Varies by entry</option>
          <option value="solid">Solid value</option>
        </select>
        <span style={{ color: 'var(--ifm-color-emphasis-600)', fontSize: 14 }}>
          {filtered.length} entries &middot; {catalog.captures?.count ?? 0} captured renders
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '900px' }}>
          <thead>
            <tr>
              <th>Syntax</th>
              <th style={{ width: '140px' }}>Product</th>
              <th style={{ width: '120px' }}>Kind / group</th>
              <th style={{ width: '180px' }}>Scope</th>
              <th>Label</th>
              <th>Canonical output</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const expanded = expandedKey === row.key;
              const toggle = () => setExpandedKey(expanded ? null : row.key);
              return row.type === 'tag' ? (
                <TagRow key={row.key} entry={row.entry} catalog={catalog} expanded={expanded} onToggle={toggle} />
              ) : (
                <ModifierRow key={row.key} entry={row.entry} catalog={catalog} expanded={expanded} onToggle={toggle} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MergeTagsPage() {
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    fetch('/api/merge-tags.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setCatalog)
      .catch(() => setCatalog({ tags: [], modifiers: [], products: [], captures: { records: [] } }));
  }, []);

  return (
    <Layout
      title="GravityKit Merge Tags"
      description="Every merge tag and modifier across GravityKit and the products it extends, with real rendered examples."
    >
      <main className="container margin-vert--lg">
        <h1>Merge Tags</h1>
        <p>
          Every merge tag GravityKit and the products it extends can resolve, every modifier each one accepts, and a
          real captured render for each &mdash; verified against actual PHP on a frozen fixture, not invented.
          Search, or filter by product and kind. This table is generated from the same schema the merge tag picker
          in wp-admin uses, so it never drifts from what the picker offers.
        </p>
        <p>
          Want to try a tag against your own data? The merge tag picker in wp-admin renders live, against your
          site's real entries &mdash; this page can't do that (there's no site behind it), so it documents instead
          of guessing.
        </p>

        <MergeTagTable catalog={catalog} />
      </main>
    </Layout>
  );
}

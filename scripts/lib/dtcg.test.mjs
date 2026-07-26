/**
 * Unit tests for the DTCG token emitter. Run: node --test scripts/lib/
 *
 * The fixture below is a synthetic registry covering every branch of the type
 * rule table, including the forms that have no DTCG representation. Counts here
 * are deliberately small and checkable by hand; the full 245-record registry is
 * validated at build time by generate-tokens.mjs against the same schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  EXTENSION_KEY,
  SCHEMA_URL,
  quantize,
  channelToComponent,
  srgb,
  dimension,
  splitTopLevel,
  anchorFor,
  classify,
  indexRecords,
  buildDocument,
} from './dtcg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Minimal registry record; every field the emitter reads has a default. */
function rec(slug, cssVar, value, extra = {}) {
  return {
    slug,
    css_var: cssVar,
    default: value,
    category: slug.split('.')[0],
    group: 'test',
    studio: false,
    private: false,
    syntax: '*',
    desc: '',
    control: 'text',
    hover_slug: null,
    options: null,
    units: null,
    min: null,
    max: null,
    step: null,
    extra_css_vars: null,
    register_property: true,
    property_initial: null,
    ...extra,
  };
}

const FIXTURE = [
  rec('color.primary', '--gv-color-primary', '#204ce5', { syntax: '<color>', desc: 'Brand.', studio: true, hover_slug: 'color.primary_hover' }),
  rec('color.primary_hover', '--gv-color-primary-hover', '#1c44ce', { syntax: '<color>' }),
  rec('color.link', '--gv-color-link', 'var(--gv-color-primary)'),
  rec('color.ghost', '--gv-color-ghost', 'transparent'),
  rec('color.mixed', '--gv-color-mixed', 'color-mix(in oklch, var(--gv-color-primary) 90%, #000)'),
  rec('dimensions.space_4', '--gv-space-4', '16px', { syntax: '<length>', desc: 'Base step.' }),
  rec('dimensions.space_alias', '--gv-space-alias', 'var(--gv-space-4)'),
  rec('dimensions.zero_length', '--gv-zero-length', '0', { syntax: '<length>' }),
  rec('dimensions.zero_star', '--gv-zero-star', '0'),
  rec('dimensions.pct', '--gv-pct', '30%', { syntax: '<length-percentage>' }),
  rec('dimensions.em', '--gv-em', '0.05em'),
  rec('dimensions.clamped', '--gv-clamped', 'clamp(140px, 50vw, 200px)'),
  rec('typography.font_size_base', '--gv-font-size-base', '1rem', { syntax: '<length>' }),
  rec('typography.font_size_sm', '--gv-font-size-sm', 'calc(var(--gv-font-size-base) * 0.875)'),
  rec('typography.font_weight_bold', '--gv-font-weight-bold', '700', { syntax: '<integer>' }),
  rec('typography.font_family', '--gv-font-family', 'inherit'),
  rec('layout.z_modal', '--gv-z-modal', '100000', { syntax: '<integer>' }),
  rec('layout.opacity_50', '--gv-opacity-50', '0.5', { syntax: '<number>' }),
  rec('layout.unset', '--gv-unset', '', { syntax: '<integer>', register_property: false }),
  rec('layout.align', '--gv-align', 'stretch'),
  rec('motion.multiplier', '--gv-motion-multiplier', '1', { syntax: '<number>' }),
  rec('motion.transition_fast', '--gv-transition-fast', 'calc(0.15s * var(--gv-motion-multiplier))'),
  rec('motion.easing_standard', '--gv-easing-standard', 'cubic-bezier(0.2, 0.0, 0.0, 1.0)'),
  rec('motion.easing_linear', '--gv-easing-linear', 'linear'),
  rec('border.style', '--gv-border-style', 'solid', { options: ['solid', 'dashed', 'none'] }),
  rec('border.focus_ring_width', '--gv-focus-ring-width', '2px', { syntax: '<length>' }),
  rec('shadow.shadow_color', '--gv-shadow-color', '18 25 97'),
  rec('shadow.shadow_alpha', '--gv-shadow-alpha', '0.1', { syntax: '<number>' }),
  rec('shadow.shadow_md', '--gv-shadow-md', '0 1px 3px rgb(var(--gv-shadow-color) / var(--gv-shadow-alpha)), 0 1px 2px rgb(var(--gv-shadow-color) / calc(var(--gv-shadow-alpha) * 0.6))'),
  rec('shadow.shadow_focus', '--gv-shadow-focus', '0 0 0 var(--gv-focus-ring-width) var(--gv-color-primary)'),
  rec('shadow.none', '--gv-shadow-none', 'none'),
];

const build = (records = FIXTURE) => buildDocument(records, { productId: 'gravityview', repo: 'GravityKit/GravityView' });
const ctxFor = (records = FIXTURE) => indexRecords(records, 'gravityview');
const bySlug = (records = FIXTURE) => new Map(records.map((r) => [r.slug, r]));
const fateOf = (slug, records = FIXTURE) => classify(bySlug(records).get(slug), ctxFor(records));

// --- numeric helpers -------------------------------------------------------

test('quantize rounds half away from zero and never yields -0', () => {
  assert.equal(quantize(0.5, 0), 1);
  assert.equal(quantize(-0.5, 0), -1);
  assert.equal(quantize(1.23456789, 4), 1.2346);
  assert.equal(Object.is(quantize(-0.0001, 2), 0), true);
  assert.throws(() => quantize(Number.NaN, 2));
});

test('4dp sRGB components round-trip every 8-bit channel exactly', () => {
  for (let byte = 0; byte <= 255; byte += 1) {
    assert.equal(Math.round(channelToComponent(byte) * 255), byte, `channel ${byte}`);
  }
});

test('hex is emitted only at full opacity', () => {
  assert.equal(srgb([32, 76, 229], 1, '#204ce5').hex, '#204ce5');
  assert.equal('hex' in srgb([0, 0, 0], 0), false);
  assert.equal('hex' in srgb([18, 25, 97], 0.06), false);
});

test('dimension rejects units outside the DTCG pair', () => {
  assert.deepEqual(dimension(16, 'px'), { value: 16, unit: 'px' });
  assert.throws(() => dimension(30, '%'));
  assert.throws(() => dimension(1, 'em'));
});

test('splitTopLevel ignores separators nested in parentheses', () => {
  assert.deepEqual(splitTopLevel('0 1px rgb(a / calc(b * 0.6)), 0 2px rgb(c)'), [
    '0 1px rgb(a / calc(b * 0.6))',
    '0 2px rgb(c)',
  ]);
});

test('anchorFor matches the published token reference anchors', () => {
  assert.equal(anchorFor('color.primary'), 'color-primary');
  assert.equal(anchorFor('typography.font_size_xs'), 'typography-font-size-xs');
});

// --- type derivation -------------------------------------------------------

test('colors: hex, keyword, and the channel triplet that is not a color', () => {
  const hex = fateOf('color.primary');
  assert.equal(hex.type, 'color');
  assert.deepEqual(hex.value, { colorSpace: 'srgb', components: [0.1255, 0.298, 0.898], alpha: 1, hex: '#204ce5' });

  const ghost = fateOf('color.ghost');
  assert.deepEqual(ghost.value, { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0 });

  // `18 25 97` only resolves inside rgb(); emitting it as a color would make a
  // consumer write `--gv-shadow-color: #121961` and break every shadow.
  assert.deepEqual(fateOf('shadow.shadow_color'), { kind: 'excluded', reason: 'css-channel-triplet-not-a-color' });
});

test('dimensions: px, resolved calc, implicit zero unit, and rejected units', () => {
  assert.deepEqual(fateOf('dimensions.space_4').value, { value: 16, unit: 'px' });
  assert.deepEqual(fateOf('typography.font_size_sm').value, { value: 0.875, unit: 'rem' });
  assert.deepEqual(fateOf('typography.font_size_sm').derivation, { method: 'resolved-css-calc', from: ['typography.font_size_base'] });
  assert.deepEqual(fateOf('dimensions.zero_length').value, { value: 0, unit: 'px' });
  assert.deepEqual(fateOf('dimensions.zero_star').value, { value: 0, unit: 'px' });
  assert.equal(fateOf('dimensions.pct').reason, 'unsupported-css-unit');
  assert.equal(fateOf('dimensions.em').reason, 'unsupported-css-unit');
  assert.equal(fateOf('dimensions.clamped').reason, 'css-function-viewport-relative');
});

test('numbers: font weights are gated on name and range, z-index stays a number', () => {
  assert.deepEqual(fateOf('typography.font_weight_bold'), { kind: 'token', type: 'fontWeight', value: 700 });
  assert.deepEqual(fateOf('layout.z_modal'), { kind: 'token', type: 'number', value: 100000 });
  assert.deepEqual(fateOf('layout.opacity_50'), { kind: 'token', type: 'number', value: 0.5 });
});

test('motion: duration keeps the authored unit; linear is the identical curve', () => {
  const fast = fateOf('motion.transition_fast');
  assert.equal(fast.type, 'duration');
  assert.deepEqual(fast.value, { value: 0.15, unit: 's' });
  assert.deepEqual(fateOf('motion.easing_standard').value, [0.2, 0, 0, 1]);
  assert.deepEqual(fateOf('motion.easing_linear').value, [0, 0, 1, 1]);
});

test('strokeStyle emits the default, never an out-of-enum option', () => {
  assert.deepEqual(fateOf('border.style'), { kind: 'token', type: 'strokeStyle', value: 'solid' });
  assert.equal(fateOf('shadow.none').reason, 'no-dtcg-encoding-for-none');
});

test('values with no DTCG type are excluded with a reason', () => {
  assert.equal(fateOf('color.mixed').reason, 'css-color-mix');
  assert.equal(fateOf('typography.font_family').reason, 'css-keyword-no-dtcg-type');
  assert.equal(fateOf('layout.align').reason, 'css-keyword-no-dtcg-type');
  assert.equal(fateOf('layout.unset').reason, 'no-value');
});

test('aliases take the target type and address it by full path', () => {
  assert.deepEqual(fateOf('color.link'), { kind: 'token', type: 'color', value: '{gravityview.color.primary}' });
  assert.deepEqual(fateOf('dimensions.space_alias'), { kind: 'token', type: 'dimension', value: '{gravityview.dimensions.space_4}' });
});

test('shadows: multi-layer flattens colour, single layer keeps sub-value aliases', () => {
  const md = fateOf('shadow.shadow_md');
  assert.equal(md.type, 'shadow');
  assert.equal(Array.isArray(md.value), true);
  assert.equal(md.value.length, 2);
  assert.deepEqual(md.value[0].color, { colorSpace: 'srgb', components: [0.0706, 0.098, 0.3804], alpha: 0.1 });
  assert.deepEqual(md.value[1].color.alpha, 0.06);
  assert.deepEqual(md.value[0].offsetY, { value: 1, unit: 'px' });
  assert.deepEqual(md.value[0].spread, { value: 0, unit: 'px' });
  assert.deepEqual(md.derivation.from, ['shadow.shadow_color', 'shadow.shadow_alpha']);

  // Fully expressible: both sub-values become references, so nothing is resolved.
  const focus = fateOf('shadow.shadow_focus');
  assert.equal(Array.isArray(focus.value), false);
  assert.equal(focus.value.spread, '{gravityview.border.focus_ring_width}');
  assert.equal(focus.value.color, '{gravityview.color.primary}');
  assert.equal(focus.derivation.from, undefined);
});

// --- document assembly -----------------------------------------------------

test('every record has a fate and the counts reconcile', () => {
  const { report } = build();
  assert.equal(report.total, FIXTURE.length);
  assert.equal(report.tokens + report.metadataOnly.length, FIXTURE.length);
  assert.equal(report.metadataOnly.length, 9);
});

test('unrepresentable records become groups: no $value, but path and CSS survive', () => {
  const { document } = build();
  const node = document.gravityview.dimensions.pct;
  assert.equal('$value' in node, false);
  assert.equal('$type' in node, false);
  assert.match(node.$description, /Not emitted as a DTCG token \(unsupported-css-unit\)\. CSS value: 30%/);
  const ext = node.$extensions[EXTENSION_KEY];
  assert.equal(ext.representable, false);
  assert.equal(ext.cssValue, '30%');
  assert.equal(ext.cssVar, '--gv-pct');
});

test('resolved values carry the provenance suffix; verbatim ones do not', () => {
  const { document } = build();
  assert.match(
    document.gravityview.typography.font_size_sm.$description,
    /Resolved at GravityView defaults from CSS: calc\(var\(--gv-font-size-base\) \* 0\.875\)$/,
  );
  assert.equal(document.gravityview.dimensions.space_4.$description, 'Base step.');
  assert.equal('$description' in document.gravityview.color.link, false);
});

test('extensions carry the registry record and a non-derivable cssVar', () => {
  const { document } = build();
  const ext = document.gravityview.color.primary.$extensions[EXTENSION_KEY];
  assert.equal(ext.slug, 'color.primary');
  assert.equal(ext.cssVar, '--gv-color-primary');
  assert.equal(ext.cssValue, '#204ce5');
  assert.equal(ext.studio, true);
  assert.equal(ext.private, false);
  assert.equal(ext.hoverToken, 'gravityview.color.primary_hover');
  assert.equal(ext.docs, 'https://www.gravitykit.dev/gravityview/css-tokens#color-primary');
  assert.equal(document.gravityview.border.style.$extensions[EXTENSION_KEY].options.includes('none'), true);
  assert.equal(document.gravityview.layout.unset.$extensions[EXTENSION_KEY].registerProperty, false);
});

test('$extensions is a single vendor-scoped key everywhere', () => {
  const { document } = build();
  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (node.$extensions) assert.deepEqual(Object.keys(node.$extensions), [EXTENSION_KEY]);
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) visit(v);
  };
  visit(document);
});

test('output is deterministic: no timestamp, stable ordering', () => {
  const a = JSON.stringify(build().document);
  const b = JSON.stringify(build().document);
  assert.equal(a, b);
  assert.equal(a.includes('"generated"'), false);
});

test('emitted numbers never serialize in exponential notation', () => {
  const walk = (node) => {
    if (typeof node === 'number') {
      assert.equal(/[eE]/.test(String(node)), false, `exponential: ${node}`);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(build().document);
});

// --- hard failures ---------------------------------------------------------

test('a dangling alias fails the build rather than emitting a broken reference', () => {
  const records = [...FIXTURE, rec('color.nowhere', '--gv-color-nowhere', 'var(--gv-does-not-exist)')];
  assert.throws(() => build(records), /A-6/);
});

test('an alias cycle fails the build', () => {
  const records = [
    rec('color.a', '--gv-a', 'var(--gv-b)'),
    rec('color.b', '--gv-b', 'var(--gv-a)'),
  ];
  assert.throws(() => build(records), /A-7/);
});

test('illegal names fail the build', () => {
  assert.throws(() => build([rec('my.tok{en}', '--gv-x', '#000000')]), /A-4/);
  assert.throws(() => build([rec('$weird.name', '--gv-x', '#000000')]), /A-4/);
  // Integer-like keys would be reordered by JS object enumeration.
  assert.throws(() => build([rec('space.1', '--gv-x', '16px')]), /A-4/);
});

test('a case-only sibling collision fails the build', () => {
  const records = [rec('color.primary', '--gv-a', '#000000'), rec('color.Primary', '--gv-b', '#111111')];
  assert.throws(() => build(records), /A-5/);
});

test('a token whose slug is a prefix of another fails rather than silently nesting', () => {
  const records = [rec('color.brand', '--gv-a', '#000000'), rec('color.brand.deep', '--gv-b', '#111111')];
  assert.throws(() => build(records), /A-4/);
});

test('the set of shadow-typed tokens is pinned', () => {
  const { document } = build();
  const shadows = Object.entries(document.gravityview.shadow)
    .filter(([, node]) => node.$type === 'shadow')
    .map(([name]) => name);
  // Adding or losing a shadow must show up as a test diff, not a silent change.
  assert.deepEqual(shadows.sort(), ['shadow_focus', 'shadow_md']);
});

test('no emitted token carries a CSS fragment as its value', () => {
  // A bare `R G B` triplet only resolves inside rgb(). Substituting a rendered
  // hex for one produces invalid CSS, so none may reach a $value.
  const { document, report } = build();
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const ext = node.$extensions?.[EXTENSION_KEY];
    if (ext && '$value' in node) {
      assert.equal(
        /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(ext.cssValue), false,
        `${path} emits a channel triplet as a token`,
      );
    }
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, `${path}.${k}`);
  };
  walk(document, 'root');
  assert.equal(report.metadataOnly.some((m) => m.reason === 'css-channel-triplet-not-a-color'), true);
});

test('a line break or comment terminator in registry text fails the build', () => {
  assert.throws(() => build([rec('color.x', '--gv-x', '#000000', { desc: 'ends the comment */ oops' })]), /A-14/);
  assert.throws(() => build([rec('color.y', '--gv-y', '#000000', { desc: 'two\nlines' })]), /A-14/);
});

test('an unrecognised value form fails the build instead of demoting silently', () => {
  const allow = { knownUnknownForms: ['typography.font_family'] };
  const opts = { productId: 'gravityview', ...allow };

  // Baseline: the allowlisted keyword is tolerated.
  assert.doesNotThrow(() => buildDocument([rec('typography.font_family', '--gv-font-family', 'inherit')], opts));

  // The real regression this guards: rewriting the shadows to color-mix() upstream.
  // Without the tripwire these demote from shadow composites to metadata-only
  // groups and the build still succeeds.
  const colorMixShadow = rec(
    'shadow.shadow_md',
    '--gv-shadow-md',
    '0 1px 3px color-mix(in srgb, var(--gv-shadow-color) calc(var(--gv-shadow-alpha) * 100%), transparent)',
  );
  assert.throws(
    () => buildDocument([colorMixShadow], opts),
    /Unrecognised token value form\(s\): shadow\.shadow_md/,
  );
});

test('a filter-added category emits without hardcoding the shipped ones', () => {
  const { document, report } = build([rec('mytheme.accent', '--gv-mytheme-accent', '#ff0000', { syntax: '<color>' })]);
  assert.equal(report.tokens, 1);
  assert.equal(document.gravityview.mytheme.accent.$type, 'color');
});

// --- conformance against the DTCG's own schema -----------------------------

test('the emitted document validates against the official DTCG 2025.10 schema', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'dtcg-format-2025.10.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const { document } = build();
  const ok = validate(document);
  assert.equal(ok, true, JSON.stringify(validate.errors?.slice(0, 8), null, 1));
  assert.equal(document.$schema, SCHEMA_URL);
});

test('the vendored schema is the real one and actually rejects invalid tokens', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'dtcg-format-2025.10.schema.json'), 'utf8'));
  assert.equal(schema.$id, SCHEMA_URL);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  // A green validation is only meaningful if the schema rejects these.
  assert.equal(validate({ t: { $type: 'string', $value: 'x' } }), false, 'invented $type');
  assert.equal(validate({ t: { $type: 'color', $value: '#204ce5' } }), false, 'bare hex colour');
  assert.equal(validate({ t: { $type: 'dimension', $value: { value: 30, unit: '%' } } }), false, 'percent dimension');
  assert.equal(validate({ t: { $type: 'strokeStyle', $value: 'none' } }), false, 'none stroke style');
  assert.equal(validate({ 'a.b': { $type: 'number', $value: 1 } }), false, 'dotted name');
  assert.equal(validate({ t: { $type: 'number', $value: 1 } }), true, 'control');
});

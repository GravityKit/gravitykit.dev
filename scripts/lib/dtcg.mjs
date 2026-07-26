/**
 * GravityKit CSS token registry -> Design Tokens Community Group format.
 *
 * Emits the interop artifact published at /api/css-tokens.tokens.json, targeting
 * the DTCG "Design Tokens Format Module 2025.10" Final Community Group Report
 * and its companion Color module. This is a SECOND artifact: the flat
 * /api/css-tokens.json remains the canonical lossless record and is untouched.
 *
 * Three properties of the source registry drive nearly every decision here:
 *
 *   1. Slugs contain dots (`color.primary`), and DTCG forbids `.` in a name
 *      because it is the alias separator. Slugs therefore become nested groups.
 *   2. `css_var` is NOT derivable from the slug -- the registry reorders and
 *      rewrites segments (`border.entry_color` -> `--gv-entry-border-color`), and
 *      only ~21% match a naive transform. It is carried as data; a consumer that
 *      rebuilds variable names from token paths renames GravityView's public CSS
 *      API. Read $extensions["com.gravitykit.tokens"].cssVar.
 *   3. Some CSS values have no DTCG representation at all (`clamp()`, `30%`,
 *      `color-mix()`). Those are emitted as metadata-only GROUPS -- an object
 *      with $description and $extensions and no $value -- so the path and the raw
 *      CSS survive for a curious consumer while token-only consumers skip them.
 *
 * Every exported function is pure so it can be unit tested without touching the
 * filesystem; generate-tokens.mjs wires the result to disk.
 *
 * The rules below are load-bearing and each was verified against a real consumer
 * (Style Dictionary, Terrazzo) and the DTCG's own published JSON Schema, not
 * inferred. dtcg.test.mjs is the executable statement of what must stay true.
 */

/** The one reverse-domain vendor key. DTCG requires extensions be vendor-scoped. */
export const EXTENSION_KEY = 'com.gravitykit.tokens';

/** Bumped whenever the type-derivation or value-construction rules change. */
export const MAPPING_VERSION = 1;

/** The DTCG's own published schema for the format version we target. */
export const SCHEMA_URL = 'https://www.designtokens.org/schemas/2025.10/format.json';

/** The closed set of DTCG 2025.10 types. Anything else is a bug, not a token. */
export const DTCG_TYPES = new Set([
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier',
  'number', 'strokeStyle', 'border', 'transition', 'shadow', 'gradient', 'typography',
]);

/** The eight legal string stroke styles. `none` is deliberately absent. */
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset']);

/** DTCG dimension permits exactly two units. Everything else is unrepresentable. */
const DIMENSION_UNITS = new Set(['px', 'rem']);

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const RE_ALIAS = new RegExp(String.raw`^var\(\s*(--[a-z0-9_-]+)\s*\)$`);
const RE_HEX = /^#[0-9a-fA-F]{6}$/;
const RE_TRIPLET = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/;
const RE_BEZIER = new RegExp(String.raw`^cubic-bezier\(\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\)$`);
const RE_LENGTH = new RegExp(String.raw`^(${NUM})(px|rem)$`);
// Deliberately generic: enumerating CSS units guarantees the list goes stale
// (cqw, dvh, rex... keep arriving) and an unlisted unit would fall through to
// the catch-all with a misleading reason. R9 consumes px/rem before this runs.
const RE_ANY_UNIT = new RegExp(String.raw`^(${NUM})([a-zA-Z%]+)$`);
const RE_BARE_NUM = new RegExp(String.raw`^${NUM}$`);
const RE_CALC_SCALE = new RegExp(String.raw`^calc\(\s*var\(\s*(--[a-z0-9_-]+)\s*\)\s*\*\s*(${NUM})\s*\)$`);
const RE_CALC_TIME = new RegExp(String.raw`^calc\(\s*(${NUM})(s|ms)?\s*\*\s*var\(\s*(--[a-z0-9_-]+)\s*\)\s*\)$`);
const RE_FONT_WEIGHT_NAME = /(^|_)font_weight(_|$)/;

/**
 * Round half away from zero at `digits` decimals.
 *
 * Math.round breaks ties toward +Infinity, which is asymmetric across zero and
 * would quantize -0.5 and 0.5 to different magnitudes. Shadow spreads are
 * negative, so the asymmetry is reachable.
 *
 * @param {number} x
 * @param {number} digits
 * @returns {number}
 */
export function quantize(x, digits) {
  if (!Number.isFinite(x)) throw new Error(`non-finite number: ${x}`);
  const f = 10 ** digits;
  const r = (x < 0 ? -1 : 1) * Math.floor(Math.abs(x) * f + 0.5) / f;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * 8-bit sRGB channel -> the DTCG [0,1] component, at 4 decimals.
 *
 * 4dp is lossless for 8-bit input: adjacent channels are 1/255 apart (~0.003922,
 * half-gap 0.001961) while the maximum 4dp error is 0.00005, so
 * Math.round(component * 255) always recovers the original byte.
 *
 * @param {number} byte 0-255
 * @returns {number}
 */
export function channelToComponent(byte) {
  return quantize(byte / 255, 4);
}

/**
 * Build a DTCG color $value from 8-bit channels.
 *
 * `hex` is emitted only at full opacity. The Color module constrains the hex
 * fallback to 6 digits, which cannot carry alpha, so pairing one with alpha < 1
 * hands a hex-reading consumer an opaque colour where a translucent one was
 * meant -- `transparent` would render as solid black.
 *
 * @param {[number, number, number]} rgb 0-255 channels
 * @param {number} alpha 0-1
 * @param {string} [hex] lowercase `#rrggbb`; derived from rgb when omitted
 * @returns {object}
 */
export function srgb(rgb, alpha = 1, hex = undefined) {
  const value = {
    colorSpace: 'srgb',
    components: rgb.map(channelToComponent),
    alpha: quantize(alpha, 4),
  };
  if (value.alpha === 1) {
    value.hex = hex ?? `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toLowerCase();
  }
  return value;
}

/**
 * @param {number} value
 * @param {'px'|'rem'} unit
 * @returns {{value: number, unit: string}}
 */
export function dimension(value, unit) {
  if (!DIMENSION_UNITS.has(unit)) throw new Error(`illegal dimension unit: ${unit}`);
  return { value: quantize(value, 6), unit };
}

/** Split a comma-separated CSS list without splitting inside parentheses. */
export function splitTopLevel(input, separator = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** A registry record keyed for lookup, plus the derived DTCG path segments. */
function indexRecords(records, productId) {
  const bySlug = new Map();
  const byVar = new Map();
  for (const r of records) {
    if (bySlug.has(r.slug)) throw new Error(`A-3: duplicate slug ${r.slug}`);
    if (byVar.has(r.css_var)) throw new Error(`A-3: duplicate css_var ${r.css_var}`);
    bySlug.set(r.slug, r);
    byVar.set(r.css_var, r);
  }
  const pathOf = (slug) => [productId, ...String(slug).split('.')];
  return { bySlug, byVar, pathOf };
}

/**
 * Validate every path segment against DTCG's name rules.
 *
 * `$` prefix is reserved for format properties; `{`, `}` and `.` are the alias
 * syntax. There is no conformant rewrite for a name that uses them, so this
 * fails the build rather than mangling a public identifier.
 */
function assertNames(records, pathOf) {
  const siblings = new Map();
  for (const r of records) {
    const segments = pathOf(r.slug);
    for (const [i, seg] of segments.entries()) {
      if (seg === '') throw new Error(`A-4: empty path segment in ${r.slug}`);
      if (seg.startsWith('$')) throw new Error(`A-4: segment "${seg}" starts with $ in ${r.slug}`);
      if (/[{}.]/.test(seg)) throw new Error(`A-4: segment "${seg}" contains {, } or . in ${r.slug}`);
      const parent = segments.slice(0, i).join('.');
      const key = `${parent}.${seg.toLowerCase()}`;
      const seen = siblings.get(key);
      if (seen !== undefined && seen !== seg) {
        throw new Error(`A-5: case-only sibling collision "${seen}" vs "${seg}" under ${parent}`);
      }
      siblings.set(key, seg);
    }
  }
  const slugs = new Set(records.map((r) => r.slug));
  for (const slug of slugs) {
    for (const other of slugs) {
      if (other !== slug && other.startsWith(`${slug}.`)) {
        throw new Error(`A-4: slug "${slug}" is a prefix of "${other}"; $root relocation is not implemented`);
      }
    }
  }
}

/** Parse one CSS length in a shadow layer into a dimension, or an alias string. */
function shadowLength(raw, ctx, aliasFor) {
  const alias = RE_ALIAS.exec(raw);
  if (alias) {
    const target = ctx.byVar.get(alias[1]);
    if (!target) throw new Error(`A-6: shadow length references unknown ${alias[1]}`);
    return aliasFor(target);
  }
  if (raw === '0') return dimension(0, 'px');
  const len = RE_LENGTH.exec(raw);
  if (!len) return null;
  return dimension(Number(len[1]), len[2]);
}

/**
 * Parse a CSS box-shadow list into DTCG shadow layers.
 *
 * Two colour forms occur in the registry. `var(--x)` referencing a colour token
 * becomes a DTCG alias, which is lossless. `rgb(var(--channels) / <alpha>)`
 * cannot be: DTCG has no way to carry a channel triplet and a separately
 * referenced alpha, so both are resolved to literals and the dependency is
 * recorded so the value can be traced back.
 *
 * @returns {{layers: object[], from: string[]}|null} null when the value does not parse
 */
function parseShadow(value, ctx, aliasFor) {
  const from = new Set();
  const layers = [];

  for (const layer of splitTopLevel(value)) {
    const parts = splitTopLevel(layer, ' ').filter(Boolean);
    if (parts.length < 3) return null;

    const colorRaw = parts[parts.length - 1];
    const lengths = parts.slice(0, -1);
    if (lengths.length < 2 || lengths.length > 4) return null;

    let color;
    const colorAlias = RE_ALIAS.exec(colorRaw);
    const rgbForm = /^rgb\(\s*var\(\s*(--[a-z0-9_-]+)\s*\)\s*\/\s*(.+?)\s*\)$/.exec(colorRaw);
    if (colorAlias) {
      const target = ctx.byVar.get(colorAlias[1]);
      if (!target) throw new Error(`A-6: shadow colour references unknown ${colorAlias[1]}`);
      color = aliasFor(target);
    } else if (rgbForm) {
      const channels = ctx.byVar.get(rgbForm[1]);
      if (!channels) throw new Error(`A-6: shadow colour references unknown ${rgbForm[1]}`);
      const triplet = RE_TRIPLET.exec(String(channels.default).trim());
      if (!triplet) return null;
      from.add(channels.slug);

      const alphaExpr = rgbForm[2];
      let alpha;
      const alphaAlias = RE_ALIAS.exec(alphaExpr);
      const alphaScaled = RE_CALC_SCALE.exec(alphaExpr);
      if (alphaAlias) {
        const rec = ctx.byVar.get(alphaAlias[1]);
        if (!rec) throw new Error(`A-6: shadow alpha references unknown ${alphaAlias[1]}`);
        from.add(rec.slug);
        alpha = Number(rec.default);
      } else if (alphaScaled) {
        const rec = ctx.byVar.get(alphaScaled[1]);
        if (!rec) throw new Error(`A-6: shadow alpha references unknown ${alphaScaled[1]}`);
        from.add(rec.slug);
        alpha = Number(rec.default) * Number(alphaScaled[2]);
      } else {
        return null;
      }
      if (!Number.isFinite(alpha)) return null;
      color = srgb([Number(triplet[1]), Number(triplet[2]), Number(triplet[3])], alpha);
    } else {
      return null;
    }

    const [offsetX, offsetY] = lengths;
    const parsed = {
      color,
      offsetX: shadowLength(offsetX, ctx, aliasFor),
      offsetY: shadowLength(offsetY, ctx, aliasFor),
      blur: lengths[2] !== undefined ? shadowLength(lengths[2], ctx, aliasFor) : dimension(0, 'px'),
      spread: lengths[3] !== undefined ? shadowLength(lengths[3], ctx, aliasFor) : dimension(0, 'px'),
    };
    if (Object.values(parsed).some((v) => v === null)) return null;
    layers.push(parsed);
  }

  return layers.length ? { layers, from: [...from] } : null;
}

/**
 * Decide a record's fate: an emitted token with a $type and $value, or an
 * exclusion with a machine-readable reason.
 *
 * Rules are ordered and first match wins; see the mapping spec's rule table.
 *
 * @param {object} record
 * @param {object} ctx
 * @param {Set<string>} [stack] slugs currently being resolved, for cycle detection
 * @returns {{kind: 'token', type: string, value: any, derivation?: object}
 *          |{kind: 'excluded', reason: string}}
 */
export function classify(record, ctx, stack = new Set()) {
  const d = String(record.default ?? '').trim();
  const name = String(record.slug).split('.').slice(1).join('.');
  const syn = record.syntax;
  const cat = record.category;
  const exclude = (reason) => ({ kind: 'excluded', reason });
  const aliasFor = (target) => `{${ctx.pathOf(target.slug).join('.')}}`;

  // R1 -- intentionally unset so a var() fallback elsewhere stays live.
  if (d === '') return exclude('no-value');

  // R2 -- a whole-value var() is the only form DTCG can express as a reference.
  const alias = RE_ALIAS.exec(d);
  if (alias) {
    const target = ctx.byVar.get(alias[1]);
    if (!target) throw new Error(`A-6: alias target ${alias[1]} not found (${record.slug})`);
    if (stack.has(target.slug)) throw new Error(`A-7: alias cycle through ${record.slug}`);
    const resolved = classify(target, ctx, new Set([...stack, record.slug]));
    if (resolved.kind !== 'token') return exclude('alias-target-unrepresentable');
    return { kind: 'token', type: resolved.type, value: aliasFor(target) };
  }

  // R3 / R4 / R5 -- colours.
  if (RE_HEX.test(d)) {
    const rgb = [d.slice(1, 3), d.slice(3, 5), d.slice(5, 7)].map((h) => parseInt(h, 16));
    return { kind: 'token', type: 'color', value: srgb(rgb, 1, d.toLowerCase()), derivation: { method: 'srgb-from-hex' } };
  }
  if (d === 'transparent') {
    return {
      kind: 'token', type: 'color', value: srgb([0, 0, 0], 0),
      derivation: { method: 'css-keyword-equivalent', note: 'CSS transparent == rgb(0 0 0 / 0)' },
    };
  }
  // A bare `R G B` triplet is not a CSS colour -- it is a channel list that only
  // resolves inside rgb(). Typing it `color` would make a consumer emit
  // `--gv-shadow-color: #121961`, turning GravityView's
  // `rgb(var(--gv-shadow-color) / <alpha>)` into invalid CSS and silently
  // killing every shadow. The shadow tokens that consume it read the registry
  // directly, so quarantining it costs nothing.
  if (RE_TRIPLET.test(d)) return exclude('css-channel-triplet-not-a-color');

  // R6 / R7 -- easing.
  const bezier = RE_BEZIER.exec(d);
  if (bezier) {
    const nums = bezier.slice(1, 5).map(Number);
    const xInRange = nums[0] >= 0 && nums[0] <= 1 && nums[2] >= 0 && nums[2] <= 1;
    if (!xInRange) return exclude('cubic-bezier-x-out-of-range');
    return {
      kind: 'token', type: 'cubicBezier', value: nums.map((n) => quantize(n, 6)),
      derivation: { method: 'parsed-cubic-bezier' },
    };
  }
  if (d === 'linear') {
    return {
      kind: 'token', type: 'cubicBezier', value: [0, 0, 1, 1],
      derivation: { method: 'css-keyword-equivalent', note: 'CSS linear == cubic-bezier(0, 0, 1, 1)' },
    };
  }

  // R8 -- border styles. `none` is not in DTCG's enum and is handled at R14b.
  if (STROKE_STYLES.has(d)) return { kind: 'token', type: 'strokeStyle', value: d };

  // R9 / R9a / R9b -- lengths.
  const length = RE_LENGTH.exec(d);
  if (length) return { kind: 'token', type: 'dimension', value: dimension(Number(length[1]), length[2]) };
  const anyUnit = RE_ANY_UNIT.exec(d);
  if (anyUnit && !DIMENSION_UNITS.has(anyUnit[2])) return exclude('unsupported-css-unit');

  if (RE_BARE_NUM.test(d)) {
    const lengthLike = syn === '<length>' || syn === '<length-percentage>'
      || (syn === '*' && (cat === 'dimensions' || cat === 'border'));
    if (lengthLike) {
      return {
        kind: 'token', type: 'dimension', value: dimension(Number(d), 'px'),
        derivation: { method: 'implicit-zero-unit' },
      };
    }
    // R10 -- font weights, gated on the name and DTCG's [1,1000] domain.
    const weight = Number(d);
    if (RE_FONT_WEIGHT_NAME.test(name) && weight >= 1 && weight <= 1000) {
      return { kind: 'token', type: 'fontWeight', value: quantize(weight, 6) };
    }
    // R11
    return { kind: 'token', type: 'number', value: quantize(Number(d), 6) };
  }

  // R12 -- calc(var(--base) * N), resolved against the registry's own default.
  const scaled = RE_CALC_SCALE.exec(d);
  if (scaled) {
    const base = ctx.byVar.get(scaled[1]);
    if (!base) throw new Error(`A-6: calc base ${scaled[1]} not found (${record.slug})`);
    if (stack.has(base.slug)) throw new Error(`A-7: calc cycle through ${record.slug}`);
    const resolved = classify(base, ctx, new Set([...stack, record.slug]));
    const factor = Number(scaled[2]);
    if (resolved.kind === 'token' && resolved.type === 'dimension' && typeof resolved.value === 'object') {
      return {
        kind: 'token', type: 'dimension',
        value: dimension(resolved.value.value * factor, resolved.value.unit),
        derivation: { method: 'resolved-css-calc', from: [base.slug] },
      };
    }
    if (resolved.kind === 'token' && resolved.type === 'number') {
      return {
        kind: 'token', type: 'number', value: quantize(resolved.value * factor, 6),
        derivation: { method: 'resolved-css-calc', from: [base.slug] },
      };
    }
    return exclude('calc-unresolvable-base');
  }

  // R13 -- calc(<time> * var(--multiplier)).
  const timed = RE_CALC_TIME.exec(d);
  if (timed) {
    const multiplier = ctx.byVar.get(timed[3]);
    if (!multiplier) throw new Error(`A-6: calc multiplier ${timed[3]} not found (${record.slug})`);
    const resolved = classify(multiplier, ctx, new Set([...stack, record.slug]));
    if (resolved.kind !== 'token' || resolved.type !== 'number') return exclude('calc-unresolvable-multiplier');
    const product = Number(timed[1]) * resolved.value;
    const derivation = { method: 'resolved-css-calc', from: [multiplier.slug] };
    if (timed[2]) {
      return { kind: 'token', type: 'duration', value: { value: quantize(product, 6), unit: timed[2] }, derivation };
    }
    return { kind: 'token', type: 'number', value: quantize(product, 6), derivation };
  }

  // R14 -- shadows and the CSS forms with no DTCG encoding.
  if (d === 'none') return exclude('no-dtcg-encoding-for-none');
  if (cat === 'shadow' || name.includes('shadow')) {
    const shadow = parseShadow(d, ctx, aliasFor);
    if (shadow) {
      const derivation = { method: 'parsed-css-shadow' };
      if (shadow.from.length) derivation.from = shadow.from;
      return {
        kind: 'token', type: 'shadow',
        value: shadow.layers.length === 1 ? shadow.layers[0] : shadow.layers,
        derivation,
      };
    }
  }
  if (/^(clamp|min|max)\(/.test(d)) return exclude('css-function-viewport-relative');
  if (d.startsWith('color-mix(')) return exclude('css-color-mix');

  // R15
  return exclude('css-keyword-no-dtcg-type');
}

/** The anchor the published token reference uses, so `docs` links land on the row. */
export function anchorFor(slug) {
  return String(slug).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

const DERIVED_SUFFIX = ' Resolved at GravityView defaults from CSS: ';
const EXCLUDED_SUFFIX = ' Not emitted as a DTCG token';

/** Assemble the vendor extension payload in a fixed key order. */
function extensionFor(record, fate, ctx, productId) {
  const ext = {
    slug: record.slug,
    product: productId,
    cssVar: record.css_var,
    cssValue: String(record.default ?? ''),
    category: record.category,
    group: record.group,
    syntax: record.syntax,
    control: record.control,
    studio: Boolean(record.studio),
    private: Boolean(record.private),
  };
  if (record.hover_slug != null) {
    const hover = ctx.bySlug.get(record.hover_slug);
    ext.hoverToken = hover ? ctx.pathOf(hover.slug).join('.') : record.hover_slug;
  }
  if (record.options != null) ext.options = record.options;
  if (record.units != null) ext.units = record.units;
  if (record.min != null) ext.min = record.min;
  if (record.max != null) ext.max = record.max;
  if (record.step != null) ext.step = record.step;
  if (record.extra_css_vars != null) ext.extraCssVars = record.extra_css_vars;
  if (record.property_initial != null) ext.propertyInitial = record.property_initial;
  if (record.register_property === false) ext.registerProperty = false;
  if (fate.kind === 'token' && fate.derivation) ext.derivation = fate.derivation;
  if (fate.kind === 'excluded') {
    ext.representable = false;
    ext.reason = fate.reason;
  }
  ext.docs = `https://www.gravitykit.dev/${productId}/css-tokens#${anchorFor(record.slug)}`;
  return ext;
}

/**
 * Build the node for one record.
 *
 * An excluded record becomes an object with no $value, which DTCG reads as a
 * group. That keeps the path, the description and the raw CSS addressable while
 * token-consuming tools skip it.
 */
function nodeFor(record, fate, ctx, productId) {
  const cssValue = String(record.default ?? '');
  const desc = String(record.desc ?? '');
  const node = {};

  if (fate.kind === 'token') {
    node.$type = fate.type;
    node.$value = fate.value;
    const derived = Boolean(fate.derivation?.from?.length);
    if (derived) {
      node.$description = (desc + DERIVED_SUFFIX + cssValue).trimStart();
    } else if (desc !== '') {
      node.$description = desc;
    }
  } else {
    const tail = `${EXCLUDED_SUFFIX} (${fate.reason}). CSS value: ${cssValue || '(unset)'}`;
    node.$description = (desc + tail).trimStart();
  }

  node.$extensions = { [EXTENSION_KEY]: extensionFor(record, fate, ctx, productId) };
  return node;
}

/**
 * Turn a product's registry records into a DTCG document plus a coverage report.
 *
 * @param {object[]} records registry records, in registry order
 * @param {object} options
 * @param {string} options.productId top-level group name, e.g. "gravityview"
 * @param {string} [options.repo]
 * @param {string} [options.registrySource]
 * @param {string} [options.sourceDigest]
 * @param {string[]} [options.knownUnknownForms] slugs allowed to hit the catch-all rule
 * @returns {{document: object, report: object}}
 */
export function buildDocument(records, options) {
  const {
    productId, repo = null, registrySource = null, sourceDigest = null,
    knownUnknownForms = null,
  } = options;
  if (!Array.isArray(records) || records.length === 0) throw new Error('A-1: no records');

  for (const r of records) {
    if (typeof r.css_var !== 'string' || !r.css_var.startsWith('--')) {
      throw new Error(`A-2: bad css_var on ${r.slug}`);
    }
    if (typeof r.default !== 'string' || typeof r.syntax !== 'string') {
      throw new Error(`A-2: bad default/syntax on ${r.slug}`);
    }
    // Both strings can reach $description, which Style Dictionary renders into a
    // `/** ... */` CSS comment. A `*/` closes it early and destroys the following
    // declaration too, so refuse rather than emit a comment-escaping value.
    for (const [field, text] of [['desc', r.desc ?? ''], ['default', r.default]]) {
      if (/\*\/|[\n\r]/.test(String(text))) {
        throw new Error(`A-14: ${r.slug} has "*/" or a line break in ${field}; it would break a CSS comment`);
      }
    }
  }

  const ctx = indexRecords(records, productId);
  assertNames(records, ctx.pathOf);
  // JS enumerates integer-like object keys first, which would silently reorder
  // the emitted tree away from registry order.
  for (const r of records) {
    for (const seg of ctx.pathOf(r.slug)) {
      if (/^\d+$/.test(seg)) throw new Error(`A-4: numeric path segment "${seg}" in ${r.slug} would reorder output`);
    }
  }

  const fates = new Map(records.map((r) => [r.slug, classify(r, ctx)]));

  // Tripwire. `css-keyword-no-dtcg-type` is the catch-all: a value whose form the
  // rule table does not recognise at all. A token silently landing here is how
  // this artifact degrades without failing -- rewrite the shadows to use
  // color-mix() upstream, for instance, and all seven would quietly demote from
  // shadow composites to metadata-only groups while the build still exits 0.
  // Fail instead, and make widening the allowlist a deliberate act.
  if (knownUnknownForms) {
    const allowed = new Set(knownUnknownForms);
    const surprises = [...fates.entries()]
      .filter(([slug, f]) => f.reason === 'css-keyword-no-dtcg-type' && !allowed.has(slug))
      .map(([slug]) => slug);
    if (surprises.length) {
      throw new Error(
        `Unrecognised token value form(s): ${surprises.join(', ')}. `
        + 'These fell through every typing rule. Either teach the rule table the new form '
        + 'or add the slug to knownUnknownForms in generate-tokens.mjs.',
      );
    }
  }

  const product = {
    $description: `GravityView design tokens, generated from ${registrySource ?? 'the product TokenRegistry'}.`,
    $extensions: {
      [EXTENSION_KEY]: {
        product: productId,
        repo,
        registrySource,
        counts: { total: records.length, tokens: 0, metadataOnly: 0 },
      },
    },
  };

  const derivedTokens = [];
  const metadataOnly = [];
  const histogram = {};

  for (const record of records) {
    const fate = fates.get(record.slug);
    const segments = ctx.pathOf(record.slug).slice(1);
    let cursor = product;
    for (const seg of segments.slice(0, -1)) {
      if (!Object.prototype.hasOwnProperty.call(cursor, seg)) cursor[seg] = {};
      cursor = cursor[seg];
    }
    const leaf = segments[segments.length - 1];
    cursor[leaf] = nodeFor(record, fate, ctx, productId);

    const path = ctx.pathOf(record.slug).join('.');
    if (fate.kind === 'token') {
      const { type, derivation } = fate;
      histogram[type] = (histogram[type] ?? 0) + 1;
      if (derivation?.from?.length) derivedTokens.push(path);
    } else {
      metadataOnly.push({
        path,
        reason: fate.reason,
        cssVar: record.css_var,
        cssValue: String(record.default ?? ''),
      });
    }
  }

  const tokenCount = records.length - metadataOnly.length;
  product.$extensions[EXTENSION_KEY].counts = {
    total: records.length,
    tokens: tokenCount,
    metadataOnly: metadataOnly.length,
  };

  const document = {
    // Not a DTCG property, but the DTCG's own schema declares and permits it, so
    // editors validate the published file live.
    $schema: SCHEMA_URL,
    $description: [
      'Generated artifact: rebuilt from each GravityKit product\'s PHP TokenRegistry on every deploy.',
      'Edits are overwritten, and third-party $extensions written into this file will NOT survive regeneration.',
      `${tokenCount} of ${records.length} registry tokens are emitted as DTCG tokens; the remaining ${metadataOnly.length}`,
      'have no DTCG 2025.10 representation and appear at their normal path as metadata-only groups carrying the raw CSS.',
      'Shipped CSS custom-property names are NOT derivable from token paths: read',
      '$extensions["com.gravitykit.tokens"].cssVar.',
      'The canonical lossless record is https://www.gravitykit.dev/api/css-tokens.json',
    ].join(' '),
    $extensions: {
      [EXTENSION_KEY]: {
        mappingVersion: MAPPING_VERSION,
        specification: 'https://www.designtokens.org/TR/2025.10/format/',
        colorModule: 'https://www.designtokens.org/TR/2025.10/color/',
        generator: 'gravitykit.dev scripts/generate-tokens.mjs',
        source: 'https://www.gravitykit.dev/api/css-tokens.json',
        sourceDigest,
        products: [{ id: productId, repo }],
        counts: { total: records.length, tokens: tokenCount, metadataOnly: metadataOnly.length },
        derivedTokens,
        metadataOnly,
      },
    },
    [productId]: product,
  };

  assertDocument(document, records.length);

  return {
    document,
    report: { total: records.length, tokens: tokenCount, metadataOnly, derivedTokens, histogram },
  };
}

/** Post-build conformance assertions. The generator writes nothing if any fails. */
export function assertDocument(document, expectedRecordCount) {
  let tokens = 0;
  let groupsWithMetadata = 0;

  const visit = (node, path) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    const isToken = Object.prototype.hasOwnProperty.call(node, '$value');
    const children = Object.keys(node).filter((k) => !k.startsWith('$'));

    if (isToken) {
      tokens += 1;
      if (children.length) throw new Error(`A-12: ${path} has both $value and children`);
      if (!DTCG_TYPES.has(node.$type)) throw new Error(`A-8: ${path} has $type "${node.$type}"`);
    } else if (node.$extensions && !children.length && path !== '') {
      groupsWithMetadata += 1;
    }
    if (!isToken && node.$type !== undefined) throw new Error(`A-8: group ${path} declares $type`);
    if (node.$description !== undefined && typeof node.$description !== 'string') {
      throw new Error(`$description on ${path} is not a string`);
    }
    if (node.$extensions !== undefined) {
      const keys = Object.keys(node.$extensions);
      if (keys.length !== 1 || keys[0] !== EXTENSION_KEY) {
        throw new Error(`$extensions on ${path} must have exactly the key ${EXTENSION_KEY}`);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      visit(v, path ? `${path}.${k}` : k);
    }
  };
  visit(document, '');

  if (tokens + groupsWithMetadata !== expectedRecordCount) {
    throw new Error(`A-11: ${tokens} tokens + ${groupsWithMetadata} metadata groups != ${expectedRecordCount} records`);
  }

  const aliases = [];
  const seen = new Set();
  const collect = (node, path) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v) => collect(v, path)); return; }
    if (typeof node.$value === 'string' && /^\{[^{}]+\}$/.test(node.$value)) aliases.push([path, node.$value]);
    if (Object.prototype.hasOwnProperty.call(node, '$value')) collect(node.$value, path);
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      collect(v, path ? `${path}.${k}` : k);
    }
    if (Object.prototype.hasOwnProperty.call(node, '$value')) seen.add(path);
  };
  collect(document, '');

  for (const [path, ref] of aliases) {
    const target = ref.slice(1, -1);
    let cursor = document;
    for (const seg of target.split('.')) {
      cursor = cursor?.[seg];
      if (cursor === undefined) throw new Error(`A-13: ${path} references missing ${target}`);
    }
    if (!Object.prototype.hasOwnProperty.call(cursor, '$value')) {
      throw new Error(`A-13: ${path} references ${target}, which is a group, not a token`);
    }
  }

  const numbers = (node) => {
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) throw new Error('A-9: non-finite number');
      if (/[eE]/.test(String(node))) throw new Error(`A-9: number ${node} serializes in exponential notation`);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(numbers);
  };
  numbers(document);

  return { tokens, metadataOnly: groupsWithMetadata, aliases: aliases.length };
}

export { indexRecords, assertNames, parseShadow };

/**
 * Plain functions over the merge-tag artifact, shared by the build-time plugin
 * (src/plugins/merge-tag-pages.mjs) and the client pages. No React, no Node APIs.
 */

// PHP's table of date format letters, linked wherever a modifier takes a date format.
export const PHP_DATE_FORMAT_URL = 'https://www.php.net/manual/en/datetime.format.php';

/**
 * The test entry's stored date (Y-m-d), read from the Date field's own capture, so text that
 * quotes a sample date matches the examples beside it.
 */
export function capturedStoredDate(artifact) {
  const date = artifact?.field_examples?.rows?.date;
  const ymd = date?.modifiers?.find((example) => example.id.startsWith('ymd_dash::'));
  return ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd.out) ? ymd.out : null;
}

/** The offer grid's reasons, with any Y-m-d date in their text replaced by the captured one. */
export function reasonsWithCapturedDate(artifact) {
  const reasons = artifact?.offers?.reasons ?? {};
  const date = capturedStoredDate(artifact);
  if (!date) return reasons;
  return Object.fromEntries(
    Object.entries(reasons).map(([key, reason]) => [
      key,
      { ...reason, explanation: reason.explanation?.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date) },
    ]),
  );
}

/** `{Interests:110:value}` -> `{Interests:110}`; null for a tag that is not a form field's. */
export function fieldTagOf(tagIn) {
  const match = /^\{([^:{}]*):(\d+(?:\.\w+)?)/.exec(tagIn ?? '');
  return match ? `{${match[1]}:${match[2]}}` : null;
}

/**
 * How a modifier that takes a PHP date format reads its argument, or null for any other
 * modifier. In the `field` grammar GravityView splits modifiers at each comma that has no
 * backslash before it, so a comma in the format must be written `\,`. The date tags read
 * everything after `format:` up to the closing brace, so a comma needs nothing.
 */
export function dateFormatHelp(modifier) {
  if (modifier?.argument?.type !== 'php_date_format') return null;
  return { commaNeedsBackslash: modifier.grammar === 'field' };
}

/**
 * True when a GravityView modifier works outside Views too. GravityView adds its modifiers
 * through Gravity Forms' own merge tag filters (gform_merge_tag_filter, gform_replace_merge_tags),
 * registered whenever GravityView is active, so they apply in notifications as well. Tags
 * the catalog limits to shortcode output (like {sequence}) only render inside a View.
 */
export function worksOutsideViews(artifact, modifier) {
  if (modifier?.product !== 'gravityview') return false;
  const tags = modifier.applies_to?.tags;
  if (!Array.isArray(tags)) return true;
  const byName = new Map((artifact?.tags ?? []).map((tag) => [tag.name, tag]));
  return tags.some((name) => {
    const contexts = byName.get(name)?.contexts;
    return !Array.isArray(contexts) || contexts.includes('notification');
  });
}

/**
 * [product name, items] pairs: Gravity Forms first, since the others build on it, then
 * GravityView, then every other product by name. `nameOf` maps a product slug to the name the
 * site shows; products shown under one name (Query Filters ships inside GravityView) share one
 * group, so no heading appears twice.
 */
export function groupModifiersByProduct(items, nameOf) {
  const groups = new Map();
  const rankOf = new Map();
  for (const item of items) {
    const slug = item.modifier.product;
    const name = nameOf(slug) ?? slug;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
    const rank = slug === 'gravityforms' ? 0 : slug === 'gravityview' ? 1 : 2;
    rankOf.set(name, Math.min(rankOf.get(name) ?? 2, rank));
  }
  return [...groups].sort(([a], [b]) => rankOf.get(a) - rankOf.get(b) || a.localeCompare(b));
}

const NAMED_ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", hellip: '…', nbsp: ' ', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };

/**
 * Text as a reader sees it once it is shown: `&quot;` becomes a quote mark. One pass, so an
 * escaped entity (`&amp;lt;`) stays one level escaped (`&lt;`), as a browser would show it.
 */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

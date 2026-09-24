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

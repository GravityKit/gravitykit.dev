/**
 * The "Reference Sections" part of /llms.txt: every index on the site, and every merge tag and
 * modifier page, as full URLs. Pure, so the output can be tested without a build.
 */

export const LLMS_SECTIONS_HEADING = '## Reference Sections';

const tagSlug = (name) => (name === '*field*' ? 'field' : name);

/**
 * @param {object} input
 * @param {string} input.siteUrl  Origin with no trailing slash, like https://www.gravitykit.dev.
 * @param {{ id: string, label: string, hasFilters: boolean, hasActions: boolean, hasApi: boolean }[]} input.products  Which index pages each product has.
 * @param {{ tags?: object[], modifiers?: object[] } | null} input.mergeTags  The merge-tags.json artifact, or null.
 * @returns {string}
 */
export function buildReferenceSections({ siteUrl, products, mergeTags }) {
  const url = (p) => `${siteUrl}${p}`;
  const lines = [
    LLMS_SECTIONS_HEADING,
    '',
    'Every index on this site, plus the page for each merge tag and modifier.',
    '',
    '### Hooks (actions and filters)',
    '',
    ...products.flatMap((p) => [
      ...(p.hasFilters ? [`- [${p.label} filters](${url(`/docs/${p.id}/filters/`)})`] : []),
      ...(p.hasActions ? [`- [${p.label} actions](${url(`/docs/${p.id}/actions/`)})`] : []),
    ]),
    `- [All hooks as JSON](${url('/api/hooks.json')})`,
    '',
    '### PHP API (classes and functions)',
    '',
    ...products.filter((p) => p.hasApi).map((p) => `- [${p.label} PHP API](${url(`/docs/${p.id}/api/`)})`),
    `- [PHP API as JSON](${url('/api/php-api.json')})`,
    '',
    '### CSS design tokens (GravityView)',
    '',
    `- [CSS token reference](${url('/gravityview/css-tokens/')}): every \`--gv-*\` custom property, its default and what it controls`,
    `- [Design tokens (DTCG JSON)](${url('/gravityview/design-tokens/')})`,
    `- [Tokens as JSON](${url('/api/css-tokens.json')})`,
    '',
    '### Merge tags',
    '',
    `- [All merge tags and modifiers](${url('/merge-tags/')})`,
    `- [Modifiers by field](${url('/merge-tags/fields/')})`,
    `- [Compare fields](${url('/merge-tags/compare/')})`,
    `- [Merge tags as JSON](${url('/api/merge-tags.json')})`,
  ];

  const tags = mergeTags?.tags ?? [];
  if (tags.length) {
    lines.push('', '#### Merge tag pages', '');
    for (const tag of tags) {
      const name = tag.name === '*field*' ? '{Field:ID}' : `{${tag.name}}`;
      lines.push(`- [${name}](${url(`/merge-tags/${tagSlug(tag.name)}/`)})${tag.label ? `: ${tag.label}` : ''}`);
    }
  }

  // Several catalog entries can share a name (scoped to different fields); each name has one page.
  const modifiers = new Map();
  for (const modifier of mergeTags?.modifiers ?? []) if (!modifiers.has(modifier.name)) modifiers.set(modifier.name, modifier);
  if (modifiers.size) {
    lines.push('', '#### Modifier pages', '');
    for (const [name, modifier] of modifiers) {
      lines.push(`- [:${name}](${url(`/merge-tags/modifiers/${name}/`)})${modifier.label ? `: ${modifier.label}` : ''}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

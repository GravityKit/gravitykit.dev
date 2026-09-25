import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceSections, LLMS_SECTIONS_HEADING } from './llms-sections.mjs';

const siteUrl = 'https://www.gravitykit.dev';
const products = [
  { id: 'gravityview', label: 'GravityView', hasFilters: true, hasActions: true, hasApi: true },
  { id: 'image-hopper', label: 'Image Hopper', hasFilters: true, hasActions: false, hasApi: false },
];
const mergeTags = {
  tags: [{ name: '*field*', label: 'Form field' }, { name: 'entry_id', label: 'Entry ID' }],
  modifiers: [
    { name: 'value', label: 'Choice value' },
    { name: 'value', label: 'Another scope' },
    { name: 'urlencode', label: 'URL-encode the value' },
  ],
};

test('lists every index with full URLs', () => {
  const out = buildReferenceSections({ siteUrl, products, mergeTags });
  assert.ok(out.startsWith(LLMS_SECTIONS_HEADING));
  for (const p of ['/docs/gravityview/filters/', '/docs/gravityview/actions/', '/docs/gravityview/api/', '/gravityview/css-tokens/', '/merge-tags/', '/merge-tags/fields/']) {
    assert.ok(out.includes(`(${siteUrl}${p})`), p);
  }
});

test('leaves out index pages a product does not have', () => {
  const out = buildReferenceSections({ siteUrl, products, mergeTags });
  assert.ok(out.includes('/docs/image-hopper/filters/'));
  assert.ok(!out.includes('/docs/image-hopper/actions/'));
  assert.ok(!out.includes('/docs/image-hopper/api/'));
});

test('one line per tag and per modifier name, with the form field tag at /merge-tags/field/', () => {
  const out = buildReferenceSections({ siteUrl, products, mergeTags });
  assert.ok(out.includes(`- [{Field:ID}](${siteUrl}/merge-tags/field/): Form field`));
  assert.ok(out.includes(`- [{entry_id}](${siteUrl}/merge-tags/entry_id/): Entry ID`));
  assert.equal(out.split('/merge-tags/modifiers/value/').length - 1, 1);
  assert.ok(out.includes(`- [:urlencode](${siteUrl}/merge-tags/modifiers/urlencode/)`));
});

test('without the merge tag artifact, keeps the indexes and drops the per-page lists', () => {
  const out = buildReferenceSections({ siteUrl, products, mergeTags: null });
  assert.ok(out.includes('/merge-tags/fields/'));
  assert.ok(!out.includes('#### Merge tag pages'));
  assert.ok(!out.includes('#### Modifier pages'));
});

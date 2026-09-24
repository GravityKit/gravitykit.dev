import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateFormatHelp, fieldTagOf, reasonsWithCapturedDate, worksOutsideViews } from '../../src/components/merge-tags/data.mjs';
import { modifierPageData } from '../../src/plugins/merge-tag-pages.mjs';

test('takes the sample date in reason text from the Date field capture', () => {
  const artifact = {
    offers: { reasons: { 'needs-date-format': { title: 'T', explanation: 'The stored date (2024-03-09) has no letters.' } } },
    field_examples: { rows: { date: { modifiers: [{ id: 'ymd_dash::*field*::date', out: '2026-03-09' }] } } },
  };
  assert.equal(reasonsWithCapturedDate(artifact)['needs-date-format'].explanation, 'The stored date (2026-03-09) has no letters.');
});

test('names the field part of a tag', () => {
  assert.equal(fieldTagOf('{Interests:110:value}'), '{Interests:110}');
  assert.equal(fieldTagOf('{Name:4.3:ucfirst}'), '{Name:4.3}');
  assert.equal(fieldTagOf('{date_created:format:Y}'), null);
});

test('a comma needs a backslash only where modifiers are split at commas', () => {
  assert.deepEqual(dateFormatHelp({ grammar: 'field', argument: { type: 'php_date_format' } }), { commaNeedsBackslash: true });
  assert.deepEqual(dateFormatHelp({ grammar: 'date', argument: { type: 'php_date_format' } }), { commaNeedsBackslash: false });
  assert.equal(dateFormatHelp({ grammar: 'field', argument: { type: 'integer' } }), null);
});

test('GravityView modifiers work outside Views unless their tags render only in a View', () => {
  const artifact = { tags: [{ name: 'sequence', contexts: ['shortcode'] }, { name: 'now', contexts: '*' }] };
  assert.equal(worksOutsideViews(artifact, { product: 'gravityview', applies_to: { tags: ['*field*'] } }), true);
  assert.equal(worksOutsideViews(artifact, { product: 'gravityview', applies_to: { tags: ['now'] } }), true);
  assert.equal(worksOutsideViews(artifact, { product: 'gravityview', applies_to: { tags: ['sequence'] } }), false);
  assert.equal(worksOutsideViews(artifact, { product: 'gravityforms', applies_to: { tags: ['*field*'] } }), false);
});

test('leads with a capture on an offered field, and lists each field kind once', () => {
  const id = 'up::*field*::*';
  const artifact = {
    tags: [{ name: '*field*', contexts: '*' }],
    modifiers: [{ id, name: 'up', label: 'Up', product: 'gravityview', applies_to: { tags: ['*field*'], field_types: '*' }, example: { in: '{Field:1:up}' } }],
    captures: { records: [], fixture_fields: [] },
    offers: {
      reasons: {},
      tags: {},
      fields: [
        { key: 'name', label: 'Name', field_type: 'name', offered: [], withheld: [{ id, reason: 'whole-field' }] },
        { key: 'text', label: 'Single line text', field_type: 'text', offered: [{ id }], withheld: [] },
        { key: 'textarea', label: 'Paragraph text', field_type: 'textarea', offered: [{ id }], withheld: [] },
      ],
    },
    field_examples: {
      rows: {
        text: { plain: { in: '{Company:101}', out: 'Acme' }, modifiers: [{ id, in: '{Company:101:up}', out: 'Acme', same: true }] },
        textarea: { plain: { in: '{Notes:2}', out: 'hi' }, modifiers: [{ id, in: '{Notes:2:up}', out: 'Hi' }] },
      },
    },
  };
  const [entry] = modifierPageData(artifact, 'up').entries;
  assert.equal(entry.lead.in, '{Notes:2:up}');
  assert.deepEqual(entry.lead.field, { tag: '{Notes:2}', kind: 'Paragraph text' });
  const works = entry.offeredOnFields.map((f) => f.label);
  const out = entry.withheld.flatMap((w) => w.fields);
  assert.deepEqual(works, ['Single line text', 'Paragraph text']);
  assert.deepEqual(out, ['Name']);
  assert.equal(works.filter((label) => out.includes(label)).length, 0);
});

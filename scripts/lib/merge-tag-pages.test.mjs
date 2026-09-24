import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldTableDiff, fieldTableRows } from '../../src/plugins/merge-tag-pages.mjs';

// The shape Gravity Forms renders for {all_fields}: a label row, then a value row.
const table = (rows) =>
  `<table>${rows
    .map(([label, value]) => `<tr><td><strong>${label}</strong></td></tr><tr><td>${value}</td></tr>`)
    .join('')}</table>`;

test('reads each label and its value, decoding entities', () => {
  assert.deepEqual(fieldTableRows(table([['Notes', 'it&#039;s &amp; done'], ['Email', '<a href="#">a@b.c</a>']])), [
    ['Notes', "it's & done"],
    ['Email', 'a@b.c'],
  ]);
});

test('reports fields left out, added, and shown differently', () => {
  const before = table([['Full Name', 'Ada'], ['Tracking Token', 'x1'], ['Toppings', 'Pepperoni']]);
  const after = table([['Full Name', 'Ada'], ['Toppings', 'pepperoni'], ['Referral Source', '']]);
  assert.deepEqual(fieldTableDiff(before, after), {
    added: ['Referral Source'],
    added_blank: true,
    removed: ['Tracking Token'],
    renamed: [],
    changed: [{ label: 'Toppings', before: 'Pepperoni', after: 'pepperoni' }],
  });
});

test('reads a field shown under another label, with the same value, as renamed', () => {
  const before = table([['Full Name', 'Ada'], ['Notes', 'Hi']]);
  const after = table([['VIP Contact Name', 'Ada'], ['Notes', 'Hi']]);
  assert.deepEqual(fieldTableDiff(before, after), {
    added: [],
    removed: [],
    renamed: [{ from: 'Full Name', to: 'VIP Contact Name' }],
    changed: [],
  });
});

test('joins list items with commas', () => {
  assert.deepEqual(fieldTableRows(table([['Toppings', '<ul><li>Pepperoni</li><li>Mushroom</li></ul>']])), [
    ['Toppings', 'Pepperoni, Mushroom'],
  ]);
});

test('reports no difference for identical tables', () => {
  const same = table([['Full Name', 'Ada']]);
  assert.deepEqual(fieldTableDiff(same, same), { added: [], removed: [], renamed: [], changed: [] });
});

test('does not compare output that is not a field table', () => {
  assert.equal(fieldTableDiff('<p>One</p>', '<p>Two</p>'), null);
});

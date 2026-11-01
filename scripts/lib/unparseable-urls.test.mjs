import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapUnparseableUrls } from './unparseable-urls.mjs';

const ipv6 = 'https://2001:0db8:85a3:0000:0000:8a2e:0370:7334/path/to?name=value#fragment';

test('wraps a URL that new URL() rejects', () => {
  assert.equal(URL.canParse(ipv6), false);
  assert.equal(wrapUnparseableUrls(`Valid: ${ipv6}`), `Valid: \`${ipv6}\``);
});

test('leaves parseable URLs alone, including bracketed IPv6 and merge tags', () => {
  const text = [
    'http://foo.bar/{field:1}',
    'https://[2001:db8::1]:443/resource',
    'http://192.168.0.1:8080/query?name=value#fragment',
    'See https://www.gravitykit.com.',
  ].join('\n');
  assert.equal(wrapUnparseableUrls(text), text);
});

test('keeps trailing punctuation outside the code span', () => {
  assert.equal(wrapUnparseableUrls(`Like ${ipv6}.`), `Like \`${ipv6}\`.`);
});

test('does not touch code spans, fenced code or link destinations', () => {
  const text = [
    `Inline \`${ipv6}\` stays.`,
    '```php',
    `$url = '${ipv6}';`,
    '```',
    `[example](${ipv6})`,
  ].join('\n');
  assert.equal(wrapUnparseableUrls(text), text);
});

test('handles empty input', () => {
  assert.equal(wrapUnparseableUrls(''), '');
  assert.equal(wrapUnparseableUrls(undefined), '');
});

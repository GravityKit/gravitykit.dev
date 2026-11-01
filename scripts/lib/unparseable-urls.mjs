/**
 * Docblock text can hold URL-shaped examples that are not valid URLs, such as an unbracketed IPv6
 * host (`https://2001:0db8::1/path`). GFM turns any bare `https://…` into a link, and Docusaurus
 * then runs `new URL()` on it and fails the whole build. This wraps those URLs in a code span so
 * they render as text. Valid URLs, fenced code and existing code spans are left alone.
 */

const BARE_URL = /https?:\/\/[^\s<>`|]+/g;

// GFM drops these from the end of an autolinked URL, so a sentence's full stop is not part of it.
const TRAILING_PUNCTUATION = /[.,:;!?'")\]*_~]+$/;

/**
 * @param {string} line  One line of Markdown outside fenced code.
 * @returns {string}
 */
function wrapInLine(line) {
  // Split on code spans so their contents are never touched; odd indexes are the spans.
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(BARE_URL, (match, offset, whole) => {
        const isLinkDestination = whole.slice(Math.max(0, offset - 2), offset) === '](';
        if (isLinkDestination) return match;

        const trailing = match.match(TRAILING_PUNCTUATION)?.[0] ?? '';
        const url = trailing ? match.slice(0, -trailing.length) : match;
        const isParseable = URL.canParse(url);
        if (isParseable) return match;

        return `\`${url}\`${trailing}`;
      });
    })
    .join('');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function wrapUnparseableUrls(markdown) {
  let inFence = false;
  return String(markdown ?? '')
    .split('\n')
    .map((line) => {
      const isFenceLine = /^\s*(```|~~~)/.test(line);
      if (isFenceLine) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : wrapInLine(line);
    })
    .join('\n');
}

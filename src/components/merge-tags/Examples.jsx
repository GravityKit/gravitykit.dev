import styles from './merge-tags.module.css';

// Captured output can be a whole {all_fields} table; a row shows the start of it.
const OUTPUT_PREVIEW_CHARS = 300;
const HTML_LIKE = /^\s*<[a-z][\s\S]*>/i;
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** One decoding pass: what a browser shows for the text of rendered HTML. */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Output as a reader sees it: HTML reduced to its text, whitespace collapsed, cut to a preview. */
function preview(text) {
  const raw = String(text ?? '');
  const isHtml = HTML_LIKE.test(raw) && /<(table|p|div|ul|ol|br)\b/i.test(raw);
  const value = (isHtml ? decodeEntities(raw.replace(/<[^>]*>/g, ' ')) : raw).replace(/\s+/g, ' ').trim();
  return { isHtml, text: value.length > OUTPUT_PREVIEW_CHARS ? `${value.slice(0, OUTPUT_PREVIEW_CHARS)}…` : value };
}

export function Output({ value }) {
  const shown = preview(value);
  if (!shown.text) return <em>(empty)</em>;
  return (
    <>
      {shown.isHtml && <span className="badge badge--secondary margin-right--sm">HTML</span>}
      <code className={styles.output}>{shown.text}</code>
    </>
  );
}

/**
 * Captured examples: the merge tag, what it rendered, and, when a plain render of the same tag
 * exists, what it rendered without the modifier.
 */
export default function Examples({ examples, showBefore = true }) {
  const withBefore = showBefore && examples.some((example) => example.before);

  return (
    <table className={styles.examples}>
      <thead>
        <tr>
          <th>Merge tag</th>
          <th>Output</th>
          {withBefore && <th>Without the modifier</th>}
        </tr>
      </thead>
      <tbody>
        {examples.map((example) => (
          <tr key={example.in + (example.note ?? '')}>
            <td>
              <code>{example.in}</code>
              {example.note && <p className={styles.exampleNote}>{example.note}</p>}
            </td>
            <td>
              <Output value={example.out} />
            </td>
            {withBefore && <td>{example.before ? <Output value={example.before.out} /> : '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A worked example: a template in the setting it is used in, and what it produced. */
export function UsageExample({ usage }) {
  return (
    <div className={styles.usage}>
      <h4>{usage.title}</h4>
      {usage.text && <p>{usage.text}</p>}
      <p className={styles.usageLabel}>Write</p>
      <pre className={styles.usageCode}>
        <code>{usage.template}</code>
      </pre>
      <p className={styles.usageLabel}>Get</p>
      <pre className={styles.usageCode}>
        <code>{usage.out}</code>
      </pre>
    </div>
  );
}

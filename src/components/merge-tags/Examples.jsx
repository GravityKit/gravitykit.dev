import { useEffect, useRef, useState } from 'react';
import styles from './merge-tags.module.css';
import { diffText, outputPreview } from './data.mjs';

export { diffText };

// Captured output can be a whole {all_fields} table; a row shows the start of it.

export function Output({ value }) {
  const shown = outputPreview(value);
  if (!shown.text) return <em>(empty)</em>;
  return (
    <>
      {shown.isHtml && <span className="badge badge--secondary margin-right--sm">HTML</span>}
      <code className={styles.output}>{shown.text}</code>
    </>
  );
}

function ExampleHeading({ example }) {
  return (
    <>
      <code>{example.in}</code>
      {example.modifierLabel && <span className={styles.exampleLabel}>{example.modifierLabel}</span>}
      {example.diff && <span className={styles.exampleDiff}>{diffText(example.diff)}</span>}
    </>
  );
}

function isHtmlOutput(value) {
  return outputPreview(value).isHtml;
}

// Tall enough for a full {all_fields} table without making the page scroll twice.
const PREVIEW_MAX_HEIGHT = 640;

/**
 * HTML output as a browser draws it, with the exact markup one click away. The iframe
 * runs no scripts (`sandbox` without allow-scripts); allow-same-origin only lets this page
 * read the drawn height, so the frame fits the table instead of cutting it off.
 */
export function HtmlPreview({ html, title = 'Output', name }) {
  const frame = useRef(null);
  const [height, setHeight] = useState(160);

  // Measured on load, and again whenever the frame's width changes: the static page can finish
  // loading the frame before this code runs, and a frame inside a closed <details> has no size
  // until it opens.
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const fit = () => {
      const doc = el.contentDocument;
      if (doc?.body && el.clientWidth > 0)
        setHeight(Math.min(doc.documentElement.scrollHeight + 2, PREVIEW_MAX_HEIGHT));
    };
    fit();
    el.addEventListener('load', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(el);
    return () => {
      el.removeEventListener('load', fit);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <div className={styles.htmlPreview}>
      <iframe ref={frame} title={title} srcDoc={`<html lang="en"><body>${html}</body></html>`} sandbox="allow-same-origin" style={{ height }} />
      <details>
        <summary>
          {/* Named per example: several of these can sit on one page. */}
          HTML{name ? <> of <code>{name}</code></> : ''} ({html.length.toLocaleString()} characters)
        </summary>
        <pre className={styles.htmlSource}>
          <code>{html}</code>
        </pre>
      </details>
    </div>
  );
}

/**
 * Captured examples: the merge tag, what it rendered, and, when a plain render of the same tag
 * exists, what it rendered without the modifier. Text output sits in a table; HTML output
 * (a whole {all_fields} table, a :wpautop paragraph) is drawn below it at full width.
 */
export default function Examples({ examples, showBefore = true }) {
  const text = examples.filter((example) => !isHtmlOutput(example.out));
  const html = examples.filter((example) => isHtmlOutput(example.out));
  const withBefore = showBefore && text.some((example) => example.before);

  return (
    <>
      {text.length > 0 && (
        <table className={styles.examples}>
          <thead>
            <tr>
              <th>Merge tag</th>
              <th>Output</th>
              {withBefore && <th>Without the modifier</th>}
            </tr>
          </thead>
          <tbody>
            {text.map((example) => (
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
      )}
      {html.map((example, index) => {
        const body = (
          <>
            {example.note && <p className={styles.exampleNote}>{example.note}</p>}
            <HtmlPreview html={example.out} title={`Output of ${example.in}`} name={example.in} />
            {showBefore && example.before && (
              <details className={styles.htmlBefore}>
                <summary>
                  Without the modifier: <code>{example.before.in}</code>
                </summary>
                {isHtmlOutput(example.before.out) ? (
                  <HtmlPreview html={example.before.out} title={`Output of ${example.before.in}`} name={example.before.in} />
                ) : (
                  <Output value={example.before.out} />
                )}
              </details>
            )}
          </>
        );
        const key = example.in + (example.note ?? '');

        // The first is shown; the rest are one click away, since each can be a full-page table.
        return index === 0 ? (
          <div key={key} className={styles.htmlExample}>
            <p className={styles.exampleHead}>
              <ExampleHeading example={example} />
            </p>
            {body}
          </div>
        ) : (
          <details key={key} className={styles.htmlExample}>
            <summary>
              <span className={styles.exampleHead}>
                <ExampleHeading example={example} />
              </span>
            </summary>
            {body}
          </details>
        );
      })}
    </>
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

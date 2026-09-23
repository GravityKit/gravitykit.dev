import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, SECTIONS, requiresText, sectionOf } from './shared';
import styles from './merge-tags.module.css';

// Captured output can be a whole {all_fields} table; the page shows the start of it as text.
const OUTPUT_PREVIEW_CHARS = 400;

const TYPE_NAMES = { integer: 'number', string: 'text', enum: 'one of the values', open_enum: 'text', field_ref: 'field ID' };

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
  const isHtml = HTML_LIKE.test(raw);
  const stripped = isHtml ? decodeEntities(raw.replace(/<[^>]*>/g, ' ')) : raw;
  const value = stripped.replace(/\s+/g, ' ').trim();
  return { isHtml, text: value.length > OUTPUT_PREVIEW_CHARS ? `${value.slice(0, OUTPUT_PREVIEW_CHARS)}…` : value };
}

/**
 * One merge tag, built at /merge-tags/<tag>/ by src/plugins/merge-tag-pages.mjs. Laid out like a
 * hook page (the same `markdown` wrapper and plain tables), so the two references read alike.
 */
export default function TagPage({ data }) {
  const { tag, offered, captures, captureCount } = data;
  const parts = [...(tag.parameter ? [tag.parameter] : []), ...(tag.parameters || []), ...(tag.attributes || [])];
  const withValues = parts.filter((part) => part.options?.length);
  const isField = tag.name === '*field*';
  const title = isField ? 'Form field merge tag' : `{${tag.name}} merge tag`;
  const needs = requiresText(tag.requires);

  return (
    <Layout title={title} description={tag.description || `${tag.label}: the ${tag.syntax} merge tag, its options and examples.`}>
      <main className="container margin-vert--lg">
        <MergeTagsNav current="tag" />
        <article className="theme-doc-markdown markdown">
          <header>
            <h1>Merge tag: {tag.syntax}</h1>
          </header>
          <p>
            <strong>{tag.label}.</strong> {tag.description}
          </p>

          <table>
            <tbody>
              <tr>
                <th scope="row">Product</th>
                <td>{PRODUCT_NAMES[tag.product] || tag.product}</td>
              </tr>
              {needs && (
                <tr>
                  <th scope="row">Requires</th>
                  <td>{needs}</td>
                </tr>
              )}
              <tr>
                <th scope="row">Needs an entry</th>
                <td>{tag.entry_dependent ? 'Yes: its value comes from a form entry' : 'No'}</td>
              </tr>
            </tbody>
          </table>

          {isField && (
            <div className="alert alert--info margin-bottom--md">
              Which modifiers a form field takes depends on the kind of field. See <a href="/merge-tags/fields/">Modifiers by field</a>.
            </div>
          )}

          {parts.length > 0 && (
            <>
              <h2 id="parameters">{tag.attributes?.length ? 'Attributes' : 'Parameters'}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Default</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => (
                    <tr key={part.name || part.label || index}>
                      <td>{part.name ? <code>{part.name}=</code> : part.label}</td>
                      <td>
                        <code>{TYPE_NAMES[part.type] || part.type || 'text'}</code>
                      </td>
                      <td>{part.required ? 'Yes' : 'No'}</td>
                      <td>{part.default !== undefined && part.default !== '' ? <code>{String(part.default)}</code> : '—'}</td>
                      <td>{part.description || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {withValues.map((part) => (
                <div key={`values-${part.name || part.label}`}>
                  <h3>Values for {part.label}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Value</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.options.map((option) => (
                        <tr key={option.value}>
                          <td>
                            <code>{option.value}</code>
                          </td>
                          <td>{option.description ? `${option.label}. ${option.description}` : option.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {part.type === 'open_enum' && <p>Other values are accepted too.</p>}
                </div>
              ))}
            </>
          )}

          {offered.length > 0 && (
            <>
              <h2 id="modifiers">Modifiers</h2>
              <p>What the merge tag picker offers on this tag.</p>
              {SECTIONS.map((section) => {
                const items = offered.filter((item) => sectionOf(item.modifier) === section.key);
                if (items.length === 0) return null;

                return (
                  <div key={section.key}>
                    <h3>{section.title}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Modifier</th>
                          <th>Description</th>
                          <th>Requires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(({ modifier }) => (
                          <tr key={modifier.id}>
                            <td>
                              <code>{modifier.name}</code>
                            </td>
                            <td>
                              <strong>{modifier.label}.</strong> {modifier.description || ''}
                            </td>
                            <td>{requiresText(modifier.requires)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </>
          )}

          {!isField && parts.length === 0 && offered.length === 0 && (
            <p>This tag takes no modifiers or parameters. Write it exactly as shown.</p>
          )}

          {captures.length > 0 && (
            <>
              <h2 id="examples">Examples</h2>
              <p>
                Rendered by real Gravity Forms and GravityKit PHP against a fixed test entry.
                {captureCount > captures.length && (
                  <>
                    {' '}
                    {captures.length} of {captureCount} shown; the rest are on <a href="/merge-tags/">All merge tags</a>.
                  </>
                )}
              </p>
              <table className={styles.examples}>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {captures.map((capture) => (
                    <tr key={capture.in}>
                      <td>
                        <code>{capture.in}</code>
                        {capture.stub && <span className="badge badge--warning margin-left--sm">Placeholder, not verified</span>}
                      </td>
                      <td>
                        {(() => {
                          const shown = preview(capture.out);
                          return (
                            <>
                              {shown.isHtml && <span className="badge badge--secondary margin-right--sm">HTML</span>}
                              {shown.text ? (
                                shown.isHtml ? <span className={styles.output}>{shown.text}</span> : <code className={styles.output}>{shown.text}</code>
                              ) : (
                                <em>(empty)</em>
                              )}
                            </>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </article>
      </main>
    </Layout>
  );
}

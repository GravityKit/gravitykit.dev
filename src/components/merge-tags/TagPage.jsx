import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, SECTIONS, requiresText, sectionOf } from './shared';
import TagPart from './TagPart';
import styles from './merge-tags.module.css';

// Captured output can be a whole {all_fields} table; the page shows the start of it as text.
const OUTPUT_PREVIEW_CHARS = 400;

function preview(text) {
  const value = String(text ?? '');
  return value.length > OUTPUT_PREVIEW_CHARS ? `${value.slice(0, OUTPUT_PREVIEW_CHARS)}…` : value;
}

/** `>=2.5` reads as "2.5 or later"; any other constraint is shown as written. */
function versionText(constraint) {
  const match = /^>=\s*(.+)$/.exec(String(constraint));
  return match ? `${match[1]} or later` : String(constraint);
}

function Requires({ requires }) {
  const text = requiresText(requires);
  return text ? <p className={styles.hint}>Needs {text}.</p> : null;
}

/** One merge tag, built at /merge-tags/<tag>/ by src/plugins/merge-tag-pages.mjs. */
export default function TagPage({ data }) {
  const { tag, offered, captures, captureCount } = data;
  const parts = [...(tag.parameter ? [tag.parameter] : []), ...(tag.parameters || []), ...(tag.attributes || [])];
  const isField = tag.name === '*field*';
  const title = isField ? 'Form field merge tag' : `{${tag.name}} merge tag`;

  return (
    <Layout title={title} description={tag.description || `${tag.label}: the ${tag.syntax} merge tag, its options and examples.`}>
      <main className="container margin-vert--lg">
        <MergeTagsNav current="tag" />
        <p className={styles.productLine}>{PRODUCT_NAMES[tag.product] || tag.product}</p>
        <h1 className={styles.tagTitle}>
          <code>{tag.syntax}</code>
        </h1>
        <p className={styles.tagLabel}>{tag.label}</p>
        {tag.description && <p className={styles.lede}>{tag.description}</p>}
        <Requires requires={tag.requires} />
        {tag.entry_dependent && (
          <p className={styles.hint}>Its value comes from a form entry.</p>
        )}

        {isField && (
          <div className={`alert alert--info ${styles.section}`}>
            Which modifiers a form field takes depends on the kind of field. See <a href="/merge-tags/fields">Modifiers by field</a>.
          </div>
        )}

        {parts.length > 0 && (
          <section className={styles.section} aria-labelledby="options">
            <h2 id="options">{tag.attributes?.length ? 'Attributes' : 'What goes after the colon'}</h2>
            <div className={styles.partList}>
              {parts.map((part, index) => (
                <TagPart key={part.name || part.label || index} part={part} />
              ))}
            </div>
          </section>
        )}

        {offered.length > 0 && (
          <section className={styles.section} aria-labelledby="modifiers">
            <h2 id="modifiers">Modifiers</h2>
            <p className={styles.hint}>What the merge tag picker offers on this tag.</p>
            {SECTIONS.map((section) => {
              const items = offered.filter((item) => sectionOf(item.modifier) === section.key);
              if (items.length === 0) return null;

              return (
                <div key={section.key} className={styles.section}>
                  <h3>{section.title}</h3>
                  <ul className={styles.modifierList}>
                    {items.map(({ modifier }) => (
                      <li key={modifier.id} className={styles.modifier}>
                        <div className={styles.modifierHead}>
                          <span className={styles.modifierLabel}>{modifier.label}</span>
                          <code>{modifier.name}</code>
                          <span className={styles.product}>{requiresText(modifier.requires)}</span>
                        </div>
                        {modifier.description && <p className={styles.modifierText}>{modifier.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}

        {!isField && parts.length === 0 && offered.length === 0 && (
          <p className={styles.section}>This tag takes no modifiers, property or parameter. Write it exactly as shown.</p>
        )}

        {captures.length > 0 && (
          <section className={styles.section} aria-labelledby="examples">
            <h2 id="examples">Examples</h2>
            <p className={styles.hint}>
              Rendered by real Gravity Forms and GravityKit PHP against a fixed test entry.
              {captureCount > captures.length && (
                <>
                  {' '}
                  {captures.length} of {captureCount} shown; the rest are on <a href="/merge-tags">All merge tags</a>.
                </>
              )}
            </p>
            <table className={styles.examples}>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">Output</th>
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
                      <code className={styles.output}>{preview(capture.out) || '(empty)'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </Layout>
  );
}

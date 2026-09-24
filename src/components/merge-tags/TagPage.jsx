import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, SECTIONS, requiresText, sectionOf } from './shared';
import Examples from './Examples';

const TYPE_NAMES = { integer: 'number', string: 'text', enum: 'one of the values', open_enum: 'text', field_ref: 'field ID' };

/**
 * One merge tag, built at /merge-tags/<tag>/ by src/plugins/merge-tag-pages.mjs. Laid out like a
 * hook page (the same `markdown` wrapper and plain tables), so the two references read alike.
 */
export default function TagPage({ data }) {
  const { tag, offered, plain, withModifier } = data;
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
                              <a href={`/merge-tags/modifiers/${modifier.name}/`}>
                                <code>{modifier.name}</code>
                              </a>
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

          {(plain.length > 0 || withModifier.length > 0) && (
            <>
              <h2 id="examples">Examples</h2>
              <p>Rendered by real Gravity Forms and GravityKit PHP against a test entry.</p>
              {plain.length > 0 && <Examples examples={plain} showBefore={false} />}
              {withModifier.length > 0 && (
                <>
                  <h3>With a modifier</h3>
                  <Examples examples={withModifier} />
                </>
              )}
            </>
          )}

          {isField && (
            <p>
              Each modifier's own page has examples on real fields: see <a href="/merge-tags/fields/">Modifiers by field</a>.
            </p>
          )}
        </article>
      </main>
    </Layout>
  );
}

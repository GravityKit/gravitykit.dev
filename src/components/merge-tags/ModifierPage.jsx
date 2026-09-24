import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, SECTIONS, requiresText, sectionOf } from './shared';
import Examples, { UsageExample } from './Examples';

function appliesToText(modifier, fieldTypeNames = {}) {
  const tags = modifier.applies_to?.tags;
  const types = modifier.applies_to?.field_types;
  const tagText = Array.isArray(tags) ? tags.map((t) => (t === '*field*' ? 'form fields' : `{${t}}`)).join(', ') : 'any merge tag';
  if (!Array.isArray(types)) return tagText;
  const typeText = types.map((t) => fieldTypeNames[t] || t).join(', ');
  return tagText === 'form fields' ? `${typeText} fields` : `${tagText} (${typeText})`;
}

function anchorOf(index) {
  return `meaning-${index + 1}`;
}

function Entry({ entry, index, many, reasons, fieldTypeNames }) {
  const { modifier, examples, offeredOnFields, offeredOnTags, withheld } = entry;
  const section = SECTIONS.find((s) => s.key === sectionOf(modifier));

  return (
    <section id={many ? anchorOf(index) : undefined}>
      <h2>{many ? modifier.label : 'About'}</h2>
      {many && <p className="margin-bottom--sm">On {appliesToText(modifier, fieldTypeNames)}.</p>}
      {modifier.description && <p>{modifier.description}</p>}

      <table>
        <tbody>
          <tr>
            <th scope="row">Product</th>
            <td>{PRODUCT_NAMES[modifier.product] || modifier.product}</td>
          </tr>
          <tr>
            <th scope="row">Requires</th>
            <td>{requiresText(modifier.requires) || '—'}</td>
          </tr>
          <tr>
            <th scope="row">Works on</th>
            <td>{appliesToText(modifier, fieldTypeNames)}</td>
          </tr>
          <tr>
            <th scope="row">In the picker</th>
            <td>{section?.title}</td>
          </tr>
          {modifier.exclusive && (
            <tr>
              <th scope="row">Combining</th>
              <td>Only works on its own: with any other modifier, it is ignored.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modifier.usage?.length > 0 && (
        <>
          <h3>How to use it</h3>
          {modifier.usage.map((usage) => (
            <UsageExample key={usage.template} usage={usage} />
          ))}
        </>
      )}

      {examples.length > 0 && (
        <>
          <h3>Examples</h3>
          <p>Rendered by real Gravity Forms and GravityKit PHP against a test entry.</p>
          <Examples examples={examples} />
        </>
      )}

      {(offeredOnFields.length > 0 || offeredOnTags.length > 0) && (
        <>
          <h3>Where the merge tag picker offers it</h3>
          {offeredOnFields.length > 0 && (
            <p>
              Form fields:{' '}
              {offeredOnFields.map((field, i) => (
                <span key={field.key}>
                  {i > 0 && ' · '}
                  <a href={`/merge-tags/fields/#${field.key}`}>{field.label}</a>
                </span>
              ))}
              .
            </p>
          )}
          {offeredOnTags.length > 0 && (
            <p>
              Merge tags:{' '}
              {offeredOnTags.map((tagName, i) => (
                <span key={tagName}>
                  {i > 0 && ' · '}
                  <a href={`/merge-tags/${tagName}/`}>
                    <code>{`{${tagName}}`}</code>
                  </a>
                </span>
              ))}
              .
            </p>
          )}
        </>
      )}

      {withheld.length > 0 && (
        <>
          <h3>Where it is left out</h3>
          <table>
            <thead>
              <tr>
                <th>Field kinds</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {withheld.map((item) => (
                <tr key={item.reason}>
                  <td>{item.fields.join(' · ')}</td>
                  <td>
                    <strong>{reasons[item.reason]?.title || item.reason}.</strong> {reasons[item.reason]?.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/** One modifier name, built at /merge-tags/modifiers/<name>/ by src/plugins/merge-tag-pages.mjs. */
export default function ModifierPage({ data }) {
  const { name, entries, reasons, fieldTypeNames } = data;
  const many = entries.length > 1;
  const first = entries[0]?.modifier;

  return (
    <Layout
      title={`:${name} merge tag modifier`}
      description={first ? `${first.label}: the :${name} merge tag modifier, where it works, and examples.` : `The :${name} merge tag modifier.`}
    >
      <main className="container margin-vert--lg">
        <MergeTagsNav current="modifier" />
        <article className="theme-doc-markdown markdown">
          <header>
            <h1>Modifier: :{name}</h1>
          </header>
          {many ? (
            <>
              <p>
                <code>:{name}</code> means different things depending on the merge tag or the kind of field:
              </p>
              <ul>
                {entries.map((entry, index) => (
                  <li key={entry.modifier.id}>
                    <a href={`#${anchorOf(index)}`}>{entry.modifier.label}</a> on {appliesToText(entry.modifier, fieldTypeNames)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            first && (
              <p>
                <strong>{first.label}.</strong> Write it after a colon: <code>{first.example?.in || `{Field:1:${name}}`}</code>
              </p>
            )
          )}

          {entries.map((entry, index) => (
            <Entry key={entry.modifier.id} entry={entry} index={index} many={many} reasons={reasons} fieldTypeNames={fieldTypeNames} />
          ))}
        </article>
      </main>
    </Layout>
  );
}

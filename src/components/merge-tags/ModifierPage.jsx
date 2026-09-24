import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, SECTIONS, requiresText, sectionOf } from './shared';
import Examples, { Output, UsageExample, diffText } from './Examples';
import { PHP_DATE_FORMAT_URL } from './data.mjs';

/** "a and b", "a, b, and c" */
function listText(items) {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function appliesToText(modifier, fieldTypeNames = {}) {
  const tags = modifier.applies_to?.tags;
  const types = modifier.applies_to?.field_types;
  const tagText = Array.isArray(tags) ? listText(tags.map((t) => (t === '*field*' ? 'form fields' : `{${t}}`))) : 'any merge tag';
  if (!Array.isArray(types)) return tagText;
  const typeText = listText(types.map((t) => fieldTypeNames[t] || t));
  return tagText === 'form fields' ? `${typeText} fields` : `${tagText} (${typeText})`;
}

/**
 * Where an entry applies, from the offer grid (the same rows as Works on), so the scope never
 * names a field kind the page then lists as left out. Falls back to the catalog's scope when the
 * picker offers it nowhere.
 */
function scopeText(entry, fieldTypeNames) {
  const { modifier, offeredOnFields, offeredOnTags } = entry;
  const parts = offeredOnTags.map((tag) => `{${tag}}`);
  if (offeredOnFields.length) {
    // A label with its own comma ("Checkboxes, one choice") is quoted, so the list still reads.
    const labels = offeredOnFields.map((f) => (f.label.includes(',') ? `“${f.label}”` : f.label));
    parts.push(Array.isArray(modifier.applies_to?.field_types) ? `${listText(labels)} fields` : 'form fields');
  }
  return parts.length ? listText(parts) : appliesToText(modifier, fieldTypeNames);
}

function anchorOf(index) {
  return `meaning-${index + 1}`;
}

/** The picker section, with the scope it applies to, so two entries of one modifier never read as a contradiction. */
function pickerText(entry, fieldTypeNames) {
  const section = SECTIONS.find((s) => s.key === sectionOf(entry.modifier));
  return `${section?.title}, for ${scopeText(entry, fieldTypeNames)}`;
}

/** A real capture of the modifier, on a field kind or tag the picker offers it on. */
function LeadExample({ lead }) {
  if (!lead) return null;
  if (lead.diff) {
    return (
      <>
        Example: <code>{lead.in}</code>. {diffText(lead.diff)}
      </>
    );
  }
  return (
    <>
      Example: <code>{lead.in}</code> gives <Output value={lead.out} />
      {lead.same ? ', the same as the field alone.' : '.'}
      {lead.field && (
        <>
          {' '}
          On the test form, this field is <code>{lead.field.tag}</code> ({lead.field.kind}).
        </>
      )}
    </>
  );
}

function DateFormatHelp({ help }) {
  if (!help) return null;
  return (
    <div className="alert alert--info margin-bottom--md">
      <p className="margin-bottom--sm">
        The format uses PHP date letters, like <code>Y</code> for a four-digit year. See{' '}
        <a href={PHP_DATE_FORMAT_URL}>PHP's table of date format letters</a>.
      </p>
      {help.commaNeedsBackslash ? (
        <p className="margin-bottom--none">
          Put a backslash before each comma, like <code>{'format:l\\, F jS\\, Y'}</code>. GravityView splits modifiers at
          each comma, so without the backslash the format stops at the first comma.
        </p>
      ) : (
        <p className="margin-bottom--none">
          A comma needs no backslash here: everything after <code>format:</code>, up to the closing brace, is the format. A
          backslash before it (<code>{'\\,'}</code>) also works.
        </p>
      )}
    </div>
  );
}

function FieldLinks({ fields }) {
  return fields.map((field, i) => (
    <span key={field.key}>
      {i > 0 && ' · '}
      <a href={`/merge-tags/fields/#${field.key}`}>{field.label}</a>
    </span>
  ));
}

function Entry({ entry, index, many, reasons, fieldTypeNames }) {
  const { modifier, examples, offeredOnFields, offeredOnTags, withheld, locked = [], dateFormat, outsideViews } = entry;
  const leftOut = [
    ...withheld.map((item) => ({ key: item.reason, fields: item.fields, title: reasons[item.reason]?.title || item.reason, text: reasons[item.reason]?.explanation })),
    ...locked.map((item) => ({ key: item.why, fields: item.fields, title: 'Locked there', text: item.why })),
  ];

  return (
    <section id={many ? anchorOf(index) : undefined}>
      <h2>{many ? modifier.label : 'About'}</h2>
      {modifier.description && <p>{modifier.description}</p>}
      {outsideViews && <p>Works in any merge tag while GravityView is active, including Gravity Forms notifications.</p>}
      <DateFormatHelp help={dateFormat} />

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
            <th scope="row">In the picker</th>
            <td>{pickerText(entry, fieldTypeNames)}</td>
          </tr>
          {modifier.exclusive && (
            <tr>
              <th scope="row">Combining</th>
              <td>Use it alone. With other modifiers, it is ignored.</td>
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
          <p>Output from the real plugin code, run on a test entry.</p>
          <Examples examples={examples} />
        </>
      )}

      <h3>Works on</h3>
      {offeredOnFields.length === 0 && offeredOnTags.length === 0 && (
        <p>The merge tag picker does not offer it anywhere.</p>
      )}
      {offeredOnFields.length > 0 && (
        <p>
          Form fields: <FieldLinks fields={offeredOnFields} />.
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

      {leftOut.length > 0 && (
        <>
          <h3>Left out</h3>
          <table>
            <thead>
              <tr>
                <th>Field kinds</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {leftOut.map((item) => (
                <tr key={item.key}>
                  <td>{item.fields.join(' · ')}</td>
                  <td>
                    <strong>{item.title}.</strong> {item.text}
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
            <h1>
              Modifier <code>:{name}</code>
            </h1>
          </header>
          {many ? (
            <>
              <p>
                <code>:{name}</code> does different things on different tags and fields:
              </p>
              <ul>
                {entries.map((entry, index) => (
                  <li key={entry.modifier.id}>
                    <a href={`#${anchorOf(index)}`}>{entry.modifier.label}</a> on {scopeText(entry, fieldTypeNames)}, under{' '}
                    {SECTIONS.find((s) => s.key === sectionOf(entry.modifier))?.title} in the picker.
                    {entry.lead && (
                      <>
                        <br />
                        <LeadExample lead={entry.lead} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            first && (
              <p>
                <strong>{first.label}.</strong> <LeadExample lead={entries[0].lead} />
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

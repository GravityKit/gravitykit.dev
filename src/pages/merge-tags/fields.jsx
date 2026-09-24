import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import {
  MergeTagsNav,
  PRODUCT_NAMES,
  SECTIONS,
  productName,
  requiresText,
  StatusMessage,
  sectionOf,
  useMergeTagArtifact,
} from '../../components/merge-tags/shared';
import styles from '../../components/merge-tags/merge-tags.module.css';
import { Output } from '../../components/merge-tags/Examples';
import { decodeEntities, fieldTagOf, groupModifiersByProduct, reasonsWithCapturedDate } from '../../components/merge-tags/data.mjs';

/**
 * Modifiers by field: pick a kind of form field, see what the merge tag picker offers for it,
 * and why everything else is left out. One field at a time, because all of them at once is a
 * 39 by 64 grid, which has its own page at /merge-tags/compare.
 */

function readHash(keys) {
  if (typeof window === 'undefined') return null;
  const key = decodeURIComponent(window.location.hash.slice(1));
  return keys.includes(key) ? key : null;
}

// A modifier offered on at least this share of field kinds is listed once, as a link, instead
// of being described again on every field.
const COMMON_SHARE = 0.6;

function commonModifierIds(offers) {
  const counts = new Map();
  for (const row of offers.fields) {
    for (const item of row.offered) {
      if (!item.locked) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= offers.fields.length * COMMON_SHARE).map(([id]) => id));
}

/** One modifier's captured result, as text a reader sees, or why there is none. */
function SampleResult({ example }) {
  if (!example) return <span className={styles.sampleNote}>No sample</span>;
  if (example.warnings?.length) return <span className={styles.sampleNote}>Outputs nothing, and PHP logs a warning</span>;
  if (example.empty) return <span className={styles.sampleNote}>Outputs nothing</span>;
  if (example.same) return <span className={styles.sampleNote}>Same as the field alone, for this value</span>;
  if (example.unresolved) return <span className={styles.sampleNote}>Left as written: nothing replaced it</span>;
  if (example.error) return <span className={styles.sampleNote}>Failed to render</span>;
  return <span className={styles.sampleOut}>{decodeEntities(example.out)}</span>;
}

/** A tag that may wrap only after a colon or comma, so `{Referral Code:105:maxwords:10}` never breaks mid-word. */
function breakableTag(tag) {
  return tag.split(/(?<=[:,])/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));
}

/**
 * The modifier, a sample merge tag using it, and what that tag gave on the test form. With
 * `detailed`, the modifier cell also carries its plugin, its description and its badges.
 */
function ModifierTable({ items, exampleFor, detailed = false }) {
  return (
    <table className={styles.sampleTable}>
      <thead>
        <tr>
          <th scope="col">Modifier</th>
          <th scope="col">Sample Merge Tag</th>
          <th scope="col">Sample Result</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const example = exampleFor(item.id);
          const { modifier } = item;
          return (
            <tr key={item.id}>
              <th scope="row">
                <a href={`/merge-tags/modifiers/${modifier.name}/`}>
                  <code>{modifier.name}</code>
                </a>
                <span className={styles.sampleLabel}>{modifier.label}</span>
                {detailed && (
                  <>
                    <span className={styles.sampleMeta}>
                      {requiresText(modifier.requires) || PRODUCT_NAMES[modifier.product] || modifier.product}
                    </span>
                    {modifier.description && <span className={styles.sampleMeta}>{modifier.description}</span>}
                    {modifier.exclusive && <span className="badge badge--warning">Only works on its own</span>}
                    {item.locked && <span className="badge badge--secondary">Locked here</span>}
                    {item.written && <span className="badge badge--success">In the example tag</span>}
                  </>
                )}
              </th>
              <td data-label="Sample Merge Tag">{example ? <code>{breakableTag(example.in)}</code> : null}</td>
              <td data-label="Sample Result">
                <SampleResult example={example} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One table per product, Gravity Forms first, then GravityView, then the rest. */
function ModifierTables({ items, exampleFor }) {
  return groupModifiersByProduct(items, productName).map(([name, list]) => (
    <div key={name}>
      <h4 className={styles.commonProduct}>{name}</h4>
      <ModifierTable items={list} exampleFor={exampleFor} />
    </div>
  ));
}

/** The field with no modifier: the same columns, so the rows below read against it. */
function PlainTable({ example }) {
  return (
    <table className={styles.sampleTable}>
      <thead>
        <tr>
          <th scope="col">Modifier</th>
          <th scope="col">Sample Merge Tag</th>
          <th scope="col">Sample Result</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">
            <span className={styles.sampleMeta}>No modifier</span>
          </th>
          <td data-label="Sample Merge Tag">
            <code>{breakableTag(example.in)}</code>
          </td>
          <td data-label="Sample Result">
            <SampleResult example={{ ...example, same: false }} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function FieldDetail({ row, byId, reasons, common, examples, unavailable, headingRef }) {
  const exampleFor = (id) => examples?.modifiers.find((example) => example.id === id);
  const all = row.offered.map((item) => ({ ...item, modifier: byId.get(item.id) })).filter((item) => item.modifier);
  const isCommon = (item) => common.has(item.id) && !item.locked && !item.written;
  const offered = all.filter((item) => !isCommon(item));
  const commonHere = all.filter(isCommon);
  const lockReasons = [...new Set(offered.filter((item) => item.locked).map((item) => item.locked))];
  const withheldByReason = new Map();

  for (const item of row.withheld) {
    const modifier = byId.get(item.id);
    if (!modifier) continue;
    if (!withheldByReason.has(item.reason)) withheldByReason.set(item.reason, []);
    withheldByReason.get(item.reason).push({ ...item, modifier });
  }

  return (
    <article aria-labelledby="field-title">
      <header className={styles.detailHead}>
        <h2 id="field-title" ref={headingRef} tabIndex={-1}>
          {row.label}
        </h2>
        <p className={styles.example}>
          <code>{row.example}</code>
        </p>
        {row.note && <p className={styles.note}>{row.note}</p>}
        {examples?.plain && (
          <div className={styles.fieldPlain}>
            <p className={styles.fieldPlainHead}>
              {fieldTagOf(examples.plain.in) ? (
                <>
                  On the test form, this field is <code>{fieldTagOf(examples.plain.in)}</code>. Without a modifier:
                </>
              ) : (
                'On the test form, without a modifier:'
              )}
            </p>
            <PlainTable example={examples.plain} />
            {examples.plain.warnings?.length > 0 && (
              <p className={styles.hint}>
                Gravity Forms expects one part of this field, such as <code>.1</code>, and warns on the field as a whole,
                so the tag alone outputs nothing, and so does every modifier added to it.
              </p>
            )}
            {examples.plain.empty && !examples.plain.warnings?.length && (
              <p className={styles.hint}>
                Gravity Forms has no single value for this field as a whole, so the tag alone outputs nothing, and so does
                every modifier added to it.
              </p>
            )}
          </div>
        )}
        {unavailable && <p className={styles.hint}>No examples: {unavailable}</p>}
        {lockReasons.map((reason) => (
          <p key={reason} className={styles.locks}>
            <strong>Locked here:</strong> {reason}
          </p>
        ))}
      </header>

      {SECTIONS.map((section) => {
        const items = offered.filter((item) => sectionOf(item.modifier) === section.key);
        if (items.length === 0) return null;

        return (
          <section key={section.key} className={styles.section} aria-labelledby={`sec-${section.key}`}>
            <h3 id={`sec-${section.key}`}>
              {section.title}
            </h3>
            {section.hint && <p className={styles.hint}>{section.hint}</p>}
            <ModifierTable items={items} exampleFor={exampleFor} detailed />
          </section>
        );
      })}

      {commonHere.length > 0 && (
        <section className={styles.section} aria-labelledby="sec-common">
          <h3 id="sec-common">
            Additional Modifiers
          </h3>
          <ModifierTables items={commonHere} exampleFor={exampleFor} />
        </section>
      )}

      {withheldByReason.size > 0 && (
        <section className={styles.section} aria-labelledby="sec-withheld">
          <h3 id="sec-withheld">Not offered on this field</h3>
          <div className={styles.reasons}>
            {[...withheldByReason.entries()].map(([reason, items]) => (
              <div key={reason} className={styles.reason}>
                <h4>{reasons[reason]?.title || reason}</h4>
                <p className={styles.hint}>{reasons[reason]?.explanation}</p>
                <ul className={styles.inlineList}>
                  {items.map((item) => (
                    <li key={item.id}>
                      {item.modifier.label}{' '}
                      <a href={`/merge-tags/modifiers/${item.modifier.name}/`}>
                        <code>{item.modifier.name}</code>
                      </a>
                      {item.needs?.length > 0 && <span className={styles.needs}> (needs {item.needs.join(', ')})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export default function MergeTagFieldsPage() {
  const state = useMergeTagArtifact();
  const offers = state.artifact?.offers;
  const byId = useMemo(() => new Map((state.artifact?.modifiers || []).map((m) => [m.id, m])), [state.artifact]);
  const keys = useMemo(() => (offers ? offers.fields.map((row) => row.key) : []), [offers]);
  const common = useMemo(() => (offers ? commonModifierIds(offers) : new Set()), [offers]);
  const reasons = useMemo(() => reasonsWithCapturedDate(state.artifact), [state.artifact]);
  const [selected, setSelected] = useState(null);
  // After a reader picks a field kind, focus moves to its heading, so a screen reader announces
  // the new content. Not on first load, where focus belongs at the top of the page.
  const heading = useRef(null);
  const focusPending = useRef(false);

  useEffect(() => {
    if (!offers) return undefined;
    const sync = () => setSelected(readHash(keys) || keys[0]);
    const onHashChange = () => {
      focusPending.current = true;
      sync();
    };
    sync();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [offers, keys]);

  useEffect(() => {
    if (!focusPending.current || !heading.current) return;
    focusPending.current = false;
    heading.current.focus();
  }, [selected]);

  const row = offers?.fields.find((field) => field.key === selected);
  const choose = (key) => {
    window.history.replaceState(null, '', `#${key}`);
    focusPending.current = true;
    setSelected(key);
  };

  return (
    <Layout title="Modifiers by field" description="What the merge tag picker offers for each kind of Gravity Forms field, and why it leaves out the rest.">
      <main className="container margin-vert--lg">
        <MergeTagsNav current="fields" />
        <h1>Modifiers by field</h1>
        <p className={styles.lede}>
          Choose a kind of form field to see which modifiers the merge tag picker offers for <a href="/merge-tags/field/"><code>{'{Field Label:ID}'}</code></a>,
          and why the others are left out. To see every field kind side by side,
          use <a href="/merge-tags/compare/">Compare fields</a>.
        </p>
        <p className={styles.hint}>
          The number in a field's tag is its field ID. The form editor shows it as “ID” at the top of the field's settings.
          A number after a dot, like <code>.3</code>, picks one part of a field, such as the first name.
        </p>

        <StatusMessage state={state} what="the field reference" />

        {offers && row && (
          <>
            <div className={styles.layout}>
              <nav aria-label="Field kinds" className={styles.picker}>
                <label htmlFor="field-kind" className={styles.mobileLabel}>
                  Field kind
                </label>
                <select id="field-kind" className={styles.mobileSelect} value={selected} onChange={(e) => choose(e.target.value)}>
                  {offers.groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {offers.fields
                        .filter((field) => field.group === group)
                        .map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <div className={styles.desktopList}>
                  {offers.groups.map((group) => (
                    <div key={group} className={styles.pickerGroup}>
                      <h2 className={styles.pickerHeading}>{group}</h2>
                      <ul>
                        {offers.fields
                          .filter((field) => field.group === group)
                          .map((field) => (
                            <li key={field.key}>
                              <a
                                href={`#${field.key}`}
                                aria-current={field.key === selected ? 'true' : undefined}
                                className={field.key === selected ? styles.pickerActive : undefined}
                              >
                                {field.label}
                              </a>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </nav>
              <FieldDetail
                row={row}
                byId={byId}
                reasons={reasons}
                headingRef={heading}
                common={common}
                examples={state.artifact.field_examples?.rows?.[row.key]}
                unavailable={state.artifact.field_examples?.unavailable?.[row.key]}
              />
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import {
  MergeTagsNav,
  PRODUCT_NAMES,
  SECTIONS,
  requiresText,
  StatusMessage,
  sectionOf,
  useMergeTagArtifact,
} from '../../components/merge-tags/shared';
import styles from '../../components/merge-tags/merge-tags.module.css';

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

function ModifierItem({ modifier, locked, written }) {
  return (
    <li className={styles.modifier}>
      <div className={styles.modifierHead}>
        <span className={styles.modifierLabel}>{modifier.label}</span>
        <code>{modifier.name}</code>
        <span className={styles.product}>{requiresText(modifier.requires) || PRODUCT_NAMES[modifier.product] || modifier.product}</span>
        {modifier.exclusive && <span className="badge badge--warning">Only works on its own</span>}
        {locked && <span className="badge badge--secondary">Locked here</span>}
        {written && <span className="badge badge--success">In the example tag</span>}
      </div>
      {modifier.description && <p className={styles.modifierText}>{modifier.description}</p>}
    </li>
  );
}

function FieldDetail({ row, byId, reasons }) {
  const offered = row.offered.map((item) => ({ ...item, modifier: byId.get(item.id) })).filter((item) => item.modifier);
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
        <h2 id="field-title">{row.label}</h2>
        <p className={styles.example}>
          <code>{row.example}</code>
        </p>
        {row.note && <p className={styles.note}>{row.note}</p>}
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
              {section.title} <span className={styles.count}>{items.length}</span>
            </h3>
            {section.hint && <p className={styles.hint}>{section.hint}</p>}
            <ul className={styles.modifierList}>
              {items.map((item) => (
                <ModifierItem key={item.id} modifier={item.modifier} locked={item.locked} written={item.written} />
              ))}
            </ul>
          </section>
        );
      })}

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
                      {item.modifier.label} <code>{item.modifier.name}</code>
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
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!offers) return undefined;
    const sync = () => setSelected(readHash(keys) || keys[0]);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [offers, keys]);

  const row = offers?.fields.find((field) => field.key === selected);
  const choose = (key) => {
    window.history.replaceState(null, '', `#${key}`);
    setSelected(key);
  };

  return (
    <Layout title="Modifiers by field" description="What the merge tag picker offers for each kind of Gravity Forms field, and why the rest is left out.">
      <main className="container margin-vert--lg">
        <MergeTagsNav current="fields" />
        <h1>Modifiers by field</h1>
        <p className={styles.lede}>
          Choose a kind of form field to see which modifiers the merge tag picker offers for <a href="/merge-tags/field/"><code>{'{Field Label:ID}'}</code></a>,
          and why the others are left out. Generated from the picker's own rules. To see every field kind side by side,
          use <a href="/merge-tags/compare/">Compare fields</a>.
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
              <FieldDetail row={row} byId={byId} reasons={offers.reasons} />
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}

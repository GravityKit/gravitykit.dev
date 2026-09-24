import { useMemo } from 'react';
import Layout from '@theme/Layout';
import { MergeTagsNav, SECTIONS, StatusMessage, requiresText, sectionOf, useMergeTagArtifact } from '../../components/merge-tags/shared';
import styles from '../../components/merge-tags/merge-tags.module.css';

/** Every field kind against every form field modifier, from the picker's own offer rules. */
export default function MergeTagComparePage() {
  const state = useMergeTagArtifact();
  const offers = state.artifact?.offers;
  const byId = useMemo(() => new Map((state.artifact?.modifiers || []).map((m) => [m.id, m])), [state.artifact]);

  const columns = useMemo(() => {
    if (!offers) return [];
    const seen = new Map();
    for (const row of offers.fields) {
      for (const item of row.offered) {
        const modifier = byId.get(item.id);
        if (!modifier) continue;
        const column = seen.get(modifier.name) ?? { name: modifier.name, section: sectionOf(modifier), labels: new Set(), count: 0 };
        column.labels.add(modifier.label);
        column.count += 1;
        seen.set(modifier.name, column);
      }
    }
    // Most widely offered first within each section, so the common settings sit together on the left.
    return SECTIONS.flatMap((section) =>
      [...seen.values()].filter((c) => c.section === section.key).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    );
  }, [offers, byId]);

  return (
    <Layout title="Compare fields" description="Every kind of Gravity Forms field against every merge tag modifier the picker offers.">
      {/* Same container as the sibling pages, so the tabs do not jump sideways; the grid scrolls inside it. */}
      <main className="container margin-vert--lg">
        <MergeTagsNav current="compare" />
        <article>
        <header>
          <h1>Compare fields</h1>
        </header>
        <p className={styles.lede}>
          Every kind of form field against every modifier the merge tag picker offers for <code>{'{Field Label:ID}'}</code>. Point at
          a dot, or focus the grid and read it with a screen reader, for the modifier's name and the version it needs. Choose a
          field kind to see why a modifier is left out.
        </p>
        <ul className={styles.legend}>
          {SECTIONS.map((section) => (
            <li key={section.key}>
              <span className={`${styles.swatch} ${styles[`swatch_${section.key}`]}`} aria-hidden="true" />
              {section.title}
            </li>
          ))}
          <li>
            <span aria-hidden="true">●</span> Offered: the picker shows this modifier for that field
          </li>
          <li>
            <span aria-hidden="true">○</span> Shown but locked: another setting in the example turns it off
          </li>
          <li>Empty: not offered for that field</li>
        </ul>

        <StatusMessage state={state} what="the field comparison" />

        {offers && (
          <div className={styles.compareScroll} role="region" aria-label="Field comparison grid, scrolls sideways" tabIndex={0}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col" rowSpan={2} className={styles.corner}>
                    Field kind
                  </th>
                  {SECTIONS.map((section) => {
                    const span = columns.filter((c) => c.section === section.key).length;
                    return span ? (
                      <th key={section.key} scope="colgroup" colSpan={span} className={`${styles.sectionHead} ${styles[`section_${section.key}`]}`}>
                        <span className={styles.sectionLabel}>{section.title}</span>
                      </th>
                    ) : null;
                  })}
                </tr>
                <tr>
                  {columns.map((column) => (
                    <th key={column.name} scope="col" className={styles.rotated} title={[...column.labels].join(' / ')}>
                      <a href={`/merge-tags/modifiers/${column.name}/`}>
                        <span>
                          <code>{column.name}</code>
                        </span>
                      </a>
                    </th>
                  ))}
                </tr>
              </thead>
              {offers.groups.map((group) => (
                <tbody key={group}>
                  <tr className={styles.groupRow}>
                    <th scope="rowgroup" colSpan={columns.length + 1}>
                      {/* The label, not the full-width cell, is what stays pinned while the grid scrolls sideways. */}
                      <span className={styles.groupLabel}>{group}</span>
                    </th>
                  </tr>
                  {offers.fields
                    .filter((row) => row.group === group)
                    .map((row) => {
                      const byName = new Map(row.offered.map((item) => [byId.get(item.id)?.name, item]));
                      return (
                        <tr key={row.key}>
                          <th scope="row">
                            <a href={`/merge-tags/fields/#${row.key}`}>{row.label}</a>
                          </th>
                          {columns.map((column) => {
                            const item = byName.get(column.name);
                            const modifier = item && byId.get(item.id);
                            const locked = item?.locked;
                            const state = locked ? `shown but locked: ${locked.replace(/\.$/, '')}` : 'offered';
                            const title = modifier
                              ? `:${column.name} (${modifier.label}) on ${row.label}: ${state}. Needs ${requiresText(modifier.requires)}.`
                              : undefined;
                            return (
                              <td key={column.name} title={title} className={item ? styles[`cell_${column.section}`] : undefined}>
                                {item ? <span aria-hidden="true">{locked ? '○' : '●'}</span> : ''}
                                {item && <span className={styles.srOnly}>{`:${column.name} ${state}`}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              ))}
            </table>
          </div>
        )}
        </article>
      </main>
    </Layout>
  );
}

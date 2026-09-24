import { useMemo } from 'react';
import Layout from '@theme/Layout';
import { MergeTagsNav, PRODUCT_NAMES, StatusMessage, requiresText, useMergeTagArtifact } from '../../components/merge-tags/shared';
import TagPart from '../../components/merge-tags/TagPart';
import styles from '../../components/merge-tags/merge-tags.module.css';

/**
 * Tag options: what each merge tag other than a form field takes. One card per tag, each option
 * on its own line with what its values mean, instead of the values alone.
 */

function TagCard({ tag, offered, byId }) {
  const parts = [...(tag.parameter ? [tag.parameter] : []), ...(tag.parameters || []), ...(tag.attributes || [])];
  const modifiers = (offered || []).map((item) => byId.get(item.id)).filter(Boolean);

  return (
    <article className={styles.card} id={tag.name} aria-labelledby={`tag-${tag.name}`}>
      <header>
        <h3 id={`tag-${tag.name}`} className={styles.cardTitle}>
          <a href={`/merge-tags/${tag.name}/`}>{tag.label}</a>
        </h3>
        <p className={styles.example}>
          <code>{tag.syntax}</code>
        </p>
        <p className={styles.productLine}>{requiresText(tag.requires) || PRODUCT_NAMES[tag.product] || tag.product}</p>
        {tag.description && <p className={styles.hint}>{tag.description}</p>}
      </header>
      {parts.map((part, index) => (
        <TagPart key={part.name || part.label || index} part={part} />
      ))}
      {modifiers.length > 0 && (
        <dl className={styles.options}>
          {modifiers.map((modifier) => (
            <div key={modifier.id}>
              <dt>
                <a href={`/merge-tags/modifiers/${modifier.name}/`}>
                  <code>{modifier.name}</code>
                </a>
              </dt>
              <dd>{modifier.label}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

export default function MergeTagOptionsPage() {
  const state = useMergeTagArtifact();
  const artifact = state.artifact;
  const byId = useMemo(() => new Map((artifact?.modifiers || []).map((m) => [m.id, m])), [artifact]);
  const groups = useMemo(() => {
    if (!artifact?.offers) return null;
    const tags = artifact.tags.filter((tag) => tag.name !== '*field*');
    const takesParts = (tag) => tag.parameter || tag.parameters?.length || tag.attributes?.length;

    return {
      modifiers: tags.filter((tag) => artifact.offers.tags[tag.name]?.length),
      parts: tags.filter((tag) => !artifact.offers.tags[tag.name]?.length && takesParts(tag)),
      bare: tags.filter((tag) => !artifact.offers.tags[tag.name]?.length && !takesParts(tag)),
    };
  }, [artifact]);

  return (
    <Layout title="Merge tag options" description="What each merge tag other than a form field accepts: modifiers, a property, parameters or attributes.">
      <main className="container margin-vert--lg">
        <MergeTagsNav current="tags" />
        <h1>Merge tag options</h1>
        <p className={styles.lede}>
          What each merge tag accepts, other than form fields (see <a href="/merge-tags/fields">Modifiers by field</a> for those).
        </p>

        <StatusMessage state={state} what="the tag reference" />

        {groups && (
          <>
            <section className={styles.section} aria-labelledby="with-parts">
              <h2 id="with-parts">Tags that take a property or parameter</h2>
              <p className={styles.hint}>Written after the colon, like <code>{'{user:display_name}'}</code>.</p>
              <div className={styles.cards}>
                {groups.parts.map((tag) => (
                  <TagCard key={tag.name} tag={tag} byId={byId} />
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="with-modifiers">
              <h2 id="with-modifiers">Tags that take modifiers</h2>
              <p className={styles.hint}>The modifiers the merge tag picker offers on each.</p>
              <div className={styles.cards}>
                {groups.modifiers.map((tag) => (
                  <TagCard key={tag.name} tag={tag} offered={artifact.offers.tags[tag.name]} byId={byId} />
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="bare">
              <h2 id="bare">Tags written exactly as shown</h2>
              <p className={styles.hint}>These take no modifiers, property or parameter.</p>
              <ul className={styles.bare}>
                {groups.bare.map((tag) => (
                  <li key={tag.name}>
                    <a href={`/merge-tags/${tag.name}/`}>
                      <code>{tag.syntax}</code>
                    </a>{' '}
                    <span className={styles.muted}>{tag.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}

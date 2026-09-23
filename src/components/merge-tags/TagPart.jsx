import styles from './merge-tags.module.css';

/** One parameter, property or attribute of a merge tag: what it is and what its values mean. */
export default function TagPart({ part }) {
  const options = part.options || [];
  const kind = { integer: 'A number', string: 'Any text' }[part.type];

  return (
    <div className={styles.part}>
      <div className={styles.partHead}>
        {part.name && <code>{part.name}=</code>}
        <span className={styles.partLabel}>{part.label}</span>
        <span className={part.required ? 'badge badge--primary' : 'badge badge--secondary'}>{part.required ? 'Required' : 'Optional'}</span>
      </div>
      {part.description && <p className={styles.hint}>{part.description}</p>}
      {options.length > 0 ? (
        <dl className={styles.options}>
          {options.map((option) => (
            <div key={option.value}>
              <dt>
                <code>{option.value}</code>
              </dt>
              <dd>{option.label}</dd>
            </div>
          ))}
          {part.type === 'open_enum' && (
            <div>
              <dt className={styles.muted}>other</dt>
              <dd className={styles.muted}>Other values are accepted too.</dd>
            </div>
          )}
        </dl>
      ) : (
        kind && <p className={styles.hint}>{kind}.</p>
      )}
      {part.default !== undefined && part.default !== '' && (
        <p className={styles.hint}>
          Default: <code>{String(part.default)}</code>
        </p>
      )}
    </div>
  );
}

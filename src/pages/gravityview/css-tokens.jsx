import { useEffect, useMemo, useState } from 'react';
import Layout from '@theme/Layout';

const anchor = (slug) => String(slug).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const CATEGORY_ORDER = ['color', 'typography', 'dimensions', 'border', 'shadow', 'layout', 'motion'];

function Swatch({ value }) {
  if (!value || value === 'inherit') return null;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: 3,
        border: '1px solid var(--ifm-color-emphasis-300)',
        background: value,
        verticalAlign: 'middle',
        marginRight: 6,
      }}
    />
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${text}`}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      style={{
        marginLeft: 6,
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        color: 'var(--ifm-color-primary)',
        fontSize: 12,
      }}
    >
      {done ? '✓' : 'copy'}
    </button>
  );
}

function constraints(t) {
  const parts = [];
  if (Array.isArray(t.options) && t.options.length) parts.push(`options: ${t.options.join(' | ')}`);
  if (Array.isArray(t.units) && t.units.length) parts.push(`units: ${t.units.join(', ')}`);
  if (t.min != null) parts.push(`min ${t.min}`);
  if (t.max != null) parts.push(`max ${t.max}`);
  if (t.step != null) parts.push(`step ${t.step}`);
  return parts.join(', ');
}

function TokenReference() {
  const [tokens, setTokens] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showInternal, setShowInternal] = useState(false);

  useEffect(() => {
    fetch('/api/css-tokens.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { tokens: [] }))
      .then((d) => setTokens(Array.isArray(d.tokens) ? d.tokens : []))
      .catch(() => setTokens([]));
  }, []);

  const categories = useMemo(() => {
    if (!tokens) return [];
    const present = new Set(tokens.map((t) => t.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [tokens]);

  const filtered = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    return tokens.filter(
      (t) =>
        (showInternal || !t.private) &&
        (category === 'all' || t.category === category) &&
        (!q ||
          t.css_var.toLowerCase().includes(q) ||
          String(t.slug).toLowerCase().includes(q) ||
          String(t.desc || '').toLowerCase().includes(q)),
    );
  }, [tokens, query, category, showInternal]);

  if (tokens === null) return <p>Loading tokens…</p>;
  if (tokens.length === 0) {
    return (
      <p>
        <em>The token reference publishes with GravityView 3.0. Check back once it ships.</em>
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '1rem 0' }}>
        <input
          type="search"
          placeholder="Filter tokens…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '6px 10px', minWidth: 240, border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 6 }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} /> show internal
        </label>
        <span style={{ color: 'var(--ifm-color-emphasis-600)', fontSize: 14 }}>{filtered.length} tokens</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>CSS variable</th>
            <th style={{ width: '160px' }}>Default</th>
            <th style={{ width: '140px' }}>Control</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.slug} id={anchor(t.slug)}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {t.category === 'color' ? <Swatch value={t.default} /> : null}
                <code>{t.css_var}</code>
                <CopyButton text={t.css_var} />
                {t.private ? (
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ifm-color-warning-dark)' }}>internal</span>
                ) : t.studio ? (
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ifm-color-success-dark)' }}>themeable</span>
                ) : null}
              </td>
              <td style={{ width: '160px', wordBreak: 'break-word' }}>
                <code>{t.default === '' ? '(unset)' : t.default}</code>
              </td>
              <td style={{ fontSize: 13, width: '140px' }}>
                {t.control || ''}
                {constraints(t) ? <div style={{ color: 'var(--ifm-color-emphasis-600)' }}>{constraints(t)}</div> : null}
              </td>
              <td style={{ fontSize: 14 }}>{t.desc || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CssTokensPage() {
  return (
    <Layout
      title="GravityView CSS Design Tokens"
      description="Every --gv-* CSS custom property in the GravityView 3.0 theme, and how to override them."
    >
      <main className="container margin-vert--lg">
        <h1>GravityView Theme: CSS Design Tokens</h1>
        <p>
          Every visual aspect of a GravityView 3.0 View is controlled by a <code>--gv-*</code> CSS custom property
          (design token). Override them to theme your Views without touching GravityView's stylesheet.
        </p>

        <h2>How theming works</h2>
        <ul>
          <li>
            Tokens are scoped to <code>.gv-themed</code>, which GravityView stamps on each opted-in View container, so
            only themed Views are restyled.
          </li>
          <li>
            Defaults are declared at zero specificity (<code>:where(.gv-themed)</code> inside{' '}
            <code>@layer gravitykit-base</code>), so any unlayered rule on the container or a descendant wins without a
            specificity war.
          </li>
          <li>
            Browser floor: <code>@layer</code> requires Chromium 99+, Firefox 97+, Safari 15.4+. <code>@property</code>{' '}
            typing enhances progressively above that.
          </li>
        </ul>

        <h2>Override on the container, never on <code>:root</code></h2>
        <p>Set tokens on the View container (or a descendant selector). Overrides on <code>:root</code> lose to the
          container-level defaults and silently do nothing.</p>
        <pre>
          <code>{`/* Works: targets a descendant of the themed container. */
body .gv-container { --gv-color-primary: #7a1f1f; }

/* Works: one View by ID. */
.gv-container-123 { --gv-color-primary: #7a1f1f; }

/* Does NOT work: :root loses to the container-level default. */
:root { --gv-color-primary: #7a1f1f; }`}</code>
        </pre>

        <h2>Token reference</h2>
        <TokenReference />
      </main>
    </Layout>
  );
}

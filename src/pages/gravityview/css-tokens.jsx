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

      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '1000px' }}>
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
              <td style={{ width: '160px', overflowWrap: 'anywhere' }}>
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

        <h2>Target a View with placeholders</h2>
        <p>
          When you enter rules in GravityView's <strong>Custom CSS</strong> field (View Settings &rarr;{' '}
          <strong>Custom Code</strong>), GravityView swaps three placeholders for that View's own values as the page
          loads, so you can target a single View without hardcoding its container ID:
        </p>
        <table>
          <thead>
            <tr>
              <th>Placeholder</th>
              <th>Replaced with</th>
              <th>Example output</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>VIEW_SELECTOR</code></td>
              <td>A high-specificity CSS selector targeting only this View</td>
              <td><code>.gv-container.gv-container-123</code></td>
            </tr>
            <tr>
              <td><code>VIEW_ID</code></td>
              <td>The View's ID number</td>
              <td><code>123</code></td>
            </tr>
            <tr>
              <td><code>GF_FORM_ID</code></td>
              <td>The connected Gravity Forms form ID</td>
              <td><code>5</code></td>
            </tr>
          </tbody>
        </table>
        <p>
          Prefer <code>VIEW_SELECTOR</code> for token overrides: its double-class selector
          (<code>.gv-container.gv-container-123</code>) outranks the layered defaults, so your values win without{' '}
          <code>!important</code> and without pinning the View ID by hand.
        </p>
        <pre>
          <code>{`/* In GravityView's Custom CSS field. VIEW_SELECTOR resolves to this View. */
VIEW_SELECTOR { --gv-color-primary: #7a1f1f; }`}</code>
        </pre>
        <p>
          Placeholders resolve only inside a View's Custom CSS/JavaScript field, not in your theme's stylesheet.
          Developers can add or change them with the{' '}
          <a href="/gravityview/filters/gk-gravityview-custom-code-placeholders">
            <code>gk/gravityview/custom-code/placeholders</code>
          </a>{' '}
          filter. See{' '}
          <a href="https://www.gravitykit.com/docs/gravityview/customizing-your-views/adding-custom-css-to-your-website/#available-placeholders">
            Adding Custom CSS to Your Website
          </a>{' '}
          for the full walkthrough.
        </p>

        <h2>Using the tokens as data</h2>
        <p>
          The same tokens are published as JSON, in the{' '}
          <a href="https://www.designtokens.org/TR/2025.10/format/">Design Tokens (DTCG)</a> format, if you want to pull
          them into Style Dictionary, Terrazzo, Tokens Studio or Figma. See{' '}
          <a href="/gravityview/design-tokens/">Design Tokens (JSON)</a>.
        </p>

        <h2>Token reference</h2>
        <TokenReference />
      </main>
    </Layout>
  );
}

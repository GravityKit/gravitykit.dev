import { useEffect, useState } from 'react';

/**
 * Shared by the merge tag reference pages. Everything they show comes from
 * /api/merge-tags.json, the artifact GravityKit/merge-tags publishes (scripts/fetch-merge-tags.mjs):
 * the catalog, and `offers`, which that repo builds from the picker panel's own offer rules. These
 * pages author no rules of their own, so they cannot disagree with the picker.
 */
export function useMergeTagArtifact() {
  const [state, setState] = useState({ status: 'loading', artifact: null });

  useEffect(() => {
    fetch('/api/merge-tags.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((artifact) => setState({ status: 'ready', artifact }))
      .catch((error) => setState({ status: 'error', artifact: null, error: String(error.message || error) }));
  }, []);

  return state;
}

export const PRODUCT_NAMES = {
  gravityforms: 'Gravity Forms',
  gravityview: 'GravityView',
  gravitymath: 'GravityMath',
  'gravitykit-query-filters': 'Advanced Filtering',
  'gravityview-magic-links': 'Magic Links',
};

/** `{ gravityforms: '>=3.1.1.2' }` as "Gravity Forms 3.1.1.2 or later"; other constraints as written. */
export function requiresText(requires) {
  return Object.entries(requires || {})
    .map(([product, constraint]) => {
      const name = PRODUCT_NAMES[product] || product;
      const match = /^>=\s*(.+)$/.exec(String(constraint));
      return match ? `${name} ${match[1]} or later` : `${name} ${constraint}`;
    })
    .join(', ');
}

export const SECTIONS = [
  { key: 'show', title: 'What to show', hint: 'Pick one: which part of the value the tag outputs.' },
  { key: 'change', title: 'Change the output', hint: 'Steps applied one after another, in the order written.' },
  { key: 'other', title: 'Other settings', hint: '' },
];

/** Which panel section a modifier appears under, the same split the picker uses. */
export function sectionOf(modifier) {
  if (modifier.panel_group === 'representation') return 'show';
  if (modifier.panel_group === 'transform') return 'change';
  if (modifier.kind === 'representation') return 'show';
  if (modifier.kind === 'transform') return 'change';
  return 'other';
}

export function StatusMessage({ state, what }) {
  if (state.status === 'loading') return <p>Loading {what}…</p>;

  if (state.status === 'error' || !state.artifact) {
    return (
      <div className="alert alert--danger" role="alert">
        The merge tag data could not be loaded ({state.error || 'no data'}). This page has nothing to show without it.
      </div>
    );
  }

  if (!state.artifact.offers) {
    return (
      <div className="alert alert--warning" role="alert">
        This build of the merge tag data does not include the picker's offer rules yet.
      </div>
    );
  }

  return null;
}

export function MergeTagsNav({ current }) {
  const links = [
    { href: '/merge-tags', label: 'All merge tags', key: 'all' },
    { href: '/merge-tags/fields', label: 'Modifiers by field', key: 'fields' },
    { href: '/merge-tags/tags', label: 'Tag options', key: 'tags' },
  ];

  return (
    <nav aria-label="Merge tag reference" className="margin-bottom--lg">
      <ul className="pills">
        {links.map((link) => (
          <li key={link.key} className={`pills__item${current === link.key ? ' pills__item--active' : ''}`}>
            <a href={link.href} aria-current={current === link.key ? 'page' : undefined} style={{ color: 'inherit', textDecoration: 'none' }}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

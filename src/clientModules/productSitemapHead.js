/**
 * Client module to dynamically add product-specific sitemap to head.
 *
 * When browsing docs for a product (e.g., /docs/gravityview/...),
 * adds: <link rel="sitemap" type="application/xml" href=".../docs/gravityview/sitemap.xml">
 */

const SITEMAP_LINK_ID = 'product-sitemap-link';

// Products that have their own sitemap
const productsWithSitemaps = [
  'gravityview',
  'gravityimport',
  'gravityexport',
  'gravityedit',
  'gravitycharts',
  'gravityactions',
  'gravitycalendar',
  'gravitymath',
  'gravityrevisions',
  'gravitymigrate',
  'gravitykit',
  'gravityview-datatables',
  'gravityview-maps',
  'gravityview-ratings-reviews',
  'gravityview-diy',
  'gravityview-az-filters',
  'gravityview-inline-edit',
];

function updateProductSitemap() {
  // Remove existing product sitemap link if any
  const existingLink = document.getElementById(SITEMAP_LINK_ID);
  if (existingLink) {
    existingLink.remove();
  }

  // Check if we're in a product docs path
  const path = window.location.pathname;
  const match = path.match(/^\/docs\/([^/]+)\//);

  if (!match) return;

  const productId = match[1];
  if (!productsWithSitemaps.includes(productId)) return;

  // Create the product sitemap link
  const link = document.createElement('link');
  link.id = SITEMAP_LINK_ID;
  link.rel = 'sitemap';
  link.type = 'application/xml';
  link.href = `${window.location.origin}/docs/${productId}/sitemap.xml`;

  // Insert after the last existing sitemap link for consistent ordering
  const existingSitemapLinks = document.querySelectorAll('link[rel="sitemap"]');
  if (existingSitemapLinks.length > 0) {
    const lastSitemapLink = existingSitemapLinks[existingSitemapLinks.length - 1];
    lastSitemapLink.parentNode.insertBefore(link, lastSitemapLink.nextSibling);
  } else {
    document.head.appendChild(link);
  }
}

// Run on initial load
if (typeof window !== 'undefined') {
  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateProductSitemap);
  } else {
    updateProductSitemap();
  }

  // Listen for route changes (Docusaurus SPA navigation)
  // Using MutationObserver to detect URL changes
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      updateProductSitemap();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

export function onRouteDidUpdate({ location }) {
  updateProductSitemap();
}

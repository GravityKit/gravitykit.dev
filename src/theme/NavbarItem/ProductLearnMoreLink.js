import React from 'react';
import {useLocation} from '@docusaurus/router';

// Import centralized product configuration
import reposConfig from '../../../repos-config.json';

// Build product lookup map from repos-config.json
const productConfig = Object.fromEntries(
  reposConfig.products.map((p) => [
    p.id,
    { label: p.label, purchaseUrl: p.purchaseUrl }
  ])
);

// Default fallback
const defaultLink = {
  label: 'Learn More',
  href: 'https://www.gravitykit.com/products/',
};

// Add UTM parameters to URL
function addUtmParams(url, productId) {
  const utmParams = new URLSearchParams({
    utm_source: 'developer-docs',
    utm_medium: 'navbar',
    utm_campaign: 'learn-more',
    utm_content: productId || 'general',
  });
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${utmParams.toString()}`;
}

export default function ProductLearnMoreLink() {
  const location = useLocation();

  // Extract product ID from path: /docs/{product-id}/...
  const pathMatch = location.pathname.match(/^\/docs\/([^\/]+)/);
  const productId = pathMatch ? pathMatch[1] : null;

  // Get product config or use default
  const product = productId && productConfig[productId];

  const linkText = product ? `Learn more about ${product.label}` : defaultLink.label;
  const baseHref = product ? product.purchaseUrl : defaultLink.href;
  const linkHref = addUtmParams(baseHref, productId);

  return (
    <a
      href={linkHref}
      target="_blank"
      rel="noopener noreferrer"
      className="navbar__item navbar__link navbar-purchase-button"
    >
      {linkText}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginLeft: '0.35rem', verticalAlign: 'middle' }}
        aria-hidden="true"
      >
        <path d="M7 17L17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </a>
  );
}

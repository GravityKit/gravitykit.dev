import React from 'react';
import Layout from '@theme-original/DocItem/Layout';
import Head from '@docusaurus/Head';
import {useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

/**
 * Wrapper component that adds product-specific sitemap link to head.
 */
export default function LayoutWrapper(props) {
  const location = useLocation();
  const {siteConfig} = useDocusaurusContext();

  // Check if we're in a product docs path
  const match = location.pathname.match(/^\/docs\/([^/]+)\//);
  const productId = match?.[1];

  // Build sitemap URL if we have a valid product
  const sitemapUrl = productId
    ? `${siteConfig.url}${siteConfig.baseUrl}docs/${productId}/sitemap.xml`
    : null;

  return (
    <>
      {sitemapUrl && (
        <Head>
          <link rel="sitemap" type="application/xml" href={sitemapUrl} />
        </Head>
      )}
      <Layout {...props} />
    </>
  );
}

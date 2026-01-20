import React from 'react';
import Head from '@docusaurus/Head';
import {PageMetadata} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import reposConfig from '@site/repos-config.json';

const products = Array.isArray(reposConfig?.products) ? reposConfig.products : [];
const productsById = new Map(
  products
    .filter((product) => product?.id)
    .map((product) => [product.id, product]),
);

/**
 * Resolve product metadata for a product landing page permalink.
 * @param {string} permalink
 * @param {(path: string) => string} withBaseUrl
 * @returns {{id: string, label?: string}|null}
 */
function getProductForPermalink(permalink, withBaseUrl) {
  const normalizedPermalink = permalink.replace(/\/$/, '');

  for (const [productId, productInfo] of productsById.entries()) {
    const expectedPermalink = withBaseUrl(`/docs/${productId}/`).replace(/\/$/, '');
    if (expectedPermalink === normalizedPermalink) {
      return productInfo;
    }
  }

  return null;
}

/**
 * Build a markdown-source URL for individual hook pages.
 * @param {{source?: string, permalink?: string}} metadata
 * @param {(path: string) => string} withBaseUrl
 * @returns {string|null}
 */
function getHookMarkdownHref(metadata, withBaseUrl) {
  if (!metadata?.source || !metadata.permalink) {
    return null;
  }

  const sourcePath = metadata.source.replace(/^@site\//, '');
  const match = sourcePath.match(/^docs\/[^/]+\/(actions|filters)\/(.+)\.md$/);

  if (!match) {
    return null;
  }

  if (match[2] === 'index') {
    return null;
  }

  return withBaseUrl(`/${sourcePath}`);
}

/**
 * Add metadata and alternate links for doc pages.
 * @returns {JSX.Element}
 */
export default function DocItemMetadata() {
  const {metadata, frontMatter, assets} = useDoc();
  const {withBaseUrl} = useBaseUrlUtils();
  const productInfo = getProductForPermalink(metadata.permalink, withBaseUrl);
  const llmsHref = productInfo ? withBaseUrl(`/docs/${productInfo.id}/llms.txt`) : null;
  const llmsTitle = productInfo?.label
    ? `${productInfo.label} llms.txt`
    : 'Product llms.txt';
  const hookMarkdownHref = getHookMarkdownHref(metadata, withBaseUrl);

  return (
    <>
      <PageMetadata
        title={metadata.title}
        description={metadata.description}
        keywords={frontMatter.keywords}
        image={assets.image ?? frontMatter.image}
      />
      {(llmsHref || hookMarkdownHref) && (
        <Head>
          {llmsHref && (
            <link rel="alternate" type="text/plain" href={llmsHref} title={llmsTitle} />
          )}
          {hookMarkdownHref && (
            <link rel="alternate" type="text/markdown" href={hookMarkdownHref} title="Markdown source" />
          )}
        </Head>
      )}
    </>
  );
}

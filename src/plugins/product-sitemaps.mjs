/**
 * Docusaurus plugin to generate per-product sitemaps
 *
 * This plugin hooks into the build lifecycle and generates individual
 * sitemap.xml files for each product documentation section.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeUrl } from '@docusaurus/utils';

/**
 * Generate XML sitemap content
 */
function generateSitemapXML(urls, productLabel) {
  const urlEntries = urls
    .map(item => {
      return `  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${item.changefreq || 'weekly'}</changefreq>
    <priority>${item.priority || 0.5}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
                           http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <!-- Generated: ${new Date().toISOString()} -->
  <!-- Product: ${productLabel} -->
  <!-- Total URLs: ${urls.length} -->
${urlEntries}
</urlset>
`;
}

/**
 * Generate a sitemap index file
 */
function generateSitemapIndex(products, baseUrl) {
  const sitemaps = products
    .map(product => {
      return `  <sitemap>
    <loc>${normalizeUrl([baseUrl, 'docs', product.id, 'sitemap.xml'])}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Generated: ${new Date().toISOString()} -->
  <!-- Total Product Sitemaps: ${products.length} -->
${sitemaps}
</sitemapindex>
`;
}

/**
 * Product Sitemaps Plugin
 *
 * @param {import('@docusaurus/types').LoadContext} context
 * @param {object} options
 * @returns {import('@docusaurus/types').Plugin}
 */
export default function productSitemapsPlugin(context, options) {
  const { siteConfig, generatedFilesDir } = context;
  const { products = [] } = options;

  return {
    name: 'product-sitemaps',

    async postBuild({ routesPaths, outDir, routes }) {
      if (!products || products.length === 0) {
        return;
      }

      const baseUrl = normalizeUrl([siteConfig.url, siteConfig.baseUrl]);
      const productsWithSitemaps = [];

      console.log('\n🗺️  Generating per-product sitemaps...');

      // Generate sitemap for each product
      for (const product of products) {
        const productId = product.id;
        const productLabel = product.label;

        // Filter routes that belong to this product
        const productRoutes = routesPaths.filter(route => {
          // Match routes like /docs/{productId}/ or /docs/{productId}/...
          return route.startsWith(`/docs/${productId}/`) || route === `/docs/${productId}`;
        });

        if (productRoutes.length === 0) {
          console.log(`  ⚠️  Skipping ${productId} - no routes found`);
          continue;
        }

        // Convert routes to sitemap items
        const sitemapItems = productRoutes.map(route => {
          const url = normalizeUrl([baseUrl, route]);

          // Determine priority based on route depth
          let priority = 0.5;
          let changefreq = 'monthly';

          if (route === `/docs/${productId}` || route === `/docs/${productId}/`) {
            // Product home page
            priority = 0.9;
            changefreq = 'weekly';
          } else if (route.match(/\/docs\/[^/]+\/[^/]+\/?$/)) {
            // Top-level pages (one level deep)
            priority = 0.7;
            changefreq = 'weekly';
          } else if (route.includes('/actions/') || route.includes('/filters/')) {
            // Hook documentation
            priority = 0.6;
            changefreq = 'monthly';
          }

          return {
            url,
            lastmod: new Date().toISOString().split('T')[0],
            changefreq,
            priority,
          };
        });

        // Generate sitemap XML
        const sitemapXML = generateSitemapXML(sitemapItems, productLabel);

        // Write to output directory at /docs/{productId}/sitemap.xml
        const sitemapPath = path.join(outDir, 'docs', productId, 'sitemap.xml');
        await fs.mkdir(path.dirname(sitemapPath), { recursive: true });
        await fs.writeFile(sitemapPath, sitemapXML, 'utf-8');

        console.log(`  ✅ Generated ${productId} sitemap (${sitemapItems.length} URLs)`);
        productsWithSitemaps.push(product);
      }

      // Generate sitemap index
      if (productsWithSitemaps.length > 0) {
        const sitemapIndex = generateSitemapIndex(productsWithSitemaps, baseUrl);
        const indexPath = path.join(outDir, 'sitemap-products.xml');
        await fs.writeFile(indexPath, sitemapIndex, 'utf-8');
        console.log(`  ✅ Generated sitemap index (${productsWithSitemaps.length} products)`);
      }

      console.log('✅ Product sitemaps generation complete\n');
    },
  };
}

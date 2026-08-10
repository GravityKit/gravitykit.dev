// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';
import {normalizeUrl} from '@docusaurus/utils';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import remarkStripLeadingSrcPath from './src/remark/strip-leading-src-path.js';
import remarkRemoveEmptySections from './src/remark/remove-empty-sections.mjs';
import {normalizeDescriptions} from './src/plugins/normalize-doc-descriptions.mjs';
import {readAllProductVersions} from './src/utils/read-product-versions.mjs';

// Load configuration from repos-config.json (new GitHub-based approach)
const repos_config_path = new URL('./repos-config.json', import.meta.url);
const repos_config = JSON.parse(fs.readFileSync(repos_config_path, 'utf8'));
const config_products = Array.isArray(repos_config?.products) ? repos_config.products : [];
const package_json_path = new URL('./package.json', import.meta.url);
const package_json = JSON.parse(fs.readFileSync(package_json_path, 'utf8'));
const llms_version = package_json?.version;
const site_url = 'https://www.gravitykit.dev';
const base_url = '/';

const products_with_docs = config_products
  .filter((product) => product?.id && product?.repo)
  .filter((product) => {
    const docsDir = fileURLToPath(new URL(`./docs/${product.id}`, import.meta.url));
    return fs.existsSync(docsDir);
  });

// Only link to products that actually have generated docs. Configured-but-docless
// products (e.g. block-mcp, gravitysearch) otherwise produce broken nav links on
// every page.
const product_ids_with_docs = new Set(products_with_docs.map((p) => p.id));

// Product icons live at static/img/{id}.svg. Not every product has one (e.g.
// Foundation, Query Filters), so build a set of ids that do. The homepage uses
// this to skip rendering a broken icon for products without an artwork file.
const product_icon_dir = fileURLToPath(new URL('./static/img', import.meta.url));
const product_ids_with_icons = fs.existsSync(product_icon_dir)
  ? fs
      .readdirSync(product_icon_dir)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.replace(/\.svg$/, ''))
  : [];

// Read actual plugin versions from repository files
const product_versions = readAllProductVersions(config_products);

const llms_static_output_dir = './static';

const llms_sitemap_paths = [
  'llms.txt',
  ...products_with_docs.map((product) => `docs/${product.id}/llms.txt`),
];

// Generate navigation items grouped by category
const categories = repos_config.categories || {};

// Helper to get products by category
function getProductsByCategory(categoryId) {
  return config_products
    .filter((p) => p?.category === categoryId && p?.label && p?.id)
    .filter((p) => product_ids_with_docs.has(p.id))
    .map((p) => ({
      label: p.label,
      href: `/docs/${p.id}/`,
    }));
}

// Helper to get free add-ons (products with isFree: true)
function getFreeProducts() {
  return config_products
    .filter((p) => p?.isFree === true && p?.label && p?.id)
    .filter((p) => product_ids_with_docs.has(p.id))
    .map((p) => ({
      label: p.label,
      href: `/docs/${p.id}/`,
    }));
}

// Helper to get third-party products (products with isThirdParty: true)
function getThirdPartyProducts() {
  return config_products
    .filter((p) => p?.isThirdParty === true && p?.label && p?.id)
    .filter((p) => product_ids_with_docs.has(p.id))
    .map((p) => ({
      label: p.label,
      href: `/docs/${p.id}/`,
    }));
}

// Build GravityView dropdown with nested extensions and layouts
const gravityview_nav = {
  label: 'GravityView',
  position: 'left',
  items: [
    { label: 'GravityView', href: '/docs/gravityview/' },
    { label: 'Theming', href: '/gravityview/css-tokens/' },
    { label: 'Design Tokens (JSON)', href: '/gravityview/design-tokens/' },
    {
      type: 'html',
      value: '<hr class="dropdown-separator">',
    },
    {
      type: 'html',
      value: '<span class="dropdown-heading">Extensions</span>',
      className: 'dropdown-heading-item',
    },
    ...getProductsByCategory('gravityview-extensions'),
    {
      type: 'html',
      value: '<hr class="dropdown-separator">',
    },
    {
      type: 'html',
      value: '<span class="dropdown-heading">Layouts</span>',
      className: 'dropdown-heading-item',
    },
    ...getProductsByCategory('gravityview-layouts'),
  ],
};

// Build GravityKit Products dropdown (includes GravityView and free add-ons)
const gravitykit_nav = {
  label: 'GravityKit Products',
  position: 'left',
  items: [
    ...getProductsByCategory('gravitykit'),
    { label: 'GravityView', href: '/docs/gravityview/' },
    {
      type: 'html',
      value: '<hr class="dropdown-separator">',
    },
    {
      type: 'html',
      value: '<span class="dropdown-heading">Free Add-Ons</span>',
      className: 'dropdown-heading-item',
    },
    ...getFreeProducts(),
    {
      type: 'html',
      value: '<hr class="dropdown-separator">',
    },
    {
      type: 'html',
      value: '<span class="dropdown-heading">Libraries</span>',
      className: 'dropdown-heading-item',
    },
    ...getProductsByCategory('libraries'),
  ],
};

// Build Third-Party dropdown (Gravity Forms first)
const thirdparty_nav = {
  label: 'Third Party',
  position: 'left',
  items: (() => {
    const items = getThirdPartyProducts();
    const gfIndex = items.findIndex((p) => p.href === '/docs/gravityforms/');
    if (gfIndex > 0) {
      const [gf] = items.splice(gfIndex, 1);
      items.unshift(gf);
    }
    return items;
  })(),
};

// Helper to get purchase URL for a product from repos-config.json
function getProductPurchaseUrl(productId) {
  const product = config_products.find((p) => p.id === productId);
  return product?.purchaseUrl || null;
}

// Generate docs plugins for each product
// Documentation is generated to ./docs/{product-id}/
const product_docs_plugins = config_products
  .filter((product) => product?.id && product?.repo)
  .map((product) => {
    const options = {
      id: product.id,
      path: `./docs/${product.id}`,
      routeBasePath: `docs/${product.id}`,
      tagsBasePath: 'since',
    };
    // These products use a custom sidebar that appends a link to an authored
    // src/pages route (theming for GravityView, WP-CLI for GravityMigrate),
    // which the autogenerated sidebar can't reach; other products use the
    // default sidebars.js.
    if (product.id === 'gravityview') {
      options.sidebarPath = './sidebars-gravityview.js';
    } else if (product.id === 'gravitymigrate') {
      options.sidebarPath = './sidebars-gravitymigrate.js';
    }
    return ['@docusaurus/plugin-content-docs', options];
  });

// Generate customLLMFiles configuration for each product
const customLLMFiles = products_with_docs
  .map((product) => {
    const version = product_versions.get(product.id);
    return {
      filename: `docs/${product.id}/llms.txt`,
      includePatterns: [`docs/${product.id}/**`],
      fullContent: false,
      title: `${product.label} Developer Documentation`,
      description: `Hooks documentation for ${product.label}`,
      ...(version && { version }), // Only include version if found
    };
  });

const llms_static_plugin = [
  /**
   * Generate per-product llms.txt files into the static output dir.
   * @param {import('@docusaurus/types').LoadContext} context
   * @returns {Promise<import('@docusaurus/types').Plugin<void>>}
   */
  async function llmsStaticPlugin(context) {
    return {
      name: 'llms-static-files',
      async loadContent() {
        if (customLLMFiles.length === 0) {
          return null;
        }

        await normalizeDescriptions(path.resolve(context.siteDir, 'docs'));

        const {collectDocFiles, generateCustomLLMFiles} = await import('docusaurus-plugin-llms/lib/generator.js');
        const outDir = fileURLToPath(new URL(llms_static_output_dir, import.meta.url));

        await fs.promises.mkdir(outDir, {recursive: true});

        for (const customFile of customLLMFiles) {
          const customFilePath = path.join(outDir, customFile.filename);
          await fs.promises.mkdir(path.dirname(customFilePath), {recursive: true});
        }

        const siteUrl = context.siteConfig.url + (context.siteConfig.baseUrl.endsWith('/')
          ? context.siteConfig.baseUrl.slice(0, -1)
          : context.siteConfig.baseUrl || '');

        const pluginContext = {
          siteDir: context.siteDir,
          outDir,
          siteUrl,
          docsDir: 'docs',
          docTitle: context.siteConfig.title,
          docDescription: context.siteConfig.tagline || '',
          options: {
            docsDir: 'docs',
            ignoreFiles: [],
            customLLMFiles,
          },
        };

        const allDocFiles = await collectDocFiles(pluginContext);
        if (allDocFiles.length === 0) {
          return null;
        }

        await generateCustomLLMFiles(pluginContext, allDocFiles);
        return null;
      },
    };
  },
];

// Single llms plugin instance with custom files for each product
const product_llms_plugin = [
  'docusaurus-plugin-llms',
  {
    customLLMFiles: customLLMFiles,
    generateLLMsTxt: false,
    generateLLMsFullTxt: false,
    sitemapUrl: normalizeUrl([site_url, base_url, 'sitemap.xml']),
    title: 'GravityKit Developer Documentation',
    description: 'Comprehensive documentation for all GravityKit products',
  },
];

const markdown_endpoints_plugin = fileURLToPath(
  new URL('./src/plugins/markdown-endpoints.mjs', import.meta.url),
);

// Product sitemaps plugin - generates per-product sitemap.xml files
const product_sitemaps_plugin = [
  fileURLToPath(new URL('./src/plugins/product-sitemaps.mjs', import.meta.url)),
  {
    products: products_with_docs,
  },
];


/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'GravityKit Developer Documentation',
  tagline: 'Comprehensive documentation for all GravityKit products',
  favicon: 'img/favicon-192.png',

  // Build-time data made available to pages via siteConfig.customFields.
  customFields: {
    // Product ids that have a static/img/{id}.svg icon file.
    productIdsWithIcons: product_ids_with_icons,
  },

  // Client modules - runs on every page load
  clientModules: [
    './src/clientModules/prefetch-throttle.js',
    './src/clientModules/docsbot.js',
  ],

  // Set the production url of your site here
  url: site_url,
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: base_url,

  // GitHub pages deployment config.
  organizationName: 'gravitykit',
  projectName: 'gravitykit.dev',

  onBrokenLinks: 'warn',

  // Configure markdown processing to avoid MDX parsing issues
  markdown: {
    format: 'md',
    mermaid: false,
    preprocessor: ({filePath, fileContent}) => fileContent,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Trailing slash for consistent URLs (important for sitemap)
  trailingSlash: true,

  headTags: [
    {
      // DocsBot init is deferred until after load (src/clientModules/docsbot.js);
      // warming the connection keeps the widget snappy once it does load.
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://widget.docsbot.ai',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'sitemap',
        type: 'application/xml',
        href: normalizeUrl([site_url, base_url, 'sitemap.xml']),
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'sitemap',
        type: 'application/xml',
        href: normalizeUrl([site_url, base_url, 'sitemap-products.xml']),
      },
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // Disable preset's docs - we use multi-instance plugins for each product
        docs: false,
        pages: {
          beforeDefaultRemarkPlugins: [remarkRemoveEmptySections],
          remarkPlugins: [remarkStripLeadingSrcPath],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        // Sitemap plugin (@docusaurus/plugin-sitemap) - included in preset-classic
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
          createSitemapItems: async ({siteConfig, routes, defaultCreateSitemapItems}) => {
            const items = await defaultCreateSitemapItems({siteConfig, routes});
            const baseUrl = normalizeUrl([siteConfig.url, siteConfig.baseUrl]);
            const existingUrls = new Set(items.map((item) => item.url));

            const llmsItems = llms_sitemap_paths
              .map((path) => normalizeUrl([baseUrl, path]))
              .filter((url) => !existingUrls.has(url))
              .map((url) => ({url}));

            return [...items, ...llmsItems];
          },
        },
        // Google gtag plugin (@docusaurus/plugin-google-gtag) - included in preset-classic
        // Set GOOGLE_GTAG_ID environment variable (e.g., G-XXXXXXXXXX)
        gtag: process.env.GOOGLE_GTAG_ID ? {
          trackingID: process.env.GOOGLE_GTAG_ID,
          anonymizeIP: true,
        } : undefined,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Social card for link previews (1200x630 recommended)
      // TODO: Create custom social card image
      image: 'img/gravitykit-logo.svg',
      navbar: {
        title: 'GravityKit Dev Docs',
        logo: {
          alt: 'GravityKit Logo',
          src: 'img/gravitykit-icon.svg',
        },
        items: [
          gravitykit_nav,
          gravityview_nav,
          thirdparty_nav,
          {
            type: 'custom-productLearnMoreLink',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Resources',
            items: [
              {
                label: 'GravityView 3.0 beta migration guide',
                to: '/migrating-to-3-0-dev-guide/',
              },
              {
                label: 'Support',
                href: 'https://www.gravitykit.com/support/',
              },
              {
                label: 'Documentation',
                href: 'https://docs.gravitykit.com',
              },
              {
                label: 'LLMs.txt',
                href: normalizeUrl([site_url, base_url, 'llms.txt']),
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/gravitykit',
              },
              {
                label: 'GravityKit.com',
                href: 'https://www.gravitykit.com',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} GravityKit. Gravity Forms is a registered trademark of Rocketgenius, Inc.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['php', 'bash'],
      },
      // Algolia DocSearch - configured via environment variables
      // Set these in GitHub repository secrets:
      // - ALGOLIA_APP_ID
      // - ALGOLIA_API_KEY (search-only API key)
      // - ALGOLIA_INDEX_NAME
      ...(process.env.ALGOLIA_APP_ID && process.env.ALGOLIA_API_KEY && {
        algolia: {
          appId: process.env.ALGOLIA_APP_ID,
          apiKey: process.env.ALGOLIA_API_KEY,
          indexName: process.env.ALGOLIA_INDEX_NAME || 'gravitykit',
          contextualSearch: true,
        },
      }),
    }),


  plugins: [
    ...product_docs_plugins,
    product_llms_plugin,
    ...llms_static_plugin,
    markdown_endpoints_plugin,
    product_sitemaps_plugin,
  ].filter((pluginEntry) => {
    if (!Array.isArray(pluginEntry) || pluginEntry[0] !== '@docusaurus/plugin-content-docs') {
      return true;
    }

    const pluginOptions = pluginEntry[1] ?? {};

    if (!pluginOptions.path) {
      return true;
    }

    const docsDir = pluginOptions.path.startsWith('/')
      ? pluginOptions.path
      : fileURLToPath(new URL(pluginOptions.path, import.meta.url));

    return fs.existsSync(docsDir);
  }).map((pluginEntry) => {
    if (Array.isArray(pluginEntry) && pluginEntry[0] === '@docusaurus/plugin-content-docs') {
      const pluginOptions = pluginEntry[1] ?? {};

      return [
        pluginEntry[0],
        {
          ...pluginOptions,
          beforeDefaultRemarkPlugins: [
            ...(pluginOptions.beforeDefaultRemarkPlugins ?? []),
            remarkRemoveEmptySections,
          ],
          remarkPlugins: [
            ...(pluginOptions.remarkPlugins ?? []),
            remarkStripLeadingSrcPath,
          ],
        },
      ];
    }

    return pluginEntry;
  }),
};

export default config;

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

const llms_static_output_dir = './static';

const llms_sitemap_paths = [
  'llms.txt',
  ...products_with_docs.map((product) => `docs/${product.id}/llms.txt`),
];

// Generate navigation items from products
const product_nav_items = config_products
  .filter((product) => product?.label && product?.id)
  .map((product) => ({
    label: product.label,
    href: `/docs/${product.id}/`,
  }));

// Generate docs plugins for each product
// Documentation is generated to ./docs/{product-id}/
const product_docs_plugins = config_products
  .filter((product) => product?.id && product?.repo)
  .map((product) => [
    '@docusaurus/plugin-content-docs',
    {
      id: product.id,
      path: `./docs/${product.id}`,
      routeBasePath: `docs/${product.id}`,
      tagsBasePath: 'since',
    },
  ]);

// Generate customLLMFiles configuration for each product
const customLLMFiles = products_with_docs
  .map((product) => ({
    filename: `docs/${product.id}/llms.txt`,
    includePatterns: [`docs/${product.id}/**`],
    fullContent: false,
    title: `${product.label} Developer Documentation`,
    description: `Hooks documentation for ${product.label}`,
    version: llms_version,
  }));

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
  new URL('./src/plugins/markdown-endpoints.js', import.meta.url),
);

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'GravityKit Developer Documentation',
  tagline: 'Comprehensive documentation for all GravityKit products',
  favicon: 'img/favicon-192.png',

  // Set the production url of your site here
  url: site_url,
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: base_url,

  // GitHub pages deployment config.
  organizationName: 'gravitykit',
  projectName: 'gravitykit.dev',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Configure markdown processing to avoid MDX parsing issues
  markdown: {
    format: 'md',
    mermaid: false,
    preprocessor: ({filePath, fileContent}) => fileContent,
  },

  // Trailing slash for consistent URLs (important for sitemap)
  trailingSlash: true,

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'sitemap',
        type: 'application/xml',
        href: normalizeUrl([site_url, base_url, 'sitemap.xml']),
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
          {
            label: 'Products',
            position: 'left',
            items: product_nav_items,
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Products',
            items: [
              {
                label: 'GravityView',
                to: '/docs/gravityview',
              },
              {
                label: 'GravityCalendar',
                to: '/docs/gravitycalendar',
              },
              {
                label: 'GravityCharts',
                to: '/docs/gravitycharts',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              {
                label: 'Support',
                href: 'https://www.gravitykit.com/support/',
              },
              {
                label: 'Documentation',
                href: 'https://docs.gravitykit.com',
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
        copyright: `Copyright © ${new Date().getFullYear()} GravityKit.`,
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

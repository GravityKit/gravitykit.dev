// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkStripLeadingSrcPath from './src/remark/strip-leading-src-path.js';

// Load configuration from repos-config.json (new GitHub-based approach)
const repos_config_path = new URL('./repos-config.json', import.meta.url);
const repos_config = JSON.parse(fs.readFileSync(repos_config_path, 'utf8'));
const config_products = Array.isArray(repos_config?.products) ? repos_config.products : [];
const defaultBranch = repos_config?.defaults?.branch || 'develop';

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
  .map((product) => {
    const branch = product.branch || defaultBranch;
    return [
      '@docusaurus/plugin-content-docs',
      {
        id: product.id,
        path: `./docs/${product.id}`,
        routeBasePath: `docs/${product.id}`,
        // Each plugin auto-generates its own sidebar (no sidebarPath = auto-generate)
        editUrl: `https://github.com/${product.repo}/edit/${branch}/`,
      },
    ];
  });

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'GravityKit Developer Documentation',
  tagline: 'Comprehensive documentation for all GravityKit products',
  favicon: 'img/favicon-192.png',

  // Set the production url of your site here
  url: 'https://gravitykit.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'gravitykit',
  projectName: 'gravitykit-docs',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Configure markdown processing to avoid MDX parsing issues
  markdown: {
    format: 'md',
    mermaid: false,
    preprocessor: ({filePath, fileContent}) => fileContent,
  },

  // Sitemap generation for SEO
  trailingSlash: true,

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
        // Sitemap configuration for SEO
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
        // Google Tag Manager (can be configured later)
        gtag: undefined,
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
          {
            href: 'https://github.com/GravityKit',
            label: 'GitHub',
            position: 'right',
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


  plugins: product_docs_plugins.filter((pluginEntry) => {
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
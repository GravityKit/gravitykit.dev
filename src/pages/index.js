import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';

import styles from './index.module.css';

// Import centralized product configuration
import reposConfig from '../../repos-config.json';

const { categories, products } = reposConfig;

/**
 * Build an absolute URL using the site config base URL.
 * @param {string} siteUrl
 * @param {string} baseUrl
 * @param {string} pathname
 * @returns {string}
 */
function buildAbsoluteUrl(siteUrl, baseUrl, pathname) {
  const origin = siteUrl.replace(/\/+$/, '');
  const normalizedBaseUrl = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  const baseUrlWithSlash = normalizedBaseUrl.endsWith('/')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/`;
  const normalizedPath = pathname.replace(/^\/+/, '');

  return `${origin}${baseUrlWithSlash}${normalizedPath}`;
}

/**
 * Get products by category ID, sorted alphabetically by label.
 * @param {string} categoryId
 * @param {Object} options
 * @param {string} options.showFirst - Product ID to show first
 * @param {boolean} options.excludeThirdParty - Exclude third-party products
 * @returns {Array}
 */
function getProductsByCategory(categoryId, options = {}) {
  const { showFirst, excludeThirdParty = false } = options;

  let filtered = products.filter((p) => {
    if (p.category !== categoryId) return false;
    if (excludeThirdParty && p.isThirdParty) return false;
    return true;
  });

  // Sort alphabetically
  filtered.sort((a, b) => a.label.localeCompare(b.label));

  // Move showFirst product to the beginning
  if (showFirst) {
    const firstIndex = filtered.findIndex((p) => p.id === showFirst);
    if (firstIndex > 0) {
      const [first] = filtered.splice(firstIndex, 1);
      filtered.unshift(first);
    }
  }

  return filtered.map((p) => ({
    id: p.id,
    title: p.label,
    description: p.description || '',
    link: `/docs/${p.id}/`,
  }));
}

/**
 * Get third-party products (isThirdParty: true).
 * @returns {Array}
 */
function getThirdPartyProducts() {
  const filtered = products
    .filter((p) => p.isThirdParty === true)
    .sort((a, b) => a.label.localeCompare(b.label));

  // Gravity Forms first
  const gfIndex = filtered.findIndex((p) => p.id === 'gravityforms');
  if (gfIndex > 0) {
    const [gf] = filtered.splice(gfIndex, 1);
    filtered.unshift(gf);
  }

  return filtered.map((p) => ({
    id: p.id,
    title: p.label,
    description: p.description || '',
    link: `/docs/${p.id}/`,
  }));
}

/**
 * Get sorted categories for display.
 * @returns {Array}
 */
function getSortedCategories() {
  return Object.entries(categories)
    .map(([id, config]) => ({
      id,
      ...config,
    }))
    .sort((a, b) => (a.position || 99) - (b.position || 99));
}

/**
 * Render the homepage hero header.
 * @returns {JSX.Element}
 */
function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
      </div>
    </header>
  );
}

/**
 * Render a product card.
 * @param {{product: {id: string, title: string, description: string, link: string}, showImage?: boolean}} props
 * @returns {JSX.Element}
 */
function ProductCard({ product, showImage = true }) {
  const { siteConfig } = useDocusaurusContext();
  const imagePath = useBaseUrl(`/img/${product.id}.svg`);
  const iconIds = siteConfig.customFields?.productIdsWithIcons || [];
  const hasIcon = iconIds.includes(product.id);

  return (
    <div className={clsx('col col--4 margin-bottom--lg')}>
      <div className="card">
        <div className="card__header">
          {showImage && hasIcon && (
            <Link to={product.link}>
              <img
                src={imagePath}
                alt={product.title}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </Link>
          )}
          <Link to={product.link}>
            <Heading as="h3">{product.title}</Heading>
          </Link>
        </div>
        <div className="card__body">
          <p>{product.description}</p>
        </div>
        <div className="card__footer">
          <Link
            className="button button--primary button--block"
            to={product.link}>
            View Hooks
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Render a section of product cards.
 * @param {{title: string, description: string, products: Array, showImages?: boolean}} props
 * @returns {JSX.Element|null}
 */
function ProductSection({ title, description, products, showImages = true }) {
  if (!products || products.length === 0) {
    return null;
  }

  return (
    <section className={styles.products}>
      <div className="container">
        <div className="text--center margin-bottom--lg">
          <Heading as="h2">{title}</Heading>
          {description && <p className="hero__subtitle">{description}</p>}
        </div>
        <div className="row">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} showImage={showImages} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Render the documentation homepage.
 * @returns {JSX.Element}
 */
export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  const sortedCategories = getSortedCategories();
  const thirdPartyProducts = getThirdPartyProducts();
  const llmsHref = buildAbsoluteUrl(siteConfig.url, siteConfig.baseUrl, 'llms.txt');

  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Comprehensive developer documentation for all GravityKit products">
      <Head>
        <link rel="alternate" type="text/plain" href={llmsHref} title="GravityKit llms.txt" />
      </Head>
      <HomepageHeader />
      <main>
        {sortedCategories.map((category) => {
          // Special handling for gravitykit category: include GravityView first
          const options = category.id === 'gravitykit'
            ? { showFirst: 'gravityview' }
            : { excludeThirdParty: true };

          // For gravitykit, also include gravityview at the end
          let categoryProducts;
          if (category.id === 'gravitykit') {
            const gravityview = products.find((p) => p.id === 'gravityview');
            const gravityKitProducts = getProductsByCategory('gravitykit');
            categoryProducts = gravityview
              ? [...gravityKitProducts, { id: gravityview.id, title: gravityview.label, description: gravityview.description, link: `/docs/${gravityview.id}/` }]
              : gravityKitProducts;
          } else if (category.id === 'gravityview') {
            // Skip gravityview category since it's included in gravitykit
            return null;
          } else {
            categoryProducts = getProductsByCategory(category.id, options);
          }

          return (
            <ProductSection
              key={category.id}
              title={category.label}
              description={category.description}
              products={categoryProducts}
              showImages={true}
            />
          );
        })}

        {/* Third Party Section */}
        <ProductSection
          title="Third Party"
          description="Documentation for third-party plugins."
          products={thirdPartyProducts}
          showImages={true}
        />

        <div className="container">
          <div className="text--center margin-top--lg margin-bottom--lg">
            <p>
              <strong>{products.length} products</strong> with comprehensive hook documentation
            </p>
            <p>
              Looking for user documentation? Visit the{' '}
              <a href="https://docs.gravitykit.com" target="_blank" rel="noopener noreferrer">
                official GravityKit Documentation
              </a>.
            </p>
          </div>
        </div>
      </main>
    </Layout>
  );
}

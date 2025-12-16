import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';

import styles from './index.module.css';

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

// Main GravityKit Products
const mainProducts = [
  {
    title: 'GravityView',
    description: 'Display Gravity Forms entries in beautiful, customizable layouts.',
    link: '/docs/gravityview/'
  },
  {
    title: 'GravityCalendar',
    description: 'Transform entries into interactive calendars with FullCalendar.',
    link: '/docs/gravitycalendar/'
  },
  {
    title: 'GravityCharts',
    description: 'Visualize form data with powerful charts and graphs.',
    link: '/docs/gravitycharts/'
  },
  {
    title: 'GravityImport',
    description: 'Import data into Gravity Forms from CSV, Excel, and more.',
    link: '/docs/gravityimport/'
  },
  {
    title: 'GravityExport',
    description: 'Export form entries in multiple formats.',
    link: '/docs/gravityexport/'
  },
  {
    title: 'GravityMath',
    description: 'Advanced mathematical calculations for your forms.',
    link: '/docs/gravitymath/'
  },
  {
    title: 'GravityEdit',
    description: 'Edit Gravity Forms entries inline to save time and streamline your workflow.',
    link: '/docs/gravityedit/'
  },
  {
    title: 'GravityActions',
    description: 'Update multiple entries at once, send bulk emails, and automate workflows.',
    link: '/docs/gravityactions/'
  },
  {
    title: 'GravityRevisions',
    description: 'Track, compare, and restore changes made to forms and entries.',
    link: '/docs/gravityrevisions/'
  },
  {
    title: 'GravityMigrate',
    description: 'Migrate all Gravity Forms data including forms, entries, Views, and feeds.',
    link: '/docs/gravitymigrate/'
  },
  {
    title: 'GravityBoard',
    description: 'Manage projects with collaborative Kanban-style project boards.',
    link: '/docs/gravityboard/'
  }
];

// GravityView Layouts
const gravityviewLayouts = [
  {
    title: 'DataTables',
    description: 'Enhance Views with sortable, searchable DataTables.',
    link: '/docs/gravityview-datatables/',
    slug: 'gravityview-datatables'
  },
  {
    title: 'DIY Layout',
    description: 'Build custom layouts with complete control over HTML and CSS.',
    link: '/docs/gravityview-diy-layout/',
    slug: 'gravityview-diy-layout'
  },
  {
    title: 'Maps',
    description: 'Display entries on interactive Google Maps.',
    link: '/docs/gravityview-maps/',
    slug: 'gravityview-maps'
  }
];

// GravityView Extensions
const gravityviewExtensions = [
  {
    title: 'Advanced Filtering',
    description: 'Add powerful filtering capabilities to your Views.',
    link: '/docs/gravityview-advanced-filtering/',
    slug: 'gravityview-advanced-filtering'
  },
  {
    title: 'A-Z Filters',
    description: 'Filter entries alphabetically with letter-based navigation.',
    link: '/docs/gravityview-az-filters/',
    slug: 'gravityview-az-filters'
  },
  {
    title: 'Dashboard Views',
    description: 'Display Views in the WordPress admin dashboard.',
    link: '/docs/gravityview-dashboard-views/',
    slug: 'gravityview-dashboard-views'
  },
  {
    title: 'Featured Entries',
    description: 'Highlight and pin important entries to the top of Views.',
    link: '/docs/gravityview-featured-entries/',
    slug: 'gravityview-featured-entries'
  },
  {
    title: 'Magic Links',
    description: 'Share unique links for accessing entries without logging in.',
    link: '/docs/gravityview-magic-links/',
    slug: 'gravityview-magic-links'
  },
  {
    title: 'Multiple Forms',
    description: 'Combine entries from multiple forms into a single View.',
    link: '/docs/gravityview-multiple-forms/',
    slug: 'gravityview-multiple-forms'
  },
  {
    title: 'Ratings & Reviews',
    description: 'Add star ratings and reviews to your entries.',
    link: '/docs/gravityview-ratings-reviews/',
    slug: 'gravityview-ratings-reviews'
  },
  {
    title: 'Social Sharing & SEO',
    description: 'Enable social sharing and optimize entries for search engines.',
    link: '/docs/gravityview-social-sharing-seo/',
    slug: 'gravityview-social-sharing-seo'
  }
];

// Free Gravity Forms Add-ons
const gravityFormsAddons = [
  {
    title: 'Zero Spam',
    description: 'Block spam submissions without CAPTCHAs or honeypots.',
    link: '/docs/gravity-forms-zero-spam/',
    slug: 'gravity-forms-zero-spam'
  },
  {
    title: 'Dynamic Lookup',
    description: 'Dynamically populate fields from other forms or entries.',
    link: '/docs/gravity-forms-dynamic-lookup/',
    slug: 'gravity-forms-dynamic-lookup'
  },
  {
    title: 'Entry Tags',
    description: 'Organize entries with customizable tags.',
    link: '/docs/gravity-forms-entry-tags/',
    slug: 'gravity-forms-entry-tags'
  },
  {
    title: 'Event Field',
    description: 'Add event scheduling fields with date, time, and recurrence.',
    link: '/docs/gravity-forms-event-field/',
    slug: 'gravity-forms-event-field'
  },
  {
    title: 'Elementor Widget',
    description: 'Embed Gravity Forms in Elementor with a native widget.',
    link: '/docs/gravity-forms-elementor-widget/',
    slug: 'gravity-forms-elementor-widget'
  }
];

function ProductCard({ product, showImage = true }) {
  const imageName = product.slug || product.title.toLowerCase();
  return (
    <div className={clsx('col col--4 margin-bottom--lg')}>
      <div className="card">
        <div className="card__header">
          {showImage && (
            <Link to={product.link}>
              <img src={useBaseUrl(`/img/${imageName}.svg`)} alt={product.title} />
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

function ProductSection({ title, description, products, showImages = true }) {
  return (
    <section className={styles.products}>
      <div className="container">
        <div className="text--center margin-bottom--lg">
          <Heading as="h2">{title}</Heading>
          {description && <p className="hero__subtitle">{description}</p>}
        </div>
        <div className="row">
          {products.map((product, idx) => (
            <ProductCard key={idx} product={product} showImage={showImages} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  const totalProducts = mainProducts.length + gravityviewLayouts.length + gravityviewExtensions.length + gravityFormsAddons.length;

  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Comprehensive developer documentation for all GravityKit products">
      <HomepageHeader />
      <main>
        <ProductSection
          title="Main Products"
          description="Core GravityKit products with comprehensive functionality"
          products={mainProducts}
          showImages={true}
        />

        <ProductSection
          title="GravityView Layouts"
          description="Alternative ways to display your View data"
          products={gravityviewLayouts}
          showImages={false}
        />

        <ProductSection
          title="GravityView Extensions"
          description="Add features and functionality to GravityView"
          products={gravityviewExtensions}
          showImages={false}
        />

        <ProductSection
          title="Gravity Forms Add-ons"
          description="Free plugins that enhance Gravity Forms"
          products={gravityFormsAddons}
          showImages={false}
        />

        <div className="container">
          <div className="text--center margin-top--lg margin-bottom--lg">
            <p>
              <strong>{totalProducts} products</strong> with comprehensive hook documentation
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

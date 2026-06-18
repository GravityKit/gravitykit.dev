# GravityKit Developer Documentation

Unified Docusaurus site for all GravityKit product hooks documentation at `gravitykit.dev`.

## Overview

This documentation site consolidates hooks, filters, and developer documentation from all GravityKit products into a single, searchable, and well-organized platform. Documentation is generated directly from GitHub repositories, making it fully portable and reproducible.

## Products Included

- **GravityView** - Display Gravity Forms entries in customizable layouts
- **GravityCalendar** - Transform entries into interactive calendars
- **GravityCharts** - Visualize form data with charts and graphs
- **GravityImport** - Import data into Gravity Forms
- **GravityMath** - Mathematical calculations for forms
- **GravityExport** - Export form data in multiple formats
- **GravityEdit** - Edit entries from the frontend
- **GravityBoard** - Kanban board for entries
- And 20+ more GravityKit products!

## Quick Start

```bash
# Install dependencies
npm install

# Clone product repositories from GitHub
npm run repos:clone

# Generate hooks documentation
npm run hooks:generate

# Generate PHP API reference documentation (classes/functions)
npm run api:generate

# Start local development server
npm start
```

Or run everything at once:

```bash
npm run docs:full
```

## Prerequisites

### Required

1. **Node.js 18+** - JavaScript runtime
2. **Git** - For cloning repositories
3. **PHP 8.3+** - The hooks generator parses PHP source via php-parser (CI installs PHP 8.3). On macOS the default `php` may be older, so point at a newer build (e.g. `/opt/homebrew/bin/php`). Under PHP 8.5, php-parser emits `SplObjectStorage::attach()` deprecation notices that can corrupt the generator's JSON output; suppress them by running with `PHPRC` set to an ini containing `error_reporting = E_ALL & ~E_DEPRECATED` and `display_errors = stderr`.
4. **wp-hooks-documentor** - Tool for extracting WordPress hooks

```bash
# Install wp-hooks-documentor globally (GravityKit fork)
npm install -g github:GravityKit/wp-hooks-documentor
```

### GitHub Authentication

The clone script needs access to GravityKit repositories. Choose one method:

**Option A: GitHub CLI (Recommended)**
```bash
# Install GitHub CLI
brew install gh  # macOS
# or see https://cli.github.com/

# Authenticate
gh auth login
```

**Option B: SSH Keys**
- Configure SSH keys with access to GravityKit organization
- See: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run repos:clone` | Clone/update all product repositories from GitHub |
| `npm run hooks:generate` | Generate hooks documentation from cloned repos |
| `npm run api:generate` | Generate PHP API reference docs (classes/functions) |
| `npm run docs:full` | Full pipeline: clone repos, generate docs, build site |
| `npm start` | Start local development server |
| `npm run build` | Build static site for production |
| `npm run serve` | Serve the built site locally |

### Command Options

**Clone/Update Repositories**
```bash
npm run repos:clone                     # Clone/update all repos
npm run repos:clone -- --force          # Force fresh clone (delete existing)
npm run repos:clone -- --product gravityview  # Clone specific product
npm run repos:clone -- --parallel 8     # Use 8 parallel operations
npm run repos:clone -- --help           # Show help
```

**Generate Documentation**
```bash
npm run hooks:generate                     # Generate all hooks docs
npm run hooks:generate -- --product gravityview  # Generate specific product
npm run hooks:generate -- --dry-run        # Preview without making changes
npm run hooks:generate -- --help           # Show help
```

**Generate PHP API Reference**
```bash
npm run api:generate                       # Generate all API docs
npm run api:generate -- --filter gravityview  # Generate specific product
npm run api:generate -- --dry-run          # Preview without making changes
```

## PHP API Documentation

The PHP API reference documents classes, methods, and functions from your codebase. Documentation is automatically generated from PHPDoc comments.

### How classes and functions get included

Not every class gets documented—only those that meet specific criteria:

1. **Referenced in hooks documentation** - Classes/methods mentioned via `@see` in hook docblocks
2. **Marked as public API** - Classes/methods with `@api` or `@public` tags
3. **Transitively referenced** - Classes referenced via `@see` in already-documented classes

This scoping ensures the API docs focus on symbols developers actually interact with, rather than internal implementation details.

### Using @api and @public tags

Add `@api` or `@public` to any class, method, or function docblock to include it in the documentation:

```php
/**
 * Public API for creating custom entry displays.
 *
 * @api
 */
class GravityView_Entry_Renderer {
    /**
     * Render an entry using the specified template.
     *
     * @api
     * @param array $entry The Gravity Forms entry.
     * @param string $template Template slug to use.
     * @return string Rendered HTML.
     */
    public function render( $entry, $template ) {
        // ...
    }
}
```

**When to use:**
- Public APIs that third-party developers should use
- Extension points designed for customization
- Utility functions meant for external consumption

**Tag equivalence:** Both `@api` and `@public` work identically. Use whichever fits your team's conventions.

### Using @see for cross-references

The `@see` tag creates links between documented symbols and can pull in additional classes:

```php
/**
 * Alias for GravityView_Merge_Tags::replace_variables()
 *
 * @see \GravityView_Merge_Tags::replace_variables() Moved in 1.8.4
 * @see gravityview_get_entry()
 */
public static function replace_variables( $text, $form = [], $entry = [] ) {
    // ...
}
```

**Supported @see formats:**
- `\ClassName::methodName()` - Links to a class method (also includes that class in docs)
- `functionName()` - Links to a standalone function
- `https://...` - External URL (rendered as-is)

**Transitive expansion:** If ClassA references ClassB via `@see`, and ClassB references ClassC, all three classes are included. This runs iteratively to capture the full reference graph.

### Best practices for PHPDoc

For quality API documentation:

```php
/**
 * Brief one-line summary of what this does.
 *
 * Longer description with more details about usage,
 * edge cases, and important considerations.
 *
 * @since 2.0
 *
 * @param array  $entry   The Gravity Forms entry array.
 * @param string $context Where this is being called from.
 *
 * @return string|null The processed value, or null on failure.
 *
 * @throws \InvalidArgumentException When entry is missing required fields.
 *
 * @see \GV\Entry::get_value() For the modern approach.
 * @see https://docs.gravitykit.com/article/123 Full documentation.
 */
```

**Required for good docs:**
- Summary line (first line of docblock)
- `@param` with type and description for each parameter
- `@return` with type and description
- `@since` version tag

**Optional but helpful:**
- `@throws` for exceptions
- `@see` for related symbols
- `@deprecated` with replacement guidance
- `@example` with code samples

### Viewing generation output

When you run `npm run api:generate`, you'll see output like:

```
▶ Generating API docs: gravityview (GravityView)
ℹ️  gravityview: limiting API to 102 symbols referenced in @see docblocks
ℹ️  gravityview: added 11 classes from property types
ℹ️  gravityview: added 11 classes and 15 functions from @see tags (3 iterations)
⚠️  gravityview: 609 doc issues (missing summary: 130, missing @param: 125...)
✅ gravityview: 64 classes, 5 functions
```

- **Limiting API to N symbols** - How many symbols were found in hooks docs
- **Added N classes from property types** - Classes found in typed properties
- **Added N from @see tags (M iterations)** - Transitive expansion results
- **Doc issues** - Missing summaries, parameters, or return types

## Project Structure

```
gravitykit.dev/
├── docs/                       # Documentation output
│   ├── index.md               # Main homepage
│   ├── gravityview/           # Each product gets its own directory
│   ├── gravitycalendar/
│   ├── gravitycharts/
│   └── ...                    # 27 total products
├── repos/                     # Cloned GitHub repos (gitignored)
│   ├── GravityView/
│   ├── GravityCalendar/
│   └── ...
├── scripts/
│   ├── clone-repos.mjs        # Clone/update GitHub repos
│   ├── generate-hooks.mjs     # Generate hooks documentation
│   ├── generate-php-api.mjs   # Generate PHP API reference docs
│   └── extract-php-api.php    # PHP parser for class extraction
├── src/
│   ├── pages/                 # Custom pages
│   └── css/                   # Styling
├── static/                    # Static assets
├── repos-config.json          # GitHub repos configuration
├── docusaurus.config.js       # Site configuration
├── sidebars.js               # Navigation structure
└── package.json
```

## Configuration

### repos-config.json

Central configuration file mapping products to GitHub repositories. This file controls repository cloning, documentation generation, and navigation structure.

#### Schema Overview

```json
{
  "$schema": "./repos-config.schema.json",
  "reposDir": "./repos",
  "outputDir": "./docs",
  "defaults": {
    "branch": "develop",
    "ignoreFiles": ["**/vendor/**", "**/node_modules/**"],
    "ignoreHooks": ["deprecated_*", "private_*"],
    "customFields": {
      "since": true,
      "deprecated": true,
      "internal": false,
      "example": true
    }
  },
  "categories": {
    "gravityview": {
      "label": "GravityView",
      "position": 1
    },
    "gravityview-extensions": {
      "label": "Extensions",
      "parent": "gravityview",
      "position": 2
    }
  },
  "products": [
    {
      "id": "gravityview",
      "repo": "GravityKit/GravityView",
      "label": "GravityView",
      "category": "gravityview",
      "purchaseUrl": "https://www.gravitykit.com/products/gravityview/"
    }
  ]
}
```

#### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `reposDir` | string | Directory where repos are cloned (default: `./repos`) |
| `outputDir` | string | Directory for generated documentation (default: `./docs`) |
| `defaults` | object | Default settings applied to all products |
| `categories` | object | Navigation groupings for the site navbar |
| `products` | array | List of product configurations |

#### Categories

Categories control how products are grouped in the site navigation. Each category can have:

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Display name in navigation |
| `parent` | string | Parent category ID (for nested dropdowns) |
| `position` | number | Sort order in navigation |

**Current category structure:**
- `gravityview` - Main GravityView dropdown
  - `gravityview-extensions` - Extensions submenu
  - `gravityview-layouts` - Layouts submenu
- `gravitykit` - GravityKit Products dropdown
- `gravity-forms` - Gravity Forms Add-Ons dropdown

#### Product Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier, used in URLs (e.g., `gravityview`) |
| `repo` | string | Yes | GitHub repository path (e.g., `GravityKit/GravityView`) |
| `label` | string | Yes | Display name (e.g., `GravityView`) |
| `category` | string | Yes | Category ID for navigation grouping |
| `purchaseUrl` | string | No | URL to product purchase page |
| `isFree` | boolean | No | Set to `true` for free products |
| `branch` | string | No | Override default branch |
| `ignoreFiles` | array | No | Additional glob patterns to ignore |
| `ignoreHooks` | array | No | Additional hook patterns to ignore |

### Adding a New Product

1. Add an entry to `repos-config.json` under `products`:

```json
{
  "id": "new-product",
  "repo": "GravityKit/NewProduct",
  "label": "New Product Name",
  "category": "gravitykit",
  "purchaseUrl": "https://www.gravitykit.com/products/new-product/"
}
```

2. If needed, add a new category:

```json
{
  "categories": {
    "new-category": {
      "label": "New Category",
      "position": 4
    }
  }
}
```

3. Regenerate documentation:

```bash
npm run repos:clone -- --product new-product
npm run hooks:generate -- --product new-product
npm run api:generate -- --filter new-product
```

## Deployment

### GitHub Pages (Automated)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys to GitHub Pages on every push to `main`.

**Setup:**

1. Create a GitHub Personal Access Token with `repo` scope (to access private GravityKit repos)
2. Add it as a repository secret named `GK_REPOS_TOKEN`:
   - Go to repo Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GK_REPOS_TOKEN`
   - Value: Your personal access token

3. Enable GitHub Pages:
   - Go to repo Settings → Pages
   - Source: "GitHub Actions"

4. Push to `main` branch - the workflow will automatically build and deploy

**Updating the hooks generator:**

`wp-hooks-documentor` is a pinned Git dependency (a GravityKit fork tracked on `develop`). CI runs `npm ci`, which installs the **exact commit recorded in `package-lock.json`**, not the branch tip. So a generator fix does not reach the site just by merging it to the fork's `develop`. After merging the fork change, bump the pinned commit here: update the `resolved` SHA on the `node_modules/wp-hooks-documentor` entry in `package-lock.json`, then merge that to `main` (which triggers a deploy). Edit the SHA by hand rather than running `npm install github:...#develop`, because the dependency is Git-aliased (folder `wp-hooks-documentor`, package name `@10up/wp-hooks-documentor`), so a plain install mis-resolves it and adds a duplicate scoped entry. Validate locally with `npm ci` before merging.

**Custom Domain:**
The site is configured for `gravitykit.dev`. To use a different domain:
1. Update `static/CNAME` with your domain
2. Update `url` in `docusaurus.config.js`
3. Configure DNS to point to GitHub Pages

### Vercel

1. Connect your GitHub repository to Vercel
2. Configure build command: `npm run docs:full`
3. Output directory: `build`
4. Add environment variable: `GH_TOKEN` with your GitHub token

### Netlify

1. Connect your GitHub repository to Netlify
2. Configure build command: `npm run docs:full`
3. Publish directory: `build`
4. Add environment variable: `GH_TOKEN` with your GitHub token

### Manual Deployment

```bash
npm run docs:full  # Clone repos, generate docs, build
# Then deploy the 'build' directory to your host
```

## LLM-Friendly Documentation

This documentation is optimized for consumption by Large Language Models (LLMs) to help developers using AI assistants:

### Features

- **`/llms.txt`** - Root context file with overview and product directory
- **`/docs/{product}/llms.txt`** - Per-product AI documentation (25+ files)
- **`/docs/{product}/**/*.md`** - Raw Markdown for any individual doc (append `.md` to a doc URL)
- **`/api/hooks/index.json`** - Product directory with stats (6KB)
- **`/api/hooks/{product}.json`** - Per-product hooks (25 files, 1KB-408KB each)
- **Raw Markdown endpoints** - Published automatically during the build, so any doc page can be fetched as a `.md` file.
- **Usage examples** - Every hook includes copy-paste-ready code examples
- **Structured data** - Consistent frontmatter and parameter tables

### Dual Format Strategy

Each product provides documentation in two complementary formats:

**JSON API** (`/api/hooks/{product}.json`):
- Machine-readable structure for programmatic access
- Complete hook metadata (parameters, types, locations)
- Ideal for building tools and integrations

**Markdown Documentation** (`/docs/{product}/llms.txt`):
- AI-optimized natural language format
- Product overview and capabilities
- Top 10-15 most commonly used hooks with full code examples
- Hooks grouped by use case (display, data, fields, search, etc.)
- Common integration patterns and best practices
- Pro tips for AI assistants

### Machine-Readable API

The hooks API provides programmatic access to all hook information:

```bash
# Discover available products (lightweight - 6KB)
curl https://www.gravitykit.dev/api/hooks/index.json

# Get hooks for a specific product (JSON format - recommended for tools)
curl https://www.gravitykit.dev/api/hooks/gravityview.json
curl https://www.gravitykit.dev/api/hooks/gravityedit.json

# Get AI-optimized documentation (Markdown format - recommended for LLMs)
curl https://www.gravitykit.dev/docs/gravityview/llms.txt
curl https://www.gravitykit.dev/docs/gravityedit/llms.txt

# Get raw Markdown for any individual doc (append .md to the doc URL)
curl https://www.gravitykit.dev/docs/gravitycalendar/actions/gravityview-calendar-enqueue-scripts.md

# Full database (large - 728KB, use per-product instead)
curl https://www.gravitykit.dev/api/hooks.json
```

### Regenerating LLM Enhancements

```bash
npm run llm:enhance  # Regenerate JSON APIs, llms.txt files, and add examples
```

## IDE Integration

Add GravityKit hooks documentation to your AI-powered code assistant.

### Cursor

1. Open Cursor Settings (`Cmd/Ctrl + ,`)
2. Go to **Features** → **Docs**
3. Click **Add new doc**
4. Enter: `https://www.gravitykit.dev`

Cursor will index the documentation and use it when answering questions about GravityKit plugins.

### Windsurf

1. Open Windsurf Settings
2. Go to **Cascade** → **Memories & rules**
3. Under **Indexed Docs**, click **Add**
4. Enter: `https://www.gravitykit.dev`

### Other IDEs

For IDEs without built-in doc indexing, add to your project instructions file:

**VS Code** (`.github/copilot-instructions.md`):
```markdown
Reference GravityKit hooks at https://www.gravitykit.dev
API: https://www.gravitykit.dev/api/hooks/{product}.json
```

**Claude Code** (`CLAUDE.md`):
```markdown
Fetch GravityKit hooks from https://www.gravitykit.dev/api/hooks/{product}.json
```

### Available Endpoints

| Endpoint | Format | Description |
|----------|--------|-------------|
| `/llms.txt` | Markdown | Root context file with overview and product directory |
| `/docs/{product}/llms.txt` | Markdown | Per-product AI-optimized documentation with examples and use cases |
| `/docs/{product}/**/*.md` | Markdown | Raw Markdown for any individual doc (append `.md` to a doc URL) |
| `/api/hooks/index.json` | JSON | Product directory with hook counts (lightweight - 6KB) |
| `/api/hooks/{product}.json` | JSON | Complete hooks data for a specific product (1KB-408KB) |

**Recommendation**: For AI assistants, start with `/docs/{product}/llms.txt` for focused context. For tools and integrations, use `/api/hooks/{product}.json` for structured data.

**Products**: `gravityview`, `gravitycalendar`, `gravitycharts`, `gravityedit`, `gravityexport`, `gravityimport`, `gravitymath`, `gravityactions`, `gravityboard`, `gravitymigrate`, `gravityrevisions`, and more.

## Sitemaps

The site automatically generates XML sitemaps for search engine optimization:

- **`/sitemap.xml`** - Main site-wide sitemap (all pages)
- **`/sitemap-products.xml`** - Product-specific sitemap index
- **`/docs/{product}/sitemap.xml`** - Individual product sitemaps (28 products)

### Features

- **Automatic Generation**: Sitemaps are built during `npm run build`
- **Smart Priorities**: Product home pages (0.9), top-level docs (0.7), hooks (0.6)
- **HTML Discovery**: Both sitemaps are linked in the `<head>` of every page
- **robots.txt**: Both sitemaps are listed for search engine crawlers

### Example URLs

```
https://www.gravitykit.dev/sitemap.xml
https://www.gravitykit.dev/sitemap-products.xml
https://www.gravitykit.dev/docs/gravityview/sitemap.xml
https://www.gravitykit.dev/docs/gravitycalendar/sitemap.xml
```

For more details, see [SITEMAPS.md](./SITEMAPS.md).

## Environment Variables

The site uses environment variables for optional integrations. Set these in your deployment environment or local `.env` file.

### Google Analytics

Track site usage with Google Analytics 4:

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_GTAG_ID` | Google Analytics 4 measurement ID | `G-XXXXXXXXXX` |

The site uses `@docusaurus/plugin-google-gtag` with IP anonymization enabled for privacy compliance.

### Algolia Search

The site uses Algolia DocSearch for search functionality:

| Variable | Description |
|----------|-------------|
| `ALGOLIA_APP_ID` | Algolia application ID |
| `ALGOLIA_API_KEY` | Algolia search-only API key |
| `ALGOLIA_INDEX_NAME` | Index name (defaults to `gravitykit`) |

To set up search:
1. Apply for [Algolia DocSearch](https://docsearch.algolia.com/)
2. Set the environment variables above in your deployment settings
3. Configure the [Algolia crawler](https://dashboard.algolia.com/apps/CLS6UYEGBJ/crawler/crawler/7bfac9ff-b5d5-4d70-b992-f5115760feac/overview) to automatically index the site on a schedule (currently set to daily)

### GitHub Access

For cloning private GravityKit repositories:

| Variable | Description |
|----------|-------------|
| `GK_REPOS_TOKEN` | GitHub Personal Access Token with `repo` scope |
| `GH_TOKEN` | Alternative name (used by some deployment platforms) |

### Example .env file

```bash
# Google Analytics
GOOGLE_GTAG_ID=G-XXXXXXXXXX

# Algolia Search (for search UI)
ALGOLIA_APP_ID=your-app-id
ALGOLIA_API_KEY=your-search-api-key
ALGOLIA_INDEX_NAME=gravitykit

# GitHub Access (for CI/CD)
GK_REPOS_TOKEN=ghp_xxxxxxxxxxxx
```

## Troubleshooting

### Clone fails with authentication error

```bash
# Check GitHub CLI authentication
gh auth status

# Or verify SSH key
ssh -T git@github.com
```

### wp-hooks-documentor not found

```bash
# Install globally (GravityKit fork)
npm install -g github:GravityKit/wp-hooks-documentor

# Verify installation
wp-hooks-documentor --version
```

### Build fails due to missing docs

The build will skip products that don't have generated documentation. Run:

```bash
npm run repos:clone
npm run hooks:generate
```

## Support

- **Main Documentation**: https://docs.gravitykit.com
- **Support Portal**: https://www.gravitykit.com/support/
- **GitHub**: https://github.com/gravitykit

## License

Copyright © GravityKit. All rights reserved.

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
3. **wp-hooks-documentor** - Tool for extracting WordPress hooks

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
│   └── regen-hooks-docs-new.mjs  # Generate hooks documentation
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

Central configuration file mapping products to GitHub repositories:

```json
{
  "reposDir": "./repos",
  "outputDir": "./docs",
  "defaults": {
    "branch": "develop",
    "ignoreFiles": ["**/vendor/**", "**/node_modules/**"],
    "ignoreHooks": ["deprecated_*", "private_*"]
  },
  "products": [
    {
      "id": "gravityview",
      "repo": "GravityKit/GravityView",
      "label": "GravityView",
      "routeBasePath": "docs/gravityview"
    }
  ]
}
```

### Adding a New Product

1. Add an entry to `repos-config.json`:

```json
{
  "id": "new-product",
  "repo": "GravityKit/NewProduct",
  "label": "New Product Name",
  "routeBasePath": "docs/new-product"
}
```

2. Regenerate documentation:

```bash
npm run repos:clone -- --product new-product
npm run hooks:generate -- --product new-product
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

- **`/llms.txt`** - Context file following the emerging llms.txt standard
- **`/api/hooks/index.json`** - Product directory with stats (6KB)
- **`/api/hooks/{product}.json`** - Per-product hooks (25 files, 1KB-408KB each)
- **Usage examples** - Every hook includes copy-paste-ready code examples
- **Structured data** - Consistent frontmatter and parameter tables

### Machine-Readable API

The hooks API provides programmatic access to all hook information:

```bash
# Discover available products (lightweight - 6KB)
curl https://www.gravitykit.dev/api/hooks/index.json

# Get hooks for a specific product (recommended)
curl https://www.gravitykit.dev/api/hooks/gravityview.json
curl https://www.gravitykit.dev/api/hooks/gravityedit.json

# Full database (large - 728KB, use per-product instead)
curl https://www.gravitykit.dev/api/hooks.json
```

### Regenerating LLM Enhancements

```bash
npm run llm:enhance  # Regenerate JSON APIs and add examples
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

| Endpoint | Description |
|----------|-------------|
| `/llms.txt` | LLM-optimized context file |
| `/api/hooks/index.json` | Product directory with hook counts |
| `/api/hooks/{product}.json` | All hooks for a specific product |

**Products**: `gravityview`, `gravitycalendar`, `gravitycharts`, `gravityedit`, `gravityexport`, `gravityimport`, `gravitymath`, `gravityactions`, `gravityboard`, `gravitymigrate`, `gravityrevisions`, and more.

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
2. Set the environment variables above

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

# Algolia Search
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

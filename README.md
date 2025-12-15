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
npm run regen:hooks

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
# Install wp-hooks-documentor globally
npm install -g @10up/wp-hooks-documentor
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
| `npm run regen:hooks` | Generate hooks documentation from cloned repos |
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
npm run regen:hooks                     # Generate all hooks docs
npm run regen:hooks -- --product gravityview  # Generate specific product
npm run regen:hooks -- --dry-run        # Preview without making changes
npm run regen:hooks -- --help           # Show help
```

## Project Structure

```
gravitykit-docs/
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
npm run regen:hooks -- --product new-product
```

## Deployment

### CI/CD Pipeline (Recommended)

Since the documentation is generated from GitHub repos, you can set up automated builds:

```yaml
# Example GitHub Actions workflow
name: Build Docs
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm install -g @10up/wp-hooks-documentor
      - run: npm run repos:clone
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
      - run: npm run regen:hooks
      - run: npm run build
      - name: Deploy
        # Deploy to Vercel, Netlify, or GitHub Pages
```

### Manual Deployment

**Vercel**
1. Connect your GitHub repository to Vercel
2. Configure build command: `npm run docs:full`
3. Output directory: `build`

**Netlify**
1. Connect your GitHub repository to Netlify
2. Configure build command: `npm run docs:full`
3. Publish directory: `build`

**GitHub Pages**
```bash
GIT_USER=<username> npm run deploy
```

## Search Configuration

The site uses Algolia DocSearch for search functionality. To configure:

1. Apply for [Algolia DocSearch](https://docsearch.algolia.com/)
2. Update `docusaurus.config.js` with your API keys:

```javascript
algolia: {
  appId: 'YOUR_APP_ID',
  apiKey: 'YOUR_API_KEY',
  indexName: 'gravitykit',
}
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
# Install globally
npm install -g @10up/wp-hooks-documentor

# Verify installation
wp-hooks-documentor --version
```

### Build fails due to missing docs

The build will skip products that don't have generated documentation. Run:

```bash
npm run repos:clone
npm run regen:hooks
```

## Support

- **Main Documentation**: https://docs.gravitykit.com
- **Support Portal**: https://www.gravitykit.com/support/
- **GitHub**: https://github.com/gravitykit

## License

Copyright © GravityKit. All rights reserved.

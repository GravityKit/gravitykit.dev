import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * /gravityview/css-tokens/, built from static/api/css-tokens.json at build time so the token
 * table is in the static HTML. Without the file the page still builds, with an empty table.
 */
export default function cssTokensPagePlugin(context) {
  const artifactPath = path.join(context.siteDir, 'static', 'api', 'css-tokens.json');

  return {
    name: 'css-tokens-page',

    async loadContent() {
      try {
        const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
        return Array.isArray(artifact.tokens) ? artifact.tokens : [];
      } catch {
        console.warn(`[css-tokens-page] ${path.relative(context.siteDir, artifactPath)} not found -- the token table is empty. Run npm run tokens:generate.`);
        return [];
      }
    },

    async contentLoaded({ content, actions }) {
      const dataPath = await actions.createData('css-tokens.json', JSON.stringify(content));

      actions.addRoute({
        path: '/gravityview/css-tokens/',
        component: '@site/src/components/css-tokens/CssTokensPage.jsx',
        modules: { tokens: dataPath },
        exact: true,
      });
    },
  };
}

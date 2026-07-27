import Layout from '@theme/Layout';

export default function DesignTokensPage() {
  return (
    <Layout
      title="GravityView Design Tokens (JSON)"
      description="GravityView's design tokens as data, in the Design Tokens Community Group format, for Style Dictionary, Terrazzo, Tokens Studio and Figma."
    >
      <main className="container margin-vert--lg">
        <h1>Design Tokens (JSON)</h1>
        <p>
          GravityView's theme tokens are published as data on every deploy, so you can pull them into a design system
          pipeline instead of copying values by hand. If you only want to restyle a View with CSS, see{' '}
          <a href="/gravityview/css-tokens/">Theming</a> instead.
        </p>

        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Format</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a href="/api/css-tokens.tokens.json">
                  <code>css-tokens.tokens.json</code>
                </a>
              </td>
              <td>
                <a href="https://www.designtokens.org/TR/2025.10/format/">Design Tokens (DTCG) 2025.10</a>, for Style
                Dictionary, Terrazzo, Tokens Studio and Figma
              </td>
            </tr>
            <tr>
              <td>
                <a href="/api/css-tokens.json">
                  <code>css-tokens.json</code>
                </a>
              </td>
              <td>Flat JSON with every registry field, including the ones DTCG has no place for</td>
            </tr>
          </tbody>
        </table>

        <p>
          The DTCG file declares its own <code>$schema</code>, so editors validate it as you work, and it is checked
          against the{' '}
          <a href="https://www.designtokens.org/schemas/2025.10/format.json">
            Design Tokens Community Group's published schema
          </a>{' '}
          before it is published.
        </p>

        <h2>Use <code>cssVar</code>, not the token path</h2>
        <p>
          A token's path and its CSS variable are not the same string. <code>gravityview.border.entry_color</code> is{' '}
          <code>--gv-entry-border-color</code>. Read the variable name from{' '}
          <code>$extensions["com.gravitykit.tokens"].cssVar</code> so the CSS you generate matches what GravityView
          actually reads.
        </p>

        <h2>Style Dictionary</h2>
        <p>One custom transform points the names at the shipped CSS variables:</p>
        <pre>
          <code>{`import SD from 'style-dictionary';

const EXT = 'com.gravitykit.tokens';

SD.registerTransform({
  name: 'name/gv-cssvar',
  type: 'name',
  transform: (t) => t.$extensions[EXT].cssVar.replace(/^--/, ''),
});

const sd = new SD({
  source: ['css-tokens.tokens.json'],
  platforms: {
    css: {
      prefix: '',
      transforms: SD.hooks.transformGroups.css.map((t) =>
        t === 'name/kebab' ? 'name/gv-cssvar' : t,
      ),
      files: [{ destination: 'gravityview-tokens.css', format: 'css/variables' }],
    },
  },
});

await sd.buildAllPlatforms();`}</code>
        </pre>
        <p>
          Style Dictionary 5.x renders DTCG <code>duration</code> values as <code>[object Object]</code>, which affects
          GravityView's transition tokens. Add this transform alongside the one above and include it in the list:
        </p>
        <pre>
          <code>{`SD.registerTransform({
  name: 'duration/css-dtcg',
  type: 'value',
  transitive: true,
  filter: (t) => t.$type === 'duration' && typeof t.$value === 'object',
  transform: (t) => \`\${t.$value.value}\${t.$value.unit}\`,
});`}</code>
        </pre>

        <h2>Terrazzo</h2>
        <p>
          Terrazzo reads the file without configuration. Its <code>core/consistent-naming</code> rule warns on
          GravityView's snake_case names until you set it to <code>{'{ format: "snake_case" }'}</code>.
        </p>

        <h2>What the DTCG file leaves out</h2>
        <p>
          DTCG has no way to express a handful of values GravityView ships, such as percentage widths,{' '}
          <code>clamp()</code>, and keywords like <code>inherit</code>. Those tokens still appear at their usual path
          with their description and raw CSS attached, but without a value, so design tools skip them.
        </p>
        <p>
          A few others, like <code>--gv-font-size-xs</code>, are calculated from another token. The file carries the
          value at GravityView's defaults and says so in the token's description, so a library synced from it can drift
          if you change the token it derives from.
        </p>
        <p>
          Both groups are listed under <code>$extensions["com.gravitykit.tokens"]</code> if you want to check them
          programmatically, and the flat file always has the exact CSS.
        </p>
      </main>
    </Layout>
  );
}

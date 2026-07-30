import Layout from '@theme/Layout';

export default function DesignTokensPage() {
  return (
    <Layout
      title="GravityView Design Tokens (JSON)"
      description="Every color, size, and spacing value GravityView uses, as a JSON file you can import into Figma, Style Dictionary, Terrazzo or Tokens Studio."
    >
      <main className="container margin-vert--lg">
        <h1>Design Tokens (JSON)</h1>
        <p>
          Every color, size, spacing step, and shadow GravityView uses is published as a JSON file. Import it into a
          design tool and you get GravityView's palette without retyping hex codes, or feed it into a build step that
          generates CSS to restyle your Views.
        </p>
        <p>
          The file is rebuilt whenever GravityView changes, so it never goes stale. If you just want to change some
          colors on a View, you don't need any of this &mdash; see <a href="/gravityview/css-tokens/">Theming</a>.
        </p>

        <h2>Get the file</h2>
        <p>
          <a href="/api/css-tokens.tokens.json">
            <code>css-tokens.tokens.json</code>
          </a>{' '}
          is the one you want. It follows the{' '}
          <a href="https://www.designtokens.org/TR/2025.10/format/">Design Tokens Community Group format</a>, which
          Figma, Style Dictionary, Terrazzo and Tokens Studio all read.
        </p>
        <p>
          There is also{' '}
          <a href="/api/css-tokens.json">
            <code>css-tokens.json</code>
          </a>
          , a plain list of every token with its exact CSS value. Reach for it when you want the raw values rather than
          something a design tool understands.
        </p>

        <h2>One thing to watch out for</h2>
        <p>
          A token's name in the file is not its CSS variable name. The token at{' '}
          <code>gravityview.border.entry_color</code> is the variable <code>--gv-entry-border-color</code> &mdash; the
          words are rearranged. Generate CSS from the names and you'll produce variables GravityView ignores, and
          nothing will change on your site.
        </p>
        <p>
          Every token carries its real variable name, so use that instead. You'll find it at{' '}
          <code>$extensions["com.gravitykit.tokens"].cssVar</code>.
        </p>

        <h2>Generating CSS with Style Dictionary</h2>
        <p>The transform below tells Style Dictionary to use GravityView's variable names:</p>
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
          If your animation timings come out as <code>[object Object]</code>, that's a known gap in Style Dictionary 5.
          Register this transform too and add <code>'duration/css-dtcg'</code> to the list above:
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

        <h2>Other tools</h2>
        <p>
          Terrazzo reads the file as-is. It will warn that GravityView's token names use underscores rather than
          dashes; set its <code>core/consistent-naming</code> rule to <code>{'{ format: "snake_case" }'}</code> to quiet
          that.
        </p>
        <p>Figma and Tokens Studio import the file directly, no configuration needed.</p>

        <h2>A few tokens aren't in there</h2>
        <p>
          The format can't describe certain CSS, such as widths set in percentages or values that adapt to the screen
          size. Those tokens still appear in the file with their description and their CSS, but without a value, so
          design tools skip past them rather than importing something wrong.
        </p>
        <p>
          A handful of others are calculated from another token &mdash; text sizes, for instance, are multiples of the
          base font size. The file records what they work out to at GravityView's defaults, and says so in the token's
          description. Change the base size on your site and those numbers will no longer match.
        </p>
        <p>
          Both groups are listed inside the file under <code>$extensions["com.gravitykit.tokens"]</code>, and the plain
          list linked above always has the exact CSS.
        </p>
      </main>
    </Layout>
  );
}

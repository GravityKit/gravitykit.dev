# AGENTS.md — gravitykit.dev

Developer / API reference for GravityKit, built with **Docusaurus** and published
to GitHub Pages at https://www.gravitykit.dev. This is the developer reference
(hooks, PHP API, CSS tokens), distinct from gravitykit.com/docs (the BetterDocs
**user** docs). The Docs-MCP (mcp.gravitykit.dev) indexes this site's generated
output.

## Golden rule: content is generated, never hand-authored

`docs/` and `static/docs/` are **gitignored** and rebuilt from scratch in CI on
every deploy. Editing a page under `docs/` does nothing; it is overwritten. Fix
the **source**, then regenerate:

| Content | Source of truth | Generator |
| --- | --- | --- |
| Hooks (filters/actions) | PHP docblock above `apply_filters` / `do_action` in the product repo | `npm run hooks:generate` |
| PHP API (classes/functions) | product PHP source | `npm run api:generate` |
| CSS design tokens | product `TokenRegistry` | `npm run tokens:generate` (emits **two** files, see below) |

## Build pipeline

- `npm run repos:clone` — clone each product at its configured branch (`develop`
  by default; see `repos-config.json`). Needs `GK_REPOS_TOKEN` in CI.
- `npm run docs:generate` — all generators + category indexes.
- `npm run docs:full` — clone + generate + `llm:enhance` + build.
- `npm run build` — Docusaurus production build.
- `npm test` — unit tests (`node --test scripts/lib/`).
- `npm run tokens:verify` — token interop check (needs `tokens:generate` first).

Local hook generation needs **PHP 8.3+** (the system `php` may be older; point at
a newer binary). Sidebars are filesystem-generated, so a new category folder with
a `_category_.json` appears in the sidebar with no config change.

## CSS design tokens: two artifacts

`npm run tokens:generate` writes both from the same registry read:

- **`static/api/css-tokens.json`** — the flat, lossless GravityKit record. All 245
  tokens, every registry field. Unchanged contract; the site's token table reads it.
- **`static/api/css-tokens.tokens.json`** — the interop artifact, conforming to the
  [DTCG Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/).
  Mapping logic lives in `scripts/lib/dtcg.mjs` (pure, unit-tested).

Non-obvious things about the DTCG file:

- **The build hard-fails rather than publishing a non-conformant file.** The generator
  validates its output against the DTCG's own published JSON Schema, vendored at
  `scripts/lib/dtcg-format-2025.10.schema.json` (pinned; `$id` must stay
  `https://www.designtokens.org/schemas/2025.10/format.json`). `docs:generate` is in the
  deploy path, so this gate runs on every deploy. `npm test` additionally proves the
  vendored schema still *rejects* invalid tokens, so a green run can't be vacuous.
- **`cssVar` is data, not derivable.** Only ~21% of slugs match a naive
  `--gv-<slug>` transform (`border.entry_color` → `--gv-entry-border-color`). Consumers
  must read `$extensions["com.gravitykit.tokens"].cssVar`. Never regenerate names from
  token paths.
- **Not every token is expressible.** Percentages, `em`, `clamp()`, `min()`,
  `color-mix()` as a whole value, bare keywords and `none` have no DTCG type. Each is
  emitted at its normal path as a group with no `$value` (DTCG reads a valueless object
  as a group), carrying its raw CSS under `$extensions`. Both Style Dictionary and
  Terrazzo skip these silently. Counts live in `$extensions[...].counts`.
- **A bare `R G B` channel triplet is never emitted as a `color`.** It only resolves
  inside `rgb()`, so a consumer writing the rendered hex back out produces invalid CSS.
  The rule stays as a guard even though GravityView no longer ships one: `shadow_color`
  became a real `<color>` in GVIEW-374, and its shadows are now tinted with
  `color-mix()`, which `parseShadow()` flattens to the same literal the old
  `rgb(var(--c) / a)` form produced.
- **~18 tokens publish resolved values.** `--gv-font-size-xs` ships as
  `calc(var(--gv-font-size-base) * 0.75)`; DTCG has no expression language, so the file
  carries `0.75rem`. Each says so in `$description` and is listed under
  `derivedTokens`.
- **No build timestamp.** The file carries a content-derived `sourceDigest` so the
  weekly deploy cron does not republish a byte-different artifact when nothing changed.
- **Conformance and interop are checked in different places.** The deploy enforces
  schema conformance (in the generator). `npm run tokens:verify` proves the stronger
  property — that a real consumer rebuilds GravityView's actual CSS from the file — and
  runs in **`token-interop.yml`**, not the deploy, because a Style Dictionary regression
  should not block publishing a correct artifact. It is what caught `shadow_color`.
- **An unrecognised value form fails the build.** The rule table's catch-all is a
  tripwire: a registry rewrite introducing a spelling the emitter does not know would
  otherwise demote those tokens to metadata-only groups while still exiting 0. Widening
  `KNOWN_UNKNOWN_FORMS` in `scripts/generate-tokens.mjs` is a deliberate act.

## Branch & deploy gotchas

- CI builds products from their `develop` branch (per `repos-config.json`). A hook
  or token only appears here once it is on `develop`. A product-side change to a
  token's CSS **value form** can therefore break this build before anyone edits
  this repo; land the emitter's support first, since it accepts old and new forms.
- Deploy triggers: push to `main`, a weekly cron, or manual workflow dispatch.
- `npm ci` installs the **locked** commit in `package-lock.json` (not branch
  tips); shipping a generator-fork fix needs the lockfile SHA bumped.
- Read a file at a ref via `gh api --method GET "repos/OWNER/REPO/contents/PATH"
  -f ref=BRANCH`. Without `--method GET` it POSTs and 404s (false "missing file").

## Paths

This repo is portable: use relative paths in committed code, scripts, and config.
Do not hardcode machine-specific absolute paths.

#!/usr/bin/env node
/**
 * Fetches the merge-tag artifact that GravityKit/merge-tags publishes, into static/api/.
 *
 * This site cannot generate it. The generator's inputs are that repo's schema catalog and its
 * capture harness's `captures.json`, and the harness is a Docker stack running real WordPress +
 * Gravity Forms. So merge-tags publishes the bytes on every green push to main (its
 * `publish-artifact` job, gated on `verify`) and this fetches them.
 *
 * SPEC-FINAL 6.B.5 is explicit that "a fetch failure reads as an error, not an empty catalog", so
 * every failure path here throws. The one thing this must never do is leave a syntactically valid
 * file describing nothing: a page rendering "0 merge tags" looks like a product with no merge tags,
 * not like a broken build, and nobody would go looking for the cause.
 *
 * NOT chained into `docs:generate`. That script runs in the Pages deploy, and wiring a step
 * that hard-fails without a secret took the whole site's build down with it (run
 * 32555981823). It stays an explicit script until MERGE_TAGS_TOKEN exists, at which point
 * add a step to .github/workflows/deploy.yml:
 *
 *   - name: Fetch the merge-tag artifact
 *     env:
 *       MERGE_TAGS_TOKEN: ${{ secrets.MERGE_TAGS_TOKEN }}
 *     run: npm run merge-tags:generate
 *
 * Failing loudly is still right for the artifact itself -- an empty catalog would render as
 * a product with no merge tags. It is not right for it to decide whether every other page
 * on the site ships.
 *
 * The source repo is PRIVATE, so this needs a token with read access to it:
 *   MERGE_TAGS_TOKEN   (CI secret; a fine-grained PAT with Contents: read on GravityKit/merge-tags)
 * Falls back to GITHUB_TOKEN / GH_TOKEN for local use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(PROJECT_ROOT, 'static', 'api', 'merge-tags.json');
const REPO = process.env.MERGE_TAGS_REPO || 'GravityKit/merge-tags';
const TAG = process.env.MERGE_TAGS_TAG || 'merge-tags-artifact';
const ASSET = 'merge-tags.json';

const token = process.env.MERGE_TAGS_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

function die(message) {
  console.error(`\n✗ merge-tags artifact: ${message}\n`);
  process.exit(1);
}

if (!token) {
  die(
    `no token. ${REPO} is private, so fetching its release asset needs MERGE_TAGS_TOKEN ` +
      '(fine-grained PAT, Contents: read). Set it as a repository secret in CI.',
  );
}

const api = async (url, accept) => {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'gravitykit.dev-docs-build' },
  });

  if (!res.ok) {
    die(`${url} returned ${res.status} ${res.statusText}`);
  }

  return res;
};

const release = await (
  await api(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, 'application/vnd.github+json')
).json();

const asset = (release.assets || []).find((a) => a.name === ASSET);

if (!asset) {
  die(`release "${TAG}" carries no asset named ${ASSET} (found: ${(release.assets || []).map((a) => a.name).join(', ') || 'none'})`);
}

const body = await (await api(asset.url, 'application/octet-stream')).text();

let artifact;
try {
  artifact = JSON.parse(body);
} catch (error) {
  die(`the asset is not valid JSON: ${error.message}`);
}

// Same floor the publisher enforces, asserted again on arrival: a truncated download is still
// valid JSON often enough to matter, and this is the copy that gets served.
const mods = artifact?.modifiers?.length ?? 0;
const tags = artifact?.tags?.length ?? 0;
const captures = artifact?.captures?.count ?? 0;

if (artifact?.captures?.status !== 'captured') {
  die(`captures.status is ${JSON.stringify(artifact?.captures?.status)}, not "captured" -- refusing to serve a stub`);
}

if (mods < 1 || tags < 1) {
  die(`refusing to serve an empty catalog (${tags} tags, ${mods} modifiers)`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body.endsWith('\n') ? body : `${body}\n`);

console.log(`✓ merge-tags artifact: ${tags} tags, ${mods} modifiers, ${captures} captures (from ${REPO}@${TAG}, built ${artifact.generated})`);

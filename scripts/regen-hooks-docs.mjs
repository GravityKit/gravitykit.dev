import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-detect project root (parent of scripts directory)
const gravitykit_docs_dir = process.env.GRAVITYKIT_DOCS_DIR || path.resolve(__dirname, '..');

// WordPress plugins directory - must be set via environment variable for regeneration
const wp_plugins_dir = process.env.WP_PLUGINS_DIR || '';

const regen_config_path = path.join(gravitykit_docs_dir, 'wp-hooks-regenerate.json');

function normalize_slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function load_regen_config() {
  if (!fs.existsSync(regen_config_path)) {
    return { wp_plugins_dir, defaults: {}, plugins: {} };
  }

  const raw = fs.readFileSync(regen_config_path, 'utf8');
  const json = JSON.parse(raw);

  return {
    wp_plugins_dir: json.wp_plugins_dir || wp_plugins_dir,
    defaults: json.defaults || {},
    plugins: json.plugins || {},
    products: Array.isArray(json.products) ? json.products : [],
  };
}

function list_plugin_dirs(config_wp_plugins_dir) {
  if (!fs.existsSync(config_wp_plugins_dir)) {
    return [];
  }

  return fs
    .readdirSync(config_wp_plugins_dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function score_candidate(target_id, candidate_dir) {
  const tokens = String(target_id).toLowerCase().split('-').filter(Boolean);
  const candidate = String(candidate_dir).toLowerCase();

  let matched = 0;
  for (const t of tokens) {
    if (candidate.includes(t)) {
      matched++;
    }
  }

  // Prefer more token matches, then prefer longer (more specific) dirs.
  return matched * 1000 + candidate.length;
}

function find_best_plugin_dir(target_id, plugin_dirs) {
  const target = normalize_slug(target_id);

  // Exact match by normalized dirname.
  for (const dir of plugin_dirs) {
    if (normalize_slug(dir) === target) {
      return dir;
    }
  }

  // Token-based scoring for better matches (avoids mapping sub-products to base gravityview).
  const scored = plugin_dirs
    .map((dir) => ({ dir, score: score_candidate(target_id, dir) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.dir || null;
}


function run_wp_hooks_documentor(extra_args, overrides) {
  // Use the product directory (from docs path) for wp-hooks-doc.json, not the WP plugins dir.
  const config_dir = overrides.product_dir;

  const config_path = path.join(config_dir, 'wp-hooks-doc.json');
  if (!fs.existsSync(config_path)) {
    return { ok: false, reason: `Missing wp-hooks-doc.json in ${config_dir}` };
  }
  const original_config_contents = fs.readFileSync(config_path, 'utf8');
  let did_rewrite_config = false;

  try {
    const config_json = JSON.parse(original_config_contents);

    // Always set input to the WP plugins source directory.
    if (overrides.desired_input_dir) {
      config_json.input = overrides.desired_input_dir;
      did_rewrite_config = true;
    }

    // Merge defaults from wp-hooks-regenerate.json.
    if (overrides.defaults && typeof overrides.defaults === 'object') {
      for (const [key, value] of Object.entries(overrides.defaults)) {
        if (key === 'customFields') {
          continue;
        }

        if (typeof config_json[key] === 'undefined') {
          config_json[key] = value;
          did_rewrite_config = true;
        }
      }

      // Deep-merge customFields.
      const default_custom_fields = overrides.defaults.customFields && typeof overrides.defaults.customFields === 'object'
        ? overrides.defaults.customFields
        : {};
      const existing_custom_fields = config_json.customFields && typeof config_json.customFields === 'object'
        ? config_json.customFields
        : {};

      const merged = { ...default_custom_fields, ...existing_custom_fields };
      if (JSON.stringify(merged) !== JSON.stringify(existing_custom_fields)) {
        config_json.customFields = merged;
        did_rewrite_config = true;
      }
    }

    // Set output directory relative to config_dir.
    if (overrides.desired_output_dir) {
      const relative_output_dir = path.relative(config_dir, overrides.desired_output_dir) || '.';
      config_json.outputDir = relative_output_dir.startsWith('.')
        ? relative_output_dir
        : `./${relative_output_dir}`;
      did_rewrite_config = true;
    } else if (typeof config_json.outputDir === 'string' && config_json.outputDir.startsWith('/')) {
      const relative_output_dir = path.relative(config_dir, config_json.outputDir) || '.';
      config_json.outputDir = relative_output_dir.startsWith('.') ? relative_output_dir : `./${relative_output_dir}`;
      did_rewrite_config = true;
    }

    if (did_rewrite_config) {
      fs.writeFileSync(config_path, JSON.stringify(config_json, null, 2) + '\n');
    }
  } catch (e) {
    // Ignore JSON parse errors; wp-hooks-documentor will surface them.
  }

  // Run from the product directory where wp-hooks-doc.json lives.
  const result = spawnSync('wp-hooks-documentor', ['generate', ...extra_args], {
    cwd: config_dir,
    stdio: 'inherit',
    shell: false,
  });

  if (did_rewrite_config) {
    fs.writeFileSync(config_path, original_config_contents);
  }

  if (result.error && result.error.code === 'ENOENT') {
    return {
      ok: false,
      reason:
        'wp-hooks-documentor is not on PATH. Install it globally (npm i -g github:GravityKit/wp-hooks-documentor) or run this script from the same shell where it is available.',
    };
  }

  return { ok: result.status === 0, reason: result.status === 0 ? '' : `Exit code ${result.status}` };
}

function extract_docs_plugins_from_config(config_contents) {
  const plugins = [];
  const re = /\['@docusaurus\/plugin-content-docs',\s*\{([\s\S]*?)\}\s*\]/g;

  for (const match of config_contents.matchAll(re)) {
    const block = match[1];
    const id_match = /\bid:\s*'([^']+)'/.exec(block);
    const path_match = /\bpath:\s*'([^']+)'/.exec(block);

    if (!id_match) {
      continue;
    }

    plugins.push({
      id: id_match[1],
      docs_path: path_match ? path_match[1] : null,
    });
  }

  // De-dupe by id, keep first.
  const seen = new Set();
  return plugins.filter((p) => {
    if (seen.has(p.id)) {
      return false;
    }
    seen.add(p.id);
    return true;
  });
}

function print_help() {
  console.log(`Usage: npm run regen:hooks -- [wp-hooks-documentor args]

This will:
- Read gravitykit-docs/wp-hooks-regenerate.json
- Use products[] as the source of truth
- Match each product to a WP plugin directory for source scanning
- Look for wp-hooks-doc.json in the Products directory (derived from docs.path)
- Run: wp-hooks-documentor generate (from the Products directory)

Examples:
  npm run regen:hooks
  npm run regen:hooks -- --help

Notes:
- Each product must have wp-hooks-doc.json in its Products directory (e.g., Products/GravityActions/wp-hooks-doc.json).
- Source code is scanned from wp-content/plugins, output goes to Products/{name}/docusaurus.
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    print_help();
    return 0;
  }

  // Pass args through to wp-hooks-documentor.
  //
  // npm usage: npm run regen:hooks -- --help
  // In that case, Node receives args like ["--help"].
  //
  // Pass args through to wp-hooks-documentor (optional).
  const passthrough_index = args.indexOf('--');
  const final_args = passthrough_index === -1 ? args : args.slice(passthrough_index + 1);
  const regen_config = load_regen_config();
  const docs_plugins = regen_config.products
    .filter((p) => p && p.id && p.docs && p.docs.path && p.docs.routeBasePath)
    .map((p) => ({ id: p.id, docs_path: p.docs.path }));

  if (!docs_plugins.length) {
    console.error('No products found in wp-hooks-regenerate.json.');
    return 1;
  }

  const plugin_dirs = list_plugin_dirs(regen_config.wp_plugins_dir);
  const results = [];

  for (const plugin of docs_plugins) {
    const plugin_id = plugin.id;

    const matched_dir = find_best_plugin_dir(plugin_id, plugin_dirs);
    const per_plugin = (regen_config.plugins && regen_config.plugins[plugin_id]) ? regen_config.plugins[plugin_id] : {};

    const forced_dir = per_plugin.wp_plugin_dir || null;
    const effective_dir = forced_dir || matched_dir;

    if (!effective_dir) {
      results.push({ id: plugin_id, ok: false, reason: 'No matching plugin directory found in wp-content/plugins.' });
      continue;
    }

    // Derive product directory from docs.path (e.g., ../../Products/GravityActions/docusaurus/docs -> ../../Products/GravityActions).
    let product_dir = null;
    if (plugin.docs_path) {
      const docs_dir_abs = path.isAbsolute(plugin.docs_path)
        ? plugin.docs_path
        : path.resolve(gravitykit_docs_dir, plugin.docs_path);
      // Go up 2 levels from docusaurus/docs to product root.
      product_dir = path.dirname(path.dirname(docs_dir_abs));
    }

    if (!product_dir || !fs.existsSync(product_dir)) {
      results.push({ id: plugin_id, ok: false, reason: `Product directory not found: ${product_dir}` });
      continue;
    }

    console.log(`\n=== ${plugin_id} (${effective_dir}) ===`);
    console.log(`  Product dir: ${product_dir}`);

    const desired_input_dir = per_plugin.input_dir
      ? per_plugin.input_dir
      : path.join(regen_config.wp_plugins_dir, effective_dir);

    // Output to the docusaurus folder within the product directory.
    let desired_output_dir = path.join(product_dir, 'docusaurus');

    if (per_plugin.output_dir) {
      desired_output_dir = per_plugin.output_dir;
    }

    const overrides = {
      wp_plugins_dir: regen_config.wp_plugins_dir,
      product_dir,
      desired_input_dir,
      desired_output_dir,
      defaults: regen_config.defaults || {},
    };

    const res = run_wp_hooks_documentor(final_args, overrides);
    results.push({ id: plugin_id, ok: res.ok, reason: res.reason });

    if (!res.ok && res.reason.includes('not on PATH')) {
      // Hard-stop if the tool is missing; the rest will all fail.
      break;
    }
  }

  console.log('\nSummary:');
  for (const r of results) {
    console.log(`- ${r.ok ? 'OK' : 'FAIL'} ${r.id}${r.ok ? '' : `: ${r.reason}`}`);
  }

  return results.some((r) => !r.ok) ? 1 : 0;
}

process.exit(main());

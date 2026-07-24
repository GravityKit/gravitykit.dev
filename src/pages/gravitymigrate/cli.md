---
title: "GravityMigrate command line (WP-CLI)"
description: "WP-CLI reference for GravityMigrate: export, import, inspect, status, and reset a migration bundle from the command line, including scripting with --porcelain and --format=json and the filters that tune import safety limits."
---

# Command line (WP-CLI)

GravityMigrate registers a `wp gk migrate` command for running migrations without the browser. It exports a portable ZIP bundle, imports one, inspects one, and clears stuck migration state. Export and import drive the same batch state machine the admin screens use, run to completion synchronously in a single command.

The commands are available once GravityMigrate is active. GravityKit Foundation, bundled with the plugin, registers the top-level `wp gk` namespace.

:::note Administrator required
`export`, `import`, and `reset` read or write your Gravity Forms and GravityView data, so they require an administrator. Pass `--user=` with an administrator's username or ID (for example `--user=admin`). `inspect` and `status` are read-only and do not require it.
:::

## Commands

| Command | Purpose |
| --- | --- |
| `wp gk migrate export` | Export forms and their data to a ZIP bundle. |
| `wp gk migrate import` | Import a bundle into this site. |
| `wp gk migrate inspect` | Print a bundle's contents without importing it. |
| `wp gk migrate status` | Report whether a migration is in progress or state is left over. |
| `wp gk migrate reset` | Clear stuck migration state. |

## `wp gk migrate export`

Exports Gravity Forms and GravityKit data to a portable ZIP bundle.

| Option | Description |
| --- | --- |
| `--forms=<ids>` | Comma-separated form IDs to export, or `all`. Required. |
| `--data=<types>` | Comma-separated [data types](#data-types), or `all`. Default: `entries,views,posts`. |
| `--date-start=<Y-m-d>` | Only export entries created on or after this date. |
| `--date-end=<Y-m-d>` | Only export entries created on or before this date. |
| `--password=<password>` | Encrypt the ZIP (AES-256). |
| `--public-url=<url>` | Rewrite this site's origin to `<url>` in exported upload URLs, page content, and `info.json`. Use it when the site's stored URL is not reachable from the destination so uploads download on import. The URL must be public and resolvable from the importing server. |
| `--output=<path>` | Copy the finished ZIP to this path (the export directory is auto-deleted after three hours). |
| `--porcelain` | Output only the resulting ZIP path. |
| `--format=<format>` | Summary format: `table` (default) or `json`. |

```bash
# Export one form with entries, Views, and the pages that embed them
wp gk migrate export --forms=2 --user=admin

# Export everything, encrypted, to a specific path
wp gk migrate export --forms=all --data=all --password=s3cret \
  --output=/srv/bundles/site.zip --user=admin

# Export from a demo clone whose stored URL is not publicly reachable
wp gk migrate export --forms=2 --public-url=https://example.demo.gravitykit.com \
  --output=/srv/bundles/demo.zip --porcelain --user=admin
```

## `wp gk migrate import`

Imports a GravityMigrate ZIP bundle into this site.

:::warning Imports are not resumable
If an import fails partway, it prints the form IDs it committed before the failure. Delete those forms, run `wp gk migrate reset`, then re-run the import to get back to a clean state.
:::

| Option | Description |
| --- | --- |
| `<zip>` | Path to the GravityMigrate export ZIP. Required. |
| `--forms=<ids>` | Comma-separated source form IDs to import, or `all` (from the bundle). Default: `all`. |
| `--data=<types>` | Comma-separated [data types](#data-types) to import, or `all` (intersected with the bundle). Default: `all`. |
| `--password=<password>` | ZIP password, if it was encrypted. |
| `--skip-uploads` | Do not download entry file uploads. |
| `--download-timeout=<secs>` | Per-file timeout for downloading a linked entry upload. Overrides the `gk/gravitymigrate/import/download-timeout` filter (default 300). |
| `--max-download-bytes=<n>` | Maximum bytes accepted for a single downloaded upload. Overrides the `gk/gravitymigrate/import/max-download-bytes` filter (default 100 MB). |
| `--max-dump-file-size=<n>` | Maximum allowed size, in bytes, of the bundle's database dump. Overrides the `gk/gravitymigrate/import/max-dump-file-size` filter (default 500 MB). |
| `--format=<format>` | Summary format: `table` (default) or `json`. |
| `--yes` | Skip the confirmation prompt (import writes into Gravity Forms tables). |
| `--porcelain` | Output only the newly created form IDs, one per line. |

```bash
# Import a bundle
wp gk migrate import bundle.zip --user=admin --yes

# Import only two of the bundle's forms, without downloading uploads
wp gk migrate import bundle.zip --forms=2,5 --skip-uploads --user=admin --yes

# Raise the dump-size limit for one very large bundle
wp gk migrate import big.zip --max-dump-file-size=1073741824 --user=admin --yes
```

Entry file uploads are downloaded from the source site during import, so importing `uploads` pulls `entries` in with it. If a download fails because the source URL is unreachable, the entry keeps pointing at the source; re-export with `--public-url` set to an address the importing server can reach.

## `wp gk migrate inspect`

Prints a bundle's forms, data types, and source URL without importing it, and reports whether its upload URLs will resolve from this site and whether its database dump is within the size limit.

| Option | Description |
| --- | --- |
| `<zip>` | Path to the GravityMigrate export ZIP. Required. |
| `--password=<password>` | ZIP password, if encrypted. |
| `--format=<format>` | Output format: `table` (default) or `json`. |

```bash
wp gk migrate inspect bundle.zip
wp gk migrate inspect bundle.zip --format=json
```

## `wp gk migrate status`

Reports current migration state: whether an import lock is held (and whether it is stale), whether a crashed import is saved, and whether an export left state to clean up.

| Option | Description |
| --- | --- |
| `--format=<format>` | Output format: `table` (default) or `json`. |

```bash
wp gk migrate status
wp gk migrate status --format=json
```

## `wp gk migrate reset`

Clears stuck migration state: the temporary tables, the extracted import files, and the import and export progress options. Use it when an interrupted migration leaves a later one refused.

| Option | Description |
| --- | --- |
| `--yes` | Skip the confirmation prompt. |

```bash
wp gk migrate reset --user=admin --yes
```

## Data types

`--data` accepts a comma-separated list of these types, or `all`:

| Type | What it includes |
| --- | --- |
| `entries` | Form entries with their metadata and notes. |
| `uploads` | Entry file uploads. Downloaded from the source during import, so it requires `entries`. |
| `views` | GravityView Views. |
| `posts` | The pages that embed your Views, and other connected posts. |
| `revisions` | Form revision history. |
| `addon_feeds` | Add-on feeds, for example GravityView and GravityCharts. |
| `gravityflow` | Gravity Flow workflow activity, where present. |
| `drafts` | Saved and continued draft submissions. |
| `gf_settings` | Gravity Forms settings. |
| `gk_settings` | GravityKit settings. |
| `rest_api_keys` | Gravity Forms REST API keys. |

## Scripting

`--format=json` prints a machine-readable summary. `--porcelain` prints only the essential value: the ZIP path from `export`, or the newly created form IDs (one per line) from `import`. Together they let you chain a migration between two servers:

```bash
#!/bin/bash
set -e

# Export on the source site and capture just the ZIP path
ZIP=$(wp gk migrate export --forms=all --data=all --porcelain --user=admin)

# Copy it to the destination and import it there
scp "$ZIP" deploy@destination:/tmp/migration.zip
ssh deploy@destination "wp gk migrate import /tmp/migration.zip --user=admin --yes --porcelain"
```

## Tuning import safety limits

The import command caps download time, download size, and the bundle's database-dump size to protect the server. Each cap has a filter, and each filter has a matching `import` flag that overrides it for a single run:

| Filter | Flag | Default |
| --- | --- | --- |
| `gk/gravitymigrate/import/download-timeout` | `--download-timeout` | 300 seconds |
| `gk/gravitymigrate/import/max-download-bytes` | `--max-download-bytes` | 100 MB |
| `gk/gravitymigrate/import/max-dump-file-size` | `--max-dump-file-size` | 500 MB |

Set a filter to change the limit for every import on a site that legitimately migrates very large amounts of data:

```php
add_filter( 'gk/gravitymigrate/import/max-dump-file-size', function () {
	return 1073741824; // 1 GB
} );
```

See the [Filters reference](/docs/gravitymigrate/filters/) for the full list, including `gk/gravitymigrate/export/row` and `gk/gravitymigrate/export/info` for reshaping exported data, and `gk/gravitymigrate/import/upload-url` for redirecting where a linked upload is downloaded from.

## Related

- [GravityMigrate filters](/docs/gravitymigrate/filters/)
- [GravityMigrate actions](/docs/gravitymigrate/actions/)
- [Migrating from the command line](https://www.gravitykit.com/docs/gravitymigrate/) (user guide)

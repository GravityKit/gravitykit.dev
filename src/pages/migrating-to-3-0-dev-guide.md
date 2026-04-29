---
title: "Migrating to GravityView 3.0"
sidebar_label: "Migrating to 3.0"
sidebar_position: 99
description: "Developer migration guide for GravityView 3.0: PSR-4 namespace refactor, WordPress 5.5 minimum, file system changes, deprecated hooks, and compatibility internals."
---

# Migrating to GravityView 3.0

GravityView 3.0 is a structural refactor. The plugin's class library has been consolidated under the `GravityKit\GravityView\*` namespace with PSR-4 autoloading, the minimum WordPress version has moved up, and a long-standing assumption that certain files must exist on disk has been removed.

This guide is for developers who build on top of GravityView: custom templates, add-ons, extensions, theme overrides, and integration layers. It covers what changed, what you need to do before upgrading, and how to resolve the most common migration errors.

:::note Mostly structural, with two caveats
3.0 is structural. Legacy class names, file-based template overrides, and hook callbacks continue to work through compatibility bridges. You can migrate on your own schedule; the deprecation window stays open.

Two caveats worth knowing up front: `get_class()` now returns the canonical PSR-4 name, so string comparisons against old class names will fail (see "Use `is_a()` or `instanceof`"), and some operations no longer assume a physical file is on disk (see "File system changes").
:::

## Overview of what's changing

- Every class from `includes/` (convention: `GravityView_*`) and `future/` (namespace: `\GV\*`) has moved to `src/` under `GravityKit\GravityView\*`.
- The `includes/` and `future/` directories were removed entirely. Over 200 legacy files and 83 namespaced files were relocated and renamed to match PSR-4 conventions.
- Composer autoload now targets `src/` with an optimized classmap.
- Legacy names resolve through lazy SPL autoloaders in `src/Aliases/gv-aliases.php` and `src/Aliases/legacy-aliases.php` that call `class_alias()` on demand.
- The minimum WordPress version has been raised — see below.
- Certain operations no longer require a physical file on disk. This is a new architectural direction in 3.0 and has implications for custom templates and integrations — see "File system changes" below.
- A set of formal interfaces was added under `GravityKit\GravityView\Contracts`.
- Over 40 legacy hooks deprecated in 2.55 continue to emit deprecation notices.
- Search, which moved to the Query Filters pipeline in 2.x, stays on that pipeline in 3.0. A handful of legacy search hooks deprecated in 2.56 remain in the compatibility layer.

## New minimum WordPress version

GravityView 3.0 raises the minimum supported WordPress version to **5.5**.

| Dependency | Minimum | Recommended |
|---|---|---|
| PHP | 7.4.0 | 8.1+ |
| WordPress | 5.5 | 6.0+ |
| Gravity Forms | 2.6.0 | 2.7+ |

Why 5.5?

- **WordPress 5.2** added the libsodium polyfill and the site health tooling. That's the floor we need for any modern crypto or diagnostic code.
- **WordPress 5.5** added the `https_local_ssl_verify` filter and improved REST and cron internals. Supporting anything older forced us to keep shims in place for behaviors that shipped over five years ago.
- **WordPress 6.0+** is recommended. Block editor work and newer Gravity Forms features assume it.

If your add-on also targets GravityView, update your own `Requires at least` header to 5.5 and audit any conditional code that branched on pre-5.5 WordPress versions. You can drop those branches.

The future-minimum constants in `gravityview.php` have been updated accordingly:

```php
GV_MIN_WP_VERSION           // '5.5'
GV_FUTURE_MIN_WP_VERSION    // '6.0'
GV_MIN_GF_VERSION           // '2.6.0'
GV_FUTURE_MIN_GF_VERSION    // '2.7.0'
GV_FUTURE_MIN_PHP_VERSION   // '8.0.0'
```

If your add-on checks `GV_MIN_WP_VERSION` to decide whether to bail, you're fine — the constant still exists. If you hard-coded `4.7.0` anywhere, update it.

## Query Filters

A common question during the 3.0 beta: *did Query Filters ship with 3.0?*

**No — Query Filters shipped in 2.x.** The search pipeline was rebuilt on top of the Query Filters library in 2.56, and the legacy `GF_Query`-based search hooks were deprecated at the same time. 3.0 doesn't change the pipeline. It continues to route View searches through Query Filters and keeps the 2.56 deprecation notices active for any code still wired to the old hooks.

If you were already using the modern `gk/gravityview/search/request/*` and `gk/query-filters/condition/*` filters in 2.x, nothing changes for you in 3.0. If you're still on a legacy search hook, the replacement has existed since 2.56:

| Deprecated in 2.56 | Replacement |
|---|---|
| `gravityview_fe_search_criteria` | `gk/gravityview/search/request/filters` |
| `gravityview/widgets/search/created_by/user_meta_fields` | `gk/query-filters/condition/created-by/user-meta-fields` |
| `gravityview/widgets/search/created_by/user_fields` | `gk/query-filters/condition/created-by/user-fields` |
| `GravityView_Widget_Search_Author_GF_Query_Condition` | Query Filters `Created_By_Condition` class |

If you previously extended `GravityView_Widget_Search_Author_GF_Query_Condition` or wrote a custom `GF_Query_Condition` subclass for GravityView searches, port your logic to a Query Filters condition class. The library's `Created_By_Condition` is a reference implementation.

## File system changes

:::warning 3.0 beta: verify in your environment
This section describes an architectural change we're still hardening during the 3.0 beta. Some error paths have not yet been exercised at scale — please test in staging and report anything unexpected to support before relying on this behavior in production.
:::

In 2.x and earlier, several GravityView operations assumed a physical file existed on disk — template includes, field-type registrations, and some admin view resolutions all resolved by calling `file_exists()` or `require_once` on a concrete path. 3.0 breaks that assumption.

### What changed

- Class resolution runs through the PSR-4 autoloader and Composer's optimized classmap. No code path explicitly requires a legacy file to be present by name.
- Template resolution continues to support file-based overrides in your theme or plugin (see "Template overrides" below), but core template loading no longer depends on a physical file at the canonical `includes/` or `future/` path.
- Registered field types and widgets can be contributed entirely in-memory via their class, without a supporting `field-types/*.php` or `widgets/*.php` file.

### Errors you might see during the beta

Because the file-existence assumption is baked into some third-party add-ons and into older custom code, you may hit errors of the form:

- `include(): Failed opening '.../includes/class-gravityview-*.php'` — an add-on is trying to `require_once` a file that was moved to `src/`.
- `Call to undefined function gravityview_*()` — a global helper is defined inline in a file that is no longer auto-included. Most globals moved to `src/Utils/helper-functions.php`, which Composer loads via `files` autoload. If you replaced the autoloader or bootstrapped GravityView manually in a test harness, re-include it.
- `Class 'GravityView_*' not found` thrown during `spl_autoload_call()` — the alias autoloader hasn't been registered yet because `GRAVITYVIEW_DIR` wasn't defined when `vendor/autoload.php` ran. Define the plugin constants before loading the autoloader, or let `gravityview.php` bootstrap normally.

### How to handle them

1. Replace any `require_once WP_PLUGIN_DIR . '/gravityview/includes/...'` (or `future/...`) in your add-on with a namespaced class reference. The PSR-4 autoloader will find it.
2. If you maintain a plugin that inlined a helper function expecting a certain GravityView file to be loaded, replace the inline with a call to the canonical helper in `src/Utils/helper-functions.php`.
3. Avoid `file_exists()` gates against GravityView internal paths in your own code. Check class existence with `class_exists(...)` instead — it respects aliases.
4. If you ship a test bootstrap that loads `vendor/autoload.php` before GravityView's constants are defined, the alias files short-circuit. That's intentional. Re-include them after constants are set, or simply let `gravityview.php` handle the sequence.

:::note Reporting edge cases
If you hit a file-not-found or class-not-found error that doesn't match the patterns above, email [support@gravitykit.com](mailto:support@gravitykit.com) with a stack trace and your GravityView version. We'd rather catch these during beta than after.
:::

## Plugin bootstrap order

Understanding the load sequence helps diagnose "class not found" and alias timing issues. `gravityview.php` executes in this order:

1. Foundation preflight check
2. `GravityKit\GravityView\Foundation\should_load()` and `meets_min_php_version_requirement()` gates
3. Plugin constants (`GV_PLUGIN_VERSION`, `GRAVITYVIEW_DIR`, etc.)
4. Composer autoload: `vendor/autoload.php`, then `vendor_prefixed/autoload.php`
5. Alias includes: `src/Aliases/gv-aliases.php` and `src/Aliases/legacy-aliases.php`
6. `GravityKit\GravityView\Foundation\Core::register( GRAVITYVIEW_FILE )`
7. `_mocks.php` for deprecated global functions
8. `GravityView_Deprecated_Hook_Notices::init()`
9. `\GV\Core::bootstrap()`

The alias files are **also** listed in Composer's `files` autoload. They register once via a `GRAVITYVIEW_LEGACY_ALIASES_REGISTERED` / `GRAVITYVIEW_GV_ALIASES_REGISTERED` sentinel, so double inclusion is safe.

## Autoload strategy

GravityView 3.0 uses a two-layer autoload approach.

### Layer 1: PSR-4 with optimized classmap

`composer.json` maps the PSR-4 root to `src/`:

```json
"autoload": {
    "psr-4": {
        "GravityKit\\GravityView\\": "src/"
    },
    "exclude-from-classmap": [
        "src/Gutenberg/node_modules/",
        "src/Gutenberg/Blocks/*/block.php",
        "src/Admin/Rendering/field-types/",
        "src/GravityForms/QueryExtensions/_mocks.php",
        "src/Widget/Search/class-search-widget.php",
        "src/Utils/class-common.php",
        "src/API/class-api.php"
    ],
    "files": [
        "src/Aliases/gv-aliases.php",
        "src/Aliases/legacy-aliases.php",
        "src/Utils/helper-functions.php",
        "src/Utils/connector-functions.php",
        "src/Utils/import-functions.php"
    ]
}
```

`composer dump-autoload -o` is run in `post-install-cmd` and `post-update-cmd`. Class lookups hit the optimized classmap before falling back to PSR-4 path resolution.

### Layer 2: Lazy SPL autoloaders for legacy names

Both alias files register SPL autoloaders that intercept legacy class references. When PHP encounters a legacy name (`\GV\View` or `GravityView_Admin`), the autoloader:

1. Looks up the legacy → PSR-4 name in a static map.
2. Triggers the Composer PSR-4 autoloader to load the canonical class.
3. Calls `class_alias( $psr4_class, $legacy_class )` so the legacy name resolves.

Lazy resolution avoids the circular-dependency problems that `class_alias()` batches at load time would introduce — for example, aliasing a child before its parent.

### Vendor prefixing with Strauss

Foundation and Query Filters are vendor-prefixed during `composer install`:

- `GravityKit\Foundation\*` → `GravityKit\GravityView\Foundation\*`
- `GravityKit\QueryFilters\*` → `GravityKit\GravityView\QueryFilters\*`
- Third-party dependencies (Gettext, Illuminate, Monolog, Psr, TrustedLogin) move under `GravityKit\GravityView\Foundation\ThirdParty\*`

If your add-on depends on Foundation or Query Filters, reference GravityView's prefixed copies by their prefixed names.

## Namespace mapping

The full tables live below. The complete mapping also lives in `src/Aliases/gv-aliases.php` (372 lines, `\GV\*` mappings) and `src/Aliases/legacy-aliases.php` (819 lines, `GravityView_*` mappings). Read those files when you can't find a class in these tables.

### Core infrastructure

| Old name | New PSR-4 name |
|---|---|
| `\GV\Core` | `GravityKit\GravityView\Core\Core` |
| `\GV\Plugin` | `GravityKit\GravityView\Core\Plugin` |
| `\GV\Permalinks` | `GravityKit\GravityView\Core\Permalinks` |
| `\GV\Settings` | `GravityKit\GravityView\Settings\Settings` |
| `\GV\Plugin_Settings` | `GravityKit\GravityView\Settings\PluginSettings` |
| `\GV\View_Settings` | `GravityKit\GravityView\Settings\ViewSettings` |
| `\GV\Logger` | `GravityKit\GravityView\Logging\Logger` |
| `\GV\LogLevel` | `GravityKit\GravityView\Logging\LogLevel` |
| `\GV\WP_Action_Logger` | `GravityKit\GravityView\Logging\LoggerWpAction` |
| `\GV\Collection` | `GravityKit\GravityView\Data\Collection` |
| `\GV\Source` | `GravityKit\GravityView\Form\Source` |
| `\GV\Context` | `GravityKit\GravityView\Template\Context` |
| `\GV\Template_Context` | `GravityKit\GravityView\Template\TemplateContext` |
| `\GV\Utils` | `GravityKit\GravityView\Utils\Utils` |
| `\GV\Extension` | `GravityKit\GravityView\Extension\Extension` |
| `\GV\oEmbed` | `GravityKit\GravityView\Media\oEmbed` |
| `\GV\Wrappers\views` | `GravityKit\GravityView\Wrappers\Views` |
| `\GV\Collection_Position_Aware` | `GravityKit\GravityView\Contracts\CollectionPositionAwareInterface` |
| `\GV\Field_Renderer_Trait` | `GravityKit\GravityView\Renderer\FieldRendererTrait` |

### View domain

| Old name | New PSR-4 name |
|---|---|
| `\GV\View` | `GravityKit\GravityView\View\View` |
| `\GV\View_Collection` | `GravityKit\GravityView\View\ViewCollection` |
| `\GV\Join` | `GravityKit\GravityView\View\Join` |
| `GravityView_View` | `GravityKit\GravityView\View\ViewLegacy` |
| `GravityView_View_Data` | `GravityKit\GravityView\Data\ViewData` |

### Entry domain

| Old name | New PSR-4 name |
|---|---|
| `\GV\Entry` | `GravityKit\GravityView\Entry\Entry` |
| `\GV\GF_Entry` | `GravityKit\GravityView\Entry\EntryGravityForms` |
| `\GV\Entry_Collection` | `GravityKit\GravityView\Entry\EntryCollection` |
| `\GV\Entry_Filter` | `GravityKit\GravityView\Entry\EntryFilter` |
| `\GV\GF_Entry_Filter` | `GravityKit\GravityView\Entry\EntryFilterGravityForms` |
| `GravityView_Entry_Approval` | `GravityKit\GravityView\Entry\Approval` |
| `GravityView_Entry_Approval_Status` | `GravityKit\GravityView\Entry\ApprovalStatus` |
| `GravityView_Entry_Approval_Merge_Tags` | `GravityKit\GravityView\Entry\ApprovalMergeTags` |

### Form and field domains

| Old name | New PSR-4 name |
|---|---|
| `\GV\Form` | `GravityKit\GravityView\Form\Form` |
| `\GV\GF_Form` | `GravityKit\GravityView\Form\FormGravityForms` |
| `\GV\Form_Collection` | `GravityKit\GravityView\Form\FormCollection` |
| `\GV\Field` | `GravityKit\GravityView\Field\Field` |
| `\GV\GF_Field` | `GravityKit\GravityView\Field\FieldGravityForms` |
| `\GV\Internal_Field` | `GravityKit\GravityView\Field\InternalField` |
| `\GV\Internal_Source` | `GravityKit\GravityView\Field\InternalSource` |
| `\GV\Field_Collection` | `GravityKit\GravityView\Field\FieldCollection` |
| `GravityView_Field` | `GravityKit\GravityView\Field\Types\GravityViewField` |

### Widget, template, and renderer

| Old name | New PSR-4 name |
|---|---|
| `\GV\Widget` | `GravityKit\GravityView\Widget\Widget` |
| `\GV\Widget_Collection` | `GravityKit\GravityView\Widget\WidgetCollection` |
| `\GV\Template` | `GravityKit\GravityView\Template\Template` |
| `\GV\View_Template` | `GravityKit\GravityView\Template\TemplateView` |
| `\GV\Entry_Template` | `GravityKit\GravityView\Template\TemplateEntry` |
| `\GV\Field_Template` | `GravityKit\GravityView\Template\TemplateField` |
| `\GV\View_Table_Template` | `GravityKit\GravityView\Template\View\Table` |
| `\GV\View_List_Template` | `GravityKit\GravityView\Template\View\ListTemplate` |
| `\GV\Entry_Table_Template` | `GravityKit\GravityView\Template\Entry\Table` |
| `\GV\Entry_List_Template` | `GravityKit\GravityView\Template\Entry\ListTemplate` |
| `\GV\Renderer` | `GravityKit\GravityView\Renderer\Renderer` |
| `\GV\View_Renderer` | `GravityKit\GravityView\Renderer\ViewRenderer` |
| `\GV\Entry_Renderer` | `GravityKit\GravityView\Renderer\EntryRenderer` |
| `\GV\Field_Renderer` | `GravityKit\GravityView\Renderer\FieldRenderer` |
| `GravityView_Template` | `GravityKit\GravityView\Template\LegacyTemplate` |
| `GravityView_Merge_Tags` | `GravityKit\GravityView\Renderer\MergeTags` |

### Request, shortcode, REST, and admin

| Old name | New PSR-4 name |
|---|---|
| `\GV\Request` | `GravityKit\GravityView\Request\Request` |
| `\GV\Frontend_Request` | `GravityKit\GravityView\Request\FrontendRequest` |
| `\GV\Admin_Request` | `GravityKit\GravityView\Request\AdminRequest` |
| `\GV\Shortcode` | `GravityKit\GravityView\Shortcode\Shortcode` |
| `\GV\Shortcodes\gravityview` | `GravityKit\GravityView\Shortcode\GravityViewShortcode` |
| `\GV\REST\Core` | `GravityKit\GravityView\REST\Core` |
| `\GV\REST\Route` | `GravityKit\GravityView\REST\Route` |
| `\GV\REST\Views_Route` | `GravityKit\GravityView\REST\ViewsRoute` |
| `GravityView_Admin` | `GravityKit\GravityView\Admin\Admin` |
| `GravityView_Admin_Views` | `GravityKit\GravityView\Admin\AdminViews` |
| `GravityView_Admin_Metaboxes` | `GravityKit\GravityView\Admin\Metaboxes\AdminMetaboxes` |
| `GravityView_frontend` | `GravityKit\GravityView\Frontend\Frontend` |

### Extensions and utilities

| Old name | New PSR-4 name |
|---|---|
| `GravityView_Edit_Entry` | `GravityKit\GravityView\Extension\EditEntry\EditEntry` |
| `GravityView_Delete_Entry` | `GravityKit\GravityView\Extension\DeleteEntry\DeleteEntry` |
| `GravityView_Duplicate_Entry` | `GravityKit\GravityView\Extension\DuplicateEntry\DuplicateEntry` |
| `GravityView_API` | `GravityKit\GravityView\API\API` |
| `GVCommon` | `GravityKit\GravityView\Legacy\Utility\Common` |
| `GravityView_Cache` | `GravityKit\GravityView\Data\Cache` |
| `GravityView_Image` | `GravityKit\GravityView\Frontend\Image` |
| `GravityView_Compatibility` | `GravityKit\GravityView\Utils\Compatibility` |
| `GravityView_GF_Compat` | `GravityKit\GravityView\GravityForms\Compat` |
| `GravityView_Logging` | `GravityKit\GravityView\Logging\Logging` |
| `GravityView_Notifications` | `GravityKit\GravityView\Core\Notifications` |
| `GravityView_Powered_By` | `GravityKit\GravityView\Frontend\PoweredBy` |
| `GravityView_Error_Messages` | `GravityKit\GravityView\Utils\ErrorMessages` |
| `GravityView_Post_Types` | `GravityKit\GravityView\Core\PostTypes` |
| `GravityView_HTML_Elements` | `GravityKit\GravityView\Utils\HtmlElements` |
| `GravityView_Uninstall` | `GravityKit\GravityView\Core\Uninstall` |
| `GravityView_Ajax` | `GravityKit\GravityView\AJAX\AJAX` |
| `GravityView_Settings` | `GravityKit\GravityView\Settings\GravityViewSettings` |
| `GravityView_Roles_Capabilities` | `GravityKit\GravityView\Permissions\RolesCapabilities` |
| `GravityView_Deprecated_Hook_Notices` | `GravityKit\GravityView\Deprecation\DeprecatedHookNotices` |
| `GravityView_oEmbed` | `GravityKit\GravityView\Media\LegacyOEmbed` |

:::info GVCommon is classified as legacy
`GVCommon` is intentionally parked under `Legacy\Utility`. The class aggregates unrelated responsibilities (data access, view configuration, HTML, email/encryption) and will be split into focused helpers in a future release. The alias keeps all `GVCommon::method()` calls working.
:::

## New `Contracts` interfaces

`src/Contracts/` introduces formal interfaces that document the expected contract of core domain types. Custom implementations can target these interfaces for type safety and future-proofing:

| Interface | Describes |
|---|---|
| `GravityKit\GravityView\Contracts\ViewInterface` | A configured display of form entries, backed by the `gravityview` post type. |
| `GravityKit\GravityView\Contracts\EntryInterface` | A single form submission rendered inside a View. |
| `GravityKit\GravityView\Contracts\FieldInterface` | A data point inside a View — form field value, custom content, computed value. |
| `GravityKit\GravityView\Contracts\FormInterface` | A data source (Gravity Forms form or internal source) that provides entries. |
| `GravityKit\GravityView\Contracts\WidgetInterface` | Supplementary UI such as pagination, search, or custom content areas. |
| `GravityKit\GravityView\Contracts\CollectionPositionAwareInterface` | Collections filterable by position (fields, widgets, search fields). |

These are new in 3.0. Core classes implement them, and `\GV\Collection_Position_Aware` now aliases the new interface. If you implement a custom `Field`, `Widget`, or `Source`, consider implementing the matching `Contracts\*Interface` alongside extending the base class.

## Migrating your code

### Update `use` statements

```php
// Before:
use GV\View;
use GV\Entry;
use GV\GF_Entry;
use GV\Template_Context;

// After:
use GravityKit\GravityView\View\View;
use GravityKit\GravityView\Entry\Entry;
use GravityKit\GravityView\Entry\EntryGravityForms;
use GravityKit\GravityView\Template\TemplateContext;
```

### Update fully-qualified class references

```php
// Before:
$view  = \GV\View::by_id( $view_id );
$entry = \GV\GF_Entry::by_id( $entry_id );
$admin = new GravityView_Admin();

// After:
$view  = \GravityKit\GravityView\View\View::by_id( $view_id );
$entry = \GravityKit\GravityView\Entry\EntryGravityForms::by_id( $entry_id );
$admin = new \GravityKit\GravityView\Admin\Admin();
```

### Use `is_a()` or `instanceof`, not `get_class()` string comparisons

Legacy class names continue to work with type operators. Both old and new names resolve to the same object:

```php
// Both of these return true for the same object:
if ( $object instanceof \GV\View ) { /* ... */ }
if ( $object instanceof \GravityKit\GravityView\View\View ) { /* ... */ }

// Both of these return true:
if ( is_a( $object, 'GV\View' ) ) { /* ... */ }
if ( is_a( $object, 'GravityKit\GravityView\View\View' ) ) { /* ... */ }
```

:::warning `get_class()` returns the canonical name
`get_class()` returns the canonical (PSR-4) class name, not the alias. String equality against the old class name will **fail** in 3.0.

```php
// Breaks in 3.0 — get_class() returns 'GravityKit\GravityView\View\View':
if ( get_class( $object ) === 'GV\View' ) { /* ... */ }

// Use instead:
if ( is_a( $object, 'GV\View' ) ) { /* ... */ }
```

This is the single most common break in downstream integrations. Audit your codebase for `get_class(` and replace any string comparisons with `is_a()` or `instanceof`.
:::

The same applies to serialization keys, array lookups keyed by class name, and any reflective code that reads class strings. If you persist class names to storage (options, meta, cache), re-key them using `is_a()` lookups or store the alias explicitly.

### Update `extends` declarations

If you subclass GravityView template or renderer classes, update the parent:

```php
// Before:
class My_Custom_Table_Template extends \GV\View_Table_Template { /* ... */ }

// After:
use GravityKit\GravityView\Template\View\Table;

class My_Custom_Table_Template extends Table { /* ... */ }
```

## Template overrides

File-based template overrides are unchanged. The `GravityKit\GravityView\Template\LegacyOverride` class extends the Gamajo Template Loader and continues to resolve templates from both theme and plugin locations:

| Location | Purpose |
|---|---|
| `wp-content/themes/your-theme/gravityview/` | Theme-level overrides |
| `wp-content/plugins/your-plugin/templates/` | Plugin-level overrides |

Filenames and directory structure are identical to 2.x. If you copied `list-body.php`, `list-header.php`, `table-body.php`, `table-header.php`, `single-entry.php`, or any other partial into your theme, those files continue to render without modification.

The `gravityview_theme_template_directory` and `gravityview_plugin_template_directory` filters still fire during path resolution if you need to inject custom lookup directories.

## Deprecations and breaking changes

### Deprecated 1.x hooks

Over 40 legacy `gravityview_*` hooks were deprecated in 2.55 and continue to emit deprecation notices in 3.0. All deprecations are routed through the `GravityView_Deprecated_Hook_Notices` wrapper:

```php
$default_areas = \GravityView_Deprecated_Hook_Notices::apply_filters(
    'gravityview_widget_active_areas',
    [ $default_areas ],
    '2.55',                               // Deprecated since version
    'gravityview/widget/active_areas'     // Replacement hook
);
```

The wrapper calls WordPress's `apply_filters_deprecated()` / `do_action_deprecated()` under the hood. Internal GravityKit callbacks are suppressed from the PHP `trigger_error` so staging logs stay quiet when our own code is still wired to the legacy hook. External callbacks produce a deprecation notice and a Foundation-stored admin notice pointing to the offending file and line.

:::note Deprecation notices only surface with `WP_DEBUG`
Admin notices for deprecated hooks are only rendered when `WP_DEBUG` is enabled (or when the `gk/gravityview/deprecated-hook-notices/register` filter returns `true`). Production sites stay quiet.
:::

### Template and rendering hooks

| Deprecated (1.x, @since ≤2.x) | Replacement (2.0+) |
|---|---|
| `gravityview_before` | `gravityview/template/before` |
| `gravityview_header` | `gravityview/template/header` |
| `gravityview_footer` | `gravityview/template/footer` |
| `gravityview_after` | `gravityview/template/after` |
| `gravityview_field_output` | `gravityview/field_output/html` |
| `gravityview/field_output/args` | `gravityview/template/field_output/context` |
| `gravityview_entry_class` | `gravityview/template/{template}/entry/class` |
| `gravityview_default_args` | `gravityview/view/settings/defaults` |
| `gravityview_go_back_url` | `gravityview/template/links/back/url` |
| `gravityview_go_back_label` | `gravityview/template/links/back/label` |
| `gravityview_empty_value` | `gravityview/field/value/empty` |
| `gravitview_no_entries_text` (sic) | `gravityview/template/text/no_entries` |
| `gravityview_directory_link` | `gravityview/view/links/directory` |
| `gravityview/template/field_label` | `gravityview/template/field/label` |

### Table template hooks

| Deprecated | Replacement |
|---|---|
| `gravityview_table_cells` | `gravityview/template/table/fields` |
| `gravityview_table_cells_before` | `gravityview/template/table/cells/before` |
| `gravityview_table_cells_after` | `gravityview/template/table/cells/after` |
| `gravityview_table_body_before` | `gravityview/template/table/body/before` |
| `gravityview_table_body_after` | `gravityview/template/table/body/after` |
| `gravityview_table_tr_before` | `gravityview/template/table/tr/before` |
| `gravityview_table_tr_after` | `gravityview/template/table/tr/after` |

### List template hooks

| Deprecated | Replacement |
|---|---|
| `gravityview_list_body_before` | `gravityview/template/list/body/before` |
| `gravityview_list_body_after` | `gravityview/template/list/body/after` |
| `gravityview_list_entry_{zone}_before` | `gravityview/template/list/entry/{zone}/before` |
| `gravityview_list_entry_{zone}_after` | `gravityview/template/list/entry/{zone}/after` |

### Field and entry hooks

| Deprecated | Replacement |
|---|---|
| `gravityview_field_entry_link` | `gravityview/template/field/entry_link` |
| `gravityview_field_entry_value` | `gravityview/template/field/{type}/output` |
| `gravityview_field_entry_value_{type}` | `gravityview/template/field/{type}/output` |
| `gravityview_field_entry_value_{type}_pre_link` | `gravityview/template/field/{type}/output` |
| `gravityview_template_{field_type}_options` | `gk/gravityview/template/options` |
| `gravityview_template_{input_type}_options` | `gk/gravityview/template/options` |

### View, widget, and lifecycle hooks

| Deprecated | Replacement |
|---|---|
| `gravityview_direct_access` | `gravityview/view/output/direct` |
| `gravityview_widget_active_areas` | `gravityview/widget/active_areas` |
| `gravityview_register_directory_widgets` | `gravityview/widgets/register` |
| `gravityview_include_frontend_actions` | `gravityview/loaded` |
| `gravityview_view_entries` | `gravityview/view/entries` |
| `gravityview_before_get_entries` | `gravityview/view/entries` |
| `gravityview/configuration/fields` | `gravityview/view/configuration/fields` |
| `gravityview/data/parse/meta_keys` | `gravityview/view_collection/from_post/meta_keys` |
| `gravityview/widget/hide_until_searched/whitelist` | `gravityview/widget/hide_until_searched/allowlist` (since 2.14) |
| `gravityview/edit_entry/field_blacklist` | `gravityview/edit_entry/field_blocklist` (since 2.14) |
| `gravityview_blacklist_field_types` | `gravityview_blocklist_field_types` (since 2.14) |
| `gravityview/sortable/field_blacklist` | `gravityview/sortable/field_blocklist` (since 2.14) |

### Extension hooks

Delete Entry hooks were renamed to the `gk/` namespace in 2.55:

| Deprecated | Replacement |
|---|---|
| `gravityview/delete-entry/mode` | `gk/gravityview/delete-entry/mode` |
| `gravityview/delete-entry/deleted` | `gk/gravityview/delete-entry/deleted` |
| `gravityview/delete-entry/trashed` | `gk/gravityview/delete-entry/trashed` |
| `gravityview/delete-entry/delete-connected-post` | `gk/gravityview/delete-entry/delete-connected-post` |

### Search hooks (deprecated in 2.56)

See the Query Filters section above. These were deprecated when the Query Filters pipeline replaced the GF_Query-based search logic in 2.56 — they remain in the compatibility layer in 3.0.

### Removed files

- Legacy REST route shim files (`src/REST/class-gv-rest-route.php`, `src/REST/class-gv-rest-views-route.php`).
- Legacy `Admin` stubs; `gravityview_is_admin_page()` moved to `src/API/class-api.php`.

## New hooks in 3.0

The 3.0 release cycle added roughly 80 new `gk/gravityview/*` hooks. A non-exhaustive list of the most useful ones:

### Search and query

- `gk/gravityview/search/request/filters` — modify search filters before the query runs.
- `gk/gravityview/search/request/method` — change the search method (`any` vs `all`).
- `gk/gravityview/search/request/search-arguments` — modify parsed search arguments before processing.
- `gk/query-filters/condition/created-by/user-meta-fields` — extend `created_by` searches to custom user meta fields.
- `gk/query-filters/condition/created-by/user-fields` — extend `created_by` searches to custom user table columns.

### Template rendering

- `gk/gravityview/template/options` — field options filter; receives `$field_options`, `$template_id`, `$field_id`, `$context`, `$input_type`, `$form_id`.
- `gk/gravityview/admin-views/view/template/active-areas` — per-template active area definitions.
- `gk/gravityview/admin-views/row/before` and `row/after` — inject markup around View Editor rows.
- `gk/gravityview/admin-views/area/actions` and `rows-actions` — contribute actions to the View Editor UI.

### Entry management

- `gk/gravityview/delete-entry/mode`, `deleted`, `trashed`, `delete-connected-post`, `can-delete`, `show-delete-button` — full set of Delete Entry extension points.
- `gk/gravityview/edit-entry/init/data` — modify Edit Entry render data.
- `gk/gravityview/edit-entry/lock-granted-stale`, `lock-stale-threshold` — tune entry-lock behavior.
- `gk/gravityview/edit-entry/user-can-edit-field` — per-field edit permission.
- `gk/gravityview/entry-approval/choices` — extend approval status choices.
- `gk/gravityview/entry/approval-link/params` — modify approval-link query parameters.

### Compatibility and admin

- `gk/gravityview/compatibility/block-assets-on-demand` — toggle asset loading strategy.
- `gk/gravityview/admin/can_duplicate_field` — per-field duplication control.
- `gk/gravityview/deprecated-hook-notices/register` — force registration of deprecation notices.
- `gk/gravityview/deprecated-hook-notices/is-internal` — classify a callback as internal (suppresses notice).
- `gk/gravityview/feature/upgrade/disabled` — disable specific upgrade-gated features.

## Deprecation notices infrastructure

`GravityKit\GravityView\Deprecation\DeprecatedHookNotices` exposes three public static methods:

```php
DeprecatedHookNotices::apply_filters(
    string $hook,
    array $args,
    string $version,
    string $replacement = '',
    string $message = ''
);

DeprecatedHookNotices::do_action(
    string $hook,
    array $args,
    string $version,
    string $replacement = '',
    string $message = ''
);

DeprecatedHookNotices::deprecated_hook(
    string $hook,
    string $version,
    string $replacement = '',
    string $message = ''
);
```

If you maintain add-ons with their own deprecation wave, you can reuse this infrastructure — it's a candidate for migration to Foundation in the future so all GravityKit products share the same notice handling.

## Before you upgrade

Run through this checklist on a staging site before upgrading production:

1. **Confirm your WordPress version is 5.5 or newer.** If you're below that, upgrade WordPress first.
2. **Scan your codebase** for `use GV\` and `use GravityView_`; replace each with the PSR-4 equivalent.
3. **Replace `\GV\*` and bare `GravityView_*` references** in `new`, static calls, return types, and parameter types.
4. **Search for `get_class(`** and replace string comparisons against old class names with `is_a()` or `instanceof`.
5. **Search for `implements \GV\Collection_Position_Aware`** and update to `GravityKit\GravityView\Contracts\CollectionPositionAwareInterface`.
6. **Update `extends` declarations** on subclasses of GravityView template, renderer, or field classes.
7. **Review any code that persists class names to storage** (options, meta, cache). Migrate stored values if they must match `get_class()`.
8. **Check your `composer.json`** if your add-on depends on `gravitykit/foundation` or `gravitykit/query-filters` directly — GravityView ships its own prefixed copies under `vendor_prefixed/`.
9. **Remove any `require_once`** against files in `includes/` or `future/`. The directories are gone. Rely on the PSR-4 autoloader and alias autoloaders.
10. **Turn on `WP_DEBUG` and `WP_DEBUG_LOG`** in staging. Exercise your add-on's critical paths and review `debug.log` for deprecation notices.
11. **Run your existing test suite.** Because 3.0 is structural, most failures point to a missed rename rather than a logic regression.

## Troubleshooting common migration errors

### `Fatal error: Class 'GravityView_Foo' not found`

**Cause:** Either (a) the alias autoloader was not registered before the class was referenced, or (b) the class name doesn't map to anything in `src/Aliases/legacy-aliases.php`.

**Fix:**
- Verify `GRAVITYVIEW_DIR` was defined before `vendor/autoload.php` ran. If you bootstrap GravityView manually (e.g. in a test harness), let `gravityview.php` bootstrap normally, or define constants before autoload.
- Check `src/Aliases/legacy-aliases.php` and `src/Aliases/gv-aliases.php` for the mapping. If the class name truly isn't mapped, the class was either removed or renamed and not aliased — email [support@gravitykit.com](mailto:support@gravitykit.com) with the class name and caller.

### `PHP Warning: include(): Failed opening '.../includes/class-gravityview-*.php'`

**Cause:** An add-on or theme is trying to `require_once` a file that was moved to `src/` under a new name.

**Fix:** Remove the `require_once` and reference the class through the PSR-4 autoloader. If the file was a global-helper include, replace it with a call to the canonical helper in `src/Utils/helper-functions.php`.

### `if ( get_class( $view ) === '\GV\View' )` branches stop matching

**Cause:** `get_class()` returns the canonical PSR-4 name.

**Fix:** Replace with `if ( $view instanceof \GV\View )` or `if ( is_a( $view, 'GV\View' ) )`. Both the legacy and the canonical name resolve via the alias, so `is_a()` matches in either direction.

### Deprecation notices flooding `debug.log`

**Cause:** An active add-on still uses 1.x hooks deprecated in 2.55.

**Fix:** Audit the add-on against the replacement tables above and update to the 2.0+ replacement hooks. If the add-on is a third-party plugin you don't maintain, file an issue with the author — the replacement hooks have been available since 2.0 in most cases, and since 2.55 at the latest.

### Extending `GF_Query_Condition` subclasses for search

**Cause:** The search pipeline moved to Query Filters in 2.56. Your subclass never ran in production after that release.

**Fix:** Port the condition to a Query Filters condition class. `Created_By_Condition` in the Query Filters library is a reference.

### Child classes erroring during autoload

**Cause:** Rare, but possible if you instantiate a subclass of a legacy-aliased parent during early bootstrap.

**Fix:** The lazy autoloader resolves the child first, then the parent. If both are aliases, two autoloader passes run. This is expected and works — but make sure you're not calling it before step 5 of the bootstrap order (the alias includes). If you need classes earlier, include `src/Aliases/gv-aliases.php` and `src/Aliases/legacy-aliases.php` explicitly after defining `GRAVITYVIEW_DIR`.

## Known edge cases

- **Test bootstraps that load `vendor/autoload.php` before constants are defined** will still work. The alias files short-circuit when `GRAVITYVIEW_DIR` is not defined and are re-included by `gravityview.php` after constants are set.
- **Namespaced `use` statements that import from `\GV\*`.** PHP records the import at compile time but doesn't resolve the class until usage. First use triggers the alias autoloader, which creates the alias. Subsequent uses are cached.
- **Reflection.** `ReflectionClass::getName()` returns the canonical PSR-4 name. If you compare reflection output against legacy strings, normalize with `is_a()`.
- **Some legacy compatibility files remain** where deeper refactors are pending: `src/API/class-api.php` (global helper functions), `src/Utils/class-common.php` (`GVCommon` implementation), and `src/Widget/Search/class-search-widget.php`.

## Getting help

Email [support@gravitykit.com](mailto:support@gravitykit.com) with the class or hook name, the version of your add-on, the GravityView version, and a minimal reproduction. If you maintain a commercial extension, we'll help you plan the migration and coordinate release timing.

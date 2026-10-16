---
title: "Add your plugin's merge tags to the GravityKit merge tag picker"
sidebar_label: "Register your merge tags"
description: "For developers of Gravity Forms add-ons: describe your plugin's merge tags and modifiers in one PHP file, register it with the gk/foundation/merge-tags/products filter, and the GravityKit merge tag picker shows them with labels and real controls."
---

# Add your plugin's merge tags to the picker

GravityKit products include a merge tag picker. It shows each merge tag as a chip, and clicking a chip opens a panel with controls for its options and modifiers. Your plugin's tags can appear there too, with your labels and controls instead of raw text.

You need one PHP file that describes your tags and one filter that hands the file to the picker. Neither depends on GravityKit code. The filter only fires on sites running a GravityKit product, so on every other site your callback costs nothing.

If you do nothing, tags you add through `gform_custom_merge_tags` already appear in the picker, with their label only.

## 1. Write the definition

Create one file in your plugin, for example `merge-tags-definitions.php`, that returns an array. This example declares one tag with a choice of format and one modifier that takes a number:

```php
<?php
defined( 'ABSPATH' ) || defined( 'GK_MERGE_TAGS_SCHEMA_CLI' ) || exit;

return array(
	'schema_version'   => '1.6.0',
	'product'          => 'acme-orders', // your slug
	'version'          => defined( 'ACME_ORDERS_VERSION' ) ? ACME_ORDERS_VERSION : '0.0.0',
	'verified_against' => array( 'acme-orders' => '2.4.0', 'gravityforms' => '2.9.0' ),
	'tags'             => array(
		array(
			'id'       => 'order_status', // permanent
			'name'     => 'order_status',
			'syntax'   => '{order_status:FORMAT}',
			'label'    => __( 'Order status', 'acme-orders' ),
			'group'    => 'entry',
			'grammar'  => 'parameter',
			'shape'    => 'colon-optional',
			'inputs'   => array(
				array(
					'key'      => 'format',
					'bind'     => array( 'parameter' => 0 ), // first segment after the colon
					'type'     => 'enum',
					'label'    => __( 'Format', 'acme-orders' ),
					'required' => false,
					'options'  => array(
						array( 'value' => 'label', 'label' => __( 'Status label', 'acme-orders' ) ),
						array( 'value' => 'code', 'label' => __( 'Status code', 'acme-orders' ) ),
					),
				),
			),
			'contexts' => array( 'notification' ), // includes confirmations
		),
	),
	'modifiers'        => array(
		array(
			'id'         => 'shorten',
			'name'       => 'shorten',
			'label'      => __( 'Shorten to N characters', 'acme-orders' ),
			'kind'       => 'transform',
			'grammar'    => 'field',
			'inputs'     => array(
				array( 'key' => 'length', 'bind' => 'argument', 'type' => 'integer', 'minimum' => 1, 'label' => __( 'Characters', 'acme-orders' ) ),
			),
			'applies_to' => array( 'tags' => array( '*field*' ), 'field_types' => array( 'text', 'textarea' ) ),
		),
	),
);
```

Keep the file free of side effects. It should call `__()` and read constants, and nothing else in your plugin. Use your own text domain so the strings reach your own translation files.

`version` is your installed version. The picker uses it to show or hide entries that declare `requires` (for example `'requires' => array( 'acme-orders' => '>=2.5' )`). `verified_against` records the versions you checked the definition against.

### Tags

A tag needs `name`, `syntax`, `label`, `group`, `grammar`, and `shape`. `shape` says how the tag is written, and must be one of these:

| `shape` | Written as |
| --- | --- |
| `bare` | `{order_total}` |
| `colon-optional` | `{order_status}` or `{order_status:code}` |
| `colon-optional-trimmed` | as `colon-optional`, with spaces around the value ignored |
| `colon-required` | `{order_meta:key}` only |
| `options-comma` | `{order_items:sku,qty}` |
| `attributes` | `{order_link text="View" page="12"}` |
| `field` | the `{Label:ID}` form field tag |
| `entry-link`, `approval` | used by Gravity Forms' own tags |

A tag can also have `inputs`, `contexts`, a `modifiers` allow-list, `requires`, `entry_dependent`, and `example` (`array( 'in' => '…', 'out' => '…' )`).

### Modifiers

A modifier needs `name`, `label`, `kind`, `grammar`, and `applies_to`. `kind` is one of `parameter`, `representation`, `transform`, `flag`, or `context`. Write `name` in lowercase, because Gravity Forms lowercases the modifier string before your code sees it.

`applies_to` limits where the picker offers the modifier:

- `tags`: `"*"`, or a list of tag names. `*field*` means the `{Label:ID}` form field tag.
- `field_types`: `"*"`, or a list of Gravity Forms field types or input types.
- `contexts`: `"*"`, or a list from `editor`, `prepopulate`, `calculation`, `notification`, and `shortcode`.

Use `conflicts_with`, `implies`, `depends_on`, and `ignored_by` to say how your modifiers combine with others. Each takes catalog IDs such as `gravityforms/raw` or `acme-orders/shorten`. A bare name like `raw` is ambiguous: Gravity Forms declares one `raw` modifier and GravityView declares two more.

### Inputs

Use `inputs` to list every value a tag or modifier takes. Each input has a `key`, a `type`, and a `bind`:

| `bind` | Where the value goes | Example |
| --- | --- | --- |
| `"argument"` | after the modifier, one at most | `shorten:40` |
| `array( 'parameter' => 0 )` | the nth segment after the tag's colon, from 0 | `{order_status:code}` |
| `array( 'attribute' => 'text' )` | a `key="value"` pair, for the `attributes` shape | `{order_link text="View"}` |

`type` is one of `integer`, `string`, `php_date_format`, `enum`, `open_enum`, `field_ref`, or `form_ref`. Give tag inputs a `label`, since the panel shows it beside the control. A modifier with no value leaves `inputs` out.

### IDs are permanent

Every tag and modifier has an `id` made of lowercase letters, digits, `-`, and `_`. It defaults to `name` and must be unique within your definition. Other products refer to your entries by ID, and so do links to them. Once you release an ID, keep it: renaming one removes the old entry and adds a new one, and reusing one points existing links at a different tag.

## 2. Register it

```php
add_filter( 'gk/foundation/merge-tags/products', static function ( array $definitions ) {
	$definitions['acme-orders'] = require __DIR__ . '/merge-tags-definitions.php';

	return $definitions;
} );
```

Use the same slug as the key and as `product`. You can add the filter any time before the admin footer, because the picker builds its list of tags when it prints its data there.

Your definition replaces any definition GravityKit already ships under your slug. That is how you take over a definition we wrote for your plugin.

## 3. Check it

Turn on `WP_DEBUG` and open a screen with the picker, such as the GravityView editor. Every problem with your definition calls `_doing_it_wrong()` with the reason, and also fires an action you can assert on in your own tests:

| Action | Fires when |
| --- | --- |
| `gk/foundation/merge-tags/definition-rejected` | the whole definition is not an array or has no valid `product` |
| `gk/foundation/merge-tags/entry-rejected` | one tag or modifier is dropped; the rest still loads |
| `gk/foundation/merge-tags/collision` | another plugin already declared the same tag name, or a modifier on the same tag and scope; the first one registered keeps it |

An entry is dropped when it uses a value the picker has no control for, such as an unknown `shape`, `kind`, context, or input type. It is also dropped when two entries share an ID. Keys the picker does not recognize are ignored, so a definition written for a newer picker still loads in an older one.

## Syntax the picker does not support yet

The picker keeps these exactly as written and shows them as locked chips. It never offers them, so it cannot break them:

- Bracket arguments, such as `{Nested Form:1:index[0,2],format[text]}`
- Live merge tags that start with `@{`
- Tags nested inside another tag's template

Declare the tags and modifiers that use the standard forms, and leave these out.

## Sites that show your tags

Your tags appear on sites running a GravityKit product whose bundled merge tag picker is version 2.0.0 or newer. A site loads the newest copy any active GravityKit plugin bundles. On a site with an older copy, your filter is not read and your tags show with their label only, as they do now. Nothing breaks either way.

The picker appears in GravityKit products' editors. It does not add chips to Gravity Forms' own notification and confirmation editors.

The reference on this site lists the tags GravityKit has declared. To have your tags listed here as well, [contact us](https://www.gravitykit.com/support/).

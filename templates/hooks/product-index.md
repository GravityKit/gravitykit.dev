---
sidebar_position: 1
sidebar_label: "{{label}}"
title: {{label}} Developer Documentation
description: Developer documentation for {{label}} including hooks, actions, filters, and PHP API reference
---

# {{label}}

Developer documentation for {{label}}.

{{#hasApi}}
## PHP API Reference

[View API Reference](./api/) ({{classCount}} classes{{#hasFunctions}}, {{functionCount}} functions{{/hasFunctions}})

Documentation for PHP classes, methods, and functions available for developers.

{{/hasApi}}
{{#hasActions}}
## Actions

[View all Actions](./actions/) ({{actionCount}} hooks)

Actions allow you to run custom code at specific points during {{label}}'s execution.

{{/hasActions}}
{{#hasFilters}}
## Filters

[View all Filters](./filters/) ({{filterCount}} hooks)

Filters allow you to modify data as it passes through {{label}}.

{{/hasFilters}}

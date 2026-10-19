---
title: GravityKit Docs MCP server
description: Connect your AI coding assistant to the GravityKit developer docs. Install the MCP server in Claude, Cursor, VS Code, Codex, Gemini CLI or Windsurf, then look up hooks, PHP classes, CSS tokens and merge tags while you code.
---

# GravityKit Docs MCP server

Give your AI coding assistant the GravityKit developer docs. With the MCP server connected, it looks up the real hook, class, CSS token or merge tag before writing code, instead of guessing a name that does not exist.

```text
https://mcp.gravitykit.dev
```

It's free, read-only, and needs no account or API key. It covers everything on this site: actions and filters for every GravityKit product (plus Gravity Forms core), the PHP API, the version each hook was added in, GravityView CSS design tokens, and every merge tag and modifier.

## What is an MCP server?

MCP (Model Context Protocol) is a standard way to give an AI assistant extra tools. Once you add this server, your assistant can search these docs on its own while it works. You keep asking questions in plain words; the assistant decides when to look something up.

Without it, an assistant writes GravityKit code from memory. It often invents a filter name, or uses one that was added in a newer version than the site runs. Neither mistake shows an error: the code simply does nothing.

## Install

Pick your tool below. Each one takes under a minute.

### Claude Code

Run this in your terminal:

```bash
claude mcp add --transport http --scope user gravitykit-docs https://mcp.gravitykit.dev
```

`--scope user` makes it available in every project. To share it with your team through the repository instead, use `--scope project`, which writes a `.mcp.json` file you can commit:

```json title=".mcp.json"
{
  "mcpServers": {
    "gravitykit-docs": {
      "type": "http",
      "url": "https://mcp.gravitykit.dev"
    }
  }
}
```

Start `claude` and run `/mcp` to confirm `gravitykit-docs` shows as connected.

### Claude Desktop / claude.ai

1. Open **Settings → Connectors**.
2. Click **Add custom connector**.
3. Name it `GravityKit Docs` and paste `https://mcp.gravitykit.dev` as the URL.
4. Click **Add**. No sign-in is needed.

In a new chat, open the tools menu and make sure **GravityKit Docs** is turned on.

### Cursor

Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` in your project:

```json title="~/.cursor/mcp.json"
{
  "mcpServers": {
    "gravitykit-docs": {
      "url": "https://mcp.gravitykit.dev"
    }
  }
}
```

Then open **Cursor Settings → MCP** and check that `gravitykit-docs` has a green dot.

### VS Code

Add this to `.vscode/mcp.json` in your project:

```json title=".vscode/mcp.json"
{
  "servers": {
    "gravitykit-docs": {
      "type": "http",
      "url": "https://mcp.gravitykit.dev"
    }
  }
}
```

Click **Start** above the server name in the file, then use GitHub Copilot Chat in **Agent** mode.

### Codex

```bash
codex mcp add gravitykit-docs --url https://mcp.gravitykit.dev
```

This writes the server to `~/.codex/config.toml`:

```toml title="~/.codex/config.toml"
[mcp_servers.gravitykit-docs]
url = "https://mcp.gravitykit.dev"
```

Run `codex mcp list` to confirm it's enabled.

### Gemini CLI

```bash
gemini mcp add --transport http --scope user gravitykit-docs https://mcp.gravitykit.dev
```

Run `gemini mcp list` to confirm it's connected.

### Windsurf

Add this to `~/.codeium/windsurf/mcp_config.json`:

```json title="~/.codeium/windsurf/mcp_config.json"
{
  "mcpServers": {
    "gravitykit-docs": {
      "serverUrl": "https://mcp.gravitykit.dev"
    }
  }
}
```

Then refresh the MCP list in Cascade.

### Other tools

Any MCP client that supports the **Streamable HTTP** transport works. Use:

- **URL:** `https://mcp.gravitykit.dev`
- **Transport:** HTTP (Streamable HTTP)
- **Auth:** none

## Check that it works

Ask your assistant:

> Use the GravityKit docs to find the filter that changes how many entries a View shows per page.

It should call a GravityKit docs tool and answer with `gravityview_default_page_size`, added in GravityView 1.1.6, with a link to its page on this site. If it answers without calling a tool, say "use the gravitykit-docs MCP" in your question, or check the server shows as connected.

## Getting started

You don't need to learn the tools. Ask your question the way you would ask a coworker, and mention GravityKit or the product name so the assistant knows to look here.

Questions that work well:

- "Which GravityView hook lets me change the search query before entries load?"
- "Write a snippet that shows 50 entries per page in every View. Check the hook name in the GravityKit docs first."
- "What CSS variable controls the primary color in GravityView 3.0, and what's its default?"
- "What does the `:maxwords` merge tag modifier do, and which fields support it?"
- "Can I use `gravityview_default_page_size` on a site running GravityView 1.0?"
- "List every filter GravityCalendar has."

Tips:

- **Name the product.** "GravityEdit" or "GravityCharts" narrows the search and gives better answers.
- **Ask it to check before writing code.** "Look up the hook first" stops the assistant from writing from memory.
- **Give your version.** If your site runs an older release, say so. The server knows when each hook was added.
- **Ask for the link.** Every answer includes the URL of the page on this site, so you can read the full reference yourself.

## For experienced developers

### Tools

| Tool | Use it for | Example |
| --- | --- | --- |
| `search` | Fast exact or prefix match when you know roughly what something is called | `query: "gravityview_default_page"` |
| `semantic_search` | Questions in plain words; also searches guide pages | `query: "hook to alter the search query"` |
| `list` | Everything of one kind, with a total (search stops at 25) | `type: "filter", product: "gravitycalendar"` |
| `get_hook` | One hook: parameters, since-version, example, source file and line | `name: "gravityview_default_page_size"` |
| `get_api_symbol` | A PHP class, function or method; accepts `ClassName::method` | `name: "GravityKit\\GravityView\\View\\View", product: "gravityview"` |
| `get_compat` | When a hook or symbol was added, and whether a given version has it | `name: "gravityview_default_page_size", version: "1.0"` |
| `get_design_token` | A GravityView CSS token: default, controls, hover pairing | `name: "--gv-color-primary"` or `"color.primary"` |
| `get_merge_tag` | A merge tag's syntax, options, minimum versions and examples | `name: "{all_fields}"` |
| `get_merge_tag_modifier` | What a modifier does and which tags and fields take it | `name: "maxwords"` |
| `get_product` | A product's common hooks, conventions and counts | `product: "gravityview"` |

Most tools take an optional `product` (for example `gravityview`, `gravityedit`, `gravityforms`), and `search`, `semantic_search` and `list` take a `type`: `action`, `filter`, `class`, `function`, `method`, `css_token`, `merge_tag` or `modifier`.

### What a response looks like

`get_hook` with `name: "gravityview_default_page_size"` returns:

```text
# gravityview_default_page_size  (filter, gravityview)
Since: 1.1.6

The default number of entries displayed in a View.

Parameters:
  - default_page_size (int): Default: 25

Example:
add_filter( 'gravityview_default_page_size', function($default_page_size) {
    // Modify $default_page_size as needed
    return $default_page_size;
}, 10, 1 );

Source: src/Frontend/Frontend.php:1694
Docs: https://www.gravitykit.dev/docs/gravityview/filters/gravityview_default_page_size/
```

### Make your assistant use it every time

Assistants follow project instructions more reliably than one-off requests. Add a rule like this to your `AGENTS.md`, `CLAUDE.md`, `.cursor/rules` or Copilot instructions file:

```markdown
## GravityKit and Gravity Forms code

Before writing or changing code that calls a GravityKit or Gravity Forms hook,
class, function, CSS token or merge tag, look it up with the gravitykit-docs MCP
(`search` or `semantic_search`, then `get_hook` / `get_api_symbol`).
Check `get_compat` against the minimum plugin version this project supports.
Never write a hook name from memory.
```

### Version checks

`get_compat` answers "can I use this on version X?" before you ship. When the docs don't record a since-version for a symbol, it says so instead of guessing. Treat that as unknown, not as unavailable.

### Call it directly

The server speaks MCP over Streamable HTTP. To test it without an assistant, start a session and call a tool with `curl`:

```bash
# 1. Start a session and keep the session ID from the response headers.
curl -si https://mcp.gravitykit.dev \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  | grep -i '^mcp-session-id'

# 2. Call a tool with that session ID.
curl -s https://mcp.gravitykit.dev \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <session id>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_compat","arguments":{"name":"gravityview_default_page_size","version":"1.0"}}}'
```

For an interactive view of every tool and its input schema, run the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) with `npx @modelcontextprotocol/inspector` and connect to `https://mcp.gravitykit.dev`.

### Related

- **User docs, products and changelogs:** the GravityKit Content MCP at `https://mcp.gravitykit.com` covers gravitykit.com documentation, current versions, requirements and release notes. Add both servers when you need how-to answers as well as code references.
- **Plain-text reference:** [`llms.txt`](pathname:///llms.txt) lists every page on this site for tools that read files instead of using MCP.

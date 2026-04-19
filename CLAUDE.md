# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension (Manifest V3) that exports Confluence pages to Markdown, bundling images and macros into a `.zip` file. No build step, no npm, no dependencies — all files are plain JavaScript loaded directly by Chrome.

## Loading the Extension

In Chrome: go to `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the `artifact/` directory.

To reload after changes: click the refresh icon on the extension card in `chrome://extensions/`.

## Architecture

All distributable files live in `artifact/`:

- **`manifest.json`** — MV3 manifest; declares `activeTab`, `scripting`, `tabs` permissions and `<all_urls>` host permissions.
- **`background.js`** — Service worker; currently only logs installation. Exists as the MV3 required service worker entry point.
- **`popup.html` / `popup.css` / `popup.js`** — Extension popup. On open it injects `content.js` into the active tab, sends a `ping` message to detect if the page is Confluence, then on button click sends an `export` message with user-selected options.
- **`content.js`** — Injected into the active tab. Contains two classes and the message listener:
  - `SimpleZip` — Pure-JS ZIP builder (no compression, stored mode) using raw byte manipulation and CRC-32. No external libs.
  - `CF2MD` — Recursive HTML-to-Markdown converter. Walks the DOM via `nodeToMd`/`elToMd`, handles headings, lists, tables, inline formatting, images (with `fetch`+`credentials:'include'` for Confluence auth), and Confluence-specific macros (Gliffy, draw.io, info/warning/tip/note panels, expand, panel, Jira issues, status, TOC, column layouts).
  - Message listener handles `ping` (Confluence detection) and `export` (runs `CF2MD.convert()` then packages result into a ZIP and triggers browser download).

## Key Behaviors

- **Double-injection guard**: `content.js` wraps everything in `if (!window.__cf2md_v1)` to prevent re-running if injected multiple times.
- **Image deduplication**: `CF2MD._fetchCache` maps URL → filename so the same image is only downloaded once per export.
- **Confluence selector fallbacks**: Both `getTitle()` and `getContentEl()` try multiple CSS selectors to support Confluence Server, Data Center, and Cloud DOM layouts.
- **Lazy images**: `handleImg` checks `data-src`, `data-lazy-src`, `data-original`, `data-full-size-src` in addition to `src`.
- **Macro detection**: `handleDiv` dispatches on both `data-macro-name` attribute and CSS class name patterns.

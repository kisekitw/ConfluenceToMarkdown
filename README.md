# Confluence to Markdown Exporter

A Chrome extension (Manifest V3) that exports Confluence pages to Markdown and pushes edited Markdown back to Confluence — no plugins required, no build step, no external dependencies.

## Features

### Export (Confluence → Markdown)
- Converts Confluence pages to clean Markdown
- Downloads images and attachments (lazy-loaded images supported)
- Captures diagrams: Gliffy (PNG via Confluence attachment API, with full SVG sanitisation fallback), draw.io
- Converts panels, info/warning/note/tip callouts, expand macros
- Converts Jira issue tables
- Includes optional metadata header (source URL, export date)
- Works with Confluence Server, Data Center, and Cloud

### Push back (Markdown → Confluence)
- Pushes a modified `.md` or `.zip` file back to the original Confluence page
- Converts Markdown to Confluence Storage Format (XHTML) automatically
- Re-uploads changed images as page attachments
- Uses your existing browser session — no API token required
- Handles version conflicts with automatic retry
- Supports Confluence Server and Data Center (REST API v1)

## Installation

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `artifact/` folder in this repository

To reload after making changes, click the refresh icon on the extension card.

## Usage

### Export to Markdown

1. Navigate to any Confluence page
2. Click the extension icon
3. Select your export options:
   - **Include metadata header** — prepends source URL and export date
   - **Download images & attachments** — fetches and bundles all images
   - **Capture macros (Gliffy, draw.io)** — captures diagram images
   - **Convert Jira issue tables** — renders Jira macro tables as Markdown
4. Click **Export to Markdown (.zip)**

The downloaded `.zip` contains:
```
<page-title>.md       ← Markdown file
images/               ← All referenced images
```

### Push back to Confluence

1. Edit the exported `.md` file (e.g. with GitHub Copilot or any editor)
2. Navigate to the **same Confluence page** in your browser
3. Click the extension icon
4. Click **Push to Confluence** and select your file:
   - **Text changes only** → select the `.md` file directly
   - **Images also changed** → re-zip the `.md` + `images/` folder and select the `.zip`
5. The page is updated immediately — no login prompt needed

> **Note:** Push to Confluence requires an active Confluence session in the browser. The extension uses your existing login cookies and never stores credentials.

## Development

### Run tests

```bash
npm install
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage report

```bash
npm run test:coverage
```

### Test suite

| Suite | Tests | Coverage |
|-------|-------|----------|
| `SimpleZip.test.js` | ZIP builder (add, build, CRC-32) | `SimpleZip` class |
| `CF2MD.test.js` | HTML→Markdown converter | `CF2MD` class |
| `listener.test.js` | Chrome message listener | ping/export/busy guard |

## Project Structure

```
artifact/          ← Chrome extension (load this folder as unpacked)
  manifest.json
  content.js       ← CF2MD (export) + MD2CF (push) + SimpleZip + message handler
  popup.html/css/js
  background.js
  icons/
tests/             ← Jest test suite
  setup.js
  CF2MD.test.js
  SimpleZip.test.js
  listener.test.js
```

## Changelog

### v1.2.2
- Improved Gliffy diagram export: fetches PNG directly from the Confluence attachment API (`/download/attachments/{pageId}/{name}.png`) to avoid canvas cross-origin taint errors
- Diagram name resolved from data attributes, macro parameters, or title text; page ID sourced from the `<meta name="ajs-page-id">` tag
- SVG→canvas fallback now resolves all relative/absolute URLs to data URIs before rendering, correctly skips XML namespace declarations, and preserves local `url(#…)` CSS fragment references
- Improved lazy-loaded image detection in Gliffy containers (`data-src`, `data-lazy-src`, etc.)
- Added 9 unit tests for `handleGliffy()`

### v1.2.1
- Fixed ZIP parsing for files compressed with Deflate (Windows zip tool compatibility)
- Fixed NULL character in generated Confluence Storage Format XML

### v1.2.0
- Added **Push to Confluence** feature (Markdown → Confluence Storage Format via REST API)
- New `MD2CF` converter: supports headings, paragraphs, bold/italic, code blocks, tables, lists, blockquotes, images
- New `SimpleZipReader` for parsing exported ZIP files
- Automatic image re-upload as page attachments
- Version conflict auto-retry on push

### v1.1.0
- Initial public release with Export to Markdown

## License

MIT

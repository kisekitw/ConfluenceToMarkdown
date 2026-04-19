# Confluence to Markdown Exporter

A Chrome extension (Manifest V3) that exports Confluence pages to Markdown, bundling all images and macro diagrams into a single `.zip` file.

## Features

- Converts Confluence pages to clean Markdown
- Downloads images and attachments (lazy-loaded images supported)
- Captures diagrams: Gliffy, draw.io (rendered images and SVG fallback)
- Converts panels, info/warning/note/tip callouts, expand macros
- Converts Jira issue tables
- Includes optional metadata header (source URL, export date)
- Works with Confluence Server, Data Center, and Cloud

## Installation

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `artifact/` folder in this repository

To reload after making changes, click the refresh icon on the extension card.

## Usage

1. Navigate to any Confluence page
2. Click the extension icon
3. Select your export options:
   - **Download images & attachments** — fetches and bundles all images
   - **Capture macros (Gliffy, draw.io)** — captures diagram images
   - **Include metadata header** — prepends source URL and export date
   - **Convert Jira issue tables** — renders Jira macro tables as Markdown
4. Click **Export to Markdown (.zip)**

The downloaded `.zip` contains:
```
<page-title>.md       ← Markdown file
images/               ← All referenced images
```

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
  content.js       ← Core logic: CF2MD converter + SimpleZip builder
  popup.html/css/js
  background.js
  icons/
tests/             ← Jest test suite
  setup.js
  CF2MD.test.js
  SimpleZip.test.js
  listener.test.js
```

## License

MIT

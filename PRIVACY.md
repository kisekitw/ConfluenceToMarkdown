# Privacy Policy — Confluence to Markdown Exporter

_Last updated: April 19, 2026_

## Overview

Confluence to Markdown Exporter is a Chrome extension that converts Confluence wiki pages into Markdown files for local download. **This extension does not collect, transmit, or store any personal data.**

## Data Collection

We do not collect any of the following:

- Personal identifiers (name, email, IP address, etc.)
- Browsing history or activity
- Page content beyond what is needed to generate the export
- Authentication credentials or session tokens

## How the Extension Works

All processing happens **entirely within your local browser**:

1. When you click "Export", the extension reads the current Confluence page's DOM structure.
2. Images embedded in the page are fetched using your existing browser session (the same credentials your browser already has) and held temporarily in memory.
3. The content is packaged into a `.zip` file and downloaded directly to your device.
4. Nothing is sent to any external server operated by this extension.

## Third-Party Services

This extension does not communicate with any third-party servers. The only network requests made are to your own Confluence instance (to fetch images and attachments), using your existing authenticated session.

## Changes to This Policy

If this policy changes in the future, the updated version will be published at this URL with a revised "Last updated" date.

## Contact

If you have any questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/kisekitw/confluence-to-markdown-extension).

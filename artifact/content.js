// content.js — Confluence to Markdown  v1.1
// Guard against double-injection
if (!window.__cf2md_v1) {
  window.__cf2md_v1 = true;

/* =============================================================
 * 1.  SIMPLE ZIP (no external deps, stored / no compression)
 * ============================================================ */
class SimpleZip {
  constructor() { this.entries = []; this._tbl = null; }

  add(name, data) {
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    else if (!(data instanceof Uint8Array)) data = new Uint8Array(data.buffer ?? data);
    this.entries.push({ name, data });
  }

  build() {
    const lhParts = [], cdParts = [];
    let offset = 0;

    for (const { name, data } of this.entries) {
      const nb  = new TextEncoder().encode(name);
      const crc = this._crc(data);
      const sz  = data.length;

      const lh = new Uint8Array(30 + nb.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32( 0, 0x04034b50, true);
      lv.setUint16( 4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
      lv.setUint16(10,  0, true); lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, sz, true); lv.setUint32(22, sz, true);
      lv.setUint16(26, nb.length, true); lv.setUint16(28, 0, true);
      lh.set(nb, 30);

      const cd = new Uint8Array(46 + nb.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32( 0, 0x02014b50, true);
      cv.setUint16( 4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true);
      cv.setUint16(10,  0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, sz, true); cv.setUint32(24, sz, true);
      cv.setUint16(28, nb.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34,  0, true); cv.setUint16(36, 0, true);
      cv.setUint32(38,  0, true); cv.setUint32(42, offset, true);
      cd.set(nb, 46);

      lhParts.push(lh, data);
      cdParts.push(cd);
      offset += lh.length + sz;
    }

    const cdStart = offset;
    let   cdSize  = cdParts.reduce((s, p) => s + p.length, 0);

    const eocd = new Uint8Array(22);
    const ev   = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.entries.length, true); ev.setUint16(10, this.entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, cdStart, true);

    const all   = [...lhParts, ...cdParts, eocd];
    const total = all.reduce((s, p) => s + p.length, 0);
    const out   = new Uint8Array(total);
    let pos = 0;
    for (const p of all) { out.set(p, pos); pos += p.length; }

    return new Blob([out], { type: 'application/zip' });
  }

  _crc(data) {
    if (!this._tbl) {
      this._tbl = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        this._tbl[i] = c;
      }
    }
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = (crc >>> 8) ^ this._tbl[(crc ^ b) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

/* =============================================================
 * 2.  HTML → MARKDOWN CONVERTER
 * ============================================================ */
class CF2MD {
  constructor(opts = {}) {
    this.opts = { includeImages: true, includeMacros: true,
                  includeMetadata: true, includeJira: true, ...opts };
    this.images = new Map();   // filename → Uint8Array
    this.imgIdx = 0;
    this._fetchCache = new Map();  // url → filename (avoid duplicate downloads)
  }

  /* ── Entry ───────────────────────────────────── */
  async convert() {
    const title   = this.getTitle();
    const content = this.getContentEl();
    const body    = await this.elToMd(content);

    let md = `# ${title}\n\n`;
    if (this.opts.includeMetadata) {
      md += `> **Source:** ${location.href}  \n`;
      md += `> **Exported:** ${new Date().toLocaleString()}  \n\n`;
      md += `---\n\n`;
    }
    md += body;
    md  = md.replace(/\n{4,}/g, '\n\n\n');
    return { title, markdown: md, images: this.images };
  }

  /* ── Page title ──────────────────────────────── */
  getTitle() {
    for (const s of ['#title-text a','#title-text','[data-testid="page-title"]',
                      'h1#title-heading','h1.pagetitle']) {
      const el = document.querySelector(s);
      if (el?.textContent.trim()) return el.textContent.trim();
    }
    return document.title.replace(/\s*[-|–]\s*Confluence.*/i, '').trim() || 'Untitled';
  }

  /* ── Content area ────────────────────────────── */
  getContentEl() {
    for (const s of ['.ak-renderer-document',
                     '#main-content .wiki-content', '#content .wiki-content',
                     '.wiki-content', '#main-content', 'main[role="main"]', '#content']) {
      const el = document.querySelector(s);
      if (el?.textContent.trim().length > 20) return el;
    }
    return document.body;
  }

  /* ── Recursive element → markdown ───────────── */
  async elToMd(el, ctx = {}) {
    if (!el) return '';
    let out = '';
    for (const n of el.childNodes) out += await this.nodeToMd(n, ctx);
    return out;
  }

  /* ── Single node ─────────────────────────────── */
  async nodeToMd(node, ctx = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      let t = node.textContent;
      if (!ctx.inPre) t = t.replace(/[\r\n]+/g, ' ');
      return t;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el  = node;
    const tag = el.tagName.toLowerCase();

    // Always-skip tags
    if (/^(script|style|noscript|head|meta|link|template)$/.test(tag)) return '';
    // Confluence UI chrome to skip
    if (el.id && /^(breadcrumbs|navigation|page-metadata|footer|header-precursor)$/.test(el.id)) return '';
    if (el.getAttribute('role') === 'navigation') return '';
    if (el.classList.contains('aui-toolbar2') || el.classList.contains('page-metadata')) return '';

    // Visibility
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    } catch (_) {}

    const kids = (c = {}) => this.elToMd(el, { ...ctx, ...c });

    switch (tag) {
      case 'h1': return `\n# ${(await kids()).trim()}\n\n`;
      case 'h2': return `\n## ${(await kids()).trim()}\n\n`;
      case 'h3': return `\n### ${(await kids()).trim()}\n\n`;
      case 'h4': return `\n#### ${(await kids()).trim()}\n\n`;
      case 'h5': return `\n##### ${(await kids()).trim()}\n\n`;
      case 'h6': return `\n###### ${(await kids()).trim()}\n\n`;

      case 'p': {
        const t = (await kids()).trim();
        return t ? `${t}\n\n` : '\n';
      }
      case 'br': return ctx.inTable ? '<br>' : '\n';
      case 'hr': return '\n---\n\n';

      case 'strong': case 'b': { const t=(await kids()).trim(); return t?`**${t}**`:''; }
      case 'em':    case 'i': { const t=(await kids()).trim(); return t?`*${t}*`:''; }
      case 'del':   case 's': case 'strike': { const t=(await kids()).trim(); return t?`~~${t}~~`:''; }
      case 'u':   return `<u>${await kids()}</u>`;
      case 'sup': return `<sup>${await kids()}</sup>`;
      case 'sub': return `<sub>${await kids()}</sub>`;
      case 'kbd': return `\`${el.textContent}\``;

      case 'a': {
        const href = el.getAttribute('href') || '';
        const text = (await kids()).trim();
        if (!text) return '';
        if (!href || href === '#') return text;
        return `[${text}](${this.abs(href)})`;
      }

      case 'img':    return await this.handleImg(el, ctx);
      case 'code':   return ctx.inPre ? el.textContent : `\`${el.textContent.replace(/`/g,"'")}\``;
      case 'pre':    return await this.handlePre(el);
      case 'blockquote': {
        const t = (await kids()).trim();
        return `\n> ${t.replace(/\n/g,'\n> ')}\n\n`;
      }

      case 'ul': return await this.handleList(el, false, ctx.listDepth||0);
      case 'ol': return await this.handleList(el, true,  ctx.listDepth||0);
      case 'li': return await kids({ inList: true });

      case 'table': return await this.handleTable(el);

      case 'details': {
        const sum = el.querySelector(':scope > summary');
        const title = sum?.textContent.trim() || 'Details';
        const clone = el.cloneNode(true);
        clone.querySelector('summary')?.remove();
        const inner = await this.elToMd(clone);
        return `\n<details>\n<summary>${title}</summary>\n\n${inner.trim()}\n</details>\n\n`;
      }
      case 'summary': return '';

      case 'figure': {
        const img = el.querySelector('img');
        const cap = el.querySelector('figcaption');
        let r = img ? await this.handleImg(img, ctx) : '';
        if (cap) r += `\n*${cap.textContent.trim()}*\n`;
        return r;
      }
      case 'figcaption': return `*${el.textContent.trim()}*`;

      case 'div': case 'section': case 'article':
        return await this.handleDiv(el, kids, ctx);

      case 'span': return await this.handleSpan(el, kids);

      // Layout wrappers — pass through
      case 'main': case 'aside': case 'nav': case 'header': case 'footer':
        return tag === 'main' ? await kids() : '';

      default: return await kids();
    }
  }

  /* ── Images ───────────────────────────────────── */
  async handleImg(el, ctx = {}) {
    if (!this.opts.includeImages) return '';

    // Support lazy-loaded images (Confluence Cloud & Server)
    const src =
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-lazy-src') ||
      el.getAttribute('data-original') ||
      el.getAttribute('data-full-size-src') ||
      '';

    if (!src) return '';

    // Skip tiny placeholder/spacer images (lazy-load 1×1 GIFs, etc.)
    if (src.startsWith('data:') && src.length < 600) return '';

    // Skip invisible spacer images
    const w = parseInt(el.getAttribute('width') || '0');
    const h = parseInt(el.getAttribute('height') || '0');
    if ((w > 0 && w < 5) || (h > 0 && h < 5)) return '';

    // Skip Confluence emoticons / status icons
    if (el.classList.contains('emoticon') ||
        el.classList.contains('confluence-emoticon') ||
        (el.getAttribute('alt') || '').startsWith(':')) return '';

    const alt  = el.getAttribute('alt') || el.getAttribute('title') || '';
    const hint = (alt || 'img').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 28);

    try {
      const fname = await this.fetchImg(src, hint);
      return ctx.inTable
        ? `![${alt}](images/${fname})`
        : `\n![${alt}](images/${fname})\n`;
    } catch (e) {
      // Fallback: embed absolute URL (works if viewer has network access)
      const absUrl = this.abs(src);
      return ctx.inTable ? `![${alt}](${absUrl})` : `\n![${alt}](${absUrl})\n`;
    }
  }

  async fetchImg(src, hint = 'img') {
    const url = src.startsWith('data:') ? src : this.abs(src);
    if (!url || url === location.href) throw new Error('invalid url');

    // De-duplicate: same URL reuses same file
    if (this._fetchCache.has(url)) return this._fetchCache.get(url);

    let resp;
    try {
      // Same-origin fetch with cookies — works for Confluence attachments
      resp = await fetch(url, { credentials: 'include' });
    } catch (_) {
      // CORS block? Retry without explicit mode (omit credentials for CDN)
      resp = await fetch(url, { credentials: 'omit' });
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const ext  = this._mime2ext(blob.type) || this._extFromUrl(src) || 'png';
    const fname = `${hint}_${++this.imgIdx}.${ext}`;

    this.images.set(fname, new Uint8Array(await blob.arrayBuffer()));
    this._fetchCache.set(url, fname);
    return fname;
  }

  _mime2ext(m) {
    return { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png',
             'image/gif':'gif','image/webp':'webp',
             'image/svg+xml':'svg','image/bmp':'bmp' }[m] || null;
  }

  _extFromUrl(url) {
    try {
      const p = new URL(url, location.href).pathname;
      const ext = p.split('.').pop().split('?')[0].toLowerCase();
      return /^(png|jpg|jpeg|gif|webp|svg|bmp)$/.test(ext) ? ext : null;
    } catch (_) { return null; }
  }

  abs(url) {
    if (!url) return '';
    if (/^(https?:|\/\/|data:)/.test(url)) return url;
    try { return new URL(url, location.href).href; } catch(_) { return url; }
  }

  /* ── Pre / code blocks ─────────────────────── */
  async handlePre(el) {
    let lang = el.getAttribute('data-language') || el.getAttribute('data-lang') || '';
    if (!lang) { const m = el.className.match(/brush:\s*(\w+)/); if (m) lang = m[1]; }
    if (!lang) { const m = el.className.match(/language-(\w+)/); if (m) lang = m[1]; }
    const code = (el.querySelector('code') || el).textContent;
    return `\n\`\`\`${lang}\n${code.replace(/^\n|\n$/g,'')}\n\`\`\`\n\n`;
  }

  /* ── Lists ────────────────────────────────── */
  async handleList(el, ordered, depth) {
    const indent = '  '.repeat(depth);
    const lines  = [];
    let   idx    = 1;

    for (const li of el.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const bullet = ordered ? `${idx++}.` : '-';
      let text = '', nested = '';

      for (const child of li.childNodes) {
        const t = child.tagName?.toLowerCase();
        if (t === 'ul' || t === 'ol') {
          nested += await this.handleList(child, t === 'ol', depth + 1);
        } else {
          text += await this.nodeToMd(child, { inList: true, listDepth: depth });
        }
      }
      const clean = text.trim().replace(/\n+/g, ' ');
      if (clean || nested) {
        lines.push(`${indent}${bullet} ${clean}`);
        if (nested) lines.push(nested.trimEnd());
      }
    }
    return lines.join('\n') + '\n\n';
  }

  /* ── Tables ───────────────────────────────── */
  async handleTable(el) {
    const rows = Array.from(el.querySelectorAll(
      ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'
    ));
    if (!rows.length) return '';

    const grid = [];
    let sepDone = false;

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
      const isHdr = cells.some(c => c.tagName.toLowerCase() === 'th');
      const texts = await Promise.all(cells.map(async td => {
        const t = await this.elToMd(td, { inTable: true });
        return t.trim().replace(/\|/g,'\\|').replace(/[\r\n]+/g,'<br>').replace(/\s+/g,' ');
      }));
      grid.push({ texts, isHdr });
    }

    let md = '\n';
    for (const row of grid) {
      md += `| ${row.texts.join(' | ')} |\n`;
      if (!sepDone && (row.isHdr || grid.indexOf(row) === 0)) {
        md += `| ${row.texts.map(() => ':---').join(' | ')} |\n`;
        sepDone = true;
      }
    }
    return md + '\n';
  }

  /* ── Div / macro dispatcher ───────────────── */
  async handleDiv(el, kids, ctx) {
    const cls   = [...el.classList];
    const macro = el.getAttribute('data-macro-name') || '';

    // ── Gliffy ──
    if (cls.some(c => c.includes('gliffy')) || macro === 'gliffy') {
      return this.opts.includeMacros
        ? await this.handleGliffy(el)
        : '*[Gliffy diagram omitted]*\n\n';
    }
    // ── draw.io ──
    if (cls.some(c => c.includes('drawio') || c.includes('draw-io')) || macro === 'drawio') {
      return this.opts.includeMacros
        ? await this.handleDrawio(el)
        : '*[draw.io diagram omitted]*\n\n';
    }
    // ── Info macros ──
    if (cls.some(c => c.includes('confluence-information-macro'))) {
      const t = macro || cls.find(c =>
        ['warning','tip','note','info','success'].some(x => c.includes(x))) || 'info';
      return await this.handleInfoMacro(el, t);
    }
    if (['warning','note','tip','info','success'].includes(macro)) {
      return await this.handleInfoMacro(el, macro);
    }
    // ── Code macro ──
    if (macro === 'code' || cls.some(c => ['code-macro','codeContent','syntaxhighlighter'].includes(c))) {
      const pre = el.querySelector('pre');
      if (pre) return await this.handlePre(pre);
    }
    // ── Expand ──
    if (macro === 'expand' || cls.some(c => c.includes('expand-macro') || c.includes('expand-container'))) {
      const titleEl = el.querySelector('.expand-control-text,.expand-title,.expand-control span');
      const title   = titleEl?.textContent.trim() || 'Expand';
      const bodyEl  = el.querySelector('.expand-content,.expand-body,.conf-macro-body');
      const content = bodyEl ? await this.elToMd(bodyEl) : await kids();
      return `\n<details>\n<summary>${title}</summary>\n\n${content.trim()}\n</details>\n\n`;
    }
    // ── Panel ──
    if (macro === 'panel' || cls.some(c => c === 'panel' || c.includes('panelMacro'))) {
      const hdr  = el.querySelector('.panelHeader,.panel-header');
      const body = el.querySelector('.panelContent,.panel-content,.panel-body,.conf-macro-body');
      const title = hdr?.textContent.trim() || '';
      const md    = body ? await this.elToMd(body) : await kids();
      return title ? `\n**${title}**\n\n${md.trim()}\n\n` : `\n${md.trim()}\n\n`;
    }
    // ── Jira issues ──
    if (this.opts.includeJira &&
        (macro === 'jira' || cls.some(c => c.includes('jira-issues') || c.includes('jira-table')))) {
      const table = el.querySelector('table');
      if (table) return await this.handleTable(table);
    }
    // ── TOC ──
    if (macro === 'toc' || cls.some(c => c.includes('toc-macro'))) return '*[Table of Contents]*\n\n';
    // ── Status ──
    if (macro === 'status' || cls.some(c => c.includes('status-macro'))) return `\`${el.textContent.trim()}\``;
    // ── Column layout ──
    if (cls.some(c => c.includes('columnLayout') || c.includes('innerCell') || c.includes('sectionMacro'))) {
      const t = await kids();
      return t.endsWith('\n\n') ? t : t + '\n';
    }
    // ── Generic ──
    return await kids();
  }

  /* ── Span ─────────────────────────────────── */
  async handleSpan(el, kids) {
    const cls = [...el.classList];
    if (cls.some(c => c.includes('aui-lozenge') || c.includes('status-macro') || c.includes('label-')))
      return `\`${el.textContent.trim()}\``;
    if (cls.some(c => c.includes('inline-code') || c.includes('code')))
      return `\`${el.textContent}\``;
    if (cls.some(c => c.includes('confluence-userlink') || c.includes('user-mention')))
      return `@${el.textContent.trim()}`;
    return await kids();
  }

  /* ── Gliffy ───────────────────────────────── */
  async handleGliffy(el) {
    const title = el.querySelector('[class*="title"]')?.textContent.trim() || 'Gliffy Diagram';

    // 1. Rendered <img>
    for (const img of el.querySelectorAll('img[src]')) {
      if (!img.src || img.src.startsWith('data:') && img.src.length < 600) continue;
      try {
        const fname = await this.fetchImg(img.src, 'gliffy');
        return `\n![${title}](images/${fname})\n\n`;
      } catch (_) {}
      return `\n![${title}](${this.abs(img.src)})\n\n`;
    }
    // 2. Canvas
    const canvas = el.querySelector('canvas');
    if (canvas) {
      try {
        const fname = await this.fetchImg(canvas.toDataURL('image/png'), 'gliffy');
        return `\n![${title}](images/${fname})\n\n`;
      } catch (_) {}
    }
    // 3. SVG
    const svg = el.querySelector('svg');
    if (svg) {
      const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
      const fname = `gliffy_${++this.imgIdx}.svg`;
      this.images.set(fname, bytes);
      return `\n![${title}](images/${fname})\n\n`;
    }
    return `\n> *[${title} — Gliffy not rendered]*\n\n`;
  }

  /* ── draw.io ──────────────────────────────── */
  async handleDrawio(el) {
    const img = el.querySelector('img[src]');
    if (img?.src) {
      try {
        const fname = await this.fetchImg(img.src, 'drawio');
        return `\n![Diagram](images/${fname})\n\n`;
      } catch (_) {}
      return `\n![Diagram](${this.abs(img.src)})\n\n`;
    }
    return '\n> *[draw.io diagram — not rendered]*\n\n';
  }

  /* ── Info/Note/Warning/Tip ────────────────── */
  async handleInfoMacro(el, type = 'info') {
    const cls = [...el.classList].join(' ');
    const resolved = type.includes('warning') ? 'warning'
      : type.includes('tip')     ? 'tip'
      : type.includes('note')    ? 'note'
      : type.includes('success') ? 'success' : 'info';

    const label = { warning:'> ⚠️ **Warning**', tip:'> 💡 **Tip**',
                    note:'> 📝 **Note**', success:'> ✅ **Success**',
                    info:'> ℹ️ **Info**' }[resolved] || '> ℹ️ **Info**';

    const bodyEl = el.querySelector(
      '.confluence-information-macro-body,.message-content,.macro-body,.aui-message');
    const body = bodyEl ? await this.elToMd(bodyEl) : el.textContent.trim();
    return `\n${label}  \n> ${body.trim().replace(/\n/g,'\n> ')}\n\n`;
  }
}

/* =============================================================
 * 3.  MESSAGE LISTENER
 * ============================================================ */
let _busy = false;

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.action === 'ping') {
    reply({ ok: true, isConfluence: _isConfluence(), title: _pageTitle() });
    return false;
  }
  if (msg.action === 'export') {
    if (_busy) { reply({ success: false, error: 'Export already running' }); return false; }
    _busy = true;
    _doExport(msg.options || {})
      .then(r  => reply({ success: true, ...r }))
      .catch(e => reply({ success: false, error: e.message }))
      .finally(() => { _busy = false; });
    return true;
  }
});

function _isConfluence() {
  return !!(
    document.querySelector('.wiki-content,.ak-renderer-document') ||
    document.querySelector('meta[name="confluence-page-id"]') ||
    /\/(wiki|display|pages|spaces)\//i.test(location.pathname)
  );
}
function _pageTitle() {
  return document.querySelector('#title-text a,#title-text,[data-testid="page-title"]')
    ?.textContent.trim() || '';
}

async function _doExport(options) {
  const cv = new CF2MD(options);
  const { title, markdown, images } = await cv.convert();

  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().substring(0,100)
               || 'confluence-export';

  const zip = new SimpleZip();
  zip.add(`${safe}.md`, markdown);
  for (const [name, data] of images) zip.add(`images/${name}`, data);

  const blob = zip.build();
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),
    { href: url, download: `${safe}.zip`, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { title, filename: `${safe}.zip`,
           imageCount: images.size, mdLines: markdown.split('\n').length };
}

  if (typeof module !== 'undefined') module.exports = { SimpleZip, CF2MD };
} // end guard

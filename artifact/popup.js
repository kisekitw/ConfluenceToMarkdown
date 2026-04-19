// popup.js

class SimpleZipReader {
  async parse(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view  = new DataView(arrayBuffer);
    const result = {};

    const eocdOffset = bytes.length - 22;
    if (view.getUint32(eocdOffset, true) !== 0x06054b50)
      throw new Error('Not a valid ZIP file');

    const entryCount = view.getUint16(eocdOffset + 8,  true);
    const cdOffset   = view.getUint32(eocdOffset + 16, true);

    let pos = cdOffset;
    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50)
        throw new Error('Invalid central directory entry');

      const comprMethod  = view.getUint16(pos + 10, true);
      const compSize     = view.getUint32(pos + 20, true);
      const uncompSize   = view.getUint32(pos + 24, true);
      const fnLen        = view.getUint16(pos + 28, true);
      const cdExtraLen   = view.getUint16(pos + 30, true);
      const cdCommentLen = view.getUint16(pos + 32, true);
      const localOff     = view.getUint32(pos + 42, true);
      const filename     = new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + fnLen));

      if (compSize > 0) {
        const lhFnLen    = view.getUint16(localOff + 26, true);
        const lhExtraLen = view.getUint16(localOff + 28, true);
        const dataStart  = localOff + 30 + lhFnLen + lhExtraLen;
        const raw        = bytes.slice(dataStart, dataStart + compSize);

        if (comprMethod === 0) {
          result[filename] = raw;                          // stored
        } else if (comprMethod === 8) {
          result[filename] = await this._inflate(raw);    // deflate
        } else {
          throw new Error(`Unsupported compression method ${comprMethod} for "${filename}"`);
        }
      }

      pos += 46 + fnLen + cdExtraLen + cdCommentLen;
    }
    return result;
  }

  async _inflate(data) {
    const ds     = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(data);
    writer.close();
    const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

const statusEl  = document.getElementById('status');
const statusTxt = document.getElementById('status-text');
const exportBtn = document.getElementById('exportBtn');
const btnText   = document.getElementById('btnText');
const progressEl  = document.getElementById('progress');
const progressMsg = document.getElementById('progressMsg');
const resultEl  = document.getElementById('result');

const optImages   = document.getElementById('opt-images');
const optMacros   = document.getElementById('opt-macros');
const optMetadata = document.getElementById('opt-metadata');
const optJira     = document.getElementById('opt-jira');

const pushBtn       = document.getElementById('pushBtn');
const pushFileInput = document.getElementById('pushFileInput');
const pushResult    = document.getElementById('pushResult');

function setStatus(cls, icon, msg) {
  statusEl.className = `status ${cls}`;
  statusEl.querySelector('.status-icon').textContent = icon;
  statusTxt.innerHTML = msg;
}

function showProgress(show, msg = '') {
  progressEl.style.display = show ? 'block' : 'none';
  progressMsg.textContent = msg;
}

function showResult(html) {
  resultEl.style.display = html ? 'block' : 'none';
  resultEl.innerHTML = html;
}

function showPushResult(html) {
  pushResult.style.display = html ? 'block' : 'none';
  pushResult.innerHTML = html;
}

async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (_) { /* already injected or restricted */ }
}

function ask(tabId, payload) {
  return new Promise((ok, fail) => {
    chrome.tabs.sendMessage(tabId, payload, res => {
      if (chrome.runtime.lastError) fail(new Error(chrome.runtime.lastError.message));
      else ok(res);
    });
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────
async function init() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    await inject(tab.id);
    const pong = await ask(tab.id, { action: 'ping' });
    if (pong?.isConfluence) {
      const title = pong.title ? `<br><em>${esc(pong.title)}</em>` : '';
      setStatus('status-ok', '✓', `Confluence page detected${title}`);
      exportBtn.disabled = false;
      pushBtn.disabled = false;
    } else {
      setStatus('status-warn', '⚠', 'Not a standard Confluence page');
      exportBtn.disabled = false;
      btnText.textContent = 'Export Anyway (.zip)';
    }
  } catch (e) {
    setStatus('status-error', '✗', 'Cannot access this page');
  }
}

// ── Export ────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  exportBtn.disabled = true;
  showResult('');
  showProgress(true, 'Extracting content…');
  setStatus('status-checking', '⏳', 'Exporting — please wait…');

  const options = {
    includeImages:   optImages.checked,
    includeMacros:   optMacros.checked,
    includeMetadata: optMetadata.checked,
    includeJira:     optJira.checked,
  };

  await inject(tab.id);

  try {
    progressMsg.textContent = 'Downloading images…';
    const res = await ask(tab.id, { action: 'export', options });
    showProgress(false);

    if (res?.success) {
      setStatus('status-ok', '✓', 'Export complete');
      showResult([
        `<strong>${esc(res.title)}</strong>`,
        `📄 ${res.mdLines} lines &nbsp;|&nbsp; 🖼 ${res.imageCount} image(s)`,
        `📦 <code>${esc(res.filename)}</code>`,
      ].join('<br>'));
    } else {
      setStatus('status-error', '✗', 'Export failed: ' + esc(res?.error || 'unknown'));
    }
  } catch (e) {
    showProgress(false);
    setStatus('status-error', '✗', esc(e.message || 'Unknown error'));
  } finally {
    exportBtn.disabled = false;
  }
});

// ── Push ──────────────────────────────────────
pushBtn.addEventListener('click', () => pushFileInput.click());

pushFileInput.addEventListener('change', async () => {
  const file = pushFileInput.files[0];
  if (!file) return;
  pushFileInput.value = '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  pushBtn.disabled = true;
  showResult('');
  showPushResult('');
  showProgress(true, 'Reading file…');
  setStatus('status-checking', '⏳', 'Preparing push…');

  try {
    let markdown, images = {};

    if (file.name.endsWith('.zip')) {
      showProgress(true, 'Parsing ZIP…');
      const buf     = await file.arrayBuffer();
      const entries = await new SimpleZipReader().parse(buf);

      const mdKey = Object.keys(entries).find(k => k.endsWith('.md') && !k.includes('/'));
      if (!mdKey) throw new Error('No .md file found in ZIP');
      markdown = new TextDecoder().decode(entries[mdKey]);

      for (const [name, bytes] of Object.entries(entries)) {
        if (name.startsWith('images/') && !name.endsWith('/')) {
          images[name.slice('images/'.length)] = Array.from(bytes);
        }
      }
    } else {
      markdown = await file.text();
    }

    showProgress(true, 'Uploading to Confluence…');
    await inject(tab.id);
    const res = await ask(tab.id, { action: 'push', markdown, images });

    showProgress(false);
    if (res?.success) {
      setStatus('status-ok', '✓', 'Push complete');
      showPushResult([
        `<strong>${esc(res.title)}</strong>`,
        `✅ Page updated successfully`,
        `🆔 Page ID: <code>${esc(String(res.pageId))}</code>` +
          (res.imageCount ? ` &nbsp;|&nbsp; 🖼 ${res.imageCount} image(s)` : ''),
      ].join('<br>'));
    } else {
      setStatus('status-error', '✗', 'Push failed: ' + esc(res?.error || 'unknown'));
    }
  } catch (e) {
    showProgress(false);
    setStatus('status-error', '✗', esc(e.message || 'Unknown error'));
  } finally {
    pushBtn.disabled = false;
  }
});

init();

// popup.js

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

init();

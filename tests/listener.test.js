// Tests for the chrome.runtime.onMessage listener registered by content.js.
// Each jest test file runs in its own jsdom context, so the module guard
// (window.__cf2md_v1) and module cache are always fresh here.

let onMessage;

beforeAll(() => {
  // Capture the listener registered at module load time.
  chrome.runtime.onMessage.addListener.mockImplementation(fn => {
    onMessage = fn;
  });
  require('../artifact/content');
});

afterEach(() => {
  document.body.innerHTML = '';
  document.title = '';
  jest.clearAllMocks();
});

// ─── ping ─────────────────────────────────────────────────────────────────────

describe('ping action', () => {
  test('responds synchronously (returns false)', () => {
    const reply = jest.fn();
    const ret = onMessage({ action: 'ping' }, null, reply);
    expect(ret).toBe(false);
    expect(reply).toHaveBeenCalledTimes(1);
  });

  test('detects Confluence page via .wiki-content', () => {
    document.body.innerHTML = '<div class="wiki-content">content</div>';
    const reply = jest.fn();
    onMessage({ action: 'ping' }, null, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ok: true, isConfluence: true }));
  });

  test('detects Confluence page via .ak-renderer-document', () => {
    document.body.innerHTML = '<div class="ak-renderer-document">content</div>';
    const reply = jest.fn();
    onMessage({ action: 'ping' }, null, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ isConfluence: true }));
  });

  test('detects Confluence page via meta[name="confluence-page-id"]', () => {
    document.head.innerHTML = '<meta name="confluence-page-id" content="12345">';
    const reply = jest.fn();
    onMessage({ action: 'ping' }, null, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ isConfluence: true }));
    document.head.innerHTML = '';
  });

  test('reports isConfluence: false on non-Confluence page', () => {
    document.body.innerHTML = '<div>Just a random page</div>';
    const reply = jest.fn();
    onMessage({ action: 'ping' }, null, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ isConfluence: false }));
  });

  test('includes page title in ping response', () => {
    document.body.innerHTML = '<div id="title-text"><a>My Title</a></div>';
    const reply = jest.fn();
    onMessage({ action: 'ping' }, null, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ title: 'My Title' }));
  });
});

// ─── export action ───────────────────────────────────────────────────────────

describe('export action', () => {
  test('returns true to signal async response', () => {
    document.body.innerHTML = '<div class="wiki-content"><p>Content</p></div>';
    document.title = 'Test Page';
    const reply = jest.fn();
    const ret = onMessage({ action: 'export', options: {} }, null, reply);
    expect(ret).toBe(true);
  });

  test('prevents concurrent exports (busy guard)', () => {
    document.body.innerHTML = '<div class="wiki-content"><p>Content</p></div>';
    document.title = 'Test Page';

    const reply1 = jest.fn();
    const reply2 = jest.fn();

    // First export: starts async work, sets _busy = true
    onMessage({ action: 'export', options: {} }, null, reply1);
    // Second export while first is in flight: should reply immediately with error
    onMessage({ action: 'export', options: {} }, null, reply2);

    expect(reply2).toHaveBeenCalledWith({ success: false, error: 'Export already running' });
  });
});

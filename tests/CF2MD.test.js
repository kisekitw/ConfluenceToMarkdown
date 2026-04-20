const { CF2MD } = require('../artifact/content');

// Creates a DOM element from an HTML string.
function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild || div;
}

// ─── abs() ───────────────────────────────────────────────────────────────────

describe('CF2MD.abs()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test('returns empty string for empty input', () => {
    expect(cv.abs('')).toBe('');
  });
  test('passes through https URL unchanged', () => {
    expect(cv.abs('https://example.com/img.png')).toBe('https://example.com/img.png');
  });
  test('passes through protocol-relative URL unchanged', () => {
    expect(cv.abs('//cdn.example.com/img.png')).toBe('//cdn.example.com/img.png');
  });
  test('passes through data URI unchanged', () => {
    const uri = 'data:image/png;base64,abc123';
    expect(cv.abs(uri)).toBe(uri);
  });
  test('resolves relative path to a non-empty string', () => {
    const result = cv.abs('/path/to/img.png');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── _mime2ext() ─────────────────────────────────────────────────────────────

describe('CF2MD._mime2ext()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test.each([
    ['image/jpeg',   'jpg'],
    ['image/jpg',    'jpg'],
    ['image/png',    'png'],
    ['image/gif',    'gif'],
    ['image/webp',   'webp'],
    ['image/svg+xml','svg'],
    ['image/bmp',    'bmp'],
    ['application/octet-stream', null],
    ['text/html', null],
    ['', null],
  ])('%s → %s', (mime, expected) => {
    expect(cv._mime2ext(mime)).toBe(expected);
  });
});

// ─── _extFromUrl() ───────────────────────────────────────────────────────────

describe('CF2MD._extFromUrl()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test.each([
    ['https://example.com/photo.png',  'png'],
    ['https://example.com/photo.jpg',  'jpg'],
    ['https://example.com/photo.jpeg', 'jpeg'],
    ['https://example.com/anim.gif',   'gif'],
    ['https://example.com/chart.svg',  'svg'],
    ['https://example.com/img.webp',   'webp'],
    ['https://example.com/img.bmp',    'bmp'],
    ['https://example.com/file.pdf',   null],
    ['https://example.com/noextension', null],
    ['/relative/image.png',            'png'],
  ])('%s → %s', (url, expected) => {
    expect(cv._extFromUrl(url)).toBe(expected);
  });
});

// ─── getTitle() ──────────────────────────────────────────────────────────────

describe('CF2MD.getTitle()', () => {
  afterEach(() => { document.body.innerHTML = ''; document.title = ''; });

  test('reads #title-text a (highest priority)', () => {
    document.body.innerHTML = '<div id="title-text"><a>My Page</a></div>';
    expect(new CF2MD().getTitle()).toBe('My Page');
  });
  test('reads #title-text without child anchor', () => {
    document.body.innerHTML = '<div id="title-text">Plain Title</div>';
    expect(new CF2MD().getTitle()).toBe('Plain Title');
  });
  test('reads [data-testid="page-title"] (Confluence Cloud)', () => {
    document.body.innerHTML = '<h1 data-testid="page-title">Cloud Page</h1>';
    expect(new CF2MD().getTitle()).toBe('Cloud Page');
  });
  test('reads h1#title-heading', () => {
    document.body.innerHTML = '<h1 id="title-heading">Heading Page</h1>';
    expect(new CF2MD().getTitle()).toBe('Heading Page');
  });
  test('reads h1.pagetitle', () => {
    document.body.innerHTML = '<h1 class="pagetitle">Class Page</h1>';
    expect(new CF2MD().getTitle()).toBe('Class Page');
  });
  test('falls back to document.title, stripping " - Confluence" suffix', () => {
    document.title = 'My Page - Confluence';
    expect(new CF2MD().getTitle()).toBe('My Page');
  });
  test('returns Untitled when nothing is found', () => {
    document.title = '';
    expect(new CF2MD().getTitle()).toBe('Untitled');
  });
});

// ─── getContentEl() ──────────────────────────────────────────────────────────

describe('CF2MD.getContentEl()', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  test('prefers .ak-renderer-document (Confluence Cloud)', () => {
    document.body.innerHTML = '<div class="ak-renderer-document">Cloud content here to exceed 20 chars</div>';
    const el = new CF2MD().getContentEl();
    expect(el.className).toBe('ak-renderer-document');
  });
  test('falls back to .wiki-content', () => {
    document.body.innerHTML = '<div class="wiki-content">Server wiki content long enough to be found</div>';
    const el = new CF2MD().getContentEl();
    expect(el.className).toBe('wiki-content');
  });
  test('falls back to document.body when nothing matches', () => {
    document.body.innerHTML = '<p>No confluence selectors here at all</p>';
    expect(new CF2MD().getContentEl()).toBe(document.body);
  });
});

// ─── handlePre() ─────────────────────────────────────────────────────────────

describe('CF2MD.handlePre()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test('renders fenced code block with data-language', async () => {
    const pre = el('<pre data-language="python">print("hi")</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```python\nprint("hi")\n```\n\n');
  });
  test('renders fenced code block with data-lang', async () => {
    const pre = el('<pre data-lang="bash">echo hi</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```bash\necho hi\n```\n\n');
  });
  test('detects language from brush: class syntax', async () => {
    const pre = el('<pre class="brush: javascript">var x = 1;</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```javascript\nvar x = 1;\n```\n\n');
  });
  test('detects language from language- class syntax', async () => {
    const pre = el('<pre class="language-sql">SELECT 1;</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```sql\nSELECT 1;\n```\n\n');
  });
  test('renders without language when none is specified', async () => {
    const pre = el('<pre>plain code</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```\nplain code\n```\n\n');
  });
  test('strips leading and trailing newlines inside code', async () => {
    const pre = el('<pre>\ncode block\n</pre>');
    expect(await cv.handlePre(pre)).toBe('\n```\ncode block\n```\n\n');
  });
  test('reads code text from child <code> element when present', async () => {
    const pre = el('<pre><code class="language-ts">const x: number = 1;</code></pre>');
    expect(await cv.handlePre(pre)).toBe('\n```\nconst x: number = 1;\n```\n\n');
  });
});

// ─── handleList() ────────────────────────────────────────────────────────────

describe('CF2MD.handleList()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test('renders an unordered list with - bullets', async () => {
    const ul = el('<ul><li>Alpha</li><li>Beta</li></ul>');
    expect(await cv.handleList(ul, false, 0)).toBe('- Alpha\n- Beta\n\n');
  });
  test('renders an ordered list with 1. 2. numbering', async () => {
    const ol = el('<ol><li>First</li><li>Second</li></ol>');
    expect(await cv.handleList(ol, true, 0)).toBe('1. First\n2. Second\n\n');
  });
  test('indents nested list by two spaces per level', async () => {
    const ul = el('<ul><li>Parent<ul><li>Child</li></ul></li></ul>');
    const result = await cv.handleList(ul, false, 0);
    expect(result).toContain('- Parent');
    expect(result).toContain('  - Child');
  });
  test('skips non-li children', async () => {
    const ul = el('<ul><li>Item</li><p>Not an item</p></ul>');
    expect(await cv.handleList(ul, false, 0)).toBe('- Item\n\n');
  });
  test('skips empty li elements', async () => {
    const ul = el('<ul><li>Real</li><li>   </li></ul>');
    const result = await cv.handleList(ul, false, 0);
    expect(result.trim()).toBe('- Real');
  });
  test('task list with checked item renders GFM - [x] checkbox', async () => {
    const ul = el('<ul><li><input type="checkbox" checked>Done task</li></ul>');
    const result = await cv.handleList(ul, false, 0);
    expect(result).toContain('- [x] Done task');
  });
  test('task list with unchecked item renders GFM - [ ] checkbox', async () => {
    const ul = el('<ul><li><input type="checkbox">Pending task</li></ul>');
    const result = await cv.handleList(ul, false, 0);
    expect(result).toContain('- [ ] Pending task');
  });
  test('mixed checked and unchecked task items render correctly', async () => {
    const ul = el(`<ul>
      <li><input type="checkbox" checked>Done</li>
      <li><input type="checkbox">Todo</li>
    </ul>`);
    const result = await cv.handleList(ul, false, 0);
    expect(result).toContain('- [x] Done');
    expect(result).toContain('- [ ] Todo');
  });
});

// ─── handleTable() ───────────────────────────────────────────────────────────

describe('CF2MD.handleTable()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test('renders header row and separator when <th> cells present', async () => {
    const table = el('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
    const result = await cv.handleTable(table);
    expect(result).toContain('| A | B |');
    expect(result).toContain('| :--- | :--- |');
    expect(result).toContain('| 1 | 2 |');
  });
  test('adds separator after first row even without <th>', async () => {
    const table = el('<table><tr><td>H1</td><td>H2</td></tr><tr><td>v1</td><td>v2</td></tr></table>');
    const lines = (await cv.handleTable(table)).trim().split('\n');
    expect(lines[1]).toMatch(/\| :---/);
  });
  test('escapes pipe characters inside cells', async () => {
    const table = el('<table><tr><th>A|B</th></tr></table>');
    expect(await cv.handleTable(table)).toContain('A\\|B');
  });
  test('renders <br> elements inside cells as <br> (not newline)', async () => {
    // Text-node newlines are collapsed to spaces before handleTable sees them;
    // only actual <br> elements produce the <br> placeholder.
    const table = el('<table><tr><td>line1<br>line2</td></tr></table>');
    const result = await cv.handleTable(table);
    expect(result).toContain('line1<br>line2');
  });
  test('returns empty string for a table with no rows', async () => {
    const table = el('<table></table>');
    expect(await cv.handleTable(table)).toBe('');
  });
  test('cell containing only <br> renders as empty, not literal "<br>"', async () => {
    const table = el('<table><tr><th>ID</th><th>Notes</th></tr><tr><td>CEC01</td><td><br></td></tr></table>');
    const result = await cv.handleTable(table);
    expect(result).not.toContain('| <br> |');
    expect(result).toContain('| CEC01 |');
  });
  test('cell with text followed by trailing <br> strips the trailing <br>', async () => {
    const table = el('<table><tr><td>text<br></td></tr></table>');
    const result = await cv.handleTable(table);
    expect(result).not.toMatch(/text<br>/);
    expect(result).toContain('text');
  });
  test('nested table inside a cell is flattened to text, not markdown table syntax', async () => {
    const table = el(`<table>
      <tr><th>Type</th><th>Issues</th></tr>
      <tr><td>EPIC</td><td>
        <table><tr><th>Key</th><th>Summary</th></tr><tr><td>HMISW-123</td><td>Fix bug</td></tr></table>
      </td></tr>
    </table>`);
    const result = await cv.handleTable(table);
    // Nested table should NOT produce escaped pipes or inner markdown table rows
    const epicRow = result.split('\n').find(l => l.includes('EPIC'));
    expect(epicRow).toBeDefined();
    expect(epicRow).not.toContain('\\|');
    expect(result).toContain('HMISW-123');
  });
});

// ─── handleInfoMacro() ───────────────────────────────────────────────────────

describe('CF2MD.handleInfoMacro()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test.each([
    ['warning', '⚠️ **Warning**'],
    ['tip',     '💡 **Tip**'],
    ['note',    '📝 **Note**'],
    ['success', '✅ **Success**'],
    ['info',    'ℹ️ **Info**'],
  ])('renders %s callout with correct label', async (type, label) => {
    const div = el(`<div><div class="confluence-information-macro-body">Body text</div></div>`);
    const result = await cv.handleInfoMacro(div, type);
    expect(result).toContain(label);
    expect(result).toContain('Body text');
  });
  test('falls back to element textContent when no body element is found', async () => {
    const div = el('<div>Direct text content</div>');
    const result = await cv.handleInfoMacro(div, 'info');
    expect(result).toContain('Direct text content');
  });
  test('output is formatted as a blockquote', async () => {
    const div = el('<div><div class="confluence-information-macro-body">Content</div></div>');
    const result = await cv.handleInfoMacro(div, 'note');
    expect(result.trim()).toMatch(/^>/);
  });
});

// ─── handleDiv() - macro dispatcher ──────────────────────────────────────────

describe('CF2MD.handleDiv() macros', () => {
  let cv;
  const noKids = async () => '';

  beforeEach(() => { cv = new CF2MD(); });

  test('TOC macro → placeholder text', async () => {
    const div = el('<div data-macro-name="toc"></div>');
    expect(await cv.handleDiv(div, noKids, {})).toBe('*[Table of Contents]*\n\n');
  });
  test('status macro → inline code', async () => {
    const div = el('<div data-macro-name="status">IN PROGRESS</div>');
    expect(await cv.handleDiv(div, noKids, {})).toBe('`IN PROGRESS`');
  });
  test('gliffy with includeMacros=false → omit placeholder', async () => {
    cv = new CF2MD({ includeMacros: false });
    const div = el('<div data-macro-name="gliffy"></div>');
    expect(await cv.handleDiv(div, noKids, {})).toBe('*[Gliffy diagram omitted]*\n\n');
  });
  test('drawio with includeMacros=false → omit placeholder', async () => {
    cv = new CF2MD({ includeMacros: false });
    const div = el('<div data-macro-name="drawio"></div>');
    expect(await cv.handleDiv(div, noKids, {})).toBe('*[draw.io diagram omitted]*\n\n');
  });
  test('expand macro → <details> block', async () => {
    const div = el('<div data-macro-name="expand"><div class="expand-control-text">Show more</div><div class="expand-content">Hidden body</div></div>');
    const result = await cv.handleDiv(div, noKids, {});
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Show more</summary>');
    expect(result).toContain('Hidden body');
    expect(result).toContain('</details>');
  });
  test('expand macro with no title falls back to "Expand"', async () => {
    const div = el('<div data-macro-name="expand"><div class="expand-content">Body</div></div>');
    const result = await cv.handleDiv(div, noKids, {});
    expect(result).toContain('<summary>Expand</summary>');
  });
  test('panel macro with header → bold title above body', async () => {
    const div = el('<div data-macro-name="panel"><div class="panelHeader">Note</div><div class="panelContent">Panel body</div></div>');
    const result = await cv.handleDiv(div, noKids, {});
    expect(result).toContain('**Note**');
    expect(result).toContain('Panel body');
  });
  test('panel macro without header → body only', async () => {
    const div = el('<div data-macro-name="panel"><div class="panelContent">Only body</div></div>');
    const result = await cv.handleDiv(div, noKids, {});
    expect(result).toContain('Only body');
    expect(result).not.toContain('**');
  });
  test('code macro with <pre> child → fenced code block', async () => {
    const div = el('<div data-macro-name="code"><pre data-language="java">int x = 1;</pre></div>');
    const result = await cv.handleDiv(div, noKids, {});
    expect(result).toContain('```java');
    expect(result).toContain('int x = 1;');
  });
  test('generic div with no macro → delegates to kids()', async () => {
    const div = el('<div class="some-layout-wrapper"></div>');
    const kids = jest.fn(async () => 'child content');
    await cv.handleDiv(div, kids, {});
    expect(kids).toHaveBeenCalled();
  });
});

// ─── handleSpan() ────────────────────────────────────────────────────────────

describe('CF2MD.handleSpan()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  test('aui-lozenge → `backtick` using element textContent', async () => {
    const span = el('<span class="aui-lozenge">STATUS</span>');
    expect(await cv.handleSpan(span, async () => 'ignored')).toBe('`STATUS`');
  });
  test('status-macro class → `backtick`', async () => {
    const span = el('<span class="status-macro">DONE</span>');
    expect(await cv.handleSpan(span, async () => 'ignored')).toBe('`DONE`');
  });
  test('inline-code class → `backtick`', async () => {
    const span = el('<span class="inline-code">func()</span>');
    expect(await cv.handleSpan(span, async () => 'ignored')).toBe('`func()`');
  });
  test('confluence-userlink → @mention', async () => {
    const span = el('<span class="confluence-userlink">John Doe</span>');
    expect(await cv.handleSpan(span, async () => 'ignored')).toBe('@John Doe');
  });
  test('user-mention class → @mention', async () => {
    const span = el('<span class="user-mention">Jane</span>');
    expect(await cv.handleSpan(span, async () => 'ignored')).toBe('@Jane');
  });
  test('plain span → returns kids() output', async () => {
    const span = el('<span>plain</span>');
    expect(await cv.handleSpan(span, async () => 'plain text')).toBe('plain text');
  });
});

// ─── nodeToMd() - inline/block elements ──────────────────────────────────────

describe('CF2MD.nodeToMd()', () => {
  let cv;
  beforeEach(() => { cv = new CF2MD(); });

  describe('text nodes', () => {
    test('collapses newlines to spaces outside <pre>', async () => {
      const node = document.createTextNode('hello\nworld');
      expect(await cv.nodeToMd(node, {})).toBe('hello world');
    });
    test('preserves newlines inside <pre> context', async () => {
      const node = document.createTextNode('line1\nline2');
      expect(await cv.nodeToMd(node, { inPre: true })).toBe('line1\nline2');
    });
  });

  describe('skipped tags', () => {
    // Use createElement — the HTML5 parser strips special tags (head, meta, link)
    // from div.innerHTML, so innerHTML cannot be used for them reliably.
    test.each(['script', 'style', 'noscript', 'head', 'meta', 'link', 'template'])(
      '<%s> returns empty string', async (tag) => {
        const node = document.createElement(tag);
        node.textContent = 'content';
        expect(await cv.nodeToMd(node, {})).toBe('');
      }
    );
  });

  describe('headings', () => {
    test.each([1, 2, 3, 4, 5, 6])('h%i produces correct markdown prefix', async (n) => {
      const node = el(`<h${n}>Heading ${n}</h${n}>`);
      const prefix = '#'.repeat(n);
      expect(await cv.nodeToMd(node, {})).toBe(`\n${prefix} Heading ${n}\n\n`);
    });
    test('heading with single <strong> child strips ** markers', async () => {
      const node = el('<h2><strong>Bold Title</strong></h2>');
      expect(await cv.nodeToMd(node, {})).toBe('\n## Bold Title\n\n');
    });
    test('heading with adjacent <strong> elements does not produce ****', async () => {
      const node = el('<h2><strong>Constraint</strong><strong>Specification</strong></h2>');
      const result = await cv.nodeToMd(node, {});
      expect(result).not.toContain('****');
      expect(result).toBe('\n## ConstraintSpecification\n\n');
    });
    test('heading with mixed text and <strong> strips only ** markers', async () => {
      const node = el('<h3>5.1 <strong>Capacity</strong> and <strong>Spec</strong></h3>');
      const result = await cv.nodeToMd(node, {});
      expect(result).not.toContain('**');
      expect(result).toContain('5.1 Capacity and Spec');
    });
  });

  describe('inline formatting', () => {
    test('strong → **bold**', async () => {
      expect(await cv.nodeToMd(el('<strong>bold</strong>'), {})).toBe('**bold**');
    });
    test('b → **bold**', async () => {
      expect(await cv.nodeToMd(el('<b>bold</b>'), {})).toBe('**bold**');
    });
    test('em → *italic*', async () => {
      expect(await cv.nodeToMd(el('<em>italic</em>'), {})).toBe('*italic*');
    });
    test('del → ~~strikethrough~~', async () => {
      expect(await cv.nodeToMd(el('<del>removed</del>'), {})).toBe('~~removed~~');
    });
    test('u → <u>underline</u>', async () => {
      expect(await cv.nodeToMd(el('<u>underline</u>'), {})).toBe('<u>underline</u>');
    });
    test('sup → <sup>text</sup>', async () => {
      expect(await cv.nodeToMd(el('<sup>2</sup>'), {})).toBe('<sup>2</sup>');
    });
    test('sub → <sub>text</sub>', async () => {
      expect(await cv.nodeToMd(el('<sub>n</sub>'), {})).toBe('<sub>n</sub>');
    });
    test('kbd → `key`', async () => {
      expect(await cv.nodeToMd(el('<kbd>Ctrl</kbd>'), {})).toBe('`Ctrl`');
    });
    test('code outside pre → `backtick`', async () => {
      expect(await cv.nodeToMd(el('<code>fn()</code>'), {})).toBe('`fn()`');
    });
    test('empty strong returns empty string', async () => {
      expect(await cv.nodeToMd(el('<strong>   </strong>'), {})).toBe('');
    });
  });

  describe('anchor', () => {
    test('with href → [text](url)', async () => {
      const a = el('<a href="https://example.com">link</a>');
      expect(await cv.nodeToMd(a, {})).toBe('[link](https://example.com)');
    });
    test('without href → plain text', async () => {
      const a = el('<a>anchor text</a>');
      expect(await cv.nodeToMd(a, {})).toBe('anchor text');
    });
    test('href="#" → plain text', async () => {
      const a = el('<a href="#">title</a>');
      expect(await cv.nodeToMd(a, {})).toBe('title');
    });
    test('empty text content → empty string', async () => {
      const a = el('<a href="https://example.com">   </a>');
      expect(await cv.nodeToMd(a, {})).toBe('');
    });
  });

  describe('checkbox input', () => {
    test('checked checkbox → [x] ', async () => {
      const node = document.createElement('input');
      node.setAttribute('type', 'checkbox');
      node.checked = true;
      expect(await cv.nodeToMd(node, {})).toBe('[x] ');
    });
    test('unchecked checkbox → [ ] ', async () => {
      const node = document.createElement('input');
      node.setAttribute('type', 'checkbox');
      expect(await cv.nodeToMd(node, {})).toBe('[ ] ');
    });
    test('non-checkbox input → empty string', async () => {
      const node = document.createElement('input');
      node.setAttribute('type', 'text');
      expect(await cv.nodeToMd(node, {})).toBe('');
    });
  });

  describe('task-list UI controls', () => {
    test('element with task-list-tools class returns empty string', async () => {
      const div = el('<div class="task-list-tools"><a>All</a><a>Incomplete</a></div>');
      expect(await cv.nodeToMd(div, {})).toBe('');
    });
    test('element with task-filter class returns empty string', async () => {
      const div = el('<div class="task-filter-bar">Filter</div>');
      expect(await cv.nodeToMd(div, {})).toBe('');
    });
    test('element with task-progress class returns empty string', async () => {
      const div = el('<div class="task-progress-bar">2 / 5</div>');
      expect(await cv.nodeToMd(div, {})).toBe('');
    });
  });

  describe('block elements', () => {
    test('hr → \\n---\\n\\n', async () => {
      expect(await cv.nodeToMd(el('<hr>'), {})).toBe('\n---\n\n');
    });
    test('br outside table → \\n', async () => {
      expect(await cv.nodeToMd(el('<br>'), {})).toBe('\n');
    });
    test('br inside table → <br>', async () => {
      expect(await cv.nodeToMd(el('<br>'), { inTable: true })).toBe('<br>');
    });
    test('non-empty p → text\\n\\n', async () => {
      const p = el('<p>Hello paragraph</p>');
      expect(await cv.nodeToMd(p, {})).toBe('Hello paragraph\n\n');
    });
    test('empty p → \\n', async () => {
      const p = el('<p>   </p>');
      expect(await cv.nodeToMd(p, {})).toBe('\n');
    });
    test('blockquote → > prefixed lines', async () => {
      const bq = el('<blockquote>quoted</blockquote>');
      const result = await cv.nodeToMd(bq, {});
      expect(result).toContain('> quoted');
    });
  });

  describe('details/summary', () => {
    test('details element renders as <details> HTML block', async () => {
      const node = el('<details><summary>Title</summary><p>Body</p></details>');
      const result = await cv.nodeToMd(node, {});
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Title</summary>');
      expect(result).toContain('Body');
    });
    test('standalone summary tag returns empty string', async () => {
      expect(await cv.nodeToMd(el('<summary>skip me</summary>'), {})).toBe('');
    });
  });

  describe('navigation elements', () => {
    test('<nav> with role=navigation returns empty string', async () => {
      const nav = el('<nav role="navigation">skip</nav>');
      // role=navigation check is on el.getAttribute('role')
      expect(await cv.nodeToMd(nav, {})).toBe('');
    });
  });
});

// ─── handleImg() ─────────────────────────────────────────────────────────────

describe('CF2MD.handleImg()', () => {
  let cv;
  const mockBlob = {
    type: 'image/png',
    arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer),
  };

  beforeEach(() => {
    cv = new CF2MD({ includeImages: true });
    global.fetch.mockResolvedValue({ ok: true, blob: jest.fn().mockResolvedValue(mockBlob) });
  });
  afterEach(() => jest.clearAllMocks());

  test('returns empty string when includeImages is false', async () => {
    cv = new CF2MD({ includeImages: false });
    expect(await cv.handleImg(el('<img src="https://example.com/img.png">'), {})).toBe('');
  });
  test('returns empty string for missing src', async () => {
    expect(await cv.handleImg(el('<img>'), {})).toBe('');
  });
  test('returns empty string for short data URI (placeholder)', async () => {
    const src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    expect(src.length).toBeLessThan(600);
    expect(await cv.handleImg(el(`<img src="${src}">`), {})).toBe('');
  });
  test('returns empty string for tiny spacer image (width < 5)', async () => {
    expect(await cv.handleImg(el('<img src="https://example.com/spacer.gif" width="1" height="1">'), {})).toBe('');
  });
  test('fetches image and returns markdown reference', async () => {
    const img = el('<img src="https://example.com/photo.png" alt="photo">');
    const result = await cv.handleImg(img, {});
    expect(result).toMatch(/!\[photo\]\(images\/photo_1\.png\)/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('uses data-src for lazy-loaded images', async () => {
    const img = el('<img data-src="https://example.com/lazy.png" alt="">');
    await cv.handleImg(img, {});
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('lazy.png'),
      expect.any(Object)
    );
  });
  test('deduplicates: same URL fetched only once', async () => {
    const img1 = el('<img src="https://example.com/same.png" alt="a">');
    const img2 = el('<img src="https://example.com/same.png" alt="b">');
    await cv.handleImg(img1, {});
    await cv.handleImg(img2, {});
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('falls back to absolute URL when fetch fails', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const img = el('<img src="https://example.com/img.png" alt="">');
    const result = await cv.handleImg(img, {});
    expect(result).toContain('https://example.com/img.png');
  });
  test('wraps with newlines outside table, inline inside table', async () => {
    const img = el('<img src="https://example.com/img.png" alt="x">');
    const outside = await cv.handleImg(img, {});
    const inside  = await cv.handleImg(
      el('<img src="https://example.com/img2.png" alt="y">'),
      { inTable: true }
    );
    expect(outside).toMatch(/^\n/);
    expect(inside).not.toMatch(/^\n/);
  });
});

// ─── handleGliffy() ──────────────────────────────────────────────────────────

describe('CF2MD.handleGliffy()', () => {
  let cv;

  const mockFetchOk = () => {
    const buf = new Uint8Array([137, 80, 78, 71]).buffer;
    global.fetch.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue({ type: 'image/png', arrayBuffer: jest.fn().mockResolvedValue(buf) }),
    });
  };

  beforeEach(() => {
    cv = new CF2MD({ includeMacros: true, includeImages: true });
    document.head.innerHTML = '';
  });
  afterEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('fetches rendered <img src> inside container', async () => {
    mockFetchOk();
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">my_diagram</div>
      <img src="https://confluence.example.com/download/attachments/123/my_diagram.png">
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(result).toContain('![my_diagram](images/gliffy_1.png)');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('my_diagram.png'),
      expect.any(Object)
    );
  });

  test('fetches lazy-loaded img via data-src attribute', async () => {
    mockFetchOk();
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">lazy_diagram</div>
      <img data-src="https://confluence.example.com/lazy.png">
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(result).toContain('images/gliffy_1.png');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('lazy.png'),
      expect.any(Object)
    );
  });

  test('falls back to absolute URL when img fetch fails', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">My Diagram</div>
      <img src="https://confluence.example.com/diagram.png">
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(result).toContain('https://confluence.example.com/diagram.png');
  });

  test('uses Confluence attachment API: page-id from ajs-page-id meta, diagram name from title', async () => {
    mockFetchOk();
    document.head.innerHTML = '<meta name="ajs-page-id" content="98765">';
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">sample_flow</div>
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/download/attachments/98765/sample_flow.png'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toContain('images/gliffy_1.png');
  });

  test('uses diagram name from data-macro-parameters name= attribute', async () => {
    mockFetchOk();
    document.head.innerHTML = '<meta name="ajs-page-id" content="11111">';
    const div = el(`<div class="gliffy-container" data-macro-parameters="name=arch_diagram&amp;align=left"></div>`);
    const result = await cv.handleGliffy(div);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/download/attachments/11111/arch_diagram.png'),
      expect.any(Object)
    );
    expect(result).toContain('images/');
  });

  test('tries attachments URL before thumbnails URL', async () => {
    mockFetchOk();
    document.head.innerHTML = '<meta name="ajs-page-id" content="42">';
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">flow</div>
    </div>`);
    await cv.handleGliffy(div);
    expect(global.fetch.mock.calls[0][0]).toContain('/download/attachments/42/flow.png');
  });

  test('returns not-rendered fallback when no img, no canvas, no page-id, no svg', async () => {
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">orphan_diagram</div>
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(result).toContain('orphan_diagram');
    expect(result).toContain('Gliffy not rendered');
  });

  test('returns not-rendered fallback when Confluence attachment API returns 404', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, blob: jest.fn() });
    document.head.innerHTML = '<meta name="ajs-page-id" content="99">';
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">missing_diagram</div>
    </div>`);
    const result = await cv.handleGliffy(div);
    expect(result).toContain('Gliffy not rendered');
  });

  test('skips short data-URI placeholder images', async () => {
    mockFetchOk();
    document.head.innerHTML = '<meta name="ajs-page-id" content="55">';
    const shortDataUri = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const div = el(`<div class="gliffy-container">
      <div class="gliffy-title">real_diagram</div>
      <img src="${shortDataUri}">
    </div>`);
    const result = await cv.handleGliffy(div);
    // Should skip the placeholder and fall through to the Confluence API
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/download/attachments/55/real_diagram.png'),
      expect.any(Object)
    );
    expect(result).toContain('images/gliffy_1.png');
  });
});

// ─── convert() - integration ──────────────────────────────────────────────────

describe('CF2MD.convert()', () => {
  afterEach(() => { document.body.innerHTML = ''; document.title = ''; });

  test('produces markdown with H1 title', async () => {
    document.body.innerHTML = `
      <div id="title-text"><a>Integration Test</a></div>
      <div class="wiki-content"><p>Hello world</p></div>
    `;
    const { title, markdown } = await new CF2MD({ includeMetadata: false, includeImages: false }).convert();
    expect(title).toBe('Integration Test');
    expect(markdown).toContain('# Integration Test');
    expect(markdown).toContain('Hello world');
  });

  test('prepends metadata block when includeMetadata is true', async () => {
    document.body.innerHTML = `
      <div id="title-text"><a>Page</a></div>
      <div class="wiki-content"><p>Content</p></div>
    `;
    const { markdown } = await new CF2MD({ includeMetadata: true, includeImages: false }).convert();
    expect(markdown).toContain('**Source:**');
    expect(markdown).toContain('**Exported:**');
    expect(markdown).toContain('---');
  });

  test('omits metadata block when includeMetadata is false', async () => {
    document.body.innerHTML = `
      <div id="title-text"><a>Page</a></div>
      <div class="wiki-content"><p>Content</p></div>
    `;
    const { markdown } = await new CF2MD({ includeMetadata: false, includeImages: false }).convert();
    expect(markdown).not.toContain('**Source:**');
  });

  test('collapses runs of 4+ blank lines to max 3', async () => {
    document.body.innerHTML = `
      <div id="title-text">T</div>
      <div class="wiki-content"><p>A</p><p>B</p></div>
    `;
    const { markdown } = await new CF2MD({ includeMetadata: false, includeImages: false }).convert();
    expect(markdown).not.toMatch(/\n{4,}/);
  });

  test('returns images map with fetched files', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue({
        type: 'image/png',
        arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1]).buffer),
      }),
    });
    document.body.innerHTML = `
      <div id="title-text"><a>Page</a></div>
      <div class="wiki-content">
        <img src="https://example.com/img.png" alt="test">
      </div>
    `;
    const { images } = await new CF2MD({ includeImages: true, includeMetadata: false }).convert();
    expect(images.size).toBe(1);
    jest.clearAllMocks();
  });
});

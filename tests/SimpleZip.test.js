const { SimpleZip } = require('../artifact/content');

// ─── helpers ──────────────────────────────────────────────────────────────────

// jsdom's Blob may not implement .arrayBuffer(); use FileReader instead.
function blobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

async function readZip(zip) {
  const blob = zip.build();
  const buf = await blobToBuffer(blob);
  return { blob, arr: new Uint8Array(buf), view: new DataView(buf) };
}

// ─── add() ────────────────────────────────────────────────────────────────────

describe('SimpleZip.add()', () => {
  test('accepts a string and converts it to Uint8Array', () => {
    const zip = new SimpleZip();
    zip.add('hello.txt', 'hello');
    expect(zip.entries).toHaveLength(1);
    expect(zip.entries[0].data.constructor.name).toBe('Uint8Array');
    expect(zip.entries[0].data[0]).toBe(104); // 'h'
  });

  test('accepts a Uint8Array directly', () => {
    const zip = new SimpleZip();
    const data = new Uint8Array([1, 2, 3]);
    zip.add('data.bin', data);
    expect(zip.entries[0].data[0]).toBe(1);
    expect(zip.entries[0].data[1]).toBe(2);
    expect(zip.entries[0].data[2]).toBe(3);
  });

  test('accepts an ArrayBuffer', () => {
    const zip = new SimpleZip();
    const buf = new Uint8Array([65, 66, 67]).buffer; // "ABC"
    zip.add('data.bin', buf);
    expect(zip.entries[0].data.constructor.name).toBe('Uint8Array');
    expect(zip.entries[0].data[0]).toBe(65);
  });

  test('stores multiple entries', () => {
    const zip = new SimpleZip();
    zip.add('a.txt', 'a');
    zip.add('b.txt', 'b');
    expect(zip.entries).toHaveLength(2);
  });
});

// ─── build() ─────────────────────────────────────────────────────────────────

describe('SimpleZip.build()', () => {
  test('returns a Blob with application/zip mime type', () => {
    const zip = new SimpleZip();
    zip.add('x.txt', 'x');
    expect(zip.build().type).toBe('application/zip');
  });

  test('starts with PK local-file-header signature (0x04034b50)', async () => {
    const zip = new SimpleZip();
    zip.add('a.txt', 'test');
    const { view } = await readZip(zip);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
  });

  test('ends with EOCD signature (0x06054b50)', async () => {
    const zip = new SimpleZip();
    zip.add('a.txt', 'x');
    const { arr } = await readZip(zip);
    const eocdView = new DataView(arr.buffer, arr.length - 22, 22);
    expect(eocdView.getUint32(0, true)).toBe(0x06054b50);
  });

  test('EOCD entry count matches number of files added', async () => {
    const zip = new SimpleZip();
    zip.add('a.txt', 'a');
    zip.add('b.txt', 'b');
    zip.add('c.txt', 'c');
    const { arr } = await readZip(zip);
    const eocdView = new DataView(arr.buffer, arr.length - 22, 22);
    expect(eocdView.getUint16(8, true)).toBe(3);  // total entries
    expect(eocdView.getUint16(10, true)).toBe(3); // entries on disk
  });

  test('produces non-empty output for empty zip', () => {
    const zip = new SimpleZip();
    expect(zip.build().size).toBeGreaterThan(0);
  });

  test('file content round-trips correctly', async () => {
    const zip = new SimpleZip();
    const text = 'round-trip content';
    zip.add('test.txt', text);
    const { arr, view } = await readZip(zip);
    // Local header: filename length at offset 26
    const fnLen = view.getUint16(26, true);
    // File data starts at offset 30 + fnLen
    const dataStart = 30 + fnLen;
    const stored = new TextDecoder().decode(arr.slice(dataStart, dataStart + text.length));
    expect(stored).toBe(text);
  });
});

// ─── _crc() ──────────────────────────────────────────────────────────────────

describe('SimpleZip._crc()', () => {
  let zip;
  beforeEach(() => { zip = new SimpleZip(); });

  test('CRC-32 of empty data is 0', () => {
    expect(zip._crc(new Uint8Array([]))).toBe(0);
  });

  test('CRC-32 of "123456789" matches standard test vector 0xCBF43926', () => {
    const data = new TextEncoder().encode('123456789');
    expect(zip._crc(data)).toBe(0xCBF43926);
  });

  test('is deterministic across calls (lookup table is memoised)', () => {
    const data = new Uint8Array([10, 20, 30]);
    expect(zip._crc(data)).toBe(zip._crc(data));
  });

  test('different data produces different CRC', () => {
    expect(zip._crc(new Uint8Array([1]))).not.toBe(zip._crc(new Uint8Array([2])));
  });
});

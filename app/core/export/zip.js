/**
 * A STORE-ONLY ZIP WRITER, PORTED FROM CODE THAT WAS PROVEN ON THE TARGET DEVICE.
 *
 * ## Why this exists at all, when a library would do
 *
 * An `.xlsx` file is a ZIP of XML parts, so writing one means writing a ZIP. Every reason not to
 * pull in a spreadsheet library applies here: this application ships from a static host with no
 * build step over the core, depends only on React and react-router, and generates the coach's
 * exports entirely on his own device with no third-party service anywhere near a client's diet.
 *
 * ## It is a PORT, deliberately, and the original is worth naming
 *
 * The byte layout below comes from the s1 platform spike — a separate repository at
 * `C:\Projects\Fit\spike`, branch `spike`, not part of this build — where `spike/index.html` writes
 * a genuine workbook this way and it was VERIFIED FROM THE INSTALLED iOS APP, which is the actual
 * device the coach shares from. That verification is the whole value: a ZIP writer that is merely
 * correct by the specification can still produce a file the phone's share sheet or a spreadsheet
 * application declines, and there is no way to discover that from a test on a laptop.
 *
 * So the header layout is copied rather than re-derived, including the choices that look like
 * omissions and are not:
 *
 *   - **STORE ONLY, no compression.** The parts are a few kilobytes of XML. Deflate would mean
 *     shipping a compressor to save nothing a coach would notice, and it is the half of the format
 *     that goes wrong quietly — a mis-sized deflate stream produces a file that opens on one
 *     application and not another.
 *   - **No data descriptors.** Every size and checksum is known before its header is written,
 *     because the whole part is in memory.
 *   - **Zero modification time.** There is no clock in the core, and a timestamp would make the
 *     same table produce different bytes on every export, which is exactly what a test cannot pin.
 *   - **No UTF-8 name flag.** Every part name in a workbook is ASCII, so the flag would describe
 *     nothing. Kept as the verified original had it.
 *
 * The output is BYTES — a `Uint8Array`. Not a `Blob`: that is a browser object, and this half of
 * the seam is the half that a core test can run with no browser at all.
 */

/**
 * The CRC-32 table, built once. The polynomial is the one the ZIP format specifies; it is not a
 * choice, and the loop below is the standard bit-reversed derivation.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * The checksum every ZIP entry carries twice — once in its local header, once in the directory.
 * @param {Uint8Array} bytes @returns {number}
 */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Two little-endian bytes. @param {number} value @returns {number[]} */
function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** Four little-endian bytes. @param {number} value @returns {number[]} */
function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/**
 * Pack named text parts into a store-only ZIP archive.
 *
 * The order given is the order written, and for a workbook that order matters to some readers:
 * `[Content_Types].xml` first, as the caller in `workbook.js` lists it.
 *
 * @param {Array<{name: string, text: string}>} parts
 * @returns {Uint8Array} The whole archive.
 */
export function storeOnlyZip(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new TypeError('An archive needs at least one part; an empty ZIP is a file nothing will open.');
  }

  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {Array<{name: Uint8Array, crc: number, size: number, offset: number}>} */
  const directory = [];
  let offset = 0;

  for (const part of parts) {
    const name = encoder.encode(part.name);
    const data = encoder.encode(part.text);
    const crc = crc32(data);

    const local = [
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed: 2.0
      ...u16(0), // general purpose flags: none
      ...u16(0), // method 0 — stored
      ...u16(0), // modification time
      ...u16(0), // modification date
      ...u32(crc),
      ...u32(data.length), // compressed size — the same, because nothing is compressed
      ...u32(data.length), // uncompressed size
      ...u16(name.length),
      ...u16(0), // extra field length
    ];

    chunks.push(new Uint8Array(local), name, data);
    directory.push({ name, crc, size: data.length, offset });
    offset += local.length + name.length + data.length;
  }

  const directoryStart = offset;
  let directorySize = 0;

  for (const entry of directory) {
    const header = [
      ...u32(0x02014b50), // central directory header signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method 0 — stored
      ...u16(0), // modification time
      ...u16(0), // modification date
      ...u32(entry.crc),
      ...u32(entry.size),
      ...u32(entry.size),
      ...u16(entry.name.length),
      ...u16(0), // extra field length
      ...u16(0), // comment length
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(entry.offset),
    ];

    chunks.push(new Uint8Array(header), entry.name);
    directorySize += header.length + entry.name.length;
  }

  chunks.push(new Uint8Array([
    ...u32(0x06054b50), // end of central directory
    ...u16(0), // this disk
    ...u16(0), // disk the directory starts on
    ...u16(directory.length),
    ...u16(directory.length),
    ...u32(directorySize),
    ...u32(directoryStart),
    ...u16(0), // comment length
  ]));

  return join(chunks);
}

/**
 * One array of bytes from many.
 * @param {Uint8Array[]} chunks @returns {Uint8Array}
 */
function join(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;

  const archive = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    archive.set(chunk, at);
    at += chunk.length;
  }
  return archive;
}

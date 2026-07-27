/**
 * TEST SUPPORT — a ZIP READER, and the cells that break writers.
 *
 * Nothing in the application imports this file.
 *
 * ## Why a reader was written rather than a byte comparison
 *
 * The claim worth testing about the workbook writer is not "these bytes equal those bytes" — that
 * pins a mistake as firmly as it pins the truth, and it says nothing at all about whether a
 * spreadsheet application can open the result. The claim is structural: the output is a well-formed
 * store-only ZIP holding exactly the expected parts, each one's checksum agreeing with its bytes,
 * each local header agreeing with its directory entry. So this reads the archive the way a reader
 * does — end of central directory first, then the directory, then each local header — and a writer
 * that got any of those wrong cannot produce a parse that agrees with itself.
 *
 * It is deliberately strict and deliberately small. It refuses rather than repairs, because every
 * repair it might perform is a defect it would hide.
 */

/** Signatures, as the format defines them. */
const LOCAL_HEADER = 0x04034b50;
const DIRECTORY_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

/**
 * One entry as the archive actually describes it.
 *
 * @typedef {{
 *   name: string, text: string, method: number, crc: number,
 *   compressedSize: number, uncompressedSize: number, offset: number,
 * }} ArchiveEntry
 */

/**
 * Parse a store-only ZIP archive.
 *
 * @param {Uint8Array} bytes
 * @returns {ArchiveEntry[]} In directory order.
 * @throws {Error} On anything a real reader would also refuse.
 */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (at) => view.getUint16(at, true);
  const read32 = (at) => view.getUint32(at, true);

  // The end record is found by scanning BACKWARDS for its signature, which is how a reader finds it
  // — its position is not fixed, because it may be followed by a comment.
  let end = -1;
  for (let at = bytes.length - 22; at >= 0; at -= 1) {
    if (read32(at) === END_OF_DIRECTORY) { end = at; break; }
  }
  if (end === -1) throw new Error('no end-of-central-directory record: this is not a ZIP archive');

  const count = read16(end + 10);
  const directorySize = read32(end + 12);
  const directoryStart = read32(end + 16);

  if (read16(end + 8) !== count) throw new Error('the end record disagrees with itself about how many entries there are');
  if (directoryStart + directorySize > bytes.length) throw new Error('the central directory runs past the end of the file');

  const decoder = new TextDecoder();
  /** @type {ArchiveEntry[]} */
  const entries = [];
  let at = directoryStart;

  for (let index = 0; index < count; index += 1) {
    if (read32(at) !== DIRECTORY_HEADER) throw new Error(`entry ${index} has no central directory header`);

    const method = read16(at + 10);
    const crc = read32(at + 16);
    const compressedSize = read32(at + 20);
    const uncompressedSize = read32(at + 24);
    const nameLength = read16(at + 28);
    const extraLength = read16(at + 30);
    const commentLength = read16(at + 32);
    const offset = read32(at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // The local header is read too, and checked against the directory. A writer that recorded one
    // size in the directory and another in the header produces a file that some readers accept and
    // others refuse, which is the worst outcome to discover on a coach's phone.
    if (read32(offset) !== LOCAL_HEADER) throw new Error(`${name}: no local header where the directory says one is`);
    const localNameLength = read16(offset + 26);
    const localExtraLength = read16(offset + 28);
    const localName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength));

    if (localName !== name) throw new Error(`the directory calls it ${name}, its local header calls it ${localName}`);
    if (read16(offset + 8) !== method) throw new Error(`${name}: local header and directory disagree about the method`);
    if (read32(offset + 14) !== crc) throw new Error(`${name}: local header and directory disagree about the checksum`);
    if (read32(offset + 18) !== compressedSize) throw new Error(`${name}: local header and directory disagree about the size`);

    const dataAt = offset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataAt, dataAt + compressedSize);

    entries.push({
      name,
      text: decoder.decode(data),
      method,
      crc,
      compressedSize,
      uncompressedSize,
      offset,
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  if (at !== directoryStart + directorySize) {
    throw new Error('the central directory is not the size the end record claims');
  }

  return entries;
}

/**
 * The cells that break writers, each one for a stated reason. Used by both writers' suites, so a
 * value that survives one and not the other is caught rather than assumed.
 */
export const NASTY = Object.freeze({
  /** Ends a quoted field in comma-separated text; ends an attribute in XML. */
  QUOTE: 'Chicken "thigh" 200g',
  /** Ends a field. */
  COMMA: 'Oats, milk, honey',
  /** Ends a record; a coach types two items on two lines. */
  NEWLINE: 'Oats 60g\nMilk 200ml',
  /** Escapes to `&amp;`, and escaping it last would double-escape everything else. */
  AMPERSAND: 'Yoghurt & fruit',
  /** Opens a tag. Written through unescaped, a spreadsheet application refuses the whole workbook. */
  LESS_THAN: '<200 kcal',
  /** Closes a tag. */
  GREATER_THAN: '>1L water',
  /** The other quote, which the workbook writer escapes and the text writer must not touch. */
  APOSTROPHE: "coach's note",
  /** All of them at once, because writers fail on combinations they pass one at a time. */
  EVERYTHING: 'a "quoted", <tagged> & \'noted\' cell\nwith a break',
});

/**
 * A table with everything a writer must survive in it, overridable.
 *
 * @param {Partial<import('./table.js').Table>} [overrides]
 * @returns {import('./table.js').Table}
 */
export function aTable(overrides = {}) {
  return {
    title: 'Diet — week of 3 August',
    headings: ['Day', 'Morning', 'Midday'],
    rows: [
      ['Monday', NASTY.AMPERSAND, NASTY.COMMA],
      ['Tuesday', NASTY.QUOTE, NASTY.LESS_THAN],
      ['Wednesday', NASTY.NEWLINE, NASTY.EVERYTHING],
    ],
    ...overrides,
  };
}

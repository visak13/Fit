/**
 * READING A STORE-ONLY ZIP BACK — the other half of `zip.js`, and the reason a backup is a backup.
 *
 * ## THIS IS A PROMOTION, NOT A SECOND READER
 *
 * A strict reader for exactly this format already existed, in `testing.js`, written so the workbook
 * suite could assert that the writer produced a well-formed archive rather than that its bytes
 * matched a pinned literal. It was test support and the application never imported it.
 *
 * Then a restore needed to read a backup the application itself had written, and there were two ways
 * to get one: write a reader, or ship the one that already worked. **Writing a second is the scar
 * this build keeps recording** — two implementations that both pass their own tests and disagree in
 * some corner nobody exercises, with nothing erroring anywhere. So the reader MOVED here and
 * `testing.js` re-exports it. There is one parser for this format and both callers use it.
 *
 * ## ONE THING WAS ADDED IN THE MOVE, AND IT IS THE DIFFERENCE BETWEEN THE TWO CALLERS
 *
 * The test-support version reported an entry's compression `method` and left the caller to look at
 * it. That is fine for a suite asserting `method === 0`. It is NOT fine for a restore, which would
 * take a DEFLATE-compressed entry's bytes, decode them as text, and hand the caller confident
 * rubbish — a silent wrong answer of exactly the shape this build keeps meeting.
 *
 * Nothing this application writes is ever compressed ({@link storeOnlyZip} stores every part), so a
 * compressed entry means the file came from somewhere else, and the honest answer is that this
 * application cannot read it. {@link readStoreOnlyZip} REFUSES it. The refusal names the entry, so a
 * coach handed the sentence can tell which file he chose.
 *
 * It refuses rather than repairs throughout, because every repair it might perform is a defect it
 * would hide.
 */

/** Signatures, as the format defines them. */
const LOCAL_HEADER = 0x04034b50;
const DIRECTORY_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

/** The only compression method this application writes, and therefore the only one it reads. */
export const STORED = 0;

/** How far back the end-of-directory record may be, allowing for a comment. */
const END_RECORD_LENGTH = 22;

/**
 * One entry as the archive actually describes it.
 *
 * @typedef {{
 *   name: string, text: string, method: number, crc: number,
 *   compressedSize: number, uncompressedSize: number, offset: number,
 * }} ArchiveEntry
 */

/**
 * Parse a store-only ZIP archive, refusing anything a real reader would also refuse AND anything
 * this application could only pretend to read.
 *
 * @param {Uint8Array} bytes
 * @returns {ArchiveEntry[]} In directory order.
 * @throws {Error} Naming what was wrong with the file, in a sentence.
 */
export function readStoreOnlyZip(bytes) {
  const entries = parseZip(bytes);

  const compressed = entries.filter((entry) => entry.method !== STORED);
  if (compressed.length > 0) {
    throw new Error(
      `this archive holds compressed entries (${compressed.map((e) => e.name).join(', ')}), and this `
      + 'application only writes and reads uncompressed ones. It was made by something else.',
    );
  }

  return entries;
}

/**
 * The archive's entries keyed by name, for a caller that wants one part rather than a walk.
 *
 * A repeated name is REFUSED rather than resolved: a ZIP may legally carry two entries with one
 * name, and "the last one wins" is a rule that decides silently which half of a backup gets
 * restored.
 *
 * @param {Uint8Array} bytes
 * @returns {Map<string, string>} Part name to its text.
 */
export function readStoreOnlyZipParts(bytes) {
  /** @type {Map<string, string>} */
  const parts = new Map();
  for (const entry of readStoreOnlyZip(bytes)) {
    if (parts.has(entry.name)) {
      throw new Error(`this archive holds two entries called "${entry.name}", so which one is the file is undecidable.`);
    }
    parts.set(entry.name, entry.text);
  }
  return parts;
}

/**
 * The format read the way a reader reads it: end record, then the directory, then each local header
 * checked against its directory entry. A writer that got any of those wrong cannot produce a parse
 * that agrees with itself.
 *
 * @param {Uint8Array} bytes @returns {ArchiveEntry[]}
 */
function parseZip(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('an archive is read from bytes.');
  }
  if (bytes.length < END_RECORD_LENGTH) {
    throw new Error('this file is too short to be a ZIP archive.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (at) => view.getUint16(at, true);
  const read32 = (at) => view.getUint32(at, true);

  // The end record is found by scanning BACKWARDS for its signature, which is how a reader finds it
  // — its position is not fixed, because it may be followed by a comment.
  let end = -1;
  for (let at = bytes.length - END_RECORD_LENGTH; at >= 0; at -= 1) {
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

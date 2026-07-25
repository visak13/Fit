/**
 * THE IN-MEMORY DOUBLE — and its fidelity is the entire risk of this approach.
 *
 * ## The one thing to understand before changing anything here
 *
 * This double exists so the foundation can be built and proven before the cloud step exists.
 * Its worth is exactly its faithfulness to what was MEASURED. A double that is kinder than
 * reality does not fail — that is the problem. It makes these tests pass, and moves the
 * breakage into the cloud step, where diagnosis is most expensive and where the guard that
 * should have caught it has already been signed off as tested.
 *
 * So two behaviours below look like bugs and are not. They are the measured platform, and
 * they are reproduced on purpose:
 *
 *  1. **{@link create} never checks whether the name is taken.** Two creates with one name
 *     produce two distinct files. No error, no de-duplication, no conflict.
 *  2. **{@link overwrite} accepts no precondition.** Two readers can both write; the second
 *     wins and the first is simply gone. The loss is DETECTABLE afterwards through the
 *     revision marker, and it is not preventable.
 *
 * Both are recorded with their provenance in `port.js` under `MEASURED_QUIRKS`, and both have
 * tests in `quirks.test.js` written as assertions about intent. If a future change makes
 * either behaviour "sensible", those tests fail. That is their job. The correct fix is to
 * restore the quirk, never to relax the test.
 *
 * ## What it does NOT model
 *
 * No live provider call happens here and no claim about one is made. Rate limits, quota,
 * partial uploads, resumable transfer, pagination and trash semantics are all absent — not
 * because they do not exist, but because this foundation does not depend on them, and a
 * double that guesses at behaviour nobody measured is worse than one that omits it.
 */

import { systemClock } from './clock.js';
import { Adversity } from './adversity.js';
import {
  DEFAULT_TIMEOUT_MS, RemoteFileNotFound, RemoteInvalidRequest, RemoteStoragePort,
  assertFileId, assertName, assertSpace, assertTimeout, normalizeContent,
} from './port.js';

/**
 * Declared, testable statements of what this double refuses to do.
 *
 * Written as data rather than left as an absence in the code, because an absence is
 * indistinguishable from an oversight: the next person to read `create` and notice it never
 * checks for a duplicate name would be entirely reasonable to "fix" it. These constants, and
 * the tests that assert on them, are how the intent survives that reading.
 */
export const DOUBLE_REFUSES = Object.freeze({
  /** FALSE. A same-name create makes a SECOND file. Measured, not assumed. */
  enforces_name_uniqueness: false,
  /** FALSE. Nothing here can stop a lost update. Detection is all that is on offer. */
  prevents_lost_update: false,
  /** The reason, kept beside the flag so the two cannot drift apart. */
  why: 'Both behaviours are measured properties of the real service. A double that corrected '
    + 'them would let the adopt-before-create guard and the conflict-surfacing code pass tests '
    + 'they never actually faced.',
});

/**
 * One stored file. Private to the double; callers only ever see metadata and content copies.
 */
class StoredFile {
  /**
   * @param {{fileId: string, space: string, name: string, content: Uint8Array, at: string}} args
   */
  constructor({ fileId, space, name, content, at }) {
    this.fileId = fileId;
    this.space = space;
    this.name = name;
    this.content = content;
    this.revision = 1;
    this.createdAt = at;
    this.modifiedAt = at;
  }

  /**
   * Replace the content, producing a new revision.
   *
   * Note what is NOT here: any comparison against an expected revision. There is nowhere to
   * put such a check because the port offers no way to express one, and the port offers no
   * way to express one because the service has none.
   *
   * @param {Uint8Array} content
   * @param {string} at
   */
  revise(content, at) {
    this.content = content;
    this.revision += 1;
    this.modifiedAt = at;
  }

  /**
   * A metadata snapshot. Fresh object every time, so a caller holding an earlier reading
   * still holds the OLD values after the file moves — which is precisely what makes
   * read-compare-write detection testable.
   * @returns {import('./port.js').RemoteFileMeta}
   */
  meta() {
    return {
      file_id: this.fileId,
      space: this.space,
      name: this.name,
      revision: this.revision,
      modified_at: this.modifiedAt,
      size: this.content.byteLength,
    };
  }
}

/**
 * An in-memory implementation of {@link RemoteStoragePort}, faithful to the measured quirks.
 */
export class InMemoryRemoteStorage extends RemoteStoragePort {
  /**
   * @param {{clock?: import('./clock.js').Clock, adversity?: Adversity, timeoutMs?: number,
   *          newFileId?: () => string}} [opts]
   */
  constructor(opts = {}) {
    super();
    /** @type {import('./clock.js').Clock} */
    this._clock = opts.clock ?? systemClock();
    /** @type {Adversity} */
    this._adversity = opts.adversity ?? new Adversity();
    /** @type {number} */
    this._defaultTimeoutMs = assertTimeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    /** @type {() => string} */
    this._newFileId = opts.newFileId ?? (() => globalThis.crypto.randomUUID());
    /**
     * Insertion-ordered, keyed by identifier — because the identifier is the only reliable
     * handle. Keying by name would build the uniqueness assumption the platform does not have
     * straight into the double, which is the exact failure this file exists to avoid.
     * @type {Map<string, StoredFile>}
     */
    this._files = new Map();
  }

  /** The switchboard a test drives to make calls fail, expire or crawl. @returns {Adversity} */
  get adversity() {
    return this._adversity;
  }

  /**
   * Resolve the deadline for one call and let the adversity switchboard decide whether it
   * proceeds. Every operation begins here — there is no path into the store that skips it.
   * @param {string} operation
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<void>}
   */
  async _begin(operation, opts = {}) {
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this._defaultTimeoutMs);
    await this._adversity.apply(operation, { timeoutMs, clock: this._clock });
  }

  /** @returns {string} The current instant, in the one canonical timestamp form this app writes. */
  _now() {
    return new Date(this._clock.now()).toISOString();
  }

  /**
   * @param {string} fileId
   * @returns {StoredFile}
   * @throws {RemoteFileNotFound}
   */
  _require(fileId) {
    const file = this._files.get(fileId);
    if (!file) throw new RemoteFileNotFound(fileId);
    return file;
  }

  /**
   * List a space.
   *
   * Returns metadata only, in creation order. The array MAY hold several entries sharing one
   * name — see {@link DOUBLE_REFUSES} — and a caller that reaches for the first match by name
   * is making an assumption the platform does not support.
   *
   * @param {string} space
   * @param {{namePrefix?: string, timeoutMs?: number}} [opts]
   * @returns {Promise<import('./port.js').RemoteFileMeta[]>}
   */
  async list(space, opts = {}) {
    assertSpace(space);
    if (opts.namePrefix !== undefined && typeof opts.namePrefix !== 'string') {
      throw new RemoteInvalidRequest('namePrefix, when given, must be text.');
    }
    await this._begin('list', opts);
    const out = [];
    for (const file of this._files.values()) {
      if (file.space !== space) continue;
      if (opts.namePrefix !== undefined && !file.name.startsWith(opts.namePrefix)) continue;
      out.push(file.meta());
    }
    return out;
  }

  /**
   * Create a file. ALWAYS creates.
   *
   * ## The measured quirk lives here
   *
   * There is deliberately no check for an existing file of the same name in this space. Not a
   * rejection, not a replacement, not a merge, not a warning. A second create under a name
   * already present yields a SECOND, DISTINCT file, and both are then returned by `list`.
   *
   * This was reached on real devices in about fifteen minutes of ordinary two-device use by
   * someone doing nothing wrong, and it is how a silent split of the key envelope happens.
   * The guard against it belongs to the CALLER — list the space, adopt what is there, and
   * create only when the listing is genuinely empty — and that guard can only be proven
   * against a store that will actually let the duplicate happen.
   *
   * @param {string} space
   * @param {{name: string, content: string|Uint8Array|ArrayBuffer}} file
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<import('./port.js').RemoteFileMeta>}
   */
  async create(space, file, opts = {}) {
    assertSpace(space);
    if (file === null || typeof file !== 'object') {
      throw new RemoteInvalidRequest('create needs a file with a name and content.');
    }
    assertName(file.name);
    const content = normalizeContent(file.content);
    await this._begin('create', opts);

    const stored = new StoredFile({
      fileId: this._newFileId(),
      space,
      name: file.name,
      content,
      at: this._now(),
    });
    this._files.set(stored.fileId, stored);
    return stored.meta();
  }

  /**
   * Read a file by identifier.
   *
   * The content is COPIED out. A caller that mutates what it received has not reached back
   * into the store — a real remote copy could not be changed that way, so neither can this.
   *
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<import('./port.js').RemoteFile>}
   */
  async read(fileId, opts = {}) {
    assertFileId(fileId);
    await this._begin('read', opts);
    const file = this._require(fileId);
    return { meta: file.meta(), content: new Uint8Array(file.content) };
  }

  /**
   * Overwrite a file by identifier, producing a new revision.
   *
   * ## The second measured quirk lives here
   *
   * No precondition is accepted, because none can be expressed and none would be honoured.
   * Whatever this write carries lands, whatever the file's revision has become since the
   * caller last looked. Two readers who both write means the second wins and the first is
   * gone, and nothing anywhere reports an error.
   *
   * The loss is DETECTABLE after the fact — the revision moved — and detection is the entire
   * basis of the conflict surfacing built above this port. It is not prevention, and a caller
   * that treats it as prevention has built on a lock that does not exist.
   *
   * @param {string} fileId
   * @param {string|Uint8Array|ArrayBuffer} content
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<import('./port.js').RemoteFileMeta>}
   */
  async overwrite(fileId, content, opts = {}) {
    assertFileId(fileId);
    const bytes = normalizeContent(content);
    await this._begin('overwrite', opts);
    const file = this._require(fileId);
    file.revise(bytes, this._now());
    return file.meta();
  }

  /**
   * Delete a file by identifier.
   *
   * Deletion is real and immediate: the identifier stops resolving. There is no trash and no
   * undo modelled here, because nothing in the foundation depends on one existing.
   *
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<void>}
   */
  async remove(fileId, opts = {}) {
    assertFileId(fileId);
    await this._begin('remove', opts);
    this._require(fileId);
    this._files.delete(fileId);
  }

  /**
   * The metadata a read-compare-write cycle needs, without pulling content.
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<import('./port.js').RemoteFileMeta>}
   */
  async stat(fileId, opts = {}) {
    assertFileId(fileId);
    await this._begin('stat', opts);
    return this._require(fileId).meta();
  }
}

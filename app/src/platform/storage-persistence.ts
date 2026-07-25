/**
 * ASKING THE BROWSER TO KEEP THE LOCAL DATABASE, AND RECORDING WHAT IT ACTUALLY SAID.
 *
 * The application's data lives on the device. A browser is allowed to evict that data under
 * storage pressure unless the origin has been granted persistent storage, so the application
 * asks for it. The asking is the easy half.
 *
 * The half that matters is that the ANSWER IS RECORDED RATHER THAN ASSUMED. A previous
 * measurement on the real installed device returned a literal affirmative with plenty of
 * headroom, so success is expected — but expecting an answer and observing one are different
 * things, and only one of them survives contact with a device we have not seen. Everything here
 * writes down what came back, including its type and including the failure, so a later question
 * about this device can be answered from a record instead of from an assumption.
 *
 * ## What a grant does NOT buy — this must never be softened anywhere in the application
 *
 * Persistence granted is not immunity. It stops the browser evicting data on its own under
 * storage pressure. It does NOT survive the user removing the installed icon from the home
 * screen, and it does NOT survive clearing site data; both destroy the local database outright.
 * No screen, no copy and no comment may promise otherwise, because the backup path is what
 * actually protects the coach's data and a false sense of safety is what stops people using it.
 */

/** Exactly what the browser told us, kept in the shape it was told to us. */
export interface PersistenceRecord {
  /** ISO timestamp of the attempt. */
  readonly askedAt: string;
  /** Whether this browser exposes the storage manager at all. */
  readonly supported: boolean;
  /** `persisted()` before asking; null when unsupported or when the query itself failed. */
  readonly alreadyPersisted: boolean | null;
  /** The literal resolved value of `persist()`. Null means it was never reached. */
  readonly literalAnswer: boolean | null;
  /** The JavaScript type of that value, so "true" and "'true'" remain distinguishable. */
  readonly literalAnswerType: string;
  /** Reported quota in bytes, when the browser offers an estimate. */
  readonly quotaBytes: number | null;
  /** Reported usage in bytes, when the browser offers an estimate. */
  readonly usageBytes: number | null;
  /** The failure message when the request threw or timed out; null on a clean answer. */
  readonly failure: string | null;
}

/** Where the record is kept so a later session can read what this device answered. */
export interface PersistenceJournal {
  read(): PersistenceRecord | null;
  write(record: PersistenceRecord): void;
}

/** The slice of `navigator.storage` used here, named so a test can supply its own. */
export interface StorageManagerLike {
  persist(): Promise<boolean>;
  persisted(): Promise<boolean>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

export interface StoragePersistenceDependencies {
  /** Absent on browsers with no storage manager, which is a supported and recorded state. */
  readonly storage?: StorageManagerLike;
  readonly journal: PersistenceJournal;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

/**
 * The sentence the interface must use when it talks about persistence. Kept as one constant so
 * there is a single place to read it and no room for a kinder rewording to appear on one screen.
 */
export const PERSISTENCE_IS_NOT_IMMUNITY =
  'Persistent storage only stops the browser clearing this data on its own. ' +
  'Removing the app icon from the home screen or clearing site data still deletes everything ' +
  'stored on this device. Keep backups.';

/** A browser primitive should answer immediately; anything longer is a hang, not slowness. */
const DEFAULT_TIMEOUT_MS = 10_000;

const STORAGE_UNSUPPORTED_TYPE = 'undefined';

/**
 * Runs a promise under a deadline so a browser that never settles cannot hang application start.
 *
 * @throws Error when the deadline passes first
 */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${description} did not answer within ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    // Cleared in the same scope that armed it, on both the success and the failure path.
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Asks for persistent storage once and journals the literal answer.
 *
 * Deliberately NOT a singleton or a module-level side effect: the caller decides when to ask, and
 * a test constructs it with its own storage manager and journal.
 */
export class StoragePersistence {
  readonly #storage?: StorageManagerLike;
  readonly #journal: PersistenceJournal;
  readonly #now: () => Date;
  readonly #timeoutMs: number;

  constructor({ storage, journal, now, timeoutMs }: StoragePersistenceDependencies) {
    this.#storage = storage;
    this.#journal = journal;
    this.#now = now ?? (() => new Date());
    this.#timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The answer this device gave last time it was asked, if it has been asked. */
  lastRecordedAnswer(): PersistenceRecord | null {
    return this.#journal.read();
  }

  /**
   * Asks the browser to persist this origin's storage, journals what came back, and returns it.
   *
   * Never throws. A refusal, an unsupported browser and a thrown request are all ANSWERS about
   * this device and are recorded as such; losing them to an exception would defeat the point.
   */
  async requestAndRecord(): Promise<PersistenceRecord> {
    const askedAt = this.#now().toISOString();

    if (!this.#storage) {
      return this.#record({
        askedAt,
        supported: false,
        alreadyPersisted: null,
        literalAnswer: null,
        literalAnswerType: STORAGE_UNSUPPORTED_TYPE,
        quotaBytes: null,
        usageBytes: null,
        failure: 'this browser exposes no storage manager, so persistence cannot be requested',
      });
    }

    const alreadyPersisted = await this.#readAlreadyPersisted();
    const estimate = await this.#readEstimate();

    try {
      const literalAnswer = await withTimeout(
        this.#storage.persist(),
        this.#timeoutMs,
        'navigator.storage.persist()',
      );
      return this.#record({
        askedAt,
        supported: true,
        alreadyPersisted,
        literalAnswer: literalAnswer as boolean,
        literalAnswerType: typeof literalAnswer,
        quotaBytes: estimate.quotaBytes,
        usageBytes: estimate.usageBytes,
        failure: null,
      });
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      console.error('[storage] the persistence request failed', error);
      return this.#record({
        askedAt,
        supported: true,
        alreadyPersisted,
        literalAnswer: null,
        literalAnswerType: STORAGE_UNSUPPORTED_TYPE,
        quotaBytes: estimate.quotaBytes,
        usageBytes: estimate.usageBytes,
        failure,
      });
    }
  }

  async #readAlreadyPersisted(): Promise<boolean | null> {
    try {
      return await withTimeout(
        this.#storage!.persisted(),
        this.#timeoutMs,
        'navigator.storage.persisted()',
      );
    } catch (error) {
      console.error('[storage] could not read the current persistence state', error);
      return null;
    }
  }

  async #readEstimate(): Promise<{ quotaBytes: number | null; usageBytes: number | null }> {
    if (!this.#storage?.estimate) return { quotaBytes: null, usageBytes: null };
    try {
      const estimate = await withTimeout(
        this.#storage.estimate(),
        this.#timeoutMs,
        'navigator.storage.estimate()',
      );
      return {
        quotaBytes: estimate.quota ?? null,
        usageBytes: estimate.usage ?? null,
      };
    } catch (error) {
      console.error('[storage] could not read the storage estimate', error);
      return { quotaBytes: null, usageBytes: null };
    }
  }

  #record(record: PersistenceRecord): PersistenceRecord {
    try {
      this.#journal.write(record);
    } catch (error) {
      // A journal that cannot be written still leaves the caller a correct answer in hand; only
      // the durability of the record is lost, and that loss is logged rather than hidden.
      console.error('[storage] the persistence answer could not be journalled', error);
    }
    return record;
  }
}

/** Where the answer is kept between sessions. */
export const PERSISTENCE_JOURNAL_KEY = 'fit.storage-persistence';

/**
 * The journal, kept in `localStorage`.
 *
 * This is a platform observation about the device, not application data — it is one small record,
 * it must be readable before the main database is opened, and it is worthless if copied to
 * another device. Application records belong in the local database and never here.
 */
export class LocalStorageJournal implements PersistenceJournal {
  readonly #storage: Storage;
  readonly #key: string;

  constructor(storage: Storage, key: string = PERSISTENCE_JOURNAL_KEY) {
    this.#storage = storage;
    this.#key = key;
  }

  read(): PersistenceRecord | null {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(this.#key);
    } catch (error) {
      console.error('[storage] the persistence journal could not be read', error);
      return null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as PersistenceRecord;
    } catch (error) {
      console.error('[storage] the persistence journal is not readable JSON; ignoring it', error);
      return null;
    }
  }

  write(record: PersistenceRecord): void {
    this.#storage.setItem(this.#key, JSON.stringify(record));
  }
}

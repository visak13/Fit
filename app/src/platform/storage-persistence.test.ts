/**
 * The persistence request is the one place in the shell where a wrong answer is silently
 * expensive: if a refusal were recorded as a grant, or a failure recorded as nothing at all, the
 * device's record would say something that was never measured.
 *
 * These run on Node's own test runner with no build step, deliberately matching the core's gate:
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LocalStorageJournal,
  PERSISTENCE_JOURNAL_KEY,
  StoragePersistence,
} from './storage-persistence.ts';
import type { PersistenceRecord, StorageManagerLike } from './storage-persistence.ts';

/** A journal that keeps records in memory, and can be told to fail. */
class RecordingJournal {
  written: PersistenceRecord[] = [];
  stored: PersistenceRecord | null = null;
  failOnWrite = false;

  read(): PersistenceRecord | null {
    return this.stored;
  }

  write(record: PersistenceRecord): void {
    if (this.failOnWrite) throw new Error('journal is full');
    this.written.push(record);
    this.stored = record;
  }
}

/** The narrowest possible stand-in for `navigator.storage`. */
function storageAnswering(answers: {
  persist: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
}): StorageManagerLike {
  return {
    persist: answers.persist,
    persisted: answers.persisted ?? (() => Promise.resolve(false)),
    estimate: answers.estimate,
  };
}

const AT = () => new Date('2026-07-25T09:00:00.000Z');

describe('the persistence request', () => {
  it('records a grant as the literal value the browser returned', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({
        persist: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ quota: 41_000_000_000, usage: 1_024 }),
      }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer, true);
    assert.equal(record.literalAnswerType, 'boolean');
    assert.equal(record.supported, true);
    assert.equal(record.failure, null);
    assert.equal(record.quotaBytes, 41_000_000_000);
    assert.equal(record.usageBytes, 1_024);
    assert.equal(record.askedAt, '2026-07-25T09:00:00.000Z');
    assert.deepEqual(journal.written, [record]);
  });

  it('records a refusal as a refusal, not as an absent answer', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({ persist: () => Promise.resolve(false) }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer, false);
    assert.equal(record.literalAnswerType, 'boolean');
    assert.equal(record.failure, null);
  });

  it('keeps a non-boolean answer distinguishable rather than coercing it', async () => {
    // A browser returning something other than a boolean is exactly the case where recording an
    // interpretation instead of the value would destroy the only evidence there was.
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({
        persist: () => Promise.resolve('true' as unknown as boolean),
      }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer as unknown, 'true');
    assert.equal(record.literalAnswerType, 'string');
  });

  it('records an unsupported browser without ever calling anything', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({ journal, now: AT });

    const record = await request.requestAndRecord();

    assert.equal(record.supported, false);
    assert.equal(record.literalAnswer, null);
    assert.equal(record.alreadyPersisted, null);
    assert.match(record.failure ?? '', /no storage manager/);
    assert.equal(journal.written.length, 1);
  });

  it('records a thrown request as a failure instead of throwing', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({
        persist: () => Promise.reject(new Error('denied by policy')),
      }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer, null);
    assert.equal(record.failure, 'denied by policy');
    assert.equal(record.supported, true);
  });

  it('gives up on a browser that never answers, rather than hanging the start', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({ persist: () => new Promise<boolean>(() => {}) }),
      journal,
      now: AT,
      timeoutMs: 20,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer, null);
    assert.match(record.failure ?? '', /did not answer within 20ms/);
  });

  it('still returns the answer when the journal cannot be written', async () => {
    const journal = new RecordingJournal();
    journal.failOnWrite = true;
    const request = new StoragePersistence({
      storage: storageAnswering({ persist: () => Promise.resolve(true) }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.literalAnswer, true);
    assert.equal(journal.written.length, 0);
  });

  it('reports the estimate as unreported rather than as zero when the browser has none', async () => {
    const journal = new RecordingJournal();
    const request = new StoragePersistence({
      storage: storageAnswering({ persist: () => Promise.resolve(true) }),
      journal,
      now: AT,
    });

    const record = await request.requestAndRecord();

    assert.equal(record.quotaBytes, null);
    assert.equal(record.usageBytes, null);
  });

  it('surfaces the previously recorded answer before asking again', async () => {
    const journal = new RecordingJournal();
    const earlier: PersistenceRecord = {
      askedAt: '2026-07-01T00:00:00.000Z',
      supported: true,
      alreadyPersisted: false,
      literalAnswer: true,
      literalAnswerType: 'boolean',
      quotaBytes: 1,
      usageBytes: 0,
      failure: null,
    };
    journal.stored = earlier;

    const request = new StoragePersistence({
      storage: storageAnswering({ persist: () => Promise.resolve(true) }),
      journal,
      now: AT,
    });

    assert.deepEqual(request.lastRecordedAnswer(), earlier);
  });
});

describe('the journal kept in local storage', () => {
  /** The narrowest stand-in for `window.localStorage`. */
  class MemoryStorage {
    #entries = new Map<string, string>();

    getItem(key: string): string | null {
      return this.#entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
      this.#entries.set(key, value);
    }
  }

  const anAnswer: PersistenceRecord = {
    askedAt: '2026-07-25T09:00:00.000Z',
    supported: true,
    alreadyPersisted: false,
    literalAnswer: true,
    literalAnswerType: 'boolean',
    quotaBytes: 41_000_000_000,
    usageBytes: 1_024,
    failure: null,
  };

  it('round-trips a record under the documented key', () => {
    const storage = new MemoryStorage();
    const journal = new LocalStorageJournal(storage as unknown as Storage);

    journal.write(anAnswer);

    assert.deepEqual(journal.read(), anAnswer);
    assert.notEqual(storage.getItem(PERSISTENCE_JOURNAL_KEY), null);
  });

  it('reports no record rather than inventing one when nothing was written', () => {
    const journal = new LocalStorageJournal(new MemoryStorage() as unknown as Storage);

    assert.equal(journal.read(), null);
  });

  it('ignores unreadable contents instead of crashing the start', () => {
    const storage = new MemoryStorage();
    storage.setItem(PERSISTENCE_JOURNAL_KEY, 'not json at all');
    const journal = new LocalStorageJournal(storage as unknown as Storage);

    assert.equal(journal.read(), null);
  });
});

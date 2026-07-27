/**
 * THE REAL IMPLEMENTATION, DRIVEN THROUGH THE PORT'S OWN CONTRACT.
 *
 * ## WHAT A GREEN RUN OF THIS FILE PROVES, AND WHAT IT DOES NOT
 *
 * It proves that `google-drive-remote.ts` behaves correctly GIVEN THE RESPONSES MODELLED HERE. It
 * proves NOTHING about Google. No request in this file leaves the machine: the storage is driven
 * through an injected transport wired to {@link FakeDrive}, which is a model of a service and not a
 * service. That is the same claim `core/remote/port.js` makes about the in-memory double in
 * `PROVES_NOTHING_ABOUT_THE_PLATFORM`, and it is not weakened by the implementation being real.
 *
 * The things this build MEASURED on real devices are two: the hidden space does not enforce name
 * uniqueness, and both narrow scopes are sufficient. Everything else about the service below —
 * endpoint shapes, field names, refusal reason words — is taken from the published interface and is
 * DOCUMENTED, NOT MEASURED. The fake is worth exactly its fidelity to that, and where it is wrong
 * this suite will be confidently, uselessly green.
 *
 * ## WHY THE FAKE IS A SERVICE AND NOT A STUBBED TRANSPORT
 *
 * A transport returning canned answers proves the parsing. It cannot produce the two measured quirks,
 * because both are properties of a store holding state across calls: the same name creating a SECOND
 * file, and a second writer landing between another writer's read and its write. Those are the two
 * behaviours the whole port exists to keep honest, so the fake holds files.
 *
 * ## AND IT IS DELIBERATELY NOT KINDER THAN REALITY
 *
 * {@link FakeDrive} performs no name check, accepts no precondition, and PAGES ITS LISTINGS. The
 * paging is not decoration: a second key envelope under one name may land on the second page, and an
 * implementation that read only the first page would report the space as holding exactly one — which
 * is the answer that lets the adopt-before-create guard write the duplicate it exists to prevent.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { FAILURE, classifyFailure, describeFailure } from '../../core/outbox/classify.js';
import {
  PORT_CAPABILITIES,
  PORT_OPERATIONS,
  RemoteCredentialExpired,
  RemoteError,
  RemoteFileNotFound,
  RemoteInvalidRequest,
  RemoteStoragePort,
  RemoteTimeout,
  RemoteUnavailable,
  SPACES,
  bytesToText,
  hasMoved,
  textToBytes,
} from '../../core/remote/remote.js';
import type { Clock } from '../../core/remote/clock.js';

import {
  DRIVE_SPACES,
  GoogleDriveRemoteStorage,
  REFUSED_CODE,
  UNREADABLE_RESPONSE_CODE,
  metaFrom,
  refusalFor,
} from './google-drive-remote.ts';
import type { HttpRequestLike, HttpResponseLike, HttpTransport } from './google-drive-remote.ts';
import { CarriedToken } from './google-identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A clock a test drives, so a deadline is an assertion rather than a stopwatch
// ═══════════════════════════════════════════════════════════════════════════════════════════════

interface TestClock extends Clock {
  /** Let every deadline currently being waited on expire. */
  passEveryDeadline(): void;
  /** How many deadlines are being waited on right now. */
  readonly waiting: number;
}

/**
 * A clock whose sleep resolves ONLY when the test says so.
 *
 * The core's `manualClock` advances virtual time on the next microtask, which makes a race between a
 * sleep and a request a race between two microtasks — decided by scheduling order rather than by the
 * test. This one settles that: a deadline expires when, and only when, a test expires it, so "the
 * request won" and "the deadline won" are two different runs rather than two different days.
 */
function testClock(start = '2026-07-25T00:00:00.000Z'): TestClock {
  let at = Date.parse(start);
  let pending: (() => void)[] = [];
  return {
    now: () => at,
    sleep: (ms: number) => new Promise<void>((resolve) => {
      pending.push(() => { at += ms; resolve(); });
    }),
    passEveryDeadline() {
      const due = pending;
      pending = [];
      for (const expire of due) expire();
    },
    get waiting() { return pending.length; },
  };
}

/** A token that is live and says nothing about anybody. */
function aToken(): CarriedToken {
  return new CarriedToken('not-a-real-access-token', '2099-01-01T00:00:00.000Z', []);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The fake service
// ═══════════════════════════════════════════════════════════════════════════════════════════════

interface StoredFile {
  id: string;
  name: string;
  space: string;
  version: number;
  modifiedTime: string;
  content: Uint8Array;
  trashed: boolean;
}

interface ArmedRefusal {
  remaining: number;
  status: number;
  reason: string;
  match: ((url: URL, request: HttpRequestLike) => boolean) | null;
}

function jsonResponse(status: number, body: unknown): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer,
  };
}

function bytesResponse(status: number, bytes: Uint8Array): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new Error('this answer is bytes, not an object'); },
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  };
}

/** Split a multipart body back into its descriptor and its bytes, so a test can check both. */
function parseMultipart(body: Uint8Array, contentType: string): {
  descriptor: { name?: string; parents?: string[] };
  content: Uint8Array;
} {
  const boundary = contentType.split('boundary=')[1] ?? '';
  assert.notEqual(boundary, '', 'a multipart body must declare its separator');
  const buffer = Buffer.from(body);
  const separator = Buffer.from(`--${boundary}`);

  const sections: Buffer[] = [];
  let at = buffer.indexOf(separator);
  while (at >= 0) {
    const from = at + separator.length;
    const next = buffer.indexOf(separator, from);
    if (next < 0) break;
    sections.push(buffer.subarray(from, next));
    at = next;
  }

  const bodies = sections.map((section) => {
    const blank = section.indexOf('\r\n\r\n');
    assert.ok(blank >= 0, 'every part carries headers, then a blank line, then its body');
    // The trailing CRLF belongs to the separator that follows, not to the part.
    return section.subarray(blank + 4, section.length - 2);
  });

  assert.equal(bodies.length, 2, 'a create carries exactly two parts: the descriptor and the bytes');
  return {
    descriptor: JSON.parse((bodies[0] as Buffer).toString('utf8')) as { name?: string; parents?: string[] },
    content: new Uint8Array(bodies[1] as Buffer),
  };
}

/**
 * A model of the storage service: it holds files, it pages, and it is no kinder than what was
 * measured.
 */
class FakeDrive {
  readonly files = new Map<string, StoredFile>();
  readonly requests: { url: URL; request: HttpRequestLike }[] = [];
  /** Deliberately smaller than the implementation asks for. A service may page however it likes. */
  pageSize = 2;
  /** When true every listing hands back another page token, for ever. */
  endlessPages = false;
  /** When true a request is accepted and simply never answered. */
  hangs = false;
  /** Replaces the metadata a create hands back, for the unreadable-answer cases. */
  malformedCreateResponse: unknown = null;

  #nextId = 0;
  #now = Date.parse('2026-07-25T00:00:00.000Z');
  readonly #refusals: ArmedRefusal[] = [];

  /** Advance the service's own clock, so two writes carry different modification times. */
  advance(ms: number): void { this.#now += ms; }

  /** Arm the next matching call to be refused. */
  refuseNext(
    status: number,
    reason: string,
    opts: { times?: number; match?: (url: URL, request: HttpRequestLike) => boolean } = {},
  ): this {
    this.#refusals.push({
      remaining: opts.times ?? 1, status, reason, match: opts.match ?? null,
    });
    return this;
  }

  /** Put a file there without going through the port, for arranging a starting state. */
  seed(space: string, name: string, text: string): StoredFile {
    return this.#create(space, name, textToBytes(text));
  }

  get transport(): HttpTransport {
    return async (rawUrl, request) => {
      const url = new URL(rawUrl);
      this.requests.push({ url, request });

      const armed = this.#refusals.find(
        (r) => r.remaining > 0 && (r.match === null || r.match(url, request)),
      );
      if (armed) {
        armed.remaining -= 1;
        return jsonResponse(armed.status, {
          error: {
            code: armed.status,
            message: 'a message this application must never keep',
            errors: [{ reason: armed.reason, domain: 'global' }],
          },
        });
      }

      if (this.hangs) return new Promise<HttpResponseLike>(() => {});

      return this.#route(url, request);
    };
  }

  #route(url: URL, request: HttpRequestLike): HttpResponseLike {
    const path = url.pathname;
    const isUpload = path.startsWith('/upload/');
    const tail = path.replace('/upload', '').replace('/drive/v3/files', '');
    const fileId = tail.startsWith('/') ? decodeURIComponent(tail.slice(1)) : '';

    if (request.method === 'GET' && fileId === '') return this.#list(url);

    if (request.method === 'POST' && isUpload && fileId === '') {
      const parsed = parseMultipart(
        request.body as Uint8Array,
        request.headers['Content-Type'] ?? '',
      );
      const space = (parsed.descriptor.parents ?? []).includes(DRIVE_SPACES[SPACES.HIDDEN] as string)
        ? SPACES.HIDDEN
        : SPACES.VISIBLE;
      const created = this.#create(space, parsed.descriptor.name ?? '', parsed.content);
      if (this.malformedCreateResponse !== null) return jsonResponse(200, this.malformedCreateResponse);
      return jsonResponse(200, this.#describe(created));
    }

    const file = this.files.get(fileId);
    if (file === undefined || file.trashed) {
      return jsonResponse(404, { error: { code: 404, errors: [{ reason: 'notFound' }] } });
    }

    if (request.method === 'GET') {
      if (url.searchParams.get('alt') === 'media') return bytesResponse(200, file.content);
      return jsonResponse(200, this.#describe(file));
    }
    if (request.method === 'PATCH') {
      // NO PRECONDITION IS CONSULTED, because none was sent and none could be. Whatever this write
      // carries lands, whatever the file has become since the writer last looked.
      file.content = new Uint8Array(request.body as Uint8Array);
      file.version += 1;
      file.modifiedTime = new Date(this.#now).toISOString();
      return jsonResponse(200, this.#describe(file));
    }
    if (request.method === 'DELETE') {
      this.files.delete(fileId);
      return jsonResponse(204, {});
    }
    return jsonResponse(400, { error: { code: 400, errors: [{ reason: 'badRequest' }] } });
  }

  #list(url: URL): HttpResponseLike {
    const wanted = url.searchParams.get('spaces');
    const space = wanted === DRIVE_SPACES[SPACES.HIDDEN] ? SPACES.HIDDEN : SPACES.VISIBLE;
    const all = [...this.files.values()].filter((f) => f.space === space && !f.trashed);

    const from = Number(url.searchParams.get('pageToken') ?? '0');
    const page = all.slice(from, from + this.pageSize);
    const next = this.endlessPages || from + this.pageSize < all.length
      ? String(from + this.pageSize)
      : null;

    return jsonResponse(200, {
      files: page.map((f) => this.#describe(f)),
      ...(next === null ? {} : { nextPageToken: next }),
    });
  }

  /**
   * NO NAME CHECK OF ANY KIND — the measured quirk lives here.
   *
   * A second create under a name already present yields a SECOND, DISTINCT file, and both are then
   * returned by a listing. Sanding this smooth would let the adopt-before-create guard pass a test it
   * never actually faced.
   */
  #create(space: string, name: string, content: Uint8Array): StoredFile {
    this.#nextId += 1;
    const file: StoredFile = {
      id: `fake-file-${this.#nextId}`,
      name,
      space,
      version: 1,
      modifiedTime: new Date(this.#now).toISOString(),
      content: new Uint8Array(content),
      trashed: false,
    };
    this.files.set(file.id, file);
    return file;
  }

  /**
   * What the service hands back — POISONED, because a real one is.
   *
   * Strings for the numeric fields, as the published interface documents. And then the fields the
   * whitelist exists to drop: the account holder's own address in plain sight, his folder identifier,
   * and a link whose segment carries the address ENCODED so a plaintext search of it comes back clean.
   *
   * THIS WAS ADDED AFTER BREAKING THE WHITELIST ON PURPOSE. With a clean answer here, turning
   * {@link metaFrom} into a passthrough failed exactly ONE test — the one that hands it the poisoned
   * object directly — while the round-trip sweep stayed green over metadata that had just been
   * spread from the response. A fake that answers more politely than the service makes every sweep
   * downstream of it worth nothing, which is the whole reason the in-memory double reproduces its
   * quirks rather than sanding them smooth.
   */
  #describe(file: StoredFile): Record<string, unknown> {
    const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
    return {
      id: file.id,
      name: file.name,
      version: String(file.version),
      modifiedTime: file.modifiedTime,
      size: String(file.content.byteLength),
      spaces: [DRIVE_SPACES[file.space] as string],
      owners: [{ emailAddress: COACH_ADDRESS, displayName: 'The Coach' }],
      lastModifyingUser: { emailAddress: COACH_ADDRESS },
      parents: [DRIVE_FOLDER_ID],
      webViewLink: `https://www.google.com/calendar/event?eid=${eid}`,
    };
  }
}

/** A storage wired to a fresh fake, with the deadline in the test's hands. */
function aStorage(opts: { token?: () => CarriedToken | null } = {}): {
  storage: GoogleDriveRemoteStorage;
  service: FakeDrive;
  clock: TestClock;
} {
  const service = new FakeDrive();
  const clock = testClock();
  const storage = new GoogleDriveRemoteStorage({
    token: opts.token ?? (() => aToken()),
    transport: service.transport,
    clock,
    newBoundary: () => 'a-fixed-separator-for-this-test',
  });
  return { storage, service, clock };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Shape: it IS the port, and it is still six operations wide
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the implementation is the port, filled in', () => {
  it('is a RemoteStoragePort, so anything holding a port can hold this', () => {
    const { storage } = aStorage();
    assert.ok(storage instanceof RemoteStoragePort);
    for (const operation of PORT_OPERATIONS) {
      assert.equal(typeof (storage as unknown as Record<string, unknown>)[operation], 'function');
    }
  });

  it('adds no seventh operation — the narrowness survived the fill-in', () => {
    const own = Object.getOwnPropertyNames(GoogleDriveRemoteStorage.prototype)
      .filter((name) => name !== 'constructor');
    assert.deepEqual(own.sort(), [...PORT_OPERATIONS].sort(),
      'every public method must be one the port declared. A seventh is one more thing the port '
      + 'promises that only this provider can keep.');
  });

  it('leaves the port\'s refusal to promise a conditional write exactly where it was', () => {
    assert.equal(PORT_CAPABILITIES.conditional_write, false,
      'this implementation may not flip this. It is declared as data so that changing it is a code '
      + 'change a test catches, and this is that test looking from the other side.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The six operations
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the six operations', () => {
  it('creates a file that reads back complete and byte-identical', async () => {
    const { storage } = aStorage();
    const meta = await storage.create(SPACES.VISIBLE, { name: 'backup.json', content: '{"a":1}' });

    assert.equal(meta.name, 'backup.json');
    assert.equal(meta.space, SPACES.VISIBLE);
    assert.equal(meta.revision, 1);
    assert.equal(meta.size, 7);
    assert.ok(meta.file_id.length > 0, 'the identifier is the handle, so there must be one');

    const read = await storage.read(meta.file_id);
    assert.equal(bytesToText(read.content), '{"a":1}');
    assert.deepEqual(read.meta, meta);
  });

  it('carries arbitrary bytes through untouched, which ciphertext depends on', async () => {
    const { storage } = aStorage();
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 13, 10, 45, 45]);
    const meta = await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: bytes });
    const read = await storage.read(meta.file_id);

    assert.deepEqual([...read.content], [...bytes],
      'the envelope is ciphertext. A byte re-encoded on the way out is a key family lost.');
  });

  it('does not let a caller reach back into the store by mutating what it handed over', async () => {
    const { storage } = aStorage();
    const source = new Uint8Array([1, 2, 3]);
    const meta = await storage.create(SPACES.VISIBLE, { name: 'b.bin', content: source });
    source[0] = 99;

    const read = await storage.read(meta.file_id);
    assert.equal(read.content[0], 1);
    read.content[0] = 77;
    assert.equal((await storage.read(meta.file_id)).content[0], 1);
  });

  it('overwrites into a new revision with a new modification time', async () => {
    const { storage, service } = aStorage();
    const first = await storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'one' });
    service.advance(60_000);
    const second = await storage.overwrite(first.file_id, 'two-longer');

    assert.equal(second.file_id, first.file_id, 'an overwrite is the same file');
    assert.equal(second.revision, first.revision + 1, 'the marker moved — detection depends on it');
    assert.notEqual(second.modified_at, first.modified_at);
    assert.equal(second.size, 10);
    assert.equal(bytesToText((await storage.read(first.file_id)).content), 'two-longer');
  });

  it('stats the same metadata a read returns, without pulling the payload', async () => {
    const { storage, service } = aStorage();
    const meta = await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'abcd' });
    const before = service.requests.length;

    const stat = await storage.stat(meta.file_id);
    assert.deepEqual(stat, meta);
    assert.equal(service.requests.length, before + 1,
      'one request, not two — the point of stat is that it does not fetch the bytes');
  });

  it('removes by identifier, and the identifier then stops resolving on every operation', async () => {
    const { storage } = aStorage();
    const meta = await storage.create(SPACES.VISIBLE, { name: 'gone.json', content: 'x' });
    await storage.remove(meta.file_id);

    await assert.rejects(() => storage.read(meta.file_id), RemoteFileNotFound);
    await assert.rejects(() => storage.stat(meta.file_id), RemoteFileNotFound);
    await assert.rejects(() => storage.overwrite(meta.file_id, 'y'), RemoteFileNotFound);
    await assert.rejects(() => storage.remove(meta.file_id), RemoteFileNotFound);
  });

  it('lists metadata only, and narrows by name PREFIX rather than by containment', async () => {
    const { storage } = aStorage();
    await storage.create(SPACES.VISIBLE, { name: 'backup-a.json', content: '1' });
    await storage.create(SPACES.VISIBLE, { name: 'backup-b.json', content: '22' });
    await storage.create(SPACES.VISIBLE, { name: 'not-a-backup-c.json', content: '333' });

    const all = await storage.list(SPACES.VISIBLE);
    assert.equal(all.length, 3);
    assert.equal(Object.prototype.hasOwnProperty.call(all[0] as object, 'content'), false,
      'a listing is metadata only; pulling every payload to answer "what is here" is the wrong shape');

    const narrowed = await storage.list(SPACES.VISIBLE, { namePrefix: 'backup-' });
    assert.deepEqual(narrowed.map((m) => m.name), ['backup-a.json', 'backup-b.json'],
      'the third name CONTAINS the prefix and does not START with it. The service\'s own name query '
      + 'is a contains match, so leaving the filtering to it would have returned three.');
  });

  it('lists an empty space as empty rather than failing', async () => {
    const { storage } = aStorage();
    assert.deepEqual(await storage.list(SPACES.HIDDEN), []);
  });

  it('keeps the two spaces separate', async () => {
    const { storage } = aStorage();
    await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'k' });
    assert.deepEqual(await storage.list(SPACES.VISIBLE), []);
    assert.equal((await storage.list(SPACES.HIDDEN)).length, 1);
  });

  it('addresses the hidden space as a parent and the visible space as no parent at all', async () => {
    const { storage, service } = aStorage();
    await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'k' });
    await storage.create(SPACES.VISIBLE, { name: 'v.json', content: 'v' });

    const creates = service.requests.filter((r) => r.request.method === 'POST');
    const hidden = parseMultipart(
      creates[0]?.request.body as Uint8Array, creates[0]?.request.headers['Content-Type'] ?? '');
    const visible = parseMultipart(
      creates[1]?.request.body as Uint8Array, creates[1]?.request.headers['Content-Type'] ?? '');

    assert.deepEqual(hidden.descriptor.parents, ['appDataFolder']);
    assert.equal(visible.descriptor.parents, undefined,
      'the visible space is the account\'s ordinary space. Naming a folder here would be inventing '
      + 'a concept the port does not have.');
  });

  it('writes modification times in the one canonical form the rest of the app writes', async () => {
    const { storage, service } = aStorage();
    const seeded = service.seed(SPACES.VISIBLE, 'seconds-only.json', 'x');
    // A service is free to answer with second precision. The port declares milliseconds.
    seeded.modifiedTime = '2026-07-25T00:00:00Z';

    const meta = await storage.stat(seeded.id);
    assert.equal(meta.modified_at, '2026-07-25T00:00:00.000Z');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Quirk one — no name uniqueness, and the listing that must not stop early
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('measured quirk one — the hidden space does not enforce name uniqueness', () => {
  it('a same-name create in the hidden space yields TWO files, not one', async () => {
    const { storage } = aStorage();
    const first = await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'one' });
    const second = await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'two' });

    assert.notEqual(first.file_id, second.file_id);
    assert.equal(first.revision, 1);
    assert.equal(second.revision, 1, 'the second is a NEW file, not a revision of the first');
    assert.equal(bytesToText((await storage.read(first.file_id)).content), 'one',
      'and the first was not replaced — this is a silent split, not an overwrite');

    const listed = await storage.list(SPACES.HIDDEN);
    assert.equal(listed.length, 2);
    assert.deepEqual(listed.map((m) => m.name), ['key-envelope.json', 'key-envelope.json']);
  });

  it('THE ONE THIS IMPLEMENTATION COULD BREAK: the second envelope is on the SECOND page, and it is still found',
    async () => {
      const { storage, service } = aStorage();
      service.pageSize = 1;
      await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'one' });
      await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'two' });

      const listed = await storage.list(SPACES.HIDDEN);
      assert.equal(listed.length, 2,
        'an implementation that read only the first page would return ONE here, and that answer is '
        + 'indistinguishable from a space that genuinely holds one. The adopt-before-create guard '
        + 'would then adopt the first and the split would never be seen.');
      assert.equal(service.requests.length > 3, true, 'and it really did have to ask for a second page');
    });

  it('all three cases the guard has to face are reachable: none, one, and many', async () => {
    const { storage } = aStorage();
    assert.equal((await storage.list(SPACES.HIDDEN)).length, 0);
    await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'a' });
    assert.equal((await storage.list(SPACES.HIDDEN)).length, 1);
    await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'b' });
    await storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'c' });
    assert.equal((await storage.list(SPACES.HIDDEN)).length, 3,
      'the third case is the one nobody had on their list until the spike stumbled into it');
  });

  it('deleting one leaves its same-named sibling alone', async () => {
    const { storage } = aStorage();
    const first = await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'a' });
    const second = await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'b' });
    await storage.remove(first.file_id);

    assert.deepEqual((await storage.list(SPACES.HIDDEN)).map((m) => m.file_id), [second.file_id]);
    assert.equal(bytesToText((await storage.read(second.file_id)).content), 'b');
  });

  it('REFUSES a listing it cannot finish rather than returning a partial one', async () => {
    const { storage, service } = aStorage();
    service.endlessPages = true;
    await storage.create(SPACES.HIDDEN, { name: 'k.json', content: 'a' });

    await assert.rejects(() => storage.list(SPACES.HIDDEN), (error: unknown) => {
      assert.ok(error instanceof RemoteError);
      assert.equal(error.code, REFUSED_CODE);
      assert.equal(error.retryable, false);
      assert.equal(error.needsReauth, false, 'a service that pages for ever is not a consent problem');
      return true;
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Quirk two — no conditional write, so read-compare-write is detection and not a lock
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('measured quirk two — there is no conditional write, and none is smuggled in', () => {
  it('a lost update GENUINELY OCCURS: two readers both write, the second wins, the first is gone',
    async () => {
      const { storage, service } = aStorage();
      const created = await storage.create(SPACES.VISIBLE, { name: 'snapshot.json', content: 'origin' });

      const laptopHeld = await storage.stat(created.file_id);
      const phoneHeld = await storage.stat(created.file_id);

      service.advance(1_000);
      await storage.overwrite(phoneHeld.file_id, 'from the phone');
      service.advance(1_000);
      await storage.overwrite(laptopHeld.file_id, 'from the laptop');

      assert.equal(bytesToText((await storage.read(created.file_id)).content), 'from the laptop',
        'the phone\'s write is simply gone, and nothing anywhere reported an error');
    });

  it('the loss leaves a DETECTABLE trace, which is the whole basis of conflict surfacing', async () => {
    const { storage, service } = aStorage();
    const created = await storage.create(SPACES.VISIBLE, { name: 's.json', content: 'origin' });
    const held = await storage.stat(created.file_id);

    service.advance(1_000);
    await storage.overwrite(created.file_id, 'the other device');

    assert.equal(hasMoved(held, await storage.stat(created.file_id)), true);
  });

  it('DETECTION IS NOT PREVENTION: a caller that checks first still loses the write', async () => {
    const { storage, service } = aStorage();
    const created = await storage.create(SPACES.VISIBLE, { name: 's.json', content: 'origin' });
    const held = await storage.stat(created.file_id);

    // The careful sequence, in full: read, compare, write. Nothing on this port closes the window
    // between the compare and the write, and this is that window being used.
    assert.equal(hasMoved(held, await storage.stat(created.file_id)), false, 'it had not moved when we looked');
    service.advance(1_000);
    await storage.overwrite(created.file_id, 'the other device landed here');
    await storage.overwrite(created.file_id, 'and ours went on top anyway');

    assert.equal(bytesToText((await storage.read(created.file_id)).content), 'and ours went on top anyway');
  });

  it('sends NO precondition on the wire — not a header, not a parameter', async () => {
    const { storage, service } = aStorage();
    const created = await storage.create(SPACES.VISIBLE, { name: 's.json', content: 'a' });
    service.requests.length = 0;
    await storage.overwrite(created.file_id, 'b');

    const write = service.requests[0];
    assert.ok(write !== undefined);
    const headerNames = Object.keys(write.request.headers).map((h) => h.toLowerCase());
    for (const forbidden of ['if-match', 'if-none-match', 'if-unmodified-since', 'x-goog-if-generation-match']) {
      assert.equal(headerNames.includes(forbidden), false, `the write carried ${forbidden}`);
    }
    for (const [name] of write.url.searchParams) {
      assert.equal(name.toLowerCase().includes('match'), false, `the write carried a ${name} parameter`);
    }
  });

  it('names no precondition in its CODE either, and the scan can see one where there is one', () => {
    const code = codeOf('google-drive-remote.ts');
    for (const forbidden of ['ifMetagenerationMatch', 'ifGenerationMatch', 'If-Match', 'ifVersionMatch']) {
      assert.equal(code.includes(forbidden), false,
        `the implementation names ${forbidden}. Offering a lock the service cannot honour is worse `
        + 'than offering nothing: every caller built on the promise is wrong somewhere else.');
    }
    assert.ok(codeOf('google-drive-remote.test.ts').includes('ifMetagenerationMatch'),
      'the scan finds the word in a file that genuinely contains it — this one. Without this the '
      + 'clean result above is what a scan pointed at nothing also produces.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The three deliberate failures — each one demands a DIFFERENT response
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('failure one — transient: keep the work, retry later, and never ask him to re-authorise', () => {
  it('a service that is temporarily unwell is retryable and is NOT a consent problem', async () => {
    const { storage, service } = aStorage();
    service.refuseNext(503, 'backendError');

    await assert.rejects(() => storage.list(SPACES.VISIBLE), (error: unknown) => {
      assert.ok(error instanceof RemoteUnavailable);
      assert.equal(error.retryable, true);
      assert.equal(error.needsReauth, false);
      assert.equal(classifyFailure(error), FAILURE.TRANSIENT);
      return true;
    });
  });

  it('THE MAPPING THAT MATTERS MOST: being asked to slow down is transient, not expired', async () => {
    const { storage, service } = aStorage();
    service.refuseNext(403, 'userRateLimitExceeded');

    await assert.rejects(() => storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof RemoteError);
        assert.equal(error.needsReauth, false,
          'a 403 for throttling typed as a credential problem tells the coach his connection '
          + 'expired and sends him through a Google window that fixes nothing');
        assert.equal(classifyFailure(error), FAILURE.TRANSIENT);
        return true;
      });
  });

  it('the work SURVIVES the failure and lands on the retry', async () => {
    const { storage, service } = aStorage();
    service.refuseNext(503, 'backendError');
    await assert.rejects(() => storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' }));
    assert.equal(service.files.size, 0, 'and the failed call changed nothing');

    const meta = await storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' });
    assert.equal(bytesToText((await storage.read(meta.file_id)).content), 'x');
  });
});

describe('failure two — the credential: keep the work and ask him to tap', () => {
  it('having no live token is the ordinary cold start, and it is typed as such', async () => {
    const { storage, service } = aStorage({ token: () => null });

    await assert.rejects(() => storage.list(SPACES.VISIBLE), (error: unknown) => {
      assert.ok(error instanceof RemoteCredentialExpired);
      assert.equal(error.needsReauth, true, 'retrying alone never renews it — it needs a gesture');
      assert.equal(classifyFailure(error), FAILURE.CREDENTIAL);
      return true;
    });
    assert.equal(service.requests.length, 0, 'and nothing was sent, because there was nothing to send it with');
  });

  it('a refused authorisation is the same state, so the coach meets one sentence and not two', async () => {
    const { storage, service } = aStorage();
    service.refuseNext(401, 'authError');
    await assert.rejects(() => storage.stat('fake-file-1'), RemoteCredentialExpired);
  });

  it('it is never retried silently for ever: the classification stops the queue burning attempts', async () => {
    const { storage, service } = aStorage();
    service.refuseNext(401, 'authError', { times: 2 });
    await assert.rejects(() => storage.list(SPACES.VISIBLE), (error: unknown) => {
      assert.equal(classifyFailure(error), FAILURE.CREDENTIAL);
      return true;
    });
  });
});

describe('failure three — the deadline: the outcome is UNKNOWN and stays unknown', () => {
  it('a call that outruns its deadline fails as a timeout that says so', async () => {
    const { storage, service, clock } = aStorage();
    service.hangs = true;

    const call = storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' }, { timeoutMs: 30_000 });
    await Promise.resolve();
    clock.passEveryDeadline();

    await assert.rejects(() => call, (error: unknown) => {
      assert.ok(error instanceof RemoteTimeout);
      assert.equal(error.operation, 'create');
      assert.equal(error.timeoutMs, 30_000);
      assert.match(error.message, /outcome is unknown/);
      assert.equal(classifyFailure(error), FAILURE.UNKNOWN_OUTCOME,
        'not transient and not a rejection. The replay must recognise before it writes.');
      return true;
    });
  });

  it('and the request is HUNG UP rather than left holding a socket', async () => {
    const { storage, service, clock } = aStorage();
    service.hangs = true;

    const call = storage.list(SPACES.VISIBLE, { timeoutMs: 1_000 });
    await Promise.resolve();
    assert.equal(service.requests[0]?.request.signal.aborted, false, 'not before the deadline');
    clock.passEveryDeadline();
    await assert.rejects(() => call, RemoteTimeout);

    assert.equal(service.requests[0]?.request.signal.aborted, true);
  });

  it('a write that timed out MAY WELL HAVE LANDED, and nothing here says otherwise', async () => {
    // The service accepted and stored it; the answer was what never arrived. This is the case where
    // calling a timeout "it did not happen" produces a duplicate on the retry.
    const service = new FakeDrive();
    const clock = testClock();
    const storage = new GoogleDriveRemoteStorage({
      token: () => aToken(),
      clock,
      transport: async (url, request) => {
        await service.transport(url, request);
        return new Promise<HttpResponseLike>(() => {});
      },
    });

    const call = storage.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'landed' });
    await Promise.resolve();
    await Promise.resolve();
    clock.passEveryDeadline();
    await assert.rejects(() => call, RemoteTimeout);

    assert.equal(service.files.size, 1,
      'the write is at the service. A caller told this had failed would write a SECOND envelope, '
      + 'which is the silent unrecoverable split the whole guard exists to prevent.');
  });

  it('a call that answers inside its deadline is not touched by the deadline at all', async () => {
    const { storage, clock } = aStorage();
    const meta = await storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' });
    assert.equal(meta.revision, 1);
    assert.equal(clock.waiting, 1,
      'the sleep is still outstanding — that is the stated cost of not naming a timer here, and it '
      + 'resolves into a branch that has already lost');
  });

  it('there is no wait-forever path: a call without a positive finite deadline is refused', async () => {
    const { storage, service } = aStorage();
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      await assert.rejects(
        () => storage.list(SPACES.VISIBLE, { timeoutMs: bad }), RemoteInvalidRequest);
    }
    assert.equal(service.requests.length, 0, 'and none of them reached the wire');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The rest of the refusal mapping, driven one status at a time
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('every refusal answers the two questions a caller actually asks', () => {
  const CASES: readonly {
    status: number; reason: string; classification: string; needsReauth: boolean;
  }[] = Object.freeze([
    { status: 400, reason: 'badRequest', classification: FAILURE.REJECTED, needsReauth: false },
    { status: 401, reason: '', classification: FAILURE.CREDENTIAL, needsReauth: true },
    { status: 403, reason: 'rateLimitExceeded', classification: FAILURE.TRANSIENT, needsReauth: false },
    { status: 403, reason: 'userRateLimitExceeded', classification: FAILURE.TRANSIENT, needsReauth: false },
    { status: 403, reason: 'authError', classification: FAILURE.CREDENTIAL, needsReauth: true },
    { status: 403, reason: 'storageQuotaExceeded', classification: FAILURE.REJECTED, needsReauth: false },
    { status: 403, reason: 'appNotAuthorizedToFile', classification: FAILURE.REJECTED, needsReauth: false },
    { status: 404, reason: 'notFound', classification: FAILURE.REJECTED, needsReauth: false },
    { status: 408, reason: '', classification: FAILURE.UNKNOWN_OUTCOME, needsReauth: false },
    { status: 429, reason: 'rateLimitExceeded', classification: FAILURE.TRANSIENT, needsReauth: false },
    { status: 500, reason: 'internalError', classification: FAILURE.TRANSIENT, needsReauth: false },
    { status: 503, reason: 'backendError', classification: FAILURE.TRANSIENT, needsReauth: false },
    { status: 504, reason: '', classification: FAILURE.UNKNOWN_OUTCOME, needsReauth: false },
  ]);

  it('maps each one onto retryable and needsReauth, and the outbox reads exactly that', () => {
    for (const one of CASES) {
      const error = refusalFor('overwrite', one.status, one.reason, 30_000);
      assert.equal(classifyFailure(error), one.classification,
        `${one.status} ${one.reason} was classified wrongly`);
      assert.equal(error.needsReauth, one.needsReauth, `${one.status} ${one.reason}`);
    }
  });

  it('and the two directions the rule names are covered in the same table', () => {
    const transientCases = CASES.filter((c) => c.classification === FAILURE.TRANSIENT);
    const credentialCases = CASES.filter((c) => c.classification === FAILURE.CREDENTIAL);
    assert.ok(transientCases.length >= 5, 'a transient outage must never send him to re-authorise');
    assert.ok(credentialCases.length >= 2, 'an expired credential must never be retried in silence');
    for (const one of transientCases) {
      assert.equal(refusalFor('list', one.status, one.reason, 1_000).needsReauth, false);
    }
    for (const one of credentialCases) {
      assert.equal(refusalFor('list', one.status, one.reason, 1_000).retryable, true,
        'retryable, but only after he taps — which is what needsReauth adds on top');
    }
  });

  it('an answer this port cannot read is a refusal, not a half-built record', async () => {
    const { storage, service } = aStorage();
    service.malformedCreateResponse = { name: 'b.json', version: '1' };

    await assert.rejects(() => storage.create(SPACES.VISIBLE, { name: 'b.json', content: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof RemoteError);
        assert.equal(error.code, UNREADABLE_RESPONSE_CODE);
        assert.equal(error.retryable, false);
        return true;
      });
  });

  it('a transport that throws is transient, and the cause is preserved rather than swallowed', async () => {
    const cause = new Error('the socket closed');
    const storage = new GoogleDriveRemoteStorage({
      token: () => aToken(),
      clock: testClock(),
      transport: async () => { throw cause; },
    });

    await assert.rejects(() => storage.stat('anything'), (error: unknown) => {
      assert.ok(error instanceof RemoteUnavailable);
      assert.equal(error.cause, cause);
      assert.equal(classifyFailure(error), FAILURE.TRANSIENT);
      return true;
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The boundary — a bad request fails HERE, before anything is attempted
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('a malformed request is refused before any call is attempted', () => {
  it('refuses an unknown space, a blank name, a blank identifier and unusable content', async () => {
    const { storage, service } = aStorage();
    await assert.rejects(() => storage.list('appdata'), RemoteInvalidRequest);
    await assert.rejects(() => storage.create('elsewhere', { name: 'n', content: 'c' }), RemoteInvalidRequest);
    await assert.rejects(() => storage.create(SPACES.VISIBLE, { name: '  ', content: 'c' }), RemoteInvalidRequest);
    await assert.rejects(
      () => storage.create(SPACES.VISIBLE, { name: 'n', content: 42 as unknown as string }),
      RemoteInvalidRequest);
    await assert.rejects(() => storage.read(''), RemoteInvalidRequest);
    await assert.rejects(() => storage.remove(''), RemoteInvalidRequest);
    await assert.rejects(
      () => storage.list(SPACES.VISIBLE, { namePrefix: 7 as unknown as string }), RemoteInvalidRequest);

    assert.equal(service.requests.length, 0, 'not one of them travelled');
  });

  it('and the check is proved able to pass in the same run, so its refusals mean something', async () => {
    const { storage, service } = aStorage();
    await storage.create(SPACES.VISIBLE, { name: 'n', content: 'c' });
    assert.equal(service.requests.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PRIVACY — no raw response reaches anything, proved against a PADDED encoded segment
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The signed-in account, and the identifiers a real response hands back. */
const COACH_ADDRESS = 'not.a.real.coach@example.com';
const DRIVE_FOLDER_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';

/**
 * The characters a base64 or base64url segment is made of.
 *
 * `=` IS DELIBERATELY NOT IN THIS SET, and the reason is a defect this build has already had once.
 * Padding may only ever be at a segment's END, but a URL writes `?eid=<payload>` — so a scanner that
 * treats `=` as part of a run swallows the `eid=` in front of the payload, the decoder stops dead at
 * that `=`, the run decodes to "eid", and the address behind it is never looked at. The sweep then
 * reports clean over a payload that is leaking.
 */
const BASE64_CHARACTERS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_',
]);

const SHORTEST_CANDIDATE = 16;

/** Every identifier-shaped run in this text, decoded. The half a plaintext search is missing. */
function decodedForms(text: string): string[] {
  const decoded: string[] = [];
  let run = '';
  const flush = () => {
    if (run.length >= SHORTEST_CANDIDATE) {
      const normalised = run.split('-').join('+').split('_').join('/');
      decoded.push(Buffer.from(normalised, 'base64').toString('utf8'));
    }
    run = '';
  };
  for (const character of text) {
    if (BASE64_CHARACTERS.has(character)) run += character;
    else flush();
  }
  flush();
  return decoded;
}

/** Everything forbidden this text carries, in plain sight OR encoded. */
function sweep(where: string, text: string, forbidden: readonly string[]): string[] {
  const found: string[] = [];
  const decoded = decodedForms(text);
  for (const needle of forbidden) {
    if (text.includes(needle)) found.push(`${where}: "${needle}" in plain text`);
    for (const form of decoded) {
      if (form.includes(needle)) found.push(`${where}: "${needle}" inside an encoded segment`);
    }
  }
  return found;
}

/** A file object as the service really answers, with everything the whitelist exists to drop. */
function aPoisonedFileResponse(): Record<string, unknown> {
  const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
  return {
    id: 'fake-file-poisoned',
    name: 'backup.json',
    version: '3',
    modifiedTime: '2026-07-25T10:00:00.000Z',
    size: '11',
    spaces: ['drive'],
    // None of the following is a credential, so every credential-shaped scan passes it clean.
    owners: [{ emailAddress: COACH_ADDRESS, displayName: 'The Coach' }],
    permissions: [{ emailAddress: COACH_ADDRESS, role: 'owner' }],
    parents: [DRIVE_FOLDER_ID],
    webViewLink: `https://www.google.com/calendar/event?eid=${eid}`,
    lastModifyingUser: { emailAddress: COACH_ADDRESS },
  };
}

describe('the sweep itself, before anything it says about this file is believed', () => {
  it('the padded case: a segment whose encoded form ENDS IN THE PADDING CHARACTER is still found', () => {
    const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
    assert.ok(eid.endsWith('='),
      'this control is worth having only while the encoded form really is padded. If the address '
      + 'ever changes length so that it is not, this probe has stopped testing the measured case.');

    const link = `https://www.google.com/calendar/event?eid=${eid}`;
    assert.equal(link.includes(COACH_ADDRESS), false, 'a plaintext search of it comes back clean');
    assert.ok(sweep('a padded link', link, [COACH_ADDRESS]).length > 0,
      'and the decoding sweep must find it. THIS IS THE EXACT CASE THIS BUILD MEASURED, and a sweep '
      + 'that admits "=" into the body of a run goes blind to precisely this one while staying '
      + 'green on every other carrier.');
  });

  it('finds the folder identifier too, so one lucky needle is not carrying the file', () => {
    const raw = JSON.stringify(aPoisonedFileResponse());
    assert.ok(sweep('the raw response', raw, [DRIVE_FOLDER_ID]).length > 0);
    assert.ok(sweep('the raw response', raw, [COACH_ADDRESS]).length > 0);
  });
});

describe('nothing raw survives this implementation', () => {
  const FORBIDDEN = Object.freeze([
    COACH_ADDRESS, DRIVE_FOLDER_ID,
    // The shapes a raw response is recognisable by, whatever values it happens to carry.
    'owners', 'permissions', 'parents', 'webViewLink', 'lastModifyingUser', 'emailAddress',
  ]);

  it('the metadata it returns is SIX FIELDS rebuilt one at a time, and the rest is dropped', () => {
    const meta = metaFrom(aPoisonedFileResponse(), null);
    assert.ok(meta !== null);

    assert.deepEqual(Object.keys(meta).sort(),
      ['file_id', 'modified_at', 'name', 'revision', 'size', 'space'],
      'a whitelist, so a field the service adds next year is carried by nobody rather than by '
      + 'default. A blacklist would carry exactly the fields nobody thought of.');
    assert.deepEqual(sweep('the rebuilt metadata', JSON.stringify(meta), FORBIDDEN), []);

    // The probe that makes the clean result mean something: the same sweep, the same run, pointed at
    // the object it was built from.
    assert.ok(sweep('the response it came from', JSON.stringify(aPoisonedFileResponse()), FORBIDDEN).length > 0,
      'if this goes quiet the clean result above is the output of a dead sweep');
  });

  it('what a whole round trip produces carries nothing raw either', async () => {
    const { storage, service } = aStorage();
    const created = await storage.create(SPACES.VISIBLE, { name: 'backup.json', content: '{"a":1}' });
    const listed = await storage.list(SPACES.VISIBLE);
    const read = await storage.read(created.file_id);
    const stat = await storage.stat(created.file_id);

    const produced = JSON.stringify({ created, listed, meta: read.meta, stat });
    assert.deepEqual(sweep('everything the port handed back', produced, FORBIDDEN), []);
    assert.ok(service.requests.length >= 4, 'and there really were calls to be clean of');
  });

  it('A FAILURE CARRIES NO PROVIDER TEXT, and that matters because the failure is WRITTEN DOWN',
    async () => {
      const { service } = aStorage();
      service.refuseNext(403, 'appNotAuthorizedToFile', { match: () => true });
      // The service's error body in this test says the coach's address and folder out loud, plus the
      // encoded form. `describeFailure` puts `error.message` in the local database and
      // `core/sync/engine.js` copies it into the report a screen renders.
      const poisonedTransport: HttpTransport = async (url, request) => {
        const first = await service.transport(url, request);
        if (first.ok) return first;
        const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
        return {
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 403,
              message: `The user ${COACH_ADDRESS} cannot write to ${DRIVE_FOLDER_ID}`,
              errors: [{ reason: 'appNotAuthorizedToFile', link: `https://x/?eid=${eid}` }],
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      };
      const guarded = new GoogleDriveRemoteStorage({
        token: () => aToken(), clock: testClock(), transport: poisonedTransport,
      });

      let caught: unknown = null;
      try {
        await guarded.overwrite('fake-file-1', 'x');
      } catch (error) {
        caught = error;
      }

      assert.ok(caught instanceof RemoteError, 'it did refuse');
      const written = describeFailure(caught, '2026-07-25T00:00:00.000Z');
      assert.deepEqual(sweep('the stored failure', JSON.stringify(written), FORBIDDEN), [],
        'this is the record that reaches the database and the screen');

      // And the probe: the body it was built from is full of exactly those needles.
      const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
      assert.ok(sweep('the body it came from',
        `The user ${COACH_ADDRESS} cannot write to ${DRIVE_FOLDER_ID} https://x/?eid=${eid}`,
        FORBIDDEN).length > 0);
    });

  it('and the identifier a not-found failure names is the port\'s own words, not the file\'s', async () => {
    const { storage } = aStorage();
    let caught: unknown = null;
    try {
      await storage.read('a-file-identifier-that-should-not-be-echoed');
    } catch (error) { caught = error; }

    assert.ok(caught instanceof RemoteFileNotFound);
    assert.equal(caught.message.includes('a-file-identifier-that-should-not-be-echoed'), false,
      'a provider identifier in a message is a provider identifier in the database and on screen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Source discipline
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A file's CODE, with every comment removed.
 *
 * The same state machine `google-privacy.test.ts` uses and for the same reason: this house documents
 * prohibitions beside the code they constrain, so a scan over raw source would match the sentence
 * explaining the prohibition and then either fail on its own documentation or be "fixed" by deleting
 * the explanation.
 */
function codeOf(fileName: string): string {
  const raw = readFileSync(join(HERE, fileName), 'utf8');
  let out = '';
  let index = 0;
  let quote = '';

  while (index < raw.length) {
    const here = raw[index] as string;
    const next = raw[index + 1] ?? '';

    if (quote !== '') {
      out += here;
      if (here === '\\') { out += next; index += 2; continue; }
      if (here === quote) quote = '';
      index += 1;
      continue;
    }
    if (here === '"' || here === "'" || here === '`') { quote = here; out += here; index += 1; continue; }
    if (here === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') index += 1;
      continue;
    }
    if (here === '/' && next === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    out += here;
    index += 1;
  }
  return out;
}

describe('the implementation asks for nothing it was not granted', () => {
  it('names neither of the two spaces by any word but the two it was proven with', () => {
    const code = codeOf('google-drive-remote.ts');
    assert.ok(code.includes('appDataFolder'), 'the hidden space, which was measured sufficient');
    assert.ok(code.includes("'drive'"), 'and the visible one');
    assert.equal(code.includes('auth/drive'), false,
      'a scope is requested in google-identity.ts and nowhere else. Both narrow ones were proven '
      + 'sufficient on a real device, and a broad one would hand this app every file the coach owns.');
  });

  it('writes no journal entry, because the engine above the port is what knows what a write MEANT', () => {
    const code = codeOf('google-drive-remote.ts');
    for (const forbidden of ['recordEvent', 'JOURNAL_KINDS', 'journal']) {
      assert.equal(code.includes(forbidden), false, `the port implementation names ${forbidden}`);
    }
    assert.ok(codeOf('google-account.ts').includes('recordEvent'),
      'and the scan can see one where there genuinely is one — google-account.ts writes entries');
  });
});

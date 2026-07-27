/**
 * THE ONE REAL IMPLEMENTATION OF THE REMOTE STORAGE PORT — Google Drive, filled in, nothing widened.
 *
 * ## Why this file is HERE and not under `core/remote`
 *
 * `core/remote/PORT.md` rule five: the port's vocabulary is provider-neutral, and `port.test.js`
 * scans that directory word by word for product terms and fails on any of them. This file is nothing
 * BUT product terms, so it lives in the shell beside `google-identity.ts`, which is already the only
 * place in the application that knows Google exists as more than a name in a sentence. The core keeps
 * its property that it is dependency-free, provider-free and adoptable unchanged.
 *
 * The direction of the dependency is the point: this file imports the core; the core never imports
 * this. `core/crypto/guard.js`, `core/outbox/flush.js` and `core/sync/engine.js` hold a
 * `RemoteStoragePort` and cannot tell which one they were handed.
 *
 * ## WHAT IS PROVEN AND WHAT IS NOT, said before anything else
 *
 * NOTHING IN THIS FILE HAS BEEN RUN AGAINST GOOGLE. Its suite drives it through an injected
 * transport that never touches the network, so a green run proves THIS CODE behaves correctly given
 * the responses the suite models — exactly the claim `PROVES_NOTHING_ABOUT_THE_PLATFORM` makes about
 * the in-memory double, and no larger. The endpoint shapes, field names and refusal reasons below are
 * taken from Google's published interface. They are DOCUMENTED, NOT MEASURED BY THIS BUILD, and every
 * one of them is marked as such where it appears. The two things that WERE measured on real devices
 * during the platform spike are the two narrow scopes, and they are recorded in `google-identity.ts`
 * where they are requested.
 *
 * ## THE FIVE RULES FROM `PORT.md`, AND WHERE EACH ONE LANDS
 *
 * 1. **Implement the port and change nothing else.** No concept is renamed. `visible` and `hidden`
 *    stay roles; {@link DRIVE_SPACES} is the ONLY place the role becomes a product word, and it is a
 *    frozen table rather than a rule scattered through six call sites.
 * 2. **No conditional write.** There is no precondition parameter anywhere in this file, on
 *    {@link GoogleDriveRemoteStorage.overwrite} or on anything it calls, and there is no code path
 *    that reads `PORT_CAPABILITIES.conditional_write`. Read-compare-write remains DETECTION: nothing
 *    here can close the window between the compare and the write, and pretending otherwise would put
 *    a lock in the callers' hands that the service cannot honour.
 * 3. **Never address a file by name alone.** Every operation but `create` and `list` takes an
 *    identifier. `create` sends a name and hands back the identifier it was given; nothing in this
 *    file ever resolves a name to a file.
 * 4. **Never assume a listing holds at most one match.** {@link GoogleDriveRemoteStorage.list}
 *    returns every match, in order, duplicates included, and it FOLLOWS EVERY PAGE — see the note on
 *    pagination, which is where this rule is easiest to break by accident.
 * 5. **Keep the vocabulary neutral** — which is why this file is in `src/platform`.
 *
 * ## PRIVACY: NO RAW RESPONSE LEAVES THIS FILE, AND THE LEAK IS NOT SHAPED LIKE A CREDENTIAL
 *
 * A provider response carries the account holder's own address ENCODED INSIDE IDENTIFIER SEGMENTS, so
 * a plaintext search of outgoing bytes comes back clean while the address is sitting right there.
 * Measured on this project's own artefacts, not imagined.
 *
 * So {@link metaFrom} is a WHITELIST that rebuilds the port's six declared fields one at a time from
 * named properties, and the response object is dropped on the floor. Never a blacklist: a field
 * Google adds next year would then be carried by default, and fields nobody thought of are the entire
 * class of defect here. The same discipline covers FAILURES — {@link refusalFor} reads a status and
 * one reason word and builds its own sentence, because `core/outbox/classify.js` writes
 * `error.message` into the local database and `core/sync/engine.js` copies it into the report a
 * screen renders. A provider's error text put in a `RemoteError` message is a provider string in the
 * coach's database.
 *
 * ## NOTHING HERE WRITES A JOURNAL ENTRY
 *
 * Deliberate, and confirmed with the planner before a line was written. Sync-domain journalling
 * belongs to the engine above this port, which knows what the write MEANT. A port implementation
 * knows only that some bytes went out, so an entry written here would say less and say it twice.
 *
 * ## NOTHING ARMS A TIMER
 *
 * `google-privacy.test.ts` asserts that of every Google module, this one included, because the coach
 * must never meet an authorisation prompt divorced from something he just did. The deadline every
 * call carries is therefore enforced through the core's injected {@link Clock} — the same seam the
 * double uses — raced against the request, with an {@link AbortController} to hang the request up
 * when the deadline wins. THE COST, stated rather than hidden: with the real clock a `sleep` outlives
 * a call that finished early, so a fast call leaves one pending timer behind for the rest of its
 * deadline. That is a handle, not a wake-up: it resolves into a branch that has already lost the race
 * and does nothing. The alternative is naming a timer here, which is the thing being prevented.
 */

import {
  DEFAULT_TIMEOUT_MS,
  RemoteCredentialExpired,
  RemoteError,
  RemoteFileNotFound,
  RemoteInvalidRequest,
  RemoteStoragePort,
  RemoteTimeout,
  RemoteUnavailable,
  SPACES,
  assertFileId,
  assertName,
  assertSpace,
  assertTimeout,
  normalizeContent,
  systemClock,
} from '../../core/remote/remote.js';
import type { Clock } from '../../core/remote/clock.js';
// The port's two result shapes are declared in `port.js` as documentation types. `remote.js` is the
// module API and re-exports the VALUES; a type has no value to re-export, so it is named at its
// source here. Nothing else in this file reaches past `remote.js`.
import type { RemoteFile, RemoteFileMeta } from '../../core/remote/port.js';

import type { CarriedToken } from './google-identity.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The one place a role becomes a product word
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The two spaces, as the service names them.
 *
 * VISIBLE is the ordinary space the account holder browses; the backup copies live there and he is
 * meant to find them. HIDDEN is the application-only space holding the key envelope, and it is worth
 * being exact about what hidden buys: it is a boundary against OTHER APPLICATIONS AND ACCIDENTAL
 * SHARING. It is never a boundary against the account holder, who can still delete it, and it does
 * not survive this application being removed from his account.
 *
 * Under the narrow scope granted for the visible space, a listing returns only the files THIS
 * application created — which is why no folder is invented here to hold them. The port has no folder
 * concept, and adding one would be widening a port whose narrowness is its design.
 */
export const DRIVE_SPACES: Readonly<Record<string, string>> = Object.freeze({
  [SPACES.VISIBLE]: 'drive',
  [SPACES.HIDDEN]: 'appDataFolder',
});

/** The endpoints. Metadata and uploads are different hosts' paths, which is the service's shape. */
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * The ONLY fields ever asked for.
 *
 * A narrow field list is a privacy control before it is a performance one: a response cannot leak an
 * owner's address, a parent folder tree or a sharing link that was never requested. It is exactly the
 * six the port declares, plus the space marker needed to fill `space` in on a read by identifier.
 *
 * DOCUMENTED, NOT MEASURED: `version` is the service's monotonically increasing change marker and is
 * this port's `revision`; `modifiedTime` is its RFC 3339 modification instant; `size` is a decimal
 * STRING and is only present for files that carry bytes.
 */
const FILE_FIELDS = 'id,name,version,modifiedTime,size,spaces';
const LIST_FIELDS = `nextPageToken,files(${FILE_FIELDS})`;

/** How many entries one page of a listing asks for. */
const PAGE_SIZE = 100;

/**
 * The most pages one listing will walk before it refuses to answer.
 *
 * It REFUSES rather than returning what it has. A truncated listing is the single most dangerous
 * value this file could produce: the adopt-before-create guard decides whether a second key envelope
 * may be written by counting what `list` returned, and a listing that silently stopped early reads
 * exactly like an empty space. That is the silent, unrecoverable key split the guard exists to
 * prevent. Refusing is loud and recoverable; truncating is neither.
 */
const MAX_PAGES = 200;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Mapping a refusal onto the two questions a caller actually asks
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Refusal reasons that mean TRY AGAIN LATER, and must never send the coach to re-authorise.
 *
 * This is the mapping that matters most in the file. `core/outbox/classify.js` reads `retryable` and
 * `needsReauth` off the error and nothing else — so a rate limit typed as a credential problem tells
 * the coach his connection expired when the service merely asked him to slow down, and he taps
 * through a Google window that fixes nothing.
 *
 * DOCUMENTED, NOT MEASURED: these are the service's published reason words for throttling and for a
 * transient fault on its side.
 */
export const TRANSIENT_REFUSAL_REASONS: readonly string[] = Object.freeze([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
  'backendError',
  'internalError',
]);

/**
 * Refusal reasons that mean THIS CANNOT WORK UNTIL HE AUTHORISES AGAIN.
 *
 * The other half of the same rule: an expired or withdrawn authorisation must never be retried
 * silently for ever, because no number of attempts renews a credential that needs a user gesture.
 *
 * DOCUMENTED, NOT MEASURED.
 */
export const REAUTHORISE_REFUSAL_REASONS: readonly string[] = Object.freeze([
  'authError',
  'unauthorized',
  'invalidCredentials',
]);

/**
 * The code carried by a refusal that is neither transient nor fixable by authorising again.
 *
 * Not a new error class — the port's five are the port's five. It is the base {@link RemoteError}
 * with both flags false, which `classifyFailure` reads as `rejected`: stop, and make it visible. That
 * is the right answer for a full account or a file this application is no longer allowed to touch,
 * where both retrying for ever and sending him to a consent screen are wrong.
 */
export const REFUSED_CODE = 'refused';

/** The code carried when the service answered with something this port cannot read. */
export const UNREADABLE_RESPONSE_CODE = 'unreadable_response';

/**
 * Build the typed failure for one refused call.
 *
 * Exported because the mapping is the part a reviewer should be able to drive directly, one status at
 * a time, without standing up a whole store.
 *
 * NOTE WHAT IS NOT IN THE RESULT: nothing the service said. The status and one reason word decide the
 * TYPE; the sentence is this application's own. `core/outbox/classify.js` writes `error.message` into
 * the local database and `core/sync/engine.js` copies it into the report a screen renders, so a
 * provider's error text placed here is a provider string in the coach's database and on his screen.
 *
 * @param operation which of the six was refused
 * @param status the HTTP status
 * @param reason the service's reason word, or `''` when the body did not carry one
 * @param timeoutMs the deadline the call was made under
 */
export function refusalFor(
  operation: string,
  status: number,
  reason: string,
  timeoutMs: number,
): RemoteError {
  // The credential is gone or was never good. One tap fixes it; retrying alone never does.
  if (status === 401) return new RemoteCredentialExpired();

  if (status === 403) {
    if (TRANSIENT_REFUSAL_REASONS.includes(reason)) {
      return new RemoteUnavailable('The storage service asked this app to slow down and try later.');
    }
    if (REAUTHORISE_REFUSAL_REASONS.includes(reason)) return new RemoteCredentialExpired();
    // Everything else a 403 can mean — no room left in the account, a file this application may no
    // longer touch — is permanent until something outside this app changes.
    return new RemoteError('The storage service refused this, and repeating it would be refused too.', {
      code: REFUSED_CODE, retryable: false, needsReauth: false,
    });
  }

  if (status === 404) return new RemoteFileNotFound(`(identifier withheld, ${operation})`);

  // The service itself says the request ran out of time. THE OUTCOME IS UNKNOWN and must be reported
  // as unknown: a write that timed out at a gateway may well have landed, and calling it a failure
  // would send the queue back to write it a second time without recognising the first.
  if (status === 408 || status === 504) return new RemoteTimeout(operation, timeoutMs);

  // Reached, and temporarily unwell. Recognition runs before every replay, so a retry cannot
  // duplicate a write that landed.
  if (status === 429 || status >= 500) {
    return new RemoteUnavailable('The storage service is temporarily unavailable.');
  }

  // A malformed request produces the same malformed request next time. Never retryable.
  if (status >= 400) {
    return new RemoteInvalidRequest(`The storage service rejected the "${operation}" request as malformed.`);
  }

  return new RemoteError('The storage service answered in a way this app could not use.', {
    code: UNREADABLE_RESPONSE_CODE, retryable: false, needsReauth: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The whitelist that rebuilds the port's metadata, field by field
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What a response might carry. Deliberately not a full typing — see the whitelist note above. */
interface DriveFileLike {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly version?: unknown;
  readonly modifiedTime?: unknown;
  readonly size?: unknown;
  readonly spaces?: unknown;
}

/** A number off a field the service sends as a decimal string, or `null` when it is not one. */
function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Which space a response says the file lives in.
 *
 * Read from the response rather than assumed from the call, so a `read` or a `stat` by identifier —
 * which names no space at all — still returns the port's declared shape in full.
 *
 * THE ONE UNVERIFIED DEPENDENCY IN THIS FILE, stated here rather than buried: `read` and `stat` name
 * no space, so this marker is the only thing that can fill `space` in for them. It is asked for in
 * {@link FILE_FIELDS} and is DOCUMENTED as a field of a file, but nothing in this build has seen a
 * live response carry it. If it does not, `read` and `stat` fail LOUDLY as an unreadable answer
 * rather than guessing — and guessing is what the alternative would be. Defaulting to the visible
 * space would label the key envelope as a browsable backup, which is a wrong answer that reads like
 * a right one. This is a first thing to check when the application meets the real service.
 */
function spaceOf(raw: DriveFileLike, fallback: string | null): string | null {
  const spaces = raw.spaces;
  if (Array.isArray(spaces)) {
    if (spaces.includes(DRIVE_SPACES[SPACES.HIDDEN])) return SPACES.HIDDEN;
    if (spaces.includes(DRIVE_SPACES[SPACES.VISIBLE])) return SPACES.VISIBLE;
  }
  return fallback;
}

/**
 * THE WHITELIST. Six declared fields, rebuilt one at a time, and the response dropped on the floor.
 *
 * Returns `null` when the response cannot fill the shape, so the caller raises a typed failure rather
 * than passing a half-built record upward. A metadata record with a missing identifier is worse than
 * an error: the identifier is the only reliable handle a file has.
 *
 * @param raw the provider's file object, which does not leave this function
 * @param space the space the call was made against, or `null` when it was addressed by identifier
 * @param sizeWhenAbsent byte length known from content in hand, for the calls that have it
 */
export function metaFrom(
  raw: unknown,
  space: string | null,
  sizeWhenAbsent: number | null = null,
): RemoteFileMeta | null {
  if (raw === null || typeof raw !== 'object') return null;
  const file = raw as DriveFileLike;

  const fileId = typeof file.id === 'string' && file.id !== '' ? file.id : null;
  const name = typeof file.name === 'string' ? file.name : null;
  const revision = wholeNumber(file.version);
  const inSpace = spaceOf(file, space);
  if (fileId === null || name === null || revision === null || inSpace === null) return null;

  // Normalised through the platform's own date rather than passed through, so `modified_at` is the
  // one canonical form the rest of the application writes — with milliseconds — whatever precision
  // the service happened to send.
  const modifiedAt = typeof file.modifiedTime === 'string' ? new Date(file.modifiedTime) : null;
  if (modifiedAt === null || Number.isNaN(modifiedAt.getTime())) return null;

  const size = wholeNumber(file.size) ?? sizeWhenAbsent;
  if (size === null) return null;

  return Object.freeze({
    file_id: fileId,
    space: inSpace,
    name,
    revision,
    modified_at: modifiedAt.toISOString(),
    size,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The transport seam
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** As much of a response as this file will admit to knowing about. */
export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** What one outbound request looks like. */
export interface HttpRequestLike {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly signal: AbortSignal;
}

/**
 * How a request is actually made.
 *
 * Injected rather than reached for, so the suite can drive every operation and every failure without
 * a network — and so that NO TEST IN THIS BUILD CAN ACCIDENTALLY CALL GOOGLE. The default is the
 * platform's own fetch, read inside the call rather than at module scope, because this module is
 * imported by tests running outside a browser.
 */
export type HttpTransport = (url: string, request: HttpRequestLike) => Promise<HttpResponseLike>;

/** What the storage needs of the world around it. */
export interface GoogleDriveDependencies {
  /**
   * The access token for this request, or `null` when there is not a live one.
   *
   * This is `GoogleConnection.tokenForRequest` and there is NO SECOND TOKEN PATH: nothing here asks
   * for a token, renews one, or knows how one is obtained. `null` is the ordinary cold-start state,
   * not an exceptional one, and it becomes the same typed credential failure the double produces.
   */
  readonly token: () => CarriedToken | null;
  readonly transport?: HttpTransport;
  readonly clock?: Clock;
  /** The deadline used when a caller does not name one. */
  readonly timeoutMs?: number;
  /** The multipart separator. Injectable only so a test can assert the body it produced. */
  readonly newBoundary?: () => string;
}

/**
 * How the race between a request and its deadline comes back.
 *
 * A tagged shape rather than a marker value, so "the deadline won" is a case the type system makes
 * the caller handle rather than a comparison it could get wrong. The failure arm is a distinct
 * member because `undefined` is a perfectly good thing for an operation to resolve to — `remove`
 * does — and a check for it would read a successful removal as a failure that carried nothing.
 */
type Settled<T> =
  | { readonly deadline: true }
  | { readonly deadline: false; readonly value: T }
  | { readonly deadline: false; readonly failure: unknown };

/** Join byte runs into one. */
function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The implementation
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Google Drive, behind the port's six operations.
 *
 * Every operation validates at the boundary first — the same `assert*` helpers the port declares, so
 * a bad request fails HERE and never travels — then resolves its deadline, then makes its calls under
 * that one deadline, then rebuilds the port's metadata from named fields.
 */
export class GoogleDriveRemoteStorage extends RemoteStoragePort {
  readonly #token: () => CarriedToken | null;
  readonly #transport: HttpTransport;
  readonly #clock: Clock;
  readonly #defaultTimeoutMs: number;
  readonly #newBoundary: () => string;

  constructor({ token, transport, clock, timeoutMs, newBoundary }: GoogleDriveDependencies) {
    super();
    this.#token = token;
    this.#transport = transport ?? defaultTransport;
    this.#clock = clock ?? systemClock();
    this.#defaultTimeoutMs = assertTimeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#newBoundary = newBoundary ?? (() => `fit-${globalThis.crypto.randomUUID()}`);
  }

  /**
   * List a space, every page of it, duplicates included.
   *
   * ## The two rules this method is where you break
   *
   * IT FOLLOWS EVERY PAGE. The hidden space does not enforce name uniqueness — measured on real
   * devices, two envelopes under one name inside fifteen minutes of ordinary two-device use — so the
   * second match may be on the second page, and a listing that stopped at the first page would hand
   * the adopt-before-create guard an answer that looks exactly like "there is only one". When the
   * pages do not end, it REFUSES rather than truncating; see {@link MAX_PAGES}.
   *
   * AND `namePrefix` IS APPLIED HERE, NOT BY THE SERVICE. The service's name query is a contains
   * match, not a prefix match, so asking it to do the filtering would silently return files the
   * caller did not ask for — and, worse, would make the caller's `startsWith` contract quietly
   * false. The filter is applied to what came back, which is exact.
   */
  override async list(
    space: string,
    opts: { namePrefix?: string; timeoutMs?: number } = {},
  ): Promise<RemoteFileMeta[]> {
    assertSpace(space);
    if (opts.namePrefix !== undefined && typeof opts.namePrefix !== 'string') {
      throw new RemoteInvalidRequest('namePrefix, when given, must be text.');
    }
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();

    return this.#underDeadline('list', timeoutMs, async (signal) => {
      const found: RemoteFileMeta[] = [];
      let pageToken: string | null = null;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({
          spaces: DRIVE_SPACES[space] as string,
          fields: LIST_FIELDS,
          pageSize: String(PAGE_SIZE),
          // A file in the account's bin is not a file this application should adopt or overwrite.
          q: 'trashed = false',
        });
        if (pageToken !== null) query.set('pageToken', pageToken);

        const body = await this.#json('list', `${FILES_ENDPOINT}?${query.toString()}`, {
          method: 'GET', headers: authorization, signal,
        }, timeoutMs);

        const listed = (body as { files?: unknown }).files;
        for (const raw of Array.isArray(listed) ? listed : []) {
          const meta = metaFrom(raw, space);
          if (meta === null) throw unreadable('list');
          // The filter is applied to the rebuilt name, AFTER the whole page has been walked, so a
          // narrowed listing and a full one see the same set of files and differ only in the
          // answer. Never before the paging: a page whose entries were all filtered out still
          // carries the token to the page holding the match.
          if (opts.namePrefix !== undefined && !meta.name.startsWith(opts.namePrefix)) continue;
          found.push(meta);
        }

        const next = (body as { nextPageToken?: unknown }).nextPageToken;
        if (typeof next !== 'string' || next === '') return found;
        pageToken = next;
      }

      throw new RemoteError(
        'The list of backups did not end. This app stopped rather than report a partial list, '
        + 'because a partial list of key material is indistinguishable from an empty one.',
        { code: REFUSED_CODE, retryable: false, needsReauth: false },
      );
    });
  }

  /**
   * Create a file. ALWAYS creates — it is never an upsert and never a replace.
   *
   * NO NAME CHECK IS PERFORMED, and its absence is deliberate rather than forgotten. The service
   * performs none either, so a check here would be this implementation being KINDER THAN THE
   * PLATFORM: the duplicate would still be reachable in the real world, and the guard that exists to
   * prevent it would have been tested against a store that quietly refused to produce the state.
   * At-most-one is the caller's guard to make, which is exactly where `core/crypto/guard.js` makes it.
   */
  override async create(
    space: string,
    file: { name: string; content: string | Uint8Array | ArrayBuffer },
    opts: { timeoutMs?: number } = {},
  ): Promise<RemoteFileMeta> {
    assertSpace(space);
    if (file === null || typeof file !== 'object') {
      throw new RemoteInvalidRequest('create needs a file with a name and content.');
    }
    assertName(file.name);
    const content = normalizeContent(file.content);
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();

    // The hidden space is addressed as the parent of a new file; the visible space is the account's
    // ordinary space and needs no parent named. Under the narrow scope this application holds, a file
    // it creates is one only it can see afterwards.
    const descriptor: { name: string; parents?: string[] } = space === SPACES.HIDDEN
      ? { name: file.name, parents: [DRIVE_SPACES[SPACES.HIDDEN] as string] }
      : { name: file.name };

    const boundary = this.#newBoundary();
    const body = multipartBody(boundary, descriptor, content);

    return this.#underDeadline('create', timeoutMs, async (signal) => {
      const raw = await this.#json('create', `${UPLOAD_ENDPOINT}?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { ...authorization, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
        signal,
      }, timeoutMs);

      const meta = metaFrom(raw, space, content.byteLength);
      if (meta === null) throw unreadable('create');
      return meta;
    });
  }

  /**
   * Read a file by identifier, content included.
   *
   * Two requests — the metadata and the bytes — under ONE deadline, because the caller asked for one
   * operation and is entitled to one bound on how long it takes. The metadata is fetched first so
   * that a file that has been removed fails as a removal rather than as an empty read.
   */
  override async read(fileId: string, opts: { timeoutMs?: number } = {}): Promise<RemoteFile> {
    assertFileId(fileId);
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();
    const encoded = encodeURIComponent(fileId);

    return this.#underDeadline('read', timeoutMs, async (signal) => {
      const raw = await this.#json('read', `${FILES_ENDPOINT}/${encoded}?fields=${FILE_FIELDS}`, {
        method: 'GET', headers: authorization, signal,
      }, timeoutMs);

      const response = await this.#send('read', `${FILES_ENDPOINT}/${encoded}?alt=media`, {
        method: 'GET', headers: authorization, signal,
      }, timeoutMs);

      let content: Uint8Array;
      try {
        content = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw new RemoteUnavailable('The contents of that backup could not be read.', { cause: error });
      }

      const meta = metaFrom(raw, null, content.byteLength);
      if (meta === null) throw unreadable('read');
      return { meta, content };
    });
  }

  /**
   * Overwrite a file by identifier, producing a new revision.
   *
   * ## THERE IS NO PRECONDITION HERE AND THERE WILL NOT BE ONE
   *
   * Not as a parameter, not as a flag, not as a best-effort hint. The service offers no
   * conditional-match facility — the revision, the digest and the modification time are output-only —
   * so a precondition offered here would advertise a lock nothing can honour, and every caller built
   * on that promise would be wrong in the most expensive place to find out.
   *
   * Whatever this write carries lands, whatever the file has become since the caller looked. Two
   * readers who both write means the second wins and the first is simply gone; that loss is
   * DETECTABLE afterwards through the revision marker and is not preventable, which is why the
   * conflict is surfaced to the coach rather than resolved by guessing.
   */
  override async overwrite(
    fileId: string,
    content: string | Uint8Array | ArrayBuffer,
    opts: { timeoutMs?: number } = {},
  ): Promise<RemoteFileMeta> {
    assertFileId(fileId);
    const bytes = normalizeContent(content);
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();

    return this.#underDeadline('overwrite', timeoutMs, async (signal) => {
      const raw = await this.#json(
        'overwrite',
        `${UPLOAD_ENDPOINT}/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`,
        {
          method: 'PATCH',
          headers: { ...authorization, 'Content-Type': 'application/octet-stream' },
          body: bytes,
          signal,
        },
        timeoutMs,
      );

      const meta = metaFrom(raw, null, bytes.byteLength);
      if (meta === null) throw unreadable('overwrite');
      return meta;
    });
  }

  /** Delete a file by identifier. */
  override async remove(fileId: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    assertFileId(fileId);
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();

    await this.#underDeadline('remove', timeoutMs, async (signal) => {
      await this.#send('remove', `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE', headers: authorization, signal,
      }, timeoutMs);
    });
  }

  /** The metadata a read-compare-write cycle needs, without pulling the content. */
  override async stat(fileId: string, opts: { timeoutMs?: number } = {}): Promise<RemoteFileMeta> {
    assertFileId(fileId);
    const timeoutMs = assertTimeout(opts.timeoutMs ?? this.#defaultTimeoutMs);
    const authorization = this.#authorization();

    return this.#underDeadline('stat', timeoutMs, async (signal) => {
      const raw = await this.#json('stat', `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`, {
        method: 'GET', headers: authorization, signal,
      }, timeoutMs);

      // `size` is absent for a file with no bytes, and a `stat` has no content to measure. Zero is
      // the honest answer for an empty file and the only one available; nothing in this application
      // branches on size, and `hasMoved` reads the revision and the modification time.
      const meta = metaFrom(raw, null, 0);
      if (meta === null) throw unreadable('stat');
      return meta;
    });
  }

  // ── the parts every operation shares ─────────────────────────────────────────────────────────

  /**
   * The authorisation header, or the typed credential failure.
   *
   * There is no refresh token on this origin and none is obtainable, so having no live token is the
   * ORDINARY cold-start state rather than an error condition. It becomes `RemoteCredentialExpired`,
   * which `core/outbox/classify.js` reads as `credential`: the work is kept, no attempt is burned,
   * and the coach is asked to tap when he next has a reason to.
   */
  #authorization(): Record<string, string> {
    const token = this.#token();
    if (token === null) throw new RemoteCredentialExpired();
    return { Authorization: token.authorizationHeader() };
  }

  /**
   * Run one operation under its deadline.
   *
   * The deadline is real and it is enforced by giving up on the wait, not by hoping the request
   * returns: the clock's sleep races the work, and when the sleep wins the request is ABORTED so
   * nothing is left holding a socket. What is raised then says plainly that the outcome is UNKNOWN —
   * the write may well have landed — and this file never converts that into a success or a failure.
   * The outbox's idempotency key and its recognition step are what make the replay safe.
   */
  async #underDeadline<T>(
    operation: string,
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();

    const settled: Settled<T> = await Promise.race([
      run(controller.signal).then(
        (value): Settled<T> => ({ deadline: false, value }),
        (failure: unknown): Settled<T> => ({ deadline: false, failure }),
      ),
      this.#clock.sleep(timeoutMs).then((): Settled<T> => ({ deadline: true })),
    ]);

    if (settled.deadline) {
      controller.abort();
      throw new RemoteTimeout(operation, timeoutMs);
    }
    if ('failure' in settled) throw settled.failure;
    return settled.value;
  }

  /** One request, with its refusal already turned into a typed failure. */
  async #send(
    operation: string,
    url: string,
    request: HttpRequestLike,
    timeoutMs: number,
  ): Promise<HttpResponseLike> {
    let response: HttpResponseLike;
    try {
      response = await this.#transport(url, request);
    } catch (error) {
      // The request never reached anything, or the connection died mid-flight. Transient, and the
      // cause is preserved rather than swallowed.
      throw new RemoteUnavailable('This device could not reach the storage service.', { cause: error });
    }
    if (!response.ok) {
      throw refusalFor(operation, response.status, await reasonOf(response), timeoutMs);
    }
    return response;
  }

  /** One request whose answer is expected to be a readable object. */
  async #json(
    operation: string,
    url: string,
    request: HttpRequestLike,
    timeoutMs: number,
  ): Promise<unknown> {
    const response = await this.#send(operation, url, request, timeoutMs);
    try {
      return await response.json();
    } catch (error) {
      throw new RemoteError('The storage service answered in a way this app could not read.', {
        code: UNREADABLE_RESPONSE_CODE, retryable: false, needsReauth: false, cause: error,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Small parts, kept out of the class so a test can drive them directly
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The failure raised when a response could not fill the port's declared shape. */
function unreadable(operation: string): RemoteError {
  return new RemoteError(
    `The storage service's answer to "${operation}" did not carry what this app needs to identify the file.`,
    { code: UNREADABLE_RESPONSE_CODE, retryable: false, needsReauth: false },
  );
}

/**
 * The service's reason word for a refusal, or `''`.
 *
 * ONE WORD IS TAKEN AND THE REST OF THE BODY IS DROPPED. An error body carries a human message and
 * often the request that caused it, and that whole object is exactly the kind of thing that gets
 * stashed into a failure record and then travels.
 */
async function reasonOf(response: HttpResponseLike): Promise<string> {
  try {
    const body = await response.json();
    const error = (body as { error?: { errors?: unknown; status?: unknown } }).error;
    if (error === null || typeof error !== 'object') return '';
    const errors = error.errors;
    const first = Array.isArray(errors) ? (errors[0] as { reason?: unknown } | undefined) : undefined;
    if (typeof first?.reason === 'string') return first.reason;
    if (typeof error.status === 'string') return error.status;
    return '';
  } catch {
    // A body that cannot be read tells us nothing, and the status already told us plenty.
    return '';
  }
}

/**
 * A multipart create body: the descriptor, then the bytes.
 *
 * Assembled as bytes rather than as text because the content is arbitrary — ciphertext, among other
 * things — and putting bytes through a string would corrupt anything that is not valid text.
 */
export function multipartBody(
  boundary: string,
  descriptor: { name: string; parents?: string[] },
  content: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  return concatBytes([
    encoder.encode(
      `--${boundary}\r\n`
      + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
      + `${JSON.stringify(descriptor)}\r\n`
      + `--${boundary}\r\n`
      + 'Content-Type: application/octet-stream\r\n\r\n',
    ),
    content,
    encoder.encode(`\r\n--${boundary}--\r\n`),
  ]);
}

/**
 * The platform's own fetch, reached inside the call.
 *
 * Nothing in this module runs at module scope: the suite imports it outside a browser, and reading a
 * global at import time would capture whatever was there before anything loaded.
 */
const defaultTransport: HttpTransport = async (url, request) => {
  const send = globalThis.fetch;
  if (typeof send !== 'function') {
    throw new RemoteUnavailable('This device has no way to reach the storage service.');
  }
  const response = await send(url, {
    method: request.method,
    headers: { ...request.headers },
    // A byte array is a perfectly good request body, and it is passed through as one so that nothing
    // re-encodes ciphertext on the way out.
    body: request.body === undefined ? undefined : (request.body as unknown as BodyInit),
    signal: request.signal,
  });
  return response;
};

/**
 * THE GOOGLE CREDENTIAL — foreground only, gesture only, and no refresh token anywhere.
 *
 * This is the shell's door to Google and the only place in the application that knows Google exists
 * as anything more than a name in a sentence. The core stays dependency-free and provider-neutral:
 * `core/remote/port.js` describes a REMOTE, not a Google, and nothing under `app/core` may learn
 * otherwise. Everything Google-shaped lives here and in `google-account.ts` beside it.
 *
 * ## THERE IS NO REFRESH TOKEN, AND NONE IS ATTEMPTED
 *
 * The published origin is a static site, so the OAuth client is necessarily a *Web application*
 * client, and Google will not exchange a code for tokens on a Web client without a client secret.
 * PKCE does not substitute. There is no backend, so there is nowhere a secret could live. That is
 * structural rather than a misconfiguration: **no refresh token can be issued at all.** So there is
 * no code exchange here, no `refresh_token`, no `client_secret`, and no `initCodeClient`. This is
 * settled and closed; `google-privacy.test.ts` asserts the absence with a positive control so the
 * assertion cannot pass by being pointed at nothing.
 *
 * What exists instead is the Google Identity Services *token* model: `initTokenClient` hands back an
 * access token that lives about an hour, in the foreground, with renewal requiring a user gesture.
 *
 * ## THE HOUR IS THE TOKEN'S, NOT THE SESSION'S
 *
 * Said plainly because it has been misread once already: the roughly one-hour life belongs to the
 * API ACCESS TOKEN and has nothing whatsoever to do with how long a coaching session or a meeting
 * runs. Once a meeting link exists it behaves exactly like one created by hand; this application
 * could lose Google access entirely mid-session and the call would be unaffected.
 *
 * ## RENEWAL IS ATTACHED TO THE TAP THAT NEEDS IT
 *
 * The coach must never meet an authorisation prompt divorced from something he just did. A timer
 * that woke up and popped a Google window while he was mid-set would be exactly that, so the
 * enforcement is not a convention anybody has to remember: {@link GoogleConnection.acquireForGesture}
 * is the only path to a token and it will not run without a {@link UserGesture}, which can only be
 * minted from an event the browser itself marked trusted. A timer callback has no event to offer, so
 * a background renewal is not something this module declines to do — it is something it cannot
 * express. Nothing here arms a timer, and a test proves it by handing the module a clock whose
 * `setTimeout` and `setInterval` fail the test if they are ever called.
 *
 * ## A RAW PROVIDER RESPONSE NEVER LEAVES THIS FILE
 *
 * This is one of the three actions in the build that first makes the privacy posture real, and the
 * hazard was measured on this project's own artefacts rather than imagined: a Google response object
 * carries the signed-in account's own address ENCODED INSIDE AN IDENTIFIER SEGMENT, so a plaintext
 * search of outgoing bytes comes back clean while the address is sitting right there. Contains-no-
 * credential is NOT the same thing as safe-to-publish.
 *
 * So {@link carryForward} WHITELISTS three fields off the provider's response — the access token,
 * how long it lasts, and which scopes were actually granted — and the raw object is dropped on the
 * floor. Never a blacklist: a field nobody thought of is then carried by default, and the whole
 * class of defect here is fields nobody thought of.
 *
 * The token itself is the most dangerous value in the application, so it is held in a `#private`
 * field of {@link CarriedToken} rather than as a property. That is not decoration: a private field
 * is invisible to `JSON.stringify`, to a spread, to `Object.entries` and to `console.log` of the
 * object, so the ordinary accidents that leak a secret cannot reach it. The one door out is
 * {@link CarriedToken.authorizationHeader}, which is greppable precisely because it is named.
 *
 * ## NOTHING HERE RUNS AT MODULE SCOPE
 *
 * The interface suite imports these modules outside a browser. Every global — the identity library,
 * `localStorage`, the clock — is reached through an injected port, inside a function, on the way to
 * an answer somebody asked for.
 */

/**
 * The three scopes, and no others.
 *
 * `drive.file` and `drive.appdata` are the two narrow storage scopes; the platform proof measured
 * both as sufficient for the visible backup folder and the hidden application-data space
 * respectively. `calendar.events` is the meeting path: on a free personal account the only way to a
 * meeting link is inserting a real calendar event with conference data.
 *
 * A BROAD `drive` SCOPE IS FORBIDDEN and its absence is asserted, because the narrow pair was proven
 * enough and a broad scope would hand this application every file the coach owns.
 */
export const GOOGLE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/calendar.events',
]);

/**
 * The scopes as the identity library wants them: one space-separated string.
 *
 * Requested as ONE set at acquisition rather than incrementally. The platform proof cleared the
 * consent popup with exactly this set from an installed home-screen application, and asking twice
 * would mean two prompts for a coach who is trying to start a session.
 */
export const GOOGLE_SCOPE_REQUEST = GOOGLE_SCOPES.join(' ');

/**
 * PROOF THAT A PERSON DID SOMETHING — the type a background timer cannot produce.
 *
 * The requirement is that the coach never meets an authorisation prompt he did not cause. Written as
 * a rule in a comment, that survives exactly as long as the next person who reads it. Written as a
 * TYPE, it survives everything: {@link GoogleConnection.acquireForGesture} takes one of these, and
 * the only way to obtain one is {@link UserGesture.fromTrustedEvent} with an event the BROWSER
 * marked trusted. A synthetic event dispatched by code has `isTrusted === false` and is refused; a
 * timer has no event at all and so has nothing to offer.
 *
 * The constructor is private for the same reason: `new UserGesture()` would be the escape hatch, and
 * an escape hatch is what the first caller under time pressure reaches for.
 */
export class UserGesture {
  /** Which interaction it was — a tap, a click, a key. Kept for the refusal sentence, never sent. */
  readonly type: string;

  /** When it happened. */
  readonly at: string;

  private constructor(type: string, at: string) {
    this.type = type;
    this.at = at;
  }

  /**
   * Mint a gesture from a real browser event, or refuse.
   *
   * @param event the event handed to the listener the coach's tap ran
   * @returns the gesture, or `null` when this was not something a person did
   */
  static fromTrustedEvent(
    event: { isTrusted?: boolean; type?: string } | null | undefined,
    now: () => Date = () => new Date(),
  ): UserGesture | null {
    if (event === null || event === undefined) return null;
    // The browser sets this, and it cannot be forged from script: a dispatched event is false.
    if (event.isTrusted !== true) return null;
    const type = typeof event.type === 'string' ? event.type : '';
    if (type.length === 0) return null;
    return new UserGesture(type, now().toISOString());
  }
}

/**
 * The access token, held so that it cannot be leaked by accident.
 *
 * The secret is a `#private` field, so it is not enumerable, not spreadable, not serialisable and
 * not visible to a logger handed this object. {@link toJSON} exists so that an object graph
 * containing one still serialises — to a REDACTION rather than to a throw, because a throw at the
 * moment somebody backs up a state object is a failure the coach would meet and the redaction is
 * what we actually want in the file either way.
 */
export class CarriedToken {
  readonly #accessToken: string;

  /** When it stops working, as an ISO instant. Roughly an hour after it was granted. */
  readonly expiresAt: string;

  /** The scopes Google actually GRANTED, which is not necessarily the ones that were asked for. */
  readonly scopes: readonly string[];

  constructor(accessToken: string, expiresAt: string, scopes: readonly string[]) {
    this.#accessToken = accessToken;
    this.expiresAt = expiresAt;
    this.scopes = Object.freeze([...scopes]);
    Object.freeze(this);
  }

  /**
   * The one door the secret leaves by, named so that every use of it is one `grep` away.
   *
   * Whatever calls this is making a request to Google with it and must not put the result anywhere
   * else — not in a store, not on the outbox, not in a journal entry, not in an export, not in a log
   * line.
   */
  authorizationHeader(): string {
    return `Bearer ${this.#accessToken}`;
  }

  /** Whether this token still works at the given instant. */
  isLiveAt(now: Date): boolean {
    return now.getTime() < Date.parse(this.expiresAt);
  }

  /** What this object looks like when something serialises it. Never the token. */
  toJSON(): { readonly kind: string; readonly expiresAt: string; readonly scopes: readonly string[] } {
    return { kind: REDACTED, expiresAt: this.expiresAt, scopes: this.scopes };
  }

  /** And what it looks like when something concatenates it into a string. */
  toString(): string {
    return REDACTED;
  }
}

/** What a serialised or stringified token says instead of saying the token. */
export const REDACTED = 'google access token, withheld';

/**
 * A provider token response, as much of it as this application will admit to knowing about.
 *
 * Deliberately not a full typing of what Google returns. Typing every field would put every field
 * within reach, and the point of {@link carryForward} is that most of them are never touched.
 */
export interface TokenResponseLike {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
  readonly scope?: unknown;
}

/** How long a token is assumed to last when the response does not say. Deliberately short. */
export const ASSUMED_TOKEN_SECONDS = 300;

/**
 * THE WHITELIST. Three fields off the provider's response, and the rest dropped on the floor.
 *
 * Reads `access_token`, `expires_in` and `scope`. It does not read, copy, spread, log or store
 * anything else, and it returns a value built from scratch rather than a modified copy of what came
 * in — so a field added to the response by Google next year is carried by nobody rather than carried
 * by default.
 *
 * @returns the carried token, or `null` when the response carries no usable token at all
 */
export function carryForward(response: TokenResponseLike | null | undefined, now: Date): CarriedToken | null {
  if (response === null || response === undefined) return null;

  const accessToken = typeof response.access_token === 'string' ? response.access_token : '';
  if (accessToken.length === 0) return null;

  const seconds = typeof response.expires_in === 'number' && Number.isFinite(response.expires_in)
    && response.expires_in > 0
    ? response.expires_in
    : ASSUMED_TOKEN_SECONDS;

  const granted = typeof response.scope === 'string' ? response.scope.split(' ') : [];

  return new CarriedToken(
    accessToken,
    new Date(now.getTime() + seconds * 1000).toISOString(),
    granted.filter((scope) => scope.length > 0),
  );
}

/**
 * Which of the three scopes Google did NOT grant.
 *
 * A partial grant is a real state and not a theoretical one: the consent screen lets a person tick
 * some boxes and not others. It is reported rather than absorbed, because absorbing it produces the
 * worst shape this build keeps meeting — the application believes it is connected, and a Drive write
 * or a meeting link fails much later for a reason nobody can trace back to a tick box.
 */
export function scopesNotGranted(token: CarriedToken): readonly string[] {
  return Object.freeze(GOOGLE_SCOPES.filter((wanted) => !token.scopes.includes(wanted)));
}

/** The slice of `google.accounts.oauth2` this application uses, named so a test can supply its own. */
export interface GoogleIdentityLike {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponseLike) => void;
    error_callback?: (error: { type?: unknown; message?: unknown }) => void;
  }): GoogleTokenClientLike;
  revoke(accessToken: string, done?: () => void): void;
}

/** The token client the identity library hands back. */
export interface GoogleTokenClientLike {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

/** The two things this needs of a store of small facts. The same narrow port `local-store.ts` takes. */
export interface SmallFactStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where the fact that this installation has authorised an account is remembered between sessions. */
export const GOOGLE_CONNECTION_KEY = 'fit.google-connection';

/**
 * What is remembered about the connection, which is deliberately almost nothing.
 *
 * NO ACCOUNT ADDRESS, no account identifier, no profile, no token. The application never asks for an
 * identity scope and never learns who is signed in, which is the strongest available protection: a
 * value that is never collected cannot leak into a backup, an export or the public repository. What
 * is remembered is that an authorisation happened and when — enough to tell "he has never connected
 * this device" apart from "his hour has run out", which are two different sentences to the coach.
 */
export interface RememberedConnection {
  readonly connectedAt: string;
}

/** The credential shape `core/status/surface.js` already accepts. Not a new vocabulary. */
export interface CredentialState {
  /** Whether Google has ever been connected on this device. False after signing out. */
  readonly present: boolean;
  /** Whether the connection is there but the access has run out. One tap fixes it. */
  readonly expired: boolean;
}

/** Why an acquisition did not produce a token. */
export type AcquireRefusalCode =
  | 'no-gesture'
  | 'not-configured'
  | 'identity-unavailable'
  | 'declined'
  | 'no-token';

/** What happened when the coach tapped. */
export type AcquireOutcome =
  | {
    readonly outcome: 'acquired';
    /** True when this device had no remembered connection before — a connect, not a renewal. */
    readonly firstAuthorisation: boolean;
    /** Empty on a full grant. Anything here is a scope he did not tick, and it must be surfaced. */
    readonly scopesNotGranted: readonly string[];
  }
  | {
    readonly outcome: 'refused';
    readonly code: AcquireRefusalCode;
    /** What the coach is told. Plain words, his language, and never an exception message. */
    readonly sentence: string;
  };

/**
 * The sentence for each refusal.
 *
 * Separate sentences because he can do something DIFFERENT about each one, which is the same reason
 * `local-store.ts` words its five refusals separately rather than saying "could not open".
 */
export const ACQUIRE_REFUSALS: Readonly<Record<AcquireRefusalCode, string>> = Object.freeze({
  'no-gesture':
    'Connecting to Google has to start from something you tap. Use the "Connect Google" button '
    + 'rather than waiting for it to happen on its own.',
  'not-configured':
    'This app has not been given its Google client id yet, so it cannot connect. Open Setup and '
    + 'follow the steps for creating the Google client id, then try again.',
  /*
   * NAMES NO CAUSE IT HAS NOT ESTABLISHED.
   *
   * This sentence used to read "which usually means this device is offline". It was shown to the
   * first real person who ever met it, ON A DEVICE THAT WAS ONLINE, and the true cause was neither
   * his network nor his browser: `index.html` did not load Google's script at all. A message that
   * volunteers one cause, confidently, having measured none, sends a non-technical reader to check
   * a thing that is not broken — and when it turns out to be fine he has nowhere left to go.
   *
   * "Usually means" is the tell. It is a sentence admitting it did not check something it could
   * have checked. What the app CAN know is stated by `identityUnavailableSentence` below; what it
   * cannot know it now says plainly rather than filling in.
   */
  'identity-unavailable':
    'Google\'s sign-in code could not be loaded, so connecting is not possible right now. '
    + 'Everything you do is still saved here on the device and will back up once it can connect.',
  declined:
    'The Google window closed without connecting. Nothing has changed, and everything you have done '
    + 'is still saved on this device. Tap "Connect Google" to try again.',
  'no-token':
    'Google did not return a working connection. Nothing has changed, and everything you have done '
    + 'is still saved on this device. Tap "Connect Google" to try again.',
});

/**
 * How the identity library is reached, and how the small facts are stored.
 *
 * Every one of these is a function rather than a value, because the identity library is a script
 * that arrives when it arrives: reading it once at construction would capture whatever was there
 * before it loaded, and the resulting failure would look exactly like an offline device.
 */
export interface GoogleConnectionDependencies {
  /** `google.accounts.oauth2`, or null while the script has not arrived. */
  readonly identity: () => GoogleIdentityLike | null;
  /** The client id the coach entered on the setup page, or null before he has. */
  readonly clientId: () => string | null;
  /** Where the remembered connection is kept, or null in a browser that refuses storage. */
  readonly storage: SmallFactStorage | null;
  readonly now?: () => Date;
  /**
   * TELL SOMEBODY WHICH CLIENT ID JUST WORKED — the only proof that one is the right one.
   *
   * A client id from the wrong Cloud project has a perfect shape and fails at the moment he signs in.
   * Connecting is the ONLY thing this application does with a client id, so connecting once is the
   * only thing that can prove it, and this is where that is watched happening.
   *
   * INJECTED RATHER THAN WRITTEN HERE, for the reason every other dependency on this interface is:
   * this module knows about a credential and must not also know where a screen's statement keeps its
   * evidence. It is handed the id THIS ACQUISITION USED — see the call site — and it is called ONLY
   * on success, because a failure is not a disproof.
   */
  readonly noteClientIdProven?: (clientId: string) => void;
}

/**
 * THE CONNECTION — one per application, holding at most one token, arming nothing.
 *
 * A class rather than a module of functions because there is genuine state: a token that must not be
 * written down anywhere durable, and a token client the identity library only wants built once. Both
 * live for as long as the tab does and no longer, which is exactly right for a foreground-only
 * credential.
 */
export class GoogleConnection {
  readonly #identity: () => GoogleIdentityLike | null;
  readonly #clientId: () => string | null;
  readonly #storage: SmallFactStorage | null;
  readonly #now: () => Date;
  readonly #noteClientIdProven: (clientId: string) => void;

  /** The live token. In memory only, for the lifetime of this tab, and never persisted. */
  #token: CarriedToken | null = null;

  /** The identity library's client, built once per client id. */
  #client: GoogleTokenClientLike | null = null;
  #clientBuiltFor: string | null = null;

  /** The request currently waiting on the library's callbacks, if there is one. */
  #pending: ((value: TokenResponseLike | null) => void) | null = null;

  constructor({
    identity, clientId, storage, now, noteClientIdProven,
  }: GoogleConnectionDependencies) {
    this.#identity = identity;
    this.#clientId = clientId;
    this.#storage = storage;
    this.#now = now ?? (() => new Date());
    this.#noteClientIdProven = noteClientIdProven ?? (() => {});
  }

  /**
   * THE ONLY PATH TO A TOKEN. Ask Google, as part of something the coach just did.
   *
   * It is the same call for the first connection and for the hourly renewal, deliberately: a
   * separate renewal path is a path that could be called from somewhere a gesture is not, and there
   * would then be two doors to keep shut instead of one.
   *
   * It never throws. Every way this can fail is a state the coach is told about in his own language,
   * and losing one to an exception would turn a sentence he can act on into a blank screen.
   *
   * @param gesture the proof a person caused this; `null` is refused rather than assumed benign
   */
  async acquireForGesture(gesture: UserGesture | null): Promise<AcquireOutcome> {
    if (gesture === null) return refused('no-gesture');

    const clientId = this.#clientId();
    if (clientId === null || clientId.length === 0) return refused('not-configured');

    const identity = this.#identity();
    if (identity === null) return refused('identity-unavailable');

    const firstAuthorisation = this.rememberedConnection() === null;

    const response = await this.#request(identity, clientId);
    if (response === null) return refused('declined');

    const token = carryForward(response, this.#now());
    if (token === null) return refused('no-token');

    this.#token = token;
    this.#remember();

    // THE ID THIS ACQUISITION USED, and never a fresh read of the setting. A sign-in takes as long as
    // a person takes to read a consent screen, and he can edit the box on the setup page while it is
    // in flight — a read here would stamp the NEW id as proven on the strength of the OLD id having
    // worked, which is exactly the drift the whole proof design exists to prevent. `clientId` is the
    // value the request was formed with, captured above.
    //
    // Reported rather than allowed to escape: a statement on a screen is not worth losing a
    // connection the coach has already completed.
    try {
      this.#noteClientIdProven(clientId);
    } catch (error) {
      console.error('[google] the client id that worked could not be noted', error);
    }

    return Object.freeze({
      outcome: 'acquired' as const,
      firstAuthorisation,
      scopesNotGranted: scopesNotGranted(token),
    });
  }

  /**
   * The credential, in the shape `accountabilityStatus` already accepts.
   *
   * Three states and they map onto two sentences the coach is already shown by
   * `core/status/reasons.js`, which this does not reword and does not extend:
   *
   *  - never connected here          → `{present: false}` → "Google has not been connected on this
   *                                     device, so nothing can be backed up."
   *  - connected, token in hand      → `{present: true, expired: false}` → no credential reason.
   *  - connected, no live token      → `{present: true, expired: true}` → "Your Google connection has
   *                                     expired, so nothing can be backed up until you reconnect."
   *
   * THE THIRD IS THE ORDINARY CASE AND NOT AN ERROR. There is no refresh token, so a tab that has
   * just been opened has a remembered connection and no token at all until he taps something. The
   * expired sentence and its one-tap action are exactly the right words for that, which is why no
   * fourth state and no new reason code is invented for it.
   */
  credential(): CredentialState {
    if (this.rememberedConnection() === null) {
      return Object.freeze({ present: false, expired: false });
    }
    return Object.freeze({ present: true, expired: this.#liveToken() === null });
  }

  /**
   * The token to make a request with, or `null`.
   *
   * `null` here is not a failure to report — it is the queue's ordinary "not now", which the durable
   * outbox already turns into a delay rather than a loss.
   */
  tokenForRequest(): CarriedToken | null {
    return this.#liveToken();
  }

  /** Whether this installation has ever authorised an account, and when. */
  rememberedConnection(): RememberedConnection | null {
    if (this.#storage === null) return null;
    let raw: string | null;
    try {
      raw = this.#storage.getItem(GOOGLE_CONNECTION_KEY);
    } catch (error) {
      console.error('[google] the remembered connection could not be read', error);
      return null;
    }
    if (raw === null) return null;
    try {
      const held = JSON.parse(raw) as { connectedAt?: unknown };
      const connectedAt = typeof held.connectedAt === 'string' ? held.connectedAt : '';
      return connectedAt.length === 0 ? null : { connectedAt };
    } catch (error) {
      console.error('[google] the remembered connection is not readable; ignoring it', error);
      return null;
    }
  }

  /**
   * Drop the connection on THIS device: the live token and the remembered fact, and tell Google.
   *
   * Local application data is not touched and is not this function's business — see `d110` and
   * `google-account.ts`, which owns the coach-facing act and the log entry that goes with it. This
   * is the mechanism underneath it.
   *
   * The revocation is BEST EFFORT and says so in what it returns, because it needs the network and
   * signing out on a device with no network must still work. A revocation that did not happen leaves
   * the grant standing at Google until he removes it in his own account settings, and the caller is
   * told that rather than being allowed to imply otherwise.
   *
   * @returns whether Google was actually told
   */
  async dropConnection(): Promise<{ readonly revokedAtGoogle: boolean }> {
    const token = this.#token;
    this.#token = null;
    this.#forget();

    if (token === null) return { revokedAtGoogle: false };

    const identity = this.#identity();
    if (identity === null) return { revokedAtGoogle: false };

    // The header is the one door the secret leaves by; the library wants the bare token, so it is
    // taken back off here rather than a second accessor existing for it.
    const bare = token.authorizationHeader().slice('Bearer '.length);
    try {
      await new Promise<void>((resolve) => {
        identity.revoke(bare, () => resolve());
      });
      return { revokedAtGoogle: true };
    } catch (error) {
      console.error('[google] the access could not be revoked at Google', error);
      return { revokedAtGoogle: false };
    }
  }

  /** The token if it is still alive, and `null` the moment it is not. */
  #liveToken(): CarriedToken | null {
    if (this.#token === null) return null;
    if (!this.#token.isLiveAt(this.#now())) {
      // Dropped rather than kept and re-checked, so there is no window in which a dead token is
      // still reachable by something that did not think to ask.
      this.#token = null;
      return null;
    }
    return this.#token;
  }

  /**
   * One round trip through the identity library's callback pair, as a promise.
   *
   * Both callbacks resolve; neither rejects. A person closing the Google window is an ordinary thing
   * he did and not an exception, and the `error_callback` fires for exactly that.
   */
  #request(identity: GoogleIdentityLike, clientId: string): Promise<TokenResponseLike | null> {
    return new Promise((resolve) => {
      let settled = false;
      const once = (value: TokenResponseLike | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const client = this.#tokenClient(identity, clientId, once);
      if (client === null) {
        once(null);
        return;
      }

      try {
        client.requestAccessToken();
      } catch (error) {
        console.error('[google] the token request could not be started', error);
        once(null);
      }
    });
  }

  /**
   * The identity library's client, built once per client id.
   *
   * Rebuilt when the client id changes, which happens exactly once in an installation's life: on the
   * setup page, when the coach enters it. The callbacks are re-pointed at the current request each
   * time rather than the client being rebuilt per tap, because the library treats a fresh client as
   * a fresh grant and the coach would meet the full consent screen every hour instead of a moment.
   */
  #tokenClient(
    identity: GoogleIdentityLike,
    clientId: string,
    settle: (value: TokenResponseLike | null) => void,
  ): GoogleTokenClientLike | null {
    this.#pending = settle;

    if (this.#client !== null && this.#clientBuiltFor === clientId) return this.#client;

    try {
      this.#client = identity.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE_REQUEST,
        // The response is handed straight to the pending request and nowhere else. It is not held,
        // not copied and not logged: this is the raw provider object the whitelist exists for.
        callback: (response) => this.#settlePending(response),
        error_callback: () => this.#settlePending(null),
      });
      this.#clientBuiltFor = clientId;
      return this.#client;
    } catch (error) {
      console.error('[google] the Google sign-in client could not be built', error);
      this.#client = null;
      this.#clientBuiltFor = null;
      return null;
    }
  }

  #settlePending(response: TokenResponseLike | null): void {
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) pending(response);
  }

  #remember(): void {
    if (this.#storage === null) return;
    try {
      this.#storage.setItem(
        GOOGLE_CONNECTION_KEY,
        JSON.stringify({ connectedAt: this.#now().toISOString() }),
      );
    } catch (error) {
      // Logged rather than swallowed. The connection still works for this tab; what is lost is the
      // application's memory of it, which shows up as being asked to connect again next launch.
      console.error('[google] the Google connection could not be remembered', error);
    }
  }

  #forget(): void {
    if (this.#storage === null) return;
    try {
      this.#storage.removeItem(GOOGLE_CONNECTION_KEY);
    } catch (error) {
      console.error('[google] the Google connection could not be forgotten', error);
    }
  }
}

/** A refusal, worded. */
/**
 * WHAT THE APPLICATION CAN ACTUALLY ESTABLISH ABOUT A FAILED SCRIPT LOAD, AND NOTHING BEYOND IT.
 *
 * Three states, and they are genuinely different things for the reader to do:
 *
 * - The browser says it is offline. Then offline IS the cause, measured rather than assumed, and
 *   the reader has something to fix.
 * - The script tag reported an error while the browser believes it is online. Then it is NOT his
 *   connection — something refused or blocked the request, and telling him to check his network
 *   would waste his time. He is pointed at the class of cause that is actually left.
 * - Neither flag says anything. Then WE DO NOT KNOW, and that is what he is told. An honest
 *   "we could not tell you why" beats a confident wrong reason, because the wrong reason is the
 *   one he acts on.
 *
 * `__gisError` is set by the `onerror` handler on the script tag in `index.html`. Both globals are
 * read defensively: a browser that never ran the tag has neither, which is the third case.
 */
export function identityUnavailableSentence(global: typeof globalThis = globalThis): string {
  const flags = global as unknown as { __gisError?: unknown; navigator?: { onLine?: unknown } };
  const online = flags.navigator?.onLine;
  const scriptErrored = flags.__gisError === true;

  const cause = online === false
    ? 'This device appears to be offline.'
    : scriptErrored
      ? 'Your device is online, so this is not a connection problem — something on this device or '
        + 'network blocked the request to Google.'
      : 'We could not tell why.';

  return `Google's sign-in code could not be loaded. ${cause} Everything you do is still saved `
    + 'here on the device and will back up once it can connect.';
}

function refused(code: AcquireRefusalCode): AcquireOutcome {
  // The one refusal whose cause is measurable at the moment it happens rather than fixed in a
  // table. Every other code means exactly one thing; this one meant three and used to guess.
  const sentence = code === 'identity-unavailable'
    ? identityUnavailableSentence()
    : ACQUIRE_REFUSALS[code];
  return Object.freeze({ outcome: 'refused' as const, code, sentence });
}

/**
 * THE CREDENTIAL, PROVEN AT ITS EDGES RATHER THAN ITS MIDDLE.
 *
 * Three properties carry the weight, and each of them is a thing that would fail SILENTLY:
 *
 *  1. **A token cannot be obtained without a gesture.** Not "is not", which a later refactor
 *     undoes without noticing — cannot, because the type that authorises it can only be minted from
 *     an event the browser marked trusted.
 *  2. **A remembered connection with no live token reads as EXPIRED, not as missing.** Those are two
 *     different sentences to the coach, one of which sends him to Setup for no reason.
 *  3. **The raw response is not what is carried.** Proven here on the shape, and proven with a
 *     decoding sweep over a poisoned response in `google-privacy.test.ts`.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACQUIRE_REFUSALS,
  ASSUMED_TOKEN_SECONDS,
  CarriedToken,
  GOOGLE_CONNECTION_KEY,
  GOOGLE_SCOPES,
  GOOGLE_SCOPE_REQUEST,
  GoogleConnection,
  REDACTED,
  UserGesture,
  carryForward,
  scopesNotGranted,
} from './google-identity.ts';
import type {
  AcquireOutcome,
  GoogleIdentityLike,
  GoogleTokenClientLike,
  SmallFactStorage,
  TokenResponseLike,
} from './google-identity.ts';

const AT = new Date('2026-07-25T09:00:00.000Z');
const AN_HOUR_LATER = new Date('2026-07-25T10:00:00.000Z');

/** A tap, as the browser reports one. */
const A_REAL_TAP = { isTrusted: true, type: 'click' };

/** Small facts, in memory, and able to refuse the way a locked-down browser does. */
class Facts implements SmallFactStorage {
  held = new Map<string, string>();
  refuse = false;

  getItem(key: string): string | null {
    if (this.refuse) throw new Error('storage is not available');
    return this.held.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.refuse) throw new Error('storage is not available');
    this.held.set(key, value);
  }

  removeItem(key: string): void {
    if (this.refuse) throw new Error('storage is not available');
    this.held.delete(key);
  }
}

/** The identity library double, plus the counters a test asserts against. */
type FakeIdentity = GoogleIdentityLike & { built: number; requested: number; revoked: string[] };

/** The identity library, answering however a test needs it to. */
function identityAnswering(answers: {
  respondWith?: () => TokenResponseLike | null;
  onInit?: (config: { client_id: string; scope: string }) => void;
  revoke?: (token: string) => void;
  failToBuild?: boolean;
}): FakeIdentity {
  const record = {
    built: 0,
    requested: 0,
    revoked: [] as string[],
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponseLike) => void;
      error_callback?: (error: { type?: unknown }) => void;
    }): GoogleTokenClientLike {
      if (answers.failToBuild) throw new Error('the library refused to build a client');
      record.built += 1;
      answers.onInit?.(config);
      return {
        requestAccessToken(): void {
          record.requested += 1;
          const response = (answers.respondWith ?? (() => aTokenResponse()))();
          if (response === null) config.error_callback?.({ type: 'popup_closed' });
          else config.callback(response);
        },
      };
    },
    revoke(token: string, done?: () => void): void {
      record.revoked.push(token);
      answers.revoke?.(token);
      done?.();
    },
  };
  return record;
}

/** A response shaped the way Google shapes one, with every scope granted. */
function aTokenResponse(overrides: Record<string, unknown> = {}): TokenResponseLike {
  return {
    access_token: 'ya29.a0-not-a-real-token',
    expires_in: 3599,
    scope: GOOGLE_SCOPES.join(' '),
    ...overrides,
  };
}

function aConnection(options: {
  identity?: FakeIdentity | null;
  clientId?: string | null;
  facts?: Facts;
  now?: () => Date;
} = {}) {
  const facts = options.facts ?? new Facts();
  const identity: FakeIdentity | null = options.identity === undefined ? identityAnswering({}) : options.identity;
  const connection = new GoogleConnection({
    identity: () => identity,
    clientId: () => (options.clientId === undefined ? 'a-client-id.apps.googleusercontent.com' : options.clientId),
    storage: facts,
    now: options.now ?? (() => AT),
  });
  return { connection, facts };
}

/** The refusal code, or the empty string when the outcome was not a refusal. */
function refusalCode(outcome: AcquireOutcome): string {
  return outcome.outcome === 'refused' ? outcome.code : '';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the scopes asked for', () => {
  it('are exactly the three that were proven, and no broad Drive scope', () => {
    assert.deepEqual(GOOGLE_SCOPES, [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/calendar.events',
    ]);
  });

  it('are requested as one space-separated set, so the coach meets one consent screen', () => {
    assert.equal(GOOGLE_SCOPE_REQUEST.split(' ').length, 3);
    assert.equal(GOOGLE_SCOPE_REQUEST, GOOGLE_SCOPES.join(' '));
  });

  it('reach the identity library unchanged', async () => {
    let asked = '';
    const identity = identityAnswering({ onInit: (config) => { asked = config.scope; } });
    const { connection } = aConnection({ identity });

    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.equal(asked, GOOGLE_SCOPE_REQUEST);
  });
});

describe('the gesture', () => {
  it('is minted from an event the browser marked trusted', () => {
    const gesture = UserGesture.fromTrustedEvent(A_REAL_TAP, () => AT);
    assert.ok(gesture instanceof UserGesture);
    assert.equal(gesture?.type, 'click');
    assert.equal(gesture?.at, AT.toISOString());
  });

  it('REFUSES an event dispatched from script, which is what a background renewal would have', () => {
    assert.equal(UserGesture.fromTrustedEvent({ isTrusted: false, type: 'click' }), null);
  });

  it('refuses nothing at all, which is what a timer has', () => {
    assert.equal(UserGesture.fromTrustedEvent(null), null);
    assert.equal(UserGesture.fromTrustedEvent(undefined), null);
    assert.equal(UserGesture.fromTrustedEvent({ isTrusted: true }), null);
  });
});

describe('acquiring a token', () => {
  it('will not happen without a gesture, and the library is never even asked', async () => {
    const identity = identityAnswering({});
    const { connection } = aConnection({ identity });

    const outcome = await connection.acquireForGesture(null);

    assert.equal(refusalCode(outcome), 'no-gesture');
    assert.equal(outcome.outcome === 'refused' && outcome.sentence, ACQUIRE_REFUSALS['no-gesture']);
    assert.equal(identity.built, 0, 'nothing may reach Google without a person causing it');
    assert.equal(identity.requested, 0);
    assert.equal(connection.tokenForRequest(), null);
  });

  it('succeeds from a real tap, and reports it as the FIRST authorisation', async () => {
    const { connection, facts } = aConnection();

    const outcome = await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.equal(outcome.outcome, 'acquired');
    assert.equal(outcome.outcome === 'acquired' && outcome.firstAuthorisation, true);
    assert.deepEqual(outcome.outcome === 'acquired' && outcome.scopesNotGranted, []);
    assert.ok(facts.held.has(GOOGLE_CONNECTION_KEY));
  });

  it('reports the second one as a renewal rather than a connection', async () => {
    const { connection } = aConnection();
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    const again = await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.equal(again.outcome === 'acquired' && again.firstAuthorisation, false);
  });

  it('builds the library client ONCE across renewals, so he does not meet consent every hour', async () => {
    const identity = identityAnswering({});
    const { connection } = aConnection({ identity });

    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.equal(identity.built, 1);
    assert.equal(identity.requested, 3);
  });

  it('SURFACES a partial grant rather than absorbing it', async () => {
    const identity = identityAnswering({
      respondWith: () => aTokenResponse({
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
      }),
    });
    const { connection } = aConnection({ identity });

    const outcome = await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.deepEqual(
      outcome.outcome === 'acquired' && outcome.scopesNotGranted,
      ['https://www.googleapis.com/auth/calendar.events'],
      'a scope he did not tick must be reported here rather than discovered much later when a '
      + 'meeting link silently fails to mint',
    );
  });

  it('words the four ways it can fail differently, because he can do something different about each', async () => {
    const tap = () => UserGesture.fromTrustedEvent(A_REAL_TAP);

    const noClientId = aConnection({ clientId: null });
    assert.equal(refusalCode(await noClientId.connection.acquireForGesture(tap())), 'not-configured');

    const noLibrary = aConnection({ identity: null });
    assert.equal(refusalCode(await noLibrary.connection.acquireForGesture(tap())), 'identity-unavailable');

    const closedTheWindow = aConnection({ identity: identityAnswering({ respondWith: () => null }) });
    assert.equal(refusalCode(await closedTheWindow.connection.acquireForGesture(tap())), 'declined');

    const nothingUsable = aConnection({
      identity: identityAnswering({ respondWith: () => ({ expires_in: 3599 }) }),
    });
    assert.equal(refusalCode(await nothingUsable.connection.acquireForGesture(tap())), 'no-token');

    const sentences = new Set(Object.values(ACQUIRE_REFUSALS));
    assert.equal(sentences.size, Object.keys(ACQUIRE_REFUSALS).length,
      'five refusals with a shared sentence would be one refusal wearing five names');
  });

  it('never throws, even when the library itself throws while building a client', async () => {
    const { connection } = aConnection({ identity: identityAnswering({ failToBuild: true }) });

    const outcome = await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    assert.equal(outcome.outcome, 'refused');
  });
});

describe('the credential state the accountability surface reads', () => {
  it('is ABSENT before he has ever connected', () => {
    const { connection } = aConnection();
    assert.deepEqual(connection.credential(), { present: false, expired: false });
  });

  it('is present and live with a token in hand', async () => {
    const { connection } = aConnection();
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));
    assert.deepEqual(connection.credential(), { present: true, expired: false });
  });

  it('is present and EXPIRED once the hour has run out — not missing', async () => {
    let now = AT;
    const { connection } = aConnection({ now: () => now });
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    now = AN_HOUR_LATER;

    assert.deepEqual(connection.credential(), { present: true, expired: true },
      'expired sends him to a one-tap reconnect; missing sends him to Setup for no reason');
    assert.equal(connection.tokenForRequest(), null);
  });

  it('is present and expired in a FRESH TAB, which is the ordinary case and not a fault', () => {
    const facts = new Facts();
    facts.held.set(GOOGLE_CONNECTION_KEY, JSON.stringify({ connectedAt: AT.toISOString() }));

    const { connection } = aConnection({ facts });

    assert.deepEqual(connection.credential(), { present: true, expired: true },
      'there is no refresh token, so a tab that has just opened has a connection and no token at '
      + 'all until he taps something. That is the design, not a failure.');
  });

  it('is absent again after the connection is dropped', async () => {
    const { connection } = aConnection();
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    await connection.dropConnection();

    assert.deepEqual(connection.credential(), { present: false, expired: false });
    assert.equal(connection.rememberedConnection(), null);
  });

  it('survives a browser that refuses storage entirely, rather than throwing at start', () => {
    const facts = new Facts();
    facts.refuse = true;
    const { connection } = aConnection({ facts });

    assert.deepEqual(connection.credential(), { present: false, expired: false });
  });
});

describe('dropping the connection', () => {
  it('tells Google, and says that it did', async () => {
    const identity = identityAnswering({});
    const { connection } = aConnection({ identity });
    await connection.acquireForGesture(UserGesture.fromTrustedEvent(A_REAL_TAP));

    const { revokedAtGoogle } = await connection.dropConnection();

    assert.equal(revokedAtGoogle, true);
    assert.deepEqual(identity.revoked, ['ya29.a0-not-a-real-token']);
  });

  it('still works with no library to tell, and does NOT claim it revoked anything', async () => {
    const facts = new Facts();
    facts.held.set(GOOGLE_CONNECTION_KEY, JSON.stringify({ connectedAt: AT.toISOString() }));
    const { connection } = aConnection({ facts, identity: null });

    const { revokedAtGoogle } = await connection.dropConnection();

    assert.equal(revokedAtGoogle, false, 'an unreachable Google is an ordinary way to sign out, and '
      + 'reporting it as a completed revocation would be a claim nobody measured');
    assert.equal(connection.rememberedConnection(), null, 'and it is still dropped HERE');
  });
});

describe('the carried token', () => {
  it('takes three fields off the response and nothing else', () => {
    const token = carryForward(aTokenResponse(), AT);

    assert.ok(token instanceof CarriedToken);
    assert.equal(token?.expiresAt, new Date(AT.getTime() + 3599 * 1000).toISOString());
    assert.deepEqual(token?.scopes, [...GOOGLE_SCOPES]);
  });

  it('holds the secret where JSON.stringify, a spread and a log line cannot reach it', () => {
    const token = carryForward(aTokenResponse(), AT) as CarriedToken;

    const serialised = JSON.stringify({ credential: token });
    assert.equal(serialised.includes('ya29'), false, 'the token must not survive serialisation');
    assert.equal(serialised.includes(REDACTED), true, 'and what is there instead must say so');
    assert.equal(String(token).includes('ya29'), false);
    assert.deepEqual(Object.keys({ ...token }), ['expiresAt', 'scopes'],
      'a spread must not be able to pick the secret up');
    assert.equal(token.authorizationHeader(), 'Bearer ya29.a0-not-a-real-token',
      'and the one named door still opens');
  });

  it('assumes a SHORT life when the response does not say, rather than a generous one', () => {
    const token = carryForward({ access_token: 'a-token' }, AT);
    assert.equal(token?.expiresAt, new Date(AT.getTime() + ASSUMED_TOKEN_SECONDS * 1000).toISOString());
    assert.ok(ASSUMED_TOKEN_SECONDS < 3600,
      'guessing LONG would have the application believe it holds a working token it does not');
  });

  it('is nothing at all when the response carries no usable token', () => {
    assert.equal(carryForward(null, AT), null);
    assert.equal(carryForward({}, AT), null);
    assert.equal(carryForward({ access_token: '' }, AT), null);
    assert.equal(carryForward({ access_token: 42 }, AT), null);
  });

  it('knows which of the three scopes it did not get', () => {
    const token = carryForward(aTokenResponse({ scope: '' }), AT) as CarriedToken;
    assert.deepEqual(scopesNotGranted(token), [...GOOGLE_SCOPES]);
  });
});

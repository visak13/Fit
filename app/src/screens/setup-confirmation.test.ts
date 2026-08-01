/**
 * ENTERED IS NOT CONFIRMED — the machinery that supplies `proven`, held to MOVING rather than to
 * rendering.
 *
 * `setup.ts` words three states and takes `proven` as evidence it is handed. `setting-proof.ts`
 * supplies that evidence, and the whole of this file is about one property: THE STATEMENT MUST BE
 * DERIVED FROM WHAT IS TRUE NOW. A statement that renders three ways in three unit tests and never
 * moves in the running application is the shape this build keeps catching, so nothing here asserts a
 * sentence in isolation — every case DRIVES a real transition through the production path and asserts
 * the words CHANGED.
 *
 * ## THE PROOFS ARE DRIVEN THROUGH THE REAL CLASSES, NOT SIMULATED BY WRITING THE KEY
 *
 * A test that wrote the proof key itself would prove the derivation and nothing else — and the
 * expensive half of this action is that the two writers are wired at all, on the ONE connection this
 * tab has. So the client id's proof comes out of a real {@link GoogleConnection} over a fake identity
 * library, and the calendar's comes out of a real {@link GoogleMeetLinks} over a fake transport. If
 * either wiring is removed, cases here go red rather than staying green over a hand-written key.
 *
 * ## THE THREE WAYS THIS CAN BE WRONG, EACH WITH ITS OWN CASE
 *
 *  1. A PLAUSIBLE ID FROM THE WRONG PROJECT is claimed as working. It is shaped perfectly and has
 *     never signed in, and the shape check cannot tell — that is the case the three states exist for.
 *  2. A PROOF SURVIVES THE VALUE IT WAS ABOUT. He pastes a second client id and inherits the first
 *     one's proof. The value-not-flag design makes this unrepresentable; it is asserted anyway,
 *     including at the seam the design does not cover by itself — an id edited WHILE a sign-in is in
 *     flight.
 *  3. A TRANSIENT FAILURE RETIRES A GOOD PROOF. A flat network or a closed Google window would tell
 *     him his working setup had broken, at the moment he can least check it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SMALL_FACT_KEYS, browserErasure } from '../platform/google-account.ts';
import { GoogleConnection, UserGesture } from '../platform/google-identity.ts';
import type {
  GoogleIdentityLike, GoogleTokenClientLike, SmallFactStorage, TokenResponseLike,
} from '../platform/google-identity.ts';
import { GoogleMeetLinks } from '../platform/google-meet.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY, writeSetting } from '../platform/google-settings.ts';
import {
  CLIENT_ID_PROVEN_KEY, COACHING_CALENDAR_PROVEN_KEY, PROOF_KEY_FOR, hasBeenProven, provenValue,
  recordProvenValue,
} from '../platform/setting-proof.ts';
import { CLIENT_ID_SUFFIX, SETUP_FIELDS, checkClientIdShape } from './setup.ts';
import { SETUP_SECTIONS, standingFor } from './setup-surface.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The world these run in
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** A browser's small-fact storage, standing in for one. */
function fakeStorage(): SmallFactStorage & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => { held.set(key, value); },
    removeItem: (key) => { held.delete(key); },
  };
}

/** Two real-shaped client ids from two different Cloud projects. Both pass the shape check. */
const FIRST_CLIENT_ID = `111111111111-aaaaaaaaaaaa${CLIENT_ID_SUFFIX}`;
const SECOND_CLIENT_ID = `222222222222-bbbbbbbbbbbb${CLIENT_ID_SUFFIX}`;
const COACHING_CALENDAR = 'coaching@group.calendar.google.com';
const OTHER_CALENDAR = 'other@group.calendar.google.com';

/** The field for one key, as the screen gets it. */
function fieldFor(key: string) {
  const found = SETUP_FIELDS.find((field) => field.key === key);
  if (found === undefined) throw new Error(`no field for ${key}`);
  return found;
}

const CLIENT_ID_FIELD = fieldFor(GOOGLE_CLIENT_ID_KEY);
const CALENDAR_FIELD = fieldFor(COACHING_CALENDAR_KEY);

/**
 * A stand-in identity library whose answer is HELD until the test lets it go.
 *
 * The holding is the point rather than a convenience: the window between the request being formed and
 * the answer arriving is where a person reads a consent screen, and it is the window in which he can
 * edit the setting. A double that answered immediately could not exercise it at all.
 */
function heldIdentity() {
  let settle: ((response: TokenResponseLike | null) => void) | null = null;
  let builtFor: string | null = null;

  const identity: GoogleIdentityLike = {
    initTokenClient(config): GoogleTokenClientLike {
      builtFor = config.client_id;
      return {
        requestAccessToken() {
          settle = (response) => {
            if (response === null) config.error_callback?.({ type: 'popup_closed' });
            else config.callback(response);
          };
        },
      };
    },
    revoke(_token, done) { done?.(); },
  };

  return {
    identity,
    builtFor: () => builtFor,
    /** Answer with a working token. */
    succeed() {
      assert.notEqual(settle, null, 'nothing asked for a token, so there is nothing to answer');
      settle?.({
        access_token: 'a-token-that-never-leaves-this-process',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata '
          + 'https://www.googleapis.com/auth/calendar.events',
      });
    },
    /** Answer the way a person closing the Google window does. */
    decline() {
      assert.notEqual(settle, null, 'nothing asked for a token, so there is nothing to answer');
      settle?.(null);
    },
  };
}

/** A connection over that library, reading its client id from storage exactly as the app's does. */
function connectionOver(storage: SmallFactStorage, identity: GoogleIdentityLike) {
  return new GoogleConnection({
    identity: () => identity,
    clientId: () => storage.getItem(GOOGLE_CLIENT_ID_KEY),
    storage,
    // THE WIRING THIS FILE EXISTS TO PROVE, in the same form `google-on-this-device.ts` supplies it.
    noteClientIdProven: (used) => { recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, used); },
  });
}

/** A trusted gesture, which is the only kind an acquisition accepts. */
function tap(): UserGesture {
  const gesture = UserGesture.fromTrustedEvent({ isTrusted: true, type: 'click' });
  assert.notEqual(gesture, null, 'a trusted event did not mint a gesture');
  return gesture as UserGesture;
}

/** A live token, so a mint has something to go on. */
function tokenFor(storage: SmallFactStorage) {
  const held = heldIdentity();
  const connection = connectionOver(storage, held.identity);
  return { connection, held };
}

/** A calendar service that answers one insert with a real conference, and holds nothing back. */
function calendarThatMints() {
  const inserted: string[] = [];
  return {
    inserted,
    transport: async (url: string) => {
      inserted.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'event-1',
          conferenceData: {
            createRequest: { status: { statusCode: 'success' } },
            entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/tst-fake-lnk' }],
          },
        }),
      } as never;
    },
  };
}

/** A calendar service that refuses, the way one that cannot make conferences does. */
const calendarThatRefuses = async () => ({
  ok: false,
  status: 403,
  json: async () => ({}),
} as never);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The derivation itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('where a setting stands, derived rather than remembered', () => {
  it('MOVES through all three states as the facts under it change, and the words change with it', () => {
    const storage = fakeStorage();

    const nothing = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(nothing.state, 'nothing-entered');

    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    const entered = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(entered.state, 'never-used');

    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID);
    const proven = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(proven.state, 'proven');

    // THE SENTENCES ARE THREE DIFFERENT SENTENCES. Without this the three assertions above would be
    // satisfied by one statement that never changed a word of what he actually reads.
    const said = [nothing.sentence, entered.sentence, proven.sentence];
    assert.equal(new Set(said).size, 3, `the statement did not change: ${said.join(' / ')}`);
    for (const sentence of said) assert.ok(sentence.length > 20, `an empty statement: ${sentence}`);
  });

  it('names WHICH proof in each middle state, and they are DIFFERENT proofs per id', () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);

    const client = standingFor(storage, CLIENT_ID_FIELD).sentence;
    const calendar = standingFor(storage, CALENDAR_FIELD).sentence;

    assert.ok(client.includes('Signing in'), `the client id's statement does not name its proof: ${client}`);
    assert.ok(
      calendar.includes('meeting link'),
      `the calendar's statement does not name its proof: ${calendar}`,
    );
    assert.notEqual(client, calendar, 'both ids were given the same proof, and they have different ones');
  });

  it('REFUSES to claim a perfectly shaped id from the wrong project — the case the states exist for', () => {
    const storage = fakeStorage();
    // Shaped right. The shape check has no complaint, and it is the only thing that could look at it
    // before a sign-in is attempted.
    assert.equal(checkClientIdShape(SECOND_CLIENT_ID).verdict, 'looks-right');

    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, SECOND_CLIENT_ID);
    const standing = standingFor(storage, CLIENT_ID_FIELD);

    assert.equal(standing.state, 'never-used', 'a shape check was allowed to stand in for a proof');

    // AND THE WORDS ARE NOT THE PROVEN ONES. Asserted by comparison rather than by looking for a
    // phrase: a1's never-used sentence names what WOULD prove the id, so it legitimately contains
    // most of the vocabulary the proven one does, and a substring matcher against that vocabulary
    // fails on the honest wording rather than on the claim.
    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, SECOND_CLIENT_ID);
    assert.notEqual(
      standing.sentence,
      standingFor(storage, CLIENT_ID_FIELD).sentence,
      'a plausible id reads exactly as a proven one does',
    );
  });

  it('RETIRES a proof the moment the saved value stops being the proven one — a flag would not', () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID);
    const before = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(before.state, 'proven');

    // He pastes a second project's id. NOTHING is told to forget anything.
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, SECOND_CLIENT_ID);
    const after = standingFor(storage, CLIENT_ID_FIELD);

    assert.equal(after.state, 'never-used', 'the second id inherited the first one\'s proof');
    assert.notEqual(after.sentence, before.sentence, 'the words did not move with the state');

    // And putting the proven one back is enough, with nothing re-proving it: the proof was never
    // about an event, it was about a value.
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'proven');
  });

  it('falls back to nothing-entered when he CLEARS a proven setting, which is how one is taken back', () => {
    const storage = fakeStorage();
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);
    recordProvenValue(storage, COACHING_CALENDAR_PROVEN_KEY, COACHING_CALENDAR);
    assert.equal(standingFor(storage, CALENDAR_FIELD).state, 'proven');

    writeSetting(storage, COACHING_CALENDAR_KEY, '');
    assert.equal(standingFor(storage, CALENDAR_FIELD).state, 'nothing-entered');
  });

  it('reads each setting against ITS OWN proof, so no field can be answered with another\'s', () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);
    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID);

    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'proven');
    assert.equal(
      standingFor(storage, CALENDAR_FIELD).state,
      'never-used',
      'the calendar was proven by the client id having signed in',
    );
  });

  it('gives every field the screen draws a proof name, so none is silently unprovable', () => {
    for (const field of SETUP_FIELDS) {
      assert.ok(
        typeof PROOF_KEY_FOR[field.key] === 'string',
        `“${field.label}” has no proof name, so its statement could never leave never-used`,
      );
    }
    // And nothing pairs them by hand: the two names are different, which is what stops one setting
    // being answered with the other's evidence.
    assert.notEqual(PROOF_KEY_FOR[GOOGLE_CLIENT_ID_KEY], PROOF_KEY_FOR[COACHING_CALENDAR_KEY]);
  });

  it('answers never-used rather than throwing when the browser refuses to remember anything', () => {
    // Storage refused: nothing is saved and nothing can be proven, and the honest reading of that is
    // the first state rather than an exception on the way to a screen.
    assert.equal(standingFor(null, CLIENT_ID_FIELD).state, 'nothing-entered');
    assert.equal(hasBeenProven(null, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The client id's proof, out of a real sign-in
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the client id becomes proven by SIGNING IN, and by nothing else', () => {
  it('moves never-used to proven when a real acquisition succeeds', async () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);

    const held = heldIdentity();
    const connection = connectionOver(storage, held.identity);

    const before = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(before.state, 'never-used');

    const acquiring = connection.acquireForGesture(tap());
    held.succeed();
    const outcome = await acquiring;
    assert.equal(outcome.outcome, 'acquired');

    const after = standingFor(storage, CLIENT_ID_FIELD);
    assert.equal(after.state, 'proven', 'a successful sign-in did not prove the id it signed in with');
    assert.notEqual(after.sentence, before.sentence, 'the statement did not move');
    assert.equal(provenValue(storage, CLIENT_ID_PROVEN_KEY), FIRST_CLIENT_ID);
  });

  it('stamps THE ID THE REQUEST USED even when he edits the box while the sign-in is in flight', async () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);

    const held = heldIdentity();
    const connection = connectionOver(storage, held.identity);

    const acquiring = connection.acquireForGesture(tap());
    assert.equal(held.builtFor(), FIRST_CLIENT_ID, 'the request was not formed with the saved id');

    // He is looking at a consent screen. On the setup page, he pastes a second project's id.
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, SECOND_CLIENT_ID);

    held.succeed();
    await acquiring;

    assert.equal(
      provenValue(storage, CLIENT_ID_PROVEN_KEY),
      FIRST_CLIENT_ID,
      'the id that was NOT signed in with was stamped as proven, which is the drift this design '
      + 'exists to prevent arriving at the one seam it does not cover by itself',
    );
    assert.equal(
      standingFor(storage, CLIENT_ID_FIELD).state,
      'never-used',
      'the newly pasted id was credited with the previous one\'s sign-in',
    );
  });

  it('LEAVES A PROOF STANDING when an attempt is declined — a failure is not a disproof', async () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID);
    const proven = standingFor(storage, CLIENT_ID_FIELD);

    const held = heldIdentity();
    const connection = connectionOver(storage, held.identity);

    const acquiring = connection.acquireForGesture(tap());
    // He closes the Google window, or the network is flat. Both are ordinary on a phone, and the
    // token lasts about an hour, so this happens often.
    held.decline();
    const outcome = await acquiring;
    assert.equal(outcome.outcome, 'refused');

    assert.deepEqual(
      standingFor(storage, CLIENT_ID_FIELD),
      proven,
      'a transient failure told him his working setup had stopped working',
    );
  });

  it('proves NOTHING when the acquisition never got as far as asking', async () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);

    const held = heldIdentity();
    const connection = connectionOver(storage, held.identity);

    // No gesture: refused before anything is formed, which is the rule the whole credential is built
    // around and must not be the path a proof sneaks in on.
    const outcome = await connection.acquireForGesture(null);
    assert.equal(outcome.outcome, 'refused');
    assert.equal(provenValue(storage, CLIENT_ID_PROVEN_KEY), null);
    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'never-used');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The calendar's proof, out of a real mint
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the coaching calendar becomes proven by CARRYING A MEETING LINK, and by nothing else', () => {
  /** The meeting links, wired the way `google-on-this-device.ts` wires them. */
  function linksOver(
    storage: SmallFactStorage,
    connection: GoogleConnection,
    transport: (url: string, request: unknown) => Promise<unknown>,
  ) {
    return new GoogleMeetLinks({
      token: () => connection.tokenForRequest(),
      coachingCalendarId: () => storage.getItem(COACHING_CALENDAR_KEY),
      transport: transport as never,
      noteCalendarProven: (used) => { recordProvenValue(storage, COACHING_CALENDAR_PROVEN_KEY, used); },
    });
  }

  /** A signed-in connection, so a mint has a live token. */
  async function signedIn(storage: SmallFactStorage) {
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    const { connection, held } = tokenFor(storage);
    const acquiring = connection.acquireForGesture(tap());
    held.succeed();
    await acquiring;
    return connection;
  }

  it('moves never-used to proven when a real mint lands on the calendar HE supplied', async () => {
    const storage = fakeStorage();
    const connection = await signedIn(storage);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);

    const before = standingFor(storage, CALENDAR_FIELD);
    assert.equal(before.state, 'never-used');

    const calendar = calendarThatMints();
    const links = linksOver(storage, connection, calendar.transport);
    const outcome = await links.mint({ sessionId: 's-1', startsAt: new Date('2026-07-31T09:00:00Z') });

    assert.equal(outcome.outcome, 'minted');
    assert.ok(
      calendar.inserted[0]?.includes(encodeURIComponent(COACHING_CALENDAR)),
      'the mint did not go to the calendar he supplied',
    );

    const after = standingFor(storage, CALENDAR_FIELD);
    assert.equal(after.state, 'proven', 'a meeting link that landed did not prove the calendar');
    assert.notEqual(after.sentence, before.sentence, 'the statement did not move');
  });

  it('proves NOTHING when the link landed on his main calendar, because that is not the setting', async () => {
    const storage = fakeStorage();
    const connection = await signedIn(storage);
    // No coaching calendar. `MAIN_CALENDAR_ID` is the service's own alias and the declared fallback:
    // proving the alias works says nothing whatever about a setting that is empty.
    const links = linksOver(storage, connection, calendarThatMints().transport);
    const outcome = await links.mint({ sessionId: 's-2', startsAt: new Date('2026-07-31T09:00:00Z') });

    assert.equal(outcome.outcome, 'minted');
    assert.equal(provenValue(storage, COACHING_CALENDAR_PROVEN_KEY), null);
    assert.equal(standingFor(storage, CALENDAR_FIELD).state, 'nothing-entered');
  });

  it('stamps THE CALENDAR THE MINT USED even when he changes the setting mid-flight', async () => {
    const storage = fakeStorage();
    const connection = await signedIn(storage);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);

    const links = new GoogleMeetLinks({
      token: () => connection.tokenForRequest(),
      coachingCalendarId: () => storage.getItem(COACHING_CALENDAR_KEY),
      // The setting is changed INSIDE the call, which is the moment a mid-flight edit lands.
      transport: (async (url: string) => {
        writeSetting(storage, COACHING_CALENDAR_KEY, OTHER_CALENDAR);
        return calendarThatMints().transport(url);
      }) as never,
      noteCalendarProven: (used) => { recordProvenValue(storage, COACHING_CALENDAR_PROVEN_KEY, used); },
    });

    await links.mint({ sessionId: 's-3', startsAt: new Date('2026-07-31T09:00:00Z') });

    assert.equal(
      provenValue(storage, COACHING_CALENDAR_PROVEN_KEY),
      COACHING_CALENDAR,
      'the calendar the link did NOT land on was stamped as proven',
    );
    assert.equal(
      standingFor(storage, CALENDAR_FIELD).state,
      'never-used',
      'the newly saved calendar inherited a proof it did not earn',
    );
  });

  it('LEAVES A PROOF STANDING when a mint is refused — a failure is not a disproof', async () => {
    const storage = fakeStorage();
    const connection = await signedIn(storage);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);
    recordProvenValue(storage, COACHING_CALENDAR_PROVEN_KEY, COACHING_CALENDAR);
    const proven = standingFor(storage, CALENDAR_FIELD);

    const links = linksOver(storage, connection, calendarThatRefuses as never);
    const outcome = await links.mint({ sessionId: 's-4', startsAt: new Date('2026-07-31T09:00:00Z') });
    assert.notEqual(outcome.outcome, 'minted');

    assert.deepEqual(
      standingFor(storage, CALENDAR_FIELD),
      proven,
      'a calendar that refused once was reported as never having worked',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The erase, proven by consequence and not by membership
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('a proof is reachable by the erase', () => {
  it('is REMOVED by the real sweep, and the statement falls back honestly afterwards', () => {
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);
    recordProvenValue(storage, CLIENT_ID_PROVEN_KEY, FIRST_CLIENT_ID);
    recordProvenValue(storage, COACHING_CALENDAR_PROVEN_KEY, COACHING_CALENDAR);
    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'proven');

    // A NAME NOTHING SWEEPS, so a sweep that simply emptied the storage cannot pass this.
    storage.setItem('fit.not-in-the-sweep', 'still here');

    browserErasure(globalThis, storage).clearSmallFacts();

    assert.equal(provenValue(storage, CLIENT_ID_PROVEN_KEY), null, 'the client id proof survived an erase');
    assert.equal(provenValue(storage, COACHING_CALENDAR_PROVEN_KEY), null, 'the calendar proof survived an erase');
    assert.equal(storage.getItem('fit.not-in-the-sweep'), 'still here', 'the sweep removed everything, so it proves nothing');

    // AND THE CONSEQUENCE ON THE WORDS: nothing claims to be proven with nothing behind it.
    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'nothing-entered');
    assert.equal(standingFor(storage, CALENDAR_FIELD).state, 'nothing-entered');
  });

  it('is in the declared list, which is what the sweep above walks', () => {
    for (const key of [CLIENT_ID_PROVEN_KEY, COACHING_CALENDAR_PROVEN_KEY]) {
      assert.ok(SMALL_FACT_KEYS.includes(key), `${key} is not swept by an erase`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What the card offers, and what it deliberately does not
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the try-it on each card', () => {
  it('exists for the client id and NOT for the calendar, and the calendar says why', () => {
    const clientId = SETUP_SECTIONS.find((section) => section.field.key === GOOGLE_CLIENT_ID_KEY);
    const calendar = SETUP_SECTIONS.find((section) => section.field.key === COACHING_CALENDAR_KEY);

    assert.equal(clientId?.canTryHere, true, 'signing in costs nothing and leaves nothing behind');
    assert.equal(clientId?.insteadOfTryIt, null);

    assert.equal(calendar?.canTryHere, false, 'a test mint would leave a real event on his calendar');
    assert.ok(
      (calendar?.insteadOfTryIt ?? '').length > 20,
      'the calendar card offers no try-it and gives no reason, which reads as broken rather than as a '
      + 'decision',
    );
  });

  it('never proves anything from a tick, which is his claim and not evidence', async () => {
    const { ALL_SETUP_STEPS, rememberTicks } = await import('./setup-surface.ts');
    const storage = fakeStorage();
    writeSetting(storage, GOOGLE_CLIENT_ID_KEY, FIRST_CLIENT_ID);
    writeSetting(storage, COACHING_CALENDAR_KEY, COACHING_CALENDAR);

    // Every step ticked. He says he did all of it.
    rememberTicks(storage, new Set(ALL_SETUP_STEPS.map((step) => step.id)));

    assert.equal(standingFor(storage, CLIENT_ID_FIELD).state, 'never-used', 'a tick was allowed to prove an id');
    assert.equal(standingFor(storage, CALENDAR_FIELD).state, 'never-used', 'a tick was allowed to prove a calendar');
  });
});

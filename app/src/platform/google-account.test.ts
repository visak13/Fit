/**
 * THE TWO ACTS, AND THE GATE BETWEEN THEM.
 *
 * The store here is a REAL `LocalStore` on the in-memory platform double, and the figures the erase
 * gate reads come from a REAL `accountabilityStatus()` call over a REAL outbox that a REAL delivery
 * pass has refused things on. That is deliberate and it is the point of the file: this action's
 * whole job is a seam between the shell and the core, and a defect that sits BETWEEN two correct
 * components is invisible to any test that fixtures the other side into agreeing with it. This build
 * has already shipped one of those — a sync engine returning a completion and a surface reading a
 * persisted one, both individually correct, with nothing between them.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage } from '../../core/journal/journal.js';
import { flushOutbox } from '../../core/outbox/outbox.js';
import { accountabilityStatus } from '../../core/status/status.js';
import { PERSISTENT_WARNING_MS } from '../../core/status/status.js';
import { aDevice, queueOne, serviceRefuses } from '../../core/status/testing.js';

import {
  EraseAcknowledgement,
  SMALL_FACT_KEYS,
  WHAT_ERASING_DESTROYS,
  WHAT_SIGNING_OUT_KEEPS,
  connectGoogleAccount,
  eraseReadiness,
  signOutAndEraseThisDevice,
  signOutOfGoogle,
} from './google-account.ts';
import type { LocalStore } from '../../core/store/store.js';

import type { DeliveryReading, DeliveryReadingOutcome, DeviceErasure } from './google-account.ts';
import { GOOGLE_CONNECTION_KEY, GOOGLE_SCOPES, GoogleConnection, UserGesture } from './google-identity.ts';
import type { GoogleIdentityLike, SmallFactStorage, TokenResponseLike } from './google-identity.ts';

const A_REAL_TAP = { isTrusted: true, type: 'click' };
const tap = () => UserGesture.fromTrustedEvent(A_REAL_TAP);

/** Small facts, in memory. */
class Facts implements SmallFactStorage {
  held = new Map<string, string>();
  getItem(key: string): string | null { return this.held.get(key) ?? null; }
  setItem(key: string, value: string): void { this.held.set(key, value); }
  removeItem(key: string): void { this.held.delete(key); }
}

/** The identity library, always saying yes. */
function anIdentity(): GoogleIdentityLike & { revoked: string[] } {
  const record = {
    revoked: [] as string[],
    initTokenClient(config: { callback: (response: TokenResponseLike) => void }) {
      return {
        requestAccessToken(): void {
          config.callback({
            access_token: 'ya29.a0-not-a-real-token',
            expires_in: 3599,
            scope: GOOGLE_SCOPES.join(' '),
          });
        },
      };
    },
    revoke(token: string, done?: () => void): void {
      record.revoked.push(token);
      done?.();
    },
  };
  return record;
}

function aConnection(identity: (GoogleIdentityLike & { revoked: string[] }) | null, facts: Facts) {
  return new GoogleConnection({
    identity: () => identity,
    clientId: () => 'a-client-id.apps.googleusercontent.com',
    storage: facts,
  });
}

/** One entry as this test reads it. The log's own field set is closed; these are the ones asserted. */
interface JournalEntry {
  readonly kind: string;
  readonly device: string;
  readonly at: string;
  readonly subject: unknown;
}

/**
 * What is genuinely on this device's disk, read back out of the database.
 *
 * `JOURNAL_STORES` is COPIED rather than cast: the core freezes its declared store lists on purpose,
 * and casting the readonly off here would quietly license a caller to mutate a value it froze for a
 * reason. The copy is what the platform's own transaction wants and costs nothing.
 */
async function entriesOn(store: LocalStore): Promise<JournalEntry[]> {
  const page = await store.read(
    [...JOURNAL_STORES],
    (scope) => readChainPage(scope, store.device, { limit: 200 }),
  );
  return page.items as JournalEntry[];
}

const kindsOn = async (store: LocalStore): Promise<string[]> =>
  (await entriesOn(store)).map((entry) => entry.kind);

/** Everything the gate reads, in one place, so a test can say what state it is describing. */
function reading(overrides: Partial<DeliveryReading> = {}): DeliveryReadingOutcome {
  return {
    // A READING THAT WAS ACTUALLY TAKEN, said out loud. The gate now refuses anything else, and the
    // point of this default is that every test below is describing a device whose queue was counted
    // — which is what makes `sync-failed-read.test.ts`'s refusals about something.
    status: 'read',
    pending: 0,
    waiting_for_credential: 0,
    rejected: 0,
    ambiguous: 0,
    oldest_undelivered_label: null,
    oldest_undelivered_age_ms: null,
    // The leading reason the indicator is showing. Null by default and overridden per state: a
    // refusal may name a control only where this says the interface offers one, so a fixture that
    // left it out would be describing a screen it has not looked at.
    reason: null,
    ...overrides,
  };
}

/** An erasure that records what it was asked to do rather than doing it. */
function watchedErasure(): DeviceErasure & { deleted: number; cleared: number } {
  const record = {
    deleted: 0,
    cleared: 0,
    async deleteLocalDatabase(): Promise<void> { record.deleted += 1; },
    clearSmallFacts(): void { record.cleared += 1; },
  };
  return record;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('connecting an account', () => {
  it('writes ONE entry, and the entry says an account was connected on this device', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const connection = aConnection(anIdentity(), facts);

    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });

    const entries = await entriesOn(dev.store);
    assert.deepEqual(entries.map((e) => e.kind), [JOURNAL_KINDS.ACCOUNT_CONNECTED]);

    const [entry] = entries as [JournalEntry];
    assert.equal(entry.device, dev.store.device, 'the entry must say WHICH device was authorised');
    assert.equal(entry.subject, null,
      'authentication is about a device and a person, not about a client — an entry that named one '
      + 'would be asserting something untrue');
    assert.ok(typeof entry.at === 'string' && entry.at.length > 0);

    await dev.store.close();
  });

  it('does NOT write one for the hourly renewal, which is not a new authorisation', async () => {
    const dev = await aDevice();
    const connection = aConnection(anIdentity(), new Facts());

    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });

    assert.deepEqual(await kindsOn(dev.store), [JOURNAL_KINDS.ACCOUNT_CONNECTED],
      'one entry per authorisation. Three a day would destroy the one question this kind can '
      + 'uniquely answer, which is when this app was actually given access.');

    await dev.store.close();
  });

  it('writes NOTHING when the coach closes the Google window', async () => {
    const dev = await aDevice();
    const identity: GoogleIdentityLike & { revoked: string[] } = {
      revoked: [],
      initTokenClient(config: { error_callback?: (e: { type?: unknown }) => void }) {
        return { requestAccessToken: () => config.error_callback?.({ type: 'popup_closed' }) };
      },
      revoke: () => {},
    };
    const connection = aConnection(identity, new Facts());

    const outcome = await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });

    assert.equal(outcome.outcome, 'refused');
    assert.deepEqual(await kindsOn(dev.store), [],
      'a log that records an authorisation that did not happen is worse than one with a gap');

    await dev.store.close();
  });

  it('UNDOES the connection when the entry cannot be written, so the log stays true', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const connection = aConnection(anIdentity(), facts);

    // The store is closed underneath it: an append against a closed database throws, which is the
    // most faithful reproduction of "the log could not be written" available without editing core.
    await dev.store.close();

    await assert.rejects(
      () => connectGoogleAccount({ connection, gesture: tap(), store: dev.store }),
      'the failure must reach the caller rather than being swallowed — never blocking the app means '
      + 'never blocking the COACH, not never surfacing a write that did not land',
    );
    assert.equal(facts.held.has(GOOGLE_CONNECTION_KEY), false,
      'and the connection is rolled back, so the log\'s silence still means it did not happen');
    assert.deepEqual(connection.credential(), { present: false, expired: false });
  });
});

describe('signing out', () => {
  it('records the disconnection and KEEPS the local data', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const identity = anIdentity();
    const connection = aConnection(identity, facts);
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });
    await queueOne(dev, { label: 'a backup that has not gone yet' });

    const outcome = await signOutOfGoogle({ connection, store: dev.store });

    assert.equal(outcome.outcome, 'signed-out');
    assert.equal(outcome.outcome === 'signed-out' && outcome.revokedAtGoogle, true);
    assert.deepEqual(identity.revoked, ['ya29.a0-not-a-real-token']);
    assert.deepEqual(await kindsOn(dev.store), [
      JOURNAL_KINDS.ACCOUNT_CONNECTED, JOURNAL_KINDS.ACCOUNT_DISCONNECTED,
    ]);

    // The whole of d110 in one assertion: the connection is gone and the work is not.
    assert.deepEqual(connection.credential(), { present: false, expired: false });
    const after = await accountabilityStatus(dev.store, { now: dev.now() });
    assert.equal(after.undelivered, 1,
      'the local store is the PRIMARY copy. A sign-out that lost unsent work would destroy it '
      + 'behind a button that sounds routine.');

    await dev.store.close();
  });

  it('signs out on a device with no network, and does not claim it revoked anything', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const connection = aConnection(anIdentity(), facts);
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });

    // The library has gone away, which is what an offline device looks like from here.
    const offline = new GoogleConnection({
      identity: () => null,
      clientId: () => 'a-client-id.apps.googleusercontent.com',
      storage: facts,
    });
    const outcome = await signOutOfGoogle({ connection: offline, store: dev.store });

    assert.equal(outcome.outcome === 'signed-out' && outcome.revokedAtGoogle, false);
    assert.equal(offline.rememberedConnection(), null, 'and it is still signed out HERE');

    await dev.store.close();
  });

  it('writes nothing at all when there was nothing to sign out of', async () => {
    const dev = await aDevice();
    const connection = aConnection(anIdentity(), new Facts());

    const outcome = await signOutOfGoogle({ connection, store: dev.store });

    assert.equal(outcome.outcome, 'not-connected');
    assert.deepEqual(await kindsOn(dev.store), []);

    await dev.store.close();
  });
});

describe('the erase gate', () => {
  it('is CLEAR when everything is away, and names what will be destroyed', () => {
    const readiness = eraseReadiness(reading());

    assert.equal(readiness.verdict, 'clear');
    assert.equal(readiness.mayProceedWithAcknowledgement, false);
    assert.equal(readiness.whatHappened, WHAT_ERASING_DESTROYS);
    assert.ok(WHAT_ERASING_DESTROYS.includes('key this device uses to open medical notes'),
      'the device key slot is destroyed with the database and he must be told so before he taps');
  });

  it('says WAIT, with no override, while work can still land', () => {
    const readiness = eraseReadiness(reading({
      pending: 3, oldest_undelivered_label: 'backup of the exercise library',
      oldest_undelivered_age_ms: 60_000,
    }));

    assert.equal(readiness.verdict, 'wait');
    assert.equal(readiness.mayProceedWithAcknowledgement, false);
    assert.equal(EraseAcknowledgement.forReadiness(readiness), null,
      'work that is about to be safe must not be throwable away by one careless tap');
    assert.ok(readiness.whatHappened.includes('backup of the exercise library'),
      'and it names WHAT is at risk rather than only how much');
  });

  it('says DECIDE for a permanently refused change, and offers the exit in the same breath', () => {
    const readiness = eraseReadiness(reading({
      rejected: 1, oldest_undelivered_label: 'a refused backup', oldest_undelivered_age_ms: 60_000,
    }));

    assert.equal(readiness.verdict, 'decide');
    assert.equal(readiness.mayProceedWithAcknowledgement, true);
    assert.ok(EraseAcknowledgement.forReadiness(readiness) instanceof EraseAcknowledgement);
    assert.ok(readiness.whatHappened.includes('will not back up on'),
      'the words must say that waiting will not fix this one');
    assert.ok(readiness.whatHappened.includes('lost and cannot be recovered'));
  });

  it('OPENS THE EXIT for waiting work that has been stuck for days — the trap one level down', () => {
    const stuckForDays = reading({
      pending: 2, waiting_for_credential: 2,
      oldest_undelivered_label: 'backup of the exercise library',
      oldest_undelivered_age_ms: PERSISTENT_WARNING_MS,
    });

    const readiness = eraseReadiness(stuckForDays);

    assert.equal(readiness.verdict, 'decide',
      'if the coach permanently loses that Google account the credential never returns, the queue '
      + 'never drains, and an absolute WAIT would be exactly the dead end the refused case had. '
      + 'Either the work lands or the clock carries him to a decision he is allowed to make.');
    assert.equal(readiness.mayProceedWithAcknowledgement, true);
    assert.ok(readiness.whatHappened.includes('waiting for days'),
      'and it says WHY the wait is over rather than changing its mind without explanation');
  });

  it('holds WAIT right up to the threshold and not a moment before it', () => {
    const justUnder = reading({ pending: 1, oldest_undelivered_age_ms: PERSISTENT_WARNING_MS - 1 });
    const justOver = reading({ pending: 1, oldest_undelivered_age_ms: PERSISTENT_WARNING_MS });

    assert.equal(eraseReadiness(justUnder).verdict, 'wait');
    assert.equal(eraseReadiness(justOver).verdict, 'decide');
  });

  it('lets waiting work outrank a refusal, because the waiting work can still be saved', () => {
    const both = eraseReadiness(reading({ pending: 2, rejected: 1, oldest_undelivered_age_ms: 60_000 }));

    assert.equal(both.verdict, 'wait',
      'telling him to decide about a refusal while two changes are still landing would have him '
      + 'throw away the two that were about to be safe');
  });

  it('reads a REAL accountabilityStatus, not a fixture that agrees with itself', async () => {
    const dev = await aDevice();

    const clear = await accountabilityStatus(dev.store, { now: dev.now() });
    assert.equal(eraseReadiness({ status: 'read', ...clear }).verdict, 'clear');

    await queueOne(dev, { label: 'a backup that is still trying' });
    const waiting = await accountabilityStatus(dev.store, { now: dev.now() });
    assert.equal(waiting.pending, 1, 'fixture check: the queue really does hold something');
    assert.equal(eraseReadiness({ status: 'read', ...waiting }).verdict, 'wait');

    await queueOne(dev, { baseName: 'refused.json', label: 'a refused backup' });
    serviceRefuses(dev, 10);
    await flushOutbox(dev.store, dev.remote, { now: dev.now() });
    const afterRefusal = await accountabilityStatus(dev.store, { now: dev.now() });
    assert.ok(afterRefusal.rejected + afterRefusal.ambiguous > 0,
      'fixture check: a real delivery pass really did stop something permanently');

    // And the shape the gate declares really is a subset of what the surface returns: this line is
    // the assertion, and it is checked by the type checker rather than at runtime.
    const asReading: DeliveryReading = afterRefusal;
    assert.ok(eraseReadiness({ status: 'read', ...asReading }).verdict !== 'clear');

    await dev.store.close();
  });
});

describe('erasing the device', () => {
  it('REFUSES while work can still land, and touches nothing', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const connection = aConnection(anIdentity(), facts);
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });
    const erasure = watchedErasure();

    const outcome = await signOutAndEraseThisDevice({
      connection,
      store: dev.store,
      reading: reading({ pending: 1, oldest_undelivered_age_ms: 60_000 }),
      erasure,
    });

    assert.equal(outcome.outcome, 'refused');
    assert.equal(outcome.outcome === 'refused' && outcome.readiness.verdict, 'wait');
    assert.equal(erasure.deleted, 0);
    assert.deepEqual(await kindsOn(dev.store), [JOURNAL_KINDS.ACCOUNT_CONNECTED],
      'a refusal is not a sign-out: nothing may have happened');

    await dev.store.close();
  });

  it('REFUSES a stopped change until it is acknowledged, then goes ahead', async () => {
    const stopped = reading({ rejected: 1, oldest_undelivered_age_ms: 60_000 });

    const first = await aDevice();
    const unacknowledged = await signOutAndEraseThisDevice({
      connection: aConnection(anIdentity(), new Facts()),
      store: first.store,
      reading: stopped,
      erasure: watchedErasure(),
    });
    assert.equal(unacknowledged.outcome, 'refused');
    assert.equal(unacknowledged.outcome === 'refused' && unacknowledged.readiness.verdict, 'decide');
    await first.store.close();

    const second = await aDevice();
    const erasure = watchedErasure();
    const acknowledged = await signOutAndEraseThisDevice({
      connection: aConnection(anIdentity(), new Facts()),
      store: second.store,
      reading: stopped,
      erasure,
      acknowledgement: EraseAcknowledgement.forReadiness(eraseReadiness(stopped)),
    });

    assert.equal(acknowledged.outcome, 'erased');
    assert.equal(erasure.deleted, 1);
    assert.equal(erasure.cleared, 1);
  });

  /**
   * A STALE ACKNOWLEDGEMENT IS REFUSED — the queue moved between his reading and his tap.
   *
   * `EraseReadiness` is a photograph, and the acknowledgement is minted from it. He can be shown
   * "1 change will be lost", walk away while four more refusals land, and come back to press a
   * button he genuinely did agree to — for a loss a fifth the size of the one he would now take.
   * The figure is therefore re-checked against the queue AS IT IS, and the refusal carries the
   * CURRENT readiness so the number he decides from a second time is the true one.
   *
   * The reverse is deliberately NOT refused: agreeing to lose five and then losing two is a
   * decision he has already made with room to spare, and refusing it would be a dead end with no
   * exit built in the name of protecting him — the exact shape this whole gate was corrected for.
   */
  it('REFUSES an acknowledgement taken from a calmer reading of the queue', async () => {
    const whatHeRead = reading({ rejected: 1, oldest_undelivered_age_ms: 60_000 });
    const whatIsTrueNow = reading({ rejected: 5, oldest_undelivered_age_ms: 60_000 });

    const acknowledgement = EraseAcknowledgement.forReadiness(eraseReadiness(whatHeRead));
    assert.ok(acknowledgement !== null, 'he was genuinely able to acknowledge the smaller loss');
    assert.equal(acknowledgement.stopped, 1, 'and it recorded the figure he was actually shown');

    const dev = await aDevice();
    const erasure = watchedErasure();
    const stale = await signOutAndEraseThisDevice({
      connection: aConnection(anIdentity(), new Facts()),
      store: dev.store,
      reading: whatIsTrueNow,
      erasure,
      acknowledgement,
    });

    assert.equal(stale.outcome, 'refused',
      'he agreed to lose one change and this would have destroyed five. An acknowledgement that '
      + 'does not name what is actually being lost is not an acknowledgement of anything.');
    assert.equal(stale.outcome === 'refused' && stale.readiness.stopped, 5,
      'and the refusal carries the CURRENT figure, so the reading he decides from is the true one');
    assert.equal(erasure.deleted, 0, 'nothing was deleted');
    assert.equal(erasure.cleared, 0, 'and no small fact was cleared either');
    await dev.store.close();

    // NON-VACUITY, in the same run: the very same call with an acknowledgement taken from the
    // CURRENT reading goes ahead. Without this, the refusal above would pass identically if the
    // gate had simply started refusing every acknowledgement, which is a worse defect than the one
    // being fixed — a dead end with no way out.
    const current = await aDevice();
    const allowed = watchedErasure();
    const fresh = await signOutAndEraseThisDevice({
      connection: aConnection(anIdentity(), new Facts()),
      store: current.store,
      reading: whatIsTrueNow,
      erasure: allowed,
      acknowledgement: EraseAcknowledgement.forReadiness(eraseReadiness(whatIsTrueNow)),
    });
    assert.equal(fresh.outcome, 'erased', 'an acknowledgement of the real figure still works');
    assert.equal(allowed.deleted, 1);
    await current.store.close();

    // And agreeing to MORE than is now at risk is not a trap either.
    const shrunk = await aDevice();
    const shrunkErasure = watchedErasure();
    const overAgreed = await signOutAndEraseThisDevice({
      connection: aConnection(anIdentity(), new Facts()),
      store: shrunk.store,
      reading: whatHeRead,
      erasure: shrunkErasure,
      acknowledgement: EraseAcknowledgement.forReadiness(eraseReadiness(whatIsTrueNow)),
    });
    assert.equal(overAgreed.outcome, 'erased',
      'he accepted losing five; two is a loss he has already agreed to with room to spare');
    await shrunk.store.close();
  });

  it('signs out first, so the disconnection is real even if the deletion fails', async () => {
    const dev = await aDevice();
    const facts = new Facts();
    const identity = anIdentity();
    const connection = aConnection(identity, facts);
    await connectGoogleAccount({ connection, gesture: tap(), store: dev.store });

    const blocked: DeviceErasure = {
      deleteLocalDatabase: () => Promise.reject(new Error('Another window or tab still has this app open')),
      clearSmallFacts: () => {},
    };

    await assert.rejects(() => signOutAndEraseThisDevice({
      connection, store: dev.store, reading: reading(), erasure: blocked,
    }));

    assert.deepEqual(identity.revoked, ['ya29.a0-not-a-real-token'],
      'he asked to be signed out and erased; the half that could happen did');
    assert.equal(connection.rememberedConnection(), null);
  });

  it('sweeps every small fact this application keeps outside the database', () => {
    assert.deepEqual([...SMALL_FACT_KEYS].sort(), [
      'fit.clients.clinical-hint-acknowledged',
      'fit.device-tag',
      // The two settings he supplied about Google. Neither is a credential — a client id is public
      // by design and a calendar id is an address — but both say WHO used this device and with what
      // account, which is what erasing is for when the computer belongs to somebody else.
      'fit.google-client-id',
      // And which VALUE of each has been proven to work, from `platform/setting-proof.ts` — the
      // evidence behind the setup screen's statement about whether an id has ever been used. Each
      // holds a copy of the id itself, so the argument above applies word for word; and a proof left
      // behind says not only that this account was set up here but that it got as far as working.
      'fit.google-client-id.proven',
      'fit.google-coaching-calendar',
      'fit.google-coaching-calendar.proven',
      'fit.google-connection',
      // Who trained last and what routine, from `screens/launcher.ts` — swept because it says who
      // this device coached, which is a trace on somebody else's computer like everything above.
      'fit.last-session-choice',
      // How far he got through the one-time setup, from `screens/setup-surface.ts`. Not a Google
      // setting and not a record — his own note of where he stopped — and swept for the reason the
      // preference and the acknowledgement above are: it says the app was used on this machine.
      'fit.setup.steps-ticked',
      'fit.storage-persistence',
      'fit.theme',
    ], 'a promise that erasing removes everything is only as true as the least-swept copy, and the '
      + 'copies that get missed are the operational ones — a preference, an acknowledgement — '
      + 'rather than the ones in the data model. `erasure-completeness.test.ts` holds this list '
      + 'against what the source actually writes, so a key added later cannot quietly survive.');
  });
});

describe('the words the coach reads', () => {
  it('say plainly that signing out keeps everything', () => {
    assert.ok(WHAT_SIGNING_OUT_KEEPS.includes('stays exactly where it is'));
    assert.ok(WHAT_SIGNING_OUT_KEEPS.includes('sign back in'));
  });

  it('say what erasing destroys and what it does NOT touch', () => {
    assert.ok(WHAT_ERASING_DESTROYS.includes('deletes everything this app has saved here'));
    assert.ok(WHAT_ERASING_DESTROYS.includes('does not touch your Google Drive backup'));
    assert.ok(WHAT_ERASING_DESTROYS.includes('Signing in again on this device brings your practice back'),
      'limitation and exit in the same breath, in that order');
  });

  it('claim nothing about compliance, and carry no emoji', () => {
    const everyVerdict = [
      reading(),
      reading({ pending: 1, oldest_undelivered_age_ms: 1 }),
      reading({ rejected: 1, oldest_undelivered_age_ms: 1 }),
      reading({ pending: 1, rejected: 1, oldest_undelivered_age_ms: PERSISTENT_WARNING_MS }),
    ].map((figures) => eraseReadiness(figures));

    assert.deepEqual(everyVerdict.map((r) => r.verdict), ['clear', 'wait', 'decide', 'decide'],
      'fixture check: these really are all four sentences and not the same one four times');

    const everything = [
      WHAT_SIGNING_OUT_KEEPS,
      WHAT_ERASING_DESTROYS,
      ...everyVerdict.map((r) => `${r.headline} ${r.whatHappened} ${r.whatToDo}`),
    ].join(' ');

    for (const claim of ['HIPAA', 'GDPR', 'DPDP', 'compliant', 'compliance', 'secure', 'encrypted']) {
      assert.equal(everything.includes(claim), false, `no sentence may claim ${claim}`);
    }
    for (const character of [...everything]) {
      assert.ok(character.codePointAt(0)! < 0x2190,
        `an emoji or symbol reached a user-facing sentence: ${character}`);
    }
    assert.ok(everything.length > 1000, 'and it really did read the sentences rather than an empty string');
  });
});

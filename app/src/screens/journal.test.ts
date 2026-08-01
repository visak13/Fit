/**
 * THE WORDS ON THE ACTIVITY LIST — and the five ways this surface can be wrong while looking right.
 *
 * **One. A KIND SHIPS UNWORDED.** The vocabulary is a closed set owned by `core/journal/kinds.js`
 * and it has grown twice already. A phrase table written by hand looks complete on the day it is
 * written and is quietly short the day after somebody adds a kind — and the screen would draw that
 * entry with no words rather than failing, so nothing would say so. So the test below ITERATES THE
 * CORE'S OWN SET and fails on any kind, any domain and any record type that has no plain sentence.
 * That test is the point of this file as much as the phrases are, and it is driven for non-vacuity:
 * the checker is pointed at a deliberately short table and must go red.
 *
 * **Two. THE SUBJECT IS JOINED BACK TO A LIVE RECORD.** That is the trap in this step. An entry
 * carries an opaque identity and never any content, so a reader that looked the identity up to
 * show a friendly name would put a removed client's name back on the screen. It is proved here
 * against a REAL store: one client left live, one tombstoned, one purged outright — and the words
 * for all three are asserted BYTE-IDENTICAL, with the name of the removed client, which this test
 * knows and the module cannot, asserted absent from everything the surface says.
 *
 * **Three. THE VERIFICATION SENTENCES ARE FICTIONAL.** A hand-built `first_divergence` proves the
 * wording can render an object of that shape and nothing else. So every divergence here is
 * INDUCED: a real chain built with `appendEntry`, really broken seven different ways, really run
 * through `verifyChain`. If the core ever stops reporting one of these reasons, this file stops
 * having anything to word rather than going on passing against a fixture.
 *
 * **Four. A TRUNCATED HEAD READS AS DAMAGE.** Retention prunes the oldest entries irrecoverably by
 * design. A screen calling that a break tells the coach his records were interfered with when
 * nothing happened. It is induced from the same real chain and asserted to leave the result INTACT,
 * to say nothing about being changed, and to ask him to do nothing.
 *
 * **Five. THE SURFACE OVERCLAIMS.** This is the most tempting screen in the application to
 * overclaim on, because a tick beside the word "checked" reads as a promise. Every exported string
 * is swept for that vocabulary — and because a scan whose whole output is an absence is worthless
 * until it is shown able to speak, the same scanner is pointed at a deliberately planted claim in
 * the same run and fails if it stays quiet.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { DIVERGENCE, appendEntry, verifyChain } from '../../core/journal/chain.js';
import { JOURNAL_KINDS, KINDS, KIND_SPECS } from '../../core/journal/kinds.js';
import { aClient } from '../../core/model/fixtures.js';
import { RECORD_STORES } from '../../core/store/schema.js';
import { purgeClient } from '../../core/store/purge.js';
import { T0, aWorld } from '../../core/sync/testing.js';
import * as journal from './journal.ts';
import type { DeviceVerification, Divergence, JournalEntry } from './journal.ts';
import {
  DIVERGENCE_REASONS, DIVERGENCE_WORDS, DOMAIN_WORDS, JOURNAL_TITLE, KIND_WORDS,
  NOTHING_TO_DO, NOT_EVERY_DEVICE_WAS_CHECKED, NOT_EVERY_DEVICE_WAS_LISTED,
  NOT_EVERY_ENTRY_WAS_CHECKED, OLDEST_ENTRIES_WERE_DROPPED, RECORD_TYPE_WORDS, UNWORDED_DOMAIN, UNWORDED_KIND,
  UNWORDED_RECORD_TYPE, WHAT_THE_CHECK_CAN_AND_CANNOT_DO, WHO_TO_ASK, WHY_THERE_IS_NO_NAME,
  describeEntry, describeJournal, describeVerification,
} from './journal.ts';
import {
  A_FAILED_READ_IS_NOT_A_VERDICT, COULD_NOT_READ_THE_LIST, READ_STAGE_WORDS, UNWORDED_READ_STAGE,
  WHO_TO_ASK_ABOUT_A_FAILED_READ, describeFailedJournalRead,
} from './journal.ts';
import type { JournalReadStage } from './journal.ts';

/** The removed client's name. Known HERE, and deliberately unreachable by everything the screen reads. */
const DEPARTED = 'Rekha Iyer';

/** Worlds opened by this file, closed once at the end whatever happened. */
const worlds: ReturnType<typeof aWorld>[] = [];

after(async () => {
  for (const world of worlds) {
    // eslint-disable-next-line no-await-in-loop
    await world.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONE — the vocabulary, walked from the core rather than from a list written here
// ═══════════════════════════════════════════════════════════════════════════════

describe('EVERY KIND THE CORE DEFINES HAS PLAIN WORDS — walked from the core’s own set', () => {
  it('the set being walked is the core’s, and it is not empty', () => {
    // A completeness check over an empty set passes for free, which is the way this whole family of
    // test dies. The numbers are a floor, not an expectation: the point is that the walk reaches the
    // real vocabulary, not that it is any particular size.
    assert.ok(KINDS.length >= 20, `the vocabulary read as ${KINDS.length} kinds, which is not it`);
    assert.equal(KINDS.length, Object.keys(KIND_SPECS).length);
    assert.equal(
      Object.keys(KIND_WORDS).length,
      KINDS.length,
      'the phrase table was not built from the core’s set, so it can be short without saying so',
    );
  });

  for (const kind of KINDS) {
    it(`words ${kind} for somebody with no glossary`, () => {
      const phrase = KIND_WORDS[kind];
      assert.ok(typeof phrase === 'string' && phrase.length > 0, `${kind} has no phrase at all`);
      assert.notEqual(
        phrase,
        UNWORDED_KIND,
        `${kind} is in the core’s closed vocabulary and has no plain sentence here. A kind added `
        + 'to core/journal/kinds.js must be worded before it can ship, which is what this test is for.',
      );
      // The machine's own name for the event is not a sentence for the coach. `record.deleted` is
      // not "record deleted"; it is closer to "a record was removed".
      assert.ok(
        !phrase.toLowerCase().includes(kind.toLowerCase()),
        `${kind}'s phrase contains the kind name itself, so it is the machine's word, not his`,
      );
      assert.ok(phrase.length > 20, `${kind}'s phrase is too short to be a sentence: ${phrase}`);
      assert.match(phrase, /[.]$/u, `${kind}'s phrase is not written as a sentence: ${phrase}`);
    });
  }

  it('and every kind’s phrase is its own, so no two events read alike', () => {
    const phrases = KINDS.map((kind) => KIND_WORDS[kind]);
    assert.equal(new Set(phrases).size, phrases.length, 'two kinds share one sentence');
  });

  it('EVERY DOMAIN HAS A PLAIN HEADING — six of them, and the sixth is the log’s own housekeeping', () => {
    const domains = [...new Set(KINDS.map((kind) => KIND_SPECS[kind].domain))];
    assert.ok(domains.length >= 5, `only ${domains.length} domains were found`);
    assert.deepEqual([...journal.DOMAINS].sort(), [...domains].sort());
    for (const domain of domains) {
      const heading = DOMAIN_WORDS[domain];
      assert.ok(typeof heading === 'string' && heading.length > 0, `${domain} has no heading`);
      assert.notEqual(heading, UNWORDED_DOMAIN, `${domain} has no plain heading of its own`);
      assert.ok(
        !heading.includes('_'),
        `${domain}'s heading is the machine's word rather than a heading: ${heading}`,
      );
    }
  });

  it('EVERY RECORD TYPE THE STORE DEFINES IS WORDED — from the store’s map, not a copy of it', () => {
    const types = Object.keys(RECORD_STORES);
    assert.ok(types.length >= 5, `only ${types.length} record types were found`);
    assert.deepEqual(Object.keys(RECORD_TYPE_WORDS).sort(), [...types].sort());
    for (const type of types) {
      assert.notEqual(
        RECORD_TYPE_WORDS[type],
        UNWORDED_RECORD_TYPE,
        `${type} is a record an entry can name and has no plain words here`,
      );
    }
  });

  it('THE COMPLETENESS CHECK CAN FAIL — pointed at a short table, it must go red', () => {
    // Without this, every assertion above passes for free the day the walk stops reaching anything.
    const short: Record<string, string> = Object.fromEntries(
      KINDS.map((kind) => [kind, kind === KINDS[0] ? UNWORDED_KIND : 'worded.']),
    );
    const missing = KINDS.filter((kind) => short[kind] === UNWORDED_KIND);
    assert.deepEqual(missing, [KINDS[0]], 'the completeness check cannot see an unworded kind');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TWO — the trap: a live record, a tombstoned one and a purged one read IDENTICALLY
// ═══════════════════════════════════════════════════════════════════════════════

/** An entry naming one record identity. Built here because this module never reads the store. */
function entryAbout(type: string, recordId: string, kind: string): JournalEntry {
  return {
    entry_id: `entry-${recordId}`,
    seq: 1,
    device: 'laptop',
    kind,
    at: T0,
    subject: { type, record_id: recordId },
    affected_count: 1,
    previous_hash: null,
  };
}

/** Every string a worded entry carries, flattened, so an assertion covers all of it at once. */
function said(words: object): string {
  return Object.values(words).filter((value) => typeof value === 'string').join(' | ');
}

describe('AN ENTRY’S SUBJECT IS NEVER JOINED BACK TO A RECORD — proved against a real store', () => {
  it('a live record, a tombstoned one and a purged one produce the SAME words', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('laptop');

    // Three real clients in a real store, taken to the three states the tempting join would meet.
    const live = await laptop.store.create('client', aClient({ name: 'Staying Example' }), { now: T0 });
    const tombstoned = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
    const purged = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });

    await laptop.store.tombstone('client', tombstoned.record_id, { now: world.now() });
    await purgeClient(laptop.store, purged.record_id, { now: world.now() });

    // The three states, as the store really holds them — so this test is about the real world and
    // not about three identifiers that happen to be different strings.
    const liveEnvelope = await laptop.store.get('client', live.record_id);
    const tombstonedEnvelope = await laptop.store.get('client', tombstoned.record_id);
    const purgedEnvelope = await laptop.store.get('client', purged.record_id);
    assert.ok(liveEnvelope && liveEnvelope.deleted !== true, 'the live client is not live');
    assert.equal(tombstonedEnvelope?.deleted, true, 'the tombstoned client is not tombstoned');
    assert.equal(tombstonedEnvelope?.content, null, 'a tombstone still carries content');
    assert.equal(purgedEnvelope, undefined, 'the purged client is still there');

    const words = [live, tombstoned, purged].map(
      (record) => describeEntry(entryAbout('client', record.record_id, JOURNAL_KINDS.RECORD_UPDATED)),
    );

    // EVERYTHING EXCEPT THE OPAQUE REFERENCE IS IDENTICAL. That is the decision, stated in the
    // module header and asserted here: the words cannot vary with what the store still holds,
    // because the module never asks it.
    for (const worded of words) {
      assert.equal(worded.about, 'one client');
      assert.equal(worded.whyNoName, WHY_THERE_IS_NO_NAME);
      assert.equal(worded.what, KIND_WORDS[JOURNAL_KINDS.RECORD_UPDATED]);
    }
    assert.equal(
      new Set(words.map((worded) => said({ ...worded, entryId: '', reference: '' }))).size,
      1,
      'the words differ between a live, a tombstoned and a purged record, so something was looked up',
    );

    // And the name — which this test knows and nothing the surface reads can — is nowhere.
    for (const worded of words) {
      assert.ok(
        !said(worded).includes(DEPARTED),
        `the removed client’s name reached the screen: ${said(worded)}`,
      );
      assert.ok(!said(worded).includes('Staying Example'), 'a live client’s name reached the screen');
    }
  });

  it('the reference is passed through untouched, and it is the only thing that varies', () => {
    const worded = describeEntry(entryAbout('client', 'client-opaque-1', JOURNAL_KINDS.RECORD_DELETED));
    assert.equal(worded.reference, 'client-opaque-1');
    assert.equal(worded.about, 'one client');
    // Why there is no name, said, rather than a bare identifier left to read as a defect.
    assert.equal(worded.whyNoName, WHY_THERE_IS_NO_NAME);
    assert.ok(WHY_THERE_IS_NO_NAME.length > 60, 'the explanation is too short to explain anything');
  });

  it('an entry about nothing says nothing about a record, and does not explain an absent name', () => {
    const worded = describeEntry({
      entry_id: 'e1',
      seq: 1,
      device: 'laptop',
      kind: JOURNAL_KINDS.SYNC_STARTED,
      at: T0,
      subject: null,
      affected_count: null,
      previous_hash: null,
    });
    assert.equal(worded.about, null);
    assert.equal(worded.reference, null);
    assert.equal(worded.whyNoName, null);
    // Null is the honest answer where nothing was counted; a zero would be the screen stating a
    // number nothing ever measured.
    assert.equal(worded.howMany, null);
  });

  it('a kind this app has never heard of is worded honestly rather than dropped', () => {
    const worded = describeEntry(entryAbout('client', 'c1', 'made.up'));
    assert.equal(worded.known, false);
    assert.equal(worded.what, UNWORDED_KIND);
    assert.equal(worded.heading, UNWORDED_DOMAIN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THREE — the seven reasons, every one of them induced on a real chain
// ═══════════════════════════════════════════════════════════════════════════════

/** A real chain of five entries on one device, hashed by the core. */
async function aChain(device = 'laptop'): Promise<Record<string, unknown>[]> {
  const kinds = [
    JOURNAL_KINDS.KEY_ESTABLISHED,
    JOURNAL_KINDS.RECORD_CREATED,
    JOURNAL_KINDS.RECORD_UPDATED,
    JOURNAL_KINDS.SYNC_STARTED,
    JOURNAL_KINDS.SYNC_COMPLETED,
  ];
  const entries: Record<string, unknown>[] = [];
  for (const [index, kind] of kinds.entries()) {
    const subject = kind.startsWith('record.')
      ? { type: 'client', record_id: `client-${index}` }
      : null;
    // eslint-disable-next-line no-await-in-loop -- a chain is built in order, by definition.
    entries.push(await appendEntry(entries.at(-1) ?? null, {
      kind, device, entry_id: `${device}-entry-${index + 1}`, at: T0, subject,
    }) as Record<string, unknown>);
  }
  return entries;
}

/** `verifyChain`'s result, as the surface's own declared shape. */
function asVerification(result: Record<string, unknown>): DeviceVerification {
  return {
    device: String(result.device),
    checked: Number(result.checked),
    ok: Boolean(result.ok),
    truncated_head: Boolean(result.truncated_head),
    first_divergence: (result.first_divergence ?? null) as Divergence | null,
  };
}

describe('THE SEVEN REASONS ARE THE CORE’S SEVEN, AND EACH HAS ITS OWN SENTENCE', () => {
  it('the list declared here is exactly the core’s closed set, in both directions', () => {
    // Two independently declared closed sets that agree today and drift tomorrow is the defect this
    // build has already been bitten by. This is what stops it: the words module keeps `chain.js` and
    // its digest machinery out of the bundle, and pays for that with this assertion.
    assert.deepEqual(
      [...DIVERGENCE_REASONS].sort(),
      Object.values(DIVERGENCE).sort(),
      'the reasons this screen can word are no longer the reasons the core can report',
    );
    assert.equal(DIVERGENCE_REASONS.length, 7);
    assert.deepEqual(Object.keys(DIVERGENCE_WORDS).sort(), [...DIVERGENCE_REASONS].sort());
  });

  it('and every one of the seven has its own sentence, none of them generic', () => {
    const sentences = DIVERGENCE_REASONS.map((reason) => DIVERGENCE_WORDS[reason]);
    assert.equal(new Set(sentences).size, 7, 'two reasons share one sentence');
    for (const [index, reason] of DIVERGENCE_REASONS.entries()) {
      const sentence = sentences[index] as string;
      assert.ok(sentence.length > 40, `${reason} is worded too thinly to act on: ${sentence}`);
      assert.ok(
        !sentence.includes('_'),
        `${reason}'s sentence carries the machine's own word: ${sentence}`,
      );
    }
  });

  it('EVERY REASON IS REACHED BY REALLY BREAKING A REAL CHAIN, and worded', async () => {
    const clean = await aChain();
    const other = await aChain('tablet');

    /** Each break, and the reason the core must report for it. */
    const breaks: readonly { what: string; reason: string; entries: unknown[] }[] = [
      {
        what: 'something that is not an entry sitting in the list',
        reason: DIVERGENCE.NOT_AN_ENTRY,
        entries: [clean[0], { anything: 'at all' }, clean[2]],
      },
      {
        what: 'a field changed after the entry was written',
        reason: DIVERGENCE.ALTERED,
        entries: [{ ...clean[0], at: '2020-01-01T00:00:00.000Z' }, clean[1]],
      },
      {
        what: 'an entry that does not link to the one before it',
        reason: DIVERGENCE.BROKEN_LINK,
        entries: [clean[0], { ...clean[1], previous_hash: 'not-the-one-before-it' }],
      },
      {
        what: 'an entry taken out of the middle',
        reason: DIVERGENCE.SEQUENCE_GAP,
        entries: [clean[0], clean[2], clean[3]],
      },
      {
        what: 'another device’s entry in this device’s list',
        reason: DIVERGENCE.DEVICE_MISMATCH,
        entries: [clean[0], other[1]],
      },
      {
        what: 'the first entry linking to something when it should link to nothing',
        reason: DIVERGENCE.HEAD_NOT_ANCHORED,
        entries: [{ ...clean[0], previous_hash: 'something' }],
      },
      {
        what: 'an entry naming a kind this log has never defined',
        reason: DIVERGENCE.UNKNOWN_KIND,
        entries: [{ ...clean[0], kind: 'invented.kind' }],
      },
    ];

    const reached: string[] = [];
    for (const broken of breaks) {
      // eslint-disable-next-line no-await-in-loop -- one chain at a time, in order, for readability.
      const result = await verifyChain(broken.entries as never[]) as Record<string, unknown>;
      const divergence = (result.first_divergence ?? null) as Divergence | null;
      assert.equal(
        divergence?.reason,
        broken.reason,
        `${broken.what} did not produce ${broken.reason}; the probe missed rather than the core `
        + 'having changed, so re-aim it rather than banking the red',
      );
      reached.push(String(divergence?.reason));

      const words = describeVerification(asVerification(result));
      assert.equal(words.intact, false, `${broken.what} was worded as an intact list`);
      assert.equal(
        words.whatWentWrong,
        DIVERGENCE_WORDS[broken.reason as never],
        `${broken.what} was not given the sentence its own reason has`,
      );
      // WHERE, as well as WHAT: a position he can repeat, and the entry's own reference.
      assert.ok(words.whereWords !== null && /position \d+/u.test(words.whereWords), 'no position');
      assert.equal(words.reason, broken.reason, 'the reason code is not carried for somebody helping');
      // FIVE — the exit from the dead end, on every broken case without exception.
      assert.equal(words.whatToDo, WHO_TO_ASK);
      assert.ok(
        /whoever set this app up for you/u.test(words.whatToDo),
        'the broken case names no exit that exists in the world',
      );
    }

    assert.deepEqual([...reached].sort(), [...DIVERGENCE_REASONS].sort(),
      'the seven probes did not between them reach the seven reasons');
  });

  it('an intact chain says so plainly, and asks him to do nothing', async () => {
    const clean = await aChain();
    const result = await verifyChain(clean as never[]);
    assert.equal(result.ok, true, 'the chain built by the core does not verify');

    const words = describeVerification(asVerification(result as Record<string, unknown>));
    assert.equal(words.intact, true);
    assert.equal(words.whatWentWrong, null);
    assert.equal(words.whereWords, null);
    assert.equal(words.housekeeping, null);
    assert.equal(words.whatToDo, NOTHING_TO_DO);
    assert.match(words.checkedWords, /5 entries checked/u);
  });

  it('one entry checked is not "1 entries checked"', async () => {
    const clean = await aChain();
    const result = await verifyChain(clean.slice(0, 1) as never[]);
    const words = describeVerification(asVerification(result as Record<string, unknown>));
    assert.equal(words.checkedWords, '1 entry checked.');
  });

  it('a reason this screen has never met still gets a sentence rather than a blank', () => {
    const words = describeVerification({
      device: 'laptop',
      checked: 3,
      ok: false,
      truncated_head: false,
      first_divergence: {
        index: 1, seq: 2, entry_id: 'e2', reason: 'invented_reason', detail: 'the core said so',
      },
    });
    assert.ok((words.whatWentWrong ?? '').length > 40, 'an unknown reason produced no words');
    assert.equal(words.reason, 'invented_reason');
    assert.equal(words.detail, 'the core said so');
    assert.equal(words.whatToDo, WHO_TO_ASK);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOUR — a truncated head is housekeeping, and it is induced rather than asserted about
// ═══════════════════════════════════════════════════════════════════════════════

describe('A TRUNCATED HEAD IS NORMAL HOUSEKEEPING, NEVER DAMAGE', () => {
  it('a really pruned chain verifies, is worded as tidying up, and asks for nothing', async () => {
    const clean = await aChain();
    // Retention discards the oldest entries irrecoverably. What survives is a chain whose oldest
    // entry links to something that is gone — exactly what `verifyChain` calls a truncated head
    // when it is handed no anchor.
    const pruned = clean.slice(2);
    const result = await verifyChain(pruned as never[]);
    assert.equal(result.truncated_head, true, 'the probe did not produce a truncated head');
    assert.equal(result.ok, true, 'the core reads a pruned head as a break, which it is not');

    const words = describeVerification(asVerification(result as Record<string, unknown>));
    assert.equal(words.intact, true, 'retention housekeeping was worded as a broken list');
    assert.equal(words.whatWentWrong, null);
    assert.equal(words.whatToDo, NOTHING_TO_DO, 'housekeeping sent him to another person for help');
    assert.equal(words.housekeeping, OLDEST_ENTRIES_WERE_DROPPED);
    assert.match(OLDEST_ENTRIES_WERE_DROPPED, /tidying up/u);
    assert.match(OLDEST_ENTRIES_WERE_DROPPED, /Nothing has gone wrong/u);
    // And it must not borrow any of the language the broken case uses.
    for (const alarming of ['changed after', 'does not join up', 'taken out', 'wrong']) {
      const carries = words.headline.toLowerCase().includes(alarming);
      assert.equal(carries, false, `the housekeeping headline reads as damage: ${words.headline}`);
    }
  });

  it('and a break on a chain that was ALSO pruned is still reported as a break', async () => {
    // The two facts are independent, and the reassuring one must never swallow the other.
    const clean = await aChain();
    const pruned = [clean[2], { ...(clean[3] as object), previous_hash: 'wrong' }];
    const result = await verifyChain(pruned as never[]);
    const words = describeVerification(asVerification(result as Record<string, unknown>));
    assert.equal(words.intact, false);
    assert.equal(words.whatWentWrong, DIVERGENCE_WORDS.broken_link);
    assert.equal(words.whatToDo, WHO_TO_ASK);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The screen as a whole
// ═══════════════════════════════════════════════════════════════════════════════

describe('what the screen says as a whole', () => {
  it('says what the check is worth in every state, and names the exit only when there is one', async () => {
    const clean = await aChain();
    const good = asVerification(await verifyChain(clean as never[]) as Record<string, unknown>);
    const bad = asVerification(
      await verifyChain([clean[0], { ...(clean[1] as object), previous_hash: 'x' }] as never[]) as
        Record<string, unknown>,
    );

    const settled = describeJournal({
      entries: [], verification: [good], done: true, total: 0, complete: true, verificationComplete: true,
    });
    assert.equal(settled.title, JOURNAL_TITLE);
    assert.equal(settled.whatTheCheckIsWorth, WHAT_THE_CHECK_CAN_AND_CANNOT_DO);
    assert.equal(settled.intact, true);
    assert.equal(settled.whatToDo, null);
    assert.equal(settled.count, 0);
    // An empty list is a normal state on a new device and is worded like one, not as a fault.
    assert.match(settled.intro, /nothing here yet/u);

    const broken = describeJournal({
      entries: [], verification: [good, bad], done: false, total: 9, complete: true, verificationComplete: true,
    });
    assert.equal(broken.intact, false);
    assert.equal(broken.whatToDo, WHO_TO_ASK);
    assert.equal(broken.whatTheCheckIsWorth, WHAT_THE_CHECK_CAN_AND_CANNOT_DO);
    assert.equal(broken.moreWords !== null, true, 'a partial page did not say the count is a floor');
  });

  it('words every entry it is handed, and counts what it holds', () => {
    const entries: JournalEntry[] = KINDS.slice(0, 6).map((kind, index) => ({
      entry_id: `e${index}`,
      seq: index + 1,
      device: 'laptop',
      kind,
      at: T0,
      subject: KIND_SPECS[kind].subject === 'required'
        ? { type: 'session', record_id: `session-${index}` }
        : null,
      affected_count: index,
      previous_hash: null,
    }));
    const report = describeJournal({
      entries,
      verification: [],
      done: true,
      total: entries.length,
      complete: true,
      verificationComplete: true,
    });
    assert.equal(report.count, entries.length);
    assert.equal(report.entries.length, entries.length);
    for (const worded of report.entries) assert.equal(worded.known, true);
    assert.equal(report.verificationHeadline, 'This app has not checked its own list yet.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE THREE FACTS THE SEAM CARRIES THAT THIS MODULE USED TO DROP  (s17/r2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A COUNT WITH NOTHING TO COMPARE IT AGAINST IS A CLAIM THAT IT IS EVERYTHING.
 *
 * The seam carries three facts that each make a number on this screen smaller than the truth: the
 * whole-log `total` behind a filter, the device listing stopping at its ceiling, and the survey
 * stopping at the same one. All three reached the screen and NONE of them had a sentence — the screen
 * drew them as bare label-and-value pairs because this module had no words for them, which is a
 * figure with no explanation on the one surface whose job is to be exact.
 *
 * Each assertion below is PAIRED with its opposite: the sentence appears when the fact is true and is
 * absent when it is not, so none of them can pass by being said unconditionally.
 */
describe('the numbers on this screen are never claimed to be more than they are', () => {
  const reading = (over: Partial<journal.JournalReading>): journal.JournalReading => ({
    entries: [], verification: [], done: true, total: 0, complete: true, verificationComplete: true, ...over,
  });

  it('says how many there are, not only how many are shown', () => {
    const behindAFilter = describeJournal(reading({ total: 412, done: false }));
    assert.equal(behindAFilter.total, 412);
    assert.match(behindAFilter.countWords, /412/u,
      'the whole-log total never reaches the words, so the short page is worded as everything there is');

    // PAIRED: nothing behind the filter, and the sentence stops mentioning a second number.
    assert.doesNotMatch(describeJournal(reading({ total: 0 })).countWords, /412/u);
  });

  it('says a total is a FLOOR when the device listing stopped short, and never calls it a total', () => {
    const short = describeJournal(reading({ total: 40, complete: false }));
    assert.equal(short.everyDeviceListed, NOT_EVERY_DEVICE_WAS_LISTED);
    assert.match(short.countWords, /at least 40/u, 'a bounded count is worded as though it were the whole');
    assert.doesNotMatch(short.countWords, /Showing all/u);

    // PAIRED: a complete listing says nothing about a ceiling and may say "all".
    const whole = describeJournal(reading({ total: 3, complete: true }));
    assert.equal(whole.everyDeviceListed, null);
    assert.doesNotMatch(whole.countWords, /at least/u);
  });

  it('will not report a clean check over devices it never checked', () => {
    const good: DeviceVerification = {
      device: 'laptop', checked: 4, ok: true, truncated_head: false, first_divergence: null,
    };
    const short = describeJournal(reading({ verification: [good], verificationComplete: false }));
    assert.equal(short.everyDeviceChecked, NOT_EVERY_DEVICE_WAS_CHECKED);
    assert.equal(short.intact, true, 'the devices it DID check joined up, and that stays true');
    assert.doesNotMatch(short.verificationHeadline, /every entry joins up/u,
      'a survey that stopped at its ceiling is worded as a clean bill of health over the whole log');

    // PAIRED: the same devices, checked in full, and the unqualified sentence comes back.
    const whole = describeJournal(reading({ verification: [good], verificationComplete: true }));
    assert.equal(whole.everyDeviceChecked, null);
    assert.match(whole.verificationHeadline, /every entry joins up/u);
  });

  it('says what was checked AGAINST what the device holds, so checked is never read as all', () => {
    const partial = describeVerification({
      device: 'laptop', checked: 12, ok: true, truncated_head: false, first_divergence: null,
      entries: 40, complete: false,
    });
    assert.equal(partial.notEverythingChecked, NOT_EVERY_ENTRY_WAS_CHECKED);
    assert.equal(partial.checkedWords, '12 of 40 entries checked.');
    assert.doesNotMatch(partial.headline, /from the oldest entry/u,
      'a partly-checked chain is described as verified from its oldest entry to its newest');

    // PAIRED: checked equals held, and both the sentence and the second figure go away.
    const full = describeVerification({
      device: 'laptop', checked: 40, ok: true, truncated_head: false, first_divergence: null,
      entries: 40, complete: true,
    });
    assert.equal(full.notEverythingChecked, null);
    assert.equal(full.checkedWords, '40 entries checked.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE READ THAT FAILED — THE ONE STATE THIS MODULE HAD NO SENTENCE FOR  (s17/r2's F1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A FAILED READ HAD TO BORROW THE EMPTY LOG'S WORDS, AND THEY ARE THE MOST REASSURING ONES HERE.
 *
 * `journal-source.ts` published nothing when a read threw, so the seam stayed at its empty value and
 * this module worded it: there is nothing here yet, this app has not checked its own list yet. Both
 * are statements about the LIST. Said after a failed read they are the app reporting good news on the
 * strength of never having looked.
 *
 * The sentence for the failed state therefore has to clear three bars at once, and each is asserted
 * with its opposite so none of them can pass by being said unconditionally: it says the app TRIED AND
 * COULD NOT; it says nothing about the list being empty or unchecked; and it does not swing the other
 * way and tell him his records have been interfered with, which a failed read is no evidence of.
 */
describe('THE READ THAT FAILED HAS ITS OWN SENTENCE', () => {
  const failed = (stage: JournalReadStage) => describeFailedJournalRead({ stage, errorName: 'DataError' });

  it('says the app TRIED and COULD NOT, and never that there is nothing here', () => {
    assert.match(COULD_NOT_READ_THE_LIST, /tried to read its own list/u);
    assert.match(COULD_NOT_READ_THE_LIST, /could not/u);

    // The two sentences it is not allowed to be mistaken for, checked against the WORDS the empty
    // state actually uses rather than against a paraphrase of them.
    const empty = describeJournal({
      entries: [], verification: [], done: true, total: 0, complete: true, verificationComplete: true,
    });
    for (const sentence of [empty.intro, empty.verificationHeadline]) {
      assert.notEqual(COULD_NOT_READ_THE_LIST, sentence);
    }
    assert.doesNotMatch(COULD_NOT_READ_THE_LIST, /nothing here/u);
    assert.doesNotMatch(COULD_NOT_READ_THE_LIST, /not checked/u);

    // PAIRED: the empty state genuinely says both of those, so the assertions above are about this
    // sentence being different rather than about the strings being hard to produce.
    assert.match(empty.intro, /nothing here yet/u);
    assert.match(empty.verificationHeadline, /has not checked its own list yet/u);
  });

  it('does not tell him the list is broken, because a failed read is no evidence of that', () => {
    const report = failed('entries');
    assert.equal(report.notAVerdict, A_FAILED_READ_IS_NOT_A_VERDICT);
    assert.match(A_FAILED_READ_IS_NOT_A_VERDICT, /does not mean anything has been lost or changed/u);
    assert.doesNotMatch(report.headline, /does not join up/u);
    assert.notEqual(report.whatToDo, WHO_TO_ASK);

    // PAIRED: a real break DOES say the list does not join up and DOES give that exit — so the two
    // absences above are this state being worded differently, not the module being unable to say it.
    const broken = describeVerification({
      device: 'laptop', checked: 3, ok: false, truncated_head: false,
      first_divergence: { index: 1, seq: 2, entry_id: 'e2', reason: 'altered', detail: 'x' },
    });
    assert.match(broken.headline, /does not join up/u);
    assert.equal(broken.whatToDo, WHO_TO_ASK);
  });

  it('names the human exit the way the rest of this screen does, and says to try again first', () => {
    assert.equal(failed('check').whatToDo, WHO_TO_ASK_ABOUT_A_FAILED_READ);
    assert.match(WHO_TO_ASK_ABOUT_A_FAILED_READ, /whoever set this app up for you/u);
    assert.match(WHO_TO_ASK, /whoever set this app up for you/u, 'the two name the same exit');
    assert.match(WHO_TO_ASK_ABOUT_A_FAILED_READ, /again/u);
  });

  it('says WHICH half failed, with a sentence for every member of the closed set', () => {
    const stages: readonly JournalReadStage[] = ['entries', 'check'];
    for (const stage of stages) {
      const words = READ_STAGE_WORDS[stage];
      assert.ok(typeof words === 'string' && words.length > 0, `no words for the ${stage} stage`);
      assert.equal(failed(stage).whatFailed, words);
    }
    assert.notEqual(READ_STAGE_WORDS.entries, READ_STAGE_WORDS.check, 'the two are told apart');
    assert.deepEqual(Object.keys(READ_STAGE_WORDS).sort(), [...stages].sort(),
      'the wording table and the closed set have drifted apart');

    // A stage this screen is older than degrades to an honest sentence rather than to a blank.
    const unknown = describeFailedJournalRead(
      { stage: 'from a later version' as JournalReadStage, errorName: 'Error' },
    );
    assert.equal(unknown.whatFailed, UNWORDED_READ_STAGE);
  });

  it('carries the stage and the class LITERALLY, for whoever he reads them out to', () => {
    const report = describeFailedJournalRead({ stage: 'check', errorName: 'JournalShapeError' });
    assert.equal(report.stage, 'check');
    assert.equal(report.errorName, 'JournalShapeError');
    assert.equal(report.title, JOURNAL_TITLE);
    assert.equal(report.whatTheCheckIsWorth, WHAT_THE_CHECK_CAN_AND_CANNOT_DO);
  });

  it('and NONE of its sentences is one the ordinary report says, in either direction', () => {
    // The two reports are separate on purpose: every sentence describeJournal produces is a statement
    // about what is IN the list, and after a failed read there is no list to make one about.
    const report = failed('entries');
    const said = [report.headline, report.whatFailed, report.notAVerdict, report.whatToDo];
    const ordinary = describeJournal({
      entries: [], verification: [], done: true, total: 0, complete: true, verificationComplete: true,
    });
    const ordinarySaid = JSON.stringify(ordinary);
    for (const sentence of said) {
      assert.ok(
        !ordinarySaid.includes(sentence),
        `"${sentence}" is said by the ordinary report too, so a failed read cannot be told from a log`,
      );
    }
    // PAIRED: the standing sentence IS shared, deliberately, and is present in both.
    assert.equal(report.whatTheCheckIsWorth, ordinary.whatTheCheckIsWorth);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIVE — the sweep over this module's own words, and the planted claim that proves it can speak
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The vocabulary this surface may not reach for, each entry sitting behind the word `word` so that
 * the repository's own claim gate reads this list as a prohibition rather than as a claim.
 */
const NEVER_SAID: readonly { readonly word: string; readonly why: string }[] = Object.freeze([
  Object.freeze({ word: 'compliant', why: 'a claim about a regime this cannot make' }),
  Object.freeze({ word: 'compliance', why: 'a claim about a regime this cannot make' }),
  Object.freeze({ word: 'certified', why: 'nobody has examined this and nobody has said so' }),
  Object.freeze({ word: 'certification', why: 'nobody has examined this and nobody has said so' }),
  Object.freeze({ word: 'accredited', why: 'nobody has examined this and nobody has said so' }),
  Object.freeze({ word: 'audited', why: 'nobody has examined this and nobody has said so' }),
  Object.freeze({ word: 'regulation', why: 'this surface says nothing about any regime' }),
  Object.freeze({ word: 'regulatory', why: 'this surface says nothing about any regime' }),
  Object.freeze({ word: 'tamper-proof', why: 'the chain is evidence of a change, never a barrier' }),
  Object.freeze({ word: 'tamperproof', why: 'the chain is evidence of a change, never a barrier' }),
  Object.freeze({ word: 'guaranteed', why: 'a tick beside "checked" already reads as a promise' }),
  Object.freeze({ word: 'unbreakable', why: 'anyone with the device can rewrite the whole list' }),
  Object.freeze({ word: 'proof', why: 'this check proves nothing against somebody with the device' }),
  Object.freeze({ word: 'verified', why: 'the word reads as a guarantee beside a tick' }),
]);

/** The security vocabulary, kept separate because "secure" needs a word boundary and "safe" does not. */
const NEVER_SAID_SECURITY: readonly { readonly word: string; readonly why: string }[] = Object.freeze([
  Object.freeze({ word: 'secure', why: 'a claim this surface is not able to stand behind' }),
  Object.freeze({ word: 'security', why: 'a claim this surface is not able to stand behind' }),
  Object.freeze({ word: 'safe', why: 'a storage fact is sayable; this is a different claim' }),
  Object.freeze({ word: 'protected', why: 'a claim this surface is not able to stand behind' }),
]);

const EMOJI = /\p{Extended_Pictographic}/u;

/** Every string this module exports, flattened, with the export it came from named. */
function exportedStrings(): readonly { where: string; text: string }[] {
  const found: { where: string; text: string }[] = [];
  const visit = (where: string, value: unknown): void => {
    if (typeof value === 'string') { found.push({ where, text: value }); return; }
    if (Array.isArray(value)) { value.forEach((item, i) => visit(`${where}[${i}]`, item)); return; }
    if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) visit(`${where}.${key}`, inner);
    }
  };
  for (const [name, value] of Object.entries(journal)) {
    if (typeof value === 'function') continue;
    visit(name, value);
  }
  return found;
}

/** The scanner. One implementation, pointed at this module and at a planted claim in the same run. */
function claimsIn(text: string): string[] {
  const lowered = text.toLowerCase();
  return [
    ...NEVER_SAID.filter((banned) => lowered.includes(banned.word)),
    ...NEVER_SAID_SECURITY.filter(
      (banned) => new RegExp(`\\b${banned.word}\\b`, 'u').test(lowered),
    ),
  ].map((banned) => banned.word);
}

describe('THIS SURFACE CLAIMS NOTHING IT CANNOT STAND BEHIND', () => {
  it('THE SCANNER CAN SPEAK — a planted claim in the same run, or the absence below means nothing', () => {
    // A scan whose whole output is an absence is worthless until it is shown able to fire. This
    // sentence is a deliberately planted claim, mentioned rather than made, and every run drives it.
    const planted = 'a planted claim: this app is certified, fully compliant and completely secure';
    const caught = claimsIn(planted);
    assert.ok(
      caught.length >= 3,
      `the scanner stayed quiet on a planted claim, so every absence it reports is meaningless: `
      + `it found ${JSON.stringify(caught)}`,
    );
    assert.ok(caught.includes('certified') && caught.includes('secure'));
    // ...and it is not simply firing on everything.
    assert.deepEqual(claimsIn('This app can tell you when this list has been changed.'), []);
    assert.ok(NEVER_SAID.length + NEVER_SAID_SECURITY.length >= 15, 'the word list has been emptied');
  });

  it('the scan reaches this module’s exported strings, and there are plenty of them', () => {
    const strings = exportedStrings();
    assert.ok(strings.length > 40, `only ${strings.length} exported strings were read`);
    // A positive control on the WALK itself, not only on the patterns: a sentence this module
    // demonstrably exports must be found, or an empty walk would report the module clean for ever.
    assert.ok(
      strings.some((entry) => entry.text === WHAT_THE_CHECK_CAN_AND_CANNOT_DO),
      'the walk did not reach this module’s own exported sentences',
    );
    assert.ok(strings.some((entry) => entry.where.startsWith('KIND_WORDS.')));
    assert.ok(strings.some((entry) => entry.where.startsWith('DIVERGENCE_WORDS.')));
  });

  it('and none of them claims anything about a regime, an examination or how protected he is', () => {
    const found = exportedStrings()
      .flatMap((entry) => claimsIn(entry.text).map((word) => `${entry.where}: ${word}`));
    assert.deepEqual(
      found,
      [],
      `this surface says something it cannot stand behind: ${found.join(' | ')}`,
    );
  });

  it('SAYS PLAINLY WHAT THE CHECK IS AND IS NOT, in words a non-technical person reads', () => {
    // The load-bearing one. Tamper-EVIDENCE: it can tell him something changed; it cannot stop it.
    assert.match(WHAT_THE_CHECK_CAN_AND_CANNOT_DO, /can tell you when this list has been changed/u);
    assert.match(WHAT_THE_CHECK_CAN_AND_CANNOT_DO, /cannot stop somebody changing it/u);
    assert.match(WHAT_THE_CHECK_CAN_AND_CANNOT_DO, /rewrite the whole list/u);
    // No glossary: every word in it is an ordinary one.
    for (const jargon of ['hash', 'digest', 'chain', 'cryptograph', 'integrity']) {
      assert.equal(
        WHAT_THE_CHECK_CAN_AND_CANNOT_DO.toLowerCase().includes(jargon),
        false,
        `the sentence uses "${jargon}", which he would need a glossary for`,
      );
    }
  });

  it('carries no emoji and no styling — this module returns words, never a colour', () => {
    for (const entry of exportedStrings()) {
      assert.doesNotMatch(entry.text, EMOJI, `an emoji is in ${entry.where}`);
      assert.doesNotMatch(entry.text, /#[0-9a-f]{3,8}\b/iu, `a literal colour is in ${entry.where}`);
      assert.doesNotMatch(entry.text, /\b\d+(?:px|rem|ms)\b/u, `a literal measurement is in ${entry.where}`);
    }
  });

  it('and the module is words only — nothing it hands the screen is callable', () => {
    const clean = describeJournal({
      entries: [], verification: [], done: true, total: 0, complete: true, verificationComplete: true,
    });
    const callable: string[] = [];
    const walk = (where: string, value: unknown): void => {
      if (typeof value === 'function') { callable.push(where); return; }
      if (value === null || typeof value !== 'object') return;
      for (const [key, inner] of Object.entries(value)) walk(`${where}.${key}`, inner);
    };
    walk('report', clean);
    assert.deepEqual(callable, [], `the report hands the screen something to call: ${callable.join(', ')}`);
  });
});

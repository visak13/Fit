/**
 * THE RESTORE SURFACE — what he is told, in each of the situations he can actually reach.
 *
 * The core proves that a practice survives the round trip. What is proved here is the half he
 * meets: that a refusal reaches him with the reason still in it, that a wrong passphrase and a
 * damaged file are different sentences, and that a success says HOW MUCH came back rather than only
 * that something did.
 *
 * That last one matters more than it looks. "Done" is what a restore that wrote nothing also says.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anExercise, anIntensityPattern, aRoutine, aClient } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/local-store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { storeOnlyZip } from '../../core/export/export.js';
import { backupParts } from '../../core/artefacts/artefacts.js';
import { collectBackup, sealBackupArchive } from '../../core/backup/backup.js';
import { libraryPage, listClients } from '../../core/store/store.js';
import {
  needsPassphrase, PASSPHRASE_MISSING, PASSPHRASE_WRONG, putABackupBack, RESTORE_WORDS,
} from './restore-backup';

const NOW = '2026-08-01T09:00:00.000Z';
const LATER = '2026-08-02T09:00:00.000Z';
const PHRASE = 'seven copper lantern meadow drift oyster';
const COACH = { provenance: 'coach-created' };

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

async function aPractice(store: any) {
  await store.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await store.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  await store.create('client', aClient({ name: 'Alex Fixture' }));
}

describe('putting a backup back', () => {
  it('SAYS HOW MUCH CAME BACK, because "done" is what a restore of nothing also says', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    const bytes = storeOnlyZip(backupParts(await collectBackup(source, { taken_at: NOW })));

    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes, now: LATER });

    assert.equal(report.tone, 'plain');
    assert.equal(report.restored, true);
    assert.match(report.words, /1 exercise\b/, 'singular, because one is one');
    assert.match(report.words, /1 routine\b/);
    assert.match(report.words, /1 intensity curve\b/);
    assert.match(report.words, /1 client\b/);
    assert.ok(!/0 /.test(report.words), 'a kind that held nothing is not worth a line');
  });

  it('plurals are plural, so the sentence reads like a sentence', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    await source.create('exercise', anExercise({ id: 'coach-band-curl', ...COACH }));
    const bytes = storeOnlyZip(backupParts(await collectBackup(source, { taken_at: NOW })));

    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes, now: LATER });
    assert.match(report.words, /2 exercises\b/);
  });

  it('A REFUSAL REACHES HIM WITH THE REASON STILL IN IT, naming what is missing', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    const set = await collectBackup(source, { taken_at: NOW });
    set.kinds.exercise = [];
    const bytes = storeOnlyZip(backupParts(set));

    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes, now: LATER });

    assert.equal(report.tone, 'warning');
    assert.equal(report.restored, false);
    assert.match(report.words, /coach-floor-press/, 'a shorter sentence of ours would be a dead end');
    assert.match(report.words, /Nothing on this device was changed/);

    // And it is a REPORT rather than a broken screen: an ordinary outcome of choosing a file.
    assert.equal(await fresh.count('routine'), 0);
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE COUNT IS WHAT HE WILL SEE, NOT WHAT THE FILE CARRIED
  //
  // A backup carries tombstones, because a deletion has to reach the other device. Counting the
  // rows the file put back therefore OVERSTATES on any library that has had anything removed —
  // measured live by s11/a11 at "102 exercises, 12 routines, 16 intensity curves" against a library
  // holding 100, 7 and 8. Overstating is not the smaller defect: told twelve and shown seven, he
  // cannot tell a correct restore from one that lost five, on the one path where he has nothing
  // else to check it against.
  //
  // TWO DIRECTIONS, AND THE SECOND IS THE ONE THAT MATTERS. A library that has never deleted
  // anything has equal live and row counts, so it CANNOT show this defect and a green there proves
  // nothing. And without the no-deletions case, a "fix" that subtracts a constant passes.
  // ════════════════════════════════════════════════════════════════════════════════════════════

  /** One live record of each library kind, plus the tombstones of records he removed. */
  async function aPracticeWithRemovals(store: any) {
    await store.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
    for (const id of ['coach-gone-one', 'coach-gone-two']) {
      const dead = await store.create('exercise', anExercise({ id, ...COACH }));
      await store.tombstone('exercise', dead.record_id);
    }

    await store.create('routine', aRoutine({
      id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
    }));
    const deadRoutine = await store.create('routine', aRoutine({
      id: 'coach-old-friday', entries: [{ exercise_id: 'coach-floor-press', sets: 1, repetitions: 1 }], ...COACH,
    }));
    await store.tombstone('routine', deadRoutine.record_id);

    await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
    const deadPattern = await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-old-ramp', ...COACH }));
    await store.tombstone('intensity-pattern', deadPattern.record_id);

    await store.create('client', aClient({ name: 'Alex Fixture' }));
    const deadClient = await store.create('client', aClient({ name: 'Departed Fixture' }));
    await store.tombstone('client', deadClient.record_id);
  }

  /** What the coach's own lists then hold — the `!record.deleted` every list in this app applies. */
  async function whatTheListsHold(store: any, kind: string): Promise<number> {
    const rows: any[] = [];
    let after: string | null = null;
    for (;;) {
      const page: any = kind === 'client'
        ? await listClients(store, { after })
        : await libraryPage(store, kind, { after });
      rows.push(...page.items);
      if (page.done === true || page.cursor === null || page.cursor === undefined) break;
      after = page.cursor;
    }
    return rows.length;
  }

  it('COUNTS WHAT THE LIBRARY WILL SHOW, not the rows the file carried, when records have been removed', async () => {
    const source = await aStore('coach-laptop');
    await aPracticeWithRemovals(source);

    // THE FIXTURE IS THE WHOLE MECHANISM, so it is asserted rather than assumed: rows above live.
    assert.equal(await source.count('exercise'), 3, 'three exercise ROWS, tombstones included');
    assert.equal(await whatTheListsHold(source, 'exercise'), 1, 'and one of them in the list');

    const bytes = storeOnlyZip(backupParts(await collectBackup(source, { taken_at: NOW })));
    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes, now: LATER });

    assert.equal(report.restored, true);

    // THE SENTENCE EQUALS WHAT THE LIBRARY THEN HOLDS, kind by kind, read back out of the store.
    for (const [kind, word] of [
      ['exercise', 'exercise'], ['routine', 'routine'],
      ['intensity-pattern', 'intensity curve'], ['client', 'client'],
    ]) {
      const held = await whatTheListsHold(fresh, kind);
      assert.equal(held, 1, `${kind}: the fixture means one, or this test is measuring itself`);
      assert.match(
        report.words,
        new RegExp(`\\b${held} ${word}\\b`, 'u'),
        `the sentence must say ${held} ${word}, which is what his list now holds`,
      );
    }

  });

  /** The sentence a library with removals produces, which both halves of the pair read. */
  async function theSentenceAfterRemovals(): Promise<string> {
    const source = await aStore('coach-laptop');
    await aPracticeWithRemovals(source);
    const bytes = storeOnlyZip(backupParts(await collectBackup(source, { taken_at: NOW })));
    const fresh = await aStore('coach-phone');
    return (await putABackupBack(fresh as any, { bytes, now: LATER })).words;
  }

  // ── THE OPPOSED PAIR, AND EACH HALF IS ITS OWN TEST ──────────────────────────────────────────
  //
  // Two reasons, and neither is tidiness. First, the equality loop above asserts the live number
  // directly and reds FIRST under a revert probe, so a pair sharing that test could never be shown
  // red alone. Second — and this is s11/a34's correction — `assert` THROWS, so two halves in one
  // test can never both be OBSERVED in a single run: the survivor does not run, which is not the
  // same fact as the survivor being green. Split, both halves run, and one probe reds exactly one.
  //
  // The wording is what makes them independent. (a) asserts an ABSENCE, so it survives a sentence
  // that dropped its counts entirely. (b) asserts that A count is named, so it survives the OLD
  // copy, which named a count and merely named the wrong one. A pair whose halves red together is
  // one assertion wearing two names.

  it('THE COUNT IS NOT THE ROW COUNT — half one of the pair, and it survives a sentence with no counts at all', async () => {
    assert.ok(
      !/\b3 exercises\b/u.test(await theSentenceAfterRemovals()),
      'the sentence reported 3 exercises — the ROW count, two of them tombstones — and his list holds 1',
    );
  });

  it('AND A COUNT IS STILL NAMED — half two of the pair, and it survives the old row-counting copy', async () => {
    assert.match(
      await theSentenceAfterRemovals(),
      /Put back: \d+ [a-z]/u,
      'the sentence stopped naming a number, and "done" is what a restore of nothing also says',
    );
  });

  it('AND A LIBRARY THAT HAS DELETED NOTHING STILL REPORTS CORRECTLY, or a fix that subtracts a constant passes', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    await source.create('exercise', anExercise({ id: 'coach-band-curl', ...COACH }));

    // NO TOMBSTONES ANYWHERE: rows and live are equal, which is why this case cannot show the
    // defect — and exactly why it has to be here.
    assert.equal(await source.count('exercise'), await whatTheListsHold(source, 'exercise'));

    const bytes = storeOnlyZip(backupParts(await collectBackup(source, { taken_at: NOW })));
    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes, now: LATER });

    assert.equal(await whatTheListsHold(fresh, 'exercise'), 2);
    assert.match(report.words, /\b2 exercises\b/u, 'two went in and two must be reported');
    assert.match(report.words, /\b1 routine\b/u);
    assert.match(report.words, /\b1 intensity curve\b/u);
    assert.match(report.words, /\b1 client\b/u);
  });

  it('a file that is not a backup is refused in words rather than half-read', async () => {
    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, {
      bytes: storeOnlyZip([{ name: 'holiday-photos.txt', text: 'not a backup' }]),
      now: LATER,
    });

    assert.equal(report.tone, 'warning');
    assert.equal(report.restored, false);
    assert.match(report.words, /not a backup this application wrote/);
  });
});

describe('the encrypted archive', () => {
  it('IS RECOGNISED FROM THE FILE, not from its name', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    const set = await collectBackup(source, { taken_at: NOW });

    const archive = new TextEncoder().encode(await sealBackupArchive(PHRASE, set, { at: NOW }));
    const plain = storeOnlyZip(backupParts(set));

    assert.equal(needsPassphrase(archive), true);
    // THE DISCRIMINATOR IN THE LOOSENING DIRECTION: a sniffer that said yes to everything would put
    // a passphrase box in front of the plain file, which is friction on the path he takes when
    // something has already gone wrong.
    assert.equal(needsPassphrase(plain), false);
  });

  it('opens with the passphrase and puts the practice back', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    const archive = new TextEncoder().encode(
      await sealBackupArchive(PHRASE, await collectBackup(source, { taken_at: NOW }), { at: NOW }),
    );

    const fresh = await aStore('coach-phone');
    const report = await putABackupBack(fresh as any, { bytes: archive, passphrase: PHRASE, now: LATER });

    assert.equal(report.tone, 'plain');
    assert.equal(report.restored, true);
    assert.equal(await fresh.count('client'), 1);
  });

  it('A WRONG PASSPHRASE AND A MISSING ONE ARE DIFFERENT SENTENCES, because they are different mistakes', async () => {
    const source = await aStore('coach-laptop');
    await aPractice(source);
    const archive = new TextEncoder().encode(
      await sealBackupArchive(PHRASE, await collectBackup(source, { taken_at: NOW }), { at: NOW }),
    );
    const fresh = await aStore('coach-phone');

    const missing = await putABackupBack(fresh as any, { bytes: archive, now: LATER });
    assert.equal(missing.words, PASSPHRASE_MISSING);

    const wrong = await putABackupBack(fresh as any, { bytes: archive, passphrase: 'not the phrase', now: LATER });
    assert.equal(wrong.words, PASSPHRASE_WRONG);

    assert.notEqual(missing.words, wrong.words);
    for (const report of [missing, wrong]) {
      assert.equal(report.restored, false);
    }
    assert.equal(await fresh.count('client'), 0, 'and neither wrote anything');
  });
});

describe('the words', () => {
  it('SAY WHAT A RESTORE DOES NOT DO, or he will not dare press it on the day he needs to', () => {
    assert.match(RESTORE_WORDS, /left exactly as it is/);
    assert.match(RESTORE_WORDS, /Nothing is emptied first/);
  });

  it('carry no emoji', () => {
    for (const words of [RESTORE_WORDS, PASSPHRASE_MISSING, PASSPHRASE_WRONG]) {
      assert.equal(words.match(/\p{Extended_Pictographic}/gu), null);
    }
  });
});

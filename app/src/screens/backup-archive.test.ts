/**
 * THE COPY HE KEEPS ELSEWHERE — what he is told, and what the nudge does around it.
 *
 * The cryptography and the round trip are proved in the core. What is proved here is the surface:
 * that the instant is recorded only when the file REALLY LEFT, that a dismissal is not worded as a
 * failure, that an incomplete read refuses before a file exists, and that the nudge appears and then
 * goes away because he acted rather than because time passed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aClient, anExercise, anIntensityPattern, aRoutine } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/local-store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { openPortableArchive } from '../../core/crypto/portable.js';
import {
  ARCHIVE_WORDS, CLINICAL_STAYS_LOCKED, LAST_BACKUP_META, NOTHING_TO_SAVE, PASSPHRASE_NEEDED,
  readArchiveState, saveBackupArchive,
} from './backup-archive';
import type { ExportAudit, ExportEntryFields } from './export-audit';

/**
 * THE REQUIRED SINK, in a suite that is not about the log.
 *
 * It KEEPS what was written rather than discarding it — a sink that threw its argument away would be
 * a no-op wearing the shape of a recorder, and the next person to copy it into production source
 * would have reinvented the optional sink the argument exists to forbid. What the entries actually
 * say, on a real store, driven through these same entry points, is proven in `export-audit.test.ts`.
 */
function anAudit(): { audit: ExportAudit; written: ExportEntryFields[] } {
  const written: ExportEntryFields[] = [];
  return { audit: { journal: async (fields) => { written.push(fields); } }, written };
}


const NOW = '2026-08-01T09:00:00.000Z';
const A_MONTH_LATER = '2026-09-05T09:00:00.000Z';
const PHRASE = 'seven copper lantern meadow drift oyster';
const COACH = { provenance: 'coach-created' };

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

async function aPractice(store: any) {
  await store.create('exercise', anExercise({ id: 'coach-floor-press', ...COACH }));
  await store.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  await store.create('client', aClient({ name: 'Alex Fixture' }));
}

/** A delivery surface that records what it was handed. No share sheet, which is the desktop case. */
function aDownload() {
  const files: File[] = [];
  return {
    files,
    surfaces: {
      download: { download: (file: File) => { files.push(file); } },
    },
  };
}

describe('saving the copy', () => {
  it('HANDS OVER A FILE THAT OPENS WITH THE PASSPHRASE, and says how much is in it', async () => {
    const store = await aStore();
    await aPractice(store);
    const delivery = aDownload();

    const report = await saveBackupArchive(store, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });

    assert.equal(report.saved_at, NOW);
    assert.match(report.words, /4 records/, 'a copy that will not say how much it holds is one he cannot check');
    assert.match(report.words, /only way into it/);

    // THE LOAD-BEARING ASSERTION: the bytes he was handed really are the practice.
    assert.equal(delivery.files.length, 1);
    assert.match(delivery.files[0].name, /\.fitbackup$/);
    const opened = await openPortableArchive(PHRASE, await delivery.files[0].text());
    assert.match(opened, /coach-floor-press/);
    assert.ok(!(await delivery.files[0].text()).includes('coach-floor-press'), 'and it was sealed, not merely renamed');
  });

  it('RECORDS THE INSTANT ONLY WHEN THE FILE REALLY LEFT', async () => {
    const store = await aStore();
    await aPractice(store);

    // The share sheet he dismissed. Not a failure, and it must not silence the nudge.
    const dismissed = {
      sharing: { canShare: () => true, share: async () => { throw abortError(); } },
      download: { download: () => { throw new Error('the download must not run after a dismissal'); } },
    };

    const report = await saveBackupArchive(store, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: dismissed });

    assert.equal(report.saved_at, null, 'a dismissal recorded as a save silences the nudge on the day it was right');
    assert.equal(await store.getMeta(LAST_BACKUP_META), undefined);

    // ...and the discriminator in the other direction: a real delivery DOES record it.
    const delivery = aDownload();
    await saveBackupArchive(store, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });
    assert.equal(await store.getMeta(LAST_BACKUP_META), NOW);
  });

  it('REFUSES WITHOUT A PASSPHRASE rather than making a file with no way in', async () => {
    const store = await aStore();
    await aPractice(store);
    const delivery = aDownload();

    for (const passphrase of ['', '   ']) {
      const report = await saveBackupArchive(store, { passphrase, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });
      assert.equal(report.words, PASSPHRASE_NEEDED);
      assert.equal(report.saved_at, null);
    }
    assert.equal(delivery.files.length, 0, 'and no file was made');
  });

  it('REFUSES AN EMPTY PRACTICE rather than handing him a file that says everything is safe', async () => {
    const store = await aStore();
    const delivery = aDownload();

    const report = await saveBackupArchive(store, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });
    assert.equal(report.words, NOTHING_TO_SAVE);
    assert.equal(delivery.files.length, 0);
  });

  it('AN INCOMPLETE READ REFUSES BEFORE A FILE EXISTS, in the core\'s own words', async () => {
    // The store's walk stops without reaching the end. A short backup is discovered at the moment it
    // is the only copy left, so the only safe outcome is no file at all.
    const stalled = {
      device: 'coach-laptop',
      read: async () => ({ items: [{ record_id: 'a', type: 'client' }], cursor: null, done: false }),
    } as any;
    const delivery = aDownload();

    const report = await saveBackupArchive(stalled, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });

    assert.equal(report.tone, 'warning');
    assert.equal(report.saved_at, null);
    assert.match(report.words, /Nothing was saved/);
    assert.equal(delivery.files.length, 0, 'a file was written from a walk that never finished');
  });
});

describe('the nudge around it', () => {
  it('SAYS NOTHING ON A DEVICE WITH NOTHING ON IT', async () => {
    const store = await aStore();
    const state = await readArchiveState(store, NOW);

    assert.equal(state.holds_records, false);
    assert.equal(state.nudge.due, false);
  });

  it('APPEARS ONCE THERE IS SOMETHING TO LOSE, and never blocks', async () => {
    const store = await aStore();
    await aPractice(store);
    const state = await readArchiveState(store, NOW);

    assert.equal(state.holds_records, true);
    assert.equal(state.last_backup_at, null);
    assert.equal(state.nudge.due, true);
    assert.equal(state.nudge.reason, 'never');
    assert.equal(state.nudge.blocks, false);
  });

  it('GOES AWAY BECAUSE HE ACTED, and comes back a month later', async () => {
    const store = await aStore();
    await aPractice(store);
    const delivery = aDownload();

    assert.equal((await readArchiveState(store, NOW)).nudge.due, true, 'the fixture must be due, or the rest is free');

    await saveBackupArchive(store, { passphrase: PHRASE, at: NOW, audit: anAudit().audit, surfaces: delivery.surfaces });

    // The SAME instant. The only thing that changed is that he saved a copy.
    assert.equal((await readArchiveState(store, NOW)).nudge.due, false);

    // ...and a month on it is due again, which is what makes it a monthly nudge rather than a
    // one-off that is answered for ever.
    const later = await readArchiveState(store, A_MONTH_LATER);
    assert.equal(later.nudge.due, true);
    assert.equal(later.nudge.reason, 'stale');
    assert.equal(later.nudge.blocks, false);
  });
});

describe('the words', () => {
  it('NAME THE HONEST COST IN THE SAME BREATH AS THE BENEFIT', () => {
    assert.match(ARCHIVE_WORDS, /lose your Google account/);
    assert.match(ARCHIVE_WORDS, /only way into it/);
    assert.match(ARCHIVE_WORDS, /write the passphrase down/);
  });

  it('STATE THE ONE THING THE COPY CANNOT GIVE HIM BACK, where he decides rather than where he finds out', () => {
    // A coach restoring onto a borrowed laptop after losing his phone is exactly the person who must
    // not meet a row he cannot read with no warning. The behaviour itself is asserted in
    // `core/backup/restore.test.js`; this pins that the sentence describing it is actually shown.
    assert.match(CLINICAL_STAYS_LOCKED, /medical reminders/);
    assert.match(CLINICAL_STAYS_LOCKED, /not with this passphrase/);
    assert.match(CLINICAL_STAYS_LOCKED, /everything else comes back/);
  });

  it('claim nothing about compliance, and carry no emoji', () => {
    for (const words of [ARCHIVE_WORDS, CLINICAL_STAYS_LOCKED, NOTHING_TO_SAVE, PASSPHRASE_NEEDED]) {
      assert.equal(words.match(/\p{Extended_Pictographic}/gu), null);
      assert.ok(!/complian|certif|HIPAA|GDPR|secure by/i.test(words), `a compliance claim in: ${words}`);
    }
  });
});

/** What a browser throws when he dismisses the share sheet. */
function abortError(): Error {
  const error = new Error('The user aborted a request.');
  error.name = 'AbortError';
  return error;
}

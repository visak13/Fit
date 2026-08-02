/**
 * THE EXPORTS ARE REALLY RECORDED — driven through the production entry points, read back out of a
 * real database.
 *
 * ## WHY THIS SUITE EXISTS SEPARATELY FROM THE PARTITION TEST
 *
 * `core/journal/unwritten-kinds.test.js` asserts that the three export kinds have a call site, in
 * the file that owns it, and nowhere else. That is a claim about SOURCE TEXT, and it is worth having
 * — it is what stops a kind quietly acquiring a second writer or quietly losing its only one. But a
 * call site that exists and is never REACHED passes it perfectly: the scan cannot tell a wired path
 * from a dead branch, and this build has shipped a correct routine nothing called four times.
 *
 * So this suite proves the other half, and it proves it the only way that means anything: it calls
 * `sendDietExport`, `sendClientReport`, `makeFullExport`, `makeLibraryBackup` and
 * `saveBackupArchive` — the same five functions the cards call, with the same
 * {@link exportJournal} sink the cards build — and then reads the journal store back out of a REAL
 * `LocalStore` on the in-memory platform double. Nothing here fixtures the log.
 *
 * ## WHAT IT ASSERTS, AND WHY EACH ONE IS NOT COSMETIC
 *
 *  - **The refusal paths record a refusal**, not a completion and not silence. A dismissed share
 *    sheet, a library missing a kind, an empty practice: an export that failed and an export nobody
 *    attempted are otherwise the same absence, and the second is what an empty log looks like.
 *  - **What the entry SAYS**, not merely that it exists. A fully wired log can still assert
 *    something false — measured on this build, where a sync pass recorded a count that omitted both
 *    directions of deletion propagation and no test anywhere read the value.
 *  - **The log holds no content.** An audit entry carrying a name or a note would be a copy of the
 *    exported thing in a place no purge sweeps, so the practice here is seeded with a distinctive
 *    name and the entries are searched for it.
 *  - **The entries are on the device's own chain and it verifies**, which is what says they went
 *    through the one door rather than being put somewhere that merely looks like the log.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aClient, anExercise, anIntensityPattern, aRoutine } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/local-store.js';
import type { LocalStore } from '../../core/store/local-store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import {
  JOURNAL_KINDS, JOURNAL_STORES, readChainPage, verifyDeviceChain,
} from '../../core/journal/journal.js';
import { projectProgressReport } from '../../core/report/report.js';
import { aHistory } from '../../core/report/testing.js';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { exportJournal } from './export-audit';
import { sendDietExport } from './diet-export';
import { sendClientReport } from './client-export';
import { makeFullExport } from './full-export';
import { makeLibraryBackup } from './library-backup-export';
import { saveBackupArchive } from './backup-archive';

const NOW = '2026-08-01T09:00:00.000Z';
const PHRASE = 'seven copper lantern meadow drift oyster';

/**
 * A NAME NOTHING ELSE IN THIS SUITE USES, so a search of the log for it means one thing.
 *
 * It is a fixture name and not a real one — nothing in this repository may carry a real person's
 * details — but it is distinctive enough that finding it in an entry is proof rather than a
 * coincidence.
 */
const A_DISTINCTIVE_NAME = 'Marlow Quillfeather';

async function aStore(device = 'coach-laptop'): Promise<LocalStore> {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

/** A practice with something in it, under a name a log has no business repeating. */
async function aPractice(store: LocalStore): Promise<void> {
  await store.create('exercise', anExercise({ id: 'coach-floor-press', provenance: 'coach-created' }));
  await store.create('routine', aRoutine({
    id: 'coach-tuesday',
    entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }],
    provenance: 'coach-created',
  }));
  await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', provenance: 'coach-created' }));
  await store.create('client', aClient({ name: A_DISTINCTIVE_NAME }));
}

/** What is genuinely on this device's chain, read back out of the database. */
async function entriesOn(store: LocalStore): Promise<Record<string, any>[]> {
  const page = await store.read(
    [...JOURNAL_STORES],
    (scope) => readChainPage(scope, store.device, { limit: 500 }),
  );
  return page.items as Record<string, any>[];
}

/** Only the export entries, in the order they were written. */
async function exportEntriesOn(store: LocalStore): Promise<Record<string, any>[]> {
  return (await entriesOn(store)).filter((entry) => String(entry.kind).startsWith('export.'));
}

const kindsOf = (entries: Record<string, any>[]): string[] => entries.map((entry) => entry.kind);

/** A browser, with the share sheet behaving as asked. */
function aBrowser(sheet: 'accepts' | 'cancels' | null = 'accepts') {
  const shared: File[] = [];
  const downloaded: File[] = [];

  const sharing: SharingSurface | undefined = sheet === null ? undefined : {
    canShare: () => true,
    share: async (request) => {
      if (sheet === 'cancels') {
        const abort = new Error('The user aborted a request.');
        abort.name = 'AbortError';
        throw abort;
      }
      shared.push(...request.files);
    },
  };
  const download: DownloadSurface = { download: (file: File) => { downloaded.push(file); } };

  return { surfaces: { sharing, download }, shared, downloaded };
}

const aWeek = () => ({
  title: 'A client — Winter block (diet, one repeating week)',
  headings: ['Time', 'Monday', 'Tuesday'],
  rows: [['08:00', 'Oats, 60 g', 'Eggs x3']],
});

const aLibrary = (over: Record<string, unknown[]> = {}) => ({
  exercise: [
    { record_id: 'e1', content: { id: 'push-up', name: 'Push Up' } },
    { record_id: 'e2', content: { id: 'plank', name: 'Plank' } },
  ],
  routine: [{ record_id: 'r1', content: { id: 'push-day', name: 'Push day' } }],
  'intensity-pattern': [{ record_id: 'p1', content: { id: 'wave', name: 'Wave', sequence: ['low', 'high'] } }],
  ...over,
});

const aPracticeToExport = () => ({
  clients: [{ record_id: 'c1', content: { name: A_DISTINCTIVE_NAME, notes: '', active: true } }],
  sessions: [],
  performed: [],
  readings: [],
  diet: [],
  library: { exercise: [], routine: [], 'intensity-pattern': [] },
  clinical: [],
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The success path, through the production entry points
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('an export that happens is on the device chain afterwards', () => {
  it('RECORDS started THEN completed, NAMING THE PLAN, when a diet week is sent', async () => {
    const store = await aStore();
    const browser = aBrowser('accepts');

    const report = await sendDietExport(
      { journal: exportJournal(store), about: { type: 'diet-plan', record_id: 'plan-winter-block' } },
      'spreadsheet',
      aWeek(),
      { ...browser.surfaces, picture: undefined as any },
    );

    // THE LOAD-BEARING ASSERTION, FIRST: the log knows this happened at all. Placed ahead of the
    // delivery check on purpose — a tally that reds first would shadow the rule being probed.
    const entries = await exportEntriesOn(store);
    assert.deepEqual(kindsOf(entries), [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_COMPLETED],
      'a start with no end is a claim nobody can check, and an end with no start is an event with '
      + 'no beginning. Both, in order, or the wiring is half done.');

    // And it says WHICH plan left, in both entries.
    for (const entry of entries) {
      assert.deepEqual(entry.subject, { type: 'diet-plan', record_id: 'plan-winter-block' });
    }

    assert.equal(report.tone, 'delivered');
    assert.equal(browser.shared.length, 1, 'and the file really did go');
  });

  it('NAMES THE CLIENT when a progress report is sent to them', async () => {
    const store = await aStore();
    const browser = aBrowser('accepts');

    await sendClientReport(
      { journal: exportJournal(store), about: { type: 'client', record_id: 'client-7' } },
      'spreadsheet',
      projectProgressReport(aHistory()),
      { ...browser.surfaces, picture: undefined as any },
    );

    const entries = await exportEntriesOn(store);
    assert.deepEqual(kindsOf(entries), [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_COMPLETED]);
    assert.deepEqual(entries[1].subject, { type: 'client', record_id: 'client-7' },
      'this is the one export unambiguously ABOUT a person, and the entry says which — never a word '
      + 'of what the report said about them');
  });

  it('COUNTS THE RECORDS THAT LEFT, and carries no subject for a whole-practice file', async () => {
    const store = await aStore();
    const browser = aBrowser('accepts');

    const report = await makeFullExport(
      { journal: exportJournal(store) },
      ['clients'],
      aPracticeToExport(),
      browser.surfaces,
    );

    const entries = await exportEntriesOn(store);
    // THE VALUE, not merely the presence of the field. A count that is wrong makes the log deny the
    // event it exists to hold, and no test reading only the kind would ever see it.
    assert.equal(entries[1].affected_count, 1,
      'one client was ticked and one client went out; the log says one');
    assert.equal(entries[1].kind, JOURNAL_KINDS.EXPORT_COMPLETED);
    assert.equal(entries[0].subject, null,
      'a whole-practice export names no single record, and an identifier field is not somewhere to '
      + 'park a description of what was ticked');
    assert.equal(report.tone, 'delivered');
  });

  it('COUNTS THE WHOLE PRACTICE when the encrypted archive is saved', async () => {
    const store = await aStore();
    await aPractice(store);
    const browser = aBrowser(null);

    const report = await saveBackupArchive(store, {
      passphrase: PHRASE,
      at: NOW,
      audit: { journal: exportJournal(store) },
      surfaces: browser.surfaces,
    });

    const entries = await exportEntriesOn(store);
    assert.equal(entries[1].affected_count, 4,
      'four records were sealed into the copy, and the log says four — the same number the sentence '
      + 'on screen quotes back to him');
    assert.equal(entries[1].kind, JOURNAL_KINDS.EXPORT_COMPLETED);
    assert.equal(report.saved_at, NOW);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The refusals — the half a wiring step drops
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('an export that did NOT happen is recorded as a refusal, not as silence', () => {
  it('RECORDS A REFUSAL when the file could not be made at all', async () => {
    const store = await aStore();
    const browser = aBrowser('accepts');

    // A library missing a kind: the artefact package refuses by name rather than writing a backup
    // that restores a library missing part of itself.
    const report = await makeLibraryBackup(
      { journal: exportJournal(store) },
      aLibrary({ routine: undefined as any }) as Record<string, unknown[]>,
      browser.surfaces,
    );

    const entries = await exportEntriesOn(store);
    assert.deepEqual(kindsOf(entries), [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_REFUSED],
      'the file was never made, and the log has to be able to say so. Recording a completion here '
      + 'would be the worse defect of the two: a log that overstates cannot be told from one that '
      + 'is right.');
    assert.equal(report.tone, 'warning');
  });

  it('RECORDS A REFUSAL when he dismissed the share sheet — a decision is not a delivery', async () => {
    const store = await aStore();
    const browser = aBrowser('cancels');

    const report = await makeLibraryBackup(
      { journal: exportJournal(store) },
      aLibrary(),
      { sharing: browser.surfaces.sharing, download: { download: () => { throw new Error('never'); } } },
    );

    const entries = await exportEntriesOn(store);
    assert.deepEqual(kindsOf(entries), [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_REFUSED],
      'the vocabulary says a refusal is one that "failed, or was DECLINED". He declined, so nothing '
      + 'left the application, so the log must not say anything did.');
    assert.equal(report.tone, 'stopped', 'and he is not told off for changing his mind');
  });

  it('RECORDS A REFUSAL CARRYING ZERO when the practice had nothing to save', async () => {
    const store = await aStore();
    const browser = aBrowser(null);

    const report = await saveBackupArchive(store, {
      passphrase: PHRASE,
      at: NOW,
      audit: { journal: exportJournal(store) },
      surfaces: browser.surfaces,
    });

    const entries = await exportEntriesOn(store);
    assert.deepEqual(kindsOf(entries), [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_REFUSED]);
    assert.equal(entries[1].affected_count, 0,
      'the walk happened and found nothing, which is a measured zero rather than an unknown');
    assert.equal(report.words, 'Nothing to save yet.');
  });

  it('STATES NO COUNT AT ALL where nothing was ever walked', async () => {
    const store = await aStore();
    await aPractice(store);
    const browser = aBrowser(null);

    const report = await saveBackupArchive(store, {
      passphrase: '   ',
      at: NOW,
      audit: { journal: exportJournal(store) },
      surfaces: browser.surfaces,
    });

    const entries = await exportEntriesOn(store);
    assert.equal(entries[1].kind, JOURNAL_KINDS.EXPORT_REFUSED);
    assert.equal(entries[1].affected_count, null,
      'an empty passphrase refuses before the practice is read, so there is no number to state — '
      + 'and a zero here would be the log measuring something it never looked at');
    assert.equal(report.saved_at, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What the entries may not say, and where they live
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the log records the disclosure and never a copy of what was disclosed', () => {
  it('HOLDS NO WORD OF THE PRACTICE IT RECORDED LEAVING', async () => {
    const store = await aStore();
    await aPractice(store);

    await saveBackupArchive(store, {
      passphrase: PHRASE,
      at: NOW,
      audit: { journal: exportJournal(store) },
      surfaces: aBrowser(null).surfaces,
    });
    await makeFullExport(
      { journal: exportJournal(store) },
      ['clients'],
      aPracticeToExport(),
      aBrowser('accepts').surfaces,
    );

    // Read the whole chain rather than the export entries alone: the claim is about the log, and a
    // search narrowed to the rows this suite wrote would pass over anything else that leaked.
    const written = JSON.stringify(await entriesOn(store));

    assert.ok(!written.includes(A_DISTINCTIVE_NAME),
      'an entry carrying a name would be a copy of the exported thing in a place the purge does not '
      + 'sweep and deletion does not reach — the exact failure this build already measured in the '
      + 'delivered outbox entries');
    assert.ok(!written.includes('Push Up') && !written.includes('Oats'),
      'and nothing of the content either');

    // NON-VACUITY for the search above: it can find a string that IS there. Without this, the two
    // assertions pass for free the day the read comes back empty.
    assert.ok(written.includes('export.completed'), 'the search really is reading the entries');
  });

  it('WRITES THROUGH THE ONE DOOR, so the chain still verifies afterwards', async () => {
    const store = await aStore();
    await aPractice(store);

    await makeLibraryBackup({ journal: exportJournal(store) }, aLibrary(), aBrowser('accepts').surfaces);

    const verdict = await verifyDeviceChain(store);
    assert.equal(verdict.ok, true,
      'the entries link into this device\'s chain like every other entry, which is what says they '
      + 'went through recordEvent rather than into something that merely looks like the log');

    const entries = await entriesOn(store);
    assert.ok(entries.length > 2, 'and they sit among the record changes the practice itself made');
    assert.deepEqual(
      kindsOf(entries).filter((kind) => kind.startsWith('export.')),
      [JOURNAL_KINDS.EXPORT_STARTED, JOURNAL_KINDS.EXPORT_COMPLETED],
    );
  });
});

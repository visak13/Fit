/**
 * THE LIBRARY BACKUP AS A DEFAULT EXPORT — one tap, no gate, and all three kinds in the file.
 *
 * What is proved HERE rather than in the core suite is that the file the coach actually receives
 * carries every kind, that it needs nothing of him but the tap, and that a library missing a kind
 * refuses by name instead of quietly producing a shorter backup.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LIBRARY_BACKUP_KINDS } from '../../core/artefacts/artefacts.js';
import { readZip } from '../../core/export/testing.js';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import {
  LIBRARY_BACKUP_HEADING, LIBRARY_BACKUP_WORDS, libraryBackupSummary, makeLibraryBackup,
  MAKE_THE_BACKUP, MAKING_THE_BACKUP, NOTHING_IN_THE_LIBRARY,
} from './library-backup-export';
import type { LibraryBackupSurfaces } from './library-backup-export';
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


const aLibrary = (over: Record<string, unknown[]> = {}) => ({
  exercise: [
    { record_id: 'e1', content: { id: 'push-up', name: 'Push Up' } },
    { record_id: 'e2', content: { id: 'plank', name: 'Plank' } },
  ],
  routine: [{ record_id: 'r1', content: { id: 'push-day', name: 'Push day' } }],
  'intensity-pattern': [{ record_id: 'p1', content: { id: 'wave', name: 'Wave', sequence: ['low', 'high'] } }],
  ...over,
});

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

  return { surfaces: { sharing, download } as LibraryBackupSurfaces, shared, downloaded };
}

/** What is actually inside the file the coach received. */
async function insideTheFile(file: File): Promise<{ name: string; text: string }[]> {
  return readZip(new Uint8Array(await file.arrayBuffer()));
}

test('ALL THREE KINDS ARE IN THE FILE HE RECEIVES — read out of the delivered bytes', async () => {
  const browser = aBrowser();
  const report = await makeLibraryBackup(anAudit().audit, aLibrary(), browser.surfaces);

  assert.equal(report.tone, 'delivered');
  const entries = await insideTheFile(browser.shared[0]);

  for (const kind of LIBRARY_BACKUP_KINDS) {
    assert.ok(entries.some((entry) => entry.name === `${kind}.json`), `${kind} is not in the delivered file`);
  }
  assert.ok(
    entries.some((entry) => entry.name === 'intensity-pattern.json' && entry.text.includes('Wave')),
    'the third kind must arrive WITH ITS CONTENT, not merely as an empty part',
  );
});

test('IT IS ONE TAP: no passphrase, no checklist, nothing asked of him', async () => {
  const browser = aBrowser();
  const report = await makeLibraryBackup(anAudit().audit, aLibrary(), browser.surfaces);

  assert.equal(report.tone, 'delivered');
  assert.ok(!report.words.toLowerCase().includes('passphrase'));
  assert.ok(!report.words.toLowerCase().includes('tick'));
});

test('A MISSING KIND REFUSES BY NAME rather than writing a shorter backup', async () => {
  const { 'intensity-pattern': _omitted, ...twoKinds } = aLibrary();
  const report = await makeLibraryBackup(anAudit().audit, twoKinds, aBrowser().surfaces);

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.includes('intensity-pattern'), report.words);
  assert.equal(aBrowser().shared.length, 0);
});

test('a cancellation is not a failure here either', async () => {
  const browser = aBrowser('cancels');
  const report = await makeLibraryBackup(anAudit().audit, aLibrary(), browser.surfaces);

  assert.equal(report.tone, 'stopped');
  assert.ok(!report.words.toLowerCase().includes('could not'), report.words);
});

test('a browser with no share sheet downloads, and is not told the file was sent', async () => {
  const browser = aBrowser(null);
  const report = await makeLibraryBackup(anAudit().audit, aLibrary(), browser.surfaces);

  assert.equal(report.tone, 'kept');
  assert.equal(browser.downloaded.length, 1);
});

test('THE COUNT IS REPORTED, because a backup of nothing and a backup of a practice look identical', () => {
  const summary = libraryBackupSummary(aLibrary());

  assert.equal(summary.total, 4);
  assert.ok(summary.words.includes('2 exercises'));
  assert.ok(summary.words.includes('1 routine'), 'and it does not say "1 routines"');
  assert.ok(summary.words.includes('1 intensity pattern'), summary.words);
});

test('an empty library counts zero rather than throwing, so the surface can say so', () => {
  const summary = libraryBackupSummary({ exercise: [], routine: [], 'intensity-pattern': [] });

  assert.equal(summary.total, 0);
  assert.ok(!/\p{Extended_Pictographic}/u.test(NOTHING_IN_THE_LIBRARY));
});

test('the words say what a backup is FOR — that reset cannot bring his own edits back', () => {
  assert.ok(
    LIBRARY_BACKUP_WORDS.includes('cannot bring back your own edits'),
    'a control whose purpose is unstated is one he presses first on the day it is too late',
  );
  for (const line of [LIBRARY_BACKUP_HEADING, LIBRARY_BACKUP_WORDS, MAKE_THE_BACKUP, MAKING_THE_BACKUP]) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), `an emoji in "${line}"`);
  }
});

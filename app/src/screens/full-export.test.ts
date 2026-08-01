/**
 * THE FULL EXPORT'S SURFACE — the gate, the words, and the file that comes out.
 *
 * The tests that matter here are about WHEN the coach is asked for a passphrase and what he is told
 * afterwards. Whether an unticked item leaves a trace is settled in the core suite, on the parts; this
 * one is about the surface in front of him.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CLINICAL_ITEM_ID, FULL_EXPORT_ITEMS, PASSPHRASE_PROMPT } from '../../core/artefacts/artefacts.js';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import {
  FULL_EXPORT_HEADING, NOTHING_IN_WHAT_YOU_TICKED, FULL_EXPORT_WORDS, fullExportOffer, MAKE_THE_FILE, MAKING_THE_FILE,
  makeFullExport, PASSPHRASE_AGAIN, PASSPHRASE_CANNOT_BE_RECOVERED, PASSPHRASE_MISMATCH,
} from './full-export';
import type { FullExportSurfaces } from './full-export';
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


/** Everything he can tick without meeting the gate. */
const PLAIN = FULL_EXPORT_ITEMS.filter((item) => !item.requires_passphrase).map((item) => item.id);

const records = () => ({
  clients: [{ record_id: 'c1', content: { name: 'Marlow Ainsworth', notes: '', active: true } }],
  sessions: [],
  performed: [],
  readings: [],
  diet: [],
  library: { exercise: [], routine: [], 'intensity-pattern': [] },
  clinical: [{ client: 'c1', note: 'the opened note' }],
});

/** A browser, with the share sheet behaving as asked. */
function aBrowser(sheet: 'accepts' | 'refuses-files' | 'cancels' | null) {
  const shared: File[] = [];
  const downloaded: File[] = [];

  const sharing: SharingSurface | undefined = sheet === null ? undefined : {
    canShare: () => sheet !== 'refuses-files',
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

  return { surfaces: { sharing, download } as FullExportSurfaces, shared, downloaded };
}

test('NOTHING IS ASKED FOR when the gated item is not ticked', () => {
  const offer = fullExportOffer(PLAIN, '', '');

  assert.equal(offer.asksForAPassphrase, false, 'no boxes, no prompt, no hint that a gate exists');
  assert.equal(offer.offered, true);
  assert.equal(offer.instead, null);
});

test('ticking the gated item is what asks, and it asks BEFORE it refuses', () => {
  const offer = fullExportOffer([...PLAIN, CLINICAL_ITEM_ID], '', '');

  assert.equal(offer.asksForAPassphrase, true);
  assert.equal(offer.offered, false);
  assert.ok(offer.instead?.includes('passphrase'));
});

test('two boxes that disagree are refused in his words, not with a file he cannot open', () => {
  const offer = fullExportOffer([CLINICAL_ITEM_ID], 'correct horse', 'correct hose');

  assert.equal(offer.offered, false);
  assert.equal(offer.instead, PASSPHRASE_MISMATCH);
});

test('a passphrase typed the same twice opens the way through', () => {
  const offer = fullExportOffer([CLINICAL_ITEM_ID], 'correct horse', 'correct horse');
  assert.equal(offer.offered, true);
  assert.equal(offer.instead, null);
});

test('nothing ticked is refused, whatever he typed', () => {
  assert.equal(fullExportOffer([], 'anything', 'anything').offered, false);
  assert.ok(fullExportOffer([], '', '').instead?.includes('Nothing is ticked'));
});

test('THE FILE IS A REAL FILE and it reaches the share sheet', async () => {
  const browser = aBrowser('accepts');
  const report = await makeFullExport(anAudit().audit, PLAIN, records(), browser.surfaces);

  assert.equal(report.tone, 'delivered');
  assert.equal(browser.shared.length, 1);
  assert.ok(browser.shared[0].name.endsWith('.zip'));
  assert.ok(browser.shared[0].size > 0, 'a file of nothing is not a backup');
});

test('A CANCELLATION IS NOT A FAILURE — he changed his mind, and the words say so', async () => {
  const browser = aBrowser('cancels');
  const report = await makeFullExport(anAudit().audit, PLAIN, records(), browser.surfaces);

  assert.equal(report.tone, 'stopped');
  assert.ok(!report.words.toLowerCase().includes('could not'), report.words);
  assert.equal(browser.downloaded.length, 0, 'and he gets no download he did not ask for');
});

test('a browser with no share sheet DOWNLOADS, and is not told the file was sent', async () => {
  const browser = aBrowser(null);
  const report = await makeFullExport(anAudit().audit, PLAIN, records(), browser.surfaces);

  assert.equal(report.tone, 'kept');
  assert.equal(browser.downloaded.length, 1);
  assert.ok(!report.words.includes('share sheet.'), 'a fallback is never worded as a delivery');
});

test('A REFUSAL COMES BACK AS A SENTENCE, never as an exception in front of a coach', async () => {
  const short = { ...records(), library: { exercise: [], routine: [] } as never };
  const report = await makeFullExport(anAudit().audit, PLAIN, short, aBrowser('accepts').surfaces);

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.includes('intensity-pattern'), 'and it names what was actually wrong');
});

test('a gated export with no sealing function is refused rather than shipped unsealed', async () => {
  const report = await makeFullExport(anAudit().audit, 
    [CLINICAL_ITEM_ID], records(), aBrowser('accepts').surfaces,
  );

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.includes('required'));
});

test('with a sealing function the gated export is made, and the sealer saw the plaintext', async () => {
  let seen = '';
  const browser = aBrowser('accepts');
  const report = await makeFullExport(anAudit().audit, 
    [CLINICAL_ITEM_ID], records(), browser.surfaces,
    async (parts) => {
      seen = parts.map((part) => part.text).join('');
      return { name: 'medical-notes.sealed', text: 'ciphertext' };
    },
  );

  assert.equal(report.tone, 'delivered');
  assert.ok(seen.includes('the opened note'), 'or there was nothing for it to seal');
});

test('no emoji in anything the coach reads on this surface', () => {
  const words = [
    FULL_EXPORT_HEADING, FULL_EXPORT_WORDS, MAKE_THE_FILE, MAKING_THE_FILE, PASSPHRASE_AGAIN,
    PASSPHRASE_CANNOT_BE_RECOVERED, PASSPHRASE_MISMATCH,
  ];
  for (const line of words) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), `an emoji in "${line}"`);
  }
});

test('the passphrase warning says the thing that cannot be undone, and says it plainly', () => {
  assert.ok(PASSPHRASE_CANNOT_BE_RECOVERED.includes('cannot be opened without it'));
  assert.ok(
    PASSPHRASE_CANNOT_BE_RECOVERED.includes('even if this phone and your Google account are both gone'),
    'the property that makes the feature worth having must be stated where he decides',
  );
});

test('AND IT NAMES WHAT THE PASSPHRASE DOES NOT PROTECT AGAINST, which is the honesty rule', () => {
  assert.ok(
    PASSPHRASE_CANNOT_BE_RECOVERED.includes('both the file and the passphrase'),
    'a control that guards one threat and not another must say which, or he reads a protection that '
    + 'is not there',
  );
  assert.ok(
    PASSPHRASE_CANNOT_BE_RECOVERED.includes('keep them apart'),
    'and a warning he cannot act on is decoration; this one carries the instruction',
  );
  assert.ok(
    PASSPHRASE_PROMPT.includes('do not send them together'),
    'the same deal must be stated where he TYPES it, not only where he reads about it',
  );
});

// ── The empty gate, which is this module's and not the seam's ────────────────────────────────────

/** A practice with nothing in it yet — a coach on his first day. */
const anEmptyPractice = () => ({
  clients: [], sessions: [], performed: [], readings: [], diet: [],
  library: { exercise: [], routine: [], 'intensity-pattern': [] },
  clinical: [],
});

test('THE EMPTY GATE IS HERE, because the seam accepts an empty table and cannot know better', () => {
  const offer = fullExportOffer(PLAIN, '', '', anEmptyPractice());

  assert.equal(offer.offered, false, 'a file of empty lists tells him that is what his practice amounts to');
  assert.equal(offer.instead, NOTHING_IN_WHAT_YOU_TICKED);
});

test('...AND IT REFUSES ONLY WHEN THE WHOLE SELECTION IS EMPTY', () => {
  // A real practice with clients but no diet plans yet. Ordinary, and a backup of it is a real backup.
  const partly = { ...anEmptyPractice(), clients: [{ record_id: 'c1', content: { name: 'Marlow', active: true } }] };

  assert.equal(fullExportOffer(['clients', 'diet'], '', '', partly).offered, true);
  assert.equal(
    fullExportOffer(['diet'], '', '', partly).offered, false,
    'but ticking only the empty one still produces a file with nothing in it',
  );
});

test('A SURFACE THAT HAS NOT READ THE RECORDS DOES NOT REFUSE on the strength of not having looked', () => {
  const offer = fullExportOffer(PLAIN, '', '');

  assert.equal(offer.offered, true, 'no records argument means unknown, which is not the same as empty');
});

test('the empty gate does not shadow the passphrase questions', () => {
  // Both would refuse. The passphrase one must not be lost behind it, or he is told to tick
  // something else when what he actually still owes is a passphrase.
  const withRecords = { ...anEmptyPractice(), clinical: [{ client: 'c1', note: 'a note' }] };
  const offer = fullExportOffer([CLINICAL_ITEM_ID], '', '', withRecords);

  assert.equal(offer.asksForAPassphrase, true);
  assert.notEqual(offer.instead, NOTHING_IN_WHAT_YOU_TICKED, 'the gated item has a record, so it is not empty');
});

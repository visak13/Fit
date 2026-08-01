/**
 * THE WHOLE GATED PATH, END TO END, ON THE BYTES THE COACH ACTUALLY RECEIVES.
 *
 * Every other suite proves a piece: the checklist refuses without a sealer, the archive opens on a
 * passphrase, the parts carry no clinical field into the ungated half. THIS ONE runs the real
 * export, takes the file that comes out of the share sheet, unpacks it, and opens the sealed part
 * with NOTHING BUT THE PASSPHRASE.
 *
 * That is the acceptance criterion of the whole action, and it is the one that would pass falsely if
 * it were written anywhere the device's key material happened to be in scope. Here nothing of the
 * sort exists: this is a Node process with no device key store, no account, no store and no
 * envelope, and the archive is opened from bytes that came out of a File.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { openPortableArchive } from '../../core/crypto/crypto.js';
import { readZip } from '../../core/export/testing.js';
import { CLINICAL_ITEM_ID } from '../../core/artefacts/artefacts.js';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { SEALED_PART_NAME, sealClinicalWith } from './clinical-sealing';
import { makeFullExport } from './full-export';
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


const WHEN = () => '2026-07-27T09:00:00.000Z';
const PHRASE = 'correct horse battery staple sunset';

/** The reminder and the pointer, as the caller hands them over ALREADY OPENED. */
const THE_REMINDER = 'Knee — avoid deep squats';
const THE_POINTER_LABEL = 'cardiac-history.pdf';

const records = () => ({
  clients: [{ record_id: 'c1', content: { name: 'Marlow Ainsworth', notes: '', active: true } }],
  sessions: [],
  performed: [],
  readings: [],
  diet: [],
  library: { exercise: [], routine: [], 'intensity-pattern': [] },
  clinical: [{
    record_id: 'c1',
    content: {
      client: 'c1',
      adaptation_flag: THE_REMINDER,
      clinical_reference_label: THE_POINTER_LABEL,
    },
  }],
});

function aBrowser() {
  const shared: File[] = [];
  const sharing: SharingSurface = { canShare: () => true, share: async (r) => { shared.push(...r.files); } };
  const download: DownloadSurface = { download: () => {} };
  return { surfaces: { sharing, download } as FullExportSurfaces, shared };
}

/** The export, run for real, returning the bytes that left the device. */
async function exportWith(ticked: readonly string[], phrase: string) {
  const browser = aBrowser();
  const report = await makeFullExport(anAudit().audit, 
    ticked, records(), browser.surfaces, sealClinicalWith(phrase, WHEN),
  );
  const file = browser.shared[0];
  return { report, file, entries: file === undefined ? [] : readZip(new Uint8Array(await file.arrayBuffer())) };
}

test('THE ACCEPTANCE CRITERION: the delivered file opens later with the PASSPHRASE ALONE', async () => {
  const { report, entries } = await exportWith(['clients', CLINICAL_ITEM_ID], PHRASE);
  assert.equal(report.tone, 'delivered');

  const sealed = entries.find((entry) => entry.name === SEALED_PART_NAME);
  assert.ok(sealed, `the sealed part is not in the file: ${entries.map((e) => e.name).join(', ')}`);

  // NOTHING BUT THE PHRASE AND THE TEXT. No device key, no account, no store, no envelope — none of
  // which exists in this process at all, which is what makes the claim mean something.
  const opened = await openPortableArchive(PHRASE, sealed.text);

  assert.ok(opened.includes(THE_REMINDER), 'the reminder must survive the round trip');
  assert.ok(opened.includes(THE_POINTER_LABEL), 'and so must the pointer label');
});

test('...AND A WRONG PASSPHRASE DOES NOT OPEN IT, or the test above proved only that a file opens', async () => {
  const { entries } = await exportWith(['clients', CLINICAL_ITEM_ID], PHRASE);
  const sealed = entries.find((entry) => entry.name === SEALED_PART_NAME);

  await assert.rejects(() => openPortableArchive('correct horse battery staple sunrise', sealed!.text));
});

test('THE PLAINTEXT IS NOT IN THE FILE — not in the sealed part, not beside it, not anywhere', async () => {
  const { file, entries } = await exportWith(['clients', CLINICAL_ITEM_ID], PHRASE);

  const everything = entries.map((entry) => `${entry.name}\n${entry.text}`).join('\n');
  assert.ok(!everything.includes(THE_REMINDER), 'the reminder is readable in the delivered archive');
  assert.ok(!everything.includes(THE_POINTER_LABEL), 'the pointer label is readable in the delivered archive');

  // And the raw bytes too, in case something outside a listed part carried it.
  const raw = Array.from(new Uint8Array(await file.arrayBuffer()), (b) => String.fromCharCode(b)).join('');
  assert.ok(!raw.includes(THE_REMINDER), 'it is in the archive bytes but not in any part');

  // NON-VACUITY: the same reading really can see content that IS meant to be there.
  assert.ok(everything.includes('Marlow Ainsworth'), 'the clients part is plaintext and readable');
});

test('LEAVING IT UNTICKED PRODUCES AN ORDINARY FILE with no sealed part and no trace', async () => {
  const { report, entries } = await exportWith(['clients'], PHRASE);

  assert.equal(report.tone, 'delivered');
  assert.ok(!entries.some((entry) => entry.name === SEALED_PART_NAME));
  const everything = entries.map((entry) => `${entry.name}\n${entry.text}`).join('\n').toLowerCase();
  for (const word of ['medical', 'sealed', 'passphrase', 'withheld']) {
    assert.ok(!everything.includes(word), `"${word}" is in a file he left the item unticked on`);
  }
});

test('the sealed part is ONE document, so its shape does not say how many clients have a reminder', async () => {
  const { entries } = await exportWith([CLINICAL_ITEM_ID], PHRASE);
  const sealedParts = entries.filter((entry) => entry.name.includes('sealed'));

  assert.equal(sealedParts.length, 1, 'one file per client would leak the count from the listing alone');
});

test('sealing without a passphrase refuses rather than writing an unsealed part', async () => {
  const seal = sealClinicalWith('', WHEN);
  await assert.rejects(() => seal([{ name: 'x.json', text: 'the reminder' }]), /passphrase/i);
});

test('two exports of the same records under the same phrase are not byte-identical', async () => {
  const one = await exportWith([CLINICAL_ITEM_ID], PHRASE);
  const two = await exportWith([CLINICAL_ITEM_ID], PHRASE);

  const sealedOf = (e: { name: string; text: string }[]) => e.find((x) => x.name === SEALED_PART_NAME)!.text;
  assert.notEqual(sealedOf(one.entries), sealedOf(two.entries), 'a fresh key and nonce per export');

  // Both still open, which is what makes that freshness free.
  assert.ok((await openPortableArchive(PHRASE, sealedOf(one.entries))).includes(THE_REMINDER));
  assert.ok((await openPortableArchive(PHRASE, sealedOf(two.entries))).includes(THE_REMINDER));
});

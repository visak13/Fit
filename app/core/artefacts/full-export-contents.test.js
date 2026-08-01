/**
 * WHAT REACHES THE UNGATED HALF OF THE FILE.
 *
 * Two leak classes are asserted here, and each is written the way this build has learned to write an
 * absence: the load-bearing assertion FIRST, and a probe proving the same scan goes red when the
 * leak is put back. An absence-shaped check that has never been seen to fail is an untested guard,
 * and an untested guard is worse than none because it is trusted.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CLINICAL_ITEM_ID, fullExportParts } from './checklist.js';
import {
  CLIENT_FIELDS_CARRIED, CLINICAL_FIELDS, fullExportContents, fullExportCounts, rebuilt,
  SESSION_FIELDS_CARRIED, tickedRecordCount,
} from './full-export-contents.js';

/** A client record as the coach really keeps it — with the reminder and the sealed pointer. */
const aClient = () => ({
  record_id: 'c1',
  deleted: false,
  content: {
    name: 'Marlow Ainsworth',
    notes: 'Prefers early sessions.',
    adaptation_flag: 'Shoulder — see my own notes',
    active: true,
    clinical_reference_label: 'cardiac-history.pdf',
    clinical_reference: { scheme: 1, iv: 'MTIzNDU2Nzg5MDEy', ct: 'Y2lwaGVydGV4dA==' },
  },
});

/** A session as the calendar integration writes it — with the link that embeds his own address. */
const aSession = () => ({
  record_id: 's1',
  deleted: false,
  content: {
    routine_id: 'push-day',
    client_ids: ['c1'],
    status: 'completed',
    mode: 'online',
    started_at: '2026-03-02T09:00:00.000Z',
    ended_at: '2026-03-02T10:00:00.000Z',
    summary: 'Good session.',
    meet_url: 'https://meet.google.com/lookup/abcd?authuser=Y29hY2hAZ21haWwuY29t',
    meet_source: 'minted',
  },
});

const aLibrary = () => ({ exercise: [], routine: [], 'intensity-pattern': [] });

const records = () => ({
  clients: [aClient()],
  sessions: [aSession()],
  performed: [],
  readings: [],
  diet: [],
  library: aLibrary(),
  clinical: [{ client: 'c1', note: 'THE OPENED MEDICAL NOTE' }],
});

/** Every byte of every part, for a scan that does not care which cell a leak arrived in. */
const textOf = (parts) => parts.map((part) => `${part.name}\n${part.text}`).join('\n');

/** Everything an unticked export produces — the whole file, minus the one item he left alone. */
const untickedParts = () => fullExportParts({
  ticked: ['clients', 'sessions', 'diet', 'library'],
  contents: fullExportContents(records()),
});

test('NO CLINICAL FIELD REACHES THE UNGATED HALF — asserted first, before any shape check', async () => {
  const everything = textOf(await untickedParts());

  for (const field of CLINICAL_FIELDS) {
    assert.ok(!everything.includes(field), `${field} is in a file the coach left the medical item unticked on`);
  }
  assert.ok(!everything.includes('cardiac-history.pdf'), 'and neither is the pointer LABEL, which is itself health data');
  assert.ok(!everything.includes('Y2lwaGVydGV4dA=='), 'nor the ciphertext, which he did not agree to send');

  // Only now the shape check: the client is genuinely in there, so the absence above is an absence.
  assert.ok(everything.includes('Marlow Ainsworth'), 'his own client list is what he ticked');
});

test('...AND THE PROBE: a clients part built by SPREADING the record carries every one of them', () => {
  // The defect, written as it would actually be written: one line shorter than the rebuild.
  const spread = [{ name: 'clients.json', text: JSON.stringify([aClient().content], null, 2) }];
  const everything = textOf(spread);

  const found = CLINICAL_FIELDS.filter((field) => everything.includes(field));
  assert.ok(
    found.length >= 2 && everything.includes('cardiac-history.pdf'),
    `the scan found ${JSON.stringify(found)} on a spread record; a scan that cannot see this leak is `
    + 'not evidence about the rebuild',
  );
});

test('NO MEET LINK REACHES THE FILE — its encoded segment carries his own address', async () => {
  const everything = textOf(await untickedParts());

  assert.ok(!everything.includes('meet.google.com'), 'the link');
  assert.ok(!everything.includes('meet_url'), 'nor the field');
  assert.ok(!everything.includes('Y29hY2hAZ21haWwuY29t'), 'nor its encoded segment');
  assert.ok(!everything.includes('meet_source'), 'nor how it got there');

  assert.ok(everything.includes('push-day'), 'the session itself is in the backup, which is the point');
});

test('...AND THE PROBE: a sessions part built by spreading carries the link and the address', () => {
  const everything = textOf([{ name: 'sessions.json', text: JSON.stringify([aSession().content]) }]);

  assert.ok(everything.includes('meet.google.com') && everything.includes('Y29hY2hAZ21haWwuY29t'),
    'the scan can see a meet link when there is one');
});

test('THE REBUILD IS AN ALLOWLIST: a field invented next year is not carried', () => {
  const future = { ...aClient().content, favourite_biscuit: 'digestive', clinical_note: 'a new leak' };

  const out = rebuilt({ content: future }, CLIENT_FIELDS_CARRIED);
  assert.deepEqual(Object.keys(out).sort(), [...CLIENT_FIELDS_CARRIED].sort());
  assert.ok(!('favourite_biscuit' in out), 'not copied, rather than removed after being copied');
  assert.ok(!('clinical_note' in out));
});

test('a field the record does not have is ABSENT, not empty — a backup invents nothing', () => {
  const out = rebuilt({ content: { name: 'Solo' } }, CLIENT_FIELDS_CARRIED);
  assert.deepEqual(out, { name: 'Solo' });
});

test('the session summary IS carried: this is his own backup of his own working notes', () => {
  assert.ok(SESSION_FIELDS_CARRIED.includes('summary'));
  const out = rebuilt(aSession(), SESSION_FIELDS_CARRIED);
  assert.equal(out.summary, 'Good session.');
});

test('THE GATED ITEM IS WHERE THE MEDICAL NOTE IS, and it is handed over to be sealed', async () => {
  const sealed = [];
  await fullExportParts({
    ticked: ['clients', CLINICAL_ITEM_ID],
    contents: fullExportContents(records()),
    sealClinical: async (parts) => { sealed.push(...parts); return { name: 'medical-notes.sealed', text: 'x' }; },
  });

  assert.ok(
    textOf(sealed).includes('THE OPENED MEDICAL NOTE'),
    'the sealing function must be handed the plaintext, or there is nothing for it to seal',
  );
});

test('THE COUNTS ARE READ BACK OUT OF THE PARTS, so they cannot drift from what the file holds', () => {
  const counts = fullExportCounts(records());

  assert.equal(counts.clients, 1);
  assert.equal(counts.sessions, 1, 'one item, summed across the parts it contributes');
  assert.equal(counts.diet, 0);
  assert.equal(counts[CLINICAL_ITEM_ID], 1);
});

test('...AND THE PROOF THAT THEY ARE DERIVED: change what an item CONTAINS and the count follows', () => {
  const two = records();
  two.diet = [
    { record_id: 'd1', content: { name: 'Winter' } },
    { record_id: 'd2', content: { name: 'Summer' } },
  ];

  assert.equal(
    fullExportCounts(two).diet, 2,
    'a hand-written second mapping would have had to be edited by somebody for this to move',
  );
});

test('an empty practice counts zero everywhere, which is what the surface refuses on', () => {
  const nothing = {
    clients: [], sessions: [], performed: [], readings: [], diet: [],
    library: { exercise: [], routine: [], 'intensity-pattern': [] }, clinical: [],
  };

  assert.equal(tickedRecordCount(['clients', 'sessions', 'diet', 'library'], nothing), 0);
});

test('the count sums only what he TICKED, never the whole practice', () => {
  assert.equal(tickedRecordCount(['diet'], records()), 0, 'diet is empty in this fixture');
  assert.equal(tickedRecordCount(['clients'], records()), 1);
  assert.equal(tickedRecordCount(['clients', 'sessions'], records()), 2);
});

test('the library goes out VERBATIM and a missing kind is still refused through this path', () => {
  assert.throws(
    () => fullExportContents({ ...records(), library: { exercise: [], routine: [] } }),
    /intensity-pattern/,
    'the completeness rule must not be bypassable by assembling contents from here',
  );
});

/**
 * THE CHECKLIST, AND THE ITEM HE LEFT UNTICKED.
 *
 * The load-bearing test in this file is the one proving an unticked medical-notes item leaves NO
 * TRACE — and it is written with its own break probe, because an absence-shaped assertion passes
 * just as happily when the scan is broken as when the file is clean. So the same scan is run against
 * a file where the item IS ticked and is required to FIND it. Prove the detector detects, then trust
 * the absence.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKLIST_TITLE, CLINICAL_ITEM_ID, FULL_EXPORT_ITEMS, fullExportArchive, fullExportParts, itemFor,
  NOTHING_TICKED, PASSPHRASE_MISSING, PASSPHRASE_PROMPT, passphraseNeeded, readSelection,
} from './checklist.js';
import { readZip } from '../export/testing.js';

/** The plain items — everything the coach can tick without meeting a passphrase. */
const PLAIN = FULL_EXPORT_ITEMS.filter((item) => !item.requires_passphrase).map((item) => item.id);

/** What each item puts in the file, for a test that does not care where records come from. */
const contents = () => Object.fromEntries(
  FULL_EXPORT_ITEMS.map((item) => [item.id, [{ name: `${item.id}.csv`, text: `rows for ${item.id}` }]]),
);

/** A sealing function that names its part after the item, so the break probe has something to find. */
const sealsInto = (name) => async (parts) => ({
  name,
  text: `SEALED(${parts.length})`,
});

/**
 * THE SCAN. Every word that would tell a reader medical notes exist for this client, looked for in
 * the part NAMES as well as the texts — a file listing `medical-notes.sealed` has disclosed it
 * without opening anything.
 */
const TELLTALE = ['medical', 'clinical', 'passphrase', 'withheld', 'not included', 'sealed'];

/** @returns {string[]} the telltale words actually found in these parts. */
function telltalesIn(parts) {
  const everything = parts.map((part) => `${part.name}\n${part.text}`).join('\n').toLowerCase();
  return TELLTALE.filter((word) => everything.includes(word));
}

test('the gated item is LAST and says what it needs in its own label', () => {
  const last = FULL_EXPORT_ITEMS[FULL_EXPORT_ITEMS.length - 1];

  assert.equal(last.id, CLINICAL_ITEM_ID);
  assert.ok(last.requires_passphrase);
  assert.ok(last.label.includes('passphrase'), 'a gate discovered after the decision feels like a trap');
  assert.equal(
    FULL_EXPORT_ITEMS.filter((item) => item.requires_passphrase).length, 1,
    'exactly one item is gated; a second would need its own decision',
  );
});

test('no user-facing word in the checklist carries an emoji', () => {
  const words = [
    CHECKLIST_TITLE, NOTHING_TICKED, PASSPHRASE_PROMPT, PASSPHRASE_MISSING,
    ...FULL_EXPORT_ITEMS.flatMap((item) => [item.label, item.words]),
  ];
  for (const line of words) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), `an emoji in "${line}"`);
  }
});

test('THE PASSPHRASE IS DEMANDED BY THE SELECTION, not by a screen', () => {
  assert.equal(passphraseNeeded(PLAIN), false, 'everything he can tick freely, and no gate');
  assert.equal(passphraseNeeded([]), false);
  assert.equal(passphraseNeeded([CLINICAL_ITEM_ID]), true);
  assert.equal(passphraseNeeded([...PLAIN, CLINICAL_ITEM_ID]), true);
});

test('AN UNTICKED MEDICAL ITEM LEAVES NO TRACE IN THE FILE', async () => {
  const parts = await fullExportParts({ ticked: PLAIN, contents: contents() });

  assert.deepEqual(
    telltalesIn(parts), [],
    'a file saying medical notes were withheld has disclosed that they exist',
  );
});

test('...AND THE SCAN CAN SEE IT — the break probe, run on the same scan', async () => {
  const parts = await fullExportParts({
    ticked: [...PLAIN, CLINICAL_ITEM_ID],
    contents: contents(),
    sealClinical: sealsInto('medical-notes.sealed'),
  });

  const found = telltalesIn(parts);
  assert.ok(
    found.includes('medical') && found.includes('sealed'),
    `the scan found ${JSON.stringify(found)} on a file that DOES carry the item; an absence it `
    + 'cannot see is not an absence it has proven',
  );
});

test('an unticked export is ORDINARY: the same parts, in the same order, as if the item did not exist', async () => {
  const withoutTicking = await fullExportParts({ ticked: PLAIN, contents: contents() });

  assert.deepEqual(
    withoutTicking.map((part) => part.name),
    PLAIN.map((id) => `${id}.csv`),
    'no placeholder, no empty section, no marker of any kind',
  );
});

test('A GATED ITEM WITH NO SEALING FUNCTION IS REFUSED — required, never optional', async () => {
  await assert.rejects(
    () => fullExportParts({ ticked: [CLINICAL_ITEM_ID], contents: contents() }),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.ok(error.message.includes('required'));
      return true;
    },
    'an optional sink is one a later call site omits and still compiles, and an export that '
    + 'silently skipped the sealing looks exactly like one with nothing to seal',
  );
});

test('the sealed part REPLACES the item\'s own parts rather than joining them', async () => {
  const parts = await fullExportParts({
    ticked: [CLINICAL_ITEM_ID],
    contents: contents(),
    sealClinical: sealsInto('medical-notes.sealed'),
  });

  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, 'medical-notes.sealed');
  assert.equal(parts[0].text, 'SEALED(1)', 'and it was handed the item\'s plaintext to seal');
  assert.ok(
    !parts.some((part) => part.name === `${CLINICAL_ITEM_ID}.csv`),
    'the plaintext must not travel beside its own ciphertext',
  );
});

test('nothing ticked is refused in his words, not with an empty file', async () => {
  await assert.rejects(
    () => fullExportParts({ ticked: [], contents: contents() }),
    (error) => error.message === NOTHING_TICKED,
  );
});

test('an item the checklist does not have is refused rather than dropped', () => {
  assert.throws(() => readSelection(['clients', 'everything']), /nothing in the export called "everything"/);
  assert.equal(itemFor('everything'), null);
});

test('the order is the CHECKLIST\'S, so two exports of one selection are the same file', async () => {
  const tapped = [...PLAIN].reverse();
  const parts = await fullExportParts({ ticked: tapped, contents: contents() });

  assert.deepEqual(parts.map((part) => part.name), PLAIN.map((id) => `${id}.csv`));
});

test('THE ARCHIVE IS A REAL ARCHIVE, and every ticked item is a file inside it', async () => {
  const bytes = await fullExportArchive({ ticked: PLAIN, contents: contents() });
  const entries = readZip(bytes);

  assert.deepEqual(entries.map((entry) => entry.name), PLAIN.map((id) => `${id}.csv`));
  assert.equal(entries[0].text, `rows for ${PLAIN[0]}`, 'byte-intact, not merely present');
});

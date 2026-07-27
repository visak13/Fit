/**
 * THE PASTE FLOW, DRIVEN AS A FLOW — and against a REAL store, because the claim is about writing.
 *
 * The property this file exists for is not a shape. It is that **nothing reaches the store until the
 * coach confirms it**, and a shape cannot say that: only counting the records in a real store before
 * and after each step can. So every test here opens the core's own in-process database, the same one
 * the store's own gate runs on, and asks it how many diet plans it holds.
 *
 * The second property is that **nothing is hidden**. A line the importer could not place is quoted
 * back verbatim and is never collapsed into a count — a line dropped quietly is how a client's plan
 * is lost with nobody noticing.
 *
 * NO PARSING IS ASSERTED HERE. `core/diet/import.test.js` owns every judgement about what a paste
 * means; this file asserts what the SURFACE does with the answer.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import {
  EVERYTHING_PLACED, IMPORT_INTRO, describeImport, readPaste, savedWords, summaryOf,
} from './diet-import';
import { saveImportedPlan } from './diet-editor-source';
import type { LocalStore } from '../../core/store/store.js';

const opened: LocalStore[] = [];

async function freshStore(): Promise<LocalStore> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close?.();
  }
});

/** A real client, so the paste has a real identity to belong to. */
async function addClient(store: LocalStore): Promise<string> {
  const created = (await store.create('client', { name: 'Priya', notes: '', active: true })) as {
    record_id: string;
  };
  return created.record_id;
}

/** How many diet plans the store actually holds. The only honest answer to "was anything written". */
async function planCount(store: LocalStore): Promise<number> {
  return store.count('diet-plan') as Promise<number>;
}

/** A plan the way the coach's wife writes one, with one line nothing can be made of. */
const PASTED = [
  'Monday',
  '08:00 Breakfast - Oats, Milk',
  '13:00 Lunch - Rice, Dal',
  'qwerty nonsense line',
  '',
  'Tues',
  '7.30am Breakfast - Eggs',
].join('\n');

describe('reading a paste writes nothing', () => {
  it('leaves the store exactly as empty as it found it', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);

    assert.equal(await planCount(store), 0);
    const reading = readPaste(PASTED, { clientId, name: 'Week 3', sourceNote: 'From Meera' });

    // The reading is real — it understood the plan — and NOTHING was stored to produce it.
    assert.equal(reading.preview.days.length, 2);
    assert.equal(await planCount(store), 0, 'reading a paste wrote a plan to the store');
  });

  it('will not let him confirm before he has read anything', () => {
    const report = describeImport('nothing-pasted', null);
    assert.equal(report.canConfirm, false);
    assert.equal(report.reading, null);
  });

  it('stops at the read step, however many times it is read', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      readPaste(PASTED, { clientId, name: 'Week 3', sourceNote: '' });
    }

    assert.equal(await planCount(store), 0, 'the read step wrote something on its own');
  });

  it('writes exactly one plan, and only when the confirm step is taken', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);

    const reading = readPaste(PASTED, { clientId, name: 'Week 3', sourceNote: 'From Meera' });
    const report = describeImport('read', reading);
    assert.equal(report.canConfirm, true, 'the record accepted this draft, so he should be able to save it');
    assert.equal(await planCount(store), 0);

    await saveImportedPlan(store, reading.draft);

    assert.equal(await planCount(store), 1);
  });

  it('saves it as a DRAFT, so an import never silently becomes what a client is eating', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);
    const reading = readPaste(PASTED, { clientId, name: 'Week 3', sourceNote: '' });

    const saved = (await saveImportedPlan(store, reading.draft)) as { record_id: string };
    const back = (await store.get('diet-plan', saved.record_id)) as { content: { status: string } };

    assert.equal(back.content.status, 'draft');
    assert.match(savedWords('Week 3'), /not the plan they follow now until you say so/u);
  });

  it('passes the core’s draft through UNCHANGED', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);
    const reading = readPaste(PASTED, { clientId, name: 'Week 3', sourceNote: 'From Meera' });

    const saved = (await saveImportedPlan(store, reading.draft)) as { record_id: string };
    const back = (await store.get('diet-plan', saved.record_id)) as { content: Record<string, unknown> };

    // Every value in the draft traces back to something he pasted. A surface that reshaped it would
    // put a second author between the paste and the record.
    assert.deepEqual(back.content, reading.draft);
  });
});

describe('nothing is hidden from him', () => {
  it('quotes back every line it could not place, verbatim, and never as a count', () => {
    const reading = readPaste(PASTED, { clientId: 'c', name: 'Week 3', sourceNote: '' });

    assert.equal(reading.couldNotPlace.length, 1);
    assert.equal(reading.couldNotPlace[0].text, 'qwerty nonsense line');
    assert.ok(reading.couldNotPlace[0].reason.length > 0);

    const report = describeImport('read', reading);
    assert.ok(report.couldNotPlaceTitle !== null, 'the unplaceable lines have no heading to appear under');
    assert.equal(report.everythingPlacedWords, null);
  });

  it('says out loud when NOTHING was left out, rather than leaving a blank space', () => {
    // A blank space where the unplaced lines would go is indistinguishable from a surface that
    // forgot to draw them, and only one of those means his plan came through whole.
    const clean = readPaste('Monday\n08:00 Breakfast - Oats\n', {
      clientId: 'c', name: 'Week 3', sourceNote: '',
    });

    const report = describeImport('read', clean);
    assert.equal(report.couldNotPlaceTitle, null);
    assert.equal(report.everythingPlacedWords, EVERYTHING_PLACED);
  });

  it('shows the summary as an ACCOUNT of the paste, not a count of what was kept', () => {
    const reading = readPaste(PASTED, { clientId: 'c', name: 'Week 3', sourceNote: '' });
    const words = summaryOf(reading);

    assert.match(words, /7 lines pasted/u, 'the summary does not say how much went in');
    assert.match(words, /could not be placed/u);

    // The core publishes a PARTITION and this surface reports it whole. A count of what came out
    // proves only what was kept.
    const a = reading.accounting;
    assert.equal(a.blank + a.day_heading + a.column_heading + a.placed + a.unplaced, a.total);
  });

  it('shows every change to what was written, so he agrees to it rather than discovering it', () => {
    const reading = readPaste(PASTED, { clientId: 'c', name: 'Week 3', sourceNote: '' });

    assert.ok(reading.changed.some((change) => change.includes('Tues')));
    assert.ok(reading.changed.some((change) => change.includes('07:30')));
    assert.ok(describeImport('read', reading).changedTitle !== null);
  });
});

describe('the record has the last word', () => {
  it('refuses the confirm control while the record refuses the draft', () => {
    // A paste carries no client, so the record refuses. Offering the control anyway would put a
    // refusal in front of him that he could already have read.
    const reading = readPaste(PASTED, { clientId: 'not-an-identity', name: 'Week 3', sourceNote: '' });
    const report = describeImport('read', reading);

    assert.equal(reading.ok, false);
    assert.equal(report.canConfirm, false);
    assert.ok(report.cannotConfirmWords !== null);
    assert.ok(reading.recordRefusals.length > 0);
  });

  it('carries the record’s own sentences unchanged', () => {
    const reading = readPaste(PASTED, { clientId: 'not-an-identity', name: 'Week 3', sourceNote: '' });
    const fromRecord = reading.recordRefusals.map((issue) => issue.message);

    // Not reworded, not summarised, and not replaced by a sentence of this application's.
    assert.ok(fromRecord.every((message) => message.length > 0));
    assert.ok(fromRecord.some((message) => message.includes('UUID')));
  });
});

describe('nothing on this surface is gated', () => {
  it('says no word about a passphrase, a lock or sensitivity anywhere it speaks', () => {
    const reading = readPaste(PASTED, { clientId: 'c', name: 'Week 3', sourceNote: '' });
    const everything = [
      IMPORT_INTRO,
      savedWords('Week 3'),
      summaryOf(reading),
      ...reading.understood,
      ...reading.changed,
      ...reading.couldNotPlace.map((line) => `${line.text} ${line.reason}`),
      ...Object.values(describeImport('read', reading)).filter(
        (value): value is string => typeof value === 'string',
      ),
    ];

    assert.ok(everything.length > 8, 'the sweep found almost nothing to read, so it proves nothing');
    for (const words of everything) {
      for (const banned of ['passphrase', 'password', 'unlock', 'locked', 'sensitive', 'encrypt']) {
        assert.ok(
          !words.toLowerCase().includes(banned),
          `the paste surface says "${banned}" in: ${words}`,
        );
      }
    }
  });

  it('reaches for no crypto: this module imports the diet package and nothing else', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));

    const source = await readFile(path.join(here, 'diet-import.ts'), 'utf8');
    assert.ok(!source.includes('core/crypto'), 'the paste surface imports the crypto module');
    // AND IT CANNOT WRITE: it is handed no store and imports none. The claim above about confirming
    // rests on this, so it is asserted rather than promised.
    assert.ok(!source.includes('core/store'), 'the paste surface can reach a store');
  });
});

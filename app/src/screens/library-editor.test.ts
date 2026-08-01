/**
 * THE EXERCISE HALF OF THE LIBRARY EDITOR — its words, its wiring and its writes.
 *
 * Nothing here is a stub of the store. Every write test opens the core's own in-process database —
 * the same one the store's gate runs on — and goes through the real schema, so the four claims this
 * action makes are proven by CONSEQUENCE rather than by reading the code that was supposed to do it:
 *
 *   ONE — the Routines destination reaches this screen and NOT the placeholder. `no-dead-ends.test.ts`
 *   cannot answer that: it proves a destination resolves, renders and names itself, and the
 *   placeholder does all three by design. This reads the shipped ROUTE_TABLE through react-router's
 *   own matcher, and it is break-probed below.
 *
 *   TWO — an exercise he adds is HIS, and a shipped one he edits is marked as edited. Read back off
 *   the store, never asserted about the function that writes it, because that is the fact the admin
 *   reset is built against and the two are proven against each other.
 *
 *   THREE — THE CONTENT CONTRACT REFUSES, AND IT ACCEPTS. A curve whose harder point rests longer is
 *   refused with the record's own sentence, and — the loosening direction, which is the half that
 *   makes the first mean anything — a curve that is genuinely valid is accepted. A guard that refuses
 *   everything passes the first test and is useless.
 *
 *   FOUR — deleting works, and it will not leave a routine pointing at nothing.
 *
 * The scans in the last describe are absence-shaped, so each carries a POSITIVE CONTROL in the same
 * run: a scan that cannot find what it is looking for where it demonstrably is has proven nothing
 * about the files where it found none.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/screens/library-editor.test.ts
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { EXERCISES, ROUTINES } from '../../core/seed/content.js';
import { COACH_PROVENANCE, EDITED_PROVENANCE, SEED_PROVENANCE } from '../../core/seed/provenance.js';
import { INTENSITY_LEVELS } from '../../core/model/model.js';
import {
  FIELD_LABELS, contentKeyFor, describeContractNotice, describeExercise, describeExerciseRefusal,
  describeLibrary, describeRemoval, draftFromExercise, emptyExerciseDraft, exerciseContent,
  fieldLabel, matchesSearch, prescriptionWords, provenanceWords, removedWords, savedWords,
  vocabularyWords, wholeNumber,
} from './library-editor';
import type {
  ContractNotice, ExerciseDraft, ExerciseRecord, ExerciseSummary,
} from './library-editor';
import {
  FIRST_PAGE, LIBRARY_PAGE_LIMIT, addExercise, appendPage, readLibraryPage, readLibraryReadout,
  removeExercise, routinesUsing, saveExercise,
} from './library-editor-source';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');

const LEVELS: readonly string[] = INTENSITY_LEVELS;

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aRealStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/**
 * A DRAFT THE RECORD GENUINELY ACCEPTS, built from a SHIPPED exercise rather than invented.
 *
 * That is the point rather than a convenience: a fixture written by hand drifts away from the schema
 * and the suite starts proving that the editor agrees with the fixture. This one is the real thing
 * the coach's library is seeded with, turned into a draft by the very function the edit form uses.
 */
function shippedDraft(index = 0): ExerciseDraft {
  const content = EXERCISES[index] as ExerciseRecord['content'];
  return draftFromExercise({ record_id: 'unused', rev: 1, content }, LEVELS);
}

/** One shipped exercise's content, exactly as it ships. */
function shippedContent(index = 0): Record<string, unknown> {
  return JSON.parse(JSON.stringify(EXERCISES[index])) as Record<string, unknown>;
}

/** A summary, without needing a store, for the pure-derivation tests. */
function summaryOf(content: ExerciseRecord['content'], recordId = 'r1'): ExerciseSummary {
  return describeExercise({ record_id: recordId, rev: 3, content });
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('the Routines destination', () => {
  /*
   * `no-dead-ends.test.ts` already proves every destination RESOLVES to a screen that renders and
   * says which destination it is, and PlaceholderScreen satisfies all three BY DESIGN — naming its
   * own destination is its entire job. So this asserts the one thing left: the address reaches THIS
   * screen. It goes through the shipped ROUTE_TABLE and react-router's own matcher, never a second
   * list of paths written beside it.
   *
   * BREAK-PROBED: removing the `routines` entry from DESTINATION_SCREENS turns this red naming the
   * placeholder, and the red comes from this assertion rather than from a resolution failure.
   */
  it('reaches the library editor rather than the placeholder it used to', async () => {
    const { matchRoutes } = await import('react-router');
    const { ROUTE_TABLE } = await import('../shell/routes.tsx');
    const { DESTINATIONS } = await import('../shell/navigation.ts');
    const { RoutinesScreen } = await import('./RoutinesScreen.tsx');
    const { PlaceholderScreen } = await import('./PlaceholderScreen.tsx');

    // The destination is found by its own mark, not by a path typed into this file.
    const routines = DESTINATIONS.find((destination) => destination.glyph === 'nav-routines');
    assert.ok(routines !== undefined, 'the navigation surface no longer carries a Routines destination');

    const matched = matchRoutes([...ROUTE_TABLE], `/${routines.path}`);
    assert.ok(matched !== null, `nothing in the route table answers to /${routines.path}`);

    const leaf = matched.at(-1)?.route;
    assert.notEqual(leaf?.path, '*', 'the Routines destination falls through to not-found');

    const drawn = (leaf?.element as { type?: unknown } | undefined)?.type;

    assert.notEqual(
      drawn,
      PlaceholderScreen,
      'the Routines destination still resolves to the placeholder, which renders and carries the '
      + 'label — so no-dead-ends cannot tell the difference. Add the entry to DESTINATION_SCREENS.',
    );
    assert.equal(
      drawn,
      RoutinesScreen,
      'the Routines destination resolves to some screen other than the library editor',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('wording an exercise', () => {
  it('turns a vocabulary value into something a person reads, without a table beside the vocabulary', () => {
    assert.equal(vocabularyWords('horizontal-push'), 'Horizontal push');
    assert.equal(vocabularyWords('front-deltoids'), 'Front deltoids');
    assert.equal(vocabularyWords('low'), 'Low');
  });

  it('says how much work a point asks for, reading whichever field the record put it in', () => {
    assert.equal(prescriptionWords({ sets: 3, repetitions: 12 }), '3 sets of 12 repetitions');
    assert.equal(prescriptionWords({ sets: 1, repetitions: 1 }), '1 set of 1 repetition');
    assert.equal(prescriptionWords({ sets: 2, duration_seconds: 45 }), '2 sets of 45 seconds');
  });

  it('says plainly when a record holds neither, rather than drawing a blank where a figure goes', () => {
    const words = prescriptionWords({ sets: 3 });
    assert.ok(words.includes('3 sets'), 'the sets were dropped along with the missing figure');
    assert.ok(words.length > '3 sets'.length, 'the absence was rendered as nothing at all');
  });

  it('carries every shipped exercise through without inventing or losing a field', () => {
    for (const content of EXERCISES as ExerciseRecord['content'][]) {
      const summary = summaryOf(content);
      assert.equal(summary.name, content.name);
      assert.equal(summary.contentKey, content.id);
      assert.ok(summary.movement.length > 0, `${content.id} lost its movement`);
      assert.ok(summary.muscles.length > 0, `${content.id} lost its muscles`);
      assert.ok(summary.equipment.length > 0, `${content.id} lost its equipment`);
      assert.ok(summary.cue === content.coaching_cue, `${content.id} had its cue reworded`);
    }
  });

  it('names where an exercise came from by what a reset would DO, for all three states', () => {
    assert.notEqual(provenanceWords(SEED_PROVENANCE), SEED_PROVENANCE);
    assert.notEqual(provenanceWords(EDITED_PROVENANCE), EDITED_PROVENANCE);
    assert.notEqual(provenanceWords(COACH_PROVENANCE), COACH_PROVENANCE);
    // Three DIFFERENT sentences: two states sharing one word is a coach who cannot tell which of his
    // exercises a reset would revert.
    const said = new Set([SEED_PROVENANCE, EDITED_PROVENANCE, COACH_PROVENANCE].map(provenanceWords));
    assert.equal(said.size, 3, 'two provenance states are worded the same');
  });

  it('shows a provenance it has no word for as the record holds it, rather than swallowing it', () => {
    assert.equal(provenanceWords('something-nobody-wrote-a-word-for'), 'something-nobody-wrote-a-word-for');
  });
});

describe('what the library list says', () => {
  const page = (items: readonly ExerciseRecord[], done = true, cursor: string | null = null) => ({
    items, cursor, done,
  });
  const record = (index: number): ExerciseRecord => ({
    record_id: `r${index}`, rev: 1, content: EXERCISES[index] as ExerciseRecord['content'],
  });

  it('an empty library is a fact and not a failure, and it says where the shipped set comes back from', () => {
    const report = describeLibrary({ page: page([]), search: '', total: 0 });

    assert.equal(report.empty, true);
    assert.ok(/admin/iu.test(report.intro), 'an empty library does not say where the shipped set comes back from');
    assert.ok(!/error|failed|wrong|problem/iu.test(report.intro), 'an empty library reads as a fault');
  });

  it('an empty FILTERED library says something different, because it is a different fact', () => {
    const filtered = describeLibrary({ page: page([]), search: 'kettlebell swing', total: 40 });
    const bare = describeLibrary({ page: page([]), search: '', total: 0 });

    assert.notEqual(filtered.intro, bare.intro);
    assert.ok(filtered.intro.includes('kettlebell swing'), 'he is not told what he searched for');
  });

  /*
   * THE COUNTING SENTENCE IS A CLAIM ABOUT THE LIBRARY, NOT ABOUT THE PAGE. It shipped saying
   * "25 exercises in your library. Every one of them is yours to change or remove." to a coach
   * holding a hundred — a page size stated as a total, with "every one of them" reading as a claim
   * about the library. The page's own length is still carried, as `count`; what changed is which of
   * the two numbers the sentence is built from.
   */
  it('counts the LIBRARY in the counting sentence, not the page it happens to be showing', () => {
    const short = describeLibrary({ page: page([record(0), record(1)]), search: '', total: 2 });
    assert.equal(short.count, 2);
    assert.equal(short.more, false);
    assert.equal(short.moreWords, null);

    const partial = describeLibrary({
      page: page([record(0)], false, 'incline-push-up'), search: '', total: 100,
    });
    assert.equal(partial.more, true);
    assert.ok(partial.moreWords !== null, 'a partial page claims to be the whole library');

    // The page holds ONE. The library holds a hundred. The sentence must say a hundred.
    assert.equal(partial.count, 1, 'the page length stopped being carried');
    assert.equal(partial.total, 100);
    assert.ok(partial.intro.includes('100 exercises in your library'),
      `the counting sentence states the page where the library belongs: ${partial.intro}`);
    assert.ok(!/\b1 exercise in your library\b/u.test(partial.intro),
      `the counting sentence states the page where the library belongs: ${partial.intro}`);
  });

  /*
   * THE TRAP ON THE OTHER SIDE OF THE SAME FIX, and it looks exactly like the fix working: once the
   * sentence counts the collection, the easy mistake is that it goes on doing so DURING A SEARCH —
   * "Sled" typed, two matches, and the screen says "2 exercises in your library. Every one of them
   * is yours to change or remove." That is the original defect wearing a new hat: a SUBSET stated as
   * a library total. The two sentences are kept apart deliberately — the matching sentence counts
   * the matches, the library sentence counts the library, and neither borrows the other's number.
   */
  it('does not state a match count as a library total while a search is active', () => {
    const searching = describeLibrary({
      page: page([record(0), record(1)]), search: 'squat', total: 100,
    });

    assert.ok(searching.intro.includes('2 exercises match "squat"'),
      `a search does not say how many matched: ${searching.intro}`);
    assert.ok(!/in your library/u.test(searching.intro),
      `a search states a subset as a library total: ${searching.intro}`);
    assert.ok(!/\b100\b/u.test(searching.intro),
      `a search answers with the size of the library: ${searching.intro}`);
    // And the other direction: the same reading NOT searching says the library's number.
    const resting = describeLibrary({ page: page([record(0), record(1)]), search: '', total: 100 });
    assert.ok(resting.intro.includes('100 exercises in your library'),
      `clearing the box loses the library total: ${resting.intro}`);
  });

  /*
   * FOUND BY LOOKING, like the removal panel's. It rendered "1 exercise match "Coach Test"" — the
   * count branched and the verb after it did not. Both numbers are asserted in both states, because
   * the branch that was wrong was the one nobody thinks to render.
   */
  it('agrees with itself in both numbers, filtered and not', () => {
    const one = describeLibrary({ page: page([record(0)]), search: '', total: 1 }).intro;
    const oneFiltered = describeLibrary({ page: page([record(0)]), search: 'squat', total: 40 }).intro;
    const many = describeLibrary({ page: page([record(0), record(1)]), search: '', total: 2 }).intro;
    const manyFiltered = describeLibrary({
      page: page([record(0), record(1)]), search: 'squat', total: 40,
    }).intro;

    assert.ok(/\bmatches\b/u.test(oneFiltered), `a single match is described with a plural verb: ${oneFiltered}`);
    assert.ok(/\bmatch\b/u.test(manyFiltered) && !/\bmatches\b/u.test(manyFiltered),
      `several matches are described with a singular verb: ${manyFiltered}`);
    assert.ok(!/\b1 exercises\b/u.test(one) && !/\bthem\b/u.test(one), `one exercise is pluralised: ${one}`);
    assert.ok(/\bexercises\b/u.test(many), `several exercises are described in the singular: ${many}`);
  });

  it('matches on the name and the cue, and deliberately not on the equipment', () => {
    // An exercise that USES a bench and says so in neither of the two fields that ARE searched.
    // Excluding the cue as well as the name is the point: the cue is deliberately searchable, so an
    // exercise whose cue says "bench" would be found for a legitimate reason and would prove nothing
    // about whether the equipment is searched.
    const bench = (EXERCISES as ExerciseRecord['content'][]).find((content) => (
      content.equipment.includes('bench')
      && !/bench/iu.test(content.name)
      && !/bench/iu.test(content.coaching_cue)
    ));
    assert.ok(bench !== undefined, 'the shipped library no longer has an exercise that uses a bench without naming one in its name or its cue');

    assert.equal(matchesSearch({ record_id: 'r', rev: 1, content: bench }, 'bench'), false,
      'searching for equipment buries the exercise he actually named under everything that uses it');
    assert.equal(matchesSearch({ record_id: 'r', rev: 1, content: bench }, bench.name.slice(0, 5)), true);
    assert.equal(matchesSearch({ record_id: 'r', rev: 1, content: bench }, '   '), true,
      'a blank search hid the library');
  });

  it('joins a further page on without losing the newer cursor or the newer end marker', () => {
    const joined = appendPage(page([record(0)], false, 'a'), page([record(1)], true, null));
    assert.equal(joined.items.length, 2);
    assert.equal(joined.cursor, null);
    assert.equal(joined.done, true, 'the older end marker survived and would hide the rest of the library');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('the form', () => {
  it('builds an empty draft with one point per level the record model declares', () => {
    const draft = emptyExerciseDraft(LEVELS);
    assert.deepEqual(Object.keys(draft.scaling), [...LEVELS]);
  });

  it('derives a content key from his name, so he is never asked to invent one', () => {
    assert.equal(contentKeyFor('Barbell Bent Over Row'), 'barbell-bent-over-row');
    assert.equal(contentKeyFor('  Incline Push Up  '), 'incline-push-up');
  });

  it('reads a whole number and hands anything else on unchanged, so the record refuses it', () => {
    assert.equal(wholeNumber(' 12 '), 12);
    assert.equal(wholeNumber('0'), 0);
    // The two coercions that would put a value into the record he never entered.
    assert.equal(wholeNumber(''), '', 'an empty box was silently turned into a number');
    assert.equal(wholeNumber('12kg'), '12kg', 'a weight was silently truncated to a number');
  });

  it('round-trips a shipped exercise through the form without changing it', () => {
    for (let index = 0; index < EXERCISES.length; index += 1) {
      const original = shippedContent(index);
      const rebuilt = exerciseContent(shippedDraft(index), LEVELS, original.id as string);

      // Provenance is deliberately absent from what the form builds — the core puts it on.
      const { provenance, ...expected } = original;
      assert.equal(typeof provenance, 'string');
      assert.deepEqual(
        rebuilt,
        expected,
        `${String(original.id)} does not survive being opened in the editor and saved unchanged`,
      );
    }
  });

  it('keeps an existing key when he corrects the spelling of a name', () => {
    const draft = { ...shippedDraft(), name: 'Incline Push Ups' };
    const content = exerciseContent(draft, LEVELS, 'incline-push-up');

    assert.equal(content.id, 'incline-push-up',
      'renaming an exercise re-keyed it, which breaks every routine pointing at it');
    assert.equal(content.name, 'Incline Push Ups');
  });

  it('omits an unanswered longer name rather than writing an empty one', () => {
    const content = exerciseContent({ ...shippedDraft(), longName: '   ' }, LEVELS, 'k');
    assert.ok(!('long_name' in content), 'a question he declined was recorded as an empty answer');
  });

  it('puts the figure under the field the measurement decides, and never under both', () => {
    const timed = exerciseContent({ ...shippedDraft(), measurement: 'time' }, LEVELS, 'k');
    const point = timed.default_prescription as Record<string, unknown>;
    assert.ok('duration_seconds' in point);
    assert.ok(!('repetitions' in point));

    const counted = exerciseContent({ ...shippedDraft(), measurement: 'repetitions' }, LEVELS, 'k');
    const other = counted.default_prescription as Record<string, unknown>;
    assert.ok('repetitions' in other);
    assert.ok(!('duration_seconds' in other));
  });

  it('carries no provenance of its own, because the core owns that rule', () => {
    const content = exerciseContent(shippedDraft(), LEVELS, null);
    assert.ok(!('provenance' in content), 'the form assigned a provenance, which is the core’s to decide');
  });
});

describe('refusals, in the record’s own words', () => {
  it('labels a field from the path the record named it by, however deep', () => {
    assert.equal(fieldLabel('content.name'), FIELD_LABELS.name);
    assert.equal(fieldLabel('content.coaching_cue'), FIELD_LABELS.coachingCue);
    // A deep path keeps its remainder rather than collapsing to the head, or a refusal about the
    // high point's rest reads as a refusal about all three.
    const deep = fieldLabel('content.scaling.high.rest_seconds');
    assert.ok(deep.includes('high'), 'a deep path lost which point it was about');
    assert.ok(deep.includes('rest_seconds'), 'a deep path lost which field it was about');
  });

  it('shows a path it has no word for IN FULL rather than swallowing it', () => {
    assert.equal(fieldLabel('content.something_new'), 'content.something_new');
  });

  it('carries the record’s sentence through unchanged and keeps the code beside it', () => {
    const report = describeExerciseRefusal({
      issues: [{ path: 'content.name', code: 'FORMAT', message: 'The app reads this aloud.' }],
    });

    assert.equal(report.fields.length, 1);
    assert.equal(report.fields[0].message, 'The app reads this aloud.',
      'the record’s own sentence was reworded');
    assert.equal(report.fields[0].code, 'FORMAT');
    assert.equal(report.verbatim, null);
  });

  it('shows the failure’s own text when it was not a validation refusal', () => {
    const report = describeExerciseRefusal(new RangeError('the device is out of room'));
    assert.deepEqual(report.fields, []);
    assert.ok(report.verbatim?.includes('the device is out of room'));
  });
});

describe('what a removal asks', () => {
  it('asks a plain question when nothing is using it, and names what it destroys', () => {
    const confirmation = describeRemoval(summaryOf(EXERCISES[0] as ExerciseRecord['content']), []);

    assert.equal(confirmation.allowed, true);
    assert.ok(confirmation.confirmLabel.includes(EXERCISES[0].name),
      'the confirming control does not say which exercise it removes');
    assert.ok(confirmation.title.includes(EXERCISES[0].name));
  });

  it('will not offer to remove one a routine is still using, and names the routines', () => {
    const confirmation = describeRemoval(
      summaryOf(EXERCISES[0] as ExerciseRecord['content']),
      ['Legs Strength', 'Full Body Conditioning'],
    );

    assert.equal(confirmation.allowed, false,
      'removing an exercise a routine names would leave that routine pointing at nothing');
    assert.deepEqual([...confirmation.usedBy], ['Legs Strength', 'Full Body Conditioning']);
    assert.ok(confirmation.whatWillHappen.length > 0);
    assert.equal(confirmation.confirmLabel, '',
      'a state with nothing to confirm still offers a confirming label, which is a button waiting '
      + 'to be drawn for an act the app has already decided against');
  });

  /*
   * FOUND BY LOOKING AT THE RENDERED SCREEN, not by a property check. With one routine using it,
   * the sentence read "while this routine still ask for it. Take it out of them first" — the noun
   * was branched on the number and the two verbs after it were not. Every other assertion passed.
   */
  it('agrees with itself in both numbers, all the way through the sentence', () => {
    const exercise = summaryOf(EXERCISES[0] as ExerciseRecord['content']);
    const one = describeRemoval(exercise, ['Legs Strength']).whatWillHappen;
    const many = describeRemoval(exercise, ['Legs Strength', 'Push Day']).whatWillHappen;

    assert.ok(/\basks\b/u.test(one), `a single routine is described with a plural verb: ${one}`);
    assert.ok(!/\bthem\b/u.test(one), `a single routine is referred to as "them": ${one}`);

    assert.ok(/\bask\b/u.test(many), `several routines are described with a singular verb: ${many}`);
    assert.ok(!/\bthat routine\b/u.test(many), `several routines are referred to as one: ${many}`);
  });

  it('says something different about his own exercise than about a shipped one', () => {
    const shipped = summaryOf(EXERCISES[0] as ExerciseRecord['content']);
    const his = summaryOf({ ...EXERCISES[0], provenance: COACH_PROVENANCE } as ExerciseRecord['content']);

    assert.notEqual(
      describeRemoval(shipped, []).whatWillHappen,
      describeRemoval(his, []).whatWillHappen,
      'a coach told the same thing about a shipped exercise and one of his own cannot tell whether '
      + 'the admin reset would bring it back',
    );
  });

  it('says what happened afterwards, with its name', () => {
    assert.ok(removedWords('Incline Push Up').includes('Incline Push Up'));
    assert.ok(savedWords('Incline Push Up', true).includes('Incline Push Up'));
    assert.notEqual(savedWords('X', true), savedWords('X', false),
      'adding and changing are reported with the same sentence');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Against a real store
// ═══════════════════════════════════════════════════════════════════════════════

describe('adding, changing and removing an exercise, against a real store', () => {
  it('an exercise he adds is HIS, and the admin reset must leave it alone', async () => {
    const store = await aRealStore();
    const draft = { ...shippedDraft(), name: 'Coach Invented Movement' };

    const created = await addExercise(store, exerciseContent(draft, LEVELS, null));

    assert.equal(created.content.provenance, COACH_PROVENANCE,
      'an exercise the coach created is not marked as his, so a reset would revert his own work');

    // Read back off the store rather than trusting what the write returned.
    const page = await readLibraryPage(store, FIRST_PAGE);
    const found = page.items.find((item) => item.content.id === 'coach-invented-movement');
    assert.ok(found !== undefined, 'an exercise he just added is not in the library when he looks');
    assert.equal(found.content.provenance, COACH_PROVENANCE);
  });

  it('a SHIPPED exercise he changes becomes shipped-edited, which is what makes reset possible', async () => {
    const store = await aRealStore();
    // Seeded exactly as the importer would: shipped content, shipped provenance.
    const seeded = await store.create('exercise', shippedContent());
    assert.equal(seeded.content.provenance, SEED_PROVENANCE, 'the fixture is not a shipped record');

    const draft = { ...shippedDraft(), coachingCue: 'Chest to the bench edge, and pause at the bottom.' };
    const saved = await saveExercise(
      store, seeded.record_id, exerciseContent(draft, LEVELS, seeded.content.id), seeded.rev,
    );

    assert.equal(saved.content.provenance, EDITED_PROVENANCE,
      'a shipped exercise he edited still claims to be untouched, so the next reset would silently '
      + 'revert work he was never warned about');
    assert.equal(saved.content.coaching_cue, 'Chest to the bench edge, and pause at the bottom.');

    // AND HIS OWN STAYS HIS through a second edit. Two edits must not walk a coach-created record
    // into the shipped family, which would hand it to the reset.
    const mine = await addExercise(store, exerciseContent(
      { ...shippedDraft(), name: 'Another Coach Movement' }, LEVELS, null,
    ));
    const editedAgain = await saveExercise(
      store, mine.record_id,
      exerciseContent({ ...shippedDraft(), name: 'Another Coach Movement', defaultRest: '50' },
        LEVELS, mine.content.id),
      mine.rev,
    );
    assert.equal(editedAgain.content.provenance, COACH_PROVENANCE,
      'editing his own exercise handed it to the reset');
  });

  it('removes an exercise, and it is gone from the library when he looks', async () => {
    const store = await aRealStore();
    const created = await addExercise(store, exerciseContent(
      { ...shippedDraft(), name: 'Movement To Be Removed' }, LEVELS, null,
    ));

    await removeExercise(store, created.record_id, created.rev);

    const page = await readLibraryPage(store, FIRST_PAGE);
    assert.equal(
      page.items.some((item) => item.record_id === created.record_id),
      false,
      'a removed exercise is still on the library list',
    );
  });

  it('finds every routine still using an exercise, across more than one page', async () => {
    const store = await aRealStore();
    for (const routine of ROUTINES) {
      // eslint-disable-next-line no-await-in-loop
      await store.create('routine', JSON.parse(JSON.stringify(routine)));
    }

    const used = ROUTINES[0].entries[0].exercise_id as string;
    const using = await routinesUsing(store, used);
    assert.ok(using.length > 0, `nothing was found using ${used}, which the shipped week names`);

    // NON-VACUITY, and it is what makes the answer above mean anything: the same walk over a key
    // nothing names must come back empty. A walk that returned every routine would pass the first
    // assertion and block every removal in the application.
    assert.deepEqual(
      await routinesUsing(store, 'a-key-no-routine-has-ever-named'),
      [],
      'the walk reports a routine using an exercise that does not exist, so it matches everything',
    );

    // AND IT WALKS PAST THE FIRST PAGE. The shipped week is larger than one page only if the page
    // limit is smaller than it, so this asserts the property directly: an exercise named ONLY by the
    // last routine must still be found.
    const last = ROUTINES[ROUTINES.length - 1];
    const lastKeys = new Set(last.entries.map((entry: { exercise_id: string }) => entry.exercise_id));
    for (const routine of ROUTINES.slice(0, -1)) {
      for (const entry of routine.entries) lastKeys.delete(entry.exercise_id);
    }
    const onlyInTheLast = [...lastKeys][0];
    if (onlyInTheLast !== undefined) {
      const found = await routinesUsing(store, onlyInTheLast);
      assert.deepEqual(found, [last.name],
        `${onlyInTheLast} is named only by the last routine and the walk stopped short of it`);
    }
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEARCHING THE LIBRARY, OVER A FIXTURE LARGER THAN ONE PAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THE FIXTURE SIZE IS THE WHOLE TEST. A fixture the size of one page makes page-scoped and
 * collection-scoped filtering INDISTINGUISHABLE — which is exactly why `matchesSearch`'s own unit
 * tests were green while the screen told a coach with a hundred exercises that the one he was
 * looking at did not exist. Every fixture below is deliberately LARGER than `LIBRARY_PAGE_LIMIT`,
 * with the target sitting past the first page, and the test asserts that placement rather than
 * assuming it.
 *
 * WHAT THE DEFECT ACTUALLY COST, and why this is not a cosmetic filter bug: the search said the
 * record was ABSENT and the uniqueness guard then REFUSED to let him create it because it was
 * PRESENT. Two contradictory statements from one screen, neither component reporting a fault.
 */
describe('searching the library, over a fixture larger than one page', () => {
  /** How many ordinary exercises the fixture holds before the target is added. */
  const FILLERS = LIBRARY_PAGE_LIMIT * 2 + 10;

  /**
   * A library BIGGER THAN A PAGE with one exercise that sorts past the first page.
   *
   * The store pages on the content key, which is the slugged name, so the filler names are
   * zero-padded and the target is named to sort after all of them. Its placement is ASSERTED below
   * rather than trusted — a target that happened to land on page one would make every assertion here
   * pass against the defect.
   */
  async function aLibraryLargerThanAPage(): Promise<{ store: Awaited<ReturnType<typeof aRealStore>> }> {
    const store = await aRealStore();

    for (let index = 0; index < FILLERS; index += 1) {
      // LETTERS, because the record refuses digits in a name it reads aloud — and letters in
      // ascending pairs so the content keys they slug into sort in a known order.
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      // Capitalised, never upper-cased: the record reads a name aloud and refuses an all-capitals
      // word as an abbreviation, which "AA" is and "Aa" is not.
      const name = `Filler Movement ${
        letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`;
      // eslint-disable-next-line no-await-in-loop -- content keys must not race for uniqueness.
      await addExercise(store, exerciseContent({ ...shippedDraft(), name }, LEVELS, null));
    }
    await addExercise(store, exerciseContent(
      { ...shippedDraft(), name: 'Zzz Off Page Sled Push' }, LEVELS, null,
    ));

    return { store };
  }

  it('finds an exercise that sorts PAST the first page, and still finds nothing for a term the whole library lacks', async () => {
    const { store } = await aLibraryLargerThanAPage();

    // THE FIXTURE IS THE INSTRUMENT, so it is checked first. If the target were on page one this
    // test would be green before the fix and after it, and would look like coverage.
    const first = await readLibraryPage(store, FIRST_PAGE);
    assert.equal(first.items.length, LIBRARY_PAGE_LIMIT,
      'the fixture is not larger than a page, so it cannot tell page-scoped filtering from '
      + 'collection-scoped filtering');
    assert.equal(
      first.items.some((item) => item.content.name === 'Zzz Off Page Sled Push'),
      false,
      'the target sits ON the first page, so finding it proves nothing about searching the library',
    );

    // THE FINDING DIRECTION: it is off the page, and the search finds it anyway.
    const found = await readLibraryReadout(store, 'Off Page Sled');
    assert.deepEqual(
      found.page.items.map((item) => item.content.name),
      ['Zzz Off Page Sled Push'],
      'an exercise past the first page is reported as absent by a search bound to page one — the '
      + 'defect where the screen says it does not exist and the uniqueness guard refuses to let him '
      + 'create it',
    );

    // THE ABSENCE DIRECTION, IN THE SAME RUN. Without it, a filter that returned EVERYTHING would
    // satisfy the assertion above and look exactly like a working search.
    const absent = await readLibraryReadout(store, 'Kayak Ergometer Sprint');
    assert.deepEqual(absent.page.items.map((item) => item.content.name), [],
      'a term nothing in the library matches came back with results, so the filter matches '
      + 'everything and the assertion above proves nothing');
  });

  it('counts the LIBRARY, not the page, and reports a search as a match count rather than a total', async () => {
    const { store } = await aLibraryLargerThanAPage();
    const held = FILLERS + 1;

    const resting = await readLibraryReadout(store, '');
    assert.equal(resting.total, held, 'the total counts something other than the library');
    assert.equal(resting.page.items.length, LIBRARY_PAGE_LIMIT,
      'the unfiltered list stopped paging, which is a change to paging rather than to the count');
    assert.equal(resting.page.done, false, 'the unfiltered list claims to be the whole library');

    const intro = describeLibrary({
      page: resting.page, search: '', total: resting.total,
    }).intro;
    assert.ok(intro.includes(`${held} exercises in your library`),
      `the counting sentence states the page size as a library total: ${intro}`);
    assert.ok(!intro.includes(`${LIBRARY_PAGE_LIMIT} exercises in your library`),
      `the counting sentence still states the page size as a library total: ${intro}`);

    // AND THE TRAP ON THE OTHER SIDE: with a search active the sentence must NOT report the match
    // count as a library total — that is the same defect wearing a new hat.
    const searching = await readLibraryReadout(store, 'Off Page Sled');
    const searchIntro = describeLibrary({
      page: searching.page, search: 'Off Page Sled', total: searching.total,
    }).intro;
    assert.ok(searchIntro.includes('1 exercise matches "Off Page Sled"'),
      `a search does not say how many matched: ${searchIntro}`);
    assert.ok(!/in your library/u.test(searchIntro),
      `a search states its subset as a library total: ${searchIntro}`);
  });

  it('leaves the unfiltered list paging exactly as it did, and does not page a search result', async () => {
    const { store } = await aLibraryLargerThanAPage();

    // "Show more" is untouched: the unfiltered first page carries a cursor and appending the next
    // page reaches records the first one did not hold.
    const resting = await readLibraryReadout(store, '');
    assert.ok(resting.page.cursor !== null, 'the unfiltered list lost its cursor, so "show more" is gone');
    const second = await readLibraryPage(store, { search: '', after: resting.page.cursor });
    const joined = appendPage(resting.page, second);
    assert.equal(joined.items.length, LIBRARY_PAGE_LIMIT * 2, 'the second page did not append');

    // A SEARCH RESULT IS NOT PAGED: it is every match, so there is nothing left to show more of.
    // Stated as a bound rather than a claim that the library cannot outgrow it — the walk stops at
    // the house walker's page bound, and a walk that stopped short fails rather than returning short.
    const searching = await readLibraryReadout(store, 'Filler Movement');
    assert.equal(searching.page.items.length, FILLERS,
      'a search returned a page of matches rather than every match in the library');
    assert.equal(searching.page.done, true);
    assert.equal(searching.page.cursor, null,
      'a search result offers "show more" over a result that is already complete');
  });
});

describe('THE CONTENT CONTRACT, proven in both directions', () => {
  /*
   * A harder intensity point asks for MORE WORK and LESS REST, never more load. The rule belongs to
   * `core/model/entities/exercise.js` — `checkScaling`, R6 — and the editor composes with it rather
   * than carrying a second copy. What is proven here is that the composition actually holds: that a
   * violating ladder is CAUGHT on the editor's own path, that the coach is told which point offends
   * in the record's words, and — the loosening direction — that a valid ladder says nothing at all.
   *
   * ## WHAT CHANGED ON 2026-07-31, AND WHY THESE TESTS NOW ASSERT A NOTICE
   *
   * These four cases used to assert a REFUSAL on this path. The user settled that on an exercise he
   * authored or edited the contract WARNS AND SAVES: he is the certified professional, and a slip
   * gets caught while a deliberate choice is respected. The editor's own path always writes a
   * coach-authored record — `markEdited` sees to that — so a refusal here is exactly what the ruling
   * removed, and asserting one would pin the old behaviour in place.
   *
   * NOTHING WAS DROPPED. The finding is the same finding, in the same words, from the same detector:
   * what moved is its consequence. The REFUSAL still holds absolutely on SHIPPED content, and that,
   * with the save committing and the notice surviving a round trip, is proven in
   * `library-curve-contract.test.ts` — which is also where the enumeration behind the ruling lives.
   *
   * Each case is checked for the RULE THAT PRODUCED IT, not merely for being noticed. A ladder
   * noticed for the wrong reason would satisfy a "did it warn" assertion while proving nothing.
   */

  /** A draft whose one named point is changed, everything else left as it ships. */
  function withPoint(level: string, over: Partial<Record<'sets' | 'amount' | 'rest', string>>): ExerciseDraft {
    const base = shippedDraft();
    return { ...base, scaling: { ...base.scaling, [level]: { ...base.scaling[level], ...over } } };
  }

  /**
   * WHAT THE CONTRACT SAID ABOUT A LADDER SAVED THROUGH THE EDITOR'S OWN PATH.
   *
   * The save is expected to COMMIT — that is the ruling — so a refusal here is a failure and is
   * reported as one, in the record's own words rather than as a bare rejection.
   */
  async function noticeFor(draft: ExerciseDraft): Promise<ContractNotice> {
    const store = await aRealStore();
    let saved;
    try {
      saved = await addExercise(
        store, exerciseContent({ ...draft, name: 'Contract Probe Movement' }, LEVELS, null),
      );
    } catch (error: unknown) {
      assert.fail('his own exercise was REFUSED rather than noticed, which is the behaviour the '
        + `user's ruling of 2026-07-31 removed: ${
          describeExerciseRefusal(error).fields.map((f) => f.message).join(' | ')}`);
    }

    const notice = describeContractNotice(saved.content);
    assert.ok(notice !== null,
      'a ladder that breaks the contract saved with NOTHING said about it. A check that stops being '
      + 'shown is worse than one that refuses, because it looks like approval');
    return notice;
  }

  it('ACCEPTS a genuinely valid curve — without this, every case below proves nothing', async () => {
    const store = await aRealStore();
    const created = await addExercise(store, exerciseContent(
      { ...shippedDraft(), name: 'Valid Curve Movement' }, LEVELS, null,
    ));
    assert.equal(created.content.id, 'valid-curve-movement',
      'a shipped curve, which is valid by construction, was refused — the guard refuses everything');
  });

  it('NOTICES a harder point that RESTS LONGER, names it, and lets him save — in the record’s own words', async () => {
    // The high point rests longer than the medium one. Nothing else is touched.
    const notice = await noticeFor(withPoint('high', { rest: '600' }));

    assert.ok(
      notice.points.some((point) => /rest/iu.test(point.message)),
      'nothing the coach is shown mentions rest, so he cannot tell what to change',
    );
    assert.ok(
      notice.points.some((point) => point.label === 'High'),
      `the notice does not name the point that offends: ${notice.points.map((p) => p.label).join(', ')}`,
    );
  });

  /*
   * THE REST RULE'S SENTENCE MUST NAME ITS POINT, exactly as the work rule's already does.
   *
   * The work rule says "The high point must ask for strictly more work than the low point"; the rest
   * rule said "Rest must not rise as intensity rises — a harder point means less rest, never more",
   * which states the rule and leaves the coach to work out WHICH point breaks it. This contract WARNS
   * AND STILL SAVES, so that sentence is the whole of what he has to decide on, and a warning he must
   * diagnose is one he will dismiss.
   *
   * THE DETECTOR ALWAYS KNEW: the finding is raised at the offending level and always was. Only the
   * sentence was silent, which is why this is a wording change over a detector that already has the
   * answer rather than a change to what is caught.
   *
   * BOTH POINTS ARE ASSERTED IN BOTH POSITIONS, and the medium case is the one that discriminates: a
   * sentence that simply hardcoded "high" would satisfy the high case and be wrong every other time.
   */
  it('names WHICH point breaks the rest rule, and it is not always the same point', async () => {
    const restRule = (notice: ContractNotice) => {
      const found = notice.points.find((point) => /less rest, never more/u.test(point.message));
      assert.ok(found !== undefined,
        `the rest rule's own sentence is not among what he is shown: ${
          notice.points.map((p) => `${p.label}: ${p.message}`).join(' | ')}`);
      return found.message;
    };

    // HIGH rests longer than medium. The sentence must name high, and the point it is measured
    // against, and it must still be the rest rule's own sentence rather than a new one.
    const high = restRule(await noticeFor(withPoint('high', { rest: '600' })));
    assert.ok(high.includes('The high point') && high.includes('than the medium point'),
      `the rest rule does not name the point that breaks it or the one it is compared against: ${high}`);

    // MEDIUM rests longer than low, and high is brought below medium so that medium is the FIRST
    // level that breaks the rule. A sentence naming a fixed point passes above and fails here.
    const base = shippedDraft();
    const notice = await noticeFor({
      ...base,
      scaling: {
        ...base.scaling,
        medium: { ...base.scaling.medium, rest: '600' },
        high: { ...base.scaling.high, rest: '599' },
      },
    });
    const medium = restRule(notice);
    assert.ok(medium.includes('The medium point') && medium.includes('than the low point'),
      `the rest rule names the wrong point when medium is the one that breaks it: ${medium}`);
    assert.ok(!/The high point/u.test(medium),
      `the rest rule names high whatever actually broke it: ${medium}`);
  });

  it('NOTICES a harder point that asks for LESS WORK', async () => {
    const notice = await noticeFor(withPoint('high', { amount: '1' }));

    assert.ok(
      notice.points.some((point) => /work/iu.test(point.message)),
      'nothing the coach is shown mentions the work asked for',
    );
  });

  it('NOTICES a harder point with FEWER SETS', async () => {
    const notice = await noticeFor(withPoint('high', { sets: '1' }));
    assert.ok(
      notice.points.some((point) => /sets/iu.test(point.message)),
      `sets falling as intensity rises was not noticed by the ordering rule: ${
        notice.points.map((p) => `${p.label} ${p.message}`).join(' | ')}`,
    );
  });

  it('NOTICES three points that are not genuinely different', async () => {
    const base = shippedDraft();
    const flat = { ...base.scaling.low };
    const notice = await noticeFor({
      ...base,
      scaling: Object.fromEntries(LEVELS.map((level) => [level, flat])),
    });
    assert.ok(
      notice.points.some((point) => /genuinely different/iu.test(point.message)),
      `a flat ladder was noticed for some other reason: ${
        notice.points.map((p) => p.message).join(' | ')}`,
    );
  });

  it('SAYS NOTHING about a ladder that obeys the contract — the loosening direction', async () => {
    // Without this, a notice raised about everything would satisfy all four cases above while
    // telling the coach nothing at all.
    const store = await aRealStore();
    const saved = await addExercise(store, exerciseContent(
      { ...shippedDraft(), name: 'Quiet Ladder Movement' }, LEVELS, null,
    ));
    assert.equal(describeContractNotice(saved.content), null,
      'a shipped ladder, which obeys the contract by construction, was noticed — the notice fires '
      + 'whatever it is given, so it says nothing about the ladder it is attached to');
  });

  it('refuses a WEIGHT typed into a figure box, which is the shape a coach reaching for load produces', async () => {
    const store = await aRealStore();
    const draft = { ...shippedDraft(), name: 'Loaded Probe Movement', defaultRest: '40kg' };

    await assert.rejects(
      () => addExercise(store, exerciseContent(draft, LEVELS, null)),
      'a weight typed into a figure box was accepted',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scans over the shipped source
// ═══════════════════════════════════════════════════════════════════════════════

/** What a shipped interface source looks like. Tests are excluded. */
function isShippedSource(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  return ['.ts', '.tsx'].some((suffix) => name.endsWith(suffix));
}

/**
 * THE SCREEN FILE FOR THE ROUTINES DESTINATION, DERIVED THE WAY THE SHELL DERIVES IT.
 *
 * `shell/no-dead-ends.test.ts` decides whether a destination has a screen by looking for
 * `<Path>Screen.tsx` on disk, so that convention is not this file's to reinterpret — it is the one
 * the application is actually held to, and a screen named anything else reads to the shell as a
 * destination nobody built. It is computed from the destination rather than typed here for the
 * usual reason: a typed name is a promise somebody has to remember to keep.
 */
async function routinesScreenFile(): Promise<string> {
  const { DESTINATIONS } = await import('../shell/navigation.ts');
  const routines = DESTINATIONS.find((destination) => destination.glyph === 'nav-routines');
  assert.ok(routines !== undefined, 'the navigation surface no longer carries a Routines destination');
  return `${routines.path.charAt(0).toUpperCase()}${routines.path.slice(1)}Screen.tsx`;
}

/**
 * EVERY SHIPPED FILE OF THE LIBRARY DIRECTION, DISCOVERED RATHER THAN LISTED.
 *
 * A guard carrying a hand-written list of the files it covers is a promise somebody has to remember
 * to keep, and this build has watched that promise break four times. Two rules find the direction,
 * and NEITHER is a typed file name: a file whose name begins with `library`, and the screen the
 * routines destination resolves to under the shell's own naming convention. The second matters
 * because the drawing is where an emoji would actually reach the coach, and it is the one file of
 * this direction that cannot be named for it. The caller asserts what the walk FOUND before
 * asserting anything about it.
 */
async function libraryDirectionSources(): Promise<string[]> {
  const screen = await routinesScreenFile();
  const entries = await readdir(here, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isShippedSource(entry.name))
    .filter((entry) => entry.name.toLowerCase().startsWith('library') || entry.name === screen)
    .map((entry) => path.join(here, entry.name));
}

/** The file with its comments removed. A word in a comment is not a string the coach ever sees. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Anything outside the Basic Multilingual Plane, plus the pictographic and dingbat blocks inside it.
 *
 * That is what "no emoji" has to mean mechanically. It is broader than emoji on purpose — a
 * decorative arrow or a bullet character is the same failure, since the design layer's own marks are
 * the one way a symbol reaches this application.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/u;

describe('the library direction, scanned', () => {
  it('finds the whole direction rather than the files this guard was written beside', async () => {
    // NON-VACUITY, and it is what makes the two assertions after it mean anything.
    const found = (await libraryDirectionSources()).map((file) => path.basename(file));

    assert.ok(
      found.length >= 3,
      `the walk found ${String(found.length)} files of the library direction, which is fewer than it `
      + 'has. It is covering almost nothing and would report a pass for the rest.',
    );
    for (const expected of ['library-editor.ts', 'library-editor-source.ts', await routinesScreenFile()]) {
      assert.ok(found.includes(expected), `the walk did not reach ${expected}`);
    }
  });

  it('the emoji scan finds one where one demonstrably is, which is what makes an absence mean anything', () => {
    // THE POSITIVE CONTROL. Without it, "no library source carries an emoji" and "the matcher is
    // broken and matches nothing" are the same green tick.
    assert.ok(EMOJI.test('a string with \u{1F600} in it'), 'the emoji matcher cannot find an emoji');
    assert.ok(EMOJI.test('an arrow \u{2192} is a symbol too'), 'the matcher misses symbol characters');
    assert.ok(!EMOJI.test('Incline Push Up, 3 sets of 12 repetitions.'),
      'the matcher flags ordinary prose, so its silence elsewhere means nothing');
  });

  it('carries no emoji in anything the coach can see', async () => {
    const offenders: string[] = [];

    for (const file of await libraryDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      if (EMOJI.test(code)) offenders.push(path.relative(applicationRoot, file));
    }

    assert.deepEqual(offenders, [],
      'these library sources carry an emoji or a symbol character. Marks reach this application '
      + 'through the design layer’s glyphs and through nothing else.');
  });

  it('assigns no provenance of its own, because the core owns that rule', async () => {
    // ABSENCE-SHAPED, so it carries its control: the same scan over `core/seed/provenance.js`, which
    // is where the values legitimately live, must flag it.
    const owner = codeOnly(await readFile(
      path.join(applicationRoot, 'core', 'seed', 'provenance.js'), 'utf8',
    ));
    const literal = /'(shipped-untouched|shipped-edited|coach-created)'/u;
    assert.ok(literal.test(owner),
      'the scan cannot find a provenance value where the module that declares them demonstrably is');

    for (const file of await libraryDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      const mentions = code.match(new RegExp(literal.source, 'gu')) ?? [];
      // `library-editor.ts` maps the three values to sentences, which is a lookup FROM a value and
      // cannot invent a fourth state. What is forbidden is WRITING one into a record.
      assert.ok(
        !/provenance\s*[:=]\s*'/u.test(code),
        `${path.basename(file)} writes a provenance string. Call the core’s markEdited instead: a `
        + 'screen that assigns one leaves a record claiming to be untouched while showing his '
        + `changes. (${mentions.length} literal mention(s) found.)`,
      );
    }
  });

  it('the library screen actually calls its wiring rather than holding it as an unused import', async () => {
    const file = await routinesScreenFile();
    const screen = codeOnly(await readFile(path.join(here, file), 'utf8'));

    for (const named of ['addExercise', 'saveExercise', 'removeExercise', 'routinesUsing', 'describeLibrary']) {
      // Twice: once where it is imported and once where it is used. An import alone is a screen that
      // draws no editor, and `noUnusedLocals` is satisfied by a single mention in a type annotation.
      const mentions = screen.split(named).length - 1;
      assert.ok(mentions >= 2,
        `${file} names ${named} ${String(mentions)} time(s). The wiring is imported and not `
        + 'drawn, so the coach has no way to do the thing this screen exists for.');
    }

    // NON-VACUITY: the same scan over a screen that legitimately has none of this must find nothing.
    const elsewhere = codeOnly(await readFile(path.join(here, 'PlaceholderScreen.tsx'), 'utf8'));
    assert.ok(!elsewhere.includes('addExercise'), 'the scan matches files that do not call the wiring');
  });
});

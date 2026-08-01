/**
 * THE ROUTINE HALF OF THE LIBRARY EDITOR, AND THE CURVES — their words, their wiring and their writes.
 *
 * A sibling of `library-editor.test.ts` rather than an extension of it, because it covers two
 * further record kinds and the first file is already the exercise half in full. Nothing here is a
 * stub of the store: every write test opens the core's own in-process database, through the real
 * schema, so each claim is proven by CONSEQUENCE rather than by reading the code meant to do it.
 *
 *   ONE — A ROUTINE HE ADDS IS HIS, and a shipped one he edits is marked as edited, read back off
 *   the store. Same for a curve. That is the fact the admin reset is built against.
 *
 *   TWO — THE SECOND VALIDATOR RUNS. A routine's entry naming an exercise that does not exist, or
 *   overriding a repetition count on an exercise counted in time, is refused with the CORE's own
 *   issue before anything is written — the check `store.create` structurally cannot run.
 *
 *   THREE — THE CONTENT CONTRACT, AND WHAT IT MEANS FOR A CURVE. It is proven to ACCEPT first and
 *   only then to refuse, and every refusal is checked for the RULE that produced it rather than for
 *   merely being red. For the pattern record the finding is stated and PROVEN rather than asserted:
 *   the record carries no work, rest or load field at all, so there is nothing for such a rule to
 *   check, and the levels it may name are exactly the levels `checkScaling` orders on the exercise.
 *
 *   FOUR — DELETING WORKS, and it will not leave a session pointing at a routine that is not there.
 *   The walk that answers that spans MORE THAN ONE PAGE, derived from the page size rather than from
 *   a count typed beside it.
 *
 * The scans at the end are absence-shaped, so each carries a POSITIVE CONTROL in the same run.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/screens/library-routines.test.ts
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { openLocalStore, libraryPage } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { EXERCISES, INTENSITY_PATTERNS, ROUTINES } from '../../core/seed/content.js';
import { COACH_PROVENANCE, EDITED_PROVENANCE, SEED_PROVENANCE } from '../../core/seed/provenance.js';
import {
  BODY_REGIONS, EQUIPMENT, INTENSITY_LEVELS, INTENSITY_PATTERN_FIELDS, MAPPING_RULES, MEASUREMENTS,
  MOVEMENT_PATTERNS, MUSCLE_GROUPS, REFERENTIAL_DIRECTION, ROUTINE_FIELDS, ROUTINE_FOCUS,
} from '../../core/model/model.js';
import { ACRONYM_VALUES, vocabularyWords } from './library-editor';
import {
  SCALING_LIVES_ON_THE_EXERCISE, addEntry, describeRoutine, describeRoutineRefusal,
  describeRoutineRemoval, describeRoutines, draftFromRoutine, emptyRoutineDraft,
  entryPrescriptionWords, exerciseChoices, exerciseCountWords, exerciseGoneWords, isInherited,
  moveEntry, removeEntry, replaceEntry, routineContent, routineFieldLabel, routineKeyFor,
  routineRemovedWords, routineSavedWords, splitDayWords,
} from './library-routines';
import type {
  ExerciseChoices, RoutineDraft, RoutineRecord, RoutineSummary,
} from './library-routines';
import {
  ROUTINE_PAGE_LIMIT, SESSION_PAGE_LIMIT, addRoutine, appendRoutinePage, readExerciseByKey,
  readExerciseChoices, readRoutinePage, readRoutineReadout, removeRoutine, saveRoutine, sessionWords,
  sessionsUsing,
} from './library-routines-source';
import {
  addPoint, describePattern, describePatternRefusal, describePatternRemoval, describePatterns,
  draftCurveWords, draftFromPattern, emptyPatternDraft, mappingWords, movePoint, patternContent,
  patternFieldLabel, patternKeyFor, pointCountWords, removePoint,
} from './library-patterns';
import type { PatternRecord } from './library-patterns';
import {
  PATTERN_PAGE_LIMIT, addPattern, appendPatternPage, countPatterns, readPatternPage,
  readPatternReadout, removePattern, savePattern,
} from './library-patterns-source';
import { toggleFor } from './intensity';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');

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

/** A deep copy of one shipped record, so a test that mutates cannot poison the shipped array. */
function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * THE CHOICES BUILT FROM THE SHIPPED CATALOGUE rather than from a fixture.
 *
 * A hand-written fixture drifts from the schema and the suite starts proving that the editor agrees
 * with the fixture. This is the real thing the coach's library is seeded with.
 */
function shippedChoices(): ExerciseChoices {
  return exerciseChoices(EXERCISES as Record<string, unknown>[], true);
}

/** One shipped routine as a record envelope, without needing a store. */
function shippedRoutineRecord(index = 0, recordId = 'r1', rev = 3): RoutineRecord {
  return { record_id: recordId, rev, content: copyOf(ROUTINES[index]) } as RoutineRecord;
}

/** One shipped curve as a record envelope. */
function shippedPatternRecord(index = 0, recordId = 'p1', rev = 2): PatternRecord {
  return { record_id: recordId, rev, content: copyOf(INTENSITY_PATTERNS[index]) } as PatternRecord;
}

/** A summary without a store, for the pure-derivation tests. */
function summaryOf(index = 0): RoutineSummary {
  return describeRoutine(shippedRoutineRecord(index), shippedChoices());
}

/** A draft the record genuinely accepts, built from a SHIPPED routine by the form's own function. */
function shippedDraft(index = 0): RoutineDraft {
  return draftFromRoutine(shippedRoutineRecord(index));
}

/** Seed one shipped exercise into a real store, so a routine may name it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedExercises(store: any, count = 12): Promise<void> {
  for (const exercise of (EXERCISES as Record<string, unknown>[]).slice(0, count)) {
    // eslint-disable-next-line no-await-in-loop
    await store.create('exercise', copyOf(exercise));
  }
}

/** Every exercise a shipped routine names, seeded, so that routine can be written whole. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedExercisesFor(store: any, routine: Record<string, any>): Promise<void> {
  const wanted = new Set((routine.entries as { exercise_id: string }[]).map((e) => e.exercise_id));
  for (const exercise of EXERCISES as Record<string, any>[]) {
    if (!wanted.has(exercise.id as string)) continue;
    // eslint-disable-next-line no-await-in-loop
    await store.create('exercise', copyOf(exercise));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// The routine list, in words
// ═══════════════════════════════════════════════════════════════════════════════

describe('what the routine list says', () => {
  it('says where a routine sits as a POSITION in his week, never as a weekday', () => {
    assert.equal(splitDayWords(3), 'Day 3 of the week');
    // The record's own comment is explicit that this integer is not a calendar day. A weekday name
    // here would be the app claiming to own his calendar off the back of a number that never meant
    // that — so no weekday may appear in the sentence.
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      assert.doesNotMatch(
        splitDayWords(day),
        /monday|tuesday|wednesday|thursday|friday|saturday|sunday/iu,
        'the split position is being read out as a weekday',
      );
    }
  });

  it('reads an ACRONYM in the vocabulary as an acronym, and cannot rot silently', () => {
    // "Hiit" was on the routine form until the screen was read. Sentence case is right for every
    // other value and stays the rule; this is the narrow exception, and the guard is that every
    // exception must still be a value some frozen vocabulary actually holds.
    assert.equal(vocabularyWords('hiit'), 'HIIT');
    assert.equal(vocabularyWords('chest-and-shoulders'), 'Chest and shoulders',
      'the acronym exception changed how an ordinary value reads');
    assert.equal(vocabularyWords('horizontal-push'), 'Horizontal push');

    const everyValue = new Set<string>([
      ...(ROUTINE_FOCUS as string[]), ...(BODY_REGIONS as string[]),
      ...(MOVEMENT_PATTERNS as string[]), ...(MUSCLE_GROUPS as string[]),
      ...(EQUIPMENT as string[]), ...(MEASUREMENTS as string[]),
      ...(INTENSITY_LEVELS as string[]), ...(MAPPING_RULES as string[]),
    ]);
    for (const acronym of ACRONYM_VALUES) {
      assert.ok(everyValue.has(acronym),
        `"${acronym}" is spelled out as an acronym but is no longer a value any vocabulary holds`);
    }
    // NON-VACUITY: the set the guard checks against is genuinely populated, so the loop above is
    // not passing over an empty world.
    assert.ok(everyValue.size > 50, `only ${String(everyValue.size)} vocabulary values were read`);
  });

  it('counts exercises with the noun agreeing, in BOTH numbers', () => {
    assert.equal(exerciseCountWords(1), '1 exercise');
    assert.equal(exerciseCountWords(8), '8 exercises');
    assert.equal(exerciseCountWords(0), '0 exercises');
  });

  it('summarises a shipped routine with every entry NAMED off the catalogue', () => {
    const summary = summaryOf(0);
    const shipped = ROUTINES[0] as { name: string; entries: { exercise_id: string }[] };

    assert.equal(summary.name, shipped.name);
    assert.equal(summary.entries.length, shipped.entries.length);
    assert.equal(summary.size, exerciseCountWords(shipped.entries.length));

    for (const line of summary.entries) {
      assert.equal(line.missing, false, `${line.exerciseKey} was not found in the shipped catalogue`);
      assert.notEqual(line.exerciseName, line.exerciseKey,
        'the row is showing the machine key rather than what the coach calls it');
    }
    // Positions are what a person counts, from one, and the ends are marked so the screen can draw
    // no "up" on the first line and no "down" on the last.
    assert.deepEqual(summary.entries.map((line) => line.position),
      shipped.entries.map((_e, index) => index + 1));
    assert.equal(summary.entries[0].first, true);
    assert.equal(summary.entries[summary.entries.length - 1].last, true);
  });

  it('says an entry that overrides NOTHING follows the exercise, rather than drawing a blank', () => {
    const choices = shippedChoices();
    const named = choices.all[0];
    const words = entryPrescriptionWords({ exercise_id: named.contentKey }, named);

    assert.match(words, new RegExp(named.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.equal(isInherited({ exercise_id: named.contentKey }), true);
    assert.notEqual(words.trim(), '', 'an inherited entry renders as an empty cell');
  });

  it('names an override WITH ITS UNIT, and says the rest still follows the exercise', () => {
    const choices = shippedChoices();
    const named = choices.all[0];
    const words = entryPrescriptionWords(
      { exercise_id: named.contentKey, sets: 2, repetitions: 15 },
      named,
    );

    assert.match(words, /2 sets/u);
    assert.match(words, /15 repetitions/u);
    assert.match(words, /everything else as the exercise asks/u,
      'nothing says the untouched figures are inherited');
    assert.equal(isInherited({ exercise_id: named.contentKey, sets: 2 }), false);

    // THE REMAINDER, NOT THE REST PERIOD. Rendered beside an overridden rest, "and the rest as the
    // exercise asks" read as a contradiction — the sentence is about a field literally called rest.
    const withRest = entryPrescriptionWords(
      { exercise_id: named.contentKey, sets: 2, rest_seconds: 90 },
      named,
    );
    assert.match(withRest, /90 seconds rest/u);
    assert.doesNotMatch(withRest, /and the rest as/u,
      'the sentence says "the rest" where it means the remainder, next to a field called rest');
  });

  it('agrees with itself in BOTH numbers, everywhere it counts routines', () => {
    const page = (n: number) => ({
      items: Array.from({ length: n }, (_held, index) => shippedRoutineRecord(index, `r${String(index)}`)),
      cursor: null,
      done: true,
    });
    const choices = shippedChoices();

    // Rendered, a plural verb over a singular subject reads "1 routine match" — the fault the
    // exercise half shipped with, twice, and only ever found by reading the sentence.
    const one = describeRoutines({ page: page(1), search: '', choices, total: 1 });
    assert.match(one.intro, /^1 routine in your library/u);
    assert.doesNotMatch(one.intro, /1 routines|routines are/u);

    const many = describeRoutines({ page: page(3), search: '', choices, total: 3 });
    assert.match(many.intro, /^3 routines in your library/u);

    // THE SEARCHING SENTENCES TAKE THE MATCH COUNT, so the totals here are deliberately DIFFERENT
    // from the page lengths: a sentence that borrowed the total would read "40 routines match".
    const oneFound = describeRoutines({ page: page(1), search: 'legs', choices, total: 40 });
    assert.match(oneFound.intro, /^1 routine matches "legs"\.$/u);

    const manyFound = describeRoutines({ page: page(2), search: 'day', choices, total: 40 });
    assert.match(manyFound.intro, /^2 routines match "day"\.$/u);
  });

  it('an empty library is a real state and is not an error', () => {
    const empty = { items: [], cursor: null, done: true };
    const choices = shippedChoices();

    const nothing = describeRoutines({ page: empty, search: '', choices, total: 0 });
    assert.equal(nothing.empty, true);
    assert.match(nothing.intro, /no routines in your library/u);
    assert.match(nothing.intro, /Admin/u, 'he is not told where the shipped set can be brought back from');
    assert.doesNotMatch(nothing.intro, /error|failed|wrong|problem/iu);

    // Filtering to nothing is a DIFFERENT fact and must not be told as an empty library.
    const filtered = describeRoutines({ page: empty, search: 'zzz', choices, total: 40 });
    assert.match(filtered.intro, /No routine matches "zzz"/u);
    assert.doesNotMatch(filtered.intro, /no routines in your library/u);
  });

  it('carries the cursor, so a short page never claims to be the whole library', () => {
    const choices = shippedChoices();
    const report = describeRoutines({
      page: { items: [shippedRoutineRecord(0)], cursor: 'c', done: false },
      search: '',
      choices,
      total: 40,
    });
    assert.equal(report.more, true);
    assert.match(String(report.moreWords), /more routines than these/u);
  });

  it('says plainly when an entry names an exercise that is not in the library', () => {
    // The record model forbids it and the referential check refuses it, so seeing one means
    // something upstream is wrong — and a blank row would hide exactly that.
    const record = shippedRoutineRecord(0);
    const broken = {
      ...record,
      content: {
        ...record.content,
        entries: [{ exercise_id: 'no-such-exercise' }],
      },
    } as RoutineRecord;

    const line = describeRoutine(broken, shippedChoices()).entries[0];
    assert.equal(line.missing, true);
    assert.match(line.exerciseName, /no-such-exercise/u);
    assert.match(line.exerciseName, /not in your library|no exercise with this key/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The routine form
// ═══════════════════════════════════════════════════════════════════════════════

describe('the routine form', () => {
  it('fills in from the RECORD, and a round trip changes nothing', () => {
    const record = shippedRoutineRecord(0);
    const draft = draftFromRoutine(record);
    const rebuilt = routineContent(draft, shippedChoices(), record.content.id);

    // Everything but the provenance, which the form never sets and the core puts on.
    for (const field of ROUTINE_FIELDS as string[]) {
      if (field === 'provenance') continue;
      assert.deepEqual(
        rebuilt[field],
        (record.content as unknown as Record<string, unknown>)[field],
        `a round trip through the form changed ${field}`,
      );
    }
  });

  it('writes an EMPTY override box as an omitted key, never as a nought', () => {
    const choices = shippedChoices();
    const named = choices.all[0];
    const draft: RoutineDraft = {
      ...emptyRoutineDraft(),
      name: 'Probe Routine',
      splitDay: '1',
      focus: 'legs',
      bodyRegions: ['lower-body'],
      description: 'A routine used only to prove what an empty box means.',
      entries: [{ exerciseId: named.contentKey, sets: '', amount: '', rest: '' }],
    };

    const entry = (routineContent(draft, choices, null).entries as Record<string, unknown>[])[0];
    assert.deepEqual(Object.keys(entry), ['exercise_id'],
      'an empty box was written into the record, which would stop the entry following the exercise');
  });

  it('puts a figure in the field the EXERCISE decides, never in both and never by guessing', () => {
    const choices = shippedChoices();
    const byReps = choices.all.find((choice) => choice.measurement === 'repetitions');
    const byTime = choices.all.find((choice) => choice.measurement === 'time');
    assert.ok(byReps !== undefined && byTime !== undefined,
      'the shipped catalogue no longer holds one of each measurement, so this proves nothing');

    const build = (key: string) => (routineContent({
      ...emptyRoutineDraft(),
      entries: [{ exerciseId: key, sets: '3', amount: '20', rest: '60' }],
    }, choices, null).entries as Record<string, unknown>[])[0];

    const reps = build(byReps.contentKey);
    assert.equal(reps.repetitions, 20);
    assert.equal(reps.duration_seconds, undefined);

    const time = build(byTime.contentKey);
    assert.equal(time.duration_seconds, 20);
    assert.equal(time.repetitions, undefined);
  });

  it('carries a figure that is NOT a whole number through unchanged, so the record answers', () => {
    const choices = shippedChoices();
    const entry = (routineContent({
      ...emptyRoutineDraft(),
      entries: [{ exerciseId: choices.all[0].contentKey, sets: '3kg', amount: '', rest: '' }],
    }, choices, null).entries as Record<string, unknown>[])[0];

    // Coercing would put 3 into a record he never typed, and would hide the load token the
    // contract exists to refuse by name.
    assert.equal(entry.sets, '3kg');
  });

  it('keeps a routine key when he renames it, because sessions name it by that key', () => {
    const content = routineContent(
      { ...shippedDraft(0), name: 'Legs Strength Corrected' },
      shippedChoices(),
      'legs-strength',
    );
    assert.equal(content.id, 'legs-strength');
    assert.equal(content.name, 'Legs Strength Corrected');

    // A NEW routine gets a key made out of the name, and he is never asked for one.
    assert.equal(routineKeyFor('Legs Strength'), 'legs-strength');
    assert.equal(routineContent({ ...emptyRoutineDraft(), name: 'Pull Day Two' }, shippedChoices(), null).id,
      'pull-day-two');
  });
});

describe('reordering the exercises in a routine', () => {
  const choices = shippedChoices();
  const three: RoutineDraft = {
    ...emptyRoutineDraft(),
    entries: [
      { exerciseId: choices.all[0].contentKey, sets: '', amount: '', rest: '' },
      { exerciseId: choices.all[1].contentKey, sets: '', amount: '', rest: '' },
      { exerciseId: choices.all[2].contentKey, sets: '', amount: '', rest: '' },
    ],
  };
  const keys = (draft: RoutineDraft) => draft.entries.map((entry) => entry.exerciseId);

  it('moves a line up and down, keeping every other line', () => {
    assert.deepEqual(keys(moveEntry(three, 2, -1)),
      [keys(three)[0], keys(three)[2], keys(three)[1]]);
    assert.deepEqual(keys(moveEntry(three, 0, 1)),
      [keys(three)[1], keys(three)[0], keys(three)[2]]);
    assert.equal(moveEntry(three, 1, 1).entries.length, 3, 'a move lost or gained a line');
  });

  it('refuses to WRAP: a move off either end returns the draft unchanged', () => {
    // A wrap would silently send the line he was nudging to the far end of a routine he is looking
    // at, which is the one outcome he would not check for.
    assert.deepEqual(keys(moveEntry(three, 0, -1)), keys(three));
    assert.deepEqual(keys(moveEntry(three, 2, 1)), keys(three));
    assert.deepEqual(keys(moveEntry(three, 9, -1)), keys(three));
    assert.deepEqual(keys(moveEntry(three, -1, 1)), keys(three));
  });

  it('adds, replaces and removes a line', () => {
    assert.equal(addEntry(three).entries.length, 4);
    assert.equal(addEntry(three).entries[3].exerciseId, '');
    assert.deepEqual(keys(removeEntry(three, 1)), [keys(three)[0], keys(three)[2]]);
    assert.deepEqual(keys(removeEntry(three, 5)), keys(three));

    const swapped = replaceEntry(three, 1, { exerciseId: 'x', sets: '4', amount: '', rest: '' });
    assert.equal(swapped.entries[1].exerciseId, 'x');
    assert.equal(swapped.entries[0].exerciseId, keys(three)[0]);
    assert.deepEqual(keys(replaceEntry(three, 9, { exerciseId: 'x', sets: '', amount: '', rest: '' })),
      keys(three));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The routine's refusal labels
// ═══════════════════════════════════════════════════════════════════════════════

describe('a routine refusal, labelled', () => {
  it('names the LINE a person counts, not the index a machine does', () => {
    assert.equal(routineFieldLabel('content.entries[3].rest_seconds'),
      'Exercise 4 in this routine, rest');
    assert.equal(routineFieldLabel('content.entries[0].exercise_id'),
      'Exercise 1 in this routine, which exercise');
    assert.equal(routineFieldLabel('content.entries'), 'The exercises in it');
  });

  it('reads the REFERENTIAL check\'s own path shape too, which names a whole library', () => {
    // `checkRoutineReferences` validates a library and writes paths like
    // `routines[0](legs-strength).entries[2].exercise_id`. An issue whose label reads as machine
    // noise is one he cannot act on, so that prefix is dropped and the tail read like any other.
    assert.equal(routineFieldLabel('routines[0](legs-strength).entries[2].exercise_id'),
      'Exercise 3 in this routine, which exercise');
  });

  it('carries a path it has no word for through IN FULL rather than swallowing it', () => {
    assert.equal(routineFieldLabel('content.something_new'), 'content.something_new');
    assert.equal(routineFieldLabel('entries[2].brand_new_field'),
      'Exercise 3 in this routine, brand_new_field');
  });

  it('labels the fields he can actually see, and says which are the app\'s own', () => {
    assert.equal(routineFieldLabel('content.split_day'), 'Where it sits in the week');
    assert.match(routineFieldLabel('content.id'), /Name/u);
    assert.match(routineFieldLabel('content.provenance'), /app's own record/u);
  });

  it('shows a failure that is not a validation refusal in its own words', () => {
    const report = describeRoutineRefusal(new Error('the database went away'));
    assert.equal(report.fields.length, 0);
    assert.match(String(report.verbatim), /the database went away/u);
    assert.match(report.headline, /routine/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routines, written to a REAL store
// ═══════════════════════════════════════════════════════════════════════════════

describe('adding and changing a routine, against a real store', () => {
  it('marks a routine he ADDS as his own, read back off the store', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);

    const draft = { ...draftFromRoutine(shippedRoutineRecord(0)), name: 'Coach Test Routine' };
    const saved = await addRoutine(store, routineContent(draft, await readExerciseChoices(store), null));

    const read = await store.getByContentKey('routine', 'coach-test-routine');
    assert.equal(read.content.provenance, COACH_PROVENANCE);
    assert.equal(saved.content.name, 'Coach Test Routine');
  });

  it('marks a SHIPPED routine he edits as edited, and does not walk it into his own family', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);
    const created = await store.create('routine', shipped);
    assert.equal(created.content.provenance, SEED_PROVENANCE);

    const choices = await readExerciseChoices(store);
    const draft = {
      ...draftFromRoutine(created as RoutineRecord),
      // A description of his own, not the shipped one with words appended: the shipped text is
      // already near the four hundred the record allows, and the refusal would be about a length
      // this test never meant to probe.
      description: 'The coach has rewritten what this day is for, in his own words.',
    };
    await saveRoutine(store, created.record_id, routineContent(draft, choices, shipped.id as string), created.rev);

    const read = await store.getByContentKey('routine', shipped.id as string);
    assert.equal(read.content.provenance, EDITED_PROVENANCE);

    // A record of HIS OWN, edited twice, stays his — otherwise the reset would be handed work it
    // must never revert.
    const mine = await addRoutine(store, routineContent(
      { ...draft, name: 'Mine Only' }, choices, null,
    ));
    const again = await saveRoutine(store, mine.record_id, routineContent(
      { ...draft, name: 'Mine Only', description: 'Changed once more, by me, twice over.' },
      choices, mine.content.id,
    ), mine.rev);
    assert.equal(again.content.provenance, COACH_PROVENANCE);
  });

  it('reads a page and joins the next one on without losing the cursor', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);
    await store.create('routine', shipped);

    const first = await readRoutinePage(store);
    assert.equal(first.items.length, 1);

    const joined = appendRoutinePage(first, { items: [], cursor: 'later', done: false });
    assert.equal(joined.items.length, 1);
    assert.equal(joined.cursor, 'later');
    assert.equal(joined.done, false, 'joining a page that is not the last claimed the library ended');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE SECOND VALIDATOR — the one the store structurally cannot run
// ═══════════════════════════════════════════════════════════════════════════════

describe('the check a routine cannot pass on its own', () => {
  /** The report for a draft that was refused, having first proven it WAS refused. */
  async function refusalFor(store: unknown, content: Record<string, unknown>) {
    let thrown: unknown = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await addRoutine(store as any, content);
    } catch (error: unknown) {
      thrown = error;
    }
    assert.notEqual(thrown, null, 'the routine was ACCEPTED where a refusal was expected');
    return describeRoutineRefusal(thrown);
  }

  it('ACCEPTS a genuinely valid routine first — without which every refusal below proves nothing', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);

    const choices = await readExerciseChoices(store);
    const saved = await addRoutine(store, routineContent(
      { ...draftFromRoutine(shippedRoutineRecord(0)), name: 'Accepted Probe' }, choices, null,
    ));
    assert.equal(saved.content.name, 'Accepted Probe');
    assert.equal(saved.content.entries.length, (shipped.entries as unknown[]).length);
  });

  it('REFUSES an entry naming an exercise that does not exist, and nothing is written', async () => {
    const store = await aRealStore();
    await seedExercises(store);
    const choices = await readExerciseChoices(store);

    const content = routineContent({
      ...emptyRoutineDraft(),
      name: 'Dangling Probe',
      splitDay: '1',
      focus: 'legs',
      bodyRegions: ['lower-body'],
      description: 'A routine naming an exercise that is not in the library at all.',
      entries: [{ exerciseId: 'no-such-exercise', sets: '', amount: '', rest: '' }],
    }, choices, null);

    const report = await refusalFor(store, content);
    const dangling = report.fields.filter((field) => field.code === 'DANGLING_REFERENCE');
    assert.ok(dangling.length > 0,
      `it was refused by ${report.fields.map((f) => f.code).join(', ')} rather than by the reference check`);
    assert.match(dangling[0].message, /no-such-exercise/u);
    assert.match(dangling[0].label, /Exercise 1 in this routine/u,
      'the refusal does not say WHICH line is wrong');

    // NOTHING WAS WRITTEN. The check runs before the create, so a refusal is not a half-saved
    // routine the coach would find later.
    assert.equal(await store.getByContentKey('routine', 'dangling-probe'), undefined);
  });

  it('REFUSES an override that contradicts the exercise\'s own measurement', async () => {
    const store = await aRealStore();
    await seedExercises(store, 30);
    const choices = await readExerciseChoices(store);
    const byTime = choices.all.find((choice) => choice.measurement === 'time');
    assert.ok(byTime !== undefined, 'no time-counted exercise was seeded, so this proves nothing');

    // Built by hand rather than through `routineContent`, precisely because the form puts the
    // figure in the field the measurement chooses and so cannot produce this. The contradiction
    // still has to be refused: another window may have changed the exercise's measurement since.
    const content = {
      id: 'contradiction-probe',
      name: 'Contradiction Probe',
      split_day: 1,
      focus: 'hiit',
      body_regions: ['full-body'],
      description: 'A routine overriding repetitions on an exercise that is counted in time.',
      entries: [{ exercise_id: byTime.contentKey, repetitions: 12 }],
    };

    const report = await refusalFor(store, content);
    const mismatch = report.fields.filter((field) => field.code === 'MISMATCH');
    assert.ok(mismatch.length > 0,
      `it was refused by ${report.fields.map((f) => f.code).join(', ')} rather than by the measurement check`);
    assert.match(mismatch[0].message, /counted in time/u);
    assert.match(mismatch[0].message, new RegExp(byTime.contentKey, 'u'),
      'the refusal does not name the exercise that contradicts it');
  });

  it('REFUSES a routine with no exercises in it at all, in the record\'s own words', async () => {
    const store = await aRealStore();
    await seedExercises(store);
    const choices = await readExerciseChoices(store);

    const report = await refusalFor(store, routineContent({
      ...emptyRoutineDraft(),
      name: 'Empty Probe',
      splitDay: '2',
      focus: 'legs',
      bodyRegions: ['lower-body'],
      description: 'A routine with nothing in it, which the record does not allow.',
      entries: [],
    }, choices, null));

    assert.ok(report.fields.some((field) => /at least one exercise/iu.test(field.message)),
      `nothing said a routine needs an exercise: ${report.fields.map((f) => f.message).join(' | ')}`);
  });

  it('REFUSES a weight typed into a figure box rather than truncating it to a number', async () => {
    const store = await aRealStore();
    await seedExercises(store);
    const choices = await readExerciseChoices(store);

    const report = await refusalFor(store, routineContent({
      ...emptyRoutineDraft(),
      name: 'Loaded Probe',
      splitDay: '1',
      focus: 'legs',
      bodyRegions: ['lower-body'],
      description: 'A routine with a weight typed into the sets box, which is what reaching for load looks like.',
      entries: [{ exerciseId: choices.all[0].contentKey, sets: '40kg', amount: '', rest: '' }],
    }, choices, null));

    assert.ok(report.fields.length > 0, 'a weight in a figure box produced no refusal at all');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Removing a routine
// ═══════════════════════════════════════════════════════════════════════════════

describe('removing a routine', () => {
  /** A client, so a session has somebody in it. Its record identity is what a session names. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function aClient(store: any): Promise<string> {
    const created = await store.create('client', {
      name: 'A Client', notes: '', active: true,
    });
    return created.record_id as string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function aSession(store: any, routineKey: string, clientId: string, day: number) {
    return store.create('session', {
      routine_id: routineKey,
      client_ids: [clientId],
      status: 'planned',
      mode: 'in_person',
      scheduled_at: `2026-0${String((day % 9) + 1)}-1${String(day % 10)}T09:30:00.000Z`,
    });
  }

  it('is a TOMBSTONE, so the deletion propagates instead of returning from the remote copy', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);
    const created = await store.create('routine', shipped);

    await removeRoutine(store, created.record_id, created.rev);

    const gone = await store.get('routine', created.record_id);
    assert.equal(gone.deleted, true, 'the row was removed rather than tombstoned, so it will come back');
    assert.equal((await readRoutinePage(store)).items.length, 0);
  });

  it('finds EVERY session that has run a routine, across more than one page', async () => {
    const store = await aRealStore();
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);
    await store.create('routine', shipped);
    const client = await aClient(store);

    // DERIVED FROM THE PAGE SIZE, never a number typed here: a count that stopped at the page size
    // would exercise none of the loop, and a first-page-only answer would say "nothing has run it"
    // about a session that happened to sort late.
    const many = SESSION_PAGE_LIMIT + 3;
    for (let index = 0; index < many; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await aSession(store, shipped.id as string, client, index);
    }

    const found = await sessionsUsing(store, shipped.id as string);
    assert.equal(found.length, many,
      `the walk found ${String(found.length)} of ${String(many)} sessions, so it stopped at a page boundary`);

    // NON-VACUITY: the same walk over a routine nothing has run comes back empty, so the answer
    // above is a measurement rather than a function that returns everything.
    assert.deepEqual(await sessionsUsing(store, 'a-routine-nothing-has-run'), []);
  });

  it('names a session by WHEN it was, because a record identity is machinery he has never seen', () => {
    assert.equal(sessionWords({ started_at: '2026-03-04T09:30:00.000Z', status: 'completed' }),
      '2026-03-04 (completed)');
    assert.equal(sessionWords({ scheduled_at: '2026-03-05T09:30:00.000Z', status: 'planned' }),
      '2026-03-05 (planned)');
    assert.match(sessionWords({ status: 'in_progress' }), /no date on it \(in progress\)/u);
    assert.doesNotMatch(sessionWords({ status: 'in_progress' }), /_/u,
      'the machine\'s own spelling of a status is being read out');
  });

  it('draws NO confirming control while a session still points at it, and agrees in both numbers', () => {
    const routine = summaryOf(0);

    const one = describeRoutineRemoval(routine, ['2026-03-04 (completed)']);
    assert.equal(one.allowed, false);
    assert.equal(one.confirmLabel, '', 'a confirming label exists for an act already decided against');
    assert.match(one.whatWillHappen, /a session has already run it/u);
    assert.match(one.whatWillHappen, /that session/u);
    assert.doesNotMatch(one.whatWillHappen, /sessions have|those sessions/u);

    const two = describeRoutineRemoval(routine, ['2026-03-04 (completed)', '2026-03-11 (completed)']);
    assert.equal(two.allowed, false);
    assert.match(two.whatWillHappen, /sessions have already run it/u);
    assert.match(two.whatWillHappen, /those sessions/u);
    assert.doesNotMatch(two.whatWillHappen, /a session has|that session/u);
    assert.equal(two.usedBy.length, 2, 'he is not told which sessions, so he cannot go and look');
  });

  it('NAMES WHAT THE ACT DESTROYS rather than what would restore it', () => {
    const shipped = summaryOf(0);
    const allowed = describeRoutineRemoval(shipped, []);
    assert.equal(allowed.allowed, true);
    assert.match(allowed.confirmLabel, new RegExp(shipped.name.replace(/ /gu, ' '), 'u'));

    // The reset is mentioned WITH ITS PRICE. Offered as a comfort without it, the sentence would be
    // the app under-selling a destruction: the reset takes back every other shipped record he has
    // changed since.
    assert.match(allowed.whatWillHappen, /destroys it/u);
    assert.match(allowed.whatWillHappen, /every other shipped/u);

    // His own routine cannot come back at all, and the sentence says so without hedging.
    const mine = { ...shipped, provenance: COACH_PROVENANCE, name: 'Mine' };
    const forMine = describeRoutineRemoval(mine, []);
    assert.match(forMine.whatWillHappen, /nothing will bring it back/u);
    assert.doesNotMatch(forMine.whatWillHappen, /restoring the shipped library would bring it back/u);

    // AND IT SAYS WHAT SURVIVES. Removing the routine does not remove its exercises, and a coach
    // who thought it did would not press it.
    for (const removal of [allowed, forMine]) {
      assert.match(removal.whatWillHappen, /stay in your\s+library/u,
        'nothing says the exercises survive the routine');
    }
  });

  it('says once it is gone, in his words, with its name', () => {
    assert.equal(routineRemovedWords('Legs Strength'),
      'Legs Strength is no longer in your library on this device.');
    assert.match(routineSavedWords('Legs Strength', true), /is in your library/u);
    assert.match(routineSavedWords('Legs Strength', false), /Your changes to Legs Strength/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE REACHABILITY HOP
// ═══════════════════════════════════════════════════════════════════════════════

describe('opening the exercise a routine entry names', () => {
  it('reaches an exercise that is NOT on the page the exercise list happens to be showing', async () => {
    const store = await aRealStore();
    await seedExercises(store, 40);

    // The exercise list pages at 25. The hop must reach the fortieth, or a coach whose routine names
    // a late-sorting exercise is quietly sent back to the routine form to type its three intensity
    // points in again — the second idea of one truth this action exists to avoid.
    const all = (await readExerciseChoices(store)).all;
    const late = all[all.length - 1];
    const firstPage = await libraryPage(store, 'exercise', { limit: 25 }) as {
      items: { content: { id: string } }[];
    };
    assert.ok(!firstPage.items.some((record) => record.content.id === late.contentKey),
      'the exercise chosen for this probe is on the first page, so the probe proves nothing');

    const record = await readExerciseByKey(store, late.contentKey);
    assert.ok(record !== undefined, 'the hop could not reach an exercise past the first page');
    assert.equal(record.content.id, late.contentKey);
    assert.ok(record.content.scaling !== undefined,
      'the record arrived without the three intensity points, so the form would open empty');
  });

  it('says so when the exercise is gone, rather than opening an empty form', async () => {
    const store = await aRealStore();
    await seedExercises(store, 3);

    assert.equal(await readExerciseByKey(store, 'no-such-exercise'), undefined);
    assert.match(exerciseGoneWords('no-such-exercise'), /no-such-exercise/u);
    assert.match(exerciseGoneWords('no-such-exercise'), /another window/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The curves, in words
// ═══════════════════════════════════════════════════════════════════════════════

describe('what the curve list says', () => {
  it('spells the curve out in the SAME words as the button he presses', () => {
    const record = shippedPatternRecord(0);
    const summary = describePattern(record);
    const toggle = toggleFor({
      id: record.content.id,
      name: record.content.name,
      sequence: record.content.sequence,
      description: record.content.description,
    });

    // COMPOSED, not restated. A second wording here would show up as an editor describing a curve
    // differently from the control that runs it.
    assert.equal(summary.curveWords, toggle.curveWords);
    assert.equal(summary.name, toggle.name);
    assert.equal(summary.description, toggle.words);
  });

  it('has a sentence for EVERY mapping rule the model has, read off the frozen vocabulary', () => {
    // The guard against the rot this build has watched four times: the scope is the model's own
    // list at run time, never a list typed beside the table.
    for (const rule of MAPPING_RULES as string[]) {
      const words = mappingWords(rule);
      assert.notEqual(words, rule, `the mapping rule "${rule}" has no sentence and reads as its key`);
      assert.ok(words.length > 20, `the sentence for "${rule}" says nothing useful: ${words}`);
    }
    // NON-VACUITY: a rule the model does not have falls back rather than being swallowed, so the
    // assertions above are about sentences that genuinely exist.
    assert.equal(mappingWords('not-a-rule'), 'Not a rule');
  });

  it('counts points with the noun agreeing, in both numbers', () => {
    assert.equal(pointCountWords(1), '1 point');
    assert.equal(pointCountWords(4), '4 points');
  });

  it('agrees with itself in both numbers, everywhere it counts curves', () => {
    const page = (n: number) => ({
      items: Array.from({ length: n }, (_h, index) => shippedPatternRecord(index, `p${String(index)}`)),
      cursor: null,
      done: true,
    });

    const one = describePatterns({ page: page(1), search: '', total: 1 });
    assert.match(one.intro, /^1 curve in your library\./u);
    assert.doesNotMatch(one.intro, /1 curves|curves are/u);

    const many = describePatterns({ page: page(3), search: '', total: 3 });
    assert.match(many.intro, /^3 curves in your library\./u);

    // THE SEARCHING SENTENCES TAKE THE MATCH COUNT, so the totals here are deliberately DIFFERENT
    // from the page lengths: a sentence that borrowed the total would read "40 curves match".
    assert.match(describePatterns({ page: page(1), search: 'low', total: 40 }).intro,
      /^1 curve matches "low"\.$/u);
    assert.match(describePatterns({ page: page(2), search: 'low', total: 40 }).intro,
      /^2 curves match "low"\.$/u);
  });

  it('says what an empty set of curves COSTS him, since it is what a session is shaped by', () => {
    const nothing = describePatterns({
      page: { items: [], cursor: null, done: true }, search: '', total: 0,
    });
    assert.equal(nothing.empty, true);
    assert.match(nothing.intro, /session cannot be shaped/u);
    assert.match(nothing.intro, /Admin/u);
  });

  it('shows a draft curve as it is being built, and says plainly when it is empty', () => {
    assert.match(draftCurveWords([]), /No points yet/u);
    assert.equal(draftCurveWords(['low', 'high']),
      toggleFor({ id: 'd', name: 'd', sequence: ['low', 'high'] }).curveWords);
  });
});

describe('the curve form', () => {
  it('fills in from the record, and a round trip changes nothing', () => {
    const record = shippedPatternRecord(0);
    const rebuilt = patternContent(draftFromPattern(record), record.content.id);
    for (const field of ['id', 'name', 'sequence', 'mapping_rule', 'description']) {
      assert.deepEqual(rebuilt[field], (record.content as unknown as Record<string, unknown>)[field],
        `a round trip through the form changed ${field}`);
    }
  });

  it('adds, removes and moves a point, and refuses to wrap off either end', () => {
    const draft = { ...emptyPatternDraft(), sequence: ['low', 'medium', 'high'] };

    assert.deepEqual(addPoint(draft, 'low').sequence, ['low', 'medium', 'high', 'low']);
    assert.deepEqual(removePoint(draft, 1).sequence, ['low', 'high']);
    assert.deepEqual(removePoint(draft, 9).sequence, draft.sequence);
    assert.deepEqual(movePoint(draft, 2, -1).sequence, ['low', 'high', 'medium']);
    assert.deepEqual(movePoint(draft, 0, -1).sequence, draft.sequence);
    assert.deepEqual(movePoint(draft, 2, 1).sequence, draft.sequence);
  });

  it('keeps a curve\'s key when he renames it, because a proposal names it by key', () => {
    const content = patternContent(
      { ...draftFromPattern(shippedPatternRecord(0)), name: 'Renamed Curve' },
      'low-medium-high-low',
    );
    assert.equal(content.id, 'low-medium-high-low');
    assert.equal(patternKeyFor('Steady Build'), 'steady-build');
  });

  it('labels a curve refusal, and carries a path it has no word for through in full', () => {
    assert.equal(patternFieldLabel('content.sequence'), 'The curve');
    assert.equal(patternFieldLabel('content.mapping_rule'), 'How it spreads across a routine');
    assert.equal(patternFieldLabel('content.brand_new'), 'content.brand_new');
    assert.match(patternFieldLabel('content.provenance'), /app's own record/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Curves, written to a REAL store
// ═══════════════════════════════════════════════════════════════════════════════

describe('adding and changing a curve, against a real store', () => {
  /** The report for a curve that was refused, having first proven it WAS refused. */
  async function patternRefusalFor(store: unknown, content: Record<string, unknown>) {
    let thrown: unknown = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await addPattern(store as any, content);
    } catch (error: unknown) {
      thrown = error;
    }
    assert.notEqual(thrown, null, 'the curve was ACCEPTED where a refusal was expected');
    return describePatternRefusal(thrown);
  }

  it('ACCEPTS a genuinely valid curve first, and marks it as his', async () => {
    // THE LOOSENING DIRECTION, FIRST. A record that refuses everything passes every refusal test
    // below and is useless, so nothing below means anything without this.
    const store = await aRealStore();
    const saved = await addPattern(store, patternContent({
      name: 'Coach Test Curve',
      sequence: ['low', 'medium', 'high'],
      mappingRule: 'stretch',
      description: 'A curve authored to prove the editor can write one the record accepts.',
    }, null));

    const read = await store.getByContentKey('intensity-pattern', 'coach-test-curve');
    assert.equal(read.content.provenance, COACH_PROVENANCE);
    assert.deepEqual(saved.content.sequence, ['low', 'medium', 'high']);
  });

  it('marks a SHIPPED curve he edits as edited, computed off what is on disk', async () => {
    const store = await aRealStore();
    const shipped = copyOf(INTENSITY_PATTERNS[0]) as Record<string, any>;
    const created = await store.create('intensity-pattern', shipped);
    assert.equal(created.content.provenance, SEED_PROVENANCE);

    const draft = draftFromPattern(created as PatternRecord);
    await savePattern(store, created.record_id, patternContent({
      ...draft, description: `${draft.description} And the coach has changed it.`,
    }, shipped.id as string), created.rev);

    const read = await store.getByContentKey('intensity-pattern', shipped.id as string);
    assert.equal(read.content.provenance, EDITED_PROVENANCE);
  });

  it('REFUSES a name that spells out a curve the sequence does not match — and it is R11 that refuses it', async () => {
    const store = await aRealStore();
    const report = await patternRefusalFor(store, patternContent({
      name: 'Low Medium High',
      sequence: ['high', 'medium', 'low'],
      mappingRule: 'stretch',
      description: 'A name that spells out one curve over a sequence that is its exact reverse.',
    }, null));

    // THE RED CAME FROM THE RULE BEING PROBED, not from some other validation. The path is the
    // NAME, the code is a mismatch, and the sentence is R11's own.
    const named = report.fields.filter((field) => field.path.endsWith('name'));
    assert.ok(named.length > 0,
      `it was refused about ${report.fields.map((f) => f.path).join(', ')} rather than about the name`);
    assert.equal(named[0].code, 'MISMATCH');
    assert.match(named[0].message, /spells out/u);
    assert.match(named[0].message, /"low medium high"/u);
    assert.match(named[0].message, /"high medium low"/u);
    assert.equal(named[0].label, 'Name');
  });

  it('LOOSENS in the right direction: a name with ONE intensity word is free of any sequence', async () => {
    // The discriminator probed the way round that makes the refusal above mean something. R11 binds
    // only a name that SPELLS OUT a curve — two or more intensity words. A descriptive label with
    // one, or none, is his to choose, and a record that refused it would be over-tight in a way no
    // refusal test would catch.
    const store = await aRealStore();
    const free = await addPattern(store, patternContent({
      name: 'A High Effort Finish',
      sequence: ['low', 'medium', 'medium', 'high'],
      mappingRule: 'hold-last',
      description: 'One intensity word in the name, so the name is a label rather than a spelled curve.',
    }, null));
    assert.deepEqual(free.content.sequence, ['low', 'medium', 'medium', 'high']);

    const none = await addPattern(store, patternContent({
      name: 'Steady Effort Build',
      sequence: ['high', 'low'],
      mappingRule: 'repeat-cycle',
      description: 'No intensity word at all in the name, which is a descriptive label.',
    }, null));
    assert.deepEqual(none.content.sequence, ['high', 'low']);

    // And the truthful spelled-out name IS accepted, which is the other half of the discriminator.
    const spelled = await addPattern(store, patternContent({
      name: 'Low Medium High',
      sequence: ['low', 'medium', 'high'],
      mappingRule: 'stretch',
      description: 'A name that spells the curve out and tells the truth about it.',
    }, null));
    assert.deepEqual(spelled.content.sequence, ['low', 'medium', 'high']);
  });

  it('REFUSES a curve of fewer than two points and one of more than eight', async () => {
    const store = await aRealStore();

    const short = await patternRefusalFor(store, patternContent({
      name: 'Single Point Probe',
      sequence: ['high'],
      mappingRule: 'stretch',
      description: 'A curve of one point, which is not a shape a session can be put into.',
    }, null));
    assert.ok(short.fields.some((field) => field.path.includes('sequence')),
      `a one-point curve was refused about ${short.fields.map((f) => f.path).join(', ')}`);

    const long = await patternRefusalFor(store, patternContent({
      name: 'Nine Point Probe',
      sequence: Array.from({ length: 9 }, (_h, index) => (index % 2 === 0 ? 'low' : 'high')),
      mappingRule: 'stretch',
      description: 'A curve of nine points, which is past what the record holds.',
    }, null));
    assert.ok(long.fields.some((field) => field.path.includes('sequence')),
      `a nine-point curve was refused about ${long.fields.map((f) => f.path).join(', ')}`);
  });

  it('REFUSES a level that is not one the model has', async () => {
    const store = await aRealStore();
    const report = await patternRefusalFor(store, patternContent({
      name: 'Invented Level Probe',
      sequence: ['low', 'extreme'],
      mappingRule: 'stretch',
      description: 'A curve naming a level the record model does not have at all.',
    }, null));
    assert.ok(report.fields.some((field) => field.path.includes('sequence')),
      `an invented level was refused about ${report.fields.map((f) => f.path).join(', ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE CONTENT CONTRACT AND THE PATTERN RECORD — the finding, proven rather than asserted
// ═══════════════════════════════════════════════════════════════════════════════

describe('the more-work-less-rest contract, and what it means for a curve', () => {
  it('THE PATTERN RECORD CARRIES NO WORK, REST OR LOAD FIELD, so there is nothing for such a rule to check', () => {
    // The finding, stated as a measurement off the model's own field list rather than as a claim in
    // a comment. If a work or rest field is ever added to this record, this goes red and the
    // question of a validator becomes a real one.
    for (const field of INTENSITY_PATTERN_FIELDS as string[]) {
      assert.doesNotMatch(
        field,
        /rest|work|repetition|duration|sets|load|weight|resistance/iu,
        `the pattern record now has a "${field}" field, so the contract needs a rule here after all`,
      );
    }
    // NON-VACUITY: the same matcher over the ROUTINE's entry fields, which demonstrably have them,
    // must fire — otherwise the silence above would mean nothing.
    assert.ok(
      ['exercise_id', 'sets', 'repetitions', 'duration_seconds', 'rest_seconds']
        .some((field) => /rest|work|repetition|duration|sets/iu.test(field)),
      'the matcher cannot find a work or rest field where one demonstrably is',
    );
  });

  it('REFUSES a curve carrying a rest field, so one cannot be smuggled onto the record', async () => {
    const store = await aRealStore();
    let thrown: unknown = null;
    try {
      await addPattern(store, {
        id: 'rest-smuggled-probe',
        name: 'Rest Smuggled Probe',
        sequence: ['low', 'high'],
        mapping_rule: 'stretch',
        description: 'A curve carrying a rest value, which the record has no field for.',
        rest_seconds: 30,
      });
    } catch (error: unknown) {
      thrown = error;
    }
    assert.notEqual(thrown, null, 'a rest value was accepted onto a curve');

    // NON-VACUITY: the SAME curve without that one field is accepted, so the refusal above is about
    // the field and not about anything else in the draft.
    const accepted = await addPattern(store, {
      id: 'rest-smuggled-probe',
      name: 'Rest Smuggled Probe',
      sequence: ['low', 'high'],
      mapping_rule: 'stretch',
      description: 'A curve carrying a rest value, which the record has no field for.',
    });
    assert.equal(accepted.content.id, 'rest-smuggled-probe');
  });

  it('REFUSES a load-shaped field on a curve BY NAME, with the contract\'s own sentence', async () => {
    const store = await aRealStore();
    let thrown: unknown = null;
    try {
      await addPattern(store, {
        id: 'loaded-curve-probe',
        name: 'Loaded Curve Probe',
        sequence: ['low', 'high'],
        mapping_rule: 'stretch',
        description: 'A curve with a weight field, which is what reaching for load looks like here.',
        weight_kg: 40,
      });
    } catch (error: unknown) {
      thrown = error;
    }
    const report = describePatternRefusal(thrown);
    assert.ok(
      report.fields.some((field) => field.code === 'FORBIDDEN_LOAD'),
      `a weight field on a curve was refused by ${report.fields.map((f) => f.code).join(', ')} `
      + 'rather than as a load',
    );
    assert.ok(
      report.fields.some((field) => /never prescribes load/iu.test(field.message)),
      'the refusal does not carry the contract\'s own reason',
    );
  });

  it('THE LEVELS A CURVE MAY NAME ARE EXACTLY THE LEVELS THE EXERCISE ORDERS', async () => {
    // This is what makes "the contract is enforced on the exercise" true rather than asserted: every
    // point a curve can name resolves to a scaling point on an exercise, and those three are ordered
    // by `checkScaling` — work non-decreasing, sets non-decreasing, rest non-increasing. A level a
    // curve could name that the exercise has no ordered point for would be a hole in exactly the
    // place this comment claims there is none.
    const shipped = new Set((INTENSITY_PATTERNS as { sequence: string[] }[])
      .flatMap((pattern) => pattern.sequence));
    for (const level of shipped) {
      assert.ok((INTENSITY_LEVELS as string[]).includes(level),
        `a shipped curve names "${level}", which is not a level an exercise is scaled at`);
    }

    const scalingKeys = Object.keys((EXERCISES[0] as { scaling: Record<string, unknown> }).scaling);
    assert.deepEqual([...scalingKeys].sort(), [...(INTENSITY_LEVELS as string[])].sort(),
      'an exercise is scaled at a different set of levels from the ones a curve may name');
  });

  it('and the contract IS enforced where it lives: rest rising with intensity is refused', async () => {
    // The cross-link, run rather than referred to. The exercise editor is a1's, but the acceptance
    // for THIS action is that the contract refuses a violating value and accepts a valid one, so
    // both directions are exercised here against a real store.
    const store = await aRealStore();
    const valid = copyOf(EXERCISES[0]) as Record<string, any>;

    // ACCEPTED FIRST.
    const accepted = await store.create('exercise', valid);
    assert.equal(accepted.content.id, valid.id);

    const violating = copyOf(EXERCISES[0]) as Record<string, any>;
    violating.id = 'rising-rest-probe';
    violating.name = 'Rising Rest Probe';
    violating.scaling.high.rest_seconds = violating.scaling.low.rest_seconds + 120;

    let thrown: unknown = null;
    try {
      await store.create('exercise', violating);
    } catch (error: unknown) {
      thrown = error;
    }
    assert.notEqual(thrown, null, 'a curve whose harder point rests LONGER was accepted');

    const issues = (thrown as { issues?: { code: string; message: string }[] }).issues ?? [];
    const ordering = issues.filter((issue) => issue.code === 'ORDERING');
    assert.ok(ordering.length > 0,
      `it was refused by ${issues.map((i) => i.code).join(', ')} rather than by the ordering rule`);
    assert.ok(ordering.some((issue) => /rest/iu.test(issue.message)),
      'the red came from an ordering rule that is not the one about rest');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Removing a curve
// ═══════════════════════════════════════════════════════════════════════════════

describe('removing a curve', () => {
  it('NOTHING STORED POINTS AT A CURVE, and that is measured off the core rather than assumed', () => {
    // The reason there is no reference guard on this removal. Read off `referential.js`'s own
    // declaration of what is enforced, so a record kind that starts naming a pattern turns this red
    // instead of the guard quietly staying absent.
    for (const direction of REFERENTIAL_DIRECTION.enforced as string[]) {
      assert.doesNotMatch(direction, /pattern/iu,
        `${direction} names an intensity pattern, so removing one now needs a reference guard`);
    }
    // NON-VACUITY: the same list demonstrably names the references that DO exist, so its silence
    // about patterns is a fact rather than an empty read.
    const enforced = (REFERENTIAL_DIRECTION.enforced as string[]).join(' ');
    assert.match(enforced, /exercise/u);
    assert.match(enforced, /routine/u);
    assert.match(enforced, /session/u);
  });

  it('is a tombstone, and the curve leaves the list', async () => {
    const store = await aRealStore();
    const created = await store.create('intensity-pattern', copyOf(INTENSITY_PATTERNS[0]));

    await removePattern(store, created.record_id, created.rev);

    const gone = await store.get('intensity-pattern', created.record_id);
    assert.equal(gone.deleted, true, 'the row was removed rather than tombstoned');
    assert.equal((await readPatternPage(store)).items.length, 0);
  });

  it('counts the WHOLE library before claiming this is his last curve', async () => {
    const store = await aRealStore();
    for (const pattern of INTENSITY_PATTERNS as Record<string, unknown>[]) {
      // eslint-disable-next-line no-await-in-loop
      await store.create('intensity-pattern', copyOf(pattern));
    }
    assert.equal(await countPatterns(store), (INTENSITY_PATTERNS as unknown[]).length);

    const summary = describePattern(shippedPatternRecord(0));
    const notLast = describePatternRemoval(summary, 6);
    assert.doesNotMatch(notLast.whatWillHappen, /only curve you have left/u);

    const last = describePatternRemoval(summary, 0);
    assert.match(last.whatWillHappen, /only curve you have left/u);
    assert.match(last.whatWillHappen, /no shape to press/u);
  });

  it('names what removing a curve destroys, and what it does not touch', () => {
    const shipped = describePattern(shippedPatternRecord(0));
    const forShipped = describePatternRemoval(shipped, 3);
    assert.equal(forShipped.allowed, true);
    assert.match(forShipped.whatWillHappen, /destroys it/u);
    assert.match(forShipped.whatWillHappen, /every other shipped/u);
    assert.match(forShipped.whatWillHappen, /Sessions you have already run are not touched/u);

    const mine = { ...shipped, provenance: COACH_PROVENANCE };
    assert.match(describePatternRemoval(mine, 3).whatWillHappen, /nothing will bring it back/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scans over the shipped source
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The files of this action, DISCOVERED the way `library-editor.test.ts` discovers its direction —
 * every shipped source in this directory whose name begins with `library`. It is the same rule, so
 * a file added to this direction is covered by both guards without either being edited.
 */
async function libraryDirectionSources(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(here, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => ['.ts', '.tsx'].some((suffix) => entry.name.endsWith(suffix)))
    .filter((entry) => !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx'))
    .filter((entry) => entry.name.toLowerCase().startsWith('library'))
    .map((entry) => path.join(here, entry.name));
}

/** The file with its comments removed. A word in a comment is not a string the coach ever sees. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('this action\'s own files, scanned', () => {
  it('the walk reaches every file of this action, which is what makes the scans below mean anything', async () => {
    const found = (await libraryDirectionSources()).map((file) => path.basename(file));
    for (const expected of [
      'library-routines.ts', 'library-routines-source.ts', 'library-patterns.ts',
      'library-patterns-source.ts', 'LibraryRoutines.tsx', 'LibraryPatterns.tsx',
    ]) {
      assert.ok(found.includes(expected), `the walk did not reach ${expected}`);
    }
    // And it reaches a1's files too, which is the point of using its rule rather than a new one.
    assert.ok(found.includes('library-editor.ts'));
  });

  it('assigns no provenance of its own, because the core owns that rule', async () => {
    // ABSENCE-SHAPED, so it carries a control: the same scan over the module that legitimately
    // declares the values must find one.
    const owner = codeOnly(await readFile(
      path.join(applicationRoot, 'core', 'seed', 'provenance.js'), 'utf8',
    ));
    assert.match(owner, /'(shipped-untouched|shipped-edited|coach-created)'/u,
      'the scan cannot find a provenance value where the module that declares them demonstrably is');

    for (const file of await libraryDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      assert.ok(!/provenance\s*[:=]\s*'/u.test(code),
        `${path.basename(file)} writes a provenance string. Call the core's markEdited instead.`);
    }
  });

  it('THE ROUTINE FORM HAS NO SCALING BOXES — the reachability rule, asserted as an absence', async () => {
    // The requirement is that a routine entry OPENS the exercise's editor rather than restating its
    // three intensity points. A second place to set them would drift.
    const routineForm = codeOnly(await readFile(path.join(here, 'LibraryRoutines.tsx'), 'utf8'));
    const exerciseForm = codeOnly(await readFile(path.join(here, 'RoutinesScreen.tsx'), 'utf8'));

    // TWO INDEPENDENT DISCRIMINATORS, because one of them alone would be a coincidence away from
    // meaningless. The record's field is `scaling`, lower case, and every read or write of it is
    // spelled that way — the routine form may NAME the rule in an upper-case sentence constant that
    // sends him to the exercise, and that is the opposite of restating it. And the three points are
    // keyed by `INTENSITY_LEVELS`, which a form with no such boxes has no business importing.
    for (const [matcher, what] of [[/\bscaling\b/u, 'the scaling field'],
      [/INTENSITY_LEVELS/u, 'the three levels the points are keyed by']] as const) {
      assert.ok(!matcher.test(routineForm),
        `the routine form reaches ${what}, which is a second place to set the three intensity points`);
      // POSITIVE CONTROL, in the same run: the same matcher over the file where it demonstrably IS
      // must fire, or the silence above would only mean the matcher is broken.
      assert.match(exerciseForm, matcher,
        `the scan cannot find ${what} where it demonstrably is, so its silence proves nothing`);
    }
  });

  it('each panel actually CALLS its wiring rather than holding it as an unused import', async () => {
    const wiring: Readonly<Record<string, readonly string[]>> = {
      'LibraryRoutines.tsx': ['addRoutine', 'saveRoutine', 'removeRoutine', 'sessionsUsing', 'describeRoutines'],
      'LibraryPatterns.tsx': ['addPattern', 'savePattern', 'removePattern', 'countPatterns', 'describePatterns'],
      'RoutinesScreen.tsx': ['LibraryRoutines', 'LibraryPatterns', 'readExerciseByKey'],
    };

    for (const [file, named] of Object.entries(wiring)) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(path.join(here, file), 'utf8'));
      for (const symbol of named) {
        const mentions = code.split(symbol).length - 1;
        assert.ok(mentions >= 2,
          `${file} names ${symbol} ${String(mentions)} time(s). The wiring is imported and not `
          + 'drawn, so the coach has no way to do the thing it exists for.');
      }
    }

    // NON-VACUITY: the same scan over a screen that legitimately has none of this finds nothing.
    const elsewhere = codeOnly(await readFile(path.join(here, 'PlaceholderScreen.tsx'), 'utf8'));
    assert.ok(!elsewhere.includes('addRoutine'), 'the scan matches files that do not call the wiring');
  });

  it('the curve editor COMPOSES with the session button\'s own wording rather than restating it', async () => {
    // The equality assertion earlier would still hold if this file computed the same string by
    // coincidence, so the composition itself is asserted: `toggleFor` is imported AND called.
    const patterns = codeOnly(await readFile(path.join(here, 'library-patterns.ts'), 'utf8'));
    assert.ok(patterns.split('toggleFor').length - 1 >= 2,
      'library-patterns.ts holds toggleFor as an unused import, so the row and the button are two '
      + 'separate ideas of what a curve is called and what shape it has');

    // NON-VACUITY: a sibling that legitimately has nothing to do with it does not match.
    const routines = codeOnly(await readFile(path.join(here, 'library-routines.ts'), 'utf8'));
    assert.ok(!routines.includes('toggleFor'), 'the scan matches files that do not compose with it');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEARCHING EACH LIBRARY, OVER A FIXTURE LARGER THAN ONE PAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THE FIXTURE SIZE IS THE WHOLE TEST. A fixture the size of one page makes page-scoped and
 * collection-scoped filtering INDISTINGUISHABLE — which is precisely why this shipped on all three
 * library kinds with every matcher test green. `matchesRoutineSearch` and `matchesPatternSearch` are
 * correct and are not what these tests are about; THE PAGING CALLER was the defect.
 *
 * SEVEN ROUTINES AND SEVEN CURVES SHIP, both comfortably under one page, so both screens were
 * correct on the shipped set and went wrong the moment the coach authored his twenty-sixth — the app
 * working exactly as it is meant to be used. Every fixture below is deliberately LARGER than the
 * kind's own page limit, DERIVED from that limit rather than typed beside it, with the target sitting
 * on the THIRD page — and the placement is ASSERTED before anything is concluded from it, because a
 * target that happened to land on page one makes every assertion here green before the fix and after.
 */

/** How many ordinary routines the fixture holds before the target is added. */
const ROUTINE_FILLERS = ROUTINE_PAGE_LIMIT * 2 + 10;
/** And how many curves. Both derived, so a changed page size cannot shrink a fixture under one page. */
const PATTERN_FILLERS = PATTERN_PAGE_LIMIT * 2 + 10;

/**
 * A name that sorts in a known order, LETTERS ONLY and CAPITALISED rather than upper-cased.
 *
 * The core reads these names aloud and `checkSpeakableWords` refuses any word of two or more
 * characters that is all-capitals as an abbreviation — "AA" is refused where "Aa" is not. Ascending
 * letter pairs, so the content keys they slug into sort in the order the fixtures assume.
 */
function fillerSuffix(index: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return `${letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`;
}

describe('searching the routine library, over a fixture larger than one page', () => {
  /** A routine library BIGGER THAN TWO PAGES, with one routine that sorts onto the third. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function aRoutineLibraryLargerThanAPage(): Promise<any> {
    const store = await aRealStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shipped = copyOf(ROUTINES[0]) as Record<string, any>;
    await seedExercisesFor(store, shipped);
    const choices = await readExerciseChoices(store);
    const base = {
      ...draftFromRoutine(shippedRoutineRecord(0)),
      description: 'A routine authored to fill the library past a page boundary.',
    };

    for (let index = 0; index < ROUTINE_FILLERS; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- content keys must not race for uniqueness.
      await addRoutine(store, routineContent(
        { ...base, name: `Filler Routine ${fillerSuffix(index)}` }, choices, null,
      ));
    }
    await addRoutine(store, routineContent({ ...base, name: 'Zzz Off Page Split' }, choices, null));

    return store;
  }

  /** Every name on one page, so a placement is asserted rather than assumed. */
  const namesOf = (page: { items: readonly RoutineRecord[] }) =>
    page.items.map((item) => item.content.name);

  it('finds a routine that sorts onto the THIRD page, and still finds nothing for a term the whole library lacks', async () => {
    const store = await aRoutineLibraryLargerThanAPage();

    // THE FIXTURE IS THE INSTRUMENT, so it is checked first and in full.
    const first = await readRoutinePage(store);
    assert.equal(first.items.length, ROUTINE_PAGE_LIMIT,
      'the fixture is not larger than a page, so it cannot tell page-scoped filtering from '
      + 'collection-scoped filtering');
    assert.equal(namesOf(first).includes('Zzz Off Page Split'), false,
      'the target sits ON the first page, so finding it proves nothing about searching the library');

    const second = await readRoutinePage(store, { search: '', after: first.cursor });
    assert.equal(second.items.length, ROUTINE_PAGE_LIMIT);
    assert.equal(namesOf(second).includes('Zzz Off Page Split'), false,
      'the target sits on the SECOND page, so the fixture is shallower than it claims');
    const third = await readRoutinePage(store, { search: '', after: second.cursor });
    assert.equal(namesOf(third).includes('Zzz Off Page Split'), true,
      'the target is not on the third page either, so the fixture is not what these tests assume');

    // THE FINDING DIRECTION: it is two pages down, and the search finds it anyway.
    const found = await readRoutineReadout(store, 'Off Page Split');
    assert.deepEqual(namesOf(found.page), ['Zzz Off Page Split'],
      'a routine past the first page is reported as absent by a search bound to page one — the '
      + 'defect where the screen says it does not exist and the uniqueness guard then refuses to '
      + 'let him create it');

    // THE ABSENCE DIRECTION, IN THE SAME RUN. Without it, a filter that returned EVERYTHING would
    // satisfy the assertion above and look exactly like a working search. ORDINARY WORDS rather than
    // an initialism, which the record would refuse on the way in.
    const absent = await readRoutineReadout(store, 'Harbour Ferry Crossing');
    assert.deepEqual(namesOf(absent.page), [],
      'a term nothing in the library matches came back with results, so the filter matches '
      + 'everything and the assertion above proves nothing');
  });

  it('counts the LIBRARY, not the page, and neither sentence borrows the other number', async () => {
    const store = await aRoutineLibraryLargerThanAPage();
    const held = ROUTINE_FILLERS + 1;
    const choices = shippedChoices();

    const resting = await readRoutineReadout(store, '');
    assert.equal(resting.total, held, 'the total counts something other than the library');
    assert.equal(resting.page.items.length, ROUTINE_PAGE_LIMIT,
      'the unfiltered list stopped paging, which is a change to paging rather than to the count');
    assert.equal(resting.page.done, false, 'the unfiltered list claims to be the whole library');

    const { intro } = describeRoutines({
      page: resting.page, search: '', choices, total: resting.total,
    });
    assert.ok(intro.includes(`${String(held)} routines in your library`),
      `the counting sentence states the page size as a library total: ${intro}`);
    assert.ok(!intro.includes(`${String(ROUTINE_PAGE_LIMIT)} routines in your library`),
      `the counting sentence still states the page size as a library total: ${intro}`);

    // AND THE TRAP ON THE OTHER SIDE. While a search is active the screen must NOT report the match
    // count as a library total, and must NOT report the library total either: the first is the
    // original defect and the second is that defect inverted.
    const searching = await readRoutineReadout(store, 'Off Page Split');
    const searchIntro = describeRoutines({
      page: searching.page, search: 'Off Page Split', choices, total: searching.total,
    }).intro;
    assert.ok(searchIntro.includes('1 routine matches "Off Page Split"'),
      `a search does not say how many matched: ${searchIntro}`);
    assert.ok(!/in your library/u.test(searchIntro),
      `a search states a number as a library total: ${searchIntro}`);
    assert.ok(!searchIntro.includes(String(held)),
      `a search sentence carries the library total: ${searchIntro}`);
  });

  it('leaves the unfiltered list paging exactly as it did, and does not page a search result', async () => {
    const store = await aRoutineLibraryLargerThanAPage();

    const resting = await readRoutineReadout(store, '');
    assert.ok(resting.page.cursor !== null,
      'the unfiltered list lost its cursor, so "show more" is gone');
    const next = await readRoutinePage(store, { search: '', after: resting.page.cursor });
    assert.equal(appendRoutinePage(resting.page, next).items.length, ROUTINE_PAGE_LIMIT * 2,
      'the second page did not append');

    // A SEARCH RESULT IS NOT PAGED: it is every match, so there is nothing left to show more of.
    // Stated as a bound rather than a claim that the library cannot outgrow it — the walk stops at
    // the house walker's page bound, and a walk that stopped short FAILS rather than returning short.
    const searching = await readRoutineReadout(store, 'Filler Routine');
    assert.equal(searching.page.items.length, ROUTINE_FILLERS,
      'a search returned a page of matches rather than every match in the library');
    assert.equal(searching.page.done, true);
    assert.equal(searching.page.cursor, null,
      'a search result offers "show more" over a result that is already complete');
  });
});

describe('searching the curves, over a fixture larger than one page', () => {
  /** A curve library BIGGER THAN TWO PAGES, with one curve that sorts onto the third. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function aCurveLibraryLargerThanAPage(): Promise<any> {
    const store = await aRealStore();
    // NO INTENSITY WORD IN ANY OF THESE NAMES. R11 binds a name that SPELLS OUT a curve to the
    // sequence it spells, so a filler called "Low Medium High" over a different sequence would be
    // refused and the fixture would be about the record's validation rather than about searching.
    const base = {
      sequence: ['low', 'medium', 'high'],
      mappingRule: 'stretch',
      description: 'A curve authored to fill the library past a page boundary.',
    };

    for (let index = 0; index < PATTERN_FILLERS; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- content keys must not race for uniqueness.
      await addPattern(store, patternContent(
        { ...base, name: `Filler Curve ${fillerSuffix(index)}` }, null,
      ));
    }
    await addPattern(store, patternContent({ ...base, name: 'Zzz Off Page Ramp' }, null));

    return store;
  }

  const namesOf = (page: { items: readonly PatternRecord[] }) =>
    page.items.map((item) => item.content.name);

  it('finds a curve that sorts onto the THIRD page, and still finds nothing for a term the whole library lacks', async () => {
    const store = await aCurveLibraryLargerThanAPage();

    const first = await readPatternPage(store);
    assert.equal(first.items.length, PATTERN_PAGE_LIMIT,
      'the fixture is not larger than a page, so it cannot tell page-scoped filtering from '
      + 'collection-scoped filtering');
    assert.equal(namesOf(first).includes('Zzz Off Page Ramp'), false,
      'the target sits ON the first page, so finding it proves nothing about searching the library');

    const second = await readPatternPage(store, { search: '', after: first.cursor });
    assert.equal(second.items.length, PATTERN_PAGE_LIMIT);
    assert.equal(namesOf(second).includes('Zzz Off Page Ramp'), false,
      'the target sits on the SECOND page, so the fixture is shallower than it claims');
    const third = await readPatternPage(store, { search: '', after: second.cursor });
    assert.equal(namesOf(third).includes('Zzz Off Page Ramp'), true,
      'the target is not on the third page either, so the fixture is not what these tests assume');

    const found = await readPatternReadout(store, 'Off Page Ramp');
    assert.deepEqual(namesOf(found.page), ['Zzz Off Page Ramp'],
      'a curve past the first page is reported as absent by a search bound to page one, while the '
      + 'uniqueness guard on the same screen refuses to let him create it');

    const absent = await readPatternReadout(store, 'Harbour Ferry Crossing');
    assert.deepEqual(namesOf(absent.page), [],
      'a term nothing in the library matches came back with results, so the filter matches '
      + 'everything and the assertion above proves nothing');
  });

  it('counts the LIBRARY, not the page, and neither sentence borrows the other number', async () => {
    const store = await aCurveLibraryLargerThanAPage();
    const held = PATTERN_FILLERS + 1;

    const resting = await readPatternReadout(store, '');
    assert.equal(resting.total, held, 'the total counts something other than the library');
    assert.equal(resting.page.items.length, PATTERN_PAGE_LIMIT,
      'the unfiltered list stopped paging, which is a change to paging rather than to the count');
    assert.equal(resting.page.done, false, 'the unfiltered list claims to be the whole library');

    // AND IT AGREES WITH THE COUNTER THE REMOVAL SENTENCE ALREADY USES. Two walks over one
    // collection that disagreed would let the screen say "this is your last curve" over a total it
    // had just contradicted.
    assert.equal(await countPatterns(store), held,
      'the readout total and the removal counter disagree about how many curves there are');

    const { intro } = describePatterns({ page: resting.page, search: '', total: resting.total });
    assert.ok(intro.includes(`${String(held)} curves in your library`),
      `the counting sentence states the page size as a library total: ${intro}`);
    assert.ok(!intro.includes(`${String(PATTERN_PAGE_LIMIT)} curves in your library`),
      `the counting sentence still states the page size as a library total: ${intro}`);

    const searching = await readPatternReadout(store, 'Off Page Ramp');
    const searchIntro = describePatterns({
      page: searching.page, search: 'Off Page Ramp', total: searching.total,
    }).intro;
    assert.ok(searchIntro.includes('1 curve matches "Off Page Ramp"'),
      `a search does not say how many matched: ${searchIntro}`);
    assert.ok(!/in your library/u.test(searchIntro),
      `a search states a number as a library total: ${searchIntro}`);
    assert.ok(!searchIntro.includes(String(held)),
      `a search sentence carries the library total: ${searchIntro}`);
  });

  it('leaves the unfiltered list paging exactly as it did, and does not page a search result', async () => {
    const store = await aCurveLibraryLargerThanAPage();

    const resting = await readPatternReadout(store, '');
    assert.ok(resting.page.cursor !== null,
      'the unfiltered list lost its cursor, so "show more" is gone');
    const next = await readPatternPage(store, { search: '', after: resting.page.cursor });
    assert.equal(appendPatternPage(resting.page, next).items.length, PATTERN_PAGE_LIMIT * 2,
      'the second page did not append');

    const searching = await readPatternReadout(store, 'Filler Curve');
    assert.equal(searching.page.items.length, PATTERN_FILLERS,
      'a search returned a page of matches rather than every match in the library');
    assert.equal(searching.page.done, true);
    assert.equal(searching.page.cursor, null,
      'a search result offers "show more" over a result that is already complete');
  });
});

/**
 * THE INTENSITY SENTENCE DOES NOT INSTRUCT HIM TO PRESS SOMETHING THAT IS NOT DRAWN.
 *
 * `LibraryRoutines.tsx` paints {@link SCALING_LIVES_ON_THE_EXERCISE} UNCONDITIONALLY and draws the
 * Open control only when the entry's exercise resolves in the catalogue. So it said "Press Open
 * beside any exercise in this routine" in TWO states that have no Open anywhere: the empty draft —
 * {@link emptyRoutineDraft} returns `entries: []`, WHICH IS THE STATE THE FORM OPENS IN when he
 * presses "Add a routine" — and a row whose exercise has left the library. s11/a41 reworded it as a
 * CONDITION and corrected the docstring that had justified the old wording in words.
 *
 * A PAIR, for the same reason as the other two sites this action touched: re-aiming an assertion at
 * the author's own new copy looks exactly like softening it. The FORBIDDING half fires if the
 * unconditional instruction returns; the REQUIRING half fires if the sentence is gutted, and it asks
 * only for things the OLD copy also said, so a probe restoring the old copy reds one half and leaves
 * the other green.
 */
describe('where the intensity points live, said on the routine form', () => {
  it('does not tell him to press a control the empty draft never draws', () => {
    assert.equal(
      emptyRoutineDraft().entries.length,
      0,
      'the form no longer opens with no entries, so the state this assertion is about is gone and '
        + 'the assertion below is no longer measuring anything',
    );
    assert.equal(
      /\bpress\b[^.]*\bopen\b/iu.test(SCALING_LIVES_ON_THE_EXERCISE),
      false,
      'the routine form again instructs him to press Open, and it is painted unconditionally while '
        + 'Open is drawn only for a row whose exercise resolves — so the form he opens by adding a '
        + `routine carries this instruction with no Open on the screen: ${SCALING_LIVES_ON_THE_EXERCISE}`,
    );
  });

  it('still says the intensity points belong to the exercise and are set once', () => {
    assert.match(
      SCALING_LIVES_ON_THE_EXERCISE,
      /three intensity points/u,
      'the routine form no longer says what it is talking about, so a coach looking for the three '
        + `points on this form is told nothing at all: ${SCALING_LIVES_ON_THE_EXERCISE}`,
    );
    assert.match(
      SCALING_LIVES_ON_THE_EXERCISE,
      /exercise itself/u,
      'the routine form no longer says the points belong to the EXERCISE rather than to the routine, '
        + `which is the whole reason the sentence is on this screen: ${SCALING_LIVES_ON_THE_EXERCISE}`,
    );
  });
});

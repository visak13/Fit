/**
 * THE CONTROLS' JUDGEMENT, ASSERTED WITH NO RENDERING AT ALL.
 *
 * Every value here is driven through the real module, and where a bound or a refusal belongs to the
 * core it is driven through the CORE rather than described in this file's own words. A suite satisfied
 * by a shape it wrote itself goes on passing while the thing it is about moves underneath it.
 *
 * ## THE FOUR ABSENCES, AND WHY AN ABSENCE NEEDS A TEST AT ALL
 *
 * `SESSION.md` §2 — no cursor, no current exercise, no next exercise, no step index, anywhere. §4 —
 * `not_yet_recorded` is a statement about the record and never a suggestion. §8 — nothing suggests,
 * proposes a heavier load or carries one forward. And the standing rule: no emoji in any user-facing
 * string. An absent feature and a forgotten one look identical to the next editor, so each is asserted
 * on the WORDS THAT REACH THE COACH and on the module's own code lines.
 *
 * EVERY ONE OF THOSE SCANS IS POINTED AT A KNOWN POSITIVE IN THE SAME RUN. A scan whose entire output
 * is an absence produces exactly the same output when it is broken, misdirected or looking for the
 * wrong shape, so its silence is worth nothing until it has been seen to find something. And the
 * source scans read CODE LINES rather than prose: this build's house style documents a prohibition in
 * a comment beside the code it constrains, so a sweep over the whole source matches the very sentences
 * explaining why the forbidden thing is forbidden.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { validatePerformedRecord } from '../../core/model/model.js';
import { assertRoom } from '../../core/session/journal.js';
import { resolvePrescription } from './effective-prescription';
import {
  CANCEL_LABEL, CONTROLS_INTRO, EDIT_LABEL, EDIT_WORDS, EMPTY_DRAFT, FIELD_HINTS,
  FIELD_LABELS, NOT_HELD_HERE, RECORDED_BOUNDS, SAVE_EDIT_LABEL, SUBSTITUTE_FILTER_LABEL,
  SUBSTITUTE_MORE_THAN_SHOWN, SUBSTITUTE_NONE_MATCH, SUBSTITUTE_ROWS_SHOWN, SUBSTITUTE_TITLE,
  SUBSTITUTE_WORDS, adjustWords, amendmentFromDraft, attemptsOf, changeDraft, closePanel,
  controlsFor, describeRefusal, draftFromFact, draftFromPrescription, draftKey, draftOf,
  draftProblem, editDraft, editKey, factFromDraft, lineDraft, lineOnTheRecord, noControls,
  noteForLine, openPanel, recorded, recording, refused, substituteChoices, substituteRows,
  typeFilter, valuesForLine,
} from './modular-control';
import type { OpenPanel, Prescription } from './modular-control';

const here = path.dirname(fileURLToPath(import.meta.url));

const TIRED = 'the-tired-client';
const OTHER = 'the-other-client';
const PRESS = 'press';
const SQUAT = 'squat';
const ROWER = 'rower';

/** What the routine asked for on the first line. */
const PRESCRIBED: Prescription = {
  sets: 3, repetitions: 12, duration_seconds: null, rest_seconds: null,
};

/** The names a store would have read back. */
const NAMES = new Map([[PRESS, 'Bench press'], [SQUAT, 'Back squat'], [ROWER, 'Rowing machine']]);

/** An exercise's own defaults, which are the other half of every line's numbers. */
const PRESS_DEFAULTS = {
  default_prescription: { sets: 3, repetitions: 12 }, default_rest_seconds: 45,
};

/**
 * EVERY WORDING THE ADJUST PANEL CAN PRODUCE, so the absence sweeps below read all four rather than
 * whichever one a fixture happened to reach.
 *
 * The panel's heading is no longer one constant sentence, because the one constant sentence it used
 * to be — "The routine's own numbers are filled in." — was FALSE on every line the routine did not
 * override, and false in the reassuring direction: it told him numbers were there when the boxes
 * were empty.
 */
const EVERY_ADJUST_WORDING: readonly string[] = [
  // Inherited only: the routine overrides nothing on this line.
  adjustWords(resolvePrescription(null, PRESS_DEFAULTS)),
  // The routine's own only: nothing left to inherit.
  adjustWords(resolvePrescription(PRESCRIBED, null)),
  // Mixed: its own sets and reps, the exercise's rest.
  adjustWords(resolvePrescription(PRESCRIBED, PRESS_DEFAULTS)),
  // Nothing from either place.
  adjustWords(resolvePrescription(null, null)),
  adjustWords(null),
];

/** A panel on one person's line. */
function aPanel(clientId: string, exerciseId: string, kind: OpenPanel['kind'] = 'adjust'): OpenPanel {
  return { kind, key: draftKey(clientId, exerciseId), clientId, exerciseId, recordId: null };
}

/** Everything this module ever says to the coach, as one blob for the absence sweeps. */
function everyWordHeReads(): string {
  const attempt = attemptsOf(
    [{
      record_id: 'a-recorded-fact',
      exercise_id: ROWER,
      substituted_for_exercise_id: SQUAT,
      status: 'substituted',
      record: { content: { repetitions: 10, observed_load: '42.5kg', note: 'Went well' } },
    }],
    NAMES,
  );

  return [
    ...EVERY_ADJUST_WORDING, CANCEL_LABEL, CONTROLS_INTRO, EDIT_LABEL, EDIT_WORDS, NOT_HELD_HERE,
    SAVE_EDIT_LABEL, SUBSTITUTE_FILTER_LABEL, SUBSTITUTE_MORE_THAN_SHOWN, SUBSTITUTE_NONE_MATCH,
    SUBSTITUTE_TITLE, SUBSTITUTE_WORDS,
    ...Object.values(FIELD_LABELS),
    ...Object.values(FIELD_HINTS),
    ...Object.values(controlsFor(false)),
    ...Object.values(controlsFor(true)),
    draftProblem({ ...EMPTY_DRAFT, repetitions: 'twelve' }) ?? '',
    draftProblem({ ...EMPTY_DRAFT, repetitions: '99999' }) ?? '',
    draftProblem({ ...EMPTY_DRAFT, note: 'x'.repeat(600) }) ?? '',
    JSON.stringify(attempt),
    JSON.stringify(describeEveryRefusal()),
  ].join('\n');
}

/** Every refusal this module can word, including the one the CORE writes rather than this file. */
function describeEveryRefusal() {
  return [
    describeRefusal(theJournalFullFailure()),
    describeRefusal(new Error('a failure nobody worded')),
    describeRefusal('not an error at all'),
  ];
}

/** The real refusal the core raises at the journal's declared bound. Thrown, not described. */
function theJournalFullFailure(): unknown {
  let thrown: unknown = null;
  try {
    assertRoom('performedPerClient', 400, { session_id: 'a-full-session' });
  } catch (error: unknown) {
    thrown = error;
  }
  assert.notEqual(thrown, null, 'the journal cap did not refuse at its own declared limit, so this '
    + 'suite is about to assert the wording of a refusal that never happened');
  return thrown;
}

/**
 * THE WORDS ABOVE THE VALUES, WHICH USED TO BE FALSE.
 *
 * "The routine's own numbers are filled in." was drawn over SIX EMPTY BOXES on the shipped Pull
 * day's Deadlift line, because that entry overrides nothing and nothing inherited the exercise's own
 * defaults. Correct wording depended on how inheritance resolved, which is why fixing the sentence
 * and fixing the inheritance are one act: wording it alone would have hidden the symptom and left the
 * coach with no numbers.
 *
 * ASSERTED ON THE WORDS THAT REACH HIM, never on the source that explains them.
 */
describe('what the panel says about whose numbers those are', () => {
  it('says they are the routine\'s own only when they actually are', () => {
    const words = adjustWords(resolvePrescription(PRESCRIBED, null));

    assert.match(words, /this routine's own numbers/i);
    assert.doesNotMatch(words, /normally done at/i);
  });

  it('says they came from the exercise when the routine overrode nothing', () => {
    const words = adjustWords(resolvePrescription(null, PRESS_DEFAULTS));

    assert.match(words, /normally done at/i);
    assert.doesNotMatch(
      words, /this routine's own numbers/i,
      'the panel claims the routine programmed numbers it inherited from the library',
    );
  });

  it('names both where both are in the boxes, which is the ordinary shipped line', () => {
    // Its own sets and reps; the rest inherited. This is the shipped Pull day's opening entry.
    const words = adjustWords(resolvePrescription(PRESCRIBED, PRESS_DEFAULTS));

    assert.match(words, /normally done at/i);
    assert.match(words, /this routine's own/i);
  });

  it('says the boxes are empty when they are, rather than saying numbers are filled in', () => {
    for (const words of [adjustWords(resolvePrescription(null, null)), adjustWords(null)]) {
      assert.match(words, /no numbers to start from/i);
      assert.doesNotMatch(
        words, /filled in|are the numbers/i,
        'the panel tells him numbers are there while the boxes are empty, which is the exact false '
          + 'sentence this replaced',
      );
    }
  });

  /**
   * THE SENTENCE ITSELF, GONE. Not asserted by reading the source — a comment quoting it would match
   * — but on every wording the panel can actually produce.
   */
  it('no longer says the routine\'s own numbers are filled in on a line that overrides nothing', () => {
    for (const words of EVERY_ADJUST_WORDING) {
      assert.doesNotMatch(
        words, /The routine's own numbers are filled in/i,
        'the false sentence is back on the panel',
      );
    }
    // The scan pointed at the sentence it is looking for, so its silence above means something.
    assert.match(
      'The routine\'s own numbers are filled in.', /The routine's own numbers are filled in/i,
    );
  });

  it('still says what the panel is for, whichever numbers are in it', () => {
    for (const words of EVERY_ADJUST_WORDING) {
      assert.match(
        words, /What you record is what you type here/,
        'a wording dropped the one sentence that says what pressing Record will write',
      );
    }
  });
});

describe('the values a move records, and every one of them overridable', () => {
  it('fills a draft from what the routine asked for, and leaves the load empty', () => {
    const draft = draftFromPrescription(PRESCRIBED);

    assert.equal(draft.sets, '3');
    assert.equal(draft.repetitions, '12');
    assert.equal(
      draft.observedLoad,
      '',
      'a load was prefilled, which is the application proposing a training load — the one judgement '
        + 'that belongs to the coach',
    );
    assert.equal(draft.note, '');
  });

  it('fills a draft for a correction from what is STORED, not from the routine', () => {
    const draft = draftFromFact({ sets_completed: 2, repetitions: 8, observed_load: '40kg' });

    assert.equal(draft.sets, '2');
    assert.equal(draft.repetitions, '8');
    assert.equal(draft.observedLoad, '40kg');
    assert.equal(draft.durationSeconds, '', 'a field the fact never carried was invented');
  });

  it('records exactly what he typed over the routine\'s numbers', () => {
    const typed = editDraft(
      editDraft(draftFromPrescription(PRESCRIBED), 'repetitions', '8'), 'observedLoad', '20kg',
    );

    assert.deepEqual(factFromDraft(typed), { sets: 3, repetitions: 8, observedLoad: '20kg' });
  });

  it('treats an emptied field as nothing recorded and a nought as a value', () => {
    assert.deepEqual(factFromDraft({ ...EMPTY_DRAFT, restSeconds: '' }), {});
    assert.deepEqual(factFromDraft({ ...EMPTY_DRAFT, restSeconds: '0' }), { restSeconds: 0 });
  });

  it('refuses a value it cannot record, with a sentence rather than half of it', () => {
    for (const draft of [
      { ...EMPTY_DRAFT, repetitions: 'twelve' },
      { ...EMPTY_DRAFT, repetitions: '-4' },
      { ...EMPTY_DRAFT, sets: '3.5' },
      { ...EMPTY_DRAFT, observedLoad: 'x'.repeat(41) },
      { ...EMPTY_DRAFT, note: 'x'.repeat(501) },
    ]) {
      assert.notEqual(draftProblem(draft), null, `${JSON.stringify(draft)} was accepted`);
      assert.equal(factFromDraft(draft), null, 'half of what he typed would have been recorded');
    }
    assert.equal(draftProblem(draftFromPrescription(PRESCRIBED)), null);
  });

  /**
   * THE BOUNDS IN THIS MODULE ARE A MIRROR OF THE MODEL'S, AND A MIRROR DRIFTS.
   *
   * So the model is driven at each boundary and required to AGREE: it accepts the maximum this module
   * offers and refuses one past it. If a bound ever moves in `performed-record.js`, the disagreement is
   * the alarm — neither reading is the authority on its own, which is the same discipline the build
   * stamp uses.
   */
  it('agrees with the record about how high each value goes', () => {
    for (const [field, ceiling] of Object.entries(RECORDED_BOUNDS)) {
      const counted = typeof ceiling === 'number' && field !== 'observed_load' && field !== 'note';
      const at = counted ? ceiling : 'x'.repeat(ceiling);
      const past = counted ? ceiling + 1 : 'x'.repeat(ceiling + 1);

      assert.equal(
        validatePerformedRecord(aFactWith(field, at)).ok,
        true,
        `the record refuses ${field} at ${ceiling}, which this module accepts — the mirror has drifted`,
      );
      assert.equal(
        validatePerformedRecord(aFactWith(field, past)).ok,
        false,
        `the record accepts ${field} past ${ceiling}, so this module is refusing a value he could `
          + 'legitimately record',
      );
    }
  });

  it('writes a cleared field as nothing recorded rather than as a value', () => {
    const amendment = amendmentFromDraft({ ...EMPTY_DRAFT, repetitions: '10' });

    assert.equal(amendment?.repetitions, 10);
    assert.equal(
      amendment?.observed_load,
      null,
      'a field he emptied came back absent from the amendment, so clearing a mistyped load would '
        + 'silently leave the old one on the record',
    );
    assert.equal(amendmentFromDraft({ ...EMPTY_DRAFT, sets: 'three' }), null);
  });
});

describe('where he is looking, and it is one person\'s line at a time', () => {
  it('seeds a panel from the routine once, and keeps what he typed when he comes back', () => {
    let state = openPanel(noControls(), aPanel(TIRED, PRESS), draftFromPrescription(PRESCRIBED));
    assert.equal(draftOf(state, draftKey(TIRED, PRESS)).repetitions, '12');

    state = changeDraft(state, 'repetitions', '8');
    state = closePanel(state);
    state = openPanel(state, aPanel(TIRED, PRESS), draftFromPrescription(PRESCRIBED));

    assert.equal(
      draftOf(state, draftKey(TIRED, PRESS)).repetitions,
      '8',
      'reopening the panel threw away the change he came back to finish',
    );
  });

  it('puts the panel away when the control that opened it is pressed again', () => {
    const opened = openPanel(noControls(), aPanel(TIRED, PRESS), EMPTY_DRAFT);
    assert.notEqual(opened.open, null);
    assert.equal(openPanel(opened, aPanel(TIRED, PRESS), EMPTY_DRAFT).open, null);
  });

  /**
   * THE REQUIREMENT, AT THE SCREEN: editing repetitions, timers or rest for one client must not
   * silently change another's. The keystroke's destination comes from the OPEN PANEL rather than from
   * the caller, so it cannot land on another person's line even by a caller's mistake.
   */
  it('lands a keystroke on one person\'s line and nobody else\'s', () => {
    let state = openPanel(noControls(), aPanel(TIRED, PRESS), draftFromPrescription(PRESCRIBED));
    state = changeDraft(state, 'repetitions', '6');
    state = closePanel(state);
    state = openPanel(state, aPanel(OTHER, PRESS), draftFromPrescription(PRESCRIBED));
    state = changeDraft(state, 'repetitions', '15');

    assert.equal(draftOf(state, draftKey(TIRED, PRESS)).repetitions, '6');
    assert.equal(draftOf(state, draftKey(OTHER, PRESS)).repetitions, '15');
    assert.equal(
      valuesForLine(state, TIRED, PRESS, PRESCRIBED)?.repetitions,
      6,
      'one person\'s repetitions followed another person\'s keystrokes',
    );
    assert.equal(valuesForLine(state, OTHER, PRESS, PRESCRIBED)?.repetitions, 15);
  });

  it('keeps two lines of one person apart as well', () => {
    let state = openPanel(noControls(), aPanel(TIRED, PRESS), EMPTY_DRAFT);
    state = changeDraft(state, 'observedLoad', '40kg');
    state = openPanel(state, aPanel(TIRED, SQUAT), EMPTY_DRAFT);
    state = changeDraft(state, 'observedLoad', '80kg');

    assert.equal(draftOf(state, draftKey(TIRED, PRESS)).observedLoad, '40kg');
    assert.equal(draftOf(state, draftKey(TIRED, SQUAT)).observedLoad, '80kg');
  });

  it('records what the routine asked for when he has changed nothing at all', () => {
    assert.deepEqual(
      valuesForLine(noControls(), TIRED, PRESS, PRESCRIBED),
      { sets: 3, repetitions: 12 },
    );
    assert.deepEqual(valuesForLine(noControls(), TIRED, PRESS, null), {});
    assert.deepEqual(lineDraft(noControls(), TIRED, PRESS, PRESCRIBED), draftFromPrescription(PRESCRIBED));
  });

  it('carries only the note into a skip', () => {
    let state = openPanel(noControls(), aPanel(TIRED, SQUAT), draftFromPrescription(PRESCRIBED));
    assert.equal(noteForLine(state, TIRED, SQUAT), null);
    state = changeDraft(state, 'note', '  Knee sore today  ');
    assert.equal(noteForLine(state, TIRED, SQUAT), 'Knee sore today');
  });

  it('forgets a draft once it is on the record, and keeps it when it is refused', () => {
    let state = openPanel(noControls(), aPanel(TIRED, PRESS), draftFromPrescription(PRESCRIBED));
    state = changeDraft(state, 'repetitions', '8');

    const landed = recorded(state, draftKey(TIRED, PRESS));
    assert.equal(landed.open, null);
    assert.equal(
      landed.drafts.has(draftKey(TIRED, PRESS)),
      false,
      'the draft outlived the fact it became, so pressing Record again would look like a repeat of '
        + 'something already recorded',
    );

    const refusal = { headline: 'Not on this device.', detail: null, journalFull: false };
    const held = refused(state, draftKey(TIRED, PRESS), refusal);
    assert.equal(draftOf(held, draftKey(TIRED, PRESS)).repetitions, '8', 'a refusal took his values '
      + 'away at the moment he has to act on them');
    assert.equal(held.refusalKey, draftKey(TIRED, PRESS));
    assert.equal(held.recording, false);
  });

  it('holds a correction\'s draft under the fact it corrects, not under the line', () => {
    const panel: OpenPanel = {
      kind: 'edit',
      key: editKey('a-recorded-fact'),
      clientId: TIRED,
      exerciseId: PRESS,
      recordId: 'a-recorded-fact',
    };
    let state = openPanel(noControls(), panel, draftFromFact({ repetitions: 12 }));
    state = changeDraft(state, 'repetitions', '10');

    assert.equal(draftOf(state, editKey('a-recorded-fact')).repetitions, '10');
    assert.equal(
      draftOf(state, draftKey(TIRED, PRESS)).repetitions,
      '',
      'correcting a recorded fact wrote into the line\'s own draft, so what he records next would '
        + 'inherit the correction',
    );
  });

  it('narrows the pool and marks a move in flight without touching a draft', () => {
    let state = openPanel(noControls(), aPanel(TIRED, PRESS), draftFromPrescription(PRESCRIBED));
    state = typeFilter(state, 'row');
    state = recording(state, true);

    assert.equal(state.typed, 'row');
    assert.equal(state.recording, true);
    assert.equal(draftOf(state, draftKey(TIRED, PRESS)).repetitions, '12');
  });
});

describe('the controls, and what their words may not imply', () => {
  it('words recording again as the act it is', () => {
    assert.equal(controlsFor(false).record, 'Record');
    assert.equal(controlsFor(true).record, 'Record again');
  });

  /**
   * NOTHING IS WITHDRAWN ONCE A LINE HAS BEEN RECORDED, and nothing appears only once it has. A control
   * set that changed shape with the record would be the application deciding which moves are still
   * open to him — which is the whole thing this screen exists not to do.
   */
  it('offers exactly the same controls whatever the record says about the line', () => {
    const fresh = controlsFor(false);
    const done = controlsFor(true);

    assert.deepEqual(Object.keys(fresh).sort(), Object.keys(done).sort());
    for (const key of Object.keys(fresh) as (keyof typeof fresh)[]) {
      if (key === 'record') continue;
      assert.equal(fresh[key], done[key], `the ${key} control changed because something was recorded`);
    }
    for (const words of Object.values(done)) assert.ok(words.length > 0);
  });
});

describe('what is already on the record for one line', () => {
  it('reports every attempt rather than only the most recent', () => {
    const reported = attemptsOf(
      [
        {
          record_id: 'first', exercise_id: PRESS, substituted_for_exercise_id: null,
          status: 'performed', record: { content: { repetitions: 12, observed_load: '40kg' } },
        },
        {
          record_id: 'second', exercise_id: PRESS, substituted_for_exercise_id: null,
          status: 'performed', record: { content: { repetitions: 10 } },
        },
      ],
      NAMES,
    );

    assert.deepEqual(reported.map((attempt) => attempt.recordId), ['first', 'second']);
    assert.equal(reported[0].values, '12 reps · 40kg');
    assert.equal(reported[0].draft.observedLoad, '40kg');
  });

  it('names the substitute and says what it stood in for', () => {
    const [reported] = attemptsOf(
      [{
        record_id: 'swapped', exercise_id: ROWER, substituted_for_exercise_id: SQUAT,
        status: 'substituted', record: { content: { duration_seconds: 300 } },
      }],
      NAMES,
    );

    assert.equal(reported.words, 'Rowing machine, recorded in its place');
    assert.equal(reported.values, '300 seconds');
    /*
     * THE NAME LEADS, and that is what the assertion above is really about. Measured at 390px: with
     * the explanation first, the row ellipsized to "Recorded with something else in…" and took the
     * one thing on it he needed. A row whose first words are the substitute survives truncation
     * saying something true and useful.
     */
    assert.ok(reported.words.startsWith('Rowing machine'), 'the substitute\'s name does not lead, so '
      + 'a narrow row truncates away the only thing on it the coach cannot get anywhere else');
  });

  it('shows a substitute the coach has since deleted by its key rather than inventing a name', () => {
    const [reported] = attemptsOf(
      [{
        record_id: 'swapped', exercise_id: 'a-deleted-exercise', substituted_for_exercise_id: SQUAT,
        status: 'substituted', record: { content: {} },
      }],
      new Map(),
    );

    assert.match(reported.words, /a-deleted-exercise/);
    assert.equal(reported.values, null);
  });

  it('reads a line out of the projection, and reports nothing where there is no line', () => {
    const view = {
      clients: [{
        client_id: TIRED,
        plan: [{
          exercise_id: PRESS,
          prescription: PRESCRIBED,
          attempts: [{
            record_id: 'first', exercise_id: PRESS, substituted_for_exercise_id: null,
            status: 'performed', record: { content: { repetitions: 12 } },
          }],
        }],
      }],
    };

    const line = lineOnTheRecord(view, TIRED, PRESS, NAMES);
    assert.equal(line?.attempts.length, 1);
    // IT DOES NOT HAND BACK A PRESCRIPTION, on purpose. It used to hand back the projection's — the
    // routine's OVERRIDES as stored — and the controls drawn from it then had no numbers on any line
    // the routine did not override. The resolved one comes from `runner.ts`'s `LineReport.effective`,
    // and a second answer here would be free to disagree with it.
    assert.equal(
      'prescription' in (line as object), false,
      'lineOnTheRecord is handing the routine\'s raw overrides back out as a prescription again',
    );
    assert.equal(lineOnTheRecord(view, OTHER, PRESS, NAMES), null);
    assert.equal(lineOnTheRecord(view, TIRED, SQUAT, NAMES), null);
  });
});

describe('the substitution pool', () => {
  const CATALOGUE = [
    { exerciseId: PRESS, name: 'Bench press' },
    { exerciseId: SQUAT, name: 'Back squat' },
    { exerciseId: ROWER, name: 'Rowing machine' },
  ];

  it('offers everything but the line\'s own exercise', () => {
    assert.deepEqual(
      substituteChoices(CATALOGUE, '', SQUAT).map((choice) => choice.exerciseId),
      [PRESS, ROWER],
    );
  });

  it('narrows on what he typed, whatever case he typed it in', () => {
    assert.deepEqual(
      substituteChoices(CATALOGUE, '  ROW  ', SQUAT).map((choice) => choice.name),
      ['Rowing machine'],
    );
    assert.deepEqual(substituteChoices(CATALOGUE, 'nothing like this', SQUAT), []);
  });

  /**
   * MEASURED BY WALKING A REAL SESSION (s6/a4): the shipped catalogue is around a hundred exercises,
   * and drawing the lot put a hundred rows inside one line of one person's card on a phone. Legible,
   * and a wall — he would scroll past the rest of the session to get out of it.
   */
  it('draws a bounded number of rows, and says how many it did not draw', () => {
    const wide = [...Array(101).keys()].map((index) => ({
      exerciseId: `exercise-${index}`, name: `Exercise ${index}`,
    }));

    const rows = substituteRows(wide, '', SQUAT);
    assert.equal(rows.shown.length, SUBSTITUTE_ROWS_SHOWN);
    assert.equal(rows.matched, 101);
    assert.match(
      rows.moreWords ?? '',
      /12 of 101/,
      'the list was bounded in silence, which reads to him as the whole library',
    );
  });

  it('says nothing about more rows once everything that matched is drawn', () => {
    const rows = substituteRows(CATALOGUE, '', SQUAT);
    assert.equal(rows.shown.length, 2);
    assert.equal(rows.matched, 2);
    assert.equal(rows.moreWords, null);
  });
});

describe('when a move is refused', () => {
  /**
   * THE CORE'S OWN SENTENCE, driven through the real `assertRoom` rather than described here. The
   * journal cap is a real, reachable state and its message already says the record is intact.
   */
  it('carries the journal-full sentence through unchanged, and marks the state', () => {
    const thrown = theJournalFullFailure();
    const report = describeRefusal(thrown);
    assert.equal(report.journalFull, true);
    assert.equal(report.headline, (thrown as Error).message, 'the coach is shown a second sentence '
      + 'about one refusal, free to drift from the core\'s');
    assert.equal(report.detail, null);
    assert.match(report.headline, /Nothing has been lost/);
  });

  it('reports a failure nobody worded, with its own text kept', () => {
    const report = describeRefusal(new TypeError('cannot read properties of undefined'));

    assert.ok(report.headline.length > 0, 'a control that fails in silence');
    assert.equal(report.journalFull, false);
    assert.match(report.detail ?? '', /TypeError: cannot read properties of undefined/);
  });

  it('reports something thrown that is not an error at all', () => {
    const report = describeRefusal('the platform threw a string');
    assert.ok(report.headline.length > 0);
    assert.match(report.detail ?? '', /the platform threw a string/);
  });

  it('names the way back when this window is not holding the session', () => {
    assert.match(NOT_HELD_HERE, /Calendar/);
  });
});

describe('the rules this screen could break with no test noticing', () => {
  /** One file's CODE LINES, with the prose that documents its prohibitions left out. */
  async function codeOf(file: string): Promise<string> {
    const text = await readFile(path.join(here, file), 'utf8');
    return text
      .split('\n')
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
      })
      .join('\n')
      .toLowerCase();
  }

  /**
   * NO CURSOR, ANYWHERE. Not in what the coach reads, and not in this module's code. Two sources of
   * truth about where a session is would eventually disagree, in the middle of a real session with a
   * client waiting.
   */
  it('says nothing about where the session has got to', () => {
    const words = everyWordHeReads().toLowerCase();

    for (const forbidden of ['current exercise', 'currentexercise', 'next exercise', 'nextexercise',
      'step index', 'stepindex', 'cursor', 'up next', 'coming up', 'you are on', 'move on to']) {
      assert.ok(
        !words.includes(forbidden),
        `the coach is told "${forbidden}", which is a position in a script. SESSION.md §2: a session `
          + 'is a record of what OCCURRED and the application never dictates what happens after.',
      );
    }

    // The scan pointed at a known positive, so its silence above means something.
    assert.ok('a cursor and up next'.includes('cursor'));
    assert.ok('a cursor and up next'.includes('up next'));
  });

  it('names no cursor in its own code, and none in the drawing either', async () => {
    for (const file of ['modular-control.ts', 'modular-control-source.ts', 'SessionControls.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const forbidden of ['currentexercise', 'nextexercise', 'stepindex', 'cursor']) {
        assert.ok(!code.includes(forbidden), `${file} names ${forbidden} in its code`);
      }
      // The same scan, pointed at something every one of these files genuinely has.
      assert.ok(code.includes('exerciseid'), `the scan read no code at all out of ${file}`);
    }
  });

  /**
   * THE FAMILY HOLDS THE TEMPTATION AND THE DRAWING MUST NOT REACH FOR IT. `session-next-exercise` and
   * `session-previous-exercise` are real glyphs; a next and a previous only mean anything if the
   * application knows where he is.
   */
  it('draws no next and no previous', async () => {
    const drawing = await codeOf('SessionControls.tsx');

    for (const forbidden of ['session-next-exercise', 'session-previous-exercise']) {
      assert.ok(!drawing.includes(forbidden), `the drawing uses ${forbidden}, which is a cursor with `
        + 'a picture on it');
    }
    assert.ok(
      drawing.includes('session-skip-exercise'),
      'the scan found no glyph name at all in the drawing, so it proves nothing about the two above',
    );
  });

  /**
   * NOTHING SUGGESTS ANYTHING. No proposed load, no progression, nothing carried forward, and no
   * wording that turns `not_yet_recorded` into a list of what to do.
   */
  it('says nothing that suggests, recommends or proposes', () => {
    const words = everyWordHeReads().toLowerCase();

    for (const forbidden of ['suggest', 'recommend', 'progression', 'you should', 'ought to',
      'increase', 'heavier', 'next time', 'remaining', 'still to do', 'waiting for you']) {
      assert.ok(
        !words.includes(forbidden),
        `the coach is told "${forbidden}". The app supports and the coach decides; a training-load `
          + 'judgement belongs to a certified professional adapting to a client\'s history.',
      );
    }
    assert.ok('we suggest something heavier next time'.includes('suggest'));
    assert.ok('we suggest something heavier next time'.includes('heavier'));
  });

  it('carries no emoji in anything it says', () => {
    const words = everyWordHeReads();

    assert.doesNotMatch(words, /\p{Extended_Pictographic}/u, 'an emoji reached a user-facing string');
    // WRITTEN AS AN ESCAPE, never as a literal character: a probe written as the character itself puts
    // a real emoji into the source tree, which is the thing being forbidden.
    assert.match('\u{1F600}', /\p{Extended_Pictographic}/u, 'the emoji scan cannot see an emoji');
  });

  /** Every sentence he reads is a sentence, so a blank one cannot pass as an absence of one. */
  it('leaves nothing it says empty', () => {
    for (const words of [...EVERY_ADJUST_WORDING, CONTROLS_INTRO, EDIT_WORDS, NOT_HELD_HERE,
      SUBSTITUTE_WORDS,
      SUBSTITUTE_TITLE, SUBSTITUTE_NONE_MATCH, SUBSTITUTE_MORE_THAN_SHOWN, SUBSTITUTE_FILTER_LABEL,
      CANCEL_LABEL, EDIT_LABEL, SAVE_EDIT_LABEL]) {
      assert.ok(words.trim().length > 0);
    }
    for (const label of Object.values(FIELD_LABELS)) assert.ok(label.trim().length > 0);
  });
});

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * A whole performed record with ONE field set to a candidate value, for the agreement test.
 *
 * Every other field is a valid minimum, so the only thing the model can object to is the field under
 * test — otherwise a bound that had drifted would be hidden behind an unrelated issue.
 */
function aFactWith(field: string, value: number | string): Record<string, unknown> {
  return {
    session_id: '33333333-3333-4333-8333-333333333333',
    client_id: '11111111-1111-4111-8111-111111111111',
    exercise_id: PRESS,
    position: 0,
    status: 'performed',
    recorded_at: '2026-07-26T09:00:00.000Z',
    [field]: value,
  };
}


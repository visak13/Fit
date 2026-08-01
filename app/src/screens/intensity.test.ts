/**
 * THE INTENSITY SURFACE'S JUDGEMENT — driven with no rendering at all.
 *
 * Five of the promises this action exists to keep are ABSENCES, and an absence is the one shape of
 * evidence this build has repeatedly caught lying: nothing is applied without acceptance, no load is
 * ever proposed, no value is locked after acceptance, nothing is described as a recommendation, and the
 * order never consults what has been recorded. So each is handled the way `core/intensity` handles its
 * own six:
 *
 *  - **A non-vacuity probe in the same run.** Every sweep is pointed at a known positive alongside the
 *    real subject, and the poison is asserted PRESENT before the sweep is asked about the subject. A
 *    broken sweep and a clean subject produce identical silence.
 *  - **Proved by breaking.** Each guard was broken on purpose, the break confirmed on disk, the suite
 *    watched going red, and the file restored — and the strengthened guard confirmed GREEN on the
 *    unbroken tree FIRST, because a probe that reports red proves nothing until that is known (s6/a5).
 *
 * The sweeps read the SENTENCES that reach the coach and the CODE LINES with the prose stripped, never
 * the prose that explains a prohibition: a sweep pointed at documentation either fails on its own
 * comments or gets "fixed" by deleting the explanation.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  LOAD_WORDS, PROGRESSION_WORDS, findEmoji, findWords,
} from '../../core/intensity/intensity.js';
import {
  ACCEPT_LABEL, COULD_NOT_SHAPE, NO_PATTERNS, RECORD_STAND_IN_LABEL, REJECT_LABEL, REJECT_WORDS,
  SET_ASIDE_LABEL, SHORTFALL_TITLE, TOGGLES_TITLE, TOGGLES_WORDS, VALUES_WORDS, WHY_TITLE, accepted,
  acceptedLine, acceptedWords, calibrationMark, changeProposed, draftFromEffort, effortWords, holding,
  levelWords, linesInOrder, noIntensity, proposalProblem, proposalTitle, proposedDraft, proposedKey,
  refusedToShape, rejected, setAside, shaping, showing, standsInWords, surfaceSentences, toggleFor,
  withLevel,
} from './intensity';
import type { ProposedEffort, RoomProposal } from './intensity';
import {
  EMPTY_DRAFT, changeDraft, draftKey, lineDraft, noControls, openPanel, recorded, valuesForLine,
} from './modular-control';
import type { Prescription } from './modular-control';
import { DESTINATIONS } from '../shell/navigation';

const here = path.dirname(fileURLToPath(import.meta.url));

const TIRED = 'the-tired-client';
const FRESH = 'the-fresh-client';
const PRESS = 'press';
const SQUAT = 'squat';
const PLANK = 'plank';
/** In the library and named by no routine. The surplus IS the substitution pool. */
const ROWER = 'rower';

/** The routine's DECLARED order — a default and not a script. */
const DECLARED = [
  { exerciseId: PRESS, name: 'Bench press', notYetRecorded: true },
  { exerciseId: SQUAT, name: 'Back squat', notYetRecorded: true },
  { exerciseId: PLANK, name: 'Front plank', notYetRecorded: true },
];

/** What the routine asks for on the press. */
const PRESCRIBED: Prescription = {
  sets: 3, repetitions: 12, duration_seconds: null, rest_seconds: 60,
};

/** One person's numbers at one position, in the shape `core/intensity` hands them over. */
function anEffort(over: Partial<ProposedEffort> = {}): ProposedEffort {
  return {
    measurement: 'repetitions',
    sets: 3,
    repetitions: 14,
    durationSeconds: null,
    restSeconds: 30,
    referenceWords: 'Built from what this client did on 2026-07-01: 3 sets of 14 repetitions, '
      + 'resting 30 seconds, at the high point.',
    referenceSource: 'measured-performance',
    heldBackWords: null,
    ...over,
  };
}

/**
 * A CURVE SHAPED ACROSS THE ROUTINE, for two people with different records.
 *
 * The curve's order is plank, press, squat — a genuine reordering of the declared press, squat, plank —
 * and position 1 stands the ROWER, out of the wider library, on the press's line. Both halves of what
 * the adapter does are therefore present: the sequence moved AND the numbers differ per person.
 */
function aProposal(over: Partial<RoomProposal> = {}): RoomProposal {
  return {
    patternId: 'a-curve',
    patternName: 'A curve of your own',
    standingWords: [
      'Nothing here has been changed and nothing has been saved. Every value is yours to alter, and '
      + 'the whole shape can be set aside.',
    ],
    curveWords: 'Three points across three exercises, one each.',
    shortfallWords: [],
    rows: [
      {
        position: 0,
        askedForLevel: 'low',
        exerciseId: PLANK,
        exerciseName: 'Front plank',
        fromLibrary: false,
        lineExerciseId: PLANK,
        standsInForName: null,
        substitutionWords: null,
        shortfallWords: null,
      },
      {
        position: 1,
        askedForLevel: 'high',
        exerciseId: ROWER,
        exerciseName: 'Rowing machine',
        fromLibrary: true,
        lineExerciseId: PRESS,
        standsInForName: 'Bench press',
        substitutionWords: 'Rowing machine comes from your wider library, in place of Bench press.',
        shortfallWords: null,
      },
      {
        position: 2,
        askedForLevel: 'low',
        exerciseId: SQUAT,
        exerciseName: 'Back squat',
        fromLibrary: false,
        lineExerciseId: SQUAT,
        standsInForName: null,
        substitutionWords: null,
        shortfallWords: null,
      },
    ],
    people: [
      {
        clientId: TIRED,
        name: 'The tired one',
        calibrated: true,
        baselineWords: 'Built from what this client has done at 2 movements, most recently on 2026-07-01.',
        efforts: [
          anEffort({ measurement: 'time', repetitions: null, durationSeconds: 20, sets: 2, restSeconds: 60 }),
          anEffort({ repetitions: 18, sets: 4, restSeconds: 30 }),
          anEffort({ repetitions: 8, sets: 2, restSeconds: 60 }),
        ],
      },
      {
        clientId: FRESH,
        name: 'The fresh one',
        calibrated: false,
        baselineWords: 'There is nothing recorded for this client yet, so every number here comes from '
          + 'your own exercise library and this routine rather than from anything this client has '
          + 'done. Read it as a starting point, not as a measurement.',
        efforts: [
          anEffort({
            measurement: 'time', repetitions: null, durationSeconds: 25, sets: 3, restSeconds: 45,
            referenceSource: 'library-scaling-point',
            referenceWords: "Built from your library's own low point for Front plank, because nothing "
              + 'recorded and nothing in this routine says otherwise.',
          }),
          anEffort({
            repetitions: 14, sets: 4, restSeconds: 30, referenceSource: 'library-scaling-point',
            referenceWords: "Built from your library's own high point for Rowing machine, because "
              + 'nothing recorded and nothing in this routine says otherwise.',
          }),
          anEffort({
            repetitions: 10, sets: 3, restSeconds: 45, referenceSource: 'library-scaling-point',
            referenceWords: "Built from your library's own low point for Back squat, because nothing "
              + 'recorded and nothing in this routine says otherwise.',
          }),
        ],
      },
    ],
    ...over,
  };
}

/**
 * One file's CODE, with the prose that documents its prohibitions left out.
 *
 * BLOCK COMMENTS ARE REMOVED WHOLE, and the line-prefix filter the sibling suites use is not enough
 * here — measured while writing this: a JSX comment's continuation lines start with ordinary words
 * rather than with a star, so `{/* ... adapter's ... *\/}` survived the filter and its apostrophe
 * opened a string literal that ran through half the file. A sweep pointed at documentation either
 * fails on its own comments or gets "fixed" by deleting the explanation, which is exactly what that
 * would have caused.
 */
async function codeOf(file: string): Promise<string> {
  const text = await readFile(path.join(here, file), 'utf8');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .toLowerCase();
}

/** Every name this surface interpolates into its own sentences — the coach's content, not our wording. */
const NAMES = [
  'A curve of your own', 'Front plank', 'Bench press', 'Back squat', 'Rowing machine',
];

// ═══════════════════════════════════════════════════════════════════════════════
// The toggles are the shipped DATA and not a list in the source
// ═══════════════════════════════════════════════════════════════════════════════

describe('the curves he presses', () => {
  it('spells the sequence out beside the name, because a name need not', () => {
    const toggle = toggleFor({
      id: 'steady', name: 'Steady Build', sequence: ['low', 'medium', 'high'], description: 'One climb.',
    });

    assert.equal(toggle.patternId, 'steady');
    assert.equal(toggle.name, 'Steady Build');
    assert.equal(toggle.curveWords, 'low · medium · high');
    assert.equal(toggle.words, 'One climb.');
  });

  it('carries a pattern with no description as one, rather than inventing words for it', () => {
    const toggle = toggleFor({ id: 'x', name: 'His own curve', sequence: ['low', 'high'] });
    assert.equal(toggle.words, '');
  });

  /**
   * THE WHOLE POINT OF PATTERNS BEING A RECORD KIND. A shipped curve's content key appearing as a
   * literal in any of these three files is a hard-coded list starting, and it would make the shipped
   * set the only set — every button a lie the moment he edited or deleted a curve.
   *
   * Broken on purpose by pasting `low-medium-high-low` into `intensity.ts`; the break was confirmed on
   * disk and this went red. Restored.
   */
  it('holds no shipped curve of its own, in any of the three files', async () => {
    const shipped = [
      'low-medium-high-low', 'low-high-low-high-low', 'low-medium-low-medium-low',
      'steady-build', 'descending-taper', 'interval-alternation',
    ];

    for (const file of ['intensity.ts', 'intensity-source.ts', 'SessionIntensity.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const curve of shipped) {
        assert.ok(!code.includes(curve), `${file} names the shipped curve ${curve}, so the buttons are `
          + 'a list in the source rather than the library he can edit');
      }
      // The same scan, pointed at something every one of these files genuinely has.
      assert.ok(code.includes('intensity'), `the scan read no code at all out of ${file}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IT PROPOSES. THE COACH DISPOSES
// ═══════════════════════════════════════════════════════════════════════════════

describe('nothing is applied without acceptance', () => {
  /**
   * THE STRONGEST FORM OF THE GUARANTEE AVAILABLE: this module cannot write, so no reading of it can
   * be wrong about whether it did. Its whole return value is transient screen state.
   *
   * Broken on purpose by adding `import { openLocalStore } from '../../core/store/store.js'` to
   * `intensity.ts`; the break was confirmed on disk and this went red. Restored.
   */
  it('reaches no store, no handle and no session verb at all', async () => {
    const code = await codeOf('intensity.ts');

    for (const forbidden of ['store', 'recordperformed', 'recordsubstitution', 'heldsession',
      'opensession', 'await', 'async', 'localstore', 'commit', 'persist']) {
      assert.ok(!code.includes(forbidden), `intensity.ts names ${forbidden}, so it is no longer a `
        + 'module that only decides — and a module that both proposes and applies is one refactor away '
        + 'from applying silently');
    }
    // Pointed at a known positive, so the silence above means something.
    assert.ok(code.includes('accepted'), 'the scan read no code at all out of intensity.ts');
  });

  /**
   * ACCEPTING PRODUCES SCREEN STATE AND NOTHING ELSE. The numbers land in the controls' own drafts —
   * the same drafts the Adjust panel edits and the Record control writes from — so a fact still reaches
   * the record only when he presses Record with the numbers in front of him.
   */
  it('accepting fills the lines in and produces only the controls own drafts', () => {
    const proposal = aProposal();
    const { accepted: held, controls } = accepted(noIntensity(), proposal, noControls());

    // Every person, every line the curve reached.
    assert.equal(controls.drafts.size, 6);
    assert.deepEqual(controls.drafts.get(draftKey(TIRED, PRESS)), {
      ...EMPTY_DRAFT, sets: '4', repetitions: '18', restSeconds: '30',
    });
    assert.deepEqual(controls.drafts.get(draftKey(FRESH, PRESS)), {
      ...EMPTY_DRAFT, sets: '4', repetitions: '14', restSeconds: '30',
    });

    // Nothing else about the controls moved: no panel opened for him, nothing recorded.
    assert.equal(controls.open, null);
    assert.equal(controls.recording, false);
    assert.equal(held.patternName, 'A curve of your own');
  });

  it('leaves a line the curve did not reach exactly as it was', () => {
    const proposal = aProposal({
      rows: aProposal().rows.slice(0, 1),
      people: aProposal().people.map((person) => ({ ...person, efforts: [person.efforts[0]] })),
    });
    const before = changeDraft(
      openPanel(noControls(), {
        kind: 'adjust', key: draftKey(TIRED, SQUAT), clientId: TIRED, exerciseId: SQUAT, recordId: null,
      }, EMPTY_DRAFT),
      'observedLoad',
      '40 on each side',
    );

    const { controls } = accepted(noIntensity(), proposal, before);

    assert.equal(
      controls.drafts.get(draftKey(TIRED, SQUAT))?.observedLoad,
      '40 on each side',
      'accepting a curve threw away what he had typed on a line the curve said nothing about',
    );
  });
});

describe('rejecting outright, landing back exactly where he was', () => {
  it('puts the panel away and changes nothing else', () => {
    const before = noIntensity();
    const after = rejected(showing(before, aProposal()));

    assert.deepEqual(after, before, 'rejecting did not land him back where he was');
  });

  it('keeps a curve he had already accepted, because rejecting a NEW one is not setting that aside', () => {
    const first = holding(noIntensity(), accepted(noIntensity(), aProposal(), noControls()));
    const after = rejected(showing(first, aProposal({ patternId: 'another', patternName: 'Another' })));

    assert.notEqual(after.accepted, null);
    assert.equal(after.accepted?.patternId, 'a-curve');
    assert.equal(after.showing, null);
  });

  it('clears what he had typed over the proposal, since the proposal is gone', () => {
    const typed = changeProposed(showing(noIntensity(), aProposal()), proposedKey(TIRED, 1), 'sets', '9');
    assert.equal(rejected(typed).edits.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Every value stays overridable — before acceptance and after it
// ═══════════════════════════════════════════════════════════════════════════════

describe('every value is his to alter', () => {
  /**
   * THE FIRST KEYSTROKE MUST NOT EMPTY THE NUMBERS BESIDE THE ONE HE TYPED.
   *
   * FOUND IN A BROWSER, with this whole suite green — the test above asserted the field he typed into
   * and never the two he did not, so seeding the first edit from an EMPTY draft passed. On screen,
   * changing the repetitions wiped the calibrated sets and rest next to them.
   */
  it('keeps the numbers beside the one he changed, on the very first keystroke', () => {
    const proposal = aProposal();
    const effort = proposal.people[0].efforts[1];
    const state = showing(noIntensity(), proposal);
    const seed = proposedDraft(state, TIRED, 1, effort);

    const typed = changeProposed(state, proposedKey(TIRED, 1), 'repetitions', '12', seed);
    const after = proposedDraft(typed, TIRED, 1, effort);

    assert.equal(after.repetitions, '12');
    assert.equal(after.sets, '4', 'the sets were emptied by a keystroke in the repetitions');
    assert.equal(after.restSeconds, '30', 'the rest was emptied by a keystroke in the repetitions');
    assert.deepEqual(
      accepted(typed, proposal, noControls()).controls.drafts.get(draftKey(TIRED, PRESS)),
      { ...EMPTY_DRAFT, sets: '4', repetitions: '12', restSeconds: '30' },
      'the emptied numbers reached the lines, so accepting recorded blanks where a curve had numbers',
    );
  });

  it('takes a keystroke over a proposed number, per person and per position', () => {
    const state = showing(noIntensity(), aProposal());
    const proposal = aProposal();

    const typed = changeProposed(state, proposedKey(TIRED, 1), 'repetitions', '12');

    assert.equal(
      proposedDraft(typed, TIRED, 1, proposal.people[0].efforts[1]).repetitions,
      '12',
    );
    assert.equal(
      proposedDraft(typed, FRESH, 1, proposal.people[1].efforts[1]).repetitions,
      '14',
      "altering one person's numbers moved another's",
    );
    assert.equal(
      proposedDraft(typed, TIRED, 2, proposal.people[0].efforts[2]).repetitions,
      '8',
      'altering one position moved another position for the same person',
    );
  });

  it('accepts what he typed rather than what was proposed', () => {
    const typed = changeProposed(
      showing(noIntensity(), aProposal()), proposedKey(TIRED, 1), 'repetitions', '12',
    );

    const { controls, accepted: held } = accepted(typed, aProposal(), noControls());

    assert.equal(controls.drafts.get(draftKey(TIRED, PRESS))?.repetitions, '12');
    assert.equal(held.lines.get(draftKey(TIRED, PRESS))?.values.repetitions, '12');
  });

  it('refuses a proposal carrying a number the record would refuse, in the panel he already knows', () => {
    const typed = changeProposed(
      showing(noIntensity(), aProposal()), proposedKey(TIRED, 1), 'repetitions', '9999',
    );

    const problem = proposalProblem(typed, aProposal());
    assert.match(String(problem), /1000/);
    assert.equal(proposalProblem(showing(noIntensity(), aProposal()), aProposal()), null);
  });

  /**
   * THE PROPERTY THE ACTION NAMES: accepting a proposal is not a commitment to its numbers. Nothing is
   * locked, because what acceptance produced is a DRAFT — and a draft is exactly what the Adjust panel
   * edits.
   */
  it('leaves every accepted value editable afterwards, by the ordinary panel', () => {
    const { controls } = accepted(noIntensity(), aProposal(), noControls());

    const opened = openPanel(controls, {
      kind: 'adjust', key: draftKey(TIRED, PRESS), clientId: TIRED, exerciseId: PRESS, recordId: null,
    }, controls.drafts.get(draftKey(TIRED, PRESS)) ?? EMPTY_DRAFT);
    const edited = changeDraft(opened, 'repetitions', '6');

    assert.equal(lineDraft(edited, TIRED, PRESS, PRESCRIBED).repetitions, '6');
    assert.deepEqual(valuesForLine(edited, TIRED, PRESS, PRESCRIBED), {
      sets: 4, repetitions: 6, restSeconds: 30,
    });
  });

  /**
   * HIS KEYSTROKES BEAT THE CURVE'S NUMBERS, and the precedence has to be asserted with BOTH present.
   *
   * A probe caught this: with only one source in play at a time, reversing `lineDraft`'s precedence so
   * the curve's seed overrode what he typed left every test green — the "editable afterwards" case above
   * passes no seed, and the repeat case below types nothing. A value he changed by hand and then watched
   * revert to the proposal's is exactly the failure "every value stays overridable" is about.
   */
  it('prefers what he typed over the curve s numbers when both are present', () => {
    const { accepted: held, controls } = accepted(noIntensity(), aProposal(), noControls());
    const seed = acceptedLine(held, TIRED, PRESS)?.values ?? null;
    const edited = changeDraft(
      openPanel(controls, {
        kind: 'adjust', key: draftKey(TIRED, PRESS), clientId: TIRED, exerciseId: PRESS, recordId: null,
      }, seed ?? EMPTY_DRAFT),
      'repetitions',
      '6',
    );

    assert.equal(seed?.repetitions, '18', 'the fixture no longer has two different numbers in play');
    assert.equal(
      lineDraft(edited, TIRED, PRESS, PRESCRIBED, seed).repetitions,
      '6',
      'the curve s number overrode what he typed, so a value he changed by hand reverts under him',
    );
    assert.deepEqual(
      valuesForLine(edited, TIRED, PRESS, PRESCRIBED, seed),
      { sets: 4, repetitions: 6, restSeconds: 30 },
    );
  });

  /**
   * A REPEAT UNDER AN ACCEPTED CURVE IS STILL THE CURVE'S. `recorded()` deletes a draft once its fact
   * is on the record — correctly — and without the seed the line would fall back to the ROUTINE'S
   * numbers, so pressing Record twice on a shaped session would quietly record two different things.
   *
   * Broken on purpose by dropping the `seed` argument from `lineDraft`; this went red. Restored.
   */
  it('offers the curve numbers again after a fact has landed, not the routine s', () => {
    const { accepted: held, controls } = accepted(noIntensity(), aProposal(), noControls());
    const after = recorded(controls, draftKey(TIRED, PRESS));
    const line = acceptedLine(held, TIRED, PRESS);

    assert.equal(after.drafts.has(draftKey(TIRED, PRESS)), false);
    assert.equal(
      lineDraft(after, TIRED, PRESS, PRESCRIBED, line?.values ?? null).repetitions,
      '18',
      'a repeat under an accepted curve fell back to the routine, so it recorded something he did not '
        + 'accept',
    );
    // And with no accepted curve the routine is still the floor, unchanged.
    assert.equal(lineDraft(after, TIRED, PRESS, PRESCRIBED).repetitions, '12');
  });
});

describe('setting an accepted shape aside', () => {
  it('clears the curve s numbers and the order, because nothing was ever written', () => {
    const acceptance = accepted(noIntensity(), aProposal(), noControls());
    const state = holding(noIntensity(), acceptance);

    const done = setAside(state, acceptance.controls);

    assert.equal(done.state.accepted, null);
    assert.equal(done.controls.drafts.size, 0);
    assert.deepEqual(linesInOrder(DECLARED, done.state.accepted), DECLARED);
  });

  it('keeps a line he changed himself after accepting, which is his own work', () => {
    const acceptance = accepted(noIntensity(), aProposal(), noControls());
    const state = holding(noIntensity(), acceptance);
    const his = changeDraft(
      openPanel(acceptance.controls, {
        kind: 'adjust', key: draftKey(TIRED, SQUAT), clientId: TIRED, exerciseId: SQUAT, recordId: null,
      }, EMPTY_DRAFT),
      'observedLoad',
      '20 kettlebell',
    );

    const done = setAside(state, his);

    assert.equal(done.controls.drafts.get(draftKey(TIRED, SQUAT))?.observedLoad, '20 kettlebell');
    assert.equal(
      done.controls.drafts.has(draftKey(TIRED, PRESS)),
      false,
      'a line he never touched kept the curve s numbers after the shape was set aside',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// It reorders — and the order is his instruction, never a reading of the record
// ═══════════════════════════════════════════════════════════════════════════════

describe('the order', () => {
  it('puts the routine s lines in the curve s order', () => {
    const { accepted: held } = accepted(noIntensity(), aProposal(), noControls());

    assert.deepEqual(
      linesInOrder(DECLARED, held).map((line) => line.exerciseId),
      [PLANK, PRESS, SQUAT],
      'the accepted curve did not reorder the lines, so half of what the adapter produced is hidden',
    );
  });

  it('returns the lines untouched when he has accepted nothing', () => {
    assert.deepEqual(linesInOrder(DECLARED, null), DECLARED);
  });

  /**
   * A CURVE WITH FEWER POINTS THAN THE ROUTINE HAS EXERCISES MUST NOT MAKE LINES DISAPPEAR. The adapter
   * keeps the session's full length and so does the screen.
   */
  it('keeps every line exactly once, with the ones the curve did not reach after them', () => {
    const short = aProposal({
      rows: [aProposal().rows[2]],
      people: aProposal().people.map((person) => ({ ...person, efforts: [person.efforts[2]] })),
    });
    // The one row the curve placed sits on the SQUAT's line at position 0 of its own list.
    const { accepted: held } = accepted(noIntensity(), { ...short, rows: [{ ...short.rows[0], position: 0 }] }, noControls());

    const ordered = linesInOrder(DECLARED, held).map((line) => line.exerciseId);
    assert.deepEqual(ordered, [SQUAT, PRESS, PLANK]);
    assert.equal(new Set(ordered).size, DECLARED.length, 'a line was dropped or duplicated');
  });

  /**
   * THE RULE THIS COULD BREAK WITH NO TEST NOTICING. `SESSION.md` §2 and `runner.ts`: a list ordered by
   * what has been recorded is the application telling him where to go next. This order is the curve he
   * pressed and nothing else, so the SAME lines with the opposite record produce the SAME order.
   *
   * Broken on purpose by sorting `linesInOrder`'s output on `notYetRecorded`; this went red. Restored.
   */
  it('does not consult what has been recorded, in either direction', () => {
    const { accepted: held } = accepted(noIntensity(), aProposal(), noControls());

    /**
     * A MIXED RECORD, WHICH IS WHAT MAKES THIS ASSERTION ABLE TO FAIL AT ALL.
     *
     * A probe caught this: with every line in the SAME state, a sort injected into `linesInOrder` was
     * stable and changed nothing, so both a sorting version and an honest one passed. The middle line
     * of the curve is the one recorded here, so any sort on the outcome has to move it.
     */
    const mixed = [
      { ...DECLARED[0], notYetRecorded: true },
      { ...DECLARED[1], notYetRecorded: false },
      { ...DECLARED[2], notYetRecorded: true },
    ];
    const inverse = mixed.map((line) => ({ ...line, notYetRecorded: !line.notYetRecorded }));

    assert.deepEqual(
      linesInOrder(mixed, held).map((line) => line.exerciseId),
      [PLANK, PRESS, SQUAT],
      'the order stopped being the curve s once something was recorded against a line',
    );
    assert.deepEqual(
      linesInOrder(inverse, held).map((line) => line.exerciseId),
      linesInOrder(mixed, held).map((line) => line.exerciseId),
      'inverting what has been recorded changed the order, so the order is a reading of the record',
    );
    assert.deepEqual(
      linesInOrder(inverse, null).map((line) => line.exerciseId),
      linesInOrder(mixed, null).map((line) => line.exerciseId),
    );
    assert.deepEqual(
      linesInOrder(mixed, null).map((line) => line.exerciseId),
      [PRESS, SQUAT, PLANK],
      'with no accepted curve the lines came back in something other than the routine s own order',
    );
  });

  /**
   * NO POSITION IN A SESSION, ANYWHERE IN THE CODE.
   *
   * `cursor` is forbidden in the two files that have no business paging anything, and NOT in
   * `intensity-source.ts` — which pages the exercise library, where a cursor is the store's own word
   * for the next page and has nothing to do with where a session has got to. That is a real
   * distinction rather than a softening, and it is why the word is checked per file instead of once:
   * a blanket ban would have been "fixed" by renaming a paging variable, which proves nothing.
   *
   * Broken on purpose by adding `const currentExercise = 0` to `intensity.ts`; this went red. Restored.
   */
  it('names no position, cursor or next exercise in its code', async () => {
    const always = ['currentexercise', 'nextexercise', 'stepindex',
      'session-next-exercise', 'session-previous-exercise'];

    for (const file of ['intensity.ts', 'intensity-source.ts', 'SessionIntensity.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      const forbidden = file === 'intensity-source.ts' ? always : [...always, 'cursor'];
      for (const word of forbidden) {
        assert.ok(!code.includes(word), `${file} names ${word}, which is a position in a script — `
          + 'SESSION.md §2');
      }
      assert.ok(code.includes('position'), `the scan read no code at all out of ${file}`);
    }

    // And the one file allowed the word must only be using it for PAGING, never for a session.
    const source = await codeOf('intensity-source.ts');
    for (const match of source.match(/[a-z.]*cursor/g) ?? []) {
      assert.match(match, /^page\.cursor$|^cursor$/, `intensity-source.ts has a ${match}, which is no `
        + "longer the store's paging cursor");
    }

    // Pointed at known positives so the silence above means something.
    assert.ok('a currentexercise and a stepindex'.includes('currentexercise'));
    assert.ok('a currentexercise and a stepindex'.includes('stepindex'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// It scales — and the calibration is visible rather than implied
// ═══════════════════════════════════════════════════════════════════════════════

describe('the numbers and where they came from', () => {
  it('carries a repetition-counted position and a time-counted one, each in its own unit', () => {
    const proposal = aProposal();
    const reps = draftFromEffort(proposal.people[0].efforts[1]);
    const timed = draftFromEffort(proposal.people[0].efforts[0]);

    assert.equal(reps.repetitions, '18');
    assert.equal(reps.durationSeconds, '');
    assert.equal(timed.durationSeconds, '20');
    assert.equal(timed.repetitions, '');
  });

  it('shows the numbers as a sentence, and says so plainly when there are none', () => {
    assert.equal(
      effortWords({ ...EMPTY_DRAFT, sets: '3', repetitions: '12', restSeconds: '45' }),
      '3 sets · 12 reps · 45 seconds rest',
    );
    assert.equal(effortWords(EMPTY_DRAFT), 'Nothing filled in');
  });

  /**
   * THE CALIBRATION MUST BE VISIBLE, NOT IMPLIED. Every position carries the adapter's own sentence
   * about which of the three sources its numbers were built from, and it is carried VERBATIM — a second
   * version written here would be two sentences about one number, free to drift apart.
   */
  it('carries the adapter s own provenance sentence for every position, unchanged', () => {
    const proposal = aProposal();

    for (const person of proposal.people) {
      for (const effort of person.efforts) {
        assert.ok(effort.referenceWords.length > 0, 'a position arrived with no provenance at all');
      }
    }
    // TWO OPPOSED FAILURES, and this fixture's wording was changed to match an INTENTIONAL COPY
    // CORRECTION in `core/intensity/effort.js` — it said "what he did" of a client record that
    // deliberately holds no gender. REQUIRING keeps the claim (the day it was built from) and is
    // worded to survive the masculine version; FORBIDDING is the pronoun itself.
    assert.match(proposal.people[0].efforts[1].referenceWords, /Built from what .*did on 2026-07-01/);
    assert.ok(!/\b(he|him|his)\b/i.test(proposal.people[0].efforts[1].referenceWords),
      'the client record cannot carry gender, so a sentence about the client may not assume one: '
        + proposal.people[0].efforts[1].referenceWords);
  });

  /**
   * WHERE THERE IS NO HISTORY, SAY SO PLAINLY. An ordinary case, and a default presented as though it
   * were measured is a lie the coach cannot detect. The adapter's own sentence says it; this asserts the
   * surface distinguishes the two people rather than marking both as measured.
   */
  it('marks a person with nothing recorded as coming from the library, and says it in words', () => {
    const proposal = aProposal();

    assert.equal(proposal.people[0].calibrated, true);
    assert.equal(proposal.people[1].calibrated, false);
    assert.equal(calibrationMark(true), 'Built from their own record');
    assert.equal(calibrationMark(false), 'From your library only');
    assert.match(proposal.people[1].baselineWords, /not as a measurement/);
    // The same opposed pair on the sentence the uncalibrated person is given, for the same
    // intentional copy correction: the claim must be made, and made without gendering the client.
    assert.match(proposal.people[1].baselineWords,
      /every number here comes from your own exercise library and this routine/);
    assert.ok(!/\b(he|him|his)\b/i.test(proposal.people[1].baselineWords),
      'the client record cannot carry gender, so a sentence about the client may not assume one: '
        + proposal.people[1].baselineWords);
    assert.notEqual(
      calibrationMark(true),
      calibrationMark(false),
      'a measured person and an uncalibrated one are marked identically',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No load, ever — and the level that keeps the no-ratchet guarantee true
// ═══════════════════════════════════════════════════════════════════════════════

describe('no load is proposed at any position, from any source', () => {
  /**
   * Broken on purpose by making `draftFromEffort` copy a load off the effort; this went red. Restored.
   */
  it('leaves the load and the note empty on every draft a curve produces', () => {
    const { accepted: held, controls } = accepted(noIntensity(), aProposal(), noControls());

    for (const [key, draft] of controls.drafts) {
      assert.equal(draft.observedLoad, '', `${key} arrived with a load proposed into it`);
      assert.equal(draft.note, '', `${key} arrived with a note proposed into it`);
    }
    for (const [key, line] of held.lines) {
      assert.equal(line.values.observedLoad, '', `${key} kept a proposed load`);
    }
    // The same reading, pointed at a known positive: a load he typed himself IS carried.
    assert.equal(
      changeProposed(noIntensity(), 'k', 'observedLoad', '40kg').edits.get('k')?.observedLoad,
      '40kg',
    );
  });

  it('ignores a load sitting on an effort, rather than passing it through', () => {
    const poisoned = { ...anEffort(), observedLoad: '60kg' } as ProposedEffort;
    assert.equal(draftFromEffort(poisoned).observedLoad, '');
  });
});

describe('the level travels with the fact', () => {
  /**
   * WITHOUT THIS THE ADAPTER'S OWN NO-RATCHET GUARANTEE IS LOST AT THIS SEAM. `INTENSITY.md` §3
   * promises pressing the same curve never moves the number; `effort.js` reads a level-less fact as
   * `measured.level ?? exercise.intensity`, so work done at a curve's HIGH point comes back proposed at
   * an easier one. `intensity-source.test.ts` proves that end to end against a real store; this asserts
   * the surface puts the level on at all.
   *
   * Broken on purpose by returning `values` unchanged from `withLevel`; this went red. Restored.
   */
  it('puts the accepted level on the fact, and only where a curve was accepted', () => {
    const { accepted: held } = accepted(noIntensity(), aProposal(), noControls());

    assert.deepEqual(
      withLevel({ repetitions: 18, sets: 4 }, acceptedLine(held, TIRED, PRESS)),
      { repetitions: 18, sets: 4, intensity: 'high' },
    );
    assert.deepEqual(
      withLevel({ repetitions: 18, sets: 4 }, acceptedLine(held, TIRED, 'a-line-no-curve-reached')),
      { repetitions: 18, sets: 4 },
      'a level was invented for a line no curve was accepted for',
    );
    assert.deepEqual(withLevel({ repetitions: 8 }, null), { repetitions: 8 });
  });

  it('records the level the curve asked for at that position, not the exercise s own', () => {
    const { accepted: held } = accepted(noIntensity(), aProposal(), noControls());

    assert.equal(acceptedLine(held, TIRED, PLANK)?.level, 'low');
    assert.equal(acceptedLine(held, TIRED, PRESS)?.level, 'high');
    assert.equal(acceptedLine(held, TIRED, SQUAT)?.level, 'low');
  });

  it('names the stand-in on the line it stands on, per person', () => {
    const { accepted: held } = accepted(noIntensity(), aProposal(), noControls());

    assert.equal(acceptedLine(held, TIRED, PRESS)?.standsInWithId, ROWER);
    assert.equal(acceptedLine(held, TIRED, PRESS)?.standsInWithName, 'Rowing machine');
    assert.equal(acceptedLine(held, TIRED, SQUAT)?.standsInWithId, null);
    assert.equal(acceptedLine(held, FRESH, PRESS)?.standsInWithId, ROWER);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The words
// ═══════════════════════════════════════════════════════════════════════════════

describe('what it says to the coach', () => {
  /**
   * THE COLLECTOR IS PINNED BY A WALK, exactly as `core/intensity/words.js` is: a sentence added to a
   * new export fails HERE rather than escaping the sweeps below.
   */
  it('collects every sentence it ships, so a new one cannot escape the sweeps', () => {
    const collected = surfaceSentences();

    for (const words of [TOGGLES_TITLE, TOGGLES_WORDS, NO_PATTERNS, ACCEPT_LABEL, REJECT_LABEL,
      REJECT_WORDS, SET_ASIDE_LABEL, VALUES_WORDS, SHORTFALL_TITLE, WHY_TITLE, COULD_NOT_SHAPE,
      RECORD_STAND_IN_LABEL]) {
      assert.ok(collected.includes(words), `"${words.slice(0, 40)}…" is shipped and not collected`);
    }
    for (const built of [proposalTitle('A curve of your own'), acceptedWords('A curve of your own'),
      levelWords('medium'), calibrationMark(true), calibrationMark(false)]) {
      assert.ok(collected.includes(built), `"${built.slice(0, 40)}…" is shipped and not collected`);
    }
  });

  /**
   * NOTHING NAMES A PRESCRIBED LOAD AND NOTHING OFFERS A PROGRESSION. The same sweeps
   * `core/intensity/proposal.test.js` runs, over this surface's sentences, with the coach's own content
   * masked first — the shipped library holds a Bodyweight Squat, and a name he wrote is not our wording.
   *
   * Broken on purpose by putting "we recommend" into `TOGGLES_WORDS`; this went red. Restored.
   */
  it('names no load and offers no progression', () => {
    const sentences = surfaceSentences();

    assert.deepEqual(findWords(sentences, LOAD_WORDS, NAMES), []);
    assert.deepEqual(findWords(sentences, PROGRESSION_WORDS, NAMES), []);

    // POINTED AT A POISONED COPY, so its silence above means something. A sweep that is broken and a
    // subject that is clean produce identical results.
    const poisoned = [...sentences, 'We recommend a heavier load next week to target progression.'];
    assert.ok(findWords(poisoned, LOAD_WORDS, NAMES).length > 0, 'the load sweep found nothing in a '
      + 'sentence naming a heavier load, so it proves nothing about the real ones');
    assert.ok(findWords(poisoned, PROGRESSION_WORDS, NAMES).length > 0, 'the progression sweep found '
      + 'nothing in a sentence recommending progression');
  });

  it('does not describe the proposal as a recommendation, in its words or its code', async () => {
    const words = surfaceSentences().join('\n').toLowerCase();

    for (const forbidden of ['recommend', 'recommendation', 'suggest', 'suggestion', 'advise',
      'you should', 'ought to', 'best for', 'optimal', 'ideal for']) {
      assert.ok(!words.includes(forbidden), `the coach is told "${forbidden}" — a curve is a shape HE `
        + 'chose and the application approving of it is a different act');
    }
    // Pointed at known positives.
    assert.ok('we recommend the optimal one'.includes('recommend'));
    assert.ok('we recommend the optimal one'.includes('optimal'));

    for (const file of ['intensity.ts', 'intensity-source.ts', 'SessionIntensity.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const forbidden of ['recommend', 'suggestion']) {
        assert.ok(!code.includes(forbidden), `${file} names ${forbidden} in its code`);
      }
      assert.ok(code.includes('proposal'), `the scan read no code at all out of ${file}`);
    }
  });

  it('carries no emoji in anything it says', () => {
    assert.deepEqual(findEmoji(surfaceSentences()), []);
    // Pointed at a known positive, and at the punctuation this codebase DOES use.
    assert.ok(findEmoji(['a shape ✅']).length > 0, 'the emoji sweep found nothing in a sentence '
      + 'holding one');
    assert.deepEqual(findEmoji(['an em dash — and a curly quote ’']), []);
  });

  it('says what a shape being set aside and a refusal actually mean', () => {
    assert.match(REJECT_WORDS, /Nothing has been recorded/);
    assert.match(COULD_NOT_SHAPE, /Nothing has been changed/);
    assert.match(acceptedWords('Steady'), /Nothing has been recorded/);
  });

  /**
   * THE EMPTY-LIBRARY SENTENCE SENDS HIM TO THE RIGHT SCREEN FOR EACH OF ITS TWO HALVES.
   *
   * It used to read "Restoring the shipped library from the admin panel brings them back, and you can
   * write your own there too". The RESTORE half was right and the WRITE half was not: curve authoring
   * — `LibraryPatterns`, "Add a curve" — is mounted on `RoutinesScreen.tsx`, at `/routines`, and has
   * never been on Admin. Nothing refuses and nothing fails, so he simply hunts Admin for a control
   * that lives elsewhere with a client waiting. Its own sibling `library-patterns.ts` had it right.
   *
   * THE OLD ASSERTION WAS `/admin/` AND IT PASSED THE WHOLE TIME, because a sentence naming Admin
   * twice satisfies it exactly as well as one naming Admin once. Re-aiming it at the new wording
   * would be indistinguishable in the diff from softening it, so it is replaced by one that pins the
   * DEFECT: both destinations named, each from `DESTINATIONS` rather than typed here.
   */
  it('sends him to Admin to restore the shipped curves and to Routines to write his own', () => {
    const admin = DESTINATIONS.find((one) => one.path === 'admin');
    const routines = DESTINATIONS.find((one) => one.path === 'routines');
    assert.ok(admin !== undefined && routines !== undefined, 'the navigation no longer carries both');

    assert.ok(NO_PATTERNS.includes(admin.label),
      `the restore half no longer names ${admin.label}: ${NO_PATTERNS}`);
    assert.ok(NO_PATTERNS.includes(routines.label),
      `the write half sends him somewhere other than ${routines.label}, where "Add a curve" actually `
      + `is: ${NO_PATTERNS}`);
    // AND NOT THE OLD SENTENCE, which named one screen for both halves. Without this the rule above
    // would pass on any wording that mentioned both words anywhere, including the broken one plus a
    // stray reference.
    assert.equal(/admin panel/iu.test(NO_PATTERNS), false,
      'it still calls Admin "the admin panel", which is not what the navigation calls it');
  });

  it('names a stand-in and a level in the coach s terms', () => {
    assert.equal(standsInWords('Rowing machine', 'Bench press'), 'Rowing machine in place of Bench press');
    assert.equal(levelWords('high'), 'high point');
    assert.equal(proposalTitle('Steady Build'), 'Steady Build, across this routine');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The states before there is a proposal
// ═══════════════════════════════════════════════════════════════════════════════

describe('the honest states', () => {
  it('holds nothing at all to begin with', () => {
    const state = noIntensity();
    assert.deepEqual(
      state,
      { showing: null, shaping: null, edits: new Map(), refusal: null, accepted: null },
    );
  });

  it('names which curve is being shaped, so the button he pressed can say so', () => {
    const state = shaping(noIntensity(), 'steady');
    assert.equal(state.shaping, 'steady');
    assert.equal(state.showing, null);
  });

  it('reports a refusal with the cause under it, rather than going blank', () => {
    const state = refusedToShape(noIntensity(), {
      headline: COULD_NOT_SHAPE,
      detail: 'The exercise "plank" has no high scaling point, so a curve cannot ask it for one.',
    });

    assert.equal(state.showing, null);
    assert.equal(state.shaping, null);
    assert.match(String(state.refusal?.detail), /no high scaling point/);
    assert.notEqual(state.refusal?.headline, state.refusal?.detail);
  });

  it('drops a refusal and a stale proposal the moment he presses another curve', () => {
    const refused = refusedToShape(showing(noIntensity(), aProposal()), {
      headline: COULD_NOT_SHAPE, detail: null,
    });
    const again = shaping(refused, 'another');

    assert.equal(again.refusal, null);
    assert.equal(again.showing, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The drawing
// ═══════════════════════════════════════════════════════════════════════════════

describe('the drawing', () => {
  it('binds through token roles and never a colour value', async () => {
    const drawing = await codeOf('SessionIntensity.tsx');

    for (const forbidden of ['#', 'rgb(', 'hsl(', 'style={{']) {
      assert.ok(!drawing.includes(forbidden), `the drawing carries ${forbidden}, so it is bound to a `
        + 'colour value rather than to a token role');
    }
    assert.ok(drawing.includes('classname'), 'the scan read no class at all out of the drawing');
  });

  /**
   * NOT ONE SENTENCE OF ITS OWN. A sentence living in a `.tsx` is a sentence no suite drives and no
   * sweep reads — it escapes every guard in this file by sitting where none of them look.
   *
   * This caught a real one while it was written: the bounded-list disclosure was a literal in the
   * drawing, so it was shipped prose outside `surfaceSentences()` and outside the load, progression and
   * emoji sweeps. It now lives in `intensity.ts` as `MORE_CURVES_THAN_SHOWN` and is collected. Broken
   * again on purpose by putting a literal sentence back; this went red. Restored.
   */
  it('decides nothing of its own — every word comes from the judgement module', async () => {
    const drawing = await codeOf('SessionIntensity.tsx');

    const sentences = drawing.match(/'[a-z][^'\n]{30,}'/g) ?? [];
    assert.deepEqual(sentences, [], `the drawing holds ${sentences.length} sentence(s) of its own, `
      + `which no sweep in this file can read: ${sentences.join(' | ')}`);

    // The same reading, pointed at a known positive, so an empty result means the scan works.
    assert.deepEqual(
      "const x = 'a sentence of at least thirty characters'".match(/'[a-z][^'\n]{30,}'/g),
      ["'a sentence of at least thirty characters'"],
    );
  });
});

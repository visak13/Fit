/**
 * WHAT REFUSES A COACH-AUTHORED CURVE, AND WHAT THE ADAPTER DOES WITH ONE THE LIBRARY CANNOT FILL.
 *
 * Three things are proven here, and the first is the one this file exists for.
 *
 * ## ONE — the refusal ENUMERATION, run rather than written down
 *
 * The seed contract is that a harder intensity point asks for MORE WORK and LESS REST, never more
 * load. A ruling settled that against a curve the coach authored himself that contract should WARN
 * rather than refuse. Acting on it needs one fact established first: WHICH refusals a coach-authored
 * curve can actually reach, and which of them the contract is about.
 *
 * The answer is measured below rather than asserted in prose, because it is surprising: **the curve
 * record cannot express the violation at all.** A pattern carries a `sequence` of level names and a
 * `mapping_rule`, and no work, rest or load value anywhere — `INTENSITY_PATTERN_FIELDS` is read at
 * run time here and checked against every load-shaped and work-shaped token the model knows, with a
 * positive control over the exercise's own scaling point so the silence means something. So every
 * refusal a curve can reach is STRUCTURAL (the record would otherwise be unreadable or unrunnable)
 * or UNRELATED (`R11`, a name that spells out a curve must tell the truth). None is the seed
 * contract, because there is nothing on this record for it to be about.
 *
 * In one sentence for a reader who has not seen the code: to break the more-work-less-rest rule at
 * all, the coach has to open an EXERCISE and edit its three points so a harder one asks for less
 * work, fewer sets or more rest — the curve form gives him no way to do it. Those exercise-side
 * refusals are proven in both directions in `library-editor.test.ts` and are deliberately NOT
 * touched here.
 *
 * ## TWO — the adapter degrades honestly, on a curve the shipped library genuinely cannot fill
 *
 * Driven against the REAL seed library, with the routine that cannot fill it DISCOVERED by running
 * the placement rather than named here — the shipped library holds enough of every level that a
 * hand-picked routine would have quietly stopped exercising the shortfall path. What is asserted is
 * the promise: the level that ran short is NAMED, nothing is substituted silently, and the session
 * is never shorter than the routine.
 *
 * ## THREE — the curve form sends him where the numbers actually are
 *
 * `CURVE_HAS_NO_NUMBERS` names a destination, and the destination is read off `RoutinesScreen.tsx`'s
 * own source rather than trusted: a sentence naming a control that does not exist passes every test
 * and changes nothing.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/screens/library-curve-contract.test.ts
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { EXERCISES, INTENSITY_PATTERNS, ROUTINES } from '../../core/seed/content.js';
import { COACH_PROVENANCE } from '../../core/seed/provenance.js';
import { INTENSITY_PATTERN_FIELDS } from '../../core/model/entities/intensity-pattern.js';
import { SCALING_POINT_FIELDS, scalingContractFindings } from '../../core/model/entities/exercise.js';
import { validateExercise } from '../../core/model/entities/index.js';
import { FORBIDDEN_LOAD_TOKENS, INTENSITY_LEVELS } from '../../core/model/vocabularies.js';
import { proposeSession } from '../../core/intensity/intensity.js';
import {
  CURVE_HAS_NO_NUMBERS, CURVE_HINT, describePatternRefusal, emptyPatternDraft, patternContent,
} from './library-patterns';
import type { PatternDraft } from './library-patterns';
import { addPattern, readPatternPage } from './library-patterns-source';
import {
  describeContractNotice, describeExercise, draftFromExercise, exerciseContent,
} from './library-editor';
import type { ExerciseDraft } from './library-editor';
import { addExercise, readLibraryPage } from './library-editor-source';

const here = path.dirname(fileURLToPath(import.meta.url));

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
 * A CURVE THE COACH AUTHORED, and the emphasis is on authored.
 *
 * It is built from an EMPTY draft through the form's own `patternContent`, never from a shipped
 * pattern: `markEdited` over shipped content returns `shipped-edited`, so a fixture composed out of
 * the seed would be a different record class from the one every claim below is about. The
 * provenance is asserted off the store in the first test rather than assumed here.
 */
function anAuthoredCurve(over: Partial<PatternDraft> = {}): PatternDraft {
  return {
    ...emptyPatternDraft(),
    name: 'Peak Hold',
    sequence: ['high', 'high', 'high'],
    mappingRule: 'hold-last',
    description: 'Everything at the top of the ladder, for a client who is ready for it.',
    ...over,
  };
}

/** What the record said when it refused, in the words the coach is shown. */
async function refusalFor(draft: PatternDraft): Promise<ReturnType<typeof describePatternRefusal>> {
  const store = await aRealStore();
  try {
    await addPattern(store, patternContent(draft, null));
  } catch (error: unknown) {
    return describePatternRefusal(error);
  }
  assert.fail('the record accepted a curve this test expected it to refuse');
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('every refusal a coach-authored curve can reach, enumerated and classified', () => {
  it('ACCEPTS a curve he authored, and the record reads back as HIS — without this the rest proves nothing', async () => {
    const store = await aRealStore();
    const created = await addPattern(store, patternContent(anAuthoredCurve(), null));

    // READ BACK OFF THE STORE, not off the value the write returned to the screen.
    const page = await readPatternPage(store);
    const held = page.items.find((record) => record.content.id === created.content.id);
    assert.ok(held !== undefined, 'a curve that was saved is not in the library that was read back');
    assert.equal(held.content.provenance, COACH_PROVENANCE,
      'the fixture every claim in this file is about is not a coach-created record, so the '
      + 'coach-authored / shipped distinction is being tested against the wrong record class');
    assert.deepEqual([...held.content.sequence], ['high', 'high', 'high']);
  });

  /*
   * STRUCTURAL — the record would be unreadable or unrunnable. These MUST keep refusing, and the
   * ruling about warning instead of refusing does not reach them.
   */

  it('STRUCTURAL: fewer than two points is refused — a curve of one point is not a shape', async () => {
    const report = await refusalFor(anAuthoredCurve({ sequence: ['high'] }));
    assert.ok(
      report.fields.some((field) => field.path.endsWith('sequence') && field.code === 'LENGTH'),
      `a one-point curve was refused by ${report.fields.map((f) => `${f.code} ${f.path}`).join(', ')}`,
    );
  });

  it('STRUCTURAL: more than eight points is refused', async () => {
    const nine = Array.from({ length: 9 }, () => 'high');
    const report = await refusalFor(anAuthoredCurve({ sequence: nine }));
    assert.ok(
      report.fields.some((field) => field.path.endsWith('sequence') && field.code === 'LENGTH'),
      `a nine-point curve was refused by ${report.fields.map((f) => `${f.code} ${f.path}`).join(', ')}`,
    );
  });

  it('STRUCTURAL: a point outside the model’s own levels is refused', async () => {
    // Not a level the vocabulary holds, so nothing downstream could place it.
    const report = await refusalFor(anAuthoredCurve({ sequence: ['high', 'brutal'] }));
    assert.ok(
      report.fields.some((field) => field.code === 'ENUM'),
      `an unknown level was refused by ${report.fields.map((f) => f.code).join(', ')} rather than by the vocabulary`,
    );
  });

  it('STRUCTURAL: a mapping rule the adapter does not implement is refused', async () => {
    const report = await refusalFor(anAuthoredCurve({ mappingRule: 'spread-somehow' }));
    assert.ok(
      report.fields.some((field) => field.path.endsWith('mapping_rule') && field.code === 'ENUM'),
      `an unknown mapping rule was refused by ${report.fields.map((f) => `${f.code} ${f.path}`).join(', ')}`,
    );
  });

  it('UNRELATED: R11 — a name that spells out a curve must match it, and this is not the seed contract', async () => {
    const report = await refusalFor(anAuthoredCurve({ name: 'Low Medium High' }));
    const mismatch = report.fields.filter((field) => field.code === 'MISMATCH');
    assert.ok(mismatch.length > 0,
      `a lying name was refused by ${report.fields.map((f) => f.code).join(', ')} rather than by R11`);
    assert.ok(mismatch.every((field) => !/rest|load|weight/iu.test(field.message)),
      'R11 is being reported as if it were the more-work-less-rest contract');
  });

  it('THE SEED CONTRACT HAS NO TARGET ON THIS RECORD: a curve carries no work, rest or load field at all', () => {
    // Read at run time off the record model, never a list typed here — a field added to the record
    // must show up as a red rather than as a claim this file goes on making about six fields.
    const workShaped = [...SCALING_POINT_FIELDS];
    const loadShaped = [...FORBIDDEN_LOAD_TOKENS];
    const carried = [...INTENSITY_PATTERN_FIELDS];

    assert.ok(carried.length > 0, 'the pattern record declares no fields at all, so this scan is vacuous');

    for (const field of carried) {
      assert.ok(!workShaped.includes(field),
        `the curve record now carries ${field}, a work or rest value — the more-work-less-rest `
        + 'contract can be violated on a curve after all, and this file\'s classification is stale');
      assert.ok(!loadShaped.some((token) => field.toLowerCase().includes(token.toLowerCase())),
        `the curve record now carries ${field}, which is load-shaped`);
    }

    // NON-VACUITY, in the same run: the same two scans over the record that DOES carry the numbers
    // must fire. A scan that cannot find what it is looking for where it demonstrably is proves
    // nothing about the record where it found none.
    assert.ok(workShaped.includes('rest_seconds'),
      'the work-shaped scan cannot see rest_seconds on an exercise scaling point, so its silence '
      + 'about the curve record means nothing');
    assert.ok(loadShaped.length > 0 && loadShaped.some((token) => 'weight'.includes(token.toLowerCase())
      || token.toLowerCase().includes('weight')),
      'the load-shaped scan holds no weight token, so its silence about the curve record means nothing');
  });
});

describe('the seed contract on an exercise HE authored: a notice, and the save commits', () => {
  /*
   * Settled by the user on 2026-07-31, with the consequence in front of him: to trip this rule at
   * all he has to open an exercise and set its three points so a HARDER one asks for less work,
   * fewer sets or more rest — and those numbers then build every session shaped to a curve, for
   * every client, until he changes them. He chose warn-and-save over refuse.
   *
   * What is proven here is the whole of that: the record COMMITS, read back off the store; the
   * notice NAMES the offending point; it survives the round trip so it is still there when he comes
   * back; it goes away when the offence goes away and returns when it returns; and SHIPPED content
   * is refused exactly as absolutely as before.
   */

  /** A ladder whose HIGH point rests longer than the medium one. Nothing else is touched. */
  function aLadderThatOffends(): ExerciseDraft {
    const base = draftFromExercise(
      { record_id: 'unused', rev: 1, content: EXERCISES[0] as never }, INTENSITY_LEVELS,
    );
    return {
      ...base,
      name: 'Contract Notice Movement',
      scaling: {
        ...base.scaling,
        high: { ...base.scaling.high, rest: '600' },
      },
    };
  }

  /** The same ladder with the offence taken out, so rest falls as it should. */
  function aLadderThatDoesNot(): ExerciseDraft {
    const offending = aLadderThatOffends();
    const base = draftFromExercise(
      { record_id: 'unused', rev: 1, content: EXERCISES[0] as never }, INTENSITY_LEVELS,
    );
    return { ...offending, scaling: { ...offending.scaling, high: base.scaling.high } };
  }

  it('THE SAVE COMMITS: his own exercise with an offending ladder is IN THE STORE, read back', async () => {
    const store = await aRealStore();
    const saved = await addExercise(store, exerciseContent(aLadderThatOffends(), INTENSITY_LEVELS, null));

    // OFF THE STORE, not off the value the write handed back to the screen.
    const page = await readLibraryPage(store);
    const held = page.items.find((record) => record.content.id === saved.content.id);
    assert.ok(held !== undefined, 'the exercise was reported saved and is not in the library');
    assert.equal(held.content.provenance, COACH_PROVENANCE,
      'the fixture is not a coach-authored record, so this proves nothing about the ruling');
    const rest = (level: string): number => Number(
      (held.content.scaling as Record<string, { rest_seconds?: number }>)[level].rest_seconds,
    );
    assert.ok(rest('high') > rest('medium'),
      'the record committed with the ladder silently corrected, which is worse than refusing it');
  });

  it('THE NOTICE NAMES THE POINT AND THE RULE, in the record’s own sentence', async () => {
    const store = await aRealStore();
    const saved = await addExercise(store, exerciseContent(aLadderThatOffends(), INTENSITY_LEVELS, null));

    const notice = describeContractNotice(saved.content);
    assert.ok(notice !== null, 'a ladder that breaks the contract produced no notice at all — the '
      + 'check has gone silent, which looks exactly like approval');
    assert.ok(notice.points.length > 0, 'the notice names no point');
    assert.ok(notice.points.some((point) => point.label === 'High'),
      `the notice does not name the offending point: ${notice.points.map((p) => p.label).join(', ')}`);
    assert.ok(notice.points.some((point) => /rest/iu.test(point.message)),
      'the notice does not say what is wrong, so he cannot act on it');
    // NOT AGGREGATED into a caution that names nothing.
    assert.ok(!/check your values|something is wrong/iu.test(notice.title));
  });

  it('IT IS STILL THERE WHEN HE COMES BACK — on the row, and on the form he reopens', async () => {
    const store = await aRealStore();
    const saved = await addExercise(store, exerciseContent(aLadderThatOffends(), INTENSITY_LEVELS, null));

    const page = await readLibraryPage(store);
    const held = page.items.find((record) => record.content.id === saved.content.id)!;

    assert.notEqual(describeExercise(held).contractNotice, null,
      'the saved exercise says nothing on the list, so a slip he waved past is invisible afterwards');

    // The form, reopened: the draft is built from the record and the notice is derived from that.
    const reopened = draftFromExercise(held, INTENSITY_LEVELS);
    assert.notEqual(
      describeContractNotice(exerciseContent(reopened, INTENSITY_LEVELS, held.content.id)),
      null,
      'reopening the saved exercise shows no notice, so the warning lived only in the moment of saving',
    );
  });

  it('NOT VACUOUS: it goes when the offence goes, and RETURNS when the offence returns', () => {
    const clean = exerciseContent(aLadderThatDoesNot(), INTENSITY_LEVELS, null);
    assert.equal(describeContractNotice(clean), null,
      'a ladder that obeys the contract still produces a notice, so the notice fires whatever it '
      + 'is given and names nothing in particular');

    const again = exerciseContent(aLadderThatOffends(), INTENSITY_LEVELS, null);
    assert.notEqual(describeContractNotice(again), null,
      'putting the offence back produced no notice, so the check does not actually watch the ladder');
  });

  it('THE SHIPPED LIBRARY STILL REFUSES ABSOLUTELY — this governs HIS records and nothing else', () => {
    const shipped = JSON.parse(JSON.stringify(EXERCISES[0])) as Record<string, any>;
    assert.equal(shipped.provenance, 'shipped-untouched',
      'the fixture is not shipped content, so it cannot prove the shipped path still refuses');

    // Every shipped exercise validates clean today, or the assertion below would be measuring a
    // library that was already broken.
    for (const exercise of EXERCISES as readonly Record<string, unknown>[]) {
      assert.ok(validateExercise(exercise).ok,
        `a shipped exercise does not validate: ${JSON.stringify(validateExercise(exercise).issues)}`);
    }

    shipped.scaling.high.rest_seconds = shipped.scaling.medium.rest_seconds + 100;
    const refused = validateExercise(shipped);
    assert.equal(refused.ok, false, 'a SHIPPED ladder that breaks the contract was accepted — the '
      + 'ruling about warning was applied to content the coach never authored');
    assert.ok(refused.issues.some((issue) => issue.code === 'ORDERING'),
      `the shipped ladder was refused by ${refused.issues.map((i) => i.code).join(', ')} rather than by R6`);

    // AND THE SAME LADDER, MARKED AS HIS, IS ACCEPTED. Without this the test above would pass on a
    // validator that simply refuses everything, and the ruling would be unimplemented.
    const his = { ...shipped, provenance: COACH_PROVENANCE };
    assert.equal(validateExercise(his).ok, true,
      `the same ladder on HIS OWN exercise was refused: ${JSON.stringify(validateExercise(his).issues)}`);
  });

  it('THE DETECTION IS UNCHANGED: the same ladder is still DETECTED on his record, only not refused', () => {
    const shipped = JSON.parse(JSON.stringify(EXERCISES[0])) as Record<string, any>;
    shipped.scaling.high.rest_seconds = shipped.scaling.medium.rest_seconds + 100;
    const his = { ...shipped, provenance: COACH_PROVENANCE };

    const refusedIssues = validateExercise(shipped).issues.filter((issue) => issue.code === 'ORDERING');
    const findings = scalingContractFindings(his);
    assert.equal(findings.length, refusedIssues.length,
      'the detector and the refusal disagree about how many things are wrong with the same ladder, '
      + 'so the warning path is not seeing what the refusal path sees');
    assert.deepEqual(findings.map((finding) => finding.message), refusedIssues.map((issue) => issue.message),
      'the notice is showing different words from the ones the record refuses shipped content with');
  });

  it('THE NOTICE DOES NOT ESCALATE: nothing on this path reaches the status ladder', async () => {
    // needs_attention FLOORS the whole status ladder at overdue and the floor never clears by
    // itself, so a warning routed there becomes a permanent alarm on the one indicator he must
    // trust. Absence-shaped, so it carries a positive control in the same run.
    const owner = await readFile(
      path.join(here, '..', '..', 'core', 'status', 'levels.js'), 'utf8',
    );
    assert.match(owner, /needs_attention|needsAttention/u,
      'the scan cannot find the escalation it is looking for where it demonstrably is, so its '
      + 'silence about the notice proves nothing');

    for (const file of ['library-editor.ts', 'RoutinesScreen.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const code = await readFile(path.join(here, file), 'utf8');
      assert.ok(!/needsAttention|needs_attention/u.test(code),
        `${file} routes the contract notice into the status ladder, which would make a permanent `
        + 'alarm out of a warning the coach has already answered');
    }
  });
});

describe('the adapter degrades honestly on a curve the library cannot fill', () => {
  /**
   * THE ROUTINE IS DISCOVERED, NOT PICKED. The shipped library holds enough of every level that most
   * routines can be filled from the substitution pool — which is the designed behaviour, and it is
   * also how a hand-picked fixture would stop exercising this path without anything going red.
   */
  function aCurveThatRunsShort(): { routine: Record<string, any>; pattern: Record<string, unknown> } {
    for (const routine of ROUTINES as readonly Record<string, any>[]) {
      const pattern = {
        id: 'peak-hold',
        name: 'Peak Hold',
        sequence: Array.from({ length: routine.entries.length }, () => 'high'),
        mapping_rule: 'hold-last',
        description: 'Everything at the top of the ladder.',
        provenance: COACH_PROVENANCE,
      };
      const proposal = proposeSession({ pattern, routine, catalogue: EXERCISES });
      if (proposal.shortfalls.length > 0) return { routine, pattern };
    }
    assert.fail('no shipped routine leaves an all-high curve short, so the shortfall path is untested');
  }

  it('NAMES the level that ran short, in the words the coach reads', () => {
    const { routine, pattern } = aCurveThatRunsShort();
    const proposal = proposeSession({ pattern, routine, catalogue: EXERCISES });

    for (const shortfall of proposal.shortfalls) {
      assert.ok(shortfall.note.includes(shortfall.level),
        `the summary does not name the level that ran short: ${shortfall.note}`);
    }
    assert.ok(proposal.shortfalls.some((one: { level: string }) => one.level === 'high'),
      'an all-high curve ran short at some level other than high');
  });

  it('NEVER SUBSTITUTES AN INTENSITY SILENTLY — every position off the asked level says so', () => {
    const { routine, pattern } = aCurveThatRunsShort();
    const proposal = proposeSession({ pattern, routine, catalogue: EXERCISES });
    const catalogue = Object.fromEntries(
      (EXERCISES as readonly Record<string, any>[]).map((exercise) => [exercise.id, exercise]),
    );

    let checked = 0;
    for (const position of proposal.positions) {
      const actual = catalogue[position.exercise_id].intensity;
      if (actual === position.asked_for_level) continue;
      checked += 1;
      assert.ok(position.shortfall !== null,
        `position ${String(position.position)} holds a ${String(actual)} movement where the curve `
        + `asked for ${String(position.asked_for_level)} and says nothing about it`);
      assert.ok(position.shortfall.note.includes(position.asked_for_level),
        'the position\'s own sentence does not name the level the curve asked for');
    }
    assert.ok(checked > 0,
      'no position was filled off its asked-for level, so this sweep asserted nothing');
  });

  it('NEVER SHORTER THAN ASKED: one position per routine exercise, and one level per position', () => {
    const { routine, pattern } = aCurveThatRunsShort();
    const proposal = proposeSession({ pattern, routine, catalogue: EXERCISES });

    assert.equal(proposal.positions.length, routine.entries.length,
      'the session came back shorter or longer than the routine');
    assert.equal(proposal.curve.levels.length, routine.entries.length,
      'the curve was spread across a different number of positions than the routine holds');
  });

  it('THE LOOSENING DIRECTION: a shipped curve the library CAN fill reports no shortfall at all', () => {
    // Without this, a shortfall reported for everything would satisfy every assertion above.
    const filled = (ROUTINES as readonly Record<string, any>[]).flatMap((routine) =>
      (INTENSITY_PATTERNS as readonly Record<string, any>[]).map((pattern) =>
        proposeSession({ pattern, routine, catalogue: EXERCISES })));

    assert.ok(filled.length > 0, 'nothing was proposed, so this control asserted nothing');
    assert.ok(filled.some((proposal) => proposal.shortfalls.length === 0),
      'every shipped curve on every shipped routine reports a shortfall, so the shortfall is not a '
      + 'discriminator — it fires whatever it is given');
  });
});

describe('the curve form sends him to where the numbers actually are', () => {
  /** The file with its comments removed. A word in a comment is not a string the coach ever sees. */
  function codeOnly(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('THE CLAIM IS NOT SOFTENED — the curve still carries no numbers, and the rule is still the rule', () => {
    assert.match(CURVE_HAS_NO_NUMBERS, /carries no numbers of its own/u,
      'the claim that a curve carries no numbers has been softened or removed');
    assert.match(CURVE_HAS_NO_NUMBERS, /more work and less rest/u,
      'the sentence no longer states the rule it exists to state');
    assert.match(CURVE_HAS_NO_NUMBERS, /never more weight/u,
      'the sentence no longer refuses load');
  });

  it('NAMES A DESTINATION THAT EXISTS: the Exercises list and its three points, read off the screen', async () => {
    const screen = await readFile(path.join(here, 'RoutinesScreen.tsx'), 'utf8');

    // The heading is read off the screen's own source rather than typed here twice: a sentence that
    // names a place is only useful while the place is called that.
    const heading = /<h3[^>]*>Exercises<\/h3>/u.test(screen);
    assert.ok(heading, 'RoutinesScreen no longer draws a section headed Exercises, so the curve '
      + 'form now names a destination that does not exist');
    assert.ok(CURVE_HAS_NO_NUMBERS.includes('Exercises list'),
      'the curve form names no destination, so he is left hunting for numbers the curve does not carry');

    // And the three points it sends him to are the three the ladder actually draws, keyed by the
    // model's own levels rather than by a list written on either side.
    for (const level of INTENSITY_LEVELS) {
      const wordOnScreen = level.charAt(0).toUpperCase() + level.slice(1);
      assert.ok(CURVE_HAS_NO_NUMBERS.includes(wordOnScreen),
        `the sentence sends him to the three points without naming ${wordOnScreen}`);
    }
  });

  it('THE LADDER IS DRAWN AND EDITABLE, one point editor per level — not a read-only restatement', async () => {
    const screen = codeOnly(await readFile(path.join(here, 'RoutinesScreen.tsx'), 'utf8'));

    assert.match(screen, /<PointFields/u, 'the exercise form draws no point editor at all');
    assert.match(screen, /LEVELS\.map/u,
      'the three point editors are not built from the model\'s own levels, so a level added there '
      + 'would silently have no box');
    // EDITABLE, which is the whole claim: a fieldset that renders values and takes no change is a
    // control he cannot use, and it reads identically in a snapshot.
    assert.match(screen, /onChange=\{\(next: PointDraft\) =>|onChange=\{\(next\) =>/u,
      'the point editor takes no change handler, so the ladder is displayed rather than editable');

    // NON-VACUITY: the same scan over the curve form, which legitimately has no point editor,
    // finds none. A scan matching everything would prove nothing about the exercise form.
    const curveForm = codeOnly(await readFile(path.join(here, 'LibraryPatterns.tsx'), 'utf8'));
    assert.ok(!/<PointFields/u.test(curveForm),
      'the scan matches a form that has no point editor, so its match on the exercise form is not evidence');
  });

  it('the destination sentence is not the same sentence as the curve hint', () => {
    // A control against the cheapest way to pass the test above: repeating the words somewhere else.
    assert.ok(!CURVE_HINT.includes('Exercises list'),
      'the curve hint has taken on the destination sentence, so the two have become one idea');
  });
});

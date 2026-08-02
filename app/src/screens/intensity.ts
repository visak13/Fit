/**
 * THE INTENSITY ADAPTER'S SURFACE — every word it says, and what accepting a curve actually does.
 *
 * The same split every screen in this application follows: `screens/removals.ts` sits beside
 * `screens/RemovalsScreen.tsx`, and the suite drives the module with no rendering at all. The
 * arithmetic is NOT here and none of it is repeated here — `core/intensity/intensity.js` shapes the
 * session and this file shows what it shaped, collects the coach's changes, and turns an acceptance
 * into the drafts the in-session controls already know how to record.
 *
 * ## IT PROPOSES. THE COACH DISPOSES — AND HERE THAT IS STRUCTURAL RATHER THAN A PROMISE
 *
 * This module reaches no store, holds no handle and writes nothing. It cannot: accepting a curve
 * produces a {@link ControlState} — the in-session controls' own transient state — and nothing else.
 * A fact reaches the record only when the coach presses Record on a line, through the same
 * `modular-control-source.ts` verb every other move goes through, with the numbers sitting in front
 * of him. So the honest statement of what acceptance does is:
 *
 *   **Accepting writes nothing. It fills the lines in and puts them in the order of the curve.**
 *
 * That is why rejection can restore the session exactly — there is nothing to undo. And it is why
 * every value stays overridable after acceptance: what acceptance produced IS a draft, and a draft is
 * the thing the Adjust panel edits. Neither property needed a mechanism; both fall out of the shape.
 *
 * ## THE ORDER IS HIS INSTRUCTION, NOT THE APPLICATION'S OPINION — AND THE DISTINCTION IS THE RULE
 *
 * `runner.ts` does not re-sort the lines, and `SESSION.md` §2 is why: a list that floated the
 * untouched lines to the top would be telling him where to go next. {@link Accepted.order} is a
 * different thing and the difference is load-bearing. It is not derived from what has been recorded,
 * it does not move as he records, and it is not the application's reading of anything — it is the
 * shape of the curve HE pressed and accepted, held in the screen's own transient state, going nowhere
 * near the record. Sorting by the record would be the rule broken; showing him the order he asked for
 * is the feature. `intensity.test.ts` asserts the order never consults an outcome.
 *
 * ## NO LOAD IS EVER PROPOSED, AND THE DRAFTS PROVE IT RATHER THAN CLAIM IT
 *
 * Every draft this module builds leaves `observedLoad` empty. A load is a per-client OBSERVATION the
 * coach made in a session; the library prescribes none, `core/intensity/effort.js` emits none, and a
 * prefilled load here would be the application proposing a training load — the one judgement that
 * belongs to the certified professional who is also adapting to a client's history. There is no
 * automatic progression anywhere in this application and this is not an exception to it: a curve
 * shapes a session to a shape the COACH chose and asks him to approve it, which is a different act
 * from the application deciding somebody should do more this week.
 *
 * A test sweeps every sentence this module ships for a prescribed load and for a progression, using
 * `core/intensity/words.js` — the same sweep the adapter's own suite uses, pointed at a poisoned copy
 * first so its silence means something.
 *
 * ## THE LEVEL TRAVELS WITH THE FACT, AND LEAVING IT OFF BREAKS THE ADAPTER'S OWN GUARANTEE
 *
 * `INTENSITY.md` §3 promises there is no ratchet: at the level a client was measured at the ladder's
 * ratio is one and the ceiling can only reduce, so pressing the same curve every week never moves the
 * number. That holds inside the package and is LOST at this seam unless the level reaches the record.
 * `effort.js` chooses its reference as `measured.level ?? exercise.intensity`, so a fact stored with
 * no level is read back as though it had been performed at the exercise's own library level. Perform
 * an exercise the library files as `low` at a curve's HIGH point, record it with no level, and the
 * next `low` position proposes what was managed at `high` — the ceiling does not catch it, because the
 * ceiling is that same number.
 *
 * So {@link withLevel} puts the accepted level on the fact, through `intensity` — a key the record
 * model ALREADY carries (`entities/performed-record.js` validates `intensity_level` as one of low,
 * medium, high), that `core/session/journal.js` ALREADY maps, and that
 * `LiveSession.recordPerformed` ALREADY accepts. Nothing new is persisted; an existing optional field
 * stops being always-absent. `intensity.test.ts` proves the ratchet with the level and without it.
 */

import { EMPTY_DRAFT, draftKey, draftProblem } from './modular-control';
import type { ControlState, Draft, FactValues } from './modular-control';

// ═══════════════════════════════════════════════════════════════════════════════
// The toggles — read from the shipped pattern data, never from a list in here
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ONE CURVE HE CAN PRESS, out of the patterns his library actually holds.
 *
 * Patterns are DATA — a record kind of their own, seeded from `core/seed/content/intensity-patterns.js`
 * and restored by the admin reset — precisely so he can add one, edit one or delete one without the
 * application being rebuilt. A hard-coded list of buttons here would make the shipped set the only
 * set, and every one of them a lie the moment he edited a curve.
 */
export interface PatternToggle {
  /** The pattern's content key. Identity, so a renamed curve is still the same curve. */
  readonly patternId: string;
  readonly name: string;
  /** The pattern's own description, in whoever authored it's words. Carried, never rewritten. */
  readonly words: string;
  /** The curve spelled out, so the button says what it does as well as what it is called. */
  readonly curveWords: string;
  /** The same curve, as the levels alone — what the compact preview bars are drawn from. */
  readonly sequence: readonly string[];
}

/**
 * A stored pattern as a toggle.
 *
 * The sequence is spelled out beside the name because `R11` in `entities/intensity-pattern.js` only
 * checks a name that already spells a curve out: a pattern called Steady Build is a perfectly valid
 * name that tells him nothing about its shape, and he is pressing this mid-session.
 */
export function toggleFor(pattern: {
  readonly id: string;
  readonly name: string;
  readonly sequence: readonly string[];
  readonly description?: string;
}): PatternToggle {
  return {
    patternId: pattern.id,
    name: pattern.name,
    words: typeof pattern.description === 'string' ? pattern.description : '',
    curveWords: pattern.sequence.join(' · '),
    sequence: pattern.sequence,
  };
}

/** What the row of curves is called. */
export const TOGGLES_TITLE = 'Shape this session to a curve';

/**
 * WHAT PRESSING ONE DOES, said before he presses it.
 *
 * It states the two halves — the order and the effort — because a surface that showed only one of them
 * would be hiding the half he would want to check. And it states the whole contract in its last
 * sentence, at the reading floor, on the screen rather than in a document: a rule that lives only in a
 * document is a rule the next screen can contradict.
 */
export const TOGGLES_WORDS =
  'Nothing changes or saves until you accept a curve, and every number stays yours to alter '
  + 'afterwards.';

/** Said while the curves, the routine and your library are being read. */
export const READING_PATTERNS = 'Reading your curves…';

/**
 * Said when the library holds no patterns at all.
 *
 * A nought this application counts rather than an empty row: the shipped set is restored by the admin
 * reset, so the way out is a real one and it is named.
 */
export const NO_PATTERNS =
  'Your library holds no curves at the moment. Restoring the set the app came with from the Admin '
  + 'screen on the navigation brings them back, and you can write your own on the Routines screen.';

/** Said while a curve is being shaped, which reads the whole library and everybody's record. */
export const SHAPING = 'Shaping this routine to that curve…';

/** The words on the control that shapes one. */
export const SHAPE_IT_LABEL = 'Shape it';

/**
 * WHAT IS NOT DRAWN, said out loud.
 *
 * A list bounded in silence reads as the whole library. It lives here rather than in the drawing for
 * the reason every sentence does: a sentence in a `.tsx` is a sentence no suite drives and no sweep
 * reads, and the pinned collector at the bottom of this file is what makes that structural.
 */
export const MORE_CURVES_THAN_SHOWN = 'Your library holds more curves than are shown here.';

// ═══════════════════════════════════════════════════════════════════════════════
// The proposal, as it is read on the screen
// ═══════════════════════════════════════════════════════════════════════════════

/** One position of the curve: which movement would be done there, and what it stands in for. */
export interface ProposedRow {
  /** The position in the curve, as the adapter numbered it. */
  readonly position: number;
  /** The level the curve asked for here. Recorded with the fact — see {@link withLevel}. */
  readonly askedForLevel: string;
  /** What would be DONE at this position. */
  readonly exerciseId: string;
  readonly exerciseName: string;
  /** True when it came from the wider library rather than from this routine. */
  readonly fromLibrary: boolean;
  /** The routine's own line this sits on, which is the line a move is recorded against. */
  readonly lineExerciseId: string;
  /** That line's own exercise, named, when something else would stand in for it. */
  readonly standsInForName: string | null;
  /** The adapter's own sentence about the substitution, verbatim. Null when there was none. */
  readonly substitutionWords: string | null;
  /** The adapter's own sentence about a level that ran short here, verbatim. */
  readonly shortfallWords: string | null;
}

/** What one person would do at one position. Numbers, and where each one came from. */
export interface ProposedEffort {
  /** How this exercise is counted, as the library files it: `repetitions` or `time`. */
  readonly measurement: string;
  readonly sets: number;
  readonly repetitions: number | null;
  readonly durationSeconds: number | null;
  readonly restSeconds: number;
  /**
   * WHY THIS NUMBER IS THIS NUMBER — the adapter's own sentence, carried verbatim.
   *
   * The whole point of calibrating is that he can account for a number. A number that arrives with no
   * provenance is either trusted blindly or ignored entirely, and both are worse than showing the
   * working.
   */
  readonly referenceWords: string;
  /** Which of the three sources it was built from, so the screen can mark a measured one. */
  readonly referenceSource: string;
  /** The sentence saying a number was held back, and by whose number. Null when none was. */
  readonly heldBackWords: string | null;
}

/** One person in the room, their calibration, and their own numbers at every position. */
export interface PersonProposal {
  readonly clientId: string;
  readonly name: string;
  /** True when there was a record to calibrate against. False is ORDINARY, not an error. */
  readonly calibrated: boolean;
  /**
   * The adapter's own sentence about the baseline, verbatim — including the one it writes when there
   * was nothing recorded, which says so plainly and says to read the numbers as a starting point
   * rather than as a measurement. A default presented as though it were measured is a lie the coach
   * cannot detect, so this is never softened and never omitted.
   */
  readonly baselineWords: string;
  /** One per position, in the same order as {@link RoomProposal.rows}. */
  readonly efforts: readonly ProposedEffort[];
}

/**
 * WHY A CURVE COULD NOT BE SHAPED, in the two parts the house already uses for a refusal.
 *
 * A headline written for the coach, and the cause underneath it. The split is not decoration: the
 * adapter's own `IntensityInputError` says in as many words that its messages are written for the
 * module that called it and that the coach's own words live on the proposal — so carrying one of those
 * up as the headline would put a sentence about a scaling point on the screen he is reading with a
 * client in front of him. It is still SHOWN, as the detail, because a refusal he cannot describe is a
 * refusal nobody can fix. The same shape, for the same reason, as `RefusalReport` in
 * `modular-control.ts`.
 */
export interface ShapingRefusal {
  readonly headline: string;
  /** The cause, where there is one worth showing. Null where the headline is the whole of it. */
  readonly detail: string | null;
}

/** A curve, shaped across this routine, for everybody in the room. */
export interface RoomProposal {
  readonly patternId: string;
  readonly patternName: string;
  /** The adapter's own standing sentences, verbatim. The first is the whole contract said out loud. */
  readonly standingWords: readonly string[];
  /** The adapter's own sentence about how the curve was spread across the routine. */
  readonly curveWords: string;
  /** One per level that ran short, in the adapter's own words. */
  readonly shortfallWords: readonly string[];
  readonly rows: readonly ProposedRow[];
  readonly people: readonly PersonProposal[];
}

/** A person's short mark, so a card of numbers says at a glance whether they were measured. */
export function calibrationMark(calibrated: boolean): string {
  return calibrated ? 'Built from their own record' : 'From your library only';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Where he is looking, and what he has changed — this screen's own transient state
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EVERYTHING THIS SURFACE REMEMBERS, AND NONE OF IT IS A POSITION IN THE SESSION.
 *
 * The same standing `ControlState` has in `modular-control.ts`: `SESSION.md` §2 says where the coach
 * is LOOKING is the screen's own business and stays there, and this is that. It is passed to nothing
 * that writes.
 */
export interface IntensityState {
  /** The curve on screen for him to read, or null when none is. */
  readonly showing: RoomProposal | null;
  /** Which curve is being shaped, so the button he pressed can say so. Null when none is. */
  readonly shaping: string | null;
  /**
   * WHAT HE HAS TYPED OVER A PROPOSED NUMBER, keyed by {@link proposedKey}.
   *
   * Per person per position, which is what makes altering one tired client's numbers structurally
   * incapable of moving anybody else's — the same reason `modular-control.ts` keys its drafts per
   * person per line.
   */
  readonly edits: ReadonlyMap<string, Draft>;
  /** Why a curve could not be shaped. Null when nothing went wrong. */
  readonly refusal: ShapingRefusal | null;
  /**
   * THE CURVE HE ACCEPTED, which outlives the panel.
   *
   * Null until he accepts one and null again the moment he sets it aside. It carries no numbers of its
   * own — those went into the controls' drafts, where he can edit them — only the level each line was
   * asked for, what stands in for what, and the order.
   */
  readonly accepted: Accepted | null;
}

/** One line of an accepted curve. */
export interface AcceptedLine {
  /** The position in the curve, which is what puts the line in its place on screen. */
  readonly position: number;
  /**
   * The level the curve asked for. RECORDED WITH THE FACT — see {@link withLevel} and the header:
   * without it the adapter's own no-ratchet guarantee is lost at this seam.
   */
  readonly level: string;
  /** The library exercise that would stand in for this line, or null when the line stands itself. */
  readonly standsInWithId: string | null;
  readonly standsInWithName: string | null;
  /**
   * THE NUMBERS THE CURVE ASKED FOR HERE, KEPT SO A REPEAT IS STILL THE CURVE'S.
   *
   * Acceptance puts these into the controls' drafts, and `recorded()` deletes a draft once its fact is
   * on the record — correctly, because the draft has become a record. Without a copy here the line
   * would then fall back to the ROUTINE'S numbers, so pressing Record a second time on a shaped
   * session would quietly record something other than the shape he accepted. This is the seed
   * `lineDraft` falls to instead: below anything he has typed, above the routine.
   */
  readonly values: Draft;
}

/** A curve he accepted: the order it puts the lines in, and what each line was asked for. */
export interface Accepted {
  readonly patternId: string;
  readonly patternName: string;
  /**
   * THE ROUTINE'S LINES IN THE CURVE'S ORDER — the screen's own display order, and never the record's.
   *
   * A permutation of the routine's own exercise keys and nothing else: every position of the curve
   * sits on exactly one of the routine's lines, whether that line stands itself or something stands in
   * for it. See the header for why this is not the rule in `SESSION.md` §2 being broken.
   */
  readonly order: readonly string[];
  /** Keyed by `draftKey(clientId, lineExerciseId)`. Per person, always. */
  readonly lines: ReadonlyMap<string, AcceptedLine>;
}

/** Nothing pressed, nothing shown, nothing accepted. */
export function noIntensity(): IntensityState {
  return { showing: null, shaping: null, edits: new Map(), refusal: null, accepted: null };
}

/** He pressed a curve: it is being shaped, and whatever was on screen goes. */
export function shaping(state: IntensityState, patternId: string): IntensityState {
  return { ...state, showing: null, shaping: patternId, edits: new Map(), refusal: null };
}

/** The curve came back. Nothing has been changed and nothing has been saved. */
export function showing(state: IntensityState, proposal: RoomProposal): IntensityState {
  return { ...state, showing: proposal, shaping: null, edits: new Map(), refusal: null };
}

/** A curve could not be shaped, and the sentence says why rather than the panel going blank. */
export function refusedToShape(
  state: IntensityState,
  refusal: ShapingRefusal,
): IntensityState {
  return { ...state, showing: null, shaping: null, refusal };
}

/**
 * HE REJECTED IT OUTRIGHT, AND HE LANDS BACK EXACTLY WHERE HE WAS.
 *
 * The session is untouched because nothing was ever touched: this returns state with the panel gone
 * and everything he had accepted before still exactly as it was. There is no write to undo, no record
 * to restore and no draft to put back — which is the point of the whole shape, not a convenience.
 */
export function rejected(state: IntensityState): IntensityState {
  return { ...state, showing: null, shaping: null, edits: new Map(), refusal: null };
}

/** What he has typed over one person's numbers at one position, or the proposal's own. */
export function proposedKey(clientId: string, position: number): string {
  return `${clientId}::@${position}`;
}

/**
 * ONE KEYSTROKE, into one person's numbers at one position and nowhere else.
 *
 * The key names the person and the position, so a keystroke cannot land on another person's row even
 * by a caller's mistake — the requirement that altering one client's numbers must not silently change
 * another's, made structural at the screen as well as in the record.
 *
 * ## THE FIRST KEYSTROKE MUST SEED FROM THE PROPOSAL, AND THIS WAS A MEASURED DEFECT
 *
 * Found by driving the real application in a browser, with every suite green. The first edit to a
 * position has no draft to build on, and seeding from an EMPTY draft meant that changing the
 * repetitions silently EMPTIED the sets and the rest beside them — two calibrated numbers gone, on
 * screen, at the moment he adjusted a third. The suite had asserted the field he typed into and never
 * the two he did not.
 *
 * So `seed` is what a position starts from: pass the draft the position is currently showing, which is
 * `proposedDraft`. It is used ONLY when nothing has been typed against this key yet — his own
 * keystrokes always win, exactly as `openPanel` seeds a line's values once and then leaves them alone.
 */
export function changeProposed(
  state: IntensityState,
  key: string,
  field: keyof Draft,
  value: string,
  seed: Draft = EMPTY_DRAFT,
): IntensityState {
  const held = state.edits.get(key) ?? seed;
  return { ...state, edits: new Map(state.edits).set(key, { ...held, [field]: value }) };
}

/**
 * The numbers one person's position is working from: what he typed, or what was proposed.
 *
 * `observedLoad` and `note` are ALWAYS EMPTY here. No load is proposed at any position from any
 * source, and a note about an exercise is something he writes when it happens rather than something a
 * curve has an opinion about.
 */
export function proposedDraft(
  state: IntensityState,
  clientId: string,
  position: number,
  effort: ProposedEffort,
): Draft {
  return state.edits.get(proposedKey(clientId, position)) ?? draftFromEffort(effort);
}

/** A proposed effort as an editable draft. The load is left empty — see {@link proposedDraft}. */
export function draftFromEffort(effort: ProposedEffort): Draft {
  return {
    ...EMPTY_DRAFT,
    sets: String(effort.sets),
    repetitions: effort.repetitions === null ? '' : String(effort.repetitions),
    durationSeconds: effort.durationSeconds === null ? '' : String(effort.durationSeconds),
    restSeconds: String(effort.restSeconds),
  };
}

/**
 * WHAT IS WRONG WITH ANYTHING HE HAS TYPED, in the sentence he already knows from the Adjust panel.
 *
 * The same {@link draftProblem} the in-session controls use rather than a second set of bounds: the
 * numbers he types here become that panel's draft, so two answers to one question would mean a curve
 * he could accept and then not record.
 */
export function proposalProblem(state: IntensityState, proposal: RoomProposal): string | null {
  for (const person of proposal.people) {
    for (const row of proposal.rows) {
      const effort = person.efforts[row.position] ?? null;
      if (effort === null) continue;
      const problem = draftProblem(proposedDraft(state, person.clientId, row.position, effort));
      if (problem !== null) return problem;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Acceptance — which writes nothing at all
// ═══════════════════════════════════════════════════════════════════════════════

/** What accepting produced: the curve to hold, and the controls' state with the lines filled in. */
export interface Acceptance {
  readonly accepted: Accepted;
  readonly controls: ControlState;
}

/**
 * HE ACCEPTED IT. NOTHING IS WRITTEN, AND THAT IS NOT A SHORTFALL.
 *
 * Accepting fills the lines in and puts them in the curve's order. The numbers land in the in-session
 * controls' own drafts — the same drafts the Adjust panel edits and the same ones the Record control
 * writes from — so every value stays manually overridable afterwards, and a fact still reaches the
 * record only when he presses Record with the numbers in front of him. There is no apply path here
 * and `core/intensity/intensity.js` deliberately exports none either.
 *
 * A line the curve did not reach keeps whatever it had. A curve of five points across a routine of
 * eight leaves three lines alone rather than emptying them, because the adapter said nothing about
 * them and this file must not invent something.
 *
 * @param controls the controls' state as it stands, so what he had already typed is not thrown away
 *   for a line the curve did not reach
 */
export function accepted(
  state: IntensityState,
  proposal: RoomProposal,
  controls: ControlState,
): Acceptance {
  const drafts = new Map(controls.drafts);
  const lines = new Map<string, AcceptedLine>();

  for (const row of proposal.rows) {
    for (const person of proposal.people) {
      const effort = person.efforts[row.position] ?? null;
      if (effort === null) continue;
      const values = proposedDraft(state, person.clientId, row.position, effort);
      drafts.set(draftKey(person.clientId, row.lineExerciseId), values);
      lines.set(draftKey(person.clientId, row.lineExerciseId), {
        position: row.position,
        level: row.askedForLevel,
        standsInWithId: row.fromLibrary ? row.exerciseId : null,
        standsInWithName: row.fromLibrary ? row.exerciseName : null,
        values,
      });
    }
  }

  return {
    accepted: {
      patternId: proposal.patternId,
      patternName: proposal.patternName,
      order: proposal.rows.map((row) => row.lineExerciseId),
      lines,
    },
    // The panel closes, because what it was showing is now in front of him on the lines themselves.
    // Nothing else about the controls moves: no panel is opened for him, and no refusal is cleared
    // that he has not dealt with.
    controls: { ...controls, drafts },
  };
}

/** Hold the accepted curve, and put the panel away. */
export function holding(state: IntensityState, acceptance: Acceptance): IntensityState {
  return {
    ...state, showing: null, shaping: null, edits: new Map(), refusal: null,
    accepted: acceptance.accepted,
  };
}

/**
 * HE SET THE ACCEPTED SHAPE ASIDE: the order goes back to the routine's own and the lines are cleared.
 *
 * Reachable because acceptance wrote nothing. The drafts the acceptance filled in are removed so the
 * lines read from the routine again — but ONLY those, and only where he has not since typed over them
 * himself. A line he adjusted by hand after accepting is his own work, and setting a curve aside is not
 * an instruction to throw that away.
 *
 * WHICH LINES HE TYPED OVER IS DERIVED RATHER THAN REMEMBERED: a draft that no longer equals what the
 * acceptance put there is one he changed. No flag to set, none to forget to set, and none to go stale —
 * the same reason nothing in this application stores where a session has got to.
 */
export function setAside(
  state: IntensityState,
  controls: ControlState,
): { readonly state: IntensityState; readonly controls: ControlState } {
  const drafts = new Map(controls.drafts);
  if (state.accepted !== null) {
    for (const [key, line] of state.accepted.lines) {
      const held = controls.drafts.get(key);
      if (held !== undefined && sameDraft(held, line.values)) drafts.delete(key);
    }
  }
  return {
    state: { ...state, showing: null, shaping: null, edits: new Map(), refusal: null, accepted: null },
    controls: { ...controls, drafts },
  };
}

/**
 * Whether two drafts hold the same thing, field by field.
 *
 * Every field, including the two a curve never fills in: a load he typed onto a line after accepting a
 * shape is exactly the kind of work setting the shape aside must not discard, and it is the one value in
 * this application a machine must never touch.
 */
function sameDraft(a: Draft, b: Draft): boolean {
  return a.sets === b.sets
    && a.repetitions === b.repetitions
    && a.durationSeconds === b.durationSeconds
    && a.restSeconds === b.restSeconds
    && a.observedLoad === b.observedLoad
    && a.note === b.note;
}

/** The accepted line for one person's row, or null when no curve reached it. */
export function acceptedLine(
  accepted_: Accepted | null,
  clientId: string,
  exerciseId: string,
): AcceptedLine | null {
  if (accepted_ === null) return null;
  return accepted_.lines.get(draftKey(clientId, exerciseId)) ?? null;
}

/**
 * THE LINES IN THE ORDER HE ASKED FOR, when he has accepted a curve.
 *
 * Every line the routine holds comes back exactly once, whatever the curve said: the ones the curve
 * placed, in its order, then the ones it did not reach, in the routine's own order. A curve with fewer
 * points than the routine has exercises must not make lines disappear off the screen — the adapter
 * itself keeps the session's full length, and so does this.
 *
 * WITH NO ACCEPTED CURVE THIS RETURNS THE LINES UNTOUCHED. It consults nothing about what has been
 * recorded, in either case; the only thing that can move a line is a curve he pressed and accepted.
 */
export function linesInOrder<T extends { readonly exerciseId: string }>(
  lines: readonly T[],
  accepted_: Accepted | null,
): readonly T[] {
  if (accepted_ === null || accepted_.order.length === 0) return lines;

  const placed: T[] = [];
  const taken = new Set<string>();
  for (const exerciseId of accepted_.order) {
    if (taken.has(exerciseId)) continue;
    const line = lines.find((candidate) => candidate.exerciseId === exerciseId);
    if (line === undefined) continue;
    taken.add(exerciseId);
    placed.push(line);
  }
  // Everything the curve did not reach, in the routine's own declared order, after it.
  return [...placed, ...lines.filter((line) => !taken.has(line.exerciseId))];
}

/**
 * THE LEVEL, ON THE FACT — which is what keeps the adapter's no-ratchet guarantee true end to end.
 *
 * See the header. `intensity` is a key `LiveSession.recordPerformed` already accepts and
 * `core/session/journal.js` already maps onto the record model's own `intensity_level`, so nothing new
 * is stored: an existing optional field stops being always-absent. Without it, work performed at a
 * curve's harder point is read back as though it had been performed at the exercise's own library
 * point, and the next pass of the same curve proposes that number at the easier one.
 *
 * Only ever the level a curve ASKED FOR at a line he accepted. A line with no accepted curve records
 * exactly what it recorded before, with no level, because nobody said what level it was done at.
 */
export function withLevel(values: FactValues, line: AcceptedLine | null): FactValues {
  if (line === null) return values;
  return { ...values, intensity: line.level };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the panel says
// ═══════════════════════════════════════════════════════════════════════════════

/** The panel's own heading, naming the curve he pressed. */
export function proposalTitle(patternName: string): string {
  return `${patternName}, across this routine`;
}

/** What the accepted curve says about itself on the lines, so an order he did not expect is accounted for. */
export function acceptedWords(patternName: string): string {
  return `The exercises below are in the order of ${patternName}, with its numbers filled in. Nothing `
    + 'has been recorded: each line is recorded when you press Record on it, and every value is still '
    + 'yours to change first.';
}

/** What each position of the curve asked for, as a label on the row. */
export function levelWords(level: string): string {
  return `${level} point`;
}

/** What one person's numbers at one position read as, on one line. */
export function effortWords(draft: Draft): string {
  const parts: string[] = [];
  if (draft.sets.trim().length > 0) parts.push(`${draft.sets.trim()} sets`);
  if (draft.repetitions.trim().length > 0) parts.push(`${draft.repetitions.trim()} reps`);
  if (draft.durationSeconds.trim().length > 0) parts.push(`${draft.durationSeconds.trim()} seconds`);
  if (draft.restSeconds.trim().length > 0) parts.push(`${draft.restSeconds.trim()} seconds rest`);
  return parts.length === 0 ? 'Nothing filled in' : parts.join(' · ');
}

/** What something standing in for a routine line reads as, on the row it stands on. */
export function standsInWords(standsInWithName: string, insteadOfName: string): string {
  return `${standsInWithName} in place of ${insteadOfName}`;
}

/**
 * WHAT THE RECORD CONTROL SAYS when an accepted curve stands something else on that line.
 *
 * The control's act changed — it records a substitution, keeping both what was done and what it
 * replaced — so its words change with it. A button that quietly does something other than what it says
 * is the one shape of surprise a screen pressed mid-session cannot afford.
 */
export const RECORD_STAND_IN_LABEL = 'Record the stand-in';

/** The two ways out of the panel, and the words are the acts rather than yes and no. */
export const ACCEPT_LABEL = 'Use this shape';
export const REJECT_LABEL = 'Leave the session as it is';
export const SET_ASIDE_LABEL = 'Set this shape aside';

/**
 * WHAT REJECTING DOES, said before he presses it.
 *
 * Stated as a fact about the session rather than as reassurance, because it is one: nothing was
 * written when the curve was shaped, so there is nothing for rejecting to undo.
 */
export const REJECT_WORDS =
  'Leaving it puts this away and changes nothing. Nothing has been recorded, so the session is exactly '
  + 'as it was before you pressed the curve.';

/** What the numbers panel says about itself, once, above them. */
export const VALUES_WORDS =
  'Change any of these before you use the shape. They are filled in on the lines when you accept it, '
  + 'and you can still change them there.';

/** What a level that ran short is called on screen, above the adapter's own sentences about it. */
export const SHORTFALL_TITLE = 'Where this routine ran short';

/** What the row of provenance is called, so a sentence about a number is not an unlabelled aside. */
export const WHY_TITLE = 'Where these numbers came from';

/**
 * THE HEADLINE FOR A CURVE THAT COULD NOT BE SHAPED, and it is deliberately about the session.
 *
 * The adapter refuses an argument it cannot use — a routine with no exercises, an exercise whose
 * library entry has lost a scaling point — and its message names what was wrong for the MODULE that
 * called it, by its own account. So this is what the coach reads, the cause goes underneath as
 * {@link ShapingRefusal.detail}, and its last sentence is the one that matters to him mid-session:
 * everything he has recorded is untouched, because shaping a curve never wrote anything.
 */
export const COULD_NOT_SHAPE =
  'That curve could not be shaped across this routine. Nothing has been changed and everything already '
  + 'recorded is still here.';

/**
 * The stand-in name the sentence collector below interpolates.
 *
 * Deliberately not a shipped pattern's or exercise's name. Every curve and every exercise in this
 * application is the coach's content, read from his library; a seed literal sitting in this file is how
 * a configurable list quietly becomes a hard-coded one, and `intensity.test.ts` scans for exactly that.
 */
const SAMPLE_NAME = 'A curve of your own';

/**
 * EVERY SENTENCE THIS MODULE SHIPS, for the sweeps.
 *
 * Enumerated rather than claimed to be complete, exactly as `core/intensity/words.js` does it, and
 * pinned the same way: `intensity.test.ts` walks this module's own exports for anything
 * sentence-shaped and asserts this returns that set, so a sentence added to a new export fails there
 * rather than escaping the sweep.
 */
export function surfaceSentences(): readonly string[] {
  return [
    TOGGLES_TITLE, TOGGLES_WORDS, READING_PATTERNS, NO_PATTERNS, SHAPING, RECORD_STAND_IN_LABEL,
    SHAPE_IT_LABEL, MORE_CURVES_THAN_SHOWN,
    ACCEPT_LABEL, REJECT_LABEL, SET_ASIDE_LABEL, REJECT_WORDS, VALUES_WORDS,
    SHORTFALL_TITLE, WHY_TITLE, COULD_NOT_SHAPE,
    calibrationMark(true), calibrationMark(false),
    // A SAMPLE NAME THAT IS DELIBERATELY NOT A SHIPPED ONE. The sentences below interpolate his own
    // content, and this file must hold no shipped pattern or exercise of its own — a literal from the
    // seed sitting in here is how a hard-coded list starts.
    proposalTitle(SAMPLE_NAME), acceptedWords(SAMPLE_NAME),
    levelWords('medium'), standsInWords(SAMPLE_NAME, SAMPLE_NAME),
    effortWords({ ...EMPTY_DRAFT, sets: '3', repetitions: '12', restSeconds: '45' }),
    effortWords(EMPTY_DRAFT),
  ];
}

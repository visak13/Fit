/**
 * THE EFFECTIVE PRESCRIPTION — the exercise's own numbers with the routine's overrides on top,
 * resolved HERE and in no other file.
 *
 * ## THE RULE THIS FILE IMPLEMENTS, AND THE HALF THAT WAS MISSING
 *
 * `core/model/entities/routine.js` states it in as many words: the four optional entry fields are
 * routine-level OVERRIDES of the exercise's own defaults, and **omitting a field inherits the
 * exercise default**. Every shipped exercise carries `default_prescription` and
 * `default_rest_seconds`, and the model requires both.
 *
 * The overriding half was built. The INHERITING half was not: before this file existed,
 * `grep -rn default_prescription src/` returned nothing at all. `projection.js prescriptionOf`
 * hands over the routine's overrides AS STORED — which is correct, and is not the defect — and
 * every shell consumer then treated that as though it were the whole prescription. On the shipped
 * Pull day, seven of nine lines carry no override, so the coach was shown no sets, no reps and no
 * rest on seven lines, and the Adjust panel opened with six empty boxes.
 *
 * ## WHY THIS IS ONE MODULE AND NOT FOUR MERGES
 *
 * Four consumers each doing their own merge is four chances to disagree, and they would disagree on
 * exactly the line that matters. `runner.ts` resolves each line ONCE and every consumer downstream —
 * the row's words, the control panel's draft, what pressing Record writes, and which way the timer
 * opens — reads the value it resolved. Nothing else in the shell reads `default_prescription`.
 *
 * ## WHY IT LIVES IN THE SHELL AND NOT IN `core`
 *
 * Because it is a READ-SIDE presentation of two records the shell already holds, and putting it in
 * the core would change what the core MEANS. A routine entry deliberately stores only what the coach
 * chose to override — that is what makes "reset to defaults" and the library editor able to tell him
 * truthfully what he has customised, and what lets an edit to an exercise still reach the routines
 * that use it. `projection.js` is right to hand the overrides over as stored, and a core that
 * resolved them would have no way left to say which was which. So the merge happens where both
 * records are in hand and neither is written back: here, beside the four surfaces that read it.
 *
 * ## NOTHING HERE SUGGESTS ANYTHING, AND NOTHING HERE IS WRITTEN BACK
 *
 * An inherited number is what the library says this exercise is normally done at. It is not a
 * recommendation, not a progression, and not a target this application is setting for anybody. It is
 * shown as the starting point it is, every value stays overridable in the moment exactly as an
 * override already is, and {@link EffectivePrescription.sources} exists precisely so that a resolved
 * default can never be mistaken for a choice the coach made. This module returns a value and touches
 * no store: the routine goes on storing only its overrides, and a performed record goes on storing
 * what was actually done.
 *
 *     npm run test:shell
 */

// THIS FILE IMPORTS NOTHING, and that is the point of it holding {@link Prescription} rather than
// `modular-control.ts`, which used to. Every surface that reads a prescription now depends on the
// module that resolves one, and the dependency runs one way: there is no arrangement in which a
// consumer can be loaded, and be handed a prescription, without the resolution being present.

// ═══════════════════════════════════════════════════════════════════════════════
// What is being resolved, and where each number came from
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What one line is prescribed at: how much work, and how much rest. NEVER A LOAD — the shipped
 * library carries no weights at all and the model forbids one on a library record, because a load is
 * a per-client observation the coach made and not something a routine can ask for.
 *
 * TWO DIFFERENT THINGS WEAR THIS SHAPE and telling them apart is this module's whole subject.
 * `projection.js prescriptionOf` produces one holding the routine's OVERRIDES AS STORED, with a null
 * everywhere the routine overrode nothing. {@link resolvePrescription} produces the EFFECTIVE one,
 * where those nulls have been filled from the exercise's own defaults. Only the second is safe to
 * show a coach, and only the second says which of its numbers came from where.
 */
export interface Prescription {
  readonly sets: number | null;
  readonly repetitions: number | null;
  readonly duration_seconds: number | null;
  readonly rest_seconds: number | null;
}

/** The four numbers a line can carry, named as the record names them. */
export type PrescriptionField = 'sets' | 'repetitions' | 'duration_seconds' | 'rest_seconds';

/** The four, in the order they are read out to the coach. */
export const PRESCRIPTION_FIELDS: readonly PrescriptionField[] = Object.freeze([
  'sets', 'repetitions', 'duration_seconds', 'rest_seconds',
] as const);

/**
 * WHERE ONE NUMBER CAME FROM.
 *
 * `routine` — this routine set it for this exercise, deliberately, and it is his own choice.
 * `exercise` — inherited from what the library says this exercise is normally done at.
 * `neither` — there is no number, from either place, and the field is genuinely empty.
 *
 * Carried rather than derived afterwards, because once inheritance works the RESULT no longer says
 * which road it came down: a routine that overrides sets to 3 and an exercise whose default is 3
 * produce the same number by different routes, and only one of them is something the coach chose.
 * Every surface that tells him whose numbers he is looking at reads this and not the numbers.
 */
export type PrescriptionSource = 'routine' | 'exercise' | 'neither';

/**
 * As much of an exercise's library record as resolving needs.
 *
 * Deliberately loose about absence: the coach may have deleted the exercise since the session was
 * run, in which case there is a line with a name it cannot read back and no defaults to inherit.
 * That is an honest state and not a fault, and it resolves to the routine's own numbers alone.
 */
export interface ExerciseDefaults {
  readonly default_prescription?: {
    readonly sets?: number | null;
    readonly repetitions?: number | null;
    readonly duration_seconds?: number | null;
  } | null;
  readonly default_rest_seconds?: number | null;
}

/** A prescription with every number resolved, and a record of which road each one came down. */
export interface EffectivePrescription extends Prescription {
  /** Where each of the four came from. Never absent — `neither` is a source, not a gap. */
  readonly sources: Readonly<Record<PrescriptionField, PrescriptionSource>>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The resolution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE EXERCISE'S OWN NUMBERS, WITH THE ROUTINE'S OVERRIDES ON TOP.
 *
 * ## THE WORK UNIT IS ONE ANSWER IN TWO FIELDS, AND IT IS REPLACED AS A PAIR
 *
 * `checkPrescription` in `core/model/entities/exercise.js` guarantees that exactly one of
 * `repetitions` and `duration_seconds` is present on any prescription, and `referential.js` requires
 * a routine's override to agree with the exercise's `measurement`. So on well-formed content the two
 * always name the same unit and a field-by-field merge would be correct.
 *
 * It is NOT done field by field anyway. If a routine ever names one of the pair and the exercise's
 * default names the other — content edited outside the validator, an exercise's measurement changed
 * under a routine that still refers to it — a field-by-field merge would hand every consumer a line
 * carrying BOTH a rep count and a duration. `exercise-timer.ts workKindOf` reads `duration_seconds`
 * to decide whether the line is held or counted, so the coach would be shown a countdown on a line
 * his routine asked for in reps, and it would look entirely deliberate. The routine naming either
 * half of the pair therefore replaces the exercise's answer for BOTH.
 *
 * `sets` and `rest_seconds` carry no such pairing and are resolved on their own.
 *
 * @param override the routine's own overrides AS STORED, as `projection.js prescriptionOf` hands
 *   them over. Null where there is no line at all.
 * @param defaults the exercise's library record, or null where it is no longer in the library.
 */
export function resolvePrescription(
  override: Prescription | null,
  defaults: ExerciseDefaults | null,
): EffectivePrescription {
  const own = override ?? EMPTY_OVERRIDE;
  const library = defaults?.default_prescription ?? null;

  // The routine naming either half of the work unit replaces the exercise's answer for both — see
  // the header. `routineNamedTheUnit` is what makes that a decision rather than a coincidence.
  const routineNamedTheUnit = valueOf(own.repetitions) !== null
    || valueOf(own.duration_seconds) !== null;

  const sources: Record<PrescriptionField, PrescriptionSource> = {
    sets: 'neither', repetitions: 'neither', duration_seconds: 'neither', rest_seconds: 'neither',
  };

  const sets = pick('sets', valueOf(own.sets), valueOf(library?.sets), sources);
  const repetitions = pick(
    'repetitions',
    valueOf(own.repetitions),
    routineNamedTheUnit ? null : valueOf(library?.repetitions),
    sources,
  );
  const durationSeconds = pick(
    'duration_seconds',
    valueOf(own.duration_seconds),
    routineNamedTheUnit ? null : valueOf(library?.duration_seconds),
    sources,
  );
  const restSeconds = pick(
    'rest_seconds', valueOf(own.rest_seconds), valueOf(defaults?.default_rest_seconds), sources,
  );

  return {
    sets,
    repetitions,
    duration_seconds: durationSeconds,
    rest_seconds: restSeconds,
    sources: Object.freeze(sources),
  };
}

/**
 * Whether any of the four came from the routine rather than the exercise.
 *
 * Read by the words above the Adjust panel, so that what it says about whose numbers those are is
 * derived from the resolution rather than asserted beside it.
 */
export function hasRoutineNumbers(effective: EffectivePrescription): boolean {
  return PRESCRIPTION_FIELDS.some((field) => effective.sources[field] === 'routine');
}

/** Whether any of the four was inherited from the exercise's own defaults. */
export function hasInheritedNumbers(effective: EffectivePrescription): boolean {
  return PRESCRIPTION_FIELDS.some((field) => effective.sources[field] === 'exercise');
}

/** Whether there is any number at all to show. False is a real state: a deleted exercise, no override. */
export function hasAnyNumber(effective: EffectivePrescription): boolean {
  return PRESCRIPTION_FIELDS.some((field) => effective.sources[field] !== 'neither');
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/** No overrides at all, which is what a line with nothing of its own resolves against. */
const EMPTY_OVERRIDE: Prescription = Object.freeze({
  sets: null, repetitions: null, duration_seconds: null, rest_seconds: null,
});

/**
 * One number, and the record of where it came from.
 *
 * The routine wins where it has a value, the exercise supplies it where the routine does not, and
 * `neither` is written where there is nothing — an absent number and a number nobody asked for are
 * the same thing to a coach and must not be two states.
 */
function pick(
  field: PrescriptionField,
  own: number | null,
  library: number | null,
  sources: Record<PrescriptionField, PrescriptionSource>,
): number | null {
  if (own !== null) {
    sources[field] = 'routine';
    return own;
  }
  if (library !== null) {
    sources[field] = 'exercise';
    return library;
  }
  sources[field] = 'neither';
  return null;
}

/**
 * A number, or null for anything that is not one.
 *
 * `undefined` and `null` both mean "not set" here — the routine record omits a field it does not
 * override, and `prescriptionOf` has already turned those omissions into nulls, so both shapes reach
 * this file depending on which side the value came from.
 */
function valueOf(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

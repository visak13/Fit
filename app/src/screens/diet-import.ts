/**
 * WHAT THE IMPORT SURFACE DECIDES — and, just as importantly, what it cannot do.
 *
 * The coach's wife is the nutritionist and he TRANSCRIBES her plans. Pasting is therefore the
 * PRIMARY way a plan gets into this application, not an advanced feature tucked behind the editor:
 * if pasting is worse than typing he will type, and the feature has failed with every test still
 * green.
 *
 * ## NOTHING IS PARSED HERE. NOT ONE LINE
 *
 * `core/diet/import.js` reads the paste — every shape it accepts, every judgement about what is a
 * time and what is a quantity, what splits a list of foods and what does not, and what it refuses to
 * guess. That module is pure and has its own suite. This file DRIVES it and WORDS its report. If a
 * reading is wrong the fix belongs there, where the test for it already lives; a second reader in
 * front of it would be a second answer to the same question, and the two would drift.
 *
 * ## THIS MODULE CANNOT WRITE, AND THAT IS ENFORCED RATHER THAN INTENDED
 *
 * It imports no store, and it is handed none. {@link readPaste} is a PURE function: a paste in, a
 * draft and a report out, nothing stored. The write lives in `diet-editor-source.ts` and happens
 * only when the coach presses the confirm control — see {@link ImportStage}, which has a state for
 * "read but not confirmed" precisely so there is somewhere for him to stand and read before anything
 * is saved. `diet-import.test.ts` drives the whole flow against a REAL store and asserts the store
 * is still empty until the confirm step is taken.
 *
 * ## AND NOTHING IS HIDDEN FROM HIM
 *
 * The report's `could_not_place` is shown IN FULL, with each line quoted exactly as he pasted it,
 * and it is never collapsed to a count. A line dropped quietly is how a client's plan is lost with
 * nobody noticing — no error, no gap the eye catches, just a meal that is no longer there. The same
 * goes for the changes: `Tues` becoming Tuesday is a change to what the nutritionist wrote, and he
 * gets to see it before he agrees to it.
 *
 * The preview is the CHART — the same projection the diet screen draws — because "what it
 * understood" said as a grid is a thing he can hold against the piece of paper in his hand, and said
 * as a list of facts is a thing he has to reconstruct in his head.
 *
 * Diet is PLAINTEXT: no passphrase, no gate, no sensitivity marking on any of this.
 */

import { importDietPlan, projectWeekChart } from '../../core/diet/diet.js';

/** How far along the coach is. The whole point of the middle state is that he can stop in it. */
export type ImportStage = 'nothing-pasted' | 'read' | 'saved';

/** What the importer said, in the shapes the screen draws. Every field is the core's own. */
export interface ImportReading {
  /** The draft record the core built. OFFERED, never stored by anything in this file. */
  readonly draft: Record<string, unknown>;
  /** The chart the draft makes — what it understood, as the grid he already reads. */
  readonly preview: ReturnType<typeof projectWeekChart>;
  /** Which shape was read, in the core's plain words. */
  readonly layout: string;
  /** One sentence above everything else, the core's own. */
  readonly statement: string;
  /** What was read, in the core's sentences. */
  readonly understood: readonly string[];
  /** Every normalisation, naming the line and both forms. Shown in full. */
  readonly changed: readonly string[];
  /** Every line that produced nothing, quoted verbatim with the core's reason. NEVER collapsed. */
  readonly couldNotPlace: readonly { line: number; text: string; reason: string }[];
  /** Readings the coach should confirm rather than ones taken on his behalf. */
  readonly ambiguous: readonly { line: number; text: string; question: string }[];
  /** The RECORD's own refusals, sentences unchanged. */
  readonly recordRefusals: readonly { path: string; code: string; message: string }[];
  /** The partition of the paste. Every line lands in exactly one bucket. */
  readonly accounting: {
    total: number; blank: number; day_heading: number; column_heading: number;
    placed: number; unplaced: number;
  };
  /** Whether the RECORD accepted the draft. Its judgement, never this file's. */
  readonly ok: boolean;
}

/** Everything the import surface says. */
export interface ImportReport {
  readonly stage: ImportStage;
  readonly title: string;
  readonly intro: string;
  /** What was read, or null before he has pasted anything. */
  readonly reading: ImportReading | null;
  /** The heading over the preview, or null when there is nothing to preview. */
  readonly previewTitle: string | null;
  /** The one line above the report. Null before a paste. */
  readonly summary: string | null;
  /** The heading over the lines that could not be placed, or null when every line was placed. */
  readonly couldNotPlaceTitle: string | null;
  /** Said when NOTHING could not be placed, so a clean read is stated rather than left as a silence. */
  readonly everythingPlacedWords: string | null;
  /** The heading over the changes, or null when nothing was changed. */
  readonly changedTitle: string | null;
  /** The heading over the ambiguous readings, or null when nothing was ambiguous. */
  readonly ambiguousTitle: string | null;
  /** The words on the confirm control. */
  readonly confirmWords: string;
  /**
   * Whether the confirm control may be pressed AT ALL.
   *
   * False before a paste, and false while the RECORD refuses the draft — pressing it then would put
   * a refusal in front of him that he could have read already, and the refusals are shown instead.
   */
  readonly canConfirm: boolean;
  /** Why he cannot confirm, in plain words, or null when he can. */
  readonly cannotConfirmWords: string | null;
}

/** The heading over the whole surface. */
export const IMPORT_TITLE = 'Paste a plan';

/**
 * WHAT THIS SURFACE PROMISES, SAID BEFORE HE PASTES.
 *
 * The promise is the reason he will use it: nothing is saved until he has looked. An import that
 * wrote first and reported afterwards would be one he had to check by reading the plan back, which
 * is the work he was trying to avoid.
 */
export const IMPORT_INTRO = 'Paste the plan as you have it. Nothing is saved until you confirm.';

/** The label on the box he pastes into. */
export const PASTE_LABEL = 'The plan, pasted';

/** The words on the control that reads what he pasted. It reads; it does not save. */
export const READ_PASTE = 'See what this says';

/** The words on the control that actually writes. It says SAVE, because that is what it does. */
export const CONFIRM_IMPORT = 'Save this plan';

/** The heading over the grid of what was understood. */
export const PREVIEW_TITLE = 'What this was read as';

/** The heading over the lines that produced nothing. */
export const COULD_NOT_PLACE_TITLE = 'Lines that could not be placed';

/** The heading over the normalisations. */
export const CHANGED_TITLE = 'What was read differently from how it was written';

/** The heading over readings the coach has to settle. */
export const AMBIGUOUS_TITLE = 'Worth checking';

/**
 * SAID WHEN EVERY LINE WAS PLACED — an absence stated rather than left silent.
 *
 * "No lines could not be placed" and "the surface forgot to show them" look identical when both are
 * a blank space, and only one of them means his plan came through whole.
 */
export const EVERYTHING_PLACED =
  'Every line was placed. Nothing was left out.';

/** Said when he has pasted nothing yet. */
export const NOTHING_PASTED_WORDS = 'Nothing is pasted yet.';

/** Said when the record refuses the draft, above its own sentences. */
export const RECORD_REFUSED_WORDS =
  'This cannot be saved as it stands. These are the record’s own words about it:';

/**
 * READ A PASTE. PURE — a paste in, a draft and a report out, and nothing is stored.
 *
 * The client and the name are what the SCREEN knows and the paste cannot: whose plan this is and
 * what to call it. The core refuses to make either up, so a paste with neither comes back refused by
 * the record, which is the ordinary case and not a fault.
 */
export function readPaste(
  text: string,
  { clientId, name, sourceNote }: { clientId: string; name: string; sourceNote: string },
): ImportReading {
  const { draft, report } = importDietPlan(text, {
    client_id: clientId,
    name: name.trim().length > 0 ? name.trim() : null,
    source_note: sourceNote.trim().length > 0 ? sourceNote.trim() : null,
  }) as { draft: Record<string, unknown>; report: Record<string, any> };

  return {
    draft,
    // The draft is a BARE plan rather than a stored envelope, and `core/diet/plan.js` accepts both
    // in one place so neither projection has to know which it was handed.
    preview: projectWeekChart(draft),
    layout: report.layout,
    statement: report.statement,
    understood: report.understood,
    changed: report.changed,
    couldNotPlace: report.could_not_place,
    ambiguous: report.ambiguous,
    recordRefusals: report.record_refusals,
    accounting: report.line_accounting,
    ok: report.ok,
  };
}

/** Everything the import surface says, from where he has got to. */
export function describeImport(stage: ImportStage, reading: ImportReading | null): ImportReport {
  const has = reading !== null;

  return {
    stage,
    title: IMPORT_TITLE,
    intro: IMPORT_INTRO,
    reading,
    previewTitle: has ? PREVIEW_TITLE : null,
    summary: has ? summaryOf(reading) : null,
    couldNotPlaceTitle: has && reading.couldNotPlace.length > 0 ? COULD_NOT_PLACE_TITLE : null,
    everythingPlacedWords: has && reading.couldNotPlace.length === 0 ? EVERYTHING_PLACED : null,
    changedTitle: has && reading.changed.length > 0 ? CHANGED_TITLE : null,
    ambiguousTitle: has && reading.ambiguous.length > 0 ? AMBIGUOUS_TITLE : null,
    confirmWords: CONFIRM_IMPORT,
    canConfirm: has && reading.ok && stage === 'read',
    cannotConfirmWords: cannotConfirmWords(stage, reading),
  };
}

/**
 * THE ONE LINE ABOVE THE REPORT, AND IT IS AN ACCOUNT RATHER THAN A REASSURANCE.
 *
 * It carries the partition the core publishes — how many lines were placed against how many were
 * not — because "12 meals were read" is a count of what was KEPT, and a count of what was kept
 * cannot tell him whether anything was lost. The core's own statement follows it.
 */
export function summaryOf(reading: ImportReading): string {
  const { accounting } = reading;
  const unplaced = accounting.unplaced === 0
    ? 'nothing was left out'
    : `${String(accounting.unplaced)} could not be placed and ${accounting.unplaced === 1 ? 'is' : 'are'} listed below`;

  return `${String(accounting.total)} lines pasted: ${String(accounting.placed)} became meals, `
    + `${unplaced}. ${reading.statement}`;
}

/** Why the confirm control cannot be pressed, in plain words. */
function cannotConfirmWords(stage: ImportStage, reading: ImportReading | null): string | null {
  if (reading === null) return stage === 'saved' ? null : NOTHING_PASTED_WORDS;
  if (stage === 'saved') return null;
  return reading.ok ? null : RECORD_REFUSED_WORDS;
}

/** Said once, after the write has committed. It names where the plan now is. */
export function savedWords(name: string): string {
  return `"${name}" is saved on this device. It is not the plan they follow now until you say so.`;
}

/**
 * THE SESSION RUNNER'S JUDGEMENT — every word it says and every decision behind them, decided here
 * so the suite can assert them with no rendering at all.
 *
 * The same split every screen in this application follows: `screens/removals.ts` sits beside
 * `screens/RemovalsScreen.tsx`, and the suite drives the module. A screen that decided inside its
 * component would be a screen nothing can check outside a browser, and these suites do not run one.
 *
 * ## WHAT THIS SCREEN IS, AND THE THREE THINGS IT DELIBERATELY IS NOT
 *
 * It is the SPINE: the route, the screen, the live handle and the honest states. Three sibling steps
 * mount on top of it — the in-session controls that record what happened, the readings and the
 * timer, and the intensity adapter. Each of those is named at the seam it will use, in a comment,
 * rather than half-built here. The previous session at a glance is a sibling's too:
 * `core/session/glance.js` already holds it and `launcher-source.ts` already reads it, so nothing
 * here re-derives it.
 *
 * ## THE RULE THIS SCREEN COULD BREAK WITH NO TEST NOTICING
 *
 * `core/session/SESSION.md` §2: a session is a record of what OCCURRED, not a position in a script.
 * Anything describing where the session has got to is DERIVED, never persisted — no cursor, no
 * current exercise, no next exercise, no step index, not on the record and not in the view. This
 * module therefore reports what the RECORD says and never where the coach should be. `not_yet_recorded`
 * is the closest thing to a suggestion in the whole layer and it is not one: it is the statement
 * "these lines have nothing against them yet", shown in the routine's declared order, which is a
 * DEFAULT and not a script. Where the coach was last looking is the screen's own transient state and
 * it goes nowhere near the record.
 *
 * The suite asserts that absence on this module's own source as well as on its output, because an
 * absence and an oversight look identical to the next editor — the same guard `glance.js` carries.
 *
 * ## NOTHING HERE SUGGESTS ANYTHING
 *
 * No proposed load, no heavier weight, no longer hold, no progression, nothing carried forward from
 * a previous session. A load appears exactly where the coach observed it and reads as his own
 * observation. That is the standing principle — the app supports, the coach decides — and this is the
 * screen where breaking it would feel most helpful.
 *
 * ## EVERY REFUSAL IS THE CORE'S OWN SENTENCE
 *
 * `openSession` writes a sentence for the coach on every reason it can refuse: not on this device,
 * already finished, open in your other window. They are carried through UNCHANGED. A second version
 * written here would be two sentences about one refusal, free to drift apart, and the one he reads
 * would be whichever screen he happened to be on.
 */

import { SESSION_PATH } from '../shell/navigation';
import { resolvePrescription } from './effective-prescription';
import type { EffectivePrescription, ExerciseDefaults } from './effective-prescription';

// ═══════════════════════════════════════════════════════════════════════════════
// The address
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The query key naming which session is open.
 *
 * A QUERY rather than a path segment — `shell/navigation.ts` holds the whole argument. A record
 * IDENTITY travels in it and never a name: an address is the one part of this application that gets
 * bookmarked, restored from a home screen and read over somebody's shoulder.
 */
export const OPEN_SESSION_KEY = 'open';

/** The runner's own address, with no session named. Spelled once; every link reads it from here. */
export const RUNNER_ADDRESS = `/${SESSION_PATH}`;

/**
 * Where a particular session opens.
 *
 * THIS IS THE DURABLE ONE. It survives a refresh, a cold start from the home screen and the laptop
 * sleeping — which is the case the whole session layer is shaped around, and the reason the identity
 * is in the address at all rather than only in this window's memory.
 */
export function sessionAddress(sessionId: string): string {
  return `${RUNNER_ADDRESS}?${OPEN_SESSION_KEY}=${encodeURIComponent(sessionId)}`;
}

/**
 * The words on the calendar's permanent way in.
 *
 * PERMANENT, and never conditional on there being a session open — the same choice, for the same
 * reason, as the links to the four other non-destination screens: a way in that appears only when
 * there is something to see is a way in he cannot learn.
 */
export const RUNNER_WAY_IN_LABEL = 'The session you are running';

/** What that link says about itself, so pressing it is never a guess. */
export const RUNNER_WAY_IN_WORDS =
  'Starting a session below opens it here, and so does picking up one you left unfinished. This is '
  + 'also the way back to it if you go somewhere else in the meantime.';

/** The words on the way back to the calendar, drawn on the runner in every state. */
export const BACK_TO_CALENDAR_LABEL = 'Calendar';

/** Where that way back goes. Absolute, because a relative target resolves against where he is. */
export const CALENDAR_ADDRESS = '/calendar';

// ═══════════════════════════════════════════════════════════════════════════════
// The honest states, before there is a session to show
// ═══════════════════════════════════════════════════════════════════════════════

/** The screen's own name, drawn in every state so an arrival from a stale link still says where he is. */
export const RUNNER_TITLE = 'Session';

/** What the screen says when it was reached with no session named and this window is running none. */
export const NO_SESSION_OPEN = 'No session is open in this window.';

/**
 * What to do about that, said as the thing to do rather than as a fault.
 *
 * It names the calendar because that is where both doors are, and it names BOTH of them: a coach who
 * arrived here after his laptop slept has a session waiting to be picked up, not a session to start,
 * and being told only about starting would have him begin a second one.
 */
export const NO_SESSION_OPEN_WHAT_TO_DO =
  'Sessions are started from the Calendar, and one you left unfinished is picked up from there too.';

/** What the screen says while it is opening the session it was given. */
export const OPENING_WORDS = 'Opening that session…';

/** What a refusal reads as. */
export interface OpeningReport {
  /** True only when a live session is in hand. */
  readonly open: boolean;
  /** The core's own sentence, verbatim, or this module's for a state the core has no word for. */
  readonly headline: string;
  /** The thing he can do about it, or null when the headline already is one. */
  readonly whatToDo: string | null;
  /** The core's reason code, carried so the screen can mark the state without re-reading the words. */
  readonly reason: string | null;
}

/**
 * WHAT A REFUSAL SAYS, AND IT IS NOT THIS MODULE'S SENTENCE.
 *
 * `openSession` returns `{ ok: false, reason, message }` where the message is written for the coach —
 * "That session is open in your other window. Continue it there, or close that window and open it
 * here." Carried through unchanged. The only wording added is what to DO, and only where the core's
 * sentence does not already contain it.
 *
 * A refusal with no sentence at all is still reported rather than swallowed: an outcome nobody
 * worded is a defect in the core, and showing him a blank card would hide it.
 */
export function describeOpening(outcome: {
  ok: boolean;
  reason?: string;
  message?: string;
}): OpeningReport {
  if (outcome.ok) {
    return { open: true, headline: '', whatToDo: null, reason: null };
  }

  const reason = outcome.reason ?? null;
  const headline = outcome.message ?? 'That session could not be opened on this device.';

  return {
    open: false,
    headline,
    whatToDo: reason === 'held_elsewhere' ? null : NO_SESSION_OPEN_WHAT_TO_DO,
    reason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The session itself
// ═══════════════════════════════════════════════════════════════════════════════

/** One line of the routine, and what the record says about it. */
export interface LineReport {
  /**
   * The exercise the routine named, by content key.
   *
   * Carried so a move can be recorded against this line. It is what a session references library
   * content by, and it is NOT a position: the same key appears on the same line whatever order the
   * session runs in and whatever has been recorded against it.
   */
  readonly exerciseId: string;
  /** The exercise's own name where it could be read back, and its content key where it could not. */
  readonly name: string;
  /**
   * What the RECORD says about this line. Never an instruction, never a suggestion, and never a
   * position — see the header.
   */
  readonly words: string;
  /** True when nothing has been recorded against this line yet. */
  readonly notYetRecorded: boolean;
  /** What this line is prescribed at, worded, or null when neither the routine nor the exercise
   * asked for anything at all. Read off {@link effective} — see {@link describeSession}. */
  readonly prescription: string | null;
  /**
   * THE ONE RESOLVED PRESCRIPTION FOR THIS LINE, and the value every other surface on this row reads.
   *
   * The exercise's own numbers with the routine's overrides on top, resolved ONCE by
   * `screens/effective-prescription.ts`. It is carried on the report rather than re-derived beside
   * each control because four surfaces read it — this module's words, the control panel's draft,
   * what pressing Record writes, and which way the timer opens — and four merges are four chances to
   * disagree on the line that matters. It also carries where each number came from, so a number the
   * routine set and a number inherited from the library can be told apart after the fact.
   */
  readonly effective: EffectivePrescription;
  /** The loads the coach noted against this line, verbatim and in the order he noted them. */
  readonly loads: readonly string[];
}

/** One attending client, and what has been recorded for them. */
export interface AttendeeReport {
  readonly clientId: string;
  readonly name: string;
  /** The routine's lines in its DECLARED order — a default, not a script. */
  readonly lines: readonly LineReport[];
  /** What was recorded that the routine never named. Not dropped, and not made to stand in for a line. */
  readonly beyondTheRoutine: readonly string[];
  /** How much is on the record for this person, as a sentence. */
  readonly recordedWords: string;
  /** The plain statement about what has nothing against it yet, or null when everything has. */
  readonly notYetRecordedWords: string | null;
}

/** Everything the spine shows. */
export interface SessionReport {
  readonly sessionId: string;
  /** The routine's name, or the honest sentence for a routine that is no longer in the library. */
  readonly heading: string;
  /** Whether this window is running it, worded. */
  readonly stateWords: string;
  /** True while the session is live in this window. */
  readonly live: boolean;
  readonly attendees: readonly AttendeeReport[];
  /** Said when the routine could not be read back, so its lines are unknown rather than empty. */
  readonly routineUnknownWords: string | null;
  /** How many stored facts this view was replayed from. A number, so "it resumed" can be checked. */
  readonly replayedWords: string;
  /** Notes about the session as a whole, belonging to nobody. */
  readonly sessionNotes: readonly string[];
}

/** What the screen has to hand besides the view: the names nothing else can supply. */
export interface RunnerContext {
  /** Each attending client's name by identity. A person whose name cannot be read is shown honestly. */
  readonly clientNames: ReadonlyMap<string, string>;
  /** Each exercise's name by content key, which is how a session references library content. */
  readonly exerciseNames: ReadonlyMap<string, string>;
  /**
   * Each exercise's own library record by the same key, which is where a line inherits every number
   * its routine entry does not override. Absent for an exercise the coach has since deleted, and
   * the line then shows the routine's own numbers alone rather than invented ones.
   */
  readonly exerciseDefaults: ReadonlyMap<string, ExerciseDefaults>;
  /** The routine's name, or null when it is no longer in the library. */
  readonly routineName: string | null;
}

/** The state of a session, in the coach's words rather than the record's. */
const STATE_WORDS: Readonly<Record<string, string>> = {
  in_progress: 'Running in this window.',
  interrupted: 'Left unfinished. Picking it up puts it back exactly as it stood.',
  planned: 'Written down, not started.',
  // FINISHED. Reachable since the finish control was wired — `screens/session-ending.ts` — and until
  // then this fell through to "Recorded as completed.", which is the record's word and not his.
  // It says the record is kept because that is the question a finished session raises.
  completed: 'Finished. Everything recorded in it is kept.',
};

/** What the record says about one line, by the outcome the projection derived. */
const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  'not-recorded': 'Nothing recorded against this yet',
  performed: 'Recorded',
  partial: 'Recorded as partly done',
  skipped: 'Recorded as skipped',
  substituted: 'Recorded with something else in its place',
};

/**
 * THE WHOLE SPINE, WORDED.
 *
 * The lines come out in the ROUTINE'S DECLARED ORDER because that is the order `projectSession` puts
 * them in, and this module does not re-sort them. It also does not sort them by what has been
 * recorded, which is the obvious tidy thing to do and would be the rule in §2 broken quietly: a list
 * that moved the untouched lines to the top would be telling him where to go next.
 *
 * @param view the projection from `core/session/projection.js`
 */
export function describeSession(
  view: {
    session_id: string;
    status: string;
    is_live: boolean;
    clients: readonly {
      client_id: string;
      plan: readonly {
        exercise_id: string;
        outcome: string;
        repeated: boolean;
        prescription: { sets: number | null; repetitions: number | null;
          duration_seconds: number | null; rest_seconds: number | null };
        attempts: readonly { observed_load: string | null }[];
      }[];
      beyond_the_routine: readonly string[];
      not_yet_recorded: readonly string[];
      counts: { performed: number; readings: number; notes: number };
    }[];
    session_notes: readonly { content?: { text?: string } }[];
    replayed_records: number;
  },
  context: RunnerContext,
): SessionReport {
  const attendees = view.clients.map((client) => {
    const lines = client.plan.map((line) => {
      // THE ONE RESOLUTION, and it is here rather than in any of the four surfaces that read it.
      // `projection.js` hands over the routine's OVERRIDES as stored, which is right and is not the
      // defect; the exercise's own defaults are the other half and are inherited wherever the
      // routine overrode nothing. `core/model/entities/routine.js` states that rule; nothing in this
      // shell implemented it until `effective-prescription.ts` did.
      const effective = resolvePrescription(
        line.prescription,
        context.exerciseDefaults.get(line.exercise_id) ?? null,
      );
      return {
        exerciseId: line.exercise_id,
        name: nameOfExercise(line.exercise_id, context),
        words: line.repeated && line.outcome !== 'not-recorded'
          ? `${OUTCOME_WORDS[line.outcome] ?? 'Recorded'}, more than once`
          : OUTCOME_WORDS[line.outcome] ?? 'Recorded',
        notYetRecorded: line.outcome === 'not-recorded',
        prescription: describePrescription(effective),
        effective,
        loads: line.attempts
          .map((attempt) => attempt.observed_load)
          .filter((load): load is string => typeof load === 'string' && load.length > 0),
      };
    });

    return {
      clientId: client.client_id,
      name: context.clientNames.get(client.client_id) ?? 'Somebody on this device',
      lines,
      beyondTheRoutine: client.beyond_the_routine.map((key) => nameOfExercise(key, context)),
      recordedWords: describeCounts(client.counts),
      notYetRecordedWords: client.not_yet_recorded.length === 0
        ? null
        // A statement about the RECORD. Not "do these next" — see the header, and SESSION.md §2.
        : `${client.not_yet_recorded.length} of the routine's `
          + `${client.plan.length} exercises have nothing recorded against them yet.`,
    };
  });

  return {
    sessionId: view.session_id,
    heading: context.routineName ?? 'A routine that is no longer in your library',
    stateWords: STATE_WORDS[view.status] ?? `Recorded as ${view.status}.`,
    live: view.is_live,
    attendees,
    routineUnknownWords: view.clients.every((client) => client.plan.length === 0)
      ? 'The routine this session was run from is not in your library any more, so its exercises '
        + 'cannot be listed. Everything that was recorded is still here.'
      : null,
    replayedWords: view.replayed_records === 1
      ? 'Read back from 1 stored fact.'
      : `Read back from ${view.replayed_records} stored facts.`,
    sessionNotes: view.session_notes
      .map((note) => note.content?.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0),
  };
}

/**
 * WHO IS IN THE ROOM, as one sentence.
 *
 * A session is a routine plus a SET of clients — one to many — and the coach may be running it for
 * three people at once. Saying so at the top is what makes the per-person panels below read as
 * halves of one session rather than as three sessions.
 */
export function describeRoom(attendees: readonly AttendeeReport[]): string {
  if (attendees.length === 0) return 'Nobody is recorded as attending this session.';
  const names = attendees.map((attendee) => attendee.name);
  if (names.length === 1) return `With ${names[0]}.`;
  return `With ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * An exercise's name, or its content key when the coach has since deleted it.
 *
 * The key is shown as it stands rather than replaced with an invented name — the session really did
 * reference it, and it is the thing he can look up. `launcher-source.ts` settled this for the glance
 * panel and the reasoning is identical.
 */
function nameOfExercise(key: string, context: RunnerContext): string {
  return context.exerciseNames.get(key) ?? key;
}

/**
 * What this line is prescribed at, worded.
 *
 * IT TAKES THE RESOLVED PRESCRIPTION AND NEVER THE ROUTINE'S RAW OVERRIDES. That is the whole defect
 * this function used to carry: it was handed `prescriptionOf(entry)` — the routine's overrides as
 * stored — and worded them as though they were the whole prescription, so seven of the shipped Pull
 * day's nine lines, which override nothing, worded as nothing at all. Null now means what it says:
 * neither the routine nor the exercise carries a number for this line.
 *
 * NEVER A LOAD. The shipped library carries no weights at all and the model forbids one on a library
 * record: a prescription is work and rest, and a load is a per-client observation the coach made.
 */
function describePrescription(prescription: {
  sets: number | null; repetitions: number | null;
  duration_seconds: number | null; rest_seconds: number | null;
}): string | null {
  const parts: string[] = [];
  if (prescription.sets !== null) parts.push(`${prescription.sets} sets`);
  if (prescription.repetitions !== null) parts.push(`${prescription.repetitions} reps`);
  if (prescription.duration_seconds !== null) parts.push(`${prescription.duration_seconds} seconds`);
  if (prescription.rest_seconds !== null) parts.push(`${prescription.rest_seconds} seconds rest`);
  return parts.length === 0 ? null : parts.join(' · ');
}

/** How much is on the record for one person. Nought is a state, not an absence of one. */
function describeCounts(counts: { performed: number; readings: number; notes: number }): string {
  const parts = [
    `${counts.performed} ${counts.performed === 1 ? 'exercise' : 'exercises'} recorded`,
    `${counts.readings} ${counts.readings === 1 ? 'reading' : 'readings'}`,
    `${counts.notes} ${counts.notes === 1 ? 'note' : 'notes'}`,
  ];
  return `${parts.join(', ')}.`;
}

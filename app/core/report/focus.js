/**
 * WHAT THEY WORKED ON — the raw material for the third thing the report says.
 *
 * The plain-language summary needs to name the work, and there are only two honest ways to name it:
 * by the movements themselves, and by the families those movements fall into. Both come out of this
 * client's OWN performed records, which are per client by construction — the coach may modify an
 * exercise for one tired client while the rest continue, so what one person did is never what the
 * session did.
 *
 * ## Named, never counted
 *
 * Movements come back in order of how often they came up, and the ORDER is all that is published:
 * the counts stay inside this module and never reach a sentence. "Push ups, planks and rows came up
 * most often" is a summary; "36 push ups" is the data dump this report was defined against.
 *
 * Repetitions, sets, loads and durations are not merely unused here — `participation.js` never
 * carried them into the building, so there is nothing to accidentally print.
 *
 * ## A skipped exercise is not work
 *
 * `skipped` records exist so the history is honest about what did not happen. They are excluded from
 * what the client worked on, because they are precisely the thing that was not worked on. A
 * `substituted` record names the exercise that was ACTUALLY done, so it counts as itself.
 *
 * ## The family map covers a CLOSED vocabulary, and a test holds it to that
 *
 * `MOVEMENT_PATTERNS` in the model is closed, so mapping it to readable families is safe — but only
 * while the map keeps up with it. A test asserts every pattern the model declares has a family here,
 * so a pattern added to the model fails loudly instead of silently vanishing out of every summary.
 *
 * Pure. No clock, no store, no browser.
 */

import { MOVEMENT_PATTERNS } from '../model/vocabularies.js';
import { contentOf, textOf } from './records.js';

/**
 * Every movement pattern the model declares, as the family a client would recognise.
 *
 * The families are broad on purpose. A client reads "lower body" and knows what their week looked
 * like; "hip-extension" is a coach's word, and putting it in their report would be showing them the
 * database.
 * @type {Readonly<Record<string, string>>}
 */
export const PATTERN_FAMILIES = Object.freeze({
  squat: 'lower body',
  hinge: 'lower body',
  lunge: 'lower body',
  'single-leg': 'lower body',
  'hip-extension': 'lower body',
  'knee-flexion': 'lower body',
  'calf-raise': 'lower body',
  'horizontal-push': 'pushing',
  'vertical-push': 'pushing',
  'shoulder-raise': 'pushing',
  'horizontal-pull': 'pulling',
  'vertical-pull': 'pulling',
  'elbow-flexion': 'arms',
  'elbow-extension': 'arms',
  rotation: 'core',
  'anti-extension': 'core',
  'anti-rotation': 'core',
  'anti-lateral-flexion': 'core',
  'isometric-hold': 'holds',
  carry: 'carrying',
  locomotion: 'conditioning',
  jump: 'conditioning',
  conditioning: 'conditioning',
  mobility: 'mobility',
  'olympic-derivative': 'whole-body power',
});

/** The model's list, re-exported so a test can hold the map against it through one import path. */
export const MODEL_MOVEMENT_PATTERNS = MOVEMENT_PATTERNS;

/** Performed statuses that mean work actually happened. */
export const WORKED_STATUSES = Object.freeze(['performed', 'partial', 'substituted']);

/**
 * A library keyed by content key, from whatever the caller has: records, envelopes, or nothing.
 *
 * @param {unknown} exercises
 * @returns {Map<string, {name: string|null, movement_pattern: string|null}>}
 */
export function exerciseIndex(exercises) {
  const index = new Map();
  for (const record of Array.isArray(exercises) ? exercises : []) {
    const content = contentOf(record);
    const id = textOf(content.id);
    if (id === null) continue;
    index.set(id, {
      name: textOf(content.name),
      movement_pattern: textOf(content.movement_pattern),
    });
  }
  return index;
}

/**
 * A content key read as words, for an exercise the library no longer holds.
 *
 * The coach edits and deletes his library freely — it is his, and the shipped set is a starting
 * point he corrects on first use. So a performed record can outlive the exercise it names, and the
 * report says "wall sit" rather than dropping a movement the client remembers doing.
 *
 * @param {string} exerciseId
 * @returns {string}
 */
export function readExerciseKey(exerciseId) {
  return String(exerciseId || '').split('-').filter((part) => part.length > 0).join(' ');
}

/**
 * @typedef {Object} FocusMovement
 * @property {string} exercise_id
 * @property {string} name What the client is shown — the library's name, or the key read as words.
 * @property {string|null} family
 * @property {number} sessions How many of their sessions it came up in. Ordering material; a
 *   sentence never prints it.
 */

/**
 * @typedef {Object} Focus
 * @property {FocusMovement[]} movements Most-attended first, then alphabetical so ties are stable.
 * @property {{family: string, movements: number}[]} families Broadest first.
 * @property {number} movement_count
 * @property {number} skipped How many entries were recorded as skipped. Not shown to the client;
 *   available so a caller can tell an empty focus from one that was all skips.
 */

/**
 * What this client worked on, out of their own performed records.
 *
 * @param {Array<{exercise_id: string|null, status: string, session_id: string|null}>} performed
 * @param {unknown} exercises The library, for names. Optional — missing names are read from keys.
 * @returns {Focus}
 */
export function projectFocus(performed, exercises) {
  const library = exerciseIndex(exercises);
  const rows = Array.isArray(performed) ? performed : [];

  /** @type {Map<string, {sessions: Set<string>, family: string|null, name: string}>} */
  const byExercise = new Map();
  let skipped = 0;

  for (const row of rows) {
    if (!WORKED_STATUSES.includes(row?.status)) {
      if (row?.status === 'skipped') skipped += 1;
      continue;
    }
    const id = textOf(row.exercise_id);
    if (id === null) continue;

    const known = library.get(id);
    if (!byExercise.has(id)) {
      byExercise.set(id, {
        sessions: new Set(),
        family: known?.movement_pattern ? familyOf(known.movement_pattern) : null,
        name: known?.name || readExerciseKey(id),
      });
    }
    // A movement repeated inside one session is one appearance, not several. Counting entries would
    // make a circuit of three rounds look like three times the work of a straight set.
    byExercise.get(id).sessions.add(row.session_id || id);
  }

  const movements = [...byExercise.entries()]
    .map(([exerciseId, found]) => ({
      exercise_id: exerciseId,
      name: found.name,
      family: found.family,
      sessions: found.sessions.size,
    }))
    .sort((a, b) => (b.sessions - a.sessions) || a.name.localeCompare(b.name));

  return {
    movements,
    families: countFamilies(movements),
    movement_count: movements.length,
    skipped,
  };
}

/**
 * The family a movement pattern belongs to, or null for a pattern the model does not declare.
 * @param {string|null} pattern
 * @returns {string|null}
 */
export function familyOf(pattern) {
  if (typeof pattern !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PATTERN_FAMILIES, pattern)
    ? PATTERN_FAMILIES[pattern]
    : null;
}

/**
 * @param {FocusMovement[]} movements
 * @returns {{family: string, movements: number}[]}
 */
function countFamilies(movements) {
  const counts = new Map();
  for (const movement of movements) {
    if (movement.family === null) continue;
    counts.set(movement.family, (counts.get(movement.family) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, movements: count }))
    .sort((a, b) => (b.movements - a.movements) || a.family.localeCompare(b.family));
}

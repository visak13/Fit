/**
 * TRENDS OVER TIME — the readings the coach ACTUALLY captures, charted so movement is visible.
 *
 * This is the first of the three things a client's progress report says, and it is the reason the
 * report reads like a report rather than a dump: a plank hold that went from forty seconds to
 * sixty-five is a story, and a column of numbers is not.
 *
 * ## The kind list is DISCOVERED, never typed
 *
 * The reading vocabulary is deliberately OPEN — `core/model/vocabularies.js` pins a unit to the kinds
 * the app ships knowledge of, and the coach may record a kind of his own that the app has never heard
 * of. So the kinds this module charts are read out of the client's OWN readings at runtime, and the
 * app's shipped vocabulary is read out of the model. Neither is written down here.
 *
 * That is not tidiness. A hand-typed list of what to chart is a promise somebody has to remember to
 * keep: this build has now paid four separate times for a guard whose scope was typed, went stale
 * against a world that moved, and stayed green while checking less than it claimed. A kind the coach
 * invents tomorrow appears in the report tomorrow, with no edit here.
 *
 * ## What a trend is, and the thing it deliberately is NOT
 *
 * A trend is the SERIES, plus where it started, where it stands now, and the movement between those
 * two. It is not a maximum, not a best, and not a ranking. Personal bests were offered to the user
 * and explicitly not chosen, and the difference is not cosmetic: a best is the one number a client
 * cannot beat on a tired day, and a series is a thing that goes up and down and is still progress.
 *
 * It is also not an opinion. `direction` says up, down or steady — it never says better. Whether a
 * falling resting heart rate is good and a falling plank hold is bad is a coaching judgement about a
 * person the application has never met, and it belongs to the certified professional who is also
 * adapting to a client's history.
 *
 * Pure. No clock, no store, no browser.
 */

import { READING_KINDS, READING_UNITS } from '../model/vocabularies.js';

/**
 * How each unit in the model's CLOSED unit vocabulary reads in a sentence.
 *
 * A closed vocabulary may be mapped, but the map must not be allowed to fall behind it — so a test
 * asserts this covers every value of `READING_UNITS` exactly, and a unit added to the model with no
 * words here fails that test rather than reaching a client as a bare token.
 * @type {Readonly<Record<string, string>>}
 */
export const UNIT_WORDS = Object.freeze({
  bpm: 'beats per minute',
  seconds: 'seconds',
  repetitions: 'repetitions',
  count: '',
});

/**
 * The kinds the app itself knows about, read from the model. Exported so a caller can say which of a
 * client's readings are shipped kinds and which the coach invented, without a second copy of the
 * list existing anywhere.
 * @returns {string[]}
 */
export function knownReadingKinds() {
  return Object.keys(READING_KINDS).sort();
}

/**
 * The kinds actually present in a set of narrowed readings, discovered by looking.
 *
 * @param {Array<{kind: string}>} readings
 * @returns {string[]} in first-seen order, so a chart's order follows the client's own history
 */
export function readingKindsIn(readings) {
  const seen = [];
  for (const reading of Array.isArray(readings) ? readings : []) {
    if (typeof reading?.kind !== 'string') continue;
    if (!seen.includes(reading.kind)) seen.push(reading.kind);
  }
  return seen;
}

/**
 * A kind key as words: `plank-hold` reads "plank hold".
 *
 * Derived rather than looked up, so a kind the coach invented reads as well as a shipped one. There
 * is no table here to fall out of date.
 *
 * @param {string} kind
 * @returns {string}
 */
export function labelForKind(kind) {
  const words = String(kind || '').split('-').filter((part) => part.length > 0);
  if (words.length === 0) return '';
  return words.join(' ');
}

/**
 * A unit as words, or the empty string for `count`, which reads better as nothing at all: "went from
 * 8 to 12" rather than "8 count to 12 count".
 * @param {string|null} unit
 * @returns {string}
 */
export function wordsForUnit(unit) {
  if (typeof unit !== 'string') return '';
  return Object.prototype.hasOwnProperty.call(UNIT_WORDS, unit) ? UNIT_WORDS[unit] : unit;
}

/**
 * @typedef {Object} TrendPoint
 * @property {string|null} at
 * @property {number} value
 * @property {string|null} session_id
 */

/**
 * @typedef {Object} Trend
 * @property {string} kind The record's own kind key, unchanged.
 * @property {string} label The kind as words.
 * @property {string|null} unit The unit every point agrees on, or null when they do not.
 * @property {string} unit_words
 * @property {boolean} known True when this is a kind the app ships knowledge of, false when the
 *   coach invented it. Both are charted; only the labelling differs.
 * @property {boolean} mixed_units True when the same kind was recorded in more than one unit. The
 *   points are still shown; the movement between them is not, because there is none to compute.
 * @property {TrendPoint[]} points Ascending in time.
 * @property {number} point_count
 * @property {TrendPoint|null} first Where the series starts.
 * @property {TrendPoint|null} latest Where it stands now. NOT a peak, and not a crowned value of any
 *   kind — see the file header.
 * @property {number|null} change `latest - first`, or null when there is one point or mixed units.
 * @property {'up'|'down'|'steady'|null} direction Movement, never judgement.
 */

/**
 * Every reading kind this client has, as a trend each.
 *
 * @param {Array<{kind: string, value: number, unit: string|null, at: string|null,
 *   session_id: string|null}>} readings Narrowed readings — this client's own, already in time order.
 * @returns {Trend[]}
 */
export function projectTrends(readings) {
  const rows = Array.isArray(readings) ? readings : [];
  const known = knownReadingKinds();

  return readingKindsIn(rows).map((kind) => {
    const points = rows
      .filter((reading) => reading.kind === kind)
      .map((reading) => ({
        at: reading.at ?? null,
        value: reading.value,
        session_id: reading.session_id ?? null,
      }));

    const units = [];
    for (const reading of rows) {
      if (reading.kind !== kind) continue;
      const unit = reading.unit ?? null;
      if (!units.includes(unit)) units.push(unit);
    }
    const mixedUnits = units.length > 1;
    const unit = mixedUnits ? null : (units[0] ?? null);

    const first = points[0] ?? null;
    const latest = points.length > 0 ? points[points.length - 1] : null;
    const comparable = !mixedUnits && points.length > 1 && first !== null && latest !== null;
    const change = comparable ? latest.value - first.value : null;

    return {
      kind,
      label: labelForKind(kind),
      unit,
      unit_words: wordsForUnit(unit),
      known: known.includes(kind),
      mixed_units: mixedUnits,
      points,
      point_count: points.length,
      first,
      latest,
      change,
      direction: change === null ? null : directionOf(change),
    };
  });
}

/**
 * Which way the series moved. Three words, none of them a verdict.
 * @param {number} change
 * @returns {'up'|'down'|'steady'}
 */
function directionOf(change) {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'steady';
}

/**
 * A number as a client reads it: whole numbers plain, fractions to one place, and never a long tail
 * of floating-point noise in a sentence somebody is meant to trust.
 * @param {number} value
 * @returns {string}
 */
export function readValue(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

/**
 * The model's unit vocabulary, re-exported so a test can hold {@link UNIT_WORDS} against it without
 * a second import path existing for the same list.
 * @type {readonly string[]}
 */
export const MODEL_READING_UNITS = READING_UNITS;

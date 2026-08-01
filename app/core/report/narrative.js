/**
 * THE PLAIN-LANGUAGE SUMMARY — the words a client actually reads.
 *
 * The third of the three things the report says, and the one that decides whether the other two read
 * like a report or like a spreadsheet with a title. Everything here is derived from the two
 * projections beside it; nothing here reaches for a record, a clock or a store.
 *
 * ## The words live in code because they are ASSERTED
 *
 * This mirrors the split already proven in `src/screens/admin-report.ts`: the sentences are derived
 * where they can be tested, and the drawing is drawing and nothing else. Copy that lives inside a
 * renderer cannot be held to a rule, and the rules this copy is held to are not stylistic.
 *
 * ## THE VOICE IS SINGULAR, and that is the privacy rule wearing its language
 *
 * A session in this application can carry several clients. This report is one person's, so it speaks
 * to one person: "you", never "you both", "the group", "everyone", "together", "the others". The
 * plural is not a tone problem — a sentence that says "you all held the plank well" has told a
 * client that somebody else was in the room, which is precisely the disclosure the report exists to
 * prevent. {@link COMPANY_WORDS} is that rule as data, and the privacy suite reads the rendered
 * sentences for every one of them.
 *
 * The stronger half of the defence is upstream: `participation.js` never carries the roster, the
 * session-wide summary or the routine name into this building, so there is no other client's name
 * available to a sentence even if one wanted it. This list guards the wording; the boundary guards
 * the facts.
 *
 * ## What the sentences never say
 *
 * No repetition counts, no loads, no personal bests, no ranking, no clinical language, and no praise
 * or reproach. A number that appears here is a reading the coach took, a count of sessions, or a
 * span of days. The app is in a supporting role: it reports what happened and does not grade it.
 *
 * No emoji anywhere.
 *
 * Pure. No clock, no store, no browser.
 */

import { readValue, wordsForUnit } from './trends.js';

/**
 * Words that must never appear in a client's report, because each of them implies somebody else was
 * there. Held as data so the privacy suite can read the rendered sentences for all of them at once,
 * rather than a reviewer reading the copy and hoping.
 * @type {readonly string[]}
 */
export const COMPANY_WORDS = Object.freeze([
  'other client', 'other clients', 'others', 'another client',
  'the group', 'the class', 'the pair', 'the room',
  'everyone', 'everybody', 'each of you', 'both of you', 'you both', 'you all',
  'together', 'alongside', 'partner', 'partners',
  'attendee', 'attendees', 'participant', 'participants',
  'shared session', 'shared sessions', 'group session', 'group sessions',
]);

/** Month names, for reading an instant back as words without resolving it through a calendar. */
const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

/** How many movements a sentence names before it stops being a sentence and becomes a list. */
export const MOVEMENTS_NAMED = 3;

/**
 * @typedef {Object} Narrative
 * @property {string} headline
 * @property {string[]} paragraphs In reading order. Each is one or more whole sentences.
 * @property {string[]} sentences Every sentence separately, for a caller that lays them out itself.
 * @property {boolean} is_empty True when there is nothing recorded to summarise.
 */

/**
 * The summary, in words.
 *
 * @param {{client_name?: string|null,
 *   attendance: import('./attendance.js').Attendance,
 *   focus: import('./focus.js').Focus,
 *   trends: import('./trends.js').Trend[]}} parts
 * @returns {Narrative}
 */
export function projectNarrative(parts) {
  const { client_name: clientName = null, attendance, focus, trends } = parts;
  const headline = clientName ? `Progress report for ${clientName}` : 'Progress report';

  // A client with a session on the books has something to be told, so "nothing yet" is reserved for
  // a client with genuinely nothing — not for one whose first session has not run.
  const empty = attendance.attended === 0 && attendance.upcoming === 0
    && focus.movement_count === 0 && trends.length === 0;
  if (empty) {
    const nothing = 'There is nothing recorded yet, so there is nothing to show in this report.';
    return { headline, paragraphs: [nothing], sentences: [nothing], is_empty: true };
  }

  const paragraphs = [
    sentencesOf([periodSentence(attendance), attendedSentence(attendance), cutShortSentence(attendance)]),
    sentencesOf([cadenceSentence(attendance)]),
    sentencesOf([familiesSentence(focus), movementsSentence(focus)]),
    sentencesOf(trends.map(trendSentence)),
  ].filter((paragraph) => paragraph.length > 0);

  return {
    headline,
    paragraphs,
    sentences: paragraphs.flatMap(splitSentences),
    is_empty: false,
  };
}

/**
 * When the report's history begins and ends. Stated from the data's own instants, so the report
 * reads the same next month as it did the day it was made.
 * @param {import('./attendance.js').Attendance} attendance
 * @returns {string}
 */
function periodSentence(attendance) {
  if (!attendance.first_at) return '';
  if (!attendance.latest_at || attendance.first_at === attendance.latest_at) {
    return `This report covers ${readDate(attendance.first_at)}.`;
  }
  return `This report covers ${readRange(attendance.first_at, attendance.latest_at)}.`;
}

/**
 * @param {import('./attendance.js').Attendance} attendance
 * @returns {string}
 */
function attendedSentence(attendance) {
  if (attendance.attended === 0) {
    return attendance.upcoming > 0
      ? 'You have sessions booked, and none has run yet.'
      : '';
  }
  const sessions = attendance.attended === 1 ? '1 session' : `${attendance.attended} sessions`;
  if (attendance.span_days && attendance.span_days > 0) {
    return `You trained ${sessions} over ${readDays(attendance.span_days)}.`;
  }
  return `You trained ${sessions}.`;
}

/**
 * Interrupted sessions are named as what they are. An interrupted session is still a session that
 * happened, and quietly rounding it up would make the record disagree with what the client remembers.
 * @param {import('./attendance.js').Attendance} attendance
 * @returns {string}
 */
function cutShortSentence(attendance) {
  if (attendance.cut_short === 0) return '';
  const which = attendance.cut_short === 1 ? 'One of them was' : `${attendance.cut_short} of them were`;
  return `${which} cut short and recorded as far as it got.`;
}

/**
 * @param {import('./attendance.js').Attendance} attendance
 * @returns {string}
 */
function cadenceSentence(attendance) {
  if (attendance.cadence === 'too_early_to_say') {
    return attendance.attended > 0
      ? 'There are not enough sessions yet to describe a pattern.'
      : '';
  }
  const typical = readDays(attendance.typical_days_between ?? 0);
  if (attendance.cadence === 'steady') {
    return `Your sessions came round steadily, about ${typical} apart.`;
  }
  return `Your sessions were spread unevenly: usually about ${typical} apart, `
    + `with a longest break of ${readDays(attendance.longest_gap_days ?? 0)}.`;
}

/**
 * @param {import('./focus.js').Focus} focus
 * @returns {string}
 */
function familiesSentence(focus) {
  const families = focus.families.map((entry) => entry.family);
  if (families.length === 0) return '';
  return `You worked on ${readList(families)}.`;
}

/**
 * The movements NAMED, in the order they came up — never the number of times.
 * @param {import('./focus.js').Focus} focus
 * @returns {string}
 */
function movementsSentence(focus) {
  const named = focus.movements.slice(0, MOVEMENTS_NAMED).map((movement) => movement.name);
  if (named.length === 0) return '';
  if (named.length === 1) return `The movement that came up most was ${named[0]}.`;
  return `The movements that came up most often were ${readList(named)}.`;
}

/**
 * One trend, as the sentence a client understands.
 *
 * Movement, stated. Not a verdict: whether a number going down is progress depends on the person and
 * the reading, and that judgement belongs to the coach.
 *
 * @param {import('./trends.js').Trend} trend
 * @returns {string}
 */
function trendSentence(trend) {
  const unit = trend.unit_words ? ` ${trend.unit_words}` : '';

  if (trend.mixed_units) {
    return `Your ${trend.label} was recorded in more than one unit, so it is charted without a comparison.`;
  }
  if (trend.point_count === 0 || trend.first === null || trend.latest === null) return '';
  if (trend.point_count === 1) {
    return `Your ${trend.label} was measured once, at ${readValue(trend.first.value)}${unit}.`;
  }
  if (trend.direction === 'steady') {
    return `Your ${trend.label} has stayed at ${readValue(trend.latest.value)}${unit} `
      + `across ${trend.point_count} measurements.`;
  }
  return `Your ${trend.label} went from ${readValue(trend.first.value)} `
    + `to ${readValue(trend.latest.value)}${unit}.`;
}

/**
 * An instant as words: `2026-07-24T09:00:00.000Z` reads "24 July 2026".
 *
 * Sliced from the instant rather than resolved through a calendar — the date is already stated in
 * the value, and re-deriving it is how a report ends up disagreeing with the record it came from.
 *
 * @param {string} instant
 * @returns {string}
 */
export function readDate(instant) {
  const text = String(instant || '');
  const year = text.slice(0, 4);
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (year.length !== 4 || !Number.isFinite(month) || !Number.isFinite(day)) return text;
  const name = MONTHS[month - 1];
  if (!name || day < 1) return text;
  return `${day} ${name} ${year}`;
}

/**
 * Two dates as one readable span, dropping the first year when both fall in the same one.
 * @param {string} from @param {string} to
 * @returns {string}
 */
export function readRange(from, to) {
  const start = readDate(from);
  const end = readDate(to);
  if (String(from).slice(0, 4) === String(to).slice(0, 4)) {
    const withoutYear = start.split(' ').slice(0, 2).join(' ');
    return `${withoutYear} to ${end}`;
  }
  return `${start} to ${end}`;
}

/**
 * A number of days as words, rising to weeks and months where a person would say so — "about 7 days"
 * is how a gym gap is spoken, "about 91 days" is not.
 * @param {number} days
 * @returns {string}
 */
export function readDays(days) {
  const whole = Math.round(Number(days) || 0);
  if (whole <= 1) return whole === 1 ? '1 day' : '0 days';
  if (whole < 14) return `${whole} days`;
  if (whole < 60) return `${Math.round(whole / 7)} weeks`;
  return `${Math.round(whole / 30)} months`;
}

/**
 * A list as a person writes one: "a, b and c".
 * @param {string[]} items
 * @returns {string}
 */
export function readList(items) {
  const rows = items.filter((item) => typeof item === 'string' && item.length > 0);
  if (rows.length === 0) return '';
  if (rows.length === 1) return rows[0];
  return `${rows.slice(0, -1).join(', ')} and ${rows[rows.length - 1]}`;
}

/**
 * Whole sentences into one paragraph, dropping the ones that had nothing to say.
 * @param {string[]} sentences
 * @returns {string}
 */
function sentencesOf(sentences) {
  return sentences.filter((sentence) => typeof sentence === 'string' && sentence.length > 0).join(' ');
}

/**
 * A paragraph back into its sentences, by the full stop and the space that follow one. Text-based
 * rather than pattern-matched: this application's shipped source carries no regular expressions.
 * @param {string} paragraph
 * @returns {string[]}
 */
function splitSentences(paragraph) {
  const sentences = [];
  let current = '';
  for (let index = 0; index < paragraph.length; index += 1) {
    current += paragraph[index];
    if (paragraph[index] === '.' && paragraph[index + 1] === ' ') {
      sentences.push(current.trim());
      current = '';
      index += 1;
    }
  }
  if (current.trim().length > 0) sentences.push(current.trim());
  return sentences;
}

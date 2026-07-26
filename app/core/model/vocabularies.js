/**
 * The closed vocabularies the record model validates against.
 *
 * Two sources feed this file and they are kept visibly separate:
 *
 *  - §CONTENT — copied from the seed content contract at `seed/SCHEMA.md`, which owns the
 *    shape of an exercise, a routine and an intensity pattern. If one of these lists ever
 *    disagrees with that document, the document wins and this file is the defect. The
 *    contract is EXTENDED there first; it is never diverged from here.
 *  - §APP — vocabularies for records the contract deliberately does not cover, because they
 *    are authored in the app rather than shipped: clients, sessions, performed records,
 *    readings, in-session notes and diet plans.
 *
 * Every list is frozen. A vocabulary the coach can extend at runtime (reading kinds) says
 * so explicitly and is validated as "known kind, or a well-formed custom key".
 */

// ---------------------------------------------------------------------------
// §CONTENT — mirrors seed/SCHEMA.md
// ---------------------------------------------------------------------------

/** Exercise `movement_pattern` — seed contract §4.1. @type {readonly string[]} */
export const MOVEMENT_PATTERNS = Object.freeze([
  'squat', 'hinge', 'lunge', 'single-leg',
  'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull',
  'elbow-flexion', 'elbow-extension', 'shoulder-raise', 'carry',
  'rotation', 'anti-extension', 'anti-rotation', 'anti-lateral-flexion',
  'hip-extension', 'knee-flexion', 'calf-raise', 'locomotion',
  'jump', 'isometric-hold', 'conditioning', 'mobility',
  'olympic-derivative',
]);

/**
 * Muscle groups for `primary_muscles` / `secondary_muscles` — seed contract §4.2.
 * `full-body` and `cardiovascular-system` are deliberate pseudo-groups for conditioning
 * and whole-body work, where naming individual muscles would mislead.
 * @type {readonly string[]}
 */
export const MUSCLE_GROUPS = Object.freeze([
  'chest', 'front-deltoids', 'side-deltoids', 'rear-deltoids',
  'upper-back', 'lats', 'traps', 'lower-back',
  'spinal-erectors', 'biceps', 'triceps', 'forearms',
  'grip', 'abdominals', 'obliques', 'hip-flexors',
  'glutes', 'quadriceps', 'hamstrings', 'adductors',
  'abductors', 'calves', 'tibialis', 'neck',
  'full-body', 'cardiovascular-system',
]);

/**
 * Equipment — seed contract §4.3. `none` means bodyweight only and is a real value used by
 * a meaningful proportion of the library, not a placeholder.
 * @type {readonly string[]}
 */
export const EQUIPMENT = Object.freeze([
  'none', 'mat', 'bench', 'box',
  'step', 'chair', 'wall', 'dumbbell',
  'barbell', 'weight-plate', 'kettlebell', 'resistance-band',
  'pull-up-bar', 'dip-bars', 'gymnastic-rings', 'suspension-trainer',
  'cable-machine', 'medicine-ball', 'slam-ball', 'sandbag',
  'jump-rope', 'battle-rope', 'sled', 'agility-cone',
  'ab-wheel', 'foam-roller', 'treadmill', 'stationary-bike',
  'rowing-machine',
]);

/** How the session runner counts an exercise — seed contract §4. @type {readonly string[]} */
export const MEASUREMENTS = Object.freeze(['repetitions', 'time']);

/** The three intensity points the adapter sorts and scales on. @type {readonly string[]} */
export const INTENSITY_LEVELS = Object.freeze(['low', 'medium', 'high']);

/**
 * Where a record came from, and whether the coach has since changed it — seed contract §4.6.
 * Three states rather than a boolean so that "ours, and he has edited it" can be expressed;
 * the admin reset reads this to decide what it may revert and what it must leave alone.
 * @type {readonly string[]}
 */
export const PROVENANCE = Object.freeze(['shipped-untouched', 'shipped-edited', 'coach-created']);

/** Provenance value every record in a shipped seed FILE must carry — seed contract R12. */
export const SEED_PROVENANCE = 'shipped-untouched';

/** Routine `focus` — seed contract §5.1. @type {readonly string[]} */
export const ROUTINE_FOCUS = Object.freeze([
  'push', 'pull', 'chest-and-shoulders', 'legs', 'hiit', 'functional',
  'core-and-conditioning', 'full-body', 'upper-body', 'lower-body', 'active-recovery',
]);

/** Routine `body_regions` — seed contract §5.2. @type {readonly string[]} */
export const BODY_REGIONS = Object.freeze([
  'upper-body', 'lower-body', 'core', 'posterior-chain', 'anterior-chain', 'full-body',
]);

/** Intensity pattern `mapping_rule` — seed contract §6.1. @type {readonly string[]} */
export const MAPPING_RULES = Object.freeze(['stretch', 'repeat-cycle', 'hold-last']);

// ---------------------------------------------------------------------------
// §APP — records the content contract deliberately does not cover
// ---------------------------------------------------------------------------

/**
 * Every record kind the local store holds. The envelope's `type` is one of these, and the
 * validator registry is keyed by them.
 * @type {readonly string[]}
 */
export const RECORD_TYPES = Object.freeze([
  // library content, imported from the seed and thereafter editable by the coach
  'exercise', 'routine', 'intensity-pattern',
  // authored in the app
  'client', 'session', 'performed-record', 'reading', 'session-note', 'diet-plan',
]);

/**
 * Library kinds — the ones whose shape the seed content contract owns, the ones the admin
 * reset restores, and the ones on which a load or weight field is forbidden outright.
 * @type {readonly string[]}
 */
export const LIBRARY_TYPES = Object.freeze(['exercise', 'routine', 'intensity-pattern']);

/**
 * Session lifecycle.
 *
 * `interrupted` is a first-class state, not an error: real sessions are disturbed by power
 * cuts, illness, phone calls and the browser closing. An interrupted session resumes exactly
 * where it left off, and a half-finished one is still a saved partial record rather than
 * something lost or discarded.
 * @type {readonly string[]}
 */
export const SESSION_STATUSES = Object.freeze([
  'planned', 'in_progress', 'interrupted', 'completed', 'abandoned',
]);

/** Session statuses that require `started_at` to be set. @type {readonly string[]} */
export const STARTED_SESSION_STATUSES = Object.freeze([
  'in_progress', 'interrupted', 'completed', 'abandoned',
]);

/** Session statuses that require `ended_at` to be set. @type {readonly string[]} */
export const ENDED_SESSION_STATUSES = Object.freeze(['completed', 'abandoned']);

/**
 * Whether a session is run on a call or in a room.
 *
 * This is RECORDED rather than derived from the absence of a joining link, and the difference
 * matters. A session planned online before its link is minted carries no link either, so
 * reading "no link means in person" would make the two indistinguishable — and the requirement
 * is that in person creates no calendar event and no meeting link AT ALL. The mark is a choice
 * the coach makes at the moment he starts, and a choice made is a fact to record.
 *
 * There is deliberately no third value. He runs a session on a call or in a room; `hybrid`
 * would be a value nobody sets and a branch nobody tests.
 * @type {readonly string[]}
 */
export const SESSION_MODES = Object.freeze(['online', 'in_person']);

/**
 * Where a session's Meet link came from. Both paths are supported deliberately: minting via
 * the calendar can fail at the moment a session starts, and a pasted link costs nothing and
 * covers a call that is already running.
 * @type {readonly string[]}
 */
export const MEET_SOURCES = Object.freeze(['minted', 'pasted']);

/**
 * What happened to one exercise, for one client, in one session.
 *
 * `substituted` exists because the coach swaps an exercise mid-session when a client is
 * tired — that is a recorded fact about the session, not a defect.
 * @type {readonly string[]}
 */
export const PERFORMED_STATUSES = Object.freeze([
  'performed', 'partial', 'skipped', 'substituted',
]);

/** Units a reading may be expressed in. @type {readonly string[]} */
export const READING_UNITS = Object.freeze(['bpm', 'seconds', 'repetitions', 'count']);

/**
 * Reading kinds the app knows about, each pinned to the unit it is measured in, so a plank
 * recorded in beats per minute is caught rather than charted.
 *
 * This vocabulary is OPEN: the coach may record a kind of his own. A custom kind must be a
 * well-formed content key and must name its unit explicitly, because the app has no pinned
 * unit to fall back on.
 * @type {Readonly<Record<string, string>>}
 */
export const READING_KINDS = Object.freeze({
  'heart-rate': 'bpm',
  'resting-heart-rate': 'bpm',
  'plank-hold': 'seconds',
  'hollow-hold': 'seconds',
  'wall-sit': 'seconds',
  'dead-hang': 'seconds',
});

/** When a reading was taken relative to the session. @type {readonly string[]} */
export const READING_CONTEXTS = Object.freeze(['in_session', 'post_session', 'standalone']);

/**
 * Diet plan lifecycle. The coach needs to see the plan a client follows NOW against the ones
 * they followed before, so `current` and `past` are recorded rather than inferred from dates.
 * @type {readonly string[]}
 */
export const DIET_PLAN_STATUSES = Object.freeze(['draft', 'current', 'past']);

// ---------------------------------------------------------------------------
// Refusals — fields that must never exist, and why
// ---------------------------------------------------------------------------

/**
 * Fields the client record must never carry.
 *
 * The app deliberately collects a name, general notes, a non-clinical adaptation flag and an
 * encrypted pointer to where the real detail lives — and nothing else. Data that is never
 * collected cannot leak, and that is the strongest protection available to an application
 * with no backend, served from a public static site, storing to a personal Drive.
 *
 * Matching is by normalised key substring, so `emailAddress`, `email_address` and `e-mail`
 * are all refused. A refusal here is reported as MINIMISATION rather than as an unknown
 * field, so it reads as the decision it is.
 * @type {readonly string[]}
 */
export const MINIMISED_FIELD_TOKENS = Object.freeze([
  'email', 'mail', 'phone', 'mobile', 'telephone', 'whatsapp', 'contact',
  'address', 'postcode', 'zipcode', 'city', 'country',
  'dob', 'dateofbirth', 'birthdate', 'birthday', 'age',
  'photo', 'picture', 'image', 'avatar', 'selfie',
  'gender', 'nationality', 'passport', 'aadhaar', 'ssn',
]);

/**
 * Fields forbidden on a LIBRARY record — exercise, routine, routine entry, intensity pattern.
 *
 * Prescribing a weight would put the application in the position of making a training-load
 * judgement. That judgement belongs to the certified coach, who is also adapting to a
 * client's history, and load is inherently per-client: a shipped library carrying weights
 * would be prescribing numbers for people it has never seen.
 *
 * Load is NOT banned everywhere. It is a legitimate per-client, in-session OBSERVATION and
 * lives on the performed record — see `entities/performed-record.js`.
 * @type {readonly string[]}
 */
export const FORBIDDEN_LOAD_TOKENS = Object.freeze([
  'load', 'weight', 'resistance', 'kilogram', 'kilo', 'pound', 'poundage',
  'onerepmax', 'onerm', 'rm', 'percentof1rm', 'intensitykg',
]);

/**
 * Envelope concerns that must never appear inside a CONTENT record.
 *
 * The test, taken verbatim from the seed content contract: if a field would still exist in a
 * single-device application with no synchronisation and no encryption, it is content. If it
 * exists only because there are two devices, a history, or a secret, it is envelope.
 *
 * `provenance` is deliberately NOT in this list. It exists so the admin reset can tell
 * shipped content from the coach's own additions — a single-device concern that would exist
 * with no sync and no encryption at all.
 * @type {readonly string[]}
 */
export const ENVELOPE_FIELD_TOKENS = Object.freeze([
  'recordid', 'rev', 'revision', 'deviceid', 'devicetag', 'device',
  'tombstone', 'deleted', 'deletedat',
  'createdat', 'updatedat', 'modifiedat', 'syncedat', 'lastsync',
  'resolvedfrom',
  'encrypted', 'ciphertext', 'iv', 'keyid',
]);

/**
 * Normalise a key for token matching: lowercase, strip everything that is not a letter or a
 * digit. `e-mail`, `E_Mail` and `eMail` all normalise to `email`.
 * @param {string} key
 * @returns {string}
 */
export function normaliseKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The first token in `tokens` that `key` matches, or null.
 *
 * Short tokens (three characters or fewer) must match the whole normalised key rather than a
 * substring of it, so `rm` does not fire on `warmup` and `rev` does not fire on `reverse`.
 * @param {string} key
 * @param {readonly string[]} tokens
 * @returns {string|null}
 */
export function matchToken(key, tokens) {
  const k = normaliseKey(key);
  for (const token of tokens) {
    if (token.length <= 3 ? k === token : k.includes(token)) return token;
  }
  return null;
}

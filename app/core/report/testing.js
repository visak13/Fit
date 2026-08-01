/**
 * TEST MATERIAL for the report suites — one client's history, and a GENUINELY SHARED session inside
 * it.
 *
 * The shared session is the point of this file. A session in this application carries one to many
 * clients, so the interesting case is not a solo history that happens to be clean: it is a session
 * where somebody else really was there, whose roster really does name them, whose session-wide
 * summary really does mention them by name, and whose own records really are sitting in the same
 * arrays the caller hands over. A privacy test written against a fixture with nobody else in it
 * proves nothing at all.
 *
 * The co-attendee's name is deliberately unmistakable. A leak of "Test Client B" into a report full
 * of test clients is easy to read past; a leak of "Bergamot Whitfield" is not.
 *
 * NO REAL PERSON APPEARS HERE. The repository is public by an explicit decision.
 *
 * This file holds no assertions and nothing in the application imports it.
 */

/** The client every report in these suites belongs to. */
export const HER = Object.freeze({
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Marlow Ainsworth',
});

/**
 * THE OTHER CLIENT — on one shared session, and mentioned by name in that session's own summary and
 * in the routine the coach named after the two of them. Everything about this person is a leak if it
 * reaches the report.
 */
export const THE_OTHER_CLIENT = Object.freeze({
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Bergamot Whitfield',
  routine_id: 'bergamot-and-marlow-shoulder-day',
  session_summary: 'Bergamot Whitfield and Marlow both on the shoulder circuit; his knee needed a rest.',
  exercise_id: 'sled-push',
  note: 'Bergamot took the lighter sled today.',
});

/** Fixed instants, so a fixture is byte-identical on every run. */
export const WHEN = Object.freeze({
  one: '2026-03-02T09:00:00.000Z',
  two: '2026-03-16T09:00:00.000Z',
  three: '2026-03-30T09:00:00.000Z',
  shared: '2026-04-13T09:00:00.000Z',
  ahead: '2026-04-27T09:00:00.000Z',
});

/** The sessions the fixture history holds, by the name the tests call them. */
export const SESSIONS = Object.freeze({
  one: 'aaaaaaa1-0000-4000-8000-000000000001',
  two: 'aaaaaaa1-0000-4000-8000-000000000002',
  three: 'aaaaaaa1-0000-4000-8000-000000000003',
  shared: 'aaaaaaa1-0000-4000-8000-000000000004',
  ahead: 'aaaaaaa1-0000-4000-8000-000000000005',
});

/** The exercises the fixture library holds. `sled-push` is the other client's, and only theirs. */
export const MOVEMENTS = Object.freeze({
  push: 'push-up',
  plank: 'plank',
  row: 'dumbbell-row',
  sled: THE_OTHER_CLIENT.exercise_id,
  gone: 'wall-sit',
});

/**
 * A stored envelope, as the store hands records over.
 * @param {string} recordId @param {Record<string, any>} content @param {boolean} [deleted]
 */
export const stored = (recordId, content, deleted = false) => ({
  record_id: recordId,
  deleted,
  content,
});

/** @param {Record<string, any>} [over] */
export const aClientRecord = (over = {}) => stored(HER.id, {
  name: HER.name,
  notes: '',
  active: true,
  ...over,
});

/**
 * The client record as the coach really keeps it — with the reminder he wrote for himself and the
 * sealed pointer to where the real detail lives. None of it may reach the report.
 */
export const aClientRecordWithEverythingOnIt = () => aClientRecord({
  notes: 'Prefers early sessions. Training for a hike in September.',
  adaptation_flag: 'Shoulder — see my own notes',
  clinical_reference_label: 'Folder 12',
  clinical_reference: { scheme: 1, iv: 'MTIzNDU2Nzg5MDEy', ct: 'Y2lwaGVydGV4dA==' },
});

/** The exercise library, for movement names. `wall-sit` is deliberately absent from it. */
export const aLibrary = () => [
  stored('lib-1', {
    id: MOVEMENTS.push, name: 'Push Up', movement_pattern: 'horizontal-push',
  }),
  stored('lib-2', {
    id: MOVEMENTS.plank, name: 'Plank', movement_pattern: 'anti-extension',
  }),
  stored('lib-3', {
    id: MOVEMENTS.row, name: 'Dumbbell Row', movement_pattern: 'horizontal-pull',
  }),
  stored('lib-4', {
    id: MOVEMENTS.sled, name: 'Sled Push', movement_pattern: 'conditioning',
  }),
];

/**
 * @param {string} recordId @param {string} at @param {Record<string, any>} [over]
 */
const aSessionRecord = (recordId, at, over = {}) => stored(recordId, {
  routine_id: 'test-full-body',
  client_ids: [HER.id],
  status: 'completed',
  mode: 'online',
  started_at: at,
  ended_at: at,
  meet_url: 'https://meet.example.test/abc-defg-hij',
  meet_source: 'minted',
  ...over,
});

/**
 * THE SESSIONS, including the shared one.
 *
 * The shared session is the fourth. Its roster names both clients, its summary names the other one
 * twice, and the coach named its routine after the pair — three separate carriers of the same
 * disclosure, which is why the boundary is an allowlist rather than a list of things to strip.
 */
export const theSessions = () => [
  aSessionRecord(SESSIONS.one, WHEN.one),
  aSessionRecord(SESSIONS.two, WHEN.two, { status: 'interrupted', ended_at: WHEN.two }),
  aSessionRecord(SESSIONS.three, WHEN.three),
  aSessionRecord(SESSIONS.shared, WHEN.shared, {
    routine_id: THE_OTHER_CLIENT.routine_id,
    client_ids: [HER.id, THE_OTHER_CLIENT.id],
    summary: THE_OTHER_CLIENT.session_summary,
  }),
  aSessionRecord(SESSIONS.ahead, WHEN.ahead, {
    status: 'planned', started_at: undefined, ended_at: undefined,
    scheduled_at: WHEN.ahead, meet_url: undefined, meet_source: undefined,
  }),
];

/**
 * @param {string} recordId @param {string} sessionId @param {string} at
 * @param {Record<string, any>} over
 */
const aPerformed = (recordId, sessionId, at, over = {}) => stored(recordId, {
  session_id: sessionId,
  client_id: HER.id,
  exercise_id: MOVEMENTS.push,
  position: 0,
  status: 'performed',
  sets_completed: 3,
  repetitions: 12,
  observed_load: '20kg',
  recorded_at: at,
  ...over,
});

/**
 * What she did — including, in the shared session, alongside records belonging to the other client
 * which the narrowing has to refuse.
 */
export const thePerformed = () => [
  aPerformed('p-1', SESSIONS.one, WHEN.one),
  aPerformed('p-2', SESSIONS.one, WHEN.one, {
    exercise_id: MOVEMENTS.plank, position: 1, status: 'performed',
    sets_completed: 3, repetitions: undefined, duration_seconds: 40,
  }),
  aPerformed('p-3', SESSIONS.two, WHEN.two, { exercise_id: MOVEMENTS.row, position: 1 }),
  aPerformed('p-4', SESSIONS.two, WHEN.two, {
    exercise_id: MOVEMENTS.gone, position: 2, status: 'skipped',
    sets_completed: undefined, repetitions: undefined, observed_load: undefined,
  }),
  aPerformed('p-5', SESSIONS.three, WHEN.three),
  aPerformed('p-6', SESSIONS.three, WHEN.three, { exercise_id: MOVEMENTS.plank, position: 1 }),
  aPerformed('p-7', SESSIONS.shared, WHEN.shared, { exercise_id: MOVEMENTS.row }),
  // THE OTHER CLIENT'S OWN WORK, in the same array the caller hands over.
  aPerformed('p-8', SESSIONS.shared, WHEN.shared, {
    client_id: THE_OTHER_CLIENT.id, exercise_id: MOVEMENTS.sled, position: 0,
  }),
];

/**
 * @param {string} recordId @param {string} sessionId @param {string} kind @param {number} value
 * @param {string} unit @param {string} at @param {Record<string, any>} [over]
 */
const aReadingRecord = (recordId, sessionId, kind, value, unit, at, over = {}) => stored(recordId, {
  client_id: HER.id,
  session_id: sessionId,
  kind,
  value,
  unit,
  context: 'in_session',
  taken_at: at,
  ...over,
});

/**
 * The readings — two kinds the app ships knowledge of, and one the coach invented, so the discovery
 * is proved against a kind no list here could have known about.
 */
export const theReadings = () => [
  aReadingRecord('r-1', SESSIONS.one, 'plank-hold', 40, 'seconds', WHEN.one),
  aReadingRecord('r-2', SESSIONS.two, 'plank-hold', 48, 'seconds', WHEN.two),
  aReadingRecord('r-3', SESSIONS.three, 'plank-hold', 55, 'seconds', WHEN.three),
  aReadingRecord('r-4', SESSIONS.shared, 'plank-hold', 65, 'seconds', WHEN.shared),
  aReadingRecord('r-5', SESSIONS.one, 'resting-heart-rate', 62, 'bpm', WHEN.one),
  aReadingRecord('r-6', SESSIONS.shared, 'resting-heart-rate', 58, 'bpm', WHEN.shared),
  // A kind the coach invented. Nothing in this package knows it exists until it reads this.
  aReadingRecord('r-7', SESSIONS.two, 'farmers-carry-distance', 30, 'count', WHEN.two),
  aReadingRecord('r-8', SESSIONS.three, 'farmers-carry-distance', 42, 'count', WHEN.three),
  // THE OTHER CLIENT'S OWN READING, from the shared session.
  aReadingRecord('r-9', SESSIONS.shared, 'plank-hold', 90, 'seconds', WHEN.shared, {
    client_id: THE_OTHER_CLIENT.id,
  }),
];

/**
 * In-session NOTES, which this package refuses to carry at all. Present in the fixture precisely
 * because a caller that hands them over must still get a report with none of them in it.
 */
export const theNotes = () => [
  stored('n-1', {
    session_id: SESSIONS.shared, client_id: HER.id, taken_at: WHEN.shared,
    text: 'Shoulder felt fine on the second round.',
  }),
  stored('n-2', {
    session_id: SESSIONS.shared, client_id: THE_OTHER_CLIENT.id, taken_at: WHEN.shared,
    text: THE_OTHER_CLIENT.note,
  }),
  stored('n-3', {
    session_id: SESSIONS.shared, taken_at: WHEN.shared,
    text: THE_OTHER_CLIENT.session_summary,
  }),
];

/**
 * The whole input, as a caller would assemble it from the store's per-client queries — plus the
 * other client's records and the notes, because the boundary must hold when a caller is careless.
 *
 * @param {Record<string, any>} [over]
 * @returns {Record<string, any>}
 */
export const aHistory = (over = {}) => ({
  client: aClientRecord(),
  client_id: HER.id,
  sessions: theSessions(),
  performed: thePerformed(),
  readings: theReadings(),
  notes: theNotes(),
  exercises: aLibrary(),
  ...over,
});

/** A client with a record and no history at all — the first-report case. */
export const anEmptyHistory = () => ({
  client: aClientRecord(),
  client_id: HER.id,
  sessions: [],
  performed: [],
  readings: [],
  exercises: aLibrary(),
});

/**
 * THE LEAK, DELIBERATELY REINTRODUCED — the regression the allowlist exists to prevent, written out
 * so a test can prove its own assertions go red on it.
 *
 * This is what `narrowToClient` would produce if somebody "simplified" the session rebuild into a
 * spread: every field of the session record arrives, including the roster, the session-wide summary
 * and the routine the coach named after two people. Nothing here is exotic — it is one line shorter
 * than the code that is shipped, which is exactly why the guard has to be able to see it.
 *
 * @param {string} clientId @param {unknown[]} sessions
 * @returns {Array<Record<string, any>>}
 */
export function narrowSessionsWithTheAllowlistWidened(clientId, sessions) {
  const rows = [];
  for (const record of sessions) {
    const content = record?.content ?? record;
    if (!Array.isArray(content?.client_ids) || !content.client_ids.includes(clientId)) continue;
    rows.push({
      session_id: record?.record_id ?? null,
      at: content.started_at || content.scheduled_at || null,
      attended: content.status !== 'planned',
      // THE DEFECT: the whole record, spread in.
      ...content,
    });
  }
  return rows;
}

/**
 * WHICH KINDS HAVE CALL SITES, AND WHICH DELIBERATELY DO NOT — asserted in BOTH directions.
 *
 * ## The gap this closes
 *
 * The wiring step could have failed two opposite ways, and each looks like success from the other
 * side of it.
 *
 * **Too few.** A kind defined, believed wired, and reached by nothing. The log then answers "did
 * anything else happen?" with silence that is indistinguishable from a quiet device. Nothing fails;
 * the emptiness is the defect, and emptiness does not announce itself.
 *
 * **Too many.** A stub call site invented so a kind looks used — an `export.started` written by
 * nothing that exports anything, added because the vocabulary looked incomplete without it. That is
 * strictly worse than the gap, because the log then asserts activity that never occurred, and the
 * next person to read it has no way to tell which entries meant something.
 *
 * So this file asserts a partition over the whole vocabulary: every kind is either WIRED, with a
 * named owner in the application source, or UNWRITTEN, with a stated reason. A kind in neither list
 * fails the test, which is what stops a kind being added later and quietly belonging to nobody.
 *
 * ## How it looks, and the one thing it deliberately does not do
 *
 * It searches the application source for `JOURNAL_KINDS.NAME` — the constant, not the string. A
 * call site names a kind rather than spelling one, precisely so a typo is a `TypeError` instead of a
 * plausible different kind, and that convention is what makes this scan reliable. It reads no
 * comments out of the way and strips nothing: `kinds.js` is excluded because it is the definition,
 * and the prose in every other file refers to unwritten kinds as plain strings, not as constants.
 *
 * ## THE SCAN WALKS BOTH LAYERS, AND IT DID NOT ALWAYS
 *
 * It used to walk `core/` alone, which was right for exactly as long as `core/` was the only layer
 * that could hold a call site. It is not any more. The core is dependency-free and PROVIDER-NEUTRAL
 * — nothing under it may learn that Google exists — so the step that connects an account necessarily
 * writes `auth.account_connected` from the shell, in `src/platform/google-account.ts`.
 *
 * A core-only scan would therefore have gone on asserting that the authentication domain is written
 * NOWHERE, for ever, while it was being written every day. GREEN, and its own stated claim false,
 * with no detector anywhere — which is the exact shape this file exists to prevent, wearing this
 * file as a disguise. So the scan reads `src/` too, and an owner is named as the path a call site
 * actually lives at, whichever layer that is.
 *
 * THE GENERAL LESSON, worth more than this instance: a cross-layer scan inherits the ROOT it was
 * written against, and a step allowed to satisfy it from a different layer escapes it silently.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';

import { JOURNAL_KINDS, KIND_SPECS } from './kinds.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = dirname(HERE);
/** The shell. A call site may legitimately live here — see the header. */
const SHELL = join(dirname(CORE), 'src');

/** The two layers a call site may live in, and the prefix each one's paths are reported under. */
const LAYERS = Object.freeze([
  { root: CORE, prefix: '' },
  { root: SHELL, prefix: 'src/' },
]);

/** The definition itself. Every name appears here; that is what it is for. */
const DEFINITION = join(HERE, 'kinds.js');

/**
 * Kinds with no call site, and why each one has none.
 *
 * Every entry is a claim that the ABSENCE is correct. A kind may not be parked here to make a
 * failing test pass — the reason has to be true, and a reviewer's job is to check it against the
 * code rather than against this comment.
 */
const UNWRITTEN = Object.freeze({
  // ── owned by a step that does not exist ──────────────────────────────────────────────────────
  UNLOCKED: 'the LOCAL unlock — the screen-lock resume gate — is owned by the step that builds the '
    + 'unlock screen, and that step does not exist. It is a different act from connecting a remote '
    + 'account, which is now built and wired below.',
  UNLOCK_REFUSED: 'as above — there is nothing that can refuse a local unlock yet',
  LOCKED: 'as above — nothing locks the local data again, by hand or by inactivity',
  EXPORT_STARTED: 'exports are owned by the reports and admin step; nothing exports anything yet',
  EXPORT_COMPLETED: 'as above',
  EXPORT_REFUSED: 'as above',

  // ── the one whose absence is about THIS code rather than a missing step ──────────────────────
  KEY_SLOT_REMOVED:
    'nothing withdraws a way into the data key. The one place a slot disappears is adoption '
    + 'replacing THIS device\'s own dead slot as it adds a live one, which is part of adding rather '
    + 'than a withdrawal — recording it as a removal would say a way in was taken away when a dead '
    + 'one was replaced.',
});

/**
 * Kinds that must have a call site, and the file that owns each one.
 *
 * Naming the owner rather than just asserting "somewhere" is the point: it makes a kind moving to a
 * different module a visible change, and it stops a second module quietly starting to write a kind
 * that already belongs to one.
 */
const WIRED = Object.freeze({
  // IN THE SHELL, AND THAT IS NOT A COMPROMISE. The core is provider-neutral by decision: nothing
  // under it may know Google exists. So the act of authorising an account can only be recorded from
  // the layer that knows what an account IS. This is why the scan above walks `src/` as well.
  ACCOUNT_CONNECTED: 'src/platform/google-account.ts',
  ACCOUNT_DISCONNECTED: 'src/platform/google-account.ts',

  RECORD_CREATED: 'store/local-store.js',
  RECORD_UPDATED: 'store/local-store.js',
  RECORD_DELETED: 'store/local-store.js',
  RECORD_IMPORTED: 'store/local-store.js',
  RECORD_PURGED: 'store/purge.js',

  SYNC_STARTED: 'sync/engine.js',
  SYNC_COMPLETED: 'sync/engine.js',
  SYNC_REFUSED: 'sync/engine.js',
  // NOT the engine, and the separation is the point. The engine surfaces a divergence and applies
  // neither side, so it has nothing to attest to; `resolution.js` applies the side the coach picked
  // and is the only thing that ever records it. An engine call site would relabel every routine
  // last-write-wins pull as a collision.
  SYNC_CONFLICT_RESOLVED: 'sync/resolution.js',

  KEY_ESTABLISHED: 'crypto/guard.js',
  KEY_SLOT_ADDED: 'crypto/guard.js',
  RECOVERY_USED: 'crypto/guard.js',
  RECOVERY_REFUSED: 'crypto/guard.js',
  ESTABLISH_REFUSED: 'crypto/guard.js',
  DUPLICATE_ENVELOPE_DETECTED: 'crypto/guard.js',
  DUPLICATE_RECOVERY_DETECTED: 'crypto/guard.js',

  RETENTION_PRUNED: 'journal/durable.js',
});

/**
 * Every application source file in both layers — no tests, no test harnesses.
 *
 * Each is returned with the name it is reported under, so an owner reads as `store/local-store.js`
 * in the core and `src/platform/google-account.ts` in the shell, and the layer a kind is written
 * from is visible at a glance rather than inferred.
 */
function applicationSources() {
  const files = [];
  for (const { root, prefix } of LAYERS) {
    for (const name of readdirSync(root, { recursive: true })) {
      const path = join(root, String(name));
      const posix = String(name).split('\\').join('/');
      if (!posix.endsWith('.js') && !posix.endsWith('.ts') && !posix.endsWith('.tsx')) continue;
      if (posix.includes('.test.')) continue;
      if (posix.includes('/testing/') || posix.endsWith('/testing.js')) continue;
      if (posix.endsWith('/index.js')) continue;
      if (path === DEFINITION) continue;
      files.push({ path, name: prefix + relative(root, path).split('\\').join('/') });
    }
  }
  return files;
}

/** Which files reference `JOURNAL_KINDS.<name>`. */
function callSitesFor(name) {
  const needle = `JOURNAL_KINDS.${name}`;
  const found = [];
  for (const source of applicationSources()) {
    if (readFileSync(source.path, 'utf8').includes(needle)) found.push(source.name);
  }
  return found.sort();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('every kind in the vocabulary is either wired or deliberately unwritten — no third state', () => {
  const accounted = new Set([...Object.keys(WIRED), ...Object.keys(UNWRITTEN)]);
  const names = Object.keys(JOURNAL_KINDS);

  assert.deepEqual(names.filter((n) => !accounted.has(n)), [],
    'a kind belongs to somebody or is stated to belong to nobody yet. A kind in neither list is one '
    + 'that was added and then not thought about, which is how a vocabulary starts meaning less '
    + 'than it says.');
  assert.deepEqual([...accounted].filter((n) => !(n in JOURNAL_KINDS)), [],
    'and nothing is accounted for that no longer exists');
  assert.equal(names.length, Object.keys(KIND_SPECS).length,
    'the constants and the specifications describe the same set');
});

test('every kind claimed to be wired has a call site, in the file that owns it', () => {
  for (const [name, owner] of Object.entries(WIRED)) {
    const sites = callSitesFor(name);
    assert.ok(sites.length > 0,
      `${name} is claimed as wired and NOTHING writes it. This is the failure that cannot announce `
      + 'itself: a log with no such entry in it looks exactly like a device where it never happened.');
    assert.ok(sites.includes(owner),
      `${name} is owned by ${owner} but written in ${sites.join(', ')} instead`);
  }
});

test('every kind claimed to be unwritten really has NO call site — no stubs to look complete', () => {
  for (const name of Object.keys(UNWRITTEN)) {
    assert.deepEqual(callSitesFor(name), [],
      `${name} has acquired a call site. If the step that owns it has genuinely been built, move it `
      + 'into WIRED with its owner. If it was added to make the vocabulary look fully exercised, '
      + 'remove it: a call site that exists only to be counted is worse than an honest gap, because '
      + 'it puts activity in the log that never occurred.');
  }
});

/**
 * Kinds where a SECOND writer would change what the kind means, and why.
 *
 * The test above only checks that the owner is AMONG the writers, which a second module quietly
 * starting to write the kind passes. Most kinds do not need more than that — a documentation example
 * naming `JOURNAL_KINDS.RECORD_UPDATED` is a legitimate second mention and not a second call site.
 * These are the ones where the difference is not cosmetic, so the claim is exclusive and stated
 * rather than assumed of everything.
 */
const SINGLE_WRITER = Object.freeze({
  SYNC_CONFLICT_RESOLVED:
    'written by the ordinary supersede path as well as by the resolution seam, this would relabel '
    + 'every routine last-write-wins pull as a collision, and the log could no longer answer how '
    + "often the coach's two devices genuinely clashed — the one question it is uniquely able to "
    + 'answer. A resolution is an act by a PERSON; only the seam he acts through may attest to one.',
});

test('a kind that would change meaning under a second writer has exactly one', () => {
  for (const name of Object.keys(SINGLE_WRITER)) {
    assert.ok(name in WIRED, `${name} claims a single writer and is not wired at all`);
    assert.deepEqual(callSitesFor(name), [WIRED[name]],
      `${name} is written somewhere other than ${WIRED[name]}. ${SINGLE_WRITER[name]}`);
  }
});

test('the authentication domain is defined in full, and split by what has actually been built', () => {
  const auth = ['UNLOCKED', 'UNLOCK_REFUSED', 'LOCKED', 'ACCOUNT_CONNECTED', 'ACCOUNT_DISCONNECTED'];
  for (const name of auth) {
    assert.ok(name in JOURNAL_KINDS, `${name} must stay DEFINED — that is the whole point of the `
      + 'vocabulary being settled before the steps that write to it exist');
  }

  // The half that is now built. This assertion is the one that would have been impossible to make
  // while the scan walked the core alone, and its absence is what would have let the claim rot.
  for (const name of ['ACCOUNT_CONNECTED', 'ACCOUNT_DISCONNECTED']) {
    assert.deepEqual(callSitesFor(name), ['src/platform/google-account.ts'],
      `${name} is written by the Google integration in the SHELL, because the core may not know a `
      + 'provider exists. A scan that only read the core would report this as unwritten for ever.');
  }

  // The half that is not. A LOCAL unlock is a different act from connecting a remote account, and
  // nothing performs one yet.
  for (const name of ['UNLOCKED', 'UNLOCK_REFUSED', 'LOCKED']) {
    assert.deepEqual(callSitesFor(name), []);
  }
});

test('the export domain is defined in full and written nowhere', () => {
  for (const name of ['EXPORT_STARTED', 'EXPORT_COMPLETED', 'EXPORT_REFUSED']) {
    assert.ok(name in JOURNAL_KINDS, `${name} must stay DEFINED`);
    assert.deepEqual(callSitesFor(name), []);
  }
});

test('the scan can actually find a call site — the guard is not vacuous, in BOTH layers', () => {
  assert.deepEqual(callSitesFor('RECORD_CREATED'), ['store/local-store.js'],
    'if this ever returns nothing, every "no call site" assertion above passes for free and this '
    + 'whole file proves precisely nothing. That is the shape of a gate that reports green while '
    + 'running nothing, which this build has shipped three times.');

  // The core probe alone was what made the old version of this file trustworthy about the core and
  // silently worthless about everything else. One probe per layer, because a scanner can be alive
  // in one root and blind in another, and the blindness looks exactly like an honest absence.
  assert.deepEqual(callSitesFor('ACCOUNT_CONNECTED'), ['src/platform/google-account.ts'],
    'the shell probe. If THIS goes quiet, every unwritten claim above becomes a claim about the '
    + 'core only, while asserting something about the whole application.');

  const sources = applicationSources();
  assert.ok(sources.length > 20, 'and it really is walking the source tree rather than an empty list');
  assert.ok(sources.some((source) => source.name.startsWith('src/')),
    'including the shell, which is where a provider-specific call site has to live');
});

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
 * plausible different kind, and that convention is what makes this scan reliable. `kinds.js` is
 * excluded because it is the definition, and the prose in every other file refers to unwritten kinds
 * as plain strings, not as constants.
 *
 * IT STRIPS EXACTLY ONE THING, AND THAT IS NEW. A kind named as a COMPUTED KEY is a table saying what
 * the kind means, not an entry being written — see {@link referencesAsValue} for the whole argument
 * and for why this is a discriminator rather than an exemption.
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
 *
 * ## AND AN `UNWRITTEN` REASON IS A DATED CLAIM
 *
 * The second way this file can rot has now happened once, so it is written down rather than left to
 * be met again. Three export kinds sat in {@link UNWRITTEN} on the reason *"exports are owned by the
 * reports and admin step; nothing exports anything yet"*. The reports and admin step then ran, built
 * five export paths and mounted them — and this file went on passing, because it was asserting the
 * absence the OLD world was true about. Nothing failed. The claim simply stopped being true, and the
 * test that exists to catch a kind reached by nothing was the last thing able to notice.
 *
 * **A reason naming a future owner expires the moment that owner arrives**, and the step it names is
 * the one least able to see it, because it is busy being that owner. So a reviewer's job here is
 * unchanged and worth restating: check every reason below against the CODE rather than against this
 * comment — and a step that builds something named in a reason must correct the reason as part of
 * the work, not as paperwork afterwards.
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

  // ALSO IN THE SHELL, AND FOR THE SAME KIND OF REASON. `core/export/` is byte machinery handed a
  // table and a title: it does not know whose data it is, why, or whether the file ever reached
  // anybody, so an entry written from there would fire when bytes were assembled rather than when
  // something was disclosed — an audit trail that records assembly is worse than none, because it
  // looks complete. It is also a LEAF that imports nothing outside itself. The shell layer is where
  // an export becomes a disclosure, and `export-audit.ts` is the one seam every export path runs
  // through. See SINGLE_WRITER below: a second writer here would be the second door.
  EXPORT_STARTED: 'src/screens/export-audit.ts',
  EXPORT_COMPLETED: 'src/screens/export-audit.ts',
  EXPORT_REFUSED: 'src/screens/export-audit.ts',

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

/**
 * NAMING A KIND IS NOT WRITING ONE, AND THIS IS WHERE THAT DISTINCTION LIVES.
 *
 * The scan used to ask whether a file contained `JOURNAL_KINDS.NAME` at all. That was right for as
 * long as the only reason to name a kind was to record one — and the journal READ surface ended it.
 * `src/screens/journal.ts` gives every kind in the vocabulary a plain-English sentence, keyed BY THE
 * CONSTANT rather than by a string literal, because there is exactly one minter of a kind in this
 * repository and a phrase table spelling them out would be a second copy of the vocabulary. Doing the
 * right thing there made this file report a first writer for five kinds that nothing writes.
 *
 * IT WAS NOT FIXED BY LISTING THAT FILE AS A WRITER. Blessing a words-only module as a call site would
 * have retired the discriminator instead of teaching it: every kind it names would then have been
 * accounted for by a mention, and the next module to acquire a REAL first writer would have been
 * indistinguishable from it. The suite exists to catch exactly that, so the scan learned the
 * difference instead.
 *
 * THE DISCRIMINATOR IS THE POSITION THE CONSTANT APPEARS IN, and it partitions the tree cleanly today:
 *
 *  - **A COMPUTED KEY** — `[JOURNAL_KINDS.UNLOCKED]: 'You unlocked...'` — is a table saying what a kind
 *    MEANS. All twenty-six references in `src/screens/journal.ts` are this shape and not one is
 *    anything else.
 *  - **A VALUE** — `kind: JOURNAL_KINDS.UNLOCKED`, or a ternary feeding one — is an entry being
 *    written. Every writer in both layers is this shape, and not one of them uses a computed key.
 *
 * WHY POSITION RATHER THAN "DOES THIS FILE IMPORT THE APPEND PATH". That was the first idea and it is
 * wrong, measurably: `core/crypto/guard.js` owns SEVEN kinds and imports no append function at all —
 * it is handed an injected `journal()` by its caller, because the crypto layer may not reach the
 * store. A scan keyed on the append surface would have declared those seven written by nothing. The
 * lesson generalises past this file: a rule about WHICH MODULE a file imports is a rule about today's
 * dependency graph, and injection is exactly the pattern that breaks it.
 *
 * The scan is deliberately LOOSE in the safe direction. A comparison — `entry.kind ===
 * JOURNAL_KINDS.X` — reads as a value and would be reported as a call site. That is a red a person
 * resolves, and a red is the failure mode this suite is allowed to have; silence is not.
 */
function referencesAsValue(source, name) {
  const needle = `JOURNAL_KINDS.${name}`;
  // Every computed-key occurrence removed, then the question asked of what is left. Doing it this way
  // round means a file that BOTH words a kind and writes it is still correctly a call site.
  return source.split(`[${needle}]`).join('').includes(needle);
}

/** Which files WRITE `JOURNAL_KINDS.<name>`, as opposed to naming it. See {@link referencesAsValue}. */
function callSitesFor(name) {
  const found = [];
  for (const source of applicationSources()) {
    if (referencesAsValue(readFileSync(source.path, 'utf8'), name)) found.push(source.name);
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
  EXPORT_STARTED:
    'five export paths exist — a diet week, a client\'s progress report, the full export, the '
    + 'library backup and the encrypted archive — and each one of them is a place a start could be '
    + 'recorded and its matching end forgotten. They run through ONE seam so that the pairing is '
    + 'structural rather than remembered, and so that "what counts as a completed export" is '
    + 'answered once instead of five times. A second writer is the second door this arrangement '
    + 'exists to prevent.',
  EXPORT_COMPLETED: 'as above — and a completion written anywhere other than the seam would be one '
    + 'nothing paired against a start.',
  EXPORT_REFUSED: 'as above. The refusal is the half a wiring step drops, and it is the half a coach '
    + 'needs later: an export that failed and an export nobody attempted are otherwise the same '
    + 'silence.',

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

/**
 * THE EXPORT DOMAIN, AND THE REASON THIS TEST READS THE WAY IT DOES NOW.
 *
 * It used to assert that all three export kinds were written NOWHERE, on a stated reason: *"exports
 * are owned by the reports and admin step; nothing exports anything yet."* That reason was true when
 * it was written and the step that made it false is the step least able to see it — the exports were
 * built, the cards were mounted, and this file went on passing while claiming the work belonged to
 * somebody's future. **A partition entry is a DATED CLAIM**, and a guard asserting something untrue
 * is worse than no guard: it reports green precisely because it is looking at the old world.
 *
 * So the claim is now the opposite one and it is asserted the same way, in both directions: all
 * three ARE written, from the single seam every export path runs through, and nowhere else.
 */
test('the export domain is defined in full and every kind of it is written, at ONE seam', () => {
  for (const name of ['EXPORT_STARTED', 'EXPORT_COMPLETED', 'EXPORT_REFUSED']) {
    assert.ok(name in JOURNAL_KINDS, `${name} must stay DEFINED`);
    assert.deepEqual(callSitesFor(name), ['src/screens/export-audit.ts'],
      `${name} is the record that data left this application. It is written from the shell because `
      + 'the export core is byte machinery that cannot know a disclosure happened, and from ONE '
      + 'file because five export paths each writing their own would be five chances to record a '
      + 'start with no end.');
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

  // The export seam is its own probe from here on: it is claimed as the owner of three kinds, so a
  // scanner that went blind to `src/screens` would fail the wired assertions above by name rather
  // than quietly reporting an honest-looking absence. Asserting the file is REACHED states that
  // dependency instead of leaving it to be inferred.
  assert.ok(sources.some((source) => source.name === 'src/screens/export-audit.ts'),
    'the export seam must be among the files this scan reads, or its three kinds would be claimed '
    + 'as wired and checked against nothing');
});

/**
 * THE DISCRIMINATOR ITSELF, PROVEN IN BOTH DIRECTIONS, ON SOURCE WRITTEN HERE.
 *
 * A scanner taught to ignore the right thing and a scanner taught to ignore everything produce
 * IDENTICAL SILENCE, and every assertion above that expects an empty list is satisfied by the second
 * one. So {@link referencesAsValue} is asked both questions directly, against the two shapes it exists
 * to tell apart, written out here rather than measured off files that may change:
 *
 *  - the phrase-table shape, which must NOT count, or a words module becomes a writer;
 *  - the injected-journal shape, which MUST count, because it is how `core/crypto/guard.js` writes
 *    seven kinds without importing anything that can reach the store.
 *
 * These do not expire. Every other control in this file is measured against a real file and therefore
 * depends on that file staying the shape it is; these two depend on nothing.
 */
test('the scan tells a kind being WORDED from a kind being WRITTEN, in both directions', () => {
  const worded = "const PHRASING = { [JOURNAL_KINDS.UNLOCKED]: 'You unlocked your information.' };";
  const written = 'await journal({ kind: JOURNAL_KINDS.UNLOCKED, at });';
  const both = `${worded}\n${written}`;

  assert.equal(referencesAsValue(worded, 'UNLOCKED'), false,
    'a phrase table keyed by the constant is read as a call site, so a module that gives a kind a '
    + 'sentence is indistinguishable from one that records it. That is the whole defect this '
    + 'discriminator exists to fix, and it would be back.');

  assert.equal(referencesAsValue(written, 'UNLOCKED'), true,
    'a kind handed over as the value of a write is NOT read as a call site. This is the dangerous '
    + 'direction: every "has no call site" assertion in this file would pass for free, and a kind '
    + 'acquiring its first real writer would be reported as unwritten for ever.');

  assert.equal(referencesAsValue(both, 'UNLOCKED'), true,
    'a file that BOTH words a kind and writes it must still be a call site — stripping the table '
    + 'must not take the write with it');

  // And it is about THIS name rather than about the shape in general: a table keyed by one kind says
  // nothing about another, or the strip would silence a neighbouring write.
  assert.equal(referencesAsValue(`${worded}\nawait journal({ kind: JOURNAL_KINDS.LOCKED });`, 'LOCKED'),
    true, 'stripping one kind\'s table entry silenced a different kind\'s write');
});

/**
 * AND THE WORDS MODULE IS NAMED, because it is the reason the discriminator exists and a check that
 * did not name it would go on passing if it were deleted.
 *
 * `src/screens/journal.ts` gives every kind in the vocabulary a sentence and writes none of them: it
 * imports the vocabulary and the store SCHEMA and nothing that can append an entry. This asserts the
 * REAL file, so a future edit that makes it a writer — which would be a genuine change in what this
 * application records — fails here rather than being absorbed by the strip.
 */
test('the journal words module names every kind and writes none of them', () => {
  const worded = readFileSync(join(SHELL, 'screens', 'journal.ts'), 'utf8');

  const named = Object.keys(JOURNAL_KINDS).filter((name) => worded.includes(`JOURNAL_KINDS.${name}`));
  assert.deepEqual(named.sort(), Object.keys(JOURNAL_KINDS).sort(),
    'the words module no longer gives every kind a sentence. A kind with no phrase degrades to an '
    + 'honest fallback on screen rather than throwing, so this is the only place the gap is visible.');

  const writes = Object.keys(JOURNAL_KINDS).filter((name) => referencesAsValue(worded, name));
  assert.deepEqual(writes, [],
    'the words module has started WRITING journal entries. That is a real change in what this '
    + 'application records and it is not a test expectation to update: a screen-layer module that '
    + 'appends to the log is a second writer nothing paired against, and the surface that reports the '
    + 'log would then be part of what it reports.');
});

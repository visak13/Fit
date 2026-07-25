/**
 * THE TWO MEASURED QUIRKS — the most important tests in this directory.
 *
 * Every other test here proves the double works. These two prove the double is WRONG in
 * exactly the ways the real service is wrong, which is the only reason a test against a
 * double is worth anything at all.
 *
 * They are written as assertions about INTENT, not as an incidental absence of a check. An
 * absence looks identical to an oversight, and a reader who found `create` never checking for
 * a duplicate name would be entirely reasonable to fix it. So the refusals are declared
 * values (`DOUBLE_REFUSES`, `PORT_CAPABILITIES`) that these tests assert on, and the reason
 * sits beside the flag.
 *
 * If a change makes either behaviour sensible, these tests fail. That is their whole job.
 * Do not relax them. The correct fix is to restore the quirk.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryRemoteStorage, DOUBLE_REFUSES } from './memory-remote.js';
import {
  SPACES, PORT_CAPABILITIES, MEASURED_QUIRKS, PROVES_NOTHING_ABOUT_THE_PLATFORM,
  hasMoved, bytesToText,
} from './port.js';
import { manualClock } from './clock.js';

const KEY_ENVELOPE = 'key-envelope.json';

/** A store with virtual time, so revisions get distinct modification times on demand. */
function aStore() {
  return new InMemoryRemoteStorage({ clock: manualClock() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUIRK ONE — the hidden space does NOT enforce name uniqueness
//
// MEASURED on real devices during the platform spike. Two devices each created a key
// envelope under the same name in about fifteen minutes of ordinary use, by someone doing
// nothing wrong, and the space listed BOTH with different identifiers.
// ═══════════════════════════════════════════════════════════════════════════════

test('a same-name write in the hidden space yields TWO files, not one', async () => {
  const remote = aStore();

  const first = await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'from the laptop' });
  const second = await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'from the phone' });

  // No error was raised, nothing was de-duplicated, and nothing was replaced.
  assert.notEqual(first.file_id, second.file_id, 'two creates must produce two distinct identifiers');
  assert.equal(first.name, second.name, 'and they genuinely share the one name');

  const listing = await remote.list(SPACES.HIDDEN);
  assert.equal(listing.length, 2, 'the space lists BOTH — this is the split-brain state, reproduced');

  // Both survive intact. Neither write was silently dropped into the other.
  const a = await remote.read(first.file_id);
  const b = await remote.read(second.file_id);
  assert.equal(bytesToText(a.content), 'from the laptop');
  assert.equal(bytesToText(b.content), 'from the phone');
});

test('the second write did not overwrite the first, and neither is at revision two', async () => {
  // The distinction matters: a store that replaced the first file would ALSO leave one name
  // in the listing, and a careless test could not tell the two apart. Revision does.
  const remote = aStore();
  const first = await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'one' });
  await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'two' });

  const stat = await remote.stat(first.file_id);
  assert.equal(stat.revision, 1, 'the first file was never touched by the second create');
});

test('THREE creates give three files — nothing collapses at any count', async () => {
  const remote = aStore();
  for (let i = 0; i < 3; i += 1) {
    await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: `device ${i}` });
  }
  assert.equal((await remote.list(SPACES.HIDDEN)).length, 3);
});

test('the visible space behaves the same way, which is a deliberate INFERENCE not a measurement', async () => {
  // The spike measured the hidden space. Applying the same rule to the visible space is an
  // inference, made deliberately in the HARSHER direction: assuming no uniqueness where there
  // might be some costs a redundant check, whereas assuming uniqueness where there is none
  // costs a silent duplicate. The quirk record says so in as many words.
  const remote = aStore();
  await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'a' });
  await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'b' });
  assert.equal((await remote.list(SPACES.VISIBLE)).length, 2);

  const quirk = MEASURED_QUIRKS.find((q) => q.id === 'no-name-uniqueness');
  assert.match(quirk.also_note, /INFERENCE/);
  assert.match(quirk.also_note, /harsher direction/);
});

test('the two spaces are separate — a hidden file is not listed in the visible one', async () => {
  const remote = aStore();
  await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'k' });
  assert.equal((await remote.list(SPACES.VISIBLE)).length, 0);
  assert.equal((await remote.list(SPACES.HIDDEN)).length, 1);
});

test('THE GUARD THIS QUIRK EXISTS FOR: list-then-adopt has all three cases, and the third is reachable', async () => {
  // Not the guard itself — that belongs to a later step. This proves the double can present
  // every state that guard must handle, which is the only thing that makes testing it honest.
  const remote = aStore();

  // Case one: nothing there. A device may create.
  assert.equal((await remote.list(SPACES.HIDDEN, { namePrefix: 'key-envelope' })).length, 0);

  // Case two: exactly one. A device must ADOPT it and must not create a second.
  const laptop = await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'the one key' });
  const one = await remote.list(SPACES.HIDDEN, { namePrefix: 'key-envelope' });
  assert.equal(one.length, 1);
  assert.equal(one[0].file_id, laptop.file_id);

  // Case three: MORE THAN ONE, which is the state nobody had on the list until the spike
  // stumbled into it. A naive adopt-the-first would still split the ciphertext, so this must
  // be surfaced to the user and never resolved by guessing.
  await remote.create(SPACES.HIDDEN, { name: KEY_ENVELOPE, content: 'a second key, and this is the disaster' });
  const many = await remote.list(SPACES.HIDDEN, { namePrefix: 'key-envelope' });
  assert.equal(many.length, 2, 'the third case is reachable against this double, so the guard can be tested against it');
  assert.notEqual(many[0].file_id, many[1].file_id);
});

test('the refusal to enforce uniqueness is a DECLARED value, so removing it is a visible change', async () => {
  assert.equal(DOUBLE_REFUSES.enforces_name_uniqueness, false);
  assert.equal(PORT_CAPABILITIES.name_uniqueness, false);
  assert.match(DOUBLE_REFUSES.why, /adopt-before-create/);

  const quirk = MEASURED_QUIRKS.find((q) => q.id === 'no-name-uniqueness');
  assert.ok(quirk, 'the quirk is recorded with its provenance');
  assert.equal(quirk.confidence, 'MEASURED', 'measured on real devices — never write "assumed" here');
  assert.match(quirk.where, /spike/);
  assert.match(quirk.why_the_double_must_reproduce_it, /never be exercised/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUIRK TWO — there is no conditional-match facility, so a lost update is real
//
// Read-compare-write is DETECTION, never a lock.
// ═══════════════════════════════════════════════════════════════════════════════

test('a lost update GENUINELY OCCURS: two readers both write, the second wins, the first is gone', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  // Two devices read the same file at the same revision. Neither knows about the other.
  const laptopRead = await remote.read(created.file_id);
  const phoneRead = await remote.read(created.file_id);
  assert.equal(laptopRead.meta.revision, phoneRead.meta.revision, 'both readers started from the same revision');

  // Both write. Nothing anywhere refuses, and nothing anywhere errors.
  await remote.overwrite(created.file_id, 'the laptop edit');
  await remote.overwrite(created.file_id, 'the phone edit');

  // The laptop's edit is GONE. Not merged, not preserved, not reported. Gone.
  const after = await remote.read(created.file_id);
  assert.equal(bytesToText(after.content), 'the phone edit');
  assert.notEqual(bytesToText(after.content), 'the laptop edit',
    'the loss must be real — a double that prevented it would let conflict surfacing pass a test it never faced');
});

test('the lost update leaves a DETECTABLE trace, which is the whole basis of conflict surfacing', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });
  const held = (await remote.read(created.file_id)).meta;

  // Someone else writes while we were thinking.
  await remote.overwrite(created.file_id, 'their edit');

  const current = await remote.stat(created.file_id);
  assert.equal(hasMoved(held, current), true, 'the revision moved, so the clash is detectable after the fact');
  assert.equal(current.revision, held.revision + 1);
});

test('DETECTION IS NOT PREVENTION: the window stays open even for a caller that checks first', async () => {
  // This is the test that stops someone reading `hasMoved` as a lock. The caller does
  // everything right — reads, compares, finds nothing moved — and STILL loses the other
  // write, because the clash lands between the compare and the write. Nothing on this port
  // can close that window, which is why conflicts are surfaced rather than prevented.
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  const held = (await remote.read(created.file_id)).meta;

  // Step two: compare. Clean — nothing has changed yet.
  assert.equal(hasMoved(held, await remote.stat(created.file_id)), false);

  // ...and here, in the gap the platform gives us no way to close, the other device lands.
  await remote.overwrite(created.file_id, 'the other device, arriving in the window');

  // Step three: write. It succeeds, and it destroys the write that arrived in the window.
  await remote.overwrite(created.file_id, 'our edit, which now destroys theirs');

  const after = await remote.read(created.file_id);
  assert.equal(bytesToText(after.content), 'our edit, which now destroys theirs');
  assert.equal(after.meta.revision, 3, 'three revisions happened; only one survived as content');
});

test('the port offers NO conditional-write parameter anywhere, and that is deliberate', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  assert.equal(PORT_CAPABILITIES.conditional_write, false);
  assert.equal(DOUBLE_REFUSES.prevents_lost_update, false);

  // `overwrite` takes content and a deadline. It takes no expected revision, and an attempt
  // to smuggle one in is simply ignored rather than honoured — because honouring it would
  // advertise a lock the real service cannot provide, and every caller built on that promise
  // would be wrong in a way that only surfaces in the cloud step.
  await remote.overwrite(created.file_id, 'ignored precondition', { expectedRevision: 999 });
  assert.equal((await remote.stat(created.file_id)).revision, 2, 'the write landed; the fake precondition did nothing');

  const quirk = MEASURED_QUIRKS.find((q) => q.id === 'no-conditional-write');
  assert.equal(quirk.confidence, 'MEASURED');
  assert.match(quirk.also_note, /encode a facility the platform lacks/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// The honesty clause
// ═══════════════════════════════════════════════════════════════════════════════

test('the contract states plainly that nothing here proves anything about the real platform', () => {
  // Kept as an asserted constant rather than only as prose, so it cannot quietly be deleted
  // by someone tidying up a comment.
  assert.match(PROVES_NOTHING_ABOUT_THE_PLATFORM, /No live provider call is made/);
  assert.match(PROVES_NOTHING_ABOUT_THE_PLATFORM, /NEVER proves the platform/);
  assert.match(PROVES_NOTHING_ABOUT_THE_PLATFORM, /worth exactly its fidelity/);
});

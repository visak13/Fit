/**
 * THE CHAIN, AND THE DIVERGENCE POINT.
 *
 * Verification is the third guard, and the thing it must actually do is report WHERE — a pass that
 * says only "something is wrong" leaves the coach with a warning he cannot act on. So every tamper
 * test below asserts the POSITION and the REASON, not merely that `ok` went false.
 *
 * The three ways a chain really breaks are each attacked separately, because they are genuinely
 * different events and the log is worth much less if it cannot tell them apart: an entry EDITED in
 * place, an entry REMOVED, and an entry INSERTED. The per-device rule and the pruned head are tested
 * beside them, since retention exists and a policy that makes honest verification fail would be
 * worse than no policy.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { DIVERGENCE, appendEntry, groupByDevice, hashEntry, verifyChain, verifyJournal } from './chain.js';
import { HASH_FIELD } from './entry.js';
import { JOURNAL_KINDS } from './kinds.js';

const LAPTOP = 'coach-laptop';
const PHONE = 'coach-phone';

/** Build a chain of `count` record-change entries on one device. */
async function chainOf(count, device = LAPTOP, from = null) {
  const entries = [];
  let previous = from;
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- each entry links to the one before it.
    previous = await appendEntry(previous, {
      kind: JOURNAL_KINDS.RECORD_UPDATED,
      device,
      entry_id: `${device}-entry-${i + 1}`,
      at: new Date(Date.UTC(2026, 6, 26, 9, 0, i)).toISOString(),
      subject: { type: 'session-note', record_id: `record-${i + 1}` },
    });
    entries.push(previous);
  }
  return entries;
}

test('a chain of honest entries verifies, and reports how many it checked', async () => {
  const entries = await chainOf(5);
  const result = await verifyChain(entries);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 5);
  assert.equal(result.first_divergence, null);
  assert.equal(result.truncated_head, false);
  assert.equal(result.device, LAPTOP);
});

test('the first entry a device writes links to nothing; every later one links to its predecessor', async () => {
  const entries = await chainOf(3);
  assert.equal(entries[0].previous_hash, null);
  assert.equal(entries[0].seq, 1);
  assert.equal(entries[1].previous_hash, entries[0][HASH_FIELD]);
  assert.equal(entries[2].previous_hash, entries[1][HASH_FIELD]);
  assert.deepEqual(entries.map((e) => e.seq), [1, 2, 3]);
});

test('the position and the link are DERIVED, not accepted from the caller', async () => {
  // A caller that could choose its own seq and previous_hash could write an entry linking nowhere,
  // and the chain would be a field the application fills in rather than a structure it maintains.
  const [first] = await chainOf(1);
  const second = await appendEntry(first, {
    kind: JOURNAL_KINDS.SYNC_COMPLETED, device: LAPTOP, entry_id: 'e2',
    seq: 99, previous_hash: null,
  });
  assert.equal(second.seq, 2);
  assert.equal(second.previous_hash, first[HASH_FIELD]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The three ways a chain breaks, each reported as itself
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('AN ALTERED ENTRY is detected, and the divergence names exactly which one', async () => {
  const entries = await chainOf(6);
  // Someone edits the third entry to point at a different record — the audit-trail attack.
  const tampered = entries.map((entry, i) => (i === 2
    ? { ...entry, subject: { type: 'session-note', record_id: 'a-different-record' } }
    : entry));

  const result = await verifyChain(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 2, 'it must say WHERE, not merely that');
  assert.equal(result.first_divergence.seq, 3);
  assert.equal(result.first_divergence.entry_id, entries[2].entry_id);
  assert.equal(result.first_divergence.reason, DIVERGENCE.ALTERED);
  assert.equal(result.checked, 2, 'the two entries before it did verify');
});

test('A REMOVED ENTRY is detected at the entry that used to follow it', async () => {
  const entries = await chainOf(6);
  const withoutTheFourth = [...entries.slice(0, 3), ...entries.slice(4)];

  const result = await verifyChain(withoutTheFourth);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 3);
  assert.equal(result.first_divergence.seq, 5, 'entry 4 is gone, so entry 5 is where it shows');
  assert.equal(result.first_divergence.reason, DIVERGENCE.SEQUENCE_GAP);
});

test('A REMOVED ENTRY whose sequence numbers were also fixed up still breaks the LINK', async () => {
  // The more careful attack: delete an entry and renumber the survivors so the sequence looks
  // continuous. The hashes are what catches it — renumbering cannot restore a digest.
  const entries = await chainOf(6);
  const renumbered = [...entries.slice(0, 3), ...entries.slice(4)]
    .map((entry, i) => (i < 3 ? entry : { ...entry, seq: i + 1 }));

  const result = await verifyChain(renumbered);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 3);
  // Reported as a BROKEN LINK and not as an alteration, which is the truthful reading: the survivor
  // still commits to the digest of the entry that was deleted, and that digest is not the one its
  // new predecessor has. Renumbering restores the appearance of continuity and cannot restore the
  // link, because the attacker would have to recompute every digest from here forward — which is
  // exactly the tampering this chain can only make EVIDENT, never prevent. See chain.js.
  assert.equal(result.first_divergence.reason, DIVERGENCE.BROKEN_LINK);
});

test('AN INSERTED ENTRY is detected — a plausible forgery does not link', async () => {
  const entries = await chainOf(5);
  // A well-formed entry, correctly numbered, hashed correctly for its own fields — everything
  // except the one thing it cannot have: the digest of the entry it claims to follow.
  const forged = await appendEntry(entries[1], {
    kind: JOURNAL_KINDS.RECORD_DELETED, device: LAPTOP, entry_id: 'forged',
    at: '2026-07-26T09:00:02.500Z', subject: { type: 'client', record_id: 'record-9' },
  });
  const spliced = [...entries.slice(0, 3), { ...forged, seq: 4 }, ...entries.slice(3)];

  const result = await verifyChain(spliced);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 3);
  assert.equal(result.first_divergence.entry_id, 'forged');
  assert.ok([DIVERGENCE.ALTERED, DIVERGENCE.BROKEN_LINK].includes(result.first_divergence.reason));
});

test('A RELINKED ENTRY — one whose previous_hash was repointed — is a BROKEN LINK', async () => {
  const entries = await chainOf(4);
  const relinked = [...entries];
  const bent = { ...entries[2], previous_hash: entries[0][HASH_FIELD] };
  relinked[2] = { ...bent, [HASH_FIELD]: await hashEntry(bent) };

  const result = await verifyChain(relinked);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 2);
  assert.equal(result.first_divergence.reason, DIVERGENCE.BROKEN_LINK);
});

test('verification STOPS at the first divergence rather than reporting its own consequences', async () => {
  // Everything after a break fails to link. Reporting them all would bury the one that matters.
  const entries = await chainOf(8);
  const tampered = entries.map((e, i) => (i === 1 ? { ...e, at: '2020-01-01T00:00:00.000Z' } : e));
  const result = await verifyChain(tampered);
  assert.equal(result.first_divergence.index, 1);
  assert.equal(result.checked, 1);
});

test('an entry naming a kind outside the vocabulary is a divergence, not a pass', async () => {
  const entries = await chainOf(3);
  const bent = { ...entries[1], kind: 'client.viewed' };
  const smuggled = [...entries];
  smuggled[1] = { ...bent, [HASH_FIELD]: await hashEntry(bent) };

  const result = await verifyChain(smuggled);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.reason, DIVERGENCE.UNKNOWN_KIND);
});

test('rubbish in the list is reported as its position, not thrown as an exception', async () => {
  // A verification pass that throws on a malformed row cannot report WHERE the chain diverged,
  // which is the one thing it is for.
  const entries = await chainOf(3);
  const result = await verifyChain([entries[0], null, entries[1]]);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 1);
  assert.equal(result.first_divergence.reason, DIVERGENCE.NOT_AN_ENTRY);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PER DEVICE
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('CHAINS DO NOT SPAN DEVICES — a mixed list is refused rather than silently reordered', async () => {
  const mixed = [...(await chainOf(2, LAPTOP)), ...(await chainOf(2, PHONE))];
  const result = await verifyChain(mixed);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.reason, DIVERGENCE.DEVICE_MISMATCH);
});

test('appending across devices is refused at the point of writing, too', async () => {
  const [onLaptop] = await chainOf(1, LAPTOP);
  await assert.rejects(
    () => appendEntry(onLaptop, { kind: JOURNAL_KINDS.SYNC_COMPLETED, device: PHONE, entry_id: 'x' }),
    /per device/,
  );
});

test('two devices that appended independently BOTH verify, side by side', async () => {
  // The local-first case: no coordinator, no global order, two complete chains.
  const mixed = [];
  const laptop = await chainOf(3, LAPTOP);
  const phone = await chainOf(2, PHONE);
  // Interleaved by arrival, as a synchronised copy of the log would be.
  mixed.push(phone[1], laptop[0], laptop[2], phone[0], laptop[1]);

  const result = await verifyJournal(mixed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.devices.map((d) => d.device), [PHONE, LAPTOP].sort());
  assert.deepEqual(result.devices.map((d) => d.checked).sort(), [2, 3]);
});

test('a break on one device does not condemn the other', async () => {
  const laptop = await chainOf(3, LAPTOP);
  const phone = await chainOf(3, PHONE);
  const broken = [...laptop, ...phone.slice(0, 1), ...phone.slice(2)];

  const result = await verifyJournal(broken);
  assert.equal(result.ok, false);
  const byDevice = Object.fromEntries(result.devices.map((d) => [d.device, d]));
  assert.equal(byDevice[LAPTOP].ok, true);
  assert.equal(byDevice[PHONE].ok, false);
  assert.equal(byDevice[PHONE].first_divergence.reason, DIVERGENCE.SEQUENCE_GAP);
});

test('groupByDevice puts each device\'s entries in sequence order regardless of arrival order', async () => {
  const laptop = await chainOf(3, LAPTOP);
  const grouped = groupByDevice([laptop[2], laptop[0], laptop[1]]);
  assert.deepEqual(grouped.get(LAPTOP).map((e) => e.seq), [1, 2, 3]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PRUNED HEAD — retention exists, and honest verification must survive it
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('a pruned chain verifies EXACTLY when retention recorded the anchor it left behind', async () => {
  const entries = await chainOf(6);
  const survivors = entries.slice(3);
  const anchor = entries[2][HASH_FIELD];

  const result = await verifyChain(survivors, { anchor });
  assert.equal(result.ok, true);
  assert.equal(result.checked, 3);
  assert.equal(result.truncated_head, false, 'with an anchor there is nothing left unchecked');
});

test('a pruned chain with NO anchor is reported as truncated — never a silent pass, never a break', async () => {
  const entries = await chainOf(6);
  const result = await verifyChain(entries.slice(3));
  assert.equal(result.ok, true);
  assert.equal(result.truncated_head, true, 'it must say what it could not check');
  assert.equal(result.checked, 3);
});

test('truncation and a break are INDEPENDENT: a pruned chain that is also altered reports BOTH', async () => {
  const entries = await chainOf(6);
  const survivors = entries.slice(3);
  // The third survivor, edited after the fact. Its own digest no longer matches its own fields.
  survivors[2] = { ...survivors[2], at: new Date(Date.UTC(2020, 0, 1)).toISOString() };

  const result = await verifyChain(survivors);

  assert.equal(result.ok, false, 'the alteration is a break');
  assert.equal(result.first_divergence.reason, DIVERGENCE.ALTERED);
  assert.equal(result.first_divergence.index, 2);
  // The head WAS truncated, and a divergence found later does not un-truncate it. Reporting false
  // here would let a caller comparing the two fields read the missing entries as part of the
  // tampering — retention's ordinary work, accused.
  assert.equal(result.truncated_head, true, 'the head is still truncated, and the result still says so');
});

test('a WRONG anchor is a divergence at the head — retention cannot be used to hide a deletion', async () => {
  const entries = await chainOf(6);
  const result = await verifyChain(entries.slice(3), { anchor: entries[1][HASH_FIELD] });
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.index, 0);
  assert.equal(result.first_divergence.reason, DIVERGENCE.HEAD_NOT_ANCHORED);
});

test('an entry numbered past the start that links to NOTHING is a forged head', async () => {
  const entries = await chainOf(4);
  const bent = { ...entries[2], previous_hash: null };
  const forgedHead = [{ ...bent, [HASH_FIELD]: await hashEntry(bent) }, entries[3]];

  const result = await verifyChain(forgedHead);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.reason, DIVERGENCE.HEAD_NOT_ANCHORED);
});

test('a chain that arrived incomplete at the NEWEST end reads as shorter, not as broken', async () => {
  // A synchronised copy can be missing the latest entries. That is not tampering.
  const entries = await chainOf(6);
  const result = await verifyChain(entries.slice(0, 4));
  assert.equal(result.ok, true);
  assert.equal(result.checked, 4);
  assert.equal(result.head_hash, entries[3][HASH_FIELD], 'the tip is reported so a later pass can resume');
});

test('an empty log verifies as an empty log rather than as a failure', async () => {
  const result = await verifyChain([]);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 0);
  assert.equal(result.device, null);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The digest itself
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the digest comes from the shared primitives and is base64 of 32 bytes', async () => {
  const [entry] = await chainOf(1);
  assert.match(entry[HASH_FIELD], /^[A-Za-z0-9+/]{43}=$/);
});

test('the same entry hashes the same way every time, and a different one differently', async () => {
  const [a] = await chainOf(1);
  assert.equal(await hashEntry(a), a[HASH_FIELD]);
  const [b] = await chainOf(1, PHONE);
  assert.notEqual(await hashEntry(b), a[HASH_FIELD]);
});

/**
 * THE HISTORY THE FILTER USED TO READ AS AN ANSWER — constructed, not argued about.
 *
 * ## The question this file exists to close
 *
 * `areas.js` drops a same-revision clash once the coach has answered it, because an area file is
 * history rather than a current statement: the two rev-N copies sit in the areas until compaction
 * removes them, and re-reporting them would ask him the same question on every pass forever. That
 * protection is right and it is asserted here too.
 *
 * What was NOT settled is the test it used to use. It dropped a clash whenever ANY higher revision
 * existed, reading "something outranks both sides" as "he answered it". This suite constructs the
 * history where those two are not the same thing:
 *
 *     device A and device B both write revision N of one record, neither having seen the other.
 *     A — still holding only its own side — then edits that record again in the ordinary way to
 *     revision N+1. No resolution is ever recorded and the coach is never asked anything.
 *
 * A revision above both sides now exists and no question has been answered. Suppressing the clash
 * there discards B's edit and tells nobody, which is the exact failure the surrounding work exists
 * to prevent, arriving inside the guard against it. The history is not hypothetical and it is not
 * ruled out by any revision or supersede rule: A advances its own line by editing its own record,
 * which nothing prevents and nothing should.
 *
 * ## Two mechanisms lost that edit, and only one of them was the filter
 *
 * Proved by construction rather than read off the code. Running the history and DISABLING THE FILTER
 * ENTIRELY still reported nothing, because the fold compared each incoming record against the
 * current winner alone: when A's N+1 file is read before B's N, the rev-N copy from A's own line has
 * already been replaced, so the comparison is N+1 against N and reads as an ordinary supersede.
 *
 * That second mechanism is ORDER-DEPENDENT and PRE-EXISTING — it is not something the filter
 * introduced, and it would have survived untouched. A fix for only the ordering that was tested is
 * the same bug, so the history below is run in BOTH file orderings and asserted to reach the same
 * verdict.
 *
 * ## Every absence here is pointed at a known positive first
 *
 * The assertions that matter most are silences — "no clash is reported once he has answered". A
 * broken or misdirected reader produces that silence for free. So each one is taken with the SAME
 * reader, in the SAME run, immediately after that reader has been shown reporting the clash it is
 * later expected to stay quiet about.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import {
  ENVELOPE_FIELDS, createEnvelope, reviseEnvelope, validateEnvelope,
} from '../model/model.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { DOCUMENT_KINDS, DOCUMENT_VERSION, decodeDocument, encodeDocument } from './payload.js';
import { RESOLUTION, resolveDivergence } from './resolution.js';
import { T0, aWorld } from './testing.js';

const SPACE = 'visible';

/** The clash on this record, as the union reports it. */
const clashesOn = (union, recordId) => union.divergences.filter((d) => d.record_id === recordId);

/**
 * The history in the header, up to the point where A has advanced and nobody has been asked.
 *
 * `phonePushesBeforeLaptopAdvances` is the ONLY difference between the two orderings, and it decides
 * which of the two mechanisms would have swallowed the clash:
 *
 *  - `true`  — files read as L(rev1), L(rev2), P(rev2), L(rev3). The fold meets both rev-2 copies
 *              while they are standing, so the clash IS detected, and the FILTER is what used to
 *              drop it.
 *  - `false` — files read as L(rev1), L(rev2), L(rev3), P(rev2). A's rev 3 has already replaced its
 *              own rev 2 by the time B's rev 2 arrives, so the clash was never DETECTED at all and
 *              the filter never came into it.
 */
async function twoDevicesOneOfWhichAdvanced(world, { phonePushesBeforeLaptopAdvances }) {
  const laptop = await world.device('coach-laptop');
  const phone = await world.device('coach-phone');

  const client = await laptop.store.create('client', aClient({ name: 'Shared' }), { now: T0 });
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
  await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

  // A writes revision 2 and pushes it.
  world.advance(60_000);
  await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'laptop rev2' }),
    { now: world.now() });
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

  // B writes revision 2 independently. It has not synchronised since revision 1, so it has never
  // seen A's revision 2 and cannot have.
  world.advance(60_000);
  await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'phone rev2' }),
    { now: world.now() });

  if (phonePushesBeforeLaptopAdvances) {
    world.advance(60_000);
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
  }

  // A edits again in the ordinary way, STILL never having seen B. This is the whole question: a
  // revision above both sides now exists, and no resolution was ever recorded anywhere.
  world.advance(60_000);
  await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'laptop rev3' }),
    { now: world.now() });
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

  if (!phonePushesBeforeLaptopAdvances) {
    world.advance(60_000);
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
  }

  return { laptop, phone, client };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('sync/areas — a revision that merely OUTRANKS both sides has answered nothing', () => {
  for (const phonePushesBeforeLaptopAdvances of [true, false]) {
    const ordering = phonePushesBeforeLaptopAdvances
      ? "B's revision N is read BEFORE A's N+1"
      : "A's revision N+1 is read BEFORE B's revision N";

    it(`surfaces the clash when ${ordering}`, async () => {
      const world = aWorld();
      after(() => world.close());
      const { client } = await twoDevicesOneOfWhichAdvanced(world,
        { phonePushesBeforeLaptopAdvances });

      const union = await readUnion(world.remote, { space: SPACE });
      const [clash, ...extra] = clashesOn(union, client.record_id);

      assert.ok(clash,
        'nobody ever answered a question here. A advanced its own line by editing its own record, '
        + "which is ordinary and permitted; it did not see B's edit and could not have. Dropping "
        + "the clash because a higher revision exists discards B's edit and says so nowhere — the "
        + 'silent lost write this whole area exists to prevent.');
      assert.deepEqual(extra, [], 'and it is reported once, not once per file that holds a copy');
      assert.equal(clash.rev, 2, 'the clash is at the revision both sides claim, not at the winner');
      assert.deepEqual(
        [clash.local, clash.incoming].map((side) => side.content.notes).sort(),
        ['laptop rev2', 'phone rev2'],
        'both sides in full, so the coach can decide between them rather than be told there was a '
        + 'conflict and left with nothing to act on',
      );

      // The record the union settled on is A's ordinary edit, and it is NOT descended from any
      // answer — which is precisely why the clash above still stands.
      const settled = union.records.get(client.record_id);
      assert.equal(settled.rev, 3);
      assert.equal(settled.resolved_from ?? null, null,
        'an ordinary edit carries no answer. If this ever becomes a number without the resolution '
        + 'seam having run, the filter below starts speaking for a question nobody was asked.');
    });
  }

  it('reports the clash through a full pass, not only to a direct reader of the areas', async () => {
    const world = aWorld();
    after(() => world.close());
    const { phone, client } = await twoDevicesOneOfWhichAdvanced(world,
      { phonePushesBeforeLaptopAdvances: false });

    world.advance(60_000);
    const report = await syncNow(phone.store, world.remote,
      { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    assert.equal(report.divergences.filter((d) => d.record_id === client.record_id).length, 1,
      'the coach is looking at a synchronisation report, not at the areas. A clash the union finds '
      + 'and the report drops is still a lost edit he is never told about.');
  });
});

describe('sync/areas — and a revision that DESCENDS FROM AN ANSWER has answered it', () => {
  it('stops reporting a clash once he has answered it, and not one pass before', async () => {
    const world = aWorld();
    after(() => world.close());

    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Answered' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    world.advance(60_000);
    await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'laptop note' }),
      { now: world.now() });
    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'phone note' }),
      { now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    // ── the known positive, taken with the READER whose silence is asserted next ───────────────
    const report = await syncNow(laptop.store, world.remote,
      { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const before = await readUnion(world.remote, { space: SPACE });
    assert.equal(clashesOn(before, client.record_id).length, 1,
      'the clash is here and this reader can see it. Every silence asserted below is taken with '
      + 'this same reader in this same run, so a reader that had stopped working could not produce '
      + 'those silences and be believed.');

    const divergence = report.divergences.find((d) => d.record_id === client.record_id);
    assert.ok(divergence, 'the pass surfaced it, which is what gives him something to answer');

    // He answers it.
    world.advance(60_000);
    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.LOCAL, now: world.now() });
    assert.equal(resolution.to_rev, 3, 'written strictly above both sides, as it must be');

    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    // ── the silence, from the same reader ──────────────────────────────────────────────────────
    const after1 = await readUnion(world.remote, { space: SPACE });
    assert.deepEqual(clashesOn(after1, client.record_id), [],
      'he answered it, so he is not asked again. The two rev-2 files are still sitting in the '
      + 'areas until compaction removes them, and reporting them would put the same question in '
      + 'front of him on every pass forever — which is how a surface teaches him to stop reading it.');
    assert.equal(after1.records.get(client.record_id).resolved_from, 2,
      'and the reason it is quiet is the mark the resolution seam left, not the mere existence of '
      + 'a higher number');

    // It stays quiet across further passes on both devices, which is where a mark that failed to
    // travel — or an inheritance that dropped it — would show up.
    for (const dev of [phone, laptop, phone]) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      const pass = await syncNow(dev.store, world.remote,
        { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
      assert.deepEqual(pass.divergences.filter((d) => d.record_id === client.record_id), [],
        `${dev.tag} does not re-ask it either. The mark has to cross the device boundary; a device `
        + 'that never saw the answer would otherwise go on asking it.');
    }

    // An ordinary edit made AFTER the answer keeps the mark, because the mark is about the line of
    // history and not about one write. Losing it here would make the question come back.
    world.advance(60_000);
    await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'later edit' }),
      { now: world.now() });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    const after2 = await readUnion(world.remote, { space: SPACE });
    assert.equal(after2.records.get(client.record_id).content.notes, 'later edit');
    assert.equal(after2.records.get(client.record_id).resolved_from, 2,
      'inherited, not cleared — the record still descends from the answer he gave');
    assert.deepEqual(clashesOn(after2, client.record_id), [],
      'so the settled question stays settled through ordinary editing');
  });

  it('an answer to an EARLIER clash does not speak for a later one', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Twice' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    // First clash at revision 2, answered.
    world.advance(60_000);
    await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'L2' }),
      { now: world.now() });
    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'P2' }),
      { now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const first = await syncNow(laptop.store, world.remote,
      { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    world.advance(60_000);
    await resolveDivergence(laptop.store,
      first.divergences.find((d) => d.record_id === client.record_id),
      { side: RESOLUTION.LOCAL, now: world.now() });
    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    const settled = (await readUnion(world.remote, { space: SPACE })).records.get(client.record_id);
    assert.equal(settled.resolved_from, 2, 'the first answer is on the record');
    const revNow = settled.rev;

    // A SECOND clash, at a higher revision, which nobody has answered. The record carries a mark
    // from the earlier answer — a mark that must not be allowed to cover this one.
    world.advance(60_000);
    await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'L next' }),
      { now: world.now() });
    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'P next' }),
      { now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    const union = await readUnion(world.remote, { space: SPACE });
    const clash = clashesOn(union, client.record_id).find((d) => d.rev === revNow + 1);
    assert.ok(clash,
      'a mark saying "revision 2 was settled" says nothing about a clash at a later revision. '
      + 'Treating it as a blanket "this record has been resolved" would silence every future '
      + 'divergence on a record he once answered a question about.');
  });
});

describe('sync/areas — the two devices may be running different builds', () => {
  it('reads a record written before this field existed, and calls it unanswered', async () => {
    // Exactly what a build without `resolved_from` writes: the key is not there at all.
    const legacy = createEnvelope({
      type: 'client', content: aClient({ name: 'Legacy' }), device: 'coach-phone', now: T0,
    });
    delete legacy.resolved_from;

    assert.ok(validateEnvelope(legacy).ok,
      'an envelope that predates the field is not malformed. Refusing it would make an already-'
      + 'stored record unreadable in order to answer a question about divergence — and areas.js '
      + 'catches that refusal per file and SKIPS the file while the pass still reports success, so '
      + 'the older device would show green holding none of the newer one\'s work.');

    const text = encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [legacy], writtenAt: T0,
    });
    const back = decodeDocument(text);
    assert.equal(back.document_version, DOCUMENT_VERSION);
    assert.equal(back.records[0].resolved_from ?? null, null,
      'absent means what null means: no answer anywhere in this record\'s past');
  });

  it('writes nothing new into a record that has never answered a divergence', () => {
    const ordinary = createEnvelope({
      type: 'client', content: aClient({ name: 'Ordinary' }), device: 'coach-laptop', now: T0,
    });
    assert.equal(ordinary.resolved_from, null);

    const text = encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-laptop', records: [ordinary], writtenAt: T0,
    });
    const [onTheWire] = JSON.parse(text).records;

    assert.equal(Object.hasOwn(onTheWire, 'resolved_from'), false,
      'omitted when it has nothing to say, so every record the coach has never resolved goes out '
      + 'byte-identical to what a build without this field writes. An older device refuses an '
      + 'envelope key it does not know, and a refused file is SKIPPED while the pass still reports '
      + 'a clean completion — the failure mode where he is shown green while holding none of the '
      + 'other device\'s work.');

    const historic = ['record_id', 'type', 'rev', 'device', 'deleted', 'deleted_at',
      'created_at', 'updated_at', 'content'];
    assert.deepEqual(Object.keys(onTheWire).sort(), [...historic].sort(),
      'and it is the ONLY field that may be omitted: everything else is still rebuilt from the '
      + 'declared list, so nothing unrecognised can travel');
    assert.equal(DOCUMENT_VERSION, 1,
      'the field is additive, so the document version does NOT move. Bumping it would make every '
      + 'file the newer device writes undecodable to the older one, which skips them silently.');
  });

  it('carries the mark on the wire when there IS one', () => {
    const start = createEnvelope({
      type: 'client', content: aClient({ name: 'Answered' }), device: 'coach-laptop', now: T0,
    });
    const answered = { ...reviseEnvelope(start, aClient({ name: 'Answered' }), { device: 'coach-laptop', now: T0 }), resolved_from: 1 };

    const [onTheWire] = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-laptop', records: [answered], writtenAt: T0,
    })).records;
    assert.equal(onTheWire.resolved_from, 1,
      'the omission is for a null and nothing else. A mark that failed to travel would leave the '
      + 'other device asking a question he has already answered.');
    assert.ok(ENVELOPE_FIELDS.includes('resolved_from'),
      'and it travels because it is a declared envelope field, not because it was copied');
  });

  it('refuses a mark from a revision the record has not reached', () => {
    const e = createEnvelope({
      type: 'client', content: aClient(), device: 'coach-laptop', now: T0,
    });
    assert.equal(validateEnvelope({ ...e, resolved_from: 5 }).ok, false,
      'an answer is written ABOVE both sides, so the revision it settled is always below this '
      + 'one. A value above it did not come from the resolution seam.');
    assert.equal(validateEnvelope({ ...e, resolved_from: 0 }).ok, false,
      'and there is no revision zero to have settled');
  });
});

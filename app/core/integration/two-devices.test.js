/**
 * TWO DEVICES — where this design earns its keep, and where it would fail silently if it did not.
 *
 * The coach uses a laptop for online sessions and a phone for in-person ones. That single fact is
 * responsible for most of the machinery in this core, because the two-device failures are the ones
 * that produce no error at any point:
 *
 *   - Two devices each generating their own data key gives TWO INCOMPATIBLE FAMILIES OF CIPHERTEXT.
 *     Nothing errors when it happens. It surfaces months later as a note that will not open.
 *   - The hidden space does not enforce unique names, so two objects can sit there under one name.
 *     That is not a hypothetical: it happened in about fifteen minutes of ordinary two-device use.
 *     A naive adopt-the-first would split the ciphertext just as thoroughly as creating a second.
 *   - The same quirk belongs to the SPACE rather than to any one file, so the recovery-key object
 *     has it too — and that one is worse, because a wrong recovery key stays silent until somebody
 *     actually needs to recover, on a wiped device, when there is no way back.
 *   - Read-compare-write on the shared snapshot is DETECTION, never a lock. A lost update genuinely
 *     occurs, so the honest claim is detect-then-rebuild-from-authority, not prevention.
 *
 * Each of those was proved inside the crypto or sync strand. What no strand could prove is the
 * whole chain: that a second device adopting an envelope can then READ THE FIRST DEVICE'S actual
 * encrypted note out of the synchronised record. That is the proof the families did not split, and
 * it needs the store, the sync engine and the crypto envelope in one test.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { InMemoryDeviceKeyStore } from '../crypto/device-key-store.js';
import { MultipleKeyObjectsFound } from '../crypto/errors.js';
import {
  ENVELOPE_OBJECT_NAME, LISTING_STATES, OUTCOMES, RECOVERY_OBJECT_NAME,
  establishKeyMaterial, surveyKeyObjects,
} from '../crypto/guard.js';
import { openField } from '../crypto/sealing.js';
import { aClient } from '../model/fixtures.js';
import { SPACES } from '../remote/port.js';
import { readUnion } from '../sync/areas.js';
import { SYNC_TRIGGERS, recoverFromRemote, refreshSnapshot } from '../sync/engine.js';
import { SNAPSHOT_NAME } from '../sync/partition.js';
import {
  PUBLISH, RACE_IS_DETECTED_NOT_PREVENTED, assembleSnapshot, locateSnapshot, readSnapshot,
} from '../sync/snapshot.js';
import { aPractice, registerClientWithNote, sync, SPACE } from './testing.js';

const NOTE = 'MARKER-CLINICAL-91de: lumbar disc history, no loaded flexion.';

/** How many objects of each name are in the hidden space. */
async function census(remote) {
  const all = await remote.list(SPACES.HIDDEN);
  return {
    envelopes: all.filter((m) => m.name === ENVELOPE_OBJECT_NAME).length,
    recoveries: all.filter((m) => m.name === RECOVERY_OBJECT_NAME).length,
  };
}

describe('integration — the second device adopts, and can read what the first one sealed', () => {
  it('adopts the existing envelope and opens the first device\'s note out of the synchronised record', async () => {
    const world = aPractice();
    after(() => world.close());

    // ── device one: creates the one and only key, seals a note, synchronises ────────────────
    const laptop = await world.signedInDevice('coach-laptop');
    assert.equal(laptop.keyOutcome, OUTCOMES.CREATED, 'the first device creates, exactly once');

    const { clientId } = await registerClientWithNote(laptop, world, {
      name: 'Test Client Gamma', note: NOTE, label: 'Notes B',
    });
    await sync(laptop, world, SYNC_TRIGGERS.OPEN);

    // ── device two: a different device key store, a different database, one shared space ────
    world.advance(60 * 60_000);
    const phone = await world.signedInDevice('coach-phone', { seed: false });

    assert.equal(phone.keyOutcome, OUTCOMES.ADOPTED,
      'the second device ADOPTS. Creating here is the forbidden act: it would leave two families '
      + 'of ciphertext with nothing to notice.');
    assert.deepEqual(await census(world.remote), { envelopes: 1, recoveries: 1 },
      'and still exactly one of each object — adoption writes a slot, never a second envelope');

    // ── the whole point: the phone reads the laptop's ciphertext ────────────────────────────
    const pulled = await sync(phone, world, SYNC_TRIGGERS.OPEN);
    assert.deepEqual(pulled.failures, []);

    const stored = await phone.store.get('client', clientId);
    assert.ok(stored, 'the client record reached the phone');
    assert.equal(typeof stored.content.clinical_note?.ct, 'string',
      'and it arrived as ciphertext, exactly as it left');

    const opened = await openField(
      phone.dataKey, { type: 'client', recordId: clientId, field: 'clinical_note' },
      stored.content.clinical_note,
    );
    assert.equal(opened, NOTE,
      'THE PROOF THE FAMILIES DID NOT SPLIT: a note sealed on the laptop opens on the phone, '
      + 'under a key the phone never generated and never saw in the clear');

    const label = await openField(
      phone.dataKey, { type: 'client', recordId: clientId, field: 'clinical_reference_label' },
      stored.content.clinical_reference_label,
    );
    assert.equal(label, 'Notes B', 'the pointer LABEL is sealed too, and it opens as well');
  });

  it('refuses to create on a device that has never reached the space, rather than helpfully making a second key', async () => {
    const world = aPractice();
    after(() => world.close());
    await world.signedInDevice('coach-laptop');

    await assert.rejects(
      establishKeyMaterial({
        remote: world.remote,
        deviceId: 'coach-phone',
        deviceKeys: new InMemoryDeviceKeyStore(),
        hasEverSynchronised: false,
        now: () => world.now(),
      }),
      /connect|sync/i,
      'an offline device that has never synchronised REFUSES, and says why. Generating a fresh key '
      + 'to keep working is precisely the helpful act that splits the ciphertext for ever.',
    );
    assert.deepEqual(await census(world.remote), { envelopes: 1, recoveries: 1 });
  });
});

describe('integration — the state that actually happened: two objects under one name', () => {
  it('SURFACES a two-envelope listing instead of resolving it by guessing', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');

    // Force the measured state. The space permits two objects of one name, so this is not a
    // simulation of the failure: it IS the failure, reproduced.
    const impostor = { ...JSON.parse('{}') };
    await world.remote.create(SPACES.HIDDEN, {
      name: ENVELOPE_OBJECT_NAME, content: JSON.stringify({ ...impostor, version: 1, slots: [] }),
    });

    const survey = await surveyKeyObjects(world.remote);
    assert.equal(survey.envelopes.state, LISTING_STATES.MORE_THAN_ONE);

    let caught = null;
    try { await laptop.establish(); } catch (error) { caught = error; }
    assert.ok(caught instanceof MultipleKeyObjectsFound,
      'the third case is refused outright: adopt-the-first would split the ciphertext exactly as '
      + 'thoroughly as creating a second envelope, and it would look like it worked');
    assert.equal((caught.found ?? caught.candidates ?? []).length, 2,
      'BOTH candidates are carried out of the failure, because the screen has to show the coach '
      + 'two things to look at rather than a count');

    assert.equal((await census(world.remote)).envelopes, 2,
      'and nothing was written, deleted or chosen: the state is reported, not tidied');
  });

  it('SURFACES a two-recovery-key listing as well — the quirk belongs to the space, not the envelope', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');

    await world.remote.create(SPACES.HIDDEN, {
      name: RECOVERY_OBJECT_NAME, content: JSON.stringify({ version: 1, recovery: {} }),
    });

    const survey = await surveyKeyObjects(world.remote);
    assert.equal(survey.recoveries.state, LISTING_STATES.MORE_THAN_ONE);

    let caught = null;
    try { await laptop.establish(); } catch (error) { caught = error; }
    assert.ok(caught instanceof MultipleKeyObjectsFound,
      'the recovery object gets the SAME three-case guard. It is the more dangerous of the two: a '
      + 'duplicated envelope announces itself the first time a note will not open, whereas a '
      + 'duplicated recovery key stays silent until somebody is recovering a wiped device — the '
      + 'one moment there is no way back.');
    assert.equal((await census(world.remote)).recoveries, 2, 'again, nothing resolved');
  });
});

describe('integration — the snapshot race: DETECTED, and then repaired from the authority', () => {
  it('detects the lost update and rebuilding from the device areas restores the dropped record', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');
    const phone = await world.signedInDevice('coach-phone', { seed: false });

    await laptop.store.create('client', aClient({ name: 'Test Client On Laptop' }), { now: world.now() });
    await sync(laptop, world);
    world.advance(60_000);
    await phone.store.create('client', aClient({ name: 'Test Client On Phone' }), { now: world.now() });
    await sync(phone, world);
    await sync(laptop, world);

    const namesIn = (document) => document.records
      .filter((r) => r.type === 'client' && !r.deleted)
      .map((r) => r.content?.name).sort();

    const located = await locateSnapshot(world.remote, { space: SPACE });
    assert.equal(located.verdict, 'one');
    const healthy = await readSnapshot(world.remote, located.meta.file_id);
    assert.deepEqual(namesIn(healthy.document), ['Test Client On Laptop', 'Test Client On Phone']);

    // ── force the race. A device composed its snapshot before the phone's client existed,
    // checked, and wrote inside the window that read-compare-write cannot close.
    const stale = assembleSnapshot({
      union: {
        records: new Map(healthy.document.records
          .filter((r) => r.content?.name !== 'Test Client On Phone')
          .map((r) => [r.record_id, r])),
      },
      device: 'coach-laptop',
      writtenAt: world.now(),
    });
    await world.remote.overwrite(located.meta.file_id, stale.text);

    const damaged = await readSnapshot(world.remote, located.meta.file_id);
    assert.deepEqual(namesIn(damaged.document), ['Test Client On Laptop'],
      'the record REALLY WAS LOST from the snapshot, and nothing errored. This is the measured '
      + 'behaviour, not a description of it.');
    assert.equal(RACE_IS_DETECTED_NOT_PREVENTED, true);

    // ── DETECTION plus RECOVERY, which is the honest claim. Detection alone would leave the
    // coach informed and still missing a client.
    const union = await readUnion(world.remote, { space: SPACE });
    assert.ok([...union.records.values()].some((r) => r.content?.name === 'Test Client On Phone'),
      'the device areas never lost it — they are the authority and the snapshot is derived');

    const rebuilt = await refreshSnapshot(world.remote, {
      space: SPACE, device: 'coach-laptop', now: world.now(),
    });
    assert.equal(rebuilt.outcome, PUBLISH.REPLACED);

    const repaired = await readSnapshot(world.remote, located.meta.file_id);
    assert.deepEqual(namesIn(repaired.document), ['Test Client On Laptop', 'Test Client On Phone'],
      'correctness RESTORED, not merely reported');

    // ── and a third device recovering now gets the whole practice, not the damaged view ─────
    const spare = await world.signedInDevice('coach-spare', { seed: false });
    const recovered = await recoverFromRemote(spare.store, world.remote, { space: SPACE });
    assert.ok(recovered.applied > 0);
    const onSpare = await spare.store.count('client');
    assert.equal(onSpare, 2, 'both clients reached a device that was recovering from scratch');
  });

  it('refuses to adopt any snapshot when more than one answers to the name, and reads the areas instead', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Test Client Solo' }), { now: world.now() });
    await sync(laptop, world);

    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });
    assert.equal((await locateSnapshot(world.remote, { space: SPACE })).verdict, 'many');

    const phone = await world.signedInDevice('coach-phone', { seed: false });
    const recovered = await recoverFromRemote(phone.store, world.remote, { space: SPACE });

    assert.equal(recovered.source, 'areas',
      'the ambiguous snapshot is not guessed at; the areas are the authority and they are read');
    assert.equal(await phone.store.count('client'), 1, 'and the recovery is complete anyway');
  });
});

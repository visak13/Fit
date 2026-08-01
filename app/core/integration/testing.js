/**
 * THE CROSS-STRAND HARNESS: a practice, on real devices, with the shipped library in it.
 *
 * Every other test directory in this core verifies one strand against its own neighbours. This one
 * assembles ALL of them — record model, local store, seed importer, session runner, encryption
 * envelope, durable outbox, remote port and synchronisation engine — and drives them through
 * things the coach actually does. No strand's own suite can prove any of it, because each one ends
 * at its own boundary and the boundaries are where the interesting failures live.
 *
 * Nothing in the application imports this file, and nothing here makes a live call to any
 * provider. The remote is the in-memory double throughout. See `INTEGRATION.md` beside this
 * directory's parent for what that does and does not prove — the short version is that everything
 * here is a claim about OUR LOGIC given behaviour the double was measured against, and never a
 * claim about the real platform.
 *
 * NO REAL PERSON APPEARS HERE. The repository is public by an explicit decision, so the names and
 * the clinical text are invented and deliberately unmistakable.
 */

import { InMemoryDeviceKeyStore } from '../crypto/device-key-store.js';
import { establishKeyMaterial } from '../crypto/guard.js';
import { sealField } from '../crypto/sealing.js';
import { recordEvent } from '../journal/journal.js';
import { aClient } from '../model/fixtures.js';
import { seedContentFor } from '../seed/content.js';
import { importSeed } from '../seed/import.js';
import { SYNC_TRIGGERS, syncNow } from '../sync/engine.js';
import { aWorld, restart, settle } from '../sync/testing.js';

export { restart, settle };
export { T0 } from '../sync/testing.js';

/** The space the application's records live in. The key material lives in the hidden one. */
export const SPACE = 'visible';

/**
 * A practice with devices in it.
 *
 * Thin on purpose: it is `aWorld` from the sync strand — one remote copy, one virtual clock, a
 * separate local database per device, which is the real topology — with the two things a
 * cross-strand test needs on top of it, namely key material and the shipped library.
 *
 * @param {{at?: string}} [options]
 */
export function aPractice(options = {}) {
  const world = aWorld(options);

  return {
    ...world,

    /**
     * A device that has signed in: its own database, its own device key store, and the data key
     * established through the guard — adopting the existing envelope if there is one, which is the
     * behaviour the two-device story rests on.
     *
     * @param {string} tag
     * @param {{seed?: boolean, hasEverSynchronised?: boolean}} [opts]
     */
    async signedInDevice(tag, opts = {}) {
      const dev = await world.device(tag);
      dev.deviceKeys = new InMemoryDeviceKeyStore();
      dev.establish = (over = {}) => establishKeyMaterial({
        remote: world.remote,
        deviceId: tag,
        deviceKeys: dev.deviceKeys,
        hasEverSynchronised: true,
        now: () => world.now(),
        // The REAL sink, not a collector: key events go into this device's own event log, through
        // the same append every other entry uses. A harness that handed the guard a spy would prove
        // the guard calls something, and prove nothing about whether a key event survives to disk.
        journal: (fields) => recordEvent(dev.store, fields),
        ...over,
      });

      if (opts.hasEverSynchronised !== false) {
        const established = await dev.establish();
        dev.dataKey = established.dataKey;
        dev.keyOutcome = established.outcome;
      }
      if (opts.seed !== false) await importSeed(dev.store, { now: world.now() });
      return dev;
    },
  };
}

/**
 * One synchronisation pass on a device. The trigger matters — there are six opportunities and
 * none of them is a background one — so it is named rather than defaulted invisibly.
 *
 * @param {any} dev @param {any} world @param {string} [trigger]
 */
export const sync = (dev, world, trigger = SYNC_TRIGGERS.MANUAL) => syncNow(dev.store, world.remote, {
  trigger, now: world.now(),
});

/**
 * Register a client whose clinical note is CIPHERTEXT before it ever reaches the store.
 *
 * Two steps rather than one, and that is how the application must do it too: the sealed value
 * binds the record's identity as additional authenticated data, so the identity has to exist
 * before the note can be sealed. A sealed value cannot be lifted from one record onto another,
 * which is the property that makes this ordering necessary rather than merely tidy.
 *
 * @param {any} dev
 * @param {any} world
 * @param {{name: string, notes?: string, note: string, label?: string, reference?: string}} args
 * @returns {Promise<{clientId: string, record: any}>}
 */
export async function registerClientWithNote(dev, world, args) {
  const created = await dev.store.create('client', aClient({
    name: args.name, notes: args.notes ?? '',
  }), { now: world.now() });
  const recordId = created.record_id;

  const ctx = (field) => ({ type: 'client', recordId, field });
  const [note, reference, label] = await Promise.all([
    sealField(dev.dataKey, ctx('clinical_note'), args.note),
    sealField(dev.dataKey, ctx('clinical_reference'), args.reference ?? 'file:///private/records/anon.pdf'),
    sealField(dev.dataKey, ctx('clinical_reference_label'), args.label ?? 'Notes A'),
  ]);

  const record = await dev.store.update('client', recordId, (content) => ({
    ...content,
    clinical_note: note,
    clinical_reference: reference,
    clinical_reference_label: label,
  }), { now: world.now() });

  return { clientId: recordId, record };
}

/**
 * A shipped routine, taken from the seed rather than invented, with its stored envelope.
 *
 * The session runner wants the routine record, and using a real shipped one is the point: a
 * fixture routine would prove the runner against content the coach will never see.
 *
 * @param {any} store
 */
export async function aShippedRoutine(store) {
  const [content] = seedContentFor('routine');
  const record = await store.getByContentKey('routine', content.id);
  if (!record) throw new Error(`the shipped routine ${content.id} is not in this store`);
  return record;
}

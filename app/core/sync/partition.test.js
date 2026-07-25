/**
 * PARTITIONING — the structural guarantee, tested as a structural guarantee.
 *
 * The claim is not "collisions are unlikely". It is that there is no shared writable object, so the
 * test that matters is the one asserting the areas stay disjoint while two devices write as hard as
 * they can. That test lives in `engine.test.js` where there are two real devices; this file holds the
 * naming rules it rests on, because a partition scheme is only as good as its ability to tell one
 * device's file from another's.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AREA_FILE_KINDS, NAMESPACE, RESERVED_DEVICE_TAGS, SNAPSHOT_NAME, WRITES_ONLY_ITS_OWN_AREA,
  areaFileName, areaPrefix, assertDeviceTag, groupByArea, isOwnArea, parseAreaFileName,
} from './partition.js';
import { SyncBoundaryError } from './errors.js';

const meta = (name, fileId = `f-${name}`) => ({
  file_id: fileId, space: 'visible', name, revision: 1, modified_at: '2026-07-25T09:00:00.000Z', size: 2,
});

describe('sync/partition — an area is a name prefix, and it is parsed rather than trusted', () => {
  it('gives each device a prefix of its own', () => {
    assert.equal(areaPrefix('coach-laptop'), `${NAMESPACE}.coach-laptop.`);
    assert.notEqual(areaPrefix('coach-laptop'), areaPrefix('coach-phone'));
  });

  it('puts the idempotency key in the name, as the outbox requires of a create', () => {
    const name = areaFileName('coach-phone', AREA_FILE_KINDS.PUSH, 'abc123');
    assert.equal(name, 'fit.coach-phone.push.abc123.json');
    assert.ok(name.includes('abc123'));
  });

  it('reads a name back into the device, the kind and the key', () => {
    assert.deepEqual(parseAreaFileName('fit.coach-laptop.state.k1.json'),
      { device: 'coach-laptop', kind: 'state', key: 'k1' });
  });

  it('refuses to read the shared snapshot as anybody’s area', () => {
    // If this returned a device, a caller could write into the one shared object believing it was
    // partitioned — which is the exact failure the partition exists to prevent.
    assert.equal(parseAreaFileName(SNAPSHOT_NAME), null);
  });

  it('does not mistake a foreign file for an area file', () => {
    for (const name of ['notes.txt', 'fit.json', 'fit.coach-laptop.json', 'fit.coach-laptop.push.json',
      'other.coach-laptop.push.k.json', 'fit.coach-laptop.unknown.k.json']) {
      assert.equal(parseAreaFileName(name), null, name);
    }
  });

  it('refuses a device tag that would collide with the shared snapshot', () => {
    for (const reserved of RESERVED_DEVICE_TAGS) {
      assert.throws(() => assertDeviceTag(reserved), SyncBoundaryError);
    }
  });

  it('refuses a device tag a name could not be parsed back out of', () => {
    for (const bad of ['Coach-Laptop', 'coach.laptop', 'ab', '', null, undefined, 'coach_laptop']) {
      assert.throws(() => assertDeviceTag(/** @type {any} */ (bad)), SyncBoundaryError, String(bad));
    }
  });

  it('groups a listing by area and keeps what it did not recognise', () => {
    const { areas, unrecognised } = groupByArea([
      meta('fit.coach-laptop.push.a.json'),
      meta('fit.coach-laptop.state.b.json'),
      meta('fit.coach-phone.push.c.json'),
      meta(SNAPSHOT_NAME),
      meta('holiday-photo.jpg'),
    ]);

    assert.deepEqual([...areas.keys()].sort(), ['coach-laptop', 'coach-phone']);
    assert.equal(areas.get('coach-laptop').length, 2);
    // The snapshot and the account holder's own file are reported, not silently dropped: a file we do
    // not recognise in a space we write into is a fact somebody may need.
    assert.deepEqual(unrecognised.map((m) => m.name).sort(), ['fit.snapshot.json', 'holiday-photo.jpg']);
  });

  it('knows its own area from somebody else’s', () => {
    assert.equal(isOwnArea('fit.coach-laptop.push.a.json', 'coach-laptop'), true);
    assert.equal(isOwnArea('fit.coach-phone.push.a.json', 'coach-laptop'), false);
    assert.equal(isOwnArea(SNAPSHOT_NAME, 'coach-laptop'), false);
  });

  it('declares that it writes only into its own area, rather than leaving an absent check', () => {
    // An absence is indistinguishable from an oversight to the next editor. This is a decision.
    assert.equal(WRITES_ONLY_ITS_OWN_AREA, true);
  });
});

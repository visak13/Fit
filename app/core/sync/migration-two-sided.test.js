/**
 * OLD READS NEW, AND NEW READS OLD — proven separately, because they fail separately.
 *
 * The coach has two installations and they update at different times. That is the NORMAL case here,
 * not an edge case, and it is why no envelope field may be added and no document version bumped
 * without both directions being shown to work. The cost of getting it wrong is not an error: an
 * envelope key an older reader does not recognise is REFUSED, `areas.js` catches the refusal per file
 * and skips the file, and until `withheld.js` existed the pass still reported a clean completion —
 * green on the older device while it held none of the newer one's work.
 *
 * `resolved_from` is the field that has to survive this, and `payload.js` carries the worked example:
 * it is the one envelope field OMITTED when it has nothing to say, so that every record which has
 * never answered a divergence goes out byte-identical to what a build without the field writes; and
 * `decodeDocument` normalises an absent value back to null at the boundary, so a reader never treats
 * missing as different from null.
 *
 * ## Why this file exists when `divergence-provenance.test.js` already looks at the same field
 *
 * That file asserts the SHAPE — that the key is absent from the encoded object, and that a decoded
 * record reads back as null. Both are true and neither is the property. The property is about a
 * READER: that a build which has never heard of this field accepts what this build writes. A shape
 * assertion cannot see the difference between "the key is absent" and "the key is absent AND the
 * other build would have accepted it anyway", because it never runs the other build.
 *
 * So the old reader is BUILT here, faithfully — its allow-list is this application's own envelope
 * field list with `resolved_from` removed, which is precisely what the list was before the field was
 * added — and it is pointed at real documents this build encodes. Each direction is one assertion
 * with its own failure, and each is shown FAILING for the right reason before it is believed.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import {
  ENVELOPE_FIELDS, createEnvelope, reviseEnvelope, validateEnvelope,
} from '../model/model.js';
import { CODES } from '../model/issues.js';
import { SPACES } from '../remote/remote.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { DOCUMENT_KINDS, DOCUMENT_VERSION, encodeDocument, decodeDocument } from './payload.js';
import { T0, aWorld } from './testing.js';

const SPACE = SPACES.VISIBLE;

/**
 * THE OLD BUILD'S ENVELOPE FIELD LIST — this one, minus the field under test.
 *
 * Derived rather than typed out, and that matters: a hand-copied list would go stale the next time an
 * envelope field is added, and would then quietly stop being the old build at all while still
 * passing. This is always "everything this build knows except the field whose migration is being
 * proven", which is what the previous build's list actually was.
 */
const OLD_ENVELOPE_FIELDS = Object.freeze(ENVELOPE_FIELDS.filter((f) => f !== 'resolved_from'));

/**
 * A reader from before the field existed.
 *
 * It does the one thing that makes this migration dangerous and nothing else: it refuses an envelope
 * carrying a key it does not know. That is not an invention for the test — `validateEnvelope` in this
 * build refuses unknown keys through `checkNoUnknownKeys`, and the build before it did the same
 * against the shorter list.
 *
 * @param {any} record
 * @returns {{ok: boolean, unknown: string[]}}
 */
function anOldBuildReads(record) {
  const unknown = Object.keys(record).filter((key) => !OLD_ENVELOPE_FIELDS.includes(key));
  return { ok: unknown.length === 0, unknown };
}

/** An ordinary record: created, edited, never involved in a divergence anybody answered. */
function anOrdinaryRecord() {
  const start = createEnvelope({
    type: 'client', content: aClient({ name: 'Never diverged' }), device: 'coach-laptop', now: T0,
  });
  return reviseEnvelope(start, aClient({ name: 'Never diverged, edited' }), {
    device: 'coach-laptop', now: T0,
  });
}

describe('sync/migration — OLD READS NEW', () => {
  it('an older build accepts every record this build writes, because the mark is omitted when there is none', () => {
    const record = anOrdinaryRecord();
    assert.equal(record.resolved_from, null, 'it has never answered a divergence');

    const [onTheWire] = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-laptop', records: [record], writtenAt: T0,
    })).records;

    // THE ASSERTION. Not "the key is absent" — an older BUILD, reading it, accepts it.
    const verdict = anOldBuildReads(onTheWire);
    assert.deepEqual(verdict.unknown, [],
      'a build that has never heard of resolved_from meets no key it would refuse, so its area read '
      + 'does not skip this file and its pass is not quietly holding none of our work');
    assert.equal(verdict.ok, true);
  });

  it('NON-VACUITY: the same old build genuinely REFUSES the key, so its acceptance means something', () => {
    // Without this, `anOldBuildReads` could be returning ok for everything — a scan that looked at
    // nothing is indistinguishable from a scan that found nothing.
    const answered = { ...anOrdinaryRecord(), resolved_from: 1 };
    const verdict = anOldBuildReads(answered);

    assert.equal(verdict.ok, false, 'the old build has teeth');
    assert.deepEqual(verdict.unknown, ['resolved_from'],
      'and it is THIS key it refuses, not something incidental about the fixture');

    // And this build refuses an unknown key the same way, which is why the old one did.
    const refused = validateEnvelope({ ...anOrdinaryRecord(), a_field_from_the_future: 1 });
    assert.equal(refused.ok, false);
    assert.ok(refused.issues.some((i) => i.code === CODES.UNKNOWN_FIELD),
      'an unrecognised envelope key is refused rather than ignored — that is the whole hazard');
  });

  it('BREAK PROBE: stop omitting the null and the older build refuses the file, for the stated reason', () => {
    // The guard is the `continue` in `outboundRecord`. Defeat it exactly as removing that line would,
    // and confirm the break LANDED — that the key really is on the wire now — before reading the
    // verdict, because a break that silently fails to apply reports all-green.
    const record = anOrdinaryRecord();
    const [proper] = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-laptop', records: [record], writtenAt: T0,
    })).records;
    const withoutTheOmission = { ...proper, resolved_from: record.resolved_from };

    assert.equal(Object.hasOwn(withoutTheOmission, 'resolved_from'), true,
      'THE BREAK LANDED: the key is present on the wire');
    assert.equal(withoutTheOmission.resolved_from, null, 'carrying nothing but a null');

    const verdict = anOldBuildReads(withoutTheOmission);
    assert.equal(verdict.ok, false,
      'and the older build now refuses the file over a field whose value says NOTHING — which is '
      + 'the whole reason the null is omitted rather than sent');
    assert.deepEqual(verdict.unknown, ['resolved_from']);
  });

  it('a mark that DOES say something still travels — the omission is for the null and nothing else', () => {
    const answered = { ...anOrdinaryRecord(), resolved_from: 1 };
    assert.equal(validateEnvelope(answered).ok, true);

    const [onTheWire] = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-laptop', records: [answered], writtenAt: T0,
    })).records;
    assert.equal(onTheWire.resolved_from, 1,
      'a mark that failed to travel would leave the other device asking a question he has answered');

    // The honest limitation, stated rather than left to be discovered: the handful of records he HAS
    // resolved are the ones an older build skips. That is the field doing its job — the population it
    // protects is every record he has never resolved, which is nearly all of them.
    assert.equal(anOldBuildReads(onTheWire).ok, false,
      'and the older build cannot read those, which is a known and bounded cost');
  });

  it('and the document version does NOT move, so an older build reads the file at all', () => {
    assert.equal(DOCUMENT_VERSION, 1,
      'an additive optional field is not a new document shape. Bumping the version would make EVERY '
      + 'file the newer device writes undecodable to the older one — the failure this whole pair of '
      + 'directions exists to prevent, arriving by way of the fix for it.');
  });
});

describe('sync/migration — NEW READS OLD', () => {
  it('this build reads a document written before the field existed, and normalises absent to null', () => {
    // Exactly what a build without the field writes: the key is not there at all.
    const legacy = anOrdinaryRecord();
    delete legacy.resolved_from;
    assert.equal(Object.hasOwn(legacy, 'resolved_from'), false, 'the fixture really is field-less');

    const text = encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [legacy], writtenAt: T0,
    });
    const back = decodeDocument(text);

    // THE ASSERTION. Null exactly, at the boundary — not undefined, not absent, not left for each
    // reader to remember, because a reader that remembers differently compares missing to null and
    // gets a different answer than its counterpart.
    assert.equal(Object.hasOwn(back.records[0], 'resolved_from'), true,
      'the key is PRESENT after decoding, so no reader downstream ever meets an absent one');
    assert.strictEqual(back.records[0].resolved_from, null);
    assert.notStrictEqual(back.records[0].resolved_from, undefined);
  });

  it('NON-VACUITY: the normalisation is doing it, not the fixture arriving with a null already', () => {
    // If `encodeDocument` were quietly writing `resolved_from: null` for a field-less record, the
    // assertion above would pass while `decodeDocument` did nothing at all.
    const legacy = anOrdinaryRecord();
    delete legacy.resolved_from;
    const [raw] = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [legacy], writtenAt: T0,
    })).records;

    assert.equal(Object.hasOwn(raw, 'resolved_from'), false,
      'ON THE WIRE the key is genuinely absent — so the null a reader sees was PUT there by '
      + 'decodeDocument, and this test is watching the normalisation rather than a fixture');
  });

  it('BREAK PROBE: without the normalisation, a reader meets undefined and missing stops meaning null', () => {
    const legacy = anOrdinaryRecord();
    delete legacy.resolved_from;
    const text = encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [legacy], writtenAt: T0,
    });

    // What a reader would hold if the boundary did not settle it: JSON.parse alone.
    const unnormalised = JSON.parse(text).records[0];
    assert.strictEqual(unnormalised.resolved_from, undefined, 'THE BREAK LANDED');

    // And the consequence, which is not hypothetical: this is the shape of the comparison
    // `areas.js` makes when it decides whether a clash has been answered.
    assert.equal(Number.isInteger(Number(unnormalised.resolved_from)), false);
    assert.equal(unnormalised.resolved_from === null, false,
      'a reader testing for null gets a different answer than its counterpart on the same record — '
      + 'which is exactly why absent is settled once, at the boundary, rather than by each reader');
    assert.strictEqual(decodeDocument(text).records[0].resolved_from, null, 'and the boundary settles it');
  });

  it('a field-less record survives a whole pass and is treated as never having answered anything', async () => {
    // The end-to-end half: not a decoded object in isolation, but a legacy record placed in another
    // device's area and pulled by this build through a real pass.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const legacy = anOrdinaryRecord();
    delete legacy.resolved_from;
    const document = JSON.parse(encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [legacy], writtenAt: world.now(),
    }));
    await world.remote.create(SPACE, {
      name: 'fit.coach-phone.state.legacy.json', content: JSON.stringify(document),
    });

    const union = await readUnion(world.remote, { space: SPACE });
    assert.deepEqual(union.unreadable, [],
      'a document from an older build is NOT skipped — if it were, this device would be the one '
      + 'showing green while holding none of the other\'s work');

    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL, now: world.now(),
    });
    assert.deepEqual(report.failures, []);
    assert.deepEqual(report.unreadable, []);
    assert.ok(report.completion, 'and the pass genuinely completes, because nothing was skipped');

    const held = await laptop.store.get('client', legacy.record_id);
    assert.equal(held?.content.name, 'Never diverged, edited', 'the record arrived');
    assert.strictEqual(held?.resolved_from, null,
      'and it is held as having answered nothing, which is what a record from before the field means');
  });
});

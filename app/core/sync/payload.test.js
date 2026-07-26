/**
 * WHAT LEAVES THE DEVICE — proved to be a whitelist rather than a search.
 *
 * The test that matters most here is the one demonstrating why a search cannot be the defence: a
 * provider response carries the coach's own address encoded inside an identifier segment, so a plain
 * search of the outgoing bytes for his address comes back CLEAN while it is sitting right there.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEnvelope } from '../model/model.js';
import { aClient, aSealedValue } from '../model/fixtures.js';
import { DELETION_MANIFEST_VERSION } from '../store/store.js';
import { SyncDocumentError, SyncPayloadRefused } from './errors.js';
import {
  DOCUMENT_KINDS, DOCUMENT_VERSION, REFUSED_BY_SHAPE_NOT_BY_SEARCH,
  decodeDocument, encodeDocument, outboundPurgeNotice, outboundRecord,
} from './payload.js';

const T0 = '2026-07-25T09:00:00.000Z';
const aClientRecord = (content = aClient()) => createEnvelope({
  type: 'client', content, device: 'coach-laptop', now: T0,
});

describe('sync/payload — a whitelist, and why it is not a blacklist', () => {
  it('rebuilds a record from the envelope’s declared fields', () => {
    const record = aClientRecord();
    const out = outboundRecord(record);
    // `resolved_from` is the ONE field omitted when it is null, so that a record the coach has never
    // resolved goes out byte-identical to what a build without that field writes. The reason is in
    // `payload.js`: an older device refuses an envelope key it does not know, `areas.js` catches
    // that per file and SKIPS the file, and the pass still reports a clean completion — so it would
    // show him green while holding none of the newer device's work. Decoding puts the null back, so
    // a record still round trips to itself; that is asserted below.
    const withoutTheMark = { ...record };
    delete withoutTheMark.resolved_from;
    assert.deepEqual(out, withoutTheMark);
    assert.equal(Object.hasOwn(out, 'resolved_from'), false, 'omitted, not sent as null');
    assert.notEqual(out, record, 'a new object, not the stored one');
  });

  it('rebuilds every OTHER declared field even when it is empty, null or false', () => {
    // The omission above is a deliberate, single exception. This is the assertion that stops it
    // spreading into "skip anything that looks empty", which would quietly stop sending a tombstone
    // flag or a deletion time and make a removal fail to cross the device boundary.
    const record = { ...aClientRecord(), deleted: false, deleted_at: null, resolved_from: 3, rev: 4 };
    const out = outboundRecord(record);
    for (const field of ['record_id', 'type', 'rev', 'device', 'deleted', 'deleted_at',
      'created_at', 'updated_at', 'resolved_from', 'content']) {
      assert.equal(Object.hasOwn(out, field), true, `${field} is rebuilt, whatever its value`);
    }
  });

  it('refuses a record carrying a field the content contract does not know', () => {
    const record = aClientRecord({ ...aClient(), htmlLink: 'https://example.test/x' });
    assert.throws(() => outboundRecord(record), SyncPayloadRefused);
  });

  it('a plain search for the coach’s address comes back CLEAN while the address is right there', () => {
    // This is the measured shape of the hazard, and the reason the defence is structural. The address
    // is inside an identifier segment, encoded — so it is genuinely present and genuinely unfindable.
    const address = 'coach@example.test';
    const encodedAddress = btoa(address).replace(/=+$/, '');
    const providerResponse = {
      kind: 'calendar#event',
      id: `evt_${encodedAddress}_2026`,
      htmlLink: 'https://example.test/event',
    };

    const bytes = JSON.stringify(providerResponse);
    assert.equal(bytes.includes(address), false, 'a search finds nothing');
    assert.equal(atob(encodedAddress), address, 'and yet it is there');

    // So the defence cannot be the search. It is that a record carrying this shape never gets built.
    const record = aClientRecord({ ...aClient(), provider: providerResponse });
    assert.throws(() => outboundRecord(record), SyncPayloadRefused);
    assert.equal(REFUSED_BY_SHAPE_NOT_BY_SEARCH, true);
  });

  it('moves ciphertext opaquely, without reading it', () => {
    const sealed = aSealedValue('c2VjcmV0LWNpcGhlcnRleHQ=');
    const record = aClientRecord({ ...aClient(), clinical_note: sealed });
    const out = outboundRecord(record);
    assert.deepEqual(out.content.clinical_note, sealed, 'passed through exactly as it arrived');

    const text = encodeDocument({
      kind: DOCUMENT_KINDS.PUSH, device: 'coach-laptop', records: [record], writtenAt: T0,
    });
    const back = decodeDocument(text);
    assert.deepEqual(back.records[0].content.clinical_note, sealed, 'and survives the round trip byte for byte');
  });

  it('refuses a record whose envelope does not conform', () => {
    assert.throws(() => outboundRecord({ record_id: 'not-a-uuid', type: 'client' }), SyncPayloadRefused);
  });

  it('rebuilds a purge notice as identities only', () => {
    const notice = outboundPurgeNotice({
      deletion_id: 'd1',
      manifest_version: DELETION_MANIFEST_VERSION,
      subject_client_id: 'c1',
      requested_at: T0,
      device: 'coach-laptop',
      status: 'pending',
      attempts: 0,
      last_error: null,
      propagated_at: null,
      removed: [{ type: 'client', record_id: 'c1' }],
      revised: [{ type: 'session', record_id: 's1', rev: 3 }],
      sweep: { archived_copies: true, remote_backups: true },
      // Something that must never travel, whatever upstream did.
      name: 'A. Client',
    });

    assert.equal(JSON.stringify(notice).includes('A. Client'), false,
      'a purge exists to leave no record of the client; its notice must not reintroduce one');
    assert.deepEqual(notice.removed, [{ type: 'client', record_id: 'c1' }]);
    assert.equal(notice.origin_device, 'coach-laptop');
  });

  it('refuses a manifest version it does not know how to send onward', () => {
    assert.throws(() => outboundPurgeNotice({
      deletion_id: 'd1', manifest_version: 99, subject_client_id: 'c1', requested_at: T0, device: 'd',
      removed: [], revised: [],
    }), SyncPayloadRefused);
  });
});

describe('sync/payload — reading one back', () => {
  it('round trips', () => {
    const record = aClientRecord();
    const text = encodeDocument({
      kind: DOCUMENT_KINDS.STATE, device: 'coach-phone', records: [record], writtenAt: T0, cursor: T0,
    });
    const document = decodeDocument(text);
    assert.equal(document.document_version, DOCUMENT_VERSION);
    assert.equal(document.kind, 'state');
    assert.equal(document.device, 'coach-phone');
    assert.deepEqual(document.records[0], record);
  });

  it('refuses a document from a newer version rather than reading it half-way', () => {
    const text = JSON.stringify({ document_version: DOCUMENT_VERSION + 1, records: [], purges: [] });
    assert.throws(() => decodeDocument(text, { name: 'fit.coach-phone.push.k.json' }), SyncDocumentError);
  });

  it('refuses text that is not a document at all', () => {
    assert.throws(() => decodeDocument('not json'), SyncDocumentError);
    assert.throws(() => decodeDocument('[]'), SyncDocumentError);
  });

  it('refuses a document holding a record with a broken envelope, and applies none of it', () => {
    const text = JSON.stringify({
      document_version: DOCUMENT_VERSION, kind: 'push', device: 'd', written_at: T0, cursor: null,
      records: [{ record_id: 'nope' }], purges: [],
    });
    assert.throws(() => decodeDocument(text), SyncDocumentError);
  });
});

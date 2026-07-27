/**
 * DELIVERY, AND THE THREE PATHS THAT DECIDE WHETHER THE COACH IS TOLD THE TRUTH.
 *
 * Capability present, capability absent, and the coach closing the sheet. The assertions that matter
 * are the negative ones — a fallback is never reported as a share, a cancellation is never reported
 * as a failure — because those are the two mistakes that cost him a client's chart without ever
 * looking like a fault.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  anchorDownload,
  deliverFile,
  describeDelivery,
  wasCancelled,
  type AnchorLike,
  type ShareRequest,
  type SharingSurface,
} from './share-delivery.ts';

const FILE = new File(['week'], 'Diet.csv', { type: 'text/csv' });

/** A download that remembers what it was given, or refuses. */
function aDownload(refuse?: Error) {
  const taken: File[] = [];
  return {
    taken,
    download(file: File) {
      if (refuse) throw refuse;
      taken.push(file);
    },
  };
}

/** A share sheet that accepts, refuses, or throws. */
function aSharingSurface(behaviour: {
  canShare?: (request: ShareRequest) => boolean;
  share?: (request: ShareRequest) => Promise<void>;
}): SharingSurface & { requests: ShareRequest[] } {
  const requests: ShareRequest[] = [];
  return {
    requests,
    canShare: behaviour.canShare,
    share: behaviour.share === undefined ? undefined : async (request) => {
      requests.push(request);
      await behaviour.share!(request);
    },
  };
}

test('CAPABILITY PRESENT: the file goes to the share sheet and nothing is downloaded', async () => {
  const download = aDownload();
  const sharing = aSharingSurface({ canShare: () => true, share: async () => {} });

  const delivery = await deliverFile(FILE, { sharing, download, title: 'Diet — week of 3 August' });

  assert.deepEqual(delivery, { outcome: 'shared' });
  assert.deepEqual(download.taken, [], 'a shared file is not also downloaded');
  assert.deepEqual(sharing.requests[0].files, [FILE]);
  assert.equal(sharing.requests[0].title, 'Diet — week of 3 August', 'the sheet is given the table\'s own title');
});

test('CAPABILITY ABSENT: no share sheet at all means a download, and it SAYS it was a download', async () => {
  const download = aDownload();
  const delivery = await deliverFile(FILE, { download });

  assert.equal(delivery.outcome, 'downloaded');
  assert.deepEqual(download.taken, [FILE]);
  assert.notEqual(delivery.outcome, 'shared');
  assert.match(describeDelivery(delivery, FILE.name), /saved to this device/);
});

test('a share sheet with no canShare cannot share FILES, whatever it can do with text', async () => {
  const download = aDownload();
  const delivery = await deliverFile(FILE, { sharing: aSharingSurface({ share: async () => {} }), download });

  assert.equal(delivery.outcome, 'downloaded');
  assert.deepEqual(download.taken, [FILE]);
});

test('a platform that DECLINES THIS FILE downloads it, and says which refusal it was', async () => {
  const download = aDownload();
  const delivery = await deliverFile(FILE, {
    sharing: aSharingSurface({ canShare: () => false, share: async () => {} }),
    download,
  });

  assert.equal(delivery.outcome, 'downloaded');
  assert.equal(delivery.outcome === 'downloaded' && delivery.because.includes('would not share this kind of file'), true);
  assert.deepEqual(download.taken, [FILE]);
});

test('a canShare that THROWS is a no, not a crash', async () => {
  const download = aDownload();
  const delivery = await deliverFile(FILE, {
    sharing: aSharingSurface({ canShare: () => { throw new Error('nope'); }, share: async () => {} }),
    download,
  });

  assert.equal(delivery.outcome, 'downloaded');
  assert.deepEqual(download.taken, [FILE]);
});

test('CANCELLATION IS NOT A FAILURE, and it is not a download either — he closed the sheet', async () => {
  const download = aDownload();
  const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
  const delivery = await deliverFile(FILE, {
    sharing: aSharingSurface({ canShare: () => true, share: async () => { throw abort; } }),
    download,
  });

  assert.deepEqual(delivery, { outcome: 'cancelled' });
  assert.deepEqual(download.taken, [], 'nothing is pushed onto him after he declined');

  const sentence = describeDelivery(delivery, FILE.name);
  assert.equal(sentence.toLowerCase().includes('error'), false, 'and he is not told something went wrong');
  assert.equal(sentence.toLowerCase().includes('could not'), false);
});

test('a genuine share failure falls back to a download and is NEVER reported as shared', async () => {
  const download = aDownload();
  const delivery = await deliverFile(FILE, {
    sharing: aSharingSurface({ canShare: () => true, share: async () => { throw new Error('sheet exploded'); } }),
    download,
  });

  assert.equal(delivery.outcome, 'downloaded');
  assert.equal(delivery.outcome === 'downloaded' && delivery.because.includes('sheet exploded'), true, 'the reason survives');
  assert.deepEqual(download.taken, [FILE]);
});

test('when NEITHER path works the coach is told plainly, and nothing pretends otherwise', async () => {
  const delivery = await deliverFile(FILE, { download: aDownload(new Error('disk is full')) });

  assert.equal(delivery.outcome, 'failed');
  assert.equal(delivery.outcome === 'failed' && delivery.because.includes('disk is full'), true);
  assert.match(describeDelivery(delivery, FILE.name), /could not be sent/);
});

test('deliverFile NEVER throws, whatever the platform does', async () => {
  const delivery = await deliverFile(FILE, {
    sharing: { share: () => { throw new Error('synchronous explosion'); }, canShare: () => true },
    download: aDownload(),
  });
  assert.notEqual(delivery.outcome, 'shared');
});

test('a cancellation is recognised by name and by wording, and an ordinary error is not', () => {
  assert.equal(wasCancelled(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(wasCancelled(new Error('The user aborted a request.')), true);
  assert.equal(wasCancelled(new Error('Share canceled')), true);
  assert.equal(wasCancelled(new Error('Permission denied')), false, 'a real failure is not read as a change of mind');
  assert.equal(wasCancelled('AbortError'), false);
  assert.equal(wasCancelled(null), false);
});

test('the words never call a fallback a delivery', () => {
  const shared = describeDelivery({ outcome: 'shared' }, 'Diet.csv');
  const downloaded = describeDelivery({ outcome: 'downloaded', because: 'because.' }, 'Diet.csv');

  assert.match(shared, /share sheet/);
  assert.equal(downloaded.includes('share sheet'), false, 'a download does not mention having been shared');
  assert.match(downloaded, /Diet\.csv was saved/);
});

test('the download runs through an anchor, and the object URL is released AFTER the click', () => {
  const clicks: string[] = [];
  const revoked: string[] = [];
  const deferred: (() => void)[] = [];
  const anchor: AnchorLike = { href: '', download: '', click() { clicks.push(`${this.href}|${this.download}`); } };

  const surface = anchorDownload(
    { createAnchor: () => anchor },
    { create: () => 'blob:the-url', revoke: (url) => revoked.push(url) },
    (release) => deferred.push(release),
  );

  surface.download(FILE);

  assert.deepEqual(clicks, ['blob:the-url|Diet.csv'], 'the file name is what the coach sees on disk');
  assert.deepEqual(revoked, [], 'revoking in the same turn as the click cancels the download on some browsers');

  deferred.forEach((release) => release());
  assert.deepEqual(revoked, ['blob:the-url'], 'and it is released, so the file is not pinned in memory');
});

test('the object URL is released even when the click fails', () => {
  const revoked: string[] = [];
  const deferred: (() => void)[] = [];
  const surface = anchorDownload(
    { createAnchor: () => ({ href: '', download: '', click() { throw new Error('no'); } }) },
    { create: () => 'blob:leaky', revoke: (url) => revoked.push(url) },
    (release) => deferred.push(release),
  );

  assert.throws(() => surface.download(FILE), /no/);
  deferred.forEach((release) => release());
  assert.deepEqual(revoked, ['blob:leaky']);
});

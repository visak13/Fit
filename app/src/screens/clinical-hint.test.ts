/**
 * ONCE MEANS ONCE, ASSERTED — including the side this fails towards when a browser will not remember.
 *
 * The hint is shown at the point of entry, gently, and then not again. Two things could go wrong and
 * only one of them is visible: showing it every visit is obvious and annoying, and never showing it
 * at all is invisible and is the failure that matters, because the sentence exists so that clinical
 * detail does not end up in the wrong box.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CLINICAL_HINT_ACKNOWLEDGED, CLINICAL_HINT_KEY, deviceMemory, hintIsStillDue,
  rememberHintAcknowledged,
} from './clinical-hint';
import type { HintStorage } from './clinical-hint';

/** Somewhere small to remember one fact, or a device that refuses to remember anything. */
function memory(initial?: string, refuse = false): HintStorage & { written: string[] } {
  const written: string[] = [];
  let value = initial ?? null;
  return {
    written,
    getItem() {
      if (refuse) throw new Error('storage is unavailable');
      return value;
    },
    setItem(_key: string, next: string) {
      if (refuse) throw new Error('storage is unavailable');
      value = next;
      written.push(next);
    },
  };
}

describe('the one-time hint', () => {
  it('is due on a device that has never been told', () => {
    assert.equal(hintIsStillDue(memory()), true);
  });

  it('is NOT due once he has acknowledged it, and stays that way', () => {
    const storage = memory();
    rememberHintAcknowledged(storage);

    assert.equal(hintIsStillDue(storage), false);
    assert.equal(hintIsStillDue(storage), false, 'it came back on the next visit');
    assert.deepEqual(storage.written, [CLINICAL_HINT_ACKNOWLEDGED]);
  });

  it('is remembered under one key, named once', () => {
    assert.equal(CLINICAL_HINT_KEY, 'fit.clients.clinical-hint-acknowledged');
  });

  it('is not confused by some other value sitting under its key', () => {
    assert.equal(
      hintIsStillDue(memory('something else entirely')),
      true,
      'a value this app did not write was read as an acknowledgement, so the note vanished unread',
    );
  });

  it('FAILS TOWARDS SHOWING when the browser refuses to be read', () => {
    assert.equal(
      hintIsStillDue(memory(undefined, true)),
      true,
      'a locked-down browser silently skipped the note. Showing it once more costs a moment; not '
        + 'showing it costs the reason it exists.',
    );
  });

  it('fails towards showing when there is no storage at all', () => {
    assert.equal(hintIsStillDue(null), true);
  });

  it('never turns a device that will not remember into an error in front of the coach', () => {
    assert.doesNotThrow(
      () => rememberHintAcknowledged(memory(undefined, true)),
      'he pressed acknowledge, and the note going away is the whole of what he asked for',
    );
    assert.doesNotThrow(() => rememberHintAcknowledged(null));
  });
});

describe('reaching this device\'s memory', () => {
  it('is null where the browser refuses access to its own storage, rather than throwing', () => {
    const hostile = {
      get localStorage() { throw new Error('blocked by policy'); },
    } as unknown as typeof globalThis;

    assert.doesNotThrow(() => deviceMemory(hostile));
    assert.equal(deviceMemory(hostile), null);
  });

  it('is null outside a browser, which is where this suite runs', () => {
    assert.equal(
      deviceMemory({} as unknown as typeof globalThis),
      null,
      'a module-scope read of localStorage would make every screen importing this unimportable here',
    );
  });
});

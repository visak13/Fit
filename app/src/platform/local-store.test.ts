/**
 * THE THREE STATES OF THE LOCAL STORE, PROVEN OUTSIDE A BROWSER.
 *
 * This is the first step in this application that opens the local database from the interface, and
 * the property it has to hold is not the happy path. The standing rule is that the application
 * ALWAYS OPENS AND ALWAYS WORKS: a database that refuses, a private window, a device with no room, a
 * schema written by a newer build — every one of them is a condition to REPORT, and none of them may
 * produce a blank screen, an error at start, or a spinner that never resolves.
 *
 * ## WHY THE OPENING LOGIC IS NOT INSIDE THE EFFECT
 *
 * A static render never runs an effect. Logic living inside one is therefore logic this suite cannot
 * reach, and "it works" would be a claim resting on nobody having tried it. So the sequence lives in
 * `beginOpening`, a plain function, and it is driven here against the core's OWN platform double —
 * the same in-process database the store's own gate runs on. The store that reaches the `open` state
 * below is a real `LocalStore`, opened, written to and closed.
 *
 * ## WHAT IS ASSERTED THAT A LOOK AT THE CODE WOULD NOT TELL YOU
 *
 *  1. The refusals are told apart, and the evidence they are told apart BY is checked against the
 *     core's own source, so a reworded sentence in `core/store/db.js` fails here rather than quietly
 *     degrading every refusal to the generic one.
 *  2. A store that arrives after the caller has gone is CLOSED. React invokes an effect twice in
 *     development; without this, the second opening is blocked by the first, by the application
 *     itself, and it would look like the coach having another window open.
 *  3. The device tag this application mints is ACCEPTED by the core, rather than merely being a
 *     string. `openLocalStore` refuses a tag under three characters, and a refusal there would take
 *     the whole store down on a device whose storage cannot remember one.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { browserPlatform, openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { LocalStoreNotice, LocalStoreProvider, useLocalStore } from './LocalStore.tsx';
import {
  DEVICE_TAG_KEY, STILL_OPENING, STILL_OPENING_WORDS, beginOpening, classifyOpeningFailure,
  describeOpeningFailure, deviceTag, mintDeviceId,
} from './local-store.ts';
import type { DeviceTagStorage, LocalStoreOpening } from './local-store.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

/** A real store on the core's own in-process double. Nothing here is a stub of the store itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aRealStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/** Somewhere small to remember one fact, or a device that refuses to remember anything. */
function fakeStorage(initial?: string, refuse = false): DeviceTagStorage & { written: string[] } {
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

/** Everything `beginOpening` published, in the order it published it. */
function recorder() {
  const seen: LocalStoreOpening[] = [];
  return { seen, publish: (opening: LocalStoreOpening) => void seen.push(opening) };
}

/** Let every already-resolved promise run. Nothing here waits on a clock. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('opening the local store', () => {
  it('reaches the OPEN state with a store that genuinely works', async () => {
    const store = await aRealStore();
    const { seen, publish } = recorder();

    beginOpening(async () => store, publish);
    await settle();

    assert.equal(seen.length, 1, 'one state was published, and it is the answer');
    assert.equal(seen[0].state, 'open');

    // Not merely a value with the right shape: the thing published is a store that can be written
    // to. A test satisfied by the shape would pass just as happily on a stub.
    assert.ok(seen[0].state === 'open');
    const client = await seen[0].store.create('client', {
      name: 'A. Client', notes: '', active: true,
    });
    assert.equal(await seen[0].store.count('client'), 1);
    assert.ok(typeof client.record_id === 'string' && client.record_id.length > 0);
  });

  it('reaches the COULD-NOT-OPEN state with words rather than an exception, and never throws', async () => {
    const { seen, publish } = recorder();

    // The genuine refusal, produced by the core rather than described: a browser with no local
    // database at all, which is what a private window with storage switched off looks like.
    assert.doesNotThrow(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beginOpening(async () => browserPlatform({ navigator: {} } as any) as never, publish);
    }, 'the opening threw at the call site, which on a real start is an error before the first frame');

    await settle();

    assert.equal(seen.length, 1);
    assert.ok(seen[0].state === 'unavailable');
    const { condition } = seen[0];
    assert.equal(condition.code, 'no-database');
    assert.ok(condition.headline.length > 0, 'the refusal has no heading');
    assert.ok(condition.whatToDo.length > 0, 'the refusal does not say what he can do about it');
    assert.ok(
      condition.verbatim !== null && condition.verbatim.includes('no local database'),
      'the browser\'s own words were discarded, and he may have to read them out',
    );
  });

  it('publishes NOTHING before the answer, so the interface can say "still opening" and mean it', async () => {
    const { seen, publish } = recorder();
    let release: (store: never) => void = () => {};
    beginOpening(() => new Promise((resolve) => { release = resolve as (store: never) => void; }), publish);

    await settle();
    assert.deepEqual(seen, [], 'a state was invented before the store had answered');
    assert.equal(STILL_OPENING.state, 'opening', 'and the state held until then is the honest one');

    release(await aRealStore() as never);
    await settle();
    assert.equal(seen.length, 1);
  });

  it('CLOSES a store that arrives after the caller has gone', async () => {
    const store = await aRealStore();
    let closed = false;
    const closing = store.close.bind(store);
    store.close = async () => {
      closed = true;
      await closing();
    };

    const { seen, publish } = recorder();
    const cancel = beginOpening(async () => store, publish);
    cancel();
    await settle();

    assert.deepEqual(seen, [], 'a state was published after the caller had gone');
    assert.ok(
      closed,
      'the store was left open with nobody holding it. React invokes an effect twice in development, '
        + 'so the next opening is then blocked by this application itself — and it reads to the coach '
        + 'as another window being open, which is a sentence this app would be telling him about '
        + 'itself.',
    );
  });

  it('CLOSES a store that was already open when the caller went away', async () => {
    const store = await aRealStore();
    let closed = false;
    const closing = store.close.bind(store);
    store.close = async () => {
      closed = true;
      await closing();
    };

    const { seen, publish } = recorder();
    const cancel = beginOpening(async () => store, publish);
    await settle();
    assert.equal(seen.length, 1, 'the store had not been published, so this proves nothing');

    cancel();

    assert.ok(
      closed,
      'the store the caller opened outlived the caller. It is the same leak as a store arriving '
        + 'late, by a slower route: nothing is left holding the connection, so nothing will ever '
        + 'close it, and the next version upgrade is blocked by this application itself.',
    );
  });

  it('publishes nothing after cancellation on the failing path either', async () => {
    const { seen, publish } = recorder();
    const cancel = beginOpening(async () => { throw new Error('refused'); }, publish);
    cancel();
    await settle();

    assert.deepEqual(seen, []);
  });
});

describe('telling the refusals apart', () => {
  /** One example of each, with the sentence it must be told apart INTO. */
  const REFUSALS = [
    { code: 'no-database', example: new Error('This browser has no local database, so nothing could be saved on this device.') },
    { code: 'another-window', example: new Error('Another window has this app open and is stopping the database from upgrading.') },
    { code: 'newer-build', example: new Error('The local database could not be opened: VersionError: The requested version is less than the existing version.') },
    { code: 'no-room', example: new Error('The local database could not be opened: QuotaExceededError: no space.') },
    { code: 'refused', example: new Error('The local database could not be opened: UnknownError: something else entirely.') },
  ] as const;

  for (const { code, example } of REFUSALS) {
    it(`recognises ${code}`, () => {
      assert.equal(classifyOpeningFailure(example), code);
    });
  }

  it('gives each one DIFFERENT words, because the coach can do a different thing about each', () => {
    const said = REFUSALS.map(({ example }) => describeOpeningFailure(example));

    assert.equal(
      new Set(said.map((condition) => condition.headline)).size,
      REFUSALS.length,
      'two refusals share a heading, so one of them is being told the wrong thing to do',
    );
    assert.equal(new Set(said.map((condition) => condition.whatToDo)).size, REFUSALS.length);

    for (const condition of said) {
      assert.ok(condition.whatHappened.length > 0, `${condition.code} does not say what happened`);
      assert.ok(
        !condition.headline.includes('Error') && !condition.headline.includes('Exception'),
        `${condition.code} puts the machinery in the heading, which is the one place it may not go`,
      );
    }
  });

  it('says something true of anything when the browser gives a reason this app does not know', () => {
    const condition = describeOpeningFailure({ nothing: 'recognisable' });
    assert.equal(condition.code, 'refused');
    assert.ok(condition.whatToDo.length > 0);
  });

  it('survives being handed nothing at all', () => {
    const condition = describeOpeningFailure(undefined);
    assert.equal(condition.code, 'refused');
    assert.equal(condition.verbatim, null, 'there were no words, so none are invented');
  });

  /**
   * THE EVIDENCE THIS CLASSIFICATION RESTS ON, CHECKED AGAINST ITS SOURCE.
   *
   * Two of the five are told apart by sentences that `core/store/db.js` and `core/store/platform.js`
   * write, and this step may not change a file under the core. A reworded sentence there would not
   * break anything loudly: every refusal would quietly become the generic one, and the coach would
   * be told to reload when what he needed was to close his other window. So the substrings are
   * asserted to still be in the core's own source.
   */
  it('is matching on sentences the core actually still writes', async () => {
    const db = await readFile(path.join(here, '..', '..', 'core', 'store', 'db.js'), 'utf8');
    const platform = await readFile(path.join(here, '..', '..', 'core', 'store', 'platform.js'), 'utf8');

    assert.ok(
      platform.includes('no local database'),
      'core/store/platform.js no longer says "no local database", so a browser that cannot store '
        + 'anything is now reported to the coach as a generic refusal telling him to reload',
    );
    assert.ok(
      db.includes('Another window'),
      'core/store/db.js no longer says "Another window", so a blocked upgrade now tells the coach to '
        + 'reload rather than to close the window that is actually holding it',
    );
    assert.ok(
      db.includes('${describeError(request.error)}'),
      'core/store/db.js no longer embeds the platform\'s own error name in the message it throws, '
        + 'which is the only evidence a version clash can be told apart from a full disk by',
    );
  });
});

describe('this device\'s tag', () => {
  it('is minted once and then remembered, so the same device stays the same device', () => {
    const storage = fakeStorage();
    const first = deviceTag({ storage, formFactor: 'desktop' });
    const second = deviceTag({ storage, formFactor: 'desktop' });

    assert.equal(first, second, 'the device was given a new identity on the second start');
    assert.equal(storage.written.length, 1, 'it was written more than once');
    assert.ok(first.startsWith('desktop-'), 'the tag says what kind of device this is');
  });

  it('still produces one on a device that refuses to remember anything', () => {
    const tag = deviceTag({ storage: fakeStorage(undefined, true), formFactor: 'mobile' });

    assert.ok(
      tag.length >= 3,
      'a browser that will not remember a small fact took the whole local store down with it, which '
        + 'turns a cosmetic problem into the one outcome this application may not have',
    );
  });

  it('is ACCEPTED by the core, which is the only thing that makes it a tag rather than a string', async () => {
    const { platform } = createLaptop();
    const store = await openLocalStore({
      platform,
      device: deviceTag({ storage: fakeStorage(undefined, true), formFactor: 'unknown' }),
    });
    opened.push(store);

    assert.equal(await store.count('client'), 0, 'the store opened with the tag this app mints');
  });

  it('keeps a tag this device was already given rather than replacing it', () => {
    const storage = fakeStorage('desktop-abcdefabcdef');
    assert.equal(deviceTag({ storage, formFactor: 'mobile' }), 'desktop-abcdefabcdef');
    assert.deepEqual(storage.written, [], 'an existing identity was overwritten');
  });

  it('is remembered under one key, named once', () => {
    assert.equal(DEVICE_TAG_KEY, 'fit.device-tag');
  });

  it('mints something long enough to be worth having', () => {
    const id = mintDeviceId(() => 0.5);
    assert.ok(id.length >= 12, 'a shorter identity than this makes a clash between two devices likely');
  });
});

describe('the store, made available to the screens', () => {
  it('THROWS outside its provider rather than inventing a state', () => {
    const Consumer = () => createElement('p', null, useLocalStore().state);

    assert.throws(
      () => renderToStaticMarkup(createElement(Consumer)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /the local store is not wired/);
        return true;
      },
      'a screen outside the provider rendered something, which means an unwired screen looks like a '
        + 'working one',
    );
  });

  it('renders its children in every one of the three states', async () => {
    const store = await aRealStore();
    const states: LocalStoreOpening[] = [
      STILL_OPENING,
      { state: 'open', store },
      { state: 'unavailable', condition: describeOpeningFailure(new Error('QuotaExceededError: no space')) },
    ];

    for (const opening of states) {
      const html = renderToStaticMarkup(
        createElement(LocalStoreProvider, {
          opening,
          children: createElement(() => createElement('p', null, useLocalStore().state)),
        }),
      );
      assert.ok(html.includes(opening.state), `the ${opening.state} state did not reach the screen`);
    }
  });
});

describe('the notice a screen shows when there is no store', () => {
  it('says nothing at all when the store is open', async () => {
    const html = renderToStaticMarkup(
      createElement(LocalStoreNotice, { opening: { state: 'open', store: await aRealStore() } }),
    );
    assert.equal(html, '', 'the notice drew something on a screen that has a working store');
  });

  it('says the app is still opening, rather than showing a spinner that says nothing', () => {
    const html = renderToStaticMarkup(createElement(LocalStoreNotice, { opening: STILL_OPENING }));
    assert.ok(html.includes(STILL_OPENING_WORDS), 'the waiting state has no words on it');
  });

  it('says what is wrong, what to do, and keeps the browser\'s own words separately', () => {
    const condition = describeOpeningFailure(
      new Error('The local database could not be opened: QuotaExceededError: no space.'),
    );
    const html = renderToStaticMarkup(
      createElement(LocalStoreNotice, { opening: { state: 'unavailable', condition } }),
    );

    assert.ok(html.includes(condition.headline));
    assert.ok(html.includes(condition.whatHappened));
    assert.ok(html.includes(condition.whatToDo));
    assert.ok(
      condition.verbatim !== null && html.includes('QuotaExceededError'),
      'the browser\'s own words are not on the screen anywhere, and he may have to read them out',
    );
    assert.ok(
      html.indexOf(condition.headline) < html.indexOf('QuotaExceededError'),
      'the machinery is above the sentence, which makes the exception the headline',
    );
  });
});

/**
 * THE REGISTER'S READS AND ITS ONE WRITE, DRIVEN AGAINST A REAL STORE.
 *
 * Nothing here is a stub of the store. Every test opens the core's own in-process database — the same
 * one the store's own gate runs on — creates real client records through the real schema, and asks
 * the real queries. A suite satisfied by a shape would pass just as happily against a mock that had
 * quietly stopped agreeing with the record model.
 *
 * ## THE ONE PROPERTY THAT MATTERS MOST HERE
 *
 * **A client he has just added is on the register when he looks.** If the list does not re-read after
 * the write, the screen has lied to him about the one thing he came here to do, and it lies in the
 * direction where he adds the person again. That is proven by READING THE REGISTER BACK from the
 * store, never by inspecting the code that was supposed to do it.
 *
 * ## AND THE ONE THAT IS A DEPENDENCY RATHER THAN A BEHAVIOUR
 *
 * `hasEverSynchronised` reads the persisted last-completed-sync, and NOTHING IN THIS BUILD WRITES
 * ONE — `recordCompletedSync` has no production caller, which is the unwired sync-to-accountability
 * join S16 owns. That is true today, it is why the protected field says what it says, and it is
 * asserted below rather than left in prose, so the day the join lands this suite says so.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { LAST_SYNC_META_KEY } from '../../core/status/status.js';
import {
  FIRST_PAGE, REGISTER_PAGE_LIMIT, appendPage, archiveOnRegister, hasEverSynchronised, readRegister,
  readRegisterPage, registerClient, removeClientForGood, restoreOnRegister,
} from './client-register-source';
// THE SEAM'S OWN READ, and this file now calls it directly. The register used to wrap it in a
// `readRegisterRemovals` of its own, from the days when the seam could not refresh; the wrapper is
// gone and the surface the register reads is the seam. What these tests assert is unchanged: what
// is waiting on the store after a real write. See `client-register-source.ts` for the convergence.
import { readPendingRemovals as readRegisterRemovals } from '../shell/removals-source';
import type { RemovalsPage } from './removals';
import { EMPTY_DRAFT } from './clients';
import type { RegisterPage } from './clients';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(here, '..', '..', 'core');

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aRealStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/** Names invented and deliberately unmistakable: this repository is public by an explicit decision. */
const draft = (name: string, over: { notes?: string; adaptationFlag?: string } = {}) => ({
  ...EMPTY_DRAFT,
  name,
  ...over,
});

/** Let every already-resolved promise run. Nothing here waits on a clock. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('reading the register', () => {
  it('is empty on a device nobody has been added to, and says so as a fact rather than a failure', async () => {
    const page = await readRegisterPage(await aRealStore());

    assert.deepEqual(page.items, []);
    assert.equal(page.done, true, 'an empty register was reported as having more to come');
  });

  it('reads people back in name order, with the session count beside each', async () => {
    const store = await aRealStore();
    await registerClient(store, draft('Test Person Beta'));
    await registerClient(store, draft('Test Person Alpha'));

    const page = await readRegisterPage(store);

    assert.deepEqual(
      page.items.map((entry) => entry.client.content.name),
      ['Test Person Alpha', 'Test Person Beta'],
      'the register is walked over the name index, so it arrives in the order a person reads',
    );
    assert.deepEqual(
      page.items.map((entry) => entry.sessionCount),
      [0, 0],
      'a new client has done no sessions, which is a state rather than a missing number',
    );
  });

  it('leaves archived clients OUT of the ordinary path, and brings them back when asked', async () => {
    const store = await aRealStore();
    const away = await registerClient(store, draft('Test Person Archived'));
    await registerClient(store, draft('Test Person Active'));
    await store.update('client', away.record_id, (content: Record<string, unknown>) => ({
      ...content, active: false,
    }));

    const ordinary = await readRegisterPage(store, FIRST_PAGE);
    assert.deepEqual(
      ordinary.items.map((entry) => entry.client.content.name),
      ['Test Person Active'],
      'an archived client is on the ordinary list, which is the list of people he currently trains',
    );

    const all = await readRegisterPage(store, { includeArchived: true, after: null });
    assert.equal(
      all.items.length,
      2,
      'archived clients are REACHABLE rather than hidden, and this is the way to them',
    );
  });

  it('publishes what it read, and drops a page that arrives after the caller has gone', async () => {
    const store = await aRealStore();
    await registerClient(store, draft('Test Person One'));

    const published = await new Promise<RegisterPage>((resolve) => {
      readRegister(store, FIRST_PAGE, resolve);
    });
    assert.equal(published.items.length, 1);

    const late: RegisterPage[] = [];
    const cancel = readRegister(store, FIRST_PAGE, (page) => void late.push(page));
    cancel();
    // The SAME work, awaited: by the time an identical read has finished, the cancelled one has had
    // every chance to publish. Counting microtasks would be guessing at a database's own scheduling.
    await readRegisterPage(store, FIRST_PAGE);
    await settle();

    assert.deepEqual(late, [], 'a page arrived after the screen had gone and was set on it anyway');
  });

  it('publishes NOTHING when the read fails, rather than the reassuring empty answer', async () => {
    const broken = {
      read: async () => { throw new Error('the database went away'); },
    } as never;

    const seen: RegisterPage[] = [];
    readRegister(broken, FIRST_PAGE, (page) => void seen.push(page));
    // The same failing work, awaited to its rejection, so the fire-and-forget read above has run out.
    await readRegisterPage(broken, FIRST_PAGE).then(() => null, () => null);
    await settle();

    assert.deepEqual(
      seen,
      [],
      'a failed read published an empty page, which tells a coach with forty clients that he has '
        + 'none, on the strength of never having looked',
    );
  });
});

describe('adding a client', () => {
  it('IS ON THE REGISTER WHEN HE LOOKS — proven by reading it back, not by inspection', async () => {
    const store = await aRealStore();

    const before = await readRegisterPage(store);
    assert.equal(before.items.length, 0);

    await registerClient(store, draft('Test Person One'));

    const after_ = await readRegisterPage(store);
    assert.deepEqual(
      after_.items.map((entry) => entry.client.content.name),
      ['Test Person One'],
      'the person he just added is not on the register he is looking at. That is the screen lying '
        + 'about the one thing he came here to do, and it lies in the direction where he adds them '
        + 'twice.',
    );
  });

  it('resolves only once the write has COMMITTED, so nothing is called saved before it is', async () => {
    const store = await aRealStore();
    const created = await registerClient(store, draft('Test Person One'));

    assert.ok(typeof created.record_id === 'string' && created.record_id.length > 0);
    assert.equal(
      await store.count('client'),
      1,
      'the create resolved before the record was in the database',
    );
  });

  it('trims the edges of a name and of a flag, and keeps notes exactly as he typed them', async () => {
    const store = await aRealStore();
    const created = await registerClient(store, {
      name: '  Test Person One  ',
      notes: 'line one\nline two\n',
      adaptationFlag: '  knee injury, avoid deep squats  ',
    });

    assert.equal(created.content.name, 'Test Person One');
    assert.equal(created.content.adaptation_flag, 'knee injury, avoid deep squats');
    assert.equal(
      created.content.notes,
      'line one\nline two\n',
      'the shape of his paragraph is his, and tidying it is this app having an opinion about it',
    );
  });

  it('OMITS the flag entirely when he left it blank, rather than recording an empty answer', async () => {
    const store = await aRealStore();
    const created = await registerClient(store, draft('Test Person One', { adaptationFlag: '   ' }));

    assert.ok(
      created.content.adaptation_flag === undefined || created.content.adaptation_flag === null,
      'an empty flag was written as an answer. The field is optional, and "he left it blank" and '
        + '"he answered with nothing" are different facts.',
    );
  });

  it('lets the RECORD refuse, rather than refusing first and inventing its own words', async () => {
    const store = await aRealStore();

    const refused = await registerClient(store, draft('   '))
      .then(() => null, (error: unknown) => error);

    assert.ok(refused !== null, 'a name of nothing but spaces was accepted');
    assert.ok(
      Array.isArray((refused as { issues?: unknown }).issues),
      'the failure carries no issues, so this was not the record refusing — something in front of it '
        + 'refused first, and the coach is about to be shown a sentence the record never wrote',
    );
  });
});

describe('archiving and restoring, which is the ordinary path', () => {
  it('takes an archived client off the register and keeps everything of theirs', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person One', {
      notes: 'training for a half marathon',
      adaptationFlag: 'knee injury, avoid deep squats',
    }));

    await archiveOnRegister(store, person.record_id);

    const ordinary = await readRegisterPage(store, FIRST_PAGE);
    assert.deepEqual(ordinary.items, [], 'an archived client is still on the ordinary register');

    const all = await readRegisterPage(store, { includeArchived: true, after: null });
    assert.equal(all.items.length, 1, 'an archived client is REACHABLE, never gone');
    assert.equal(
      all.items[0].client.content.notes,
      'training for a half marathon',
      'archiving took his notes with it. It is the reversible path precisely because it keeps the '
        + 'history; a version that quietly dropped anything would be a deletion wearing a kinder word.',
    );
    assert.equal(all.items[0].client.content.adaptation_flag, 'knee injury, avoid deep squats');
  });

  it('brings them back, and back onto the ordinary register', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person One'));

    await archiveOnRegister(store, person.record_id);
    await restoreOnRegister(store, person.record_id);

    const ordinary = await readRegisterPage(store, FIRST_PAGE);
    assert.deepEqual(
      ordinary.items.map((entry) => entry.client.content.name),
      ['Test Person One'],
      'restore is what makes archive reversible, and a coach who archived somebody by mistake has '
        + 'no other way back',
    );
  });

  it('leaves no removal waiting, because archiving removes nothing from anywhere', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person One'));
    await archiveOnRegister(store, person.record_id);

    const page = await new Promise<RemovalsPage>((resolve) => {
      readRegisterRemovals(store, resolve);
    });

    assert.deepEqual(
      page.items,
      [],
      'archiving wrote a removal notice. It would then be delivered to the backup, and the client '
        + 'he only put away would be destroyed there.',
    );
  });
});

describe('removing a client for good', () => {
  it('takes them off the register even when archived clients are included', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person One'));
    const staying = await registerClient(store, draft('Test Person Two'));

    await removeClientForGood(store, person.record_id);

    const all = await readRegisterPage(store, { includeArchived: true, after: null });
    assert.deepEqual(
      all.items.map((entry) => entry.client.record_id),
      [staying.record_id],
      'a removed client is still findable, so the removal was an archive wearing a harsher word',
    );
  });

  /**
   * THE MANIFEST IS THE THING THAT LEAVES THIS DEVICE, and it carries identities and no content of
   * any kind. This is asserted against the SERIALISED manifest rather than field by field: a field
   * check passes happily while a new field somebody added carries the name.
   */
  it('leaves a removal notice holding no name, no notes and no flag', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person Unmistakable', {
      notes: 'a distinctive note nobody else would write',
      adaptationFlag: 'a distinctive flag',
    }));

    const notice = await removeClientForGood(store, person.record_id);
    const serialised = JSON.stringify(notice);

    assert.equal(notice.subject_client_id, person.record_id);
    assert.equal(notice.status, 'pending', 'a removal was born already confirmed gone from a backup nothing has looked at');
    for (const secret of ['Test Person Unmistakable', 'a distinctive note nobody else would write', 'a distinctive flag']) {
      assert.ok(
        !serialised.includes(secret),
        `the removal notice carries "${secret}". It is the record that gets synchronised, so a `
          + 'manifest naming the client reintroduces exactly what the purge removed — and then '
          + 'sends it.',
      );
    }
  });

  /**
   * THE PROPERTY THE REGISTER'S NOTICE IS BUILT ON, read back from the store rather than assumed.
   *
   * A removal is done on this device and NOT confirmed gone from the backup, and it stays that way
   * until a synchronisation pass reads the area back — which nothing in this build does. So a
   * removal made here is still waiting when the register looks, which is precisely what the register
   * has to tell him.
   */
  it('is waiting to be confirmed gone the moment it is made, and the register can read it', async () => {
    const store = await aRealStore();
    const person = await registerClient(store, draft('Test Person One'));

    const before = await new Promise<RemovalsPage>((resolve) => {
      readRegisterRemovals(store, resolve);
    });
    assert.deepEqual(before.items, [], 'something was already waiting on a device nobody removed anybody from');

    await removeClientForGood(store, person.record_id);

    const after_ = await new Promise<RemovalsPage>((resolve) => {
      readRegisterRemovals(store, resolve);
    });
    assert.deepEqual(
      after_.items.map((item) => item.subject_client_id),
      [person.record_id],
      'the removal he just made is not waiting anywhere the register can see it, so the register '
        + 'would tell him every removal is confirmed gone from his backup — the exact belief the '
        + 'core opens by naming',
    );
  });

  it('refuses an identity that is not there, and says so rather than reporting a success', async () => {
    const store = await aRealStore();

    const refused = await removeClientForGood(store, 'no-such-client')
      .then(() => null, (error: unknown) => error);

    assert.ok(refused !== null, 'removing somebody who is not there was reported as done');
  });
});

describe('joining one page to the next', () => {
  const page = (items: readonly string[], cursor: string | null, done: boolean): RegisterPage => ({
    items: items.map((name) => ({
      client: { record_id: name, content: { name, notes: '', active: true } },
      sessionCount: 0,
    })),
    cursor,
    done,
  });

  it('keeps everybody already on screen and adds the newcomers after them', () => {
    const joined = appendPage(page(['a', 'b'], 'b', false), page(['c'], null, true));
    assert.deepEqual(joined.items.map((entry) => entry.client.content.name), ['a', 'b', 'c']);
  });

  it('takes the cursor and the end marker from the NEWER read, never the older', () => {
    const joined = appendPage(page(['a'], 'a', false), page(['b'], 'b', false));
    assert.equal(joined.cursor, 'b', 'the older cursor would ask for the same page for ever');
    assert.equal(joined.done, false);

    const finished = appendPage(page(['a'], 'a', false), page(['b'], null, true));
    assert.equal(finished.done, true, 'the register goes on claiming there is more when there is not');
  });
});

describe('whether this device has ever synchronised', () => {
  it('is FALSE on a device that has never backed anything up', async () => {
    assert.equal(await hasEverSynchronised(await aRealStore()), false);
  });

  it('is false, not a throw, when the store cannot answer at all', async () => {
    const broken = { getMeta: async () => { throw new Error('gone'); } } as never;
    assert.equal(
      await hasEverSynchronised(broken),
      false,
      'the safe direction is refusing a clinical note that might have been allowed, never allowing '
        + 'one that should have been refused',
    );
  });

  it('does not believe a completion that was not genuinely earned', async () => {
    const store = await aRealStore();
    // A hand-built row, which is exactly what `core/status/completion.js` refuses to treat as a
    // completion: only a flush that really drained the queue can produce one.
    await store.setMeta(LAST_SYNC_META_KEY, { completed_sync_at: 'not a time at all' });

    assert.equal(
      await hasEverSynchronised(store),
      false,
      'a made-up backup time was accepted, and the protected field would tell him this device is '
        + 'connected on the strength of it',
    );
  });

  /**
   * THE DEPENDENCY, ASSERTED SO THE PROSE CANNOT ROT.
   *
   * Today nothing writes a completion: `recordCompletedSync` has no production caller, which is the
   * unwired sync-to-accountability join S16 owns. So this function answers false on every device,
   * for a reason that lives outside this step. When S16 wires it, THIS TEST FAILS — which is the day
   * `client-register-source.ts` and the protected field's sentences must be re-read rather than
   * assumed still true.
   *
   * It is an absence-scan, so the same scanner is pointed at a known positive in the same run.
   */
  it('has no production writer yet, and this fails the day the join lands', async () => {
    const sources: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'testing') continue;
          // eslint-disable-next-line no-await-in-loop
          await walk(full);
        } else if (entry.name.endsWith('.js') && !entry.name.includes('.test.')) {
          sources.push(full);
        }
      }
    };
    await walk(coreRoot);

    assert.ok(sources.length > 20, 'the walk found almost no core sources, so it is looking in the wrong place');

    const reads: string[] = [];
    const writes: string[] = [];
    for (const file of sources) {
      // eslint-disable-next-line no-await-in-loop
      const text = await readFile(file, 'utf8');
      const relative = path.relative(coreRoot, file).split(path.sep).join('/');
      if (relative === 'status/completion.js' || relative === 'status/status.js') continue;
      if (text.includes('readLastCompletedSync')) reads.push(relative);
      if (text.includes('recordCompletedSync')) writes.push(relative);
    }

    // THE KNOWN POSITIVE. `core/status/surface.js` genuinely reads the completion, so a scanner
    // that reports nothing here is broken and its silence about the writer means nothing.
    assert.ok(
      reads.includes('status/surface.js'),
      'this scan cannot find a call it is standing on top of, so it is dead and the result below is '
        + 'evidence of nothing',
    );

    assert.deepEqual(
      writes,
      [],
      'something now records a completed synchronisation. That is the join S16 owns, and it is good '
        + 'news — but it means hasEverSynchronised can finally answer TRUE, so the protected field\'s '
        + 'sentences in clients.ts have to be re-read rather than assumed still right, and this test '
        + 'rewritten to assert the writer instead of its absence.',
    );
  });
});

describe('the page size', () => {
  it('is the core\'s own default, named rather than left implicit', () => {
    assert.equal(
      REGISTER_PAGE_LIMIT,
      25,
      'the screen tells him "there are more than these" off the back of this number, so a silent '
        + 'change to it changes what he is told',
    );
  });
});

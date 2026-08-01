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
 * ## AND THE ONE THAT WAS A DEPENDENCY AND HAS BECOME A BEHAVIOUR
 *
 * `hasEverSynchronised` reads the persisted last-completed-sync, and THE JOIN THAT WRITES ONE NOW
 * EXISTS: `src/shell/sync-runner.ts` hands a live pass's report to `recordCompletedSync`. So this
 * function can finally answer TRUE, and the window it opened — synchronisation working while the
 * register still tells the coach he is not connected — is closed by the persisted record rather
 * than by anything asserting it is.
 *
 * That is proven BELOW BY CONSEQUENCE, not by reading the wire: a protected clinical note is
 * refused before a pass, a real pass is run over a real store, and the same note is then sealed,
 * written and read back. Reading the wire and concluding it must work is the reasoning that left
 * the join unbuilt while every component was individually correct.
 *
 * The absence-scan that used to guard this prose is now a POSITIVE assertion on the writer,
 * wherever it lives, for the reason recorded at the test itself.
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
import { InMemoryDeviceKeyStore } from '../../core/crypto/device-key-store.js';
import { establishKeyMaterial } from '../../core/crypto/guard.js';
import { openField, sealField } from '../../core/crypto/sealing.js';
import { NotConnectedYet } from '../../core/crypto/errors.js';
import { InMemoryRemoteStorage } from '../../core/remote/remote.js';
import { SYNC_TRIGGERS } from '../../core/sync/sync.js';
import { runSyncPass } from '../shell/sync-runner.ts';
import { describeClinicalField } from './clients';
import { backupHistoryOf } from './backup-history';
import {
  FIRST_PAGE, REGISTER_PAGE_LIMIT, appendPage, archiveOnRegister, hasEverSynchronised, readRegister,
  readRegisterPage, registerClient, removeClientForGood, restoreOnRegister,
} from './client-register-source';
// THE SEAM'S OWN READ, and this file now calls it directly. The register used to wrap it in a
// `readRegisterRemovals` of its own, from the days when the seam could not refresh; the wrapper is
// gone and the surface the register reads is the seam. What these tests assert is unchanged: what
// is waiting on the store after a real write. See `client-register-source.ts` for the convergence.
import { readPendingRemovals as readRegisterRemovals } from '../shell/removals-source';
import type { PendingRemovalsOutcome } from '../shell/removals-source';
import type { RemovalsPage } from './removals';
import { EMPTY_DRAFT } from './clients';
import type { RegisterPage } from './clients';

/**
 * The pending page, from the seam's own read.
 *
 * The read publishes ONE OF THREE OUTCOMES since s11/a18 — not-yet, failed, read — because a failure
 * that published nothing left the seam at its empty literal and the screen then said every removal
 * was confirmed gone from a backup nothing had looked at. These tests are about what is WAITING
 * after a real write, so a failure here is a fault in the fixture and is raised rather than folded
 * into an empty page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pendingPage(store: any): Promise<RemovalsPage> {
  const outcome = await new Promise<PendingRemovalsOutcome>((resolve) => {
    readRegisterRemovals(store, resolve);
  });
  if (outcome.status !== 'read') {
    throw new Error(`the pending read failed in a test that assumes it succeeds: ${outcome.failure.stage}`);
  }
  return outcome.page;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');
const coreRoot = path.join(applicationRoot, 'core');
/** The shell tree. The join landed HERE, which is the whole reason the scan below walks both. */
const shellRoot = path.join(applicationRoot, 'src');

/** What a source file looks like in each tree: plain ECMAScript in the core, typed in the shell. */
const SOURCE_SUFFIXES = ['.js', '.ts', '.tsx'];

/**
 * The file with its comments removed, because A CALL IN A COMMENT IS NOT A CALL.
 *
 * This is not fastidiousness. `core/status/status.js` carries a usage EXAMPLE in its header — an
 * import line and a call, both in prose — and `src/App.tsx` describes the join in a sentence. A bare
 * text scan counts all three as writers and is wrong about every one of them. Whether a comment
 * counts as evidence is precisely the question this file's guard exists to answer correctly.
 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Does this file IMPORT the symbol AND CALL it — in code rather than in a sentence?
 *
 * Both halves are required: an import with no call is a leftover, and a call with no import is
 * somebody else's function that happens to share a name.
 */
function callsThrough(code: string, name: string): boolean {
  return new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(code)
    && new RegExp(`\\b${name}\\s*\\(`).test(code);
}

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

    const page = await pendingPage(store);

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

    const before = await pendingPage(store);
    assert.deepEqual(before.items, [], 'something was already waiting on a device nobody removed anybody from');

    await removeClientForGood(store, person.record_id);

    const after_ = await pendingPage(store);
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
   * THE WRITER, ASSERTED WHERE IT ACTUALLY LIVES — the repair of a guard that had stopped guarding.
   *
   * ## What this used to be, and how it went vacuous
   *
   * It used to assert that NOTHING called `recordCompletedSync`, and its own comment said it MUST
   * FAIL the day the join landed, so that the prose it guarded got re-read rather than assumed still
   * true. **But its scanner walked `core` only.** `core/INTEGRATION.md` says the join belongs to the
   * interface step, so the wire landed in `src` — and the scan stayed green. The guard silently
   * stopped guarding, on the one day it existed for, and its comment became the false claim.
   *
   * ## Why a POSITIVE assertion instead
   *
   * An absence-scan is only ever as wide as the ground it walks, and it reports the reassuring
   * answer when it walks the wrong ground: "I found nothing" and "I looked nowhere" are the same
   * result. Asserting that the writer EXISTS, and naming where, cannot go vacuous the same way —
   * a scan that walks nothing now fails instead of passing.
   *
   * It is asserted as EXACTLY ONE, because that is a property `sync-runner.ts` states about itself:
   * there is one holder of a live report and one place a pass is run from, since everything a pass
   * produces is needed in three places and every one of them needs the same object. A second writer
   * appearing here is that property breaking, and it would break silently.
   *
   * ## The two probes that keep it honest
   *
   * A KNOWN POSITIVE, in the same run and through the same discriminator: `core/status/surface.js`
   * genuinely reads the completion, so a scan that cannot see that call is dead and everything else
   * it says is worth nothing. That is the discipline the old scan had, kept.
   *
   * And a KNOWN NEGATIVE it would be easy to fail: `src/App.tsx` MENTIONS `recordCompletedSync` in a
   * sentence and calls it nowhere, and `core/status/status.js` carries a usage example that both
   * imports and calls it — in prose. A bare text scan counts all of them as wires, which is the exact
   * shape found elsewhere in this build tonight: a comment asserting a thing was done, mistaken for
   * the thing. So the discriminator strips comments first and then requires IMPORT PLUS CALL, and the
   * mention is asserted to be really there before it is asserted not to count.
   */
  it('has exactly one production writer, and it is asserted where it actually lives', async () => {
    // BOTH trees. The core is the state layer and the shell derives from it; a join between them can
    // legitimately live in either, so a scan of one of them answers a narrower question than the one
    // being asked — which is precisely how this test went vacuous.
    const sources: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'testing') continue;
          // eslint-disable-next-line no-await-in-loop
          await walk(full);
        } else if (SOURCE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
          && !entry.name.includes('.test.')) {
          sources.push(full);
        }
      }
    };
    // eslint-disable-next-line no-await-in-loop
    for (const root of [coreRoot, shellRoot]) await walk(root);

    assert.ok(
      sources.some((file) => file.startsWith(coreRoot))
        && sources.some((file) => file.startsWith(shellRoot)),
      'the walk covered only one of the two trees, so it is asking a narrower question than the one '
        + 'this test is for — the exact defect this rewrite repairs',
    );
    assert.ok(sources.length > 20, 'the walk found almost no sources, so it is looking in the wrong place');

    const reads: string[] = [];
    const writes: string[] = [];
    const mentions: string[] = [];
    for (const file of sources) {
      // eslint-disable-next-line no-await-in-loop
      const text = await readFile(file, 'utf8');
      const code = codeOnly(text);
      const relative = path.relative(applicationRoot, file).split(path.sep).join('/');
      if (callsThrough(code, 'readLastCompletedSync')) reads.push(relative);
      if (callsThrough(code, 'recordCompletedSync')) writes.push(relative);
      if (text.includes('recordCompletedSync')) mentions.push(relative);
    }

    // THE KNOWN POSITIVE. `core/status/surface.js` genuinely reads the completion, so a scanner
    // that reports nothing here is broken and everything below it is evidence of nothing.
    assert.ok(
      reads.includes('core/status/surface.js'),
      'this scan cannot find a call it is standing on top of, so it is dead and the results below '
        + 'are evidence of nothing',
    );

    // THE KNOWN NEGATIVE, and its own non-vacuity: the mention has to exist to be discounted.
    assert.ok(
      mentions.includes('src/App.tsx'),
      'the negative control has gone stale — App.tsx no longer names recordCompletedSync at all, so '
        + 'discounting it proves nothing about the discriminator',
    );
    assert.ok(
      !writes.includes('src/App.tsx'),
      'a file that only NAMES the writer in a sentence was counted as calling it. A comment claiming '
        + 'a wire exists is not a wire, and treating one as evidence is how prose becomes a guard '
        + 'that cannot go red',
    );

    assert.deepEqual(
      writes,
      ['src/shell/sync-runner.ts'],
      'the join from a synchronisation to the persisted completion is not where this expects it. If '
        + 'it has MOVED, correct this list. If it has GONE, hasEverSynchronised answers false on '
        + 'every device again and the register goes back to telling the coach he is not connected '
        + 'after he is. If there are now TWO, that is the one-holder-of-a-live-report property in '
        + 'sync-runner.ts breaking, and two paths to the surface is the defect it was built to close.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The window this step closes, proven by consequence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE REFUSAL STOPS BECAUSE A REAL SYNCHRONISATION COMPLETED — caused, not reasoned about.
 *
 * `core/crypto/guard.js` performs NO detection: it takes `hasEverSynchronised` as an argument and
 * refuses unless it is exactly `true`. So asking the guard why it says no is asking a mirror, and the
 * only honest proof is the consequence — a protected clinical note that cannot be saved before, and
 * is saved after, with nothing changed in between but a real pass over a real store.
 *
 * ONE FUNCTION ANSWERS THE QUESTION, and these tests call THAT one. Nothing here works the answer out
 * a second way: a second answering path is exactly what {@link hasEverSynchronised} exists to prevent,
 * because the register and the accountability indicator would then be able to disagree.
 *
 * The remote is the core's own in-memory double, which is the same one `sync-runner.test.ts` runs the
 * join against and the same one the key guard's own suite establishes into. It is one double for both
 * because it is one Google account in production: the pass writes to the visible space and the key
 * material lives in the hidden one.
 */
describe('the window: a real synchronisation stops the clinical-note refusal', () => {
  const THE_NOTE = 'A protected note that the coach could not save before this device had backed up.';

  /** A real store and a remote that answers, and nothing else substituted. */
  async function aDeviceWithSomethingToBackUp() {
    const store = await aRealStore();
    const remote = new InMemoryRemoteStorage();
    const person = await registerClient(store, draft('Test Person With A Protected Note'));
    return { store, remote, clientId: person.record_id as string };
  }

  /**
   * SAVE A PROTECTED CLINICAL NOTE, the way the interface would have to.
   *
   * The one deliberate property: `hasEverSynchronised` is asked ONCE, HERE, and its answer is what
   * goes into the guard. The guard is handed the answer rather than working one out, which is its
   * design, so a caller that computed its own would be the disagreement this whole seam prevents.
   *
   * It throws what the core throws. A refusal is `NotConnectedYet` from `core/crypto/errors.js`, and
   * it is not caught here: the point of these tests is which side of the refusal we are on.
   */
  async function saveTheProtectedNote(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: any,
    remote: InstanceType<typeof InMemoryRemoteStorage>,
    clientId: string,
    note: string,
  ) {
    const { dataKey } = await establishKeyMaterial({
      remote,
      deviceId: store.device,
      deviceKeys: new InMemoryDeviceKeyStore(),
      // THE ONE FACT, from the one function. See above.
      hasEverSynchronised: await hasEverSynchronised(store),
      now: () => new Date().toISOString(),
      journal: async () => undefined,
    });

    const context = { type: 'client', recordId: clientId, field: 'clinical_note' };
    const sealed = await sealField(dataKey, context, note);
    await store.update('client', clientId, (content: Record<string, unknown>) => ({
      ...content, clinical_note: sealed,
    }));
    return { dataKey, context };
  }

  it('REFUSES the note before, and SAVES it after — one real pass is the only thing that changed', async () => {
    const { store, remote, clientId } = await aDeviceWithSomethingToBackUp();

    // ── BEFORE. Nothing has ever completed, so the note cannot be saved.
    assert.equal(await hasEverSynchronised(store), false, 'a device that has backed up nothing');

    const refused = await saveTheProtectedNote(store, remote, clientId, THE_NOTE)
      .then(() => null, (error: unknown) => error);
    assert.ok(
      refused instanceof NotConnectedYet,
      `the note was not refused for the reason this test is about — it got ${String(refused)}`,
    );
    assert.equal(
      (await store.get('client', clientId)).content.clinical_note,
      undefined,
      'the refusal let the note onto the record anyway, which is the one thing worse than refusing: '
        + 'accepting clinical text and keeping it in the clear',
    );

    // ── THE ONLY THING THAT CHANGES. A real pass, over the real engine, against the double.
    const { recorded } = await runSyncPass(store, remote as never, { trigger: SYNC_TRIGGERS.MANUAL });
    assert.equal(recorded, true, 'the pass earned no completion, so nothing below would prove anything');

    // ── AFTER. The persisted record now answers, through the same one function.
    assert.equal(
      await hasEverSynchronised(store),
      true,
      'a synchronisation completed and the device still reports it has never synchronised. That is '
        + 'the window this step exists to close, still open.',
    );

    const { dataKey, context } = await saveTheProtectedNote(store, remote, clientId, THE_NOTE);

    const saved = await store.get('client', clientId);
    assert.ok(saved.content.clinical_note !== undefined && saved.content.clinical_note !== null,
      'the save resolved without refusing and yet nothing is on the record');
    assert.ok(
      !JSON.stringify(saved).includes(THE_NOTE),
      'the note went onto the record IN THE CLEAR. A refusal that stops by writing plaintext has '
        + 'made things worse than the refusal was.',
    );
    assert.equal(
      await openField(dataKey, context, saved.content.clinical_note),
      THE_NOTE,
      'the note was written but does not come back, so "saved" is a claim rather than a fact',
    );
  });

  it('tells him this device HAS BACKED UP once a pass has completed, in the words the field shows', async () => {
    const { store, remote } = await aDeviceWithSomethingToBackUp();

    // The screen's own derivation, from `ClientsScreen.tsx`: the answer to the one function is the
    // state, and the state is the words. This asserts the WORDS, because a state name is not what
    // reaches him. `backupHistoryOf` is that derivation, called here rather than copied.
    const wordsNow = async () => describeClinicalField(
      backupHistoryOf(await hasEverSynchronised(store)),
    ).whatHappened;

    const before = await wordsNow();
    assert.match(
      before,
      /not backed anything up/i,
      'the field must say nothing has backed up here while nothing has',
    );

    await runSyncPass(store, remote as never, { trigger: SYNC_TRIGGERS.MANUAL });

    const after = await wordsNow();
    assert.notEqual(
      after,
      before,
      'A PASS HAS COMPLETED AND THE APP IS STILL TELLING HIM NOTHING HAS BACKED UP. No error, no '
        + 'failure — a sentence that quietly stopped being true, on the surface that decides whether '
        + 'he can record a clinical note.',
    );
    assert.doesNotMatch(
      after,
      /not backed anything up/i,
      'the field goes on telling him to back up a device that has backed up',
    );
    assert.match(after, /has backed up to your Google account before/i, 'and it says what is now true');
    // AND IT SAYS ONLY WHAT THIS PASS PROVED. The completion is a fact about the past; whether Google
    // is reachable now is the backup indicator's question, asked of the credential and answered `no`
    // on this same device the moment he signs out. This sentence used to claim both.
    assert.equal(
      /\bconnected\b/iu.test(after),
      false,
      `the field turns a completed pass into a claim about the present connection: ${after}`,
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

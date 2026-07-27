/**
 * WHAT THE THREE CONTROLS SAY, AND THE TWO THINGS THIS SURFACE IS FORBIDDEN TO DO.
 *
 * The judgement is in `client-removal.ts` and none of it is in a component, so all of it can be
 * asserted here with no browser and no rendering at all. What this file is actually holding down:
 *
 *   1. **The reversible path has no ceremony.** There is no confirmation to describe for archive or
 *      restore, and {@link RowActions} has nowhere to put one. A warning in front of a reversible act
 *      is how a coach learns to click through the one that matters.
 *   2. **The removal says all three things**: what happens, that it cannot be undone, and an OFFER to
 *      back up first — shown in every state, including the states where it cannot run.
 *   3. **The sentence about what "not confirmed" means is the SAME OBJECT** as the one the removals
 *      screen shows. Not an equal string: the identical constant, so a reworded second copy cannot
 *      pass this suite.
 *   4. **Nothing here retries or gives up on a removal.** `markDeletionFailed` has no production
 *      caller and this step does not become one — that is a judgement about a delivery attempt, and
 *      it is asserted by scanning the interface rather than promised in a comment.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  ARCHIVE_LABEL, BACKUP_OFFER_PURPOSE, REMOVE_LABEL, RESTORE_LABEL, archivedWords,
  describeActionFailure, describeBackupOffer, describeRegisterRemovals, describeRemovalConfirmation,
  describeRowActions, removedWords, restoredWords,
} from './client-removal';
import type { BackupOfferState } from './client-removal';
import { NOT_CONFIRMED_IS_NOT_STILL_THERE, NO_NAME_IS_DELIBERATE } from './removals';
import { NO_PASS_HAS_REPORTED } from './removals';
import type { DeletionManifest, RemovalsReading } from './removals';
import type { ClientSummary } from './clients';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');

/** Every state the backup offer can be asked about, so no test can quietly cover only one. */
const STATES: readonly BackupOfferState[] = ['unknown', 'never-connected', 'connected'];

/** Names invented and deliberately unmistakable: this repository is public by an explicit decision. */
const person = (over: Partial<ClientSummary> = {}): ClientSummary => ({
  recordId: 'client-1',
  name: 'Test Person One',
  adaptationFlag: null,
  sessionWords: 'No sessions yet',
  archived: false,
  archivedWord: null,
  ...over,
});

const manifest = (id: string): DeletionManifest => ({
  deletion_id: id,
  manifest_version: 1,
  subject_client_id: 'client-1',
  requested_at: '2026-01-01T00:00:00.000Z',
  device: 'coach-laptop',
  status: 'pending',
  attempts: 0,
  last_error: null,
  propagated_at: null,
  removed: [{ type: 'client', record_id: 'client-1' }],
  revised: [],
  // The queue sweep's own result, as `core/store/purge.js` persists it on every manifest it writes.
  // A hand-built manifest that left it out would be a shape the core never produces.
  outbox: { inspected: 0, rewritten: 0, removed: 0, unresolved: [] },
});

const waiting = (count: number): RemovalsReading => ({
  pending: {
    items: Array.from({ length: count }, (_unused, index) => manifest(`deletion-${index}`)),
    cursor: null,
    done: true,
  },
  // The register's notice is about the LOCAL half. No pass has reported here, and saying so is not
  // the same as saying a pass found nothing — see `screens/removals.ts`.
  remote: NO_PASS_HAS_REPORTED,
});

describe('the two controls on a person\'s row', () => {
  it('offers ARCHIVE to somebody on the register and RESTORE to somebody put away', () => {
    assert.equal(describeRowActions(person()).reversibleLabel, ARCHIVE_LABEL);
    assert.equal(describeRowActions(person()).reversibleKind, 'archive');

    const archived = person({ archived: true, archivedWord: 'Archived' });
    assert.equal(describeRowActions(archived).reversibleLabel, RESTORE_LABEL);
    assert.equal(describeRowActions(archived).reversibleKind, 'restore');
  });

  it('names the person in every description, because the labels repeat down the whole register', () => {
    const actions = describeRowActions(person({ name: 'Test Person Two' }));

    for (const description of [actions.reversibleDescription, actions.removeDescription]) {
      assert.ok(
        description.includes('Test Person Two'),
        'a register of forty people hands a screen reader the same two words forty times with '
          + `nothing saying whose: "${description}"`,
      );
    }
  });

  it('ASKS NOTHING before a reversible act — there is no confirmation to draw', () => {
    const offered = Object.keys(describeRowActions(person()));

    for (const field of offered) {
      assert.ok(
        !/confirm|warn|are you sure/i.test(field),
        `the reversible path grew a confirmation ("${field}"). Both directions are one press away `
          + 'on the same row, and a warning in front of a reversible act is how he learns that this '
          + 'application\'s warnings are noise — which costs the one warning that is not.',
      );
    }
  });

  it('words the exceptional control as an act with a consequence rather than as "delete"', () => {
    assert.ok(
      REMOVE_LABEL.toLowerCase().includes('for good'),
      'the destructive control does not say what makes it different from archiving',
    );
  });
});

describe('what the screen says after a reversible act', () => {
  it('says where an archived client WENT, rather than only that they are gone from the list', () => {
    const said = archivedWords('Test Person One');
    assert.ok(said.startsWith('Test Person One'));
    assert.ok(
      said.includes('kept'),
      'archiving reads as something being taken away from him unless the words say the history is '
        + `still his: "${said}"`,
    );
  });

  it('says a restored client is back', () => {
    assert.ok(restoredWords('Test Person One').includes('back on your register'));
  });

  /**
   * THE SENTENCE THAT MUST STOP WHERE IT STOPS.
   *
   * At the instant a removal commits, what is known is that this device is clear. The backup has not
   * been looked at and cannot be until there is a connection. One reassuring clause too far here —
   * "and removed from your backup" — is the exact belief `core/sync/deletions.js` opens by naming.
   */
  it('claims THIS DEVICE and nothing beyond it', () => {
    const said = removedWords('Test Person One');

    assert.ok(said.includes('this device'), `the removal said nothing about where: "${said}"`);
    assert.ok(
      !/backup|drive|gone from everywhere|everywhere/i.test(said),
      `the removal claimed reach it has not verified: "${said}". Nothing has looked at the backup `
        + 'yet, and the pending-removal notice is what carries that half.',
    );
  });
});

describe('the confirmation in front of a removal', () => {
  it('says what will happen, that it cannot be undone, and offers the reversible path instead', () => {
    const report = describeRemovalConfirmation('Test Person One', 'never-connected');

    assert.ok(report.title.includes('Test Person One'));
    assert.ok(
      report.cannotBeUndone.toLowerCase().includes('cannot be undone'),
      'the one sentence a destructive confirmation exists to carry is not in it',
    );
    assert.ok(
      report.archiveInstead.toLowerCase().includes('archive'),
      'the most likely reason he is standing here is that he did not know the ordinary path exists, '
        + 'and this is the sentence that costs one line and saves a history',
    );
  });

  /**
   * THE PROMISE THAT MATCHES WHAT THE CORE ACTUALLY DOES.
   *
   * `core/store/purge.js` keeps a session shared with another client and edits the departed client
   * out of it, because that session is the other person's history too. A confirmation that promised
   * "everything of theirs is removed" and stopped would be describing an operation this application
   * deliberately does not perform, and he would later find the shared session and conclude the
   * removal had failed.
   */
  it('does NOT promise that a shared session goes with them', () => {
    const said = describeRemovalConfirmation('Test Person One', 'connected').whatWillHappen;

    assert.ok(
      said.includes('shared'),
      `the confirmation says nothing about shared sessions: "${said}"`,
    );
    assert.ok(
      /another client|other client|other person/i.test(said),
      'the reason a shared session survives — it is somebody else\'s history — is what makes the '
        + 'exception read as care rather than as a records being missed',
    );
  });

  it('makes KEEPING the client the plain, safe wording of the way out', () => {
    const report = describeRemovalConfirmation('Test Person One', 'unknown');
    assert.ok(
      report.cancelLabel.includes('Test Person One'),
      `"${report.cancelLabel}" does not say what pressing it leaves him with`,
    );
  });
});

describe('the offer to back up first', () => {
  it('IS SHOWN IN EVERY STATE, including the ones where it cannot run', () => {
    for (const state of STATES) {
      const offer = describeBackupOffer(state);

      assert.equal(offer.title, 'Back up first?', `the ${state} state has no offer at all`);
      assert.ok(
        offer.whatHappened.length > 0,
        `the ${state} state showed an offer with no account of what this device can do — which is `
          + 'the disabled control with no explanation, wearing the other half of the same failure',
      );
      assert.equal(
        offer.whatItIsFor,
        BACKUP_OFFER_PURPOSE,
        `the ${state} state reworded why a backup is worth taking`,
      );
    }
  });

  /**
   * THE ASSERTION DESIGNED TO FAIL ONE DAY.
   *
   * Backing up needs the Google step, which is a later piece of work, so today no state can run one.
   * When somebody wires a real backup this fails — and that is the day every sentence above stops
   * being true and has to be rewritten rather than assumed still right.
   */
  it('cannot actually run in ANY state today, and this fails the day one lands', () => {
    for (const state of STATES) {
      assert.equal(
        describeBackupOffer(state).canRun,
        false,
        `the ${state} state can now take a backup. Good news — but the confirmation is still saying `
          + 'there is nothing to press, and `client-removal.ts` has to be re-read rather than '
          + 'assumed still right.',
      );
    }
  });

  it('explains WHY on a device that has never connected, and gives him something he can do', () => {
    const offer = describeBackupOffer('never-connected');

    assert.ok(
      /google account has not been connected/i.test(offer.whatHappened),
      `the reason the offer cannot run is not stated: "${offer.whatHappened}"`,
    );
    assert.ok(offer.whatToDo !== null, 'he was told it cannot run and given nothing he can cause');
    assert.ok(
      /admin/i.test(offer.whatToDo as string),
      'the direction does not say where to go',
    );
    assert.ok(
      /your decision|go ahead without/i.test(offer.whatToDo as string),
      'the offer that cannot run reads as a refusal unless it says he may still go ahead. Removing '
        + 'a client is his decision and this app is telling him where he stands, not making it.',
    );
  });

  it('does NOT tell a connected device to go and connect', () => {
    const offer = describeBackupOffer('connected');

    assert.ok(
      !/connect your google account/i.test(offer.whatHappened + (offer.whatToDo ?? '')),
      'a device that has already backed up was sent to reconnect an account that is connected — a '
        + 'sentence that quietly stopped being true, which is the failure shape this build keeps '
        + 'meeting',
    );
    assert.ok(
      /not finished yet/i.test(offer.whatHappened),
      'the honest answer for a connected device is the uncomfortable one: the on-demand backup is '
        + 'not built. Anything else here is a true-sounding sentence that sends him somewhere useless.',
    );
  });

  it('says the uncomfortable half out loud: a backup taken now still contains them', () => {
    assert.ok(
      /still contain them/i.test(BACKUP_OFFER_PURPOSE),
      'the offer describes a backup without saying it holds the person he is about to remove — '
        + 'which is both why it is useful and a copy this app cannot reach into afterwards',
    );
  });
});

describe('what the register says about removals not yet confirmed', () => {
  it('is the IDENTICAL sentence the removals screen shows, never a second softer copy', () => {
    assert.equal(
      describeRegisterRemovals(waiting(1)).meaning,
      NOT_CONFIRMED_IS_NOT_STILL_THERE,
      'the register wrote its own version of the one sentence in this application that separates '
        + '"not confirmed" from "still there". Two copies drift, and the softer one would be the one '
        + 'he reads most often.',
    );
    assert.equal(describeRegisterRemovals(waiting(1)).noName, NO_NAME_IS_DELIBERATE);
  });

  it('says the removal is done HERE and not yet confirmed THERE, overstating neither', () => {
    const said = describeRegisterRemovals(waiting(1)).intro;

    assert.ok(said.includes('this device'), `it does not say where the removal is done: "${said}"`);
    assert.ok(
      /not yet confirmed/i.test(said),
      `it does not say what is unknown: "${said}"`,
    );
    assert.ok(
      !/still in your backup|are still there/i.test(said),
      `it claimed the records are still in the backup, which is alarming and frequently false: "${said}"`,
    );
  });

  it('counts one as one and two as two, and draws nothing when there is nothing', () => {
    assert.equal(describeRegisterRemovals(waiting(0)).present, false);
    assert.ok(describeRegisterRemovals(waiting(1)).intro.startsWith('1 removal '));
    assert.ok(describeRegisterRemovals(waiting(2)).intro.startsWith('2 removals '));
    assert.equal(describeRegisterRemovals(waiting(2)).count, 2);
  });
});

describe('when one of the three does not work', () => {
  it('tells him a failed removal changed NOTHING, because the purge is one transaction', () => {
    const failure = describeActionFailure(new Error('the database went away'), 'Test Person One', 'remove');

    assert.ok(
      /nothing of theirs was changed/i.test(failure.headline),
      'the state a coach fears after a failed deletion is the half-deleted one. `purgeClient` '
        + 'commits at once or not at all, so this is a sentence the application is entitled to say '
        + `and did not: "${failure.headline}"`,
    );
    assert.equal(failure.verbatim, 'Error: the database went away');
  });

  it('names the act that failed, so a failed archive does not read as a failed removal', () => {
    const archive = describeActionFailure(new Error('no'), 'Test Person One', 'archive');
    const restore = describeActionFailure(new Error('no'), 'Test Person One', 'restore');

    assert.ok(archive.headline.includes('archived'));
    assert.ok(restore.headline.includes('restored'));
    assert.notEqual(archive.headline, restore.headline);
  });
});

/**
 * THE GAP THIS STEP REPORTS RATHER THAN FILLS.
 *
 * `markDeletionFailed` has no production caller. That is deliberate and it stays deliberate: marking
 * a removal failed, or giving up on it, is a judgement about a DELIVERY ATTEMPT and belongs where
 * deliveries happen — which is a later step that owns the credential and can see what the remote
 * actually said. A retry button here would be this screen inventing an opinion about a
 * synchronisation it cannot see.
 *
 * It is an absence-scan, so the same scanner is pointed at a known positive in the same run.
 */
describe('the removal gap that is reported rather than filled', () => {
  it('adds no retry and no give-up: the interface never calls markDeletionFailed', async () => {
    const sources: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // eslint-disable-next-line no-await-in-loop
          await walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          sources.push(full);
        }
      }
    };
    await walk(path.join(applicationRoot, 'src'));

    assert.ok(sources.length > 20, 'the walk found almost no interface sources, so it is looking in the wrong place');

    const callsFailed: string[] = [];
    const callsPending: string[] = [];
    for (const file of sources) {
      // eslint-disable-next-line no-await-in-loop
      const text = await readFile(file, 'utf8');
      const relative = path.relative(applicationRoot, file).split(path.sep).join('/');
      if (/markDeletionFailed\s*\(/.test(text)) callsFailed.push(relative);
      if (/pendingDeletions\s*\(/.test(text)) callsPending.push(relative);
    }

    // THE KNOWN POSITIVE. The interface genuinely calls `pendingDeletions`, so a scanner reporting
    // nothing here is dead and its silence about the other call would be evidence of nothing.
    assert.ok(
      callsPending.includes('src/shell/removals-source.ts'),
      'this scan cannot find a call it is standing on top of, so the result below means nothing',
    );

    assert.deepEqual(
      callsFailed,
      [],
      'a screen now marks a removal failed or gives up on one. That is a judgement about a delivery '
        + 'attempt made by something that cannot see the delivery — the gap was reported on purpose '
        + 'and belongs to the step that owns the credential.',
    );
  });
});

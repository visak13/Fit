/**
 * THE RESET AND THE EDITOR, PROVEN AGAINST EACH OTHER — and the words the coach reads on the way.
 *
 * Nothing here is a stub of the store. Every write goes through the core's own in-process database,
 * the same one the store's gate runs on, and every library change is made THROUGH THE EDITOR the
 * previous action built rather than by writing records this file composed. That is the whole point:
 * a reset proven against records this suite wrote would be a reset proven against this suite's idea
 * of the library, and the two things that have to agree are the editor and the reset.
 *
 * The six claims, and each is proven by CONSEQUENCE rather than by reading the code meant to do it:
 *
 *   ONE — EDIT, ADD AND DELETE ACROSS ALL THREE LIBRARY KINDS, THEN RESET, AND EVERY SHIPPED RECORD
 *   IS BACK IN ITS SHIPPED STATE. The deleted ones are back and the edits to shipped records are
 *   undone. A record the coach AUTHORED is not "added" in this sense and is left standing — reset
 *   returns the shipped half and touches no coach-authored record.
 *   The expected set is DERIVED AT RUNTIME from the seed content and asserted NON-EMPTY before
 *   anything is compared, because a comparison against an empty expectation passes for free.
 *   Intensity patterns are included and are the kind a hand-written proof forgets.
 *
 *   TWO — CLIENTS AND SESSIONS ARE PROVABLY UNTOUCHED. Walked to the end before and after and
 *   compared by RECORD IDENTITY AND REVISION, never by count: a count is precisely the check that
 *   passes while the content changes underneath it. The walk is asserted non-empty, because
 *   "nothing changed" is trivially true of nothing.
 *
 *   THREE — THE REFERENTIAL HOLE THE STORE CANNOT SEE IS CLOSED. `store.create` and `store.update`
 *   run a routine's own validator, which validates a routine alone, so a routine naming an exercise
 *   that is not there commits cleanly. A reset WRITES ROUTINES and removes exercises, so it has the
 *   same hole. Two real ways it opens are driven here and both are refused with nothing written.
 *
 *   FOUR — THE BACKUP IS OFFERED, IT WORKS, AND A FAILED ONE STOPS THE RESET. The copy is made
 *   inside the reset, immediately before the first write, so a share sheet he dismissed leaves his
 *   library exactly as it was.
 *
 *   FIVE — THE READS GO PAST THE FIRST PAGE. The shipped catalogue is 99 exercises and the store
 *   pages at 25, so a first-page reader is not merely theoretically wrong here, it is measurably
 *   short — and it would produce a backup that opens cleanly holding a quarter of his library.
 *
 *   SIX — THE WORDS. Held to the rules that are not stylistic: it never says "fresh slate", it names
 *   what it destroys, it says why it lives in Admin, and the word "rest" never means "the
 *   remainder" anywhere near a screen with a field called rest.
 *
 * The absence-shaped scans in the last describe DISCOVER their scope from the module's own exports
 * at runtime rather than naming sentences by hand, assert that scope is non-empty, and each carries
 * a POSITIVE CONTROL in the same run: a scan that cannot catch the thing where it demonstrably is
 * has proven nothing about the sentences where it found none.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/screens/reset-to-defaults.test.ts
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { aClient, aSession } from '../../core/model/fixtures.js';
import { INTENSITY_LEVELS } from '../../core/model/model.js';
import { LIBRARY_TYPES } from '../../core/model/vocabularies.js';
import { EXERCISES, ROUTINES, INTENSITY_PATTERNS, SEED_TYPES, seedContentFor } from '../../core/seed/content.js';
import { COACH_PROVENANCE, EDITED_PROVENANCE, SEED_PROVENANCE } from '../../core/seed/provenance.js';
import { seedIfNeeded } from '../../core/seed/import.js';
import { openLocalStore } from '../../core/store/store.js';
import { libraryPage, listClients, sessionsForClient } from '../../core/store/queries.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';

import { AdminScreen } from './AdminScreen';
import { LocalStoreProvider } from '../platform/LocalStore';
import { PlatformStatusProvider } from '../platform/platform-status';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus';
import { DESTINATIONS } from '../shell/navigation';
import type { Destination } from '../shell/navigation';

import { readAll } from './client-report-source';
import { draftFromExercise, exerciseContent } from './library-editor';
import type { ExerciseRecord } from './library-editor';
import { addExercise, removeExercise, saveExercise } from './library-editor-source';
import { addPattern, removePattern, savePattern } from './library-patterns-source';
import { addRoutine, removeRoutine, saveRoutine } from './library-routines-source';

import { readBackupParts } from '../../core/artefacts/artefacts.js';

import * as words from './reset-to-defaults';
import {
  confirmLabelFor, describeBackupOffer, describeResetConfirmation, describeResetOutcome,
  describeResetFailure, kindsPhrase, RESET_TITLE, SEE_WHAT_WOULD_CHANGE, whatIsLeftAlone,
} from './reset-to-defaults';
import type { ResetPlanReading } from './reset-to-defaults';
import {
  BackupNotKeptError, readResetPlan, readWholeLibrary, restoreShippedLibrary, saveLibraryBackup,
} from './reset-to-defaults-source';
import type { BackupSurfaces } from './reset-to-defaults-source';

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
async function aSeededStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  // FIRST-RUN SEEDING, through the core's own path. The library is seeded once and remembered, and
  // never re-seeded on empty — which is exactly why the reset under test is the only way back.
  await seedIfNeeded(store);
  return store;
}

/** One page, as every store query answers. */
interface Page { items: unknown[]; cursor: string | null; done: boolean }

/** Every live record of one library kind, walked to the end. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function everyRecord(store: any, kind: string): Promise<Record<string, any>[]> {
  const read = await readAll((cursor) => libraryPage(store, kind, { after: cursor }) as Promise<Page>);
  assert.equal(read.complete, true, `the ${kind} walk did not reach the end`);
  return read.items as Record<string, any>[];
}

/** The content of every live record of one kind, keyed by its content key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contentByKey(store: any, kind: string): Promise<Map<string, Record<string, any>>> {
  const records = await everyRecord(store, kind);
  return new Map(records.map((record) => [String(record.content?.id), record.content]));
}

/**
 * A stable string for a content value, keys sorted at every depth.
 *
 * Written out rather than done with `JSON.stringify`'s replacer, which applies its key list at every
 * depth and would silently drop nested fields — a comparison that quietly ignored `entries` would
 * report a heavily edited routine as identical to the shipped one, which is the exact defect this
 * suite exists to catch.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const held = value as Record<string, unknown>;
    return `{${Object.keys(held).sort().map((k) => `${JSON.stringify(k)}:${canonical(held[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// ═══════════════════════════════════════════════════════════════════════════════
// The editor's own moves, made through the editor
// ═══════════════════════════════════════════════════════════════════════════════

const LEVELS: readonly string[] = INTENSITY_LEVELS;

/** A shipped exercise's stored record, found by the key it ships under. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storedByKey(store: any, kind: string, key: string): Promise<Record<string, any>> {
  const found = await store.getByContentKey(kind, key);
  assert.ok(found, `nothing is stored under ${kind} "${key}"`);
  return found as Record<string, any>;
}

/**
 * THE COACH'S EVENING: he corrects something the app came with, adds something of his own, and
 * removes something he does not use — on all three kinds. Every move goes through the editor.
 *
 * @returns what he touched, so the assertions name records rather than indexes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function anEveningOfEditing(store: any) {
  // ── EXERCISES ────────────────────────────────────────────────────────────────
  const shippedExercise = await storedByKey(store, 'exercise', EXERCISES[0].id);
  const draft = draftFromExercise(shippedExercise as unknown as ExerciseRecord, LEVELS);
  await saveExercise(
    store,
    shippedExercise.record_id,
    exerciseContent({ ...draft, coachingCue: 'Coach changed this cue' }, LEVELS, EXERCISES[0].id),
    shippedExercise.rev,
  );

  const addedExercise = await addExercise(store, exerciseContent(
    { ...draft, name: 'Coach Invented Movement', coachingCue: 'Only he has this' },
    LEVELS,
    null,
  ));

  const doomedExercise = await storedByKey(store, 'exercise', EXERCISES[1].id);
  await removeExercise(store, doomedExercise.record_id, doomedExercise.rev);

  // ── ROUTINES ─────────────────────────────────────────────────────────────────
  const shippedRoutine = await storedByKey(store, 'routine', ROUTINES[0].id);
  await saveRoutine(
    store,
    shippedRoutine.record_id,
    { ...shippedRoutine.content, name: 'Legs my way' },
    shippedRoutine.rev,
  );

  const addedRoutine = await addRoutine(store, asHisOwn(ROUTINES[0] as Record<string, unknown>, {
    id: 'coach-invented-day',
    name: 'Coach Invented Day',
  }));

  const doomedRoutine = await storedByKey(store, 'routine', ROUTINES[1].id);
  await removeRoutine(store, doomedRoutine.record_id, doomedRoutine.rev);

  // ── INTENSITY PATTERNS — the kind a hand-written proof forgets ────────────────
  const shippedPattern = await storedByKey(store, 'intensity-pattern', INTENSITY_PATTERNS[0].id);
  await savePattern(
    store,
    shippedPattern.record_id,
    { ...shippedPattern.content, name: 'My opening curve' },
    shippedPattern.rev,
  );

  const addedPattern = await addPattern(store, asHisOwn(
    INTENSITY_PATTERNS[0] as Record<string, unknown>,
    { id: 'coach-invented-curve', name: 'Coach Invented Curve' },
  ));

  const doomedPattern = await storedByKey(store, 'intensity-pattern', INTENSITY_PATTERNS[1].id);
  await removePattern(store, doomedPattern.record_id, doomedPattern.rev);

  return {
    edited: {
      exercise: EXERCISES[0].id, routine: ROUTINES[0].id, 'intensity-pattern': INTENSITY_PATTERNS[0].id,
    } as Record<string, string>,
    added: {
      exercise: (addedExercise as unknown as { content: { id: string } }).content.id,
      routine: (addedRoutine as unknown as { content: { id: string } }).content.id,
      'intensity-pattern': (addedPattern as unknown as { content: { id: string } }).content.id,
    } as Record<string, string>,
    deleted: {
      exercise: EXERCISES[1].id, routine: ROUTINES[1].id, 'intensity-pattern': INTENSITY_PATTERNS[1].id,
    } as Record<string, string>,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The browser, as arguments
// ═══════════════════════════════════════════════════════════════════════════════

/** A download surface that keeps whatever it was handed, so the file can be weighed. */
function aDownloadThatKeeps(kept: File[]): BackupSurfaces {
  return { download: { download: (file: File) => { kept.push(file); } } };
}

/** A download surface that fails, which is the only way a copy can fail with no share sheet. */
function aDownloadThatFails(): BackupSurfaces {
  return {
    download: {
      download: () => { throw new Error('the browser refused to save the file'); },
    },
  };
}

/**
 * SHIPPED CONTENT MADE INTO SOMETHING OF HIS OWN.
 *
 * The provenance is STRIPPED rather than carried, and that is the point rather than tidiness:
 * `markEdited` reads what it is given, so shipped content passed to an add arrives as
 * `shipped-edited` — a record claiming the app shipped it, which the next reset would revert. His
 * own records must start with no provenance at all and let the core assign one.
 */
function asHisOwn(content: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const { provenance, ...rest } = { ...content, ...over };
  void provenance;
  return rest;
}

describe('a coach edits, adds and deletes across all three library kinds, then restores', () => {
  // The name used to read "PUTS THE LIBRARY BACK TO EXACTLY WHAT SHIPPED", which this test's own body
  // contradicts at the `expected.size + 1` assertion below: his own record is still there afterwards.
  it('PUTS EVERY SHIPPED RECORD BACK AND LEAVES HIS OWN STANDING, derived at runtime and proven non-empty', async () => {
    const store = await aSeededStore();

    // THE EXPECTED SET IS DERIVED FROM THE SEED CONTENT, NEVER TYPED, and asserted non-empty before
    // anything is compared. A comparison against an empty expectation passes for free and would go
    // on passing if the seed content ever failed to load.
    const shipped = new Map<string, Map<string, Record<string, unknown>>>();
    for (const kind of SEED_TYPES) {
      const content = seedContentFor(kind) as Record<string, unknown>[];
      assert.ok(content.length > 0, `the shipped ${kind} set is empty, so nothing here proves anything`);
      shipped.set(kind, new Map(content.map((one) => [String(one.id), one])));
    }
    assert.deepEqual([...shipped.keys()], [...SEED_TYPES],
      'the reset covers kinds the shipped set does not, or the other way round');
    // The three kinds the reset restores ARE the model's library kinds. A fourth added to the model
    // and not to the seed would otherwise sit silently outside every reset.
    assert.deepEqual([...SEED_TYPES].sort(), [...LIBRARY_TYPES].sort());

    const touched = await anEveningOfEditing(store);

    // His evening really happened, read back off the store rather than assumed from the calls.
    for (const kind of SEED_TYPES) {
      const before = await contentByKey(store, kind);
      assert.equal(before.get(touched.edited[kind])?.provenance, EDITED_PROVENANCE,
        `the edited ${kind} is not marked as edited, so the reset would not know to revert it`);
      assert.equal(before.get(touched.added[kind])?.provenance, COACH_PROVENANCE);
      assert.equal(before.has(touched.deleted[kind]), false,
        `the deleted ${kind} is still there, so the restore proves nothing about deletions`);
    }

    const result = await restoreShippedLibrary(store, { withBackup: false });
    assert.ok(result.written > 0, 'the reset wrote nothing');

    for (const kind of SEED_TYPES) {
      const live = await contentByKey(store, kind);
      const expected = shipped.get(kind) as Map<string, Record<string, unknown>>;

      // THE ADDED ITEM IS STILL HIS. Reset restores the shipped library; it does not clear the
      // coach's own work, and a reset that removed it would be a different and far worse act.
      assert.equal(live.get(touched.added[kind])?.provenance, COACH_PROVENANCE,
        `the ${kind} he made himself did not survive the restore`);

      // THE DELETED ITEM IS BACK, and back as shipped rather than as some third state.
      const restored = live.get(touched.deleted[kind]);
      assert.ok(restored, `the deleted ${kind} did not come back`);
      assert.equal(canonical(restored), canonical(expected.get(touched.deleted[kind])));

      // THE EDIT IS UNDONE, byte for byte against what shipped.
      const reverted = live.get(touched.edited[kind]);
      assert.ok(reverted, `the edited ${kind} is not in the library at all`);
      assert.equal(canonical(reverted), canonical(expected.get(touched.edited[kind])),
        `the edited ${kind} did not go back to what shipped`);
      assert.equal(reverted?.provenance, SEED_PROVENANCE);

      // AND EVERY SHIPPED RECORD OF THIS KIND IS PRESENT AND IDENTICAL. Not a spot check: the
      // whole set, so a reset that restored the three records this test names and quietly dropped
      // the other ninety-six could not pass.
      for (const [key, content] of expected) {
        assert.equal(canonical(live.get(key)), canonical(content),
          `${kind} "${key}" is not what shipped after the restore`);
      }
      // The surplus catalogue is deliberately larger than the shipped week and must not be pruned;
      // the only extra live record here is the one he made himself.
      assert.equal(live.size, expected.size + 1,
        `the restored ${kind} library holds records that are neither shipped nor his`);
    }
  });

  it('LEAVES CLIENTS AND SESSIONS PROVABLY UNTOUCHED, by identity and revision rather than by count',
    async () => {
      const store = await aSeededStore();

      // Real clients and real sessions, including one SHARED between two of them — the shape that
      // is returned once per attendee and that a careless walk would count twice.
      const one = await store.create('client', aClient({ name: 'Test Client One' }));
      const two = await store.create('client', aClient({ name: 'Test Client Two' }));
      const WHEN = '2026-07-27T09:00:00.000Z';
      const UNTIL = '2026-07-27T10:00:00.000Z';
      await store.create('session', aSession({
        routine_id: ROUTINES[0].id,
        client_ids: [one.record_id, two.record_id],
        status: 'completed',
        started_at: WHEN,
        ended_at: UNTIL,
      }));
      await store.create('session', aSession({
        routine_id: ROUTINES[0].id,
        client_ids: [one.record_id],
        status: 'completed',
        started_at: WHEN,
        ended_at: UNTIL,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walkPeopleAndSessions = async (): Promise<Map<string, number>> => {
        const seen = new Map<string, number>();
        const clients = await readAll((cursor) =>
          listClients(store, { after: cursor, includeArchived: true }) as Promise<Page>);
        assert.equal(clients.complete, true, 'the client walk did not reach the end');

        for (const client of clients.items as { record_id: string; rev: number }[]) {
          seen.set(`client:${client.record_id}`, client.rev);
          // eslint-disable-next-line no-await-in-loop
          const theirs = await readAll((cursor) =>
            sessionsForClient(store, client.record_id, { after: cursor }) as Promise<Page>);
          assert.equal(theirs.complete, true, 'a session walk did not reach the end');
          // Keyed by identity, so a session returned once per attendee is held once.
          for (const session of theirs.items as { record_id: string; rev: number }[]) {
            seen.set(`session:${session.record_id}`, session.rev);
          }
        }
        return seen;
      };

      const before = await walkPeopleAndSessions();
      // NON-VACUITY: "nothing changed" is trivially true of nothing. Two clients and two distinct
      // sessions, so the shared one is proven to be held once rather than twice.
      assert.equal(before.size, 4, 'the walk found something other than two clients and two sessions');

      await anEveningOfEditing(store);
      await restoreShippedLibrary(store, { withBackup: false });

      const afterwards = await walkPeopleAndSessions();
      assert.deepEqual([...afterwards.entries()].sort(), [...before.entries()].sort(),
        'a client or session record changed identity or revision across the restore');
    });

  it('WRITES EVERY RESTORED RECORD AT A HIGHER REVISION, so sync carries the restore outward',
    async () => {
      const store = await aSeededStore();
      const shipped = await storedByKey(store, 'exercise', EXERCISES[0].id);
      const draft = draftFromExercise(shipped as unknown as ExerciseRecord, LEVELS);
      await saveExercise(
        store,
        shipped.record_id,
        exerciseContent({ ...draft, coachingCue: 'Edited before the restore' }, LEVELS, EXERCISES[0].id),
        shipped.rev,
      );
      const edited = await storedByKey(store, 'exercise', EXERCISES[0].id);

      await restoreShippedLibrary(store, { withBackup: false });

      const restored = await storedByKey(store, 'exercise', EXERCISES[0].id);
      // A restore written at the same or a lower revision loses the next sync race and the coach's
      // edits come straight back with nothing erroring anywhere.
      assert.ok(restored.rev > edited.rev,
        `the restored record is at revision ${String(restored.rev)}, not above ${String(edited.rev)}`);
    });
});

describe('the referential hole a reset opens, which the store cannot see', () => {
  it('REFUSES a reset that would leave one of his routines naming an exercise that is gone',
    async () => {
      const store = await aSeededStore();

      // An exercise from an OLDER shipped library: shipped provenance, and a key the shipped set no
      // longer holds. Written directly because no editor path can produce it — that is what makes
      // it an old record rather than one of his.
      const stale = { ...EXERCISES[0], id: 'retired-shipped-movement', name: 'Retired Shipped Movement' };
      await store.create('exercise', { ...stale, provenance: SEED_PROVENANCE });

      // HIS OWN routine names it, and the store accepts that happily — the editor's own check
      // passes, because right now the exercise really is there.
      await addRoutine(store, asHisOwn(ROUTINES[0] as Record<string, unknown>, {
        id: 'coach-day-using-a-retired-movement',
        name: 'Coach Day Using A Retired Movement',
        entries: [{ exercise_id: 'retired-shipped-movement' }],
      }));

      const before = await contentByKey(store, 'exercise');
      await assert.rejects(
        restoreShippedLibrary(store, { withBackup: false }),
        (error: unknown) => {
          const issues = (error as { issues?: { code: string }[] }).issues ?? [];
          assert.ok(issues.some((issue) => issue.code === 'DANGLING_REFERENCE'),
            `the refusal did not name a dangling reference: ${JSON.stringify(issues)}`);
          return true;
        },
      );

      // NOTHING WAS WRITTEN. A refusal that half-restored the library would be worse than the
      // dangling row it was avoiding.
      const afterwards = await contentByKey(store, 'exercise');
      assert.equal(canonical([...afterwards.keys()].sort()), canonical([...before.keys()].sort()));
      assert.ok(afterwards.has('retired-shipped-movement'));
    });

  it('REFUSES a reset that would make one of his overrides contradict the exercise it names',
    async () => {
      const store = await aSeededStore();

      // A shipped exercise counted in TIME, found by reading the shipped set rather than named here.
      const timed = (EXERCISES as Record<string, any>[]).find((one) => one.measurement === 'time');
      assert.ok(timed, 'no shipped exercise is counted in time, so this case cannot be built');

      // He edits it to be counted in repetitions, which is his to do.
      const stored = await storedByKey(store, 'exercise', timed.id);
      const draft = draftFromExercise(stored as unknown as ExerciseRecord, LEVELS);
      await saveExercise(store, stored.record_id, exerciseContent({
        ...draft,
        measurement: 'repetitions',
        defaultSets: '3',
        defaultAmount: '12',
        defaultRest: '45',
        scaling: {
          low: { sets: '2', amount: '8', rest: '60' },
          medium: { sets: '3', amount: '12', rest: '45' },
          high: { sets: '3', amount: '20', rest: '30' },
        },
      }, LEVELS, timed.id), stored.rev);

      // And now a routine of his own overrides REPETITIONS on it, which the editor accepts because
      // the exercise is, right now, counted in repetitions.
      await addRoutine(store, asHisOwn(ROUTINES[0] as Record<string, unknown>, {
        id: 'coach-day-with-a-repetition-override',
        name: 'Coach Day With A Repetition Override',
        entries: [{ exercise_id: timed.id, sets: 3, repetitions: 12 }],
      }));

      // The reset would put the exercise back to time, and his override would contradict it.
      await assert.rejects(
        restoreShippedLibrary(store, { withBackup: false }),
        (error: unknown) => {
          const issues = (error as { issues?: { code: string }[] }).issues ?? [];
          assert.ok(issues.some((issue) => issue.code === 'MISMATCH'),
            `the refusal did not name a measurement mismatch: ${JSON.stringify(issues)}`);
          return true;
        },
      );

      // His edit is still his: nothing was reverted by the refused reset.
      const live = await contentByKey(store, 'exercise');
      assert.equal(live.get(timed.id)?.measurement, 'repetitions');
    });

  it('DOES NOT REFUSE AN ORDINARY RESET — the loosening direction, which is what makes the two above mean something',
    async () => {
      const store = await aSeededStore();
      await anEveningOfEditing(store);
      // A guard that refuses everything passes both tests above and is useless.
      await assert.doesNotReject(restoreShippedLibrary(store, { withBackup: false }));
    });
});

describe('the backup the confirmation offers', () => {
  it('SAVES A REAL FILE COVERING ALL THREE KINDS, and the read goes past the first page', async () => {
    const store = await aSeededStore();

    const reading = await readWholeLibrary(store);
    assert.equal(reading.complete, true);
    // EVERY LIBRARY KIND IS FETCHED, from the model's own list. A backup whose fetch and whose
    // writer disagree about the kinds writes a file that opens cleanly and restores two thirds.
    assert.deepEqual(Object.keys(reading.library).sort(), [...LIBRARY_TYPES].sort());
    for (const kind of LIBRARY_TYPES) {
      assert.ok(reading.library[kind].length > 0, `the backup would carry no ${kind}`);
    }
    // THE PAGING PROOF, and it is measured rather than argued: the store pages at 25 by default and
    // the shipped catalogue is 99, so a first-page reader would be short by three quarters here.
    assert.equal(reading.library.exercise.length, EXERCISES.length);
    assert.ok(EXERCISES.length > 25, 'the shipped catalogue no longer exceeds a page, so this proves nothing');

    const kept: File[] = [];
    const report = await saveLibraryBackup(store, aDownloadThatKeeps(kept));
    assert.equal(kept.length, 1, 'no file reached the browser');
    assert.ok(kept[0].size > 0, 'the file that reached the browser is empty');
    assert.match(kept[0].name, /\.zip$/u);
    assert.equal(report.tone, 'kept');
  });

  it('STOPS THE RESET WHEN THE COPY CANNOT BE SAVED, and leaves the library exactly as it was',
    async () => {
      const store = await aSeededStore();
      const touched = await anEveningOfEditing(store);
      const before = await contentByKey(store, 'exercise');

      await assert.rejects(
        restoreShippedLibrary(store, { withBackup: true, surfaces: aDownloadThatFails() }),
      );

      // HIS EDIT IS STILL THERE. A failed backup followed by a completed reset is the exact
      // sequence the offer exists to prevent, and it is proven by the edit surviving rather than by
      // reading the code that was supposed to prevent it.
      const afterwards = await contentByKey(store, 'exercise');
      assert.equal(afterwards.get(touched.edited.exercise)?.provenance, EDITED_PROVENANCE);
      assert.equal(canonical([...afterwards.keys()].sort()), canonical([...before.keys()].sort()));
    });

  it('RESTORES WHEN THE COPY IS SAVED, so the backup path is not merely a way to fail', async () => {
    const store = await aSeededStore();
    const touched = await anEveningOfEditing(store);
    const kept: File[] = [];

    const result = await restoreShippedLibrary(store, {
      withBackup: true,
      surfaces: aDownloadThatKeeps(kept),
    });

    assert.equal(result.backup, 'taken');
    assert.equal(kept.length, 1);
    // The copy holds the library AS IT WAS, which is the whole reason it is taken inside the reset:
    // his edit is in the file and gone from the library.
    assert.ok(kept[0].size > 0);
    const live = await contentByKey(store, 'exercise');
    assert.equal(live.get(touched.edited.exercise)?.provenance, SEED_PROVENANCE);
  });

  it('CARRIES A DISMISSED SHARE SHEET AS A FAILURE, because nothing was kept', async () => {
    const store = await aSeededStore();
    const surfaces = {
      sharing: {
        canShare: () => true,
        share: () => Promise.reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' })),
      },
      download: { download: () => { throw new Error('never reached'); } },
    } as unknown as BackupSurfaces;

    await assert.rejects(saveLibraryBackup(store, surfaces), (error: unknown) => {
      assert.ok(error instanceof BackupNotKeptError,
        'a dismissed share sheet was not carried as a failed backup');
      return true;
    });
  });
});

describe('what the coach reads', () => {
  /** The plan, from the core, off a real store — never a fixture of what a plan looks like. */
  async function aPlan(edit = true): Promise<ResetPlanReading> {
    const store = await aSeededStore();
    if (edit) await anEveningOfEditing(store);
    return (await readResetPlan(store)) as unknown as ResetPlanReading;
  }

  it('NAMES WHAT IT DESTROYS, and never says the words that would frighten him off a safe act',
    async () => {
      const confirmation = describeResetConfirmation(await aPlan());

      assert.match(confirmation.whatItDestroys, /will be gone/u);
      assert.match(confirmation.whatItDestroys, /Anything you made yourself is left/u);
      // "A fresh slate" is FALSE of this act and was withdrawn once reset was settled as
      // library-only. It would either frighten him off a safe action or teach him the button clears
      // his clients, and the second is worse because he would come to rely on it.
      for (const sentence of [confirmation.whatItDestroys, confirmation.whyItIsInAdmin, confirmation.leftAlone]) {
        assert.doesNotMatch(sentence, /fresh slate|start again|wipe|erase everything/iu);
      }
    });

  it('SAYS WHY THE ACTION LIVES IN ADMIN, and that this is the only way back', async () => {
    const confirmation = describeResetConfirmation(await aPlan());
    assert.match(confirmation.whyItIsInAdmin, /Admin/u);
    assert.match(confirmation.whyItIsInAdmin, /only way back/u);
    // The reason the reset matters at all: the app seeds once and never again on its own.
    assert.match(confirmation.whyItIsInAdmin, /never again on its own/u);
  });

  it('SAYS WHAT IT CANNOT REACH, composed from the kinds the core says it leaves alone', () => {
    // The list is the PLAN's, so a kind the reset starts or stops touching changes this sentence by
    // itself rather than leaving a sentence that used to be true.
    const said = whatIsLeftAlone(['client', 'session', 'diet-plan']);
    assert.match(said, /your clients/u);
    assert.match(said, /your sessions/u);
    assert.match(said, /your diet plans/u);
    assert.doesNotMatch(said, /client\b(?!s)|session\b(?!s)|diet-plan/u,
      'a record kind reached the coach as the machine spells it');
  });

  it('COUNTS AND NOUNS AGREE, in every figure it puts in front of him', async () => {
    const confirmation = describeResetConfirmation(await aPlan());
    for (const line of confirmation.consequences) {
      // Rendered, a plural noun over a count of one reads "1 changes" — the fault the library list
      // shipped with twice, and found both times by reading the screen.
      assert.doesNotMatch(line.value, /^1 \w+s\b/u, `"${line.value}" is plural over a count of one`);
      // A figure or the word for having none of them, never a blank and never a bare digit alone.
      assert.match(line.value, /^(None|\d+ \w)/u, `"${line.value}" is not a figure he can read`);
      // A NOUGHT IS SAID AS A WORD. Three rows reading "0 items" was dry where the sentence is
      // meant to reassure, and the label already carries what the figure is about.
      assert.doesNotMatch(line.value, /^0 /u, `"${line.value}" says nought as a digit`);
    }

    // Each figure has NAMES behind it where there is something to name, so a number he does not
    // believe can be checked without leaving the screen.
    const undone = confirmation.consequences[0];
    assert.match(undone.value, /^3 changes$/u, 'his three edits are not the three changes reported');
    assert.equal(undone.names.length, 3);
    assert.match(undone.names.join(' '), /\(exercise\)/u);
    assert.match(undone.names.join(' '), /\(routine\)/u);
    assert.match(undone.names.join(' '), /\(intensity curve\)/u);
  });

  it('SAYS SO PLAINLY WHEN A RESET WOULD CHANGE NOTHING, and never puts a bare nought in the sentence',
    async () => {
      const confirmation = describeResetConfirmation(await aPlan(false));
      assert.equal(confirmation.changesNothing, true);
      const said = confirmation.changesNothingWords ?? '';
      assert.match(said, /already matches what the app came with/u);
      // FOUND BY READING THE RENDERED CARD on a fresh library, after every property check passed:
      // it said "0 things you made yourself are left alone either way" — true, useless, and it
      // reads as a figure that failed to load, in the one sentence whose whole job is reassurance.
      assert.doesNotMatch(said, /\b0 /u, 'a bare nought reached the coach mid-sentence');
      assert.match(said, /not added anything of your own yet/u);
      // And the loosening direction: where he HAS made something, the figure is still stated.
      const withHisOwn = describeResetConfirmation({
        ...(await aPlan(false)),
        consequences: {
          ...(await aPlan(false)).consequences,
          reverts_coach_edits: 0,
          restores_missing: 0,
          removes_no_longer_shipped: 0,
          leaves_coach_created_untouched: 2,
        },
      });
      assert.match(withHisOwn.changesNothingWords ?? '', /2 things you made yourself are left alone/u);
    });

  it('NEVER SAYS THE SAME SENTENCE TWICE IN ONE CARD, which is exactly what the button did', async () => {
    const confirmation = describeResetConfirmation(await aPlan());
    // The heading, the control that opens the panel, the panel's own title and the three buttons.
    // Rendered, the heading and the opening control were the SAME sentence one under the other and
    // the panel then said it a third time — so a coach wanting to know what would happen had to
    // press what looked like the destructive control to find out. No property check can see this.
    const shown = [
      RESET_TITLE,
      SEE_WHAT_WOULD_CHANGE,
      confirmation.title,
      confirmation.cancelLabel,
      confirmLabelFor('with-backup') ?? '',
      confirmLabelFor('without-backup') ?? '',
    ].map((one) => one.trim().toLowerCase().replace(/[?.]+$/u, ''));

    assert.equal(new Set(shown).size, shown.length,
      `two controls or headings on one card read the same: ${JSON.stringify(shown)}`);
    // NON-VACUITY: the comparison really would collapse duplicates if there were any.
    assert.equal(new Set([...shown, RESET_TITLE.toLowerCase()]).size, shown.length);
  });

  it('OFFERS THE BACKUP FIRST, says what the copy CAN do, and hides the act until it is answered', () => {
    const unanswered = describeBackupOffer('unanswered');
    assert.equal(unanswered.answered, false);
    assert.equal(confirmLabelFor('unanswered'), null,
      'the destructive control has words before the backup question has an answer');
    // THE COPY IS AN UNDO NOW, and this sentence used to say the opposite. `core/backup/` reads this
    // exact file — bare content, no manifest — and `RestoreBackupCard` on this same screen is where
    // he chooses it. A warning that UNDERSTATES what the app can do still misinforms: it would leave
    // him rebuilding a library by hand beside a file that would have put it back.
    assert.match(unanswered.words, /Put a backup back/u, 'it must name where the way back actually is');
    // AND IT MUST NOT CLAIM A DIRECTION THE SCREEN DOES NOT HAVE. This sentence said the restore was
    // "further down this page" while `RestoreBackupCard` renders ABOVE `ResetToDefaultsCard` in
    // `AdminScreen.tsx` — the name was asserted here and the direction never was, so the copy pointed
    // the wrong way with a green suite. Naming the CARD rather than a direction is what makes the
    // sentence survive the screen being reordered, which is a decision the screen owns and this
    // module cannot see.
    assert.ok(
      !/further down|below on this page|lower down/iu.test(unanswered.words),
      'the way back is named as a card, not as a direction this module cannot verify from here',
    );
    assert.match(unanswered.words, /undo what you are about to do/u);
    assert.ok(
      !/cannot yet read/u.test(unanswered.words),
      'the old pessimistic sentence is now false and must not survive anywhere in this copy',
    );
    // It covers what the act destroys and says so — not "back up your data", which would imply his
    // clients and sessions were at risk from a button that cannot reach them.
    assert.match(unanswered.words, /exactly what this button changes and nothing else/u);

    assert.equal(describeBackupOffer('with-backup').answered, true);
    assert.equal(describeBackupOffer('without-backup').answered, true);
    // Taking the copy says the way back exists; DECLINING it says the way back needs a file he is
    // choosing not to make. Both are true and they are different sentences.
    assert.match(describeBackupOffer('with-backup').words, /put it back from this page/u);
    assert.match(describeBackupOffer('without-backup').words, /no file to put back/u);

    // The label on the destructive control CARRIES his answer, so he never has to look in two
    // places to know whether a copy is being taken.
    assert.match(confirmLabelFor('with-backup') ?? '', /Save a copy and restore/u);
    assert.match(confirmLabelFor('without-backup') ?? '', /without a copy/u);
  });

  it('AND THE CLAIM IS TIED TO THE CODE THAT MAKES IT TRUE, not left as prose that can rot', () => {
    // The sentence above promises the coach something about a FILE. This asserts the promise against
    // the thing that keeps it: the reader really does recognise the shape this offer saves. If the
    // reset's file format and the restore's reader ever drift apart, this goes red — rather than the
    // confirmation quietly going on telling him he has an undo he no longer has.
    const parts = {
      'exercise.json': '[]',
      'routine.json': '[]',
      'intensity-pattern.json': '[]',
    };
    const read = readBackupParts(parts);
    assert.equal(read.shape, 'library');
    assert.deepEqual([...read.covers], ['exercise', 'routine', 'intensity-pattern']);
  });

  it('REPORTS ONLY WHAT HAPPENED, from the result rather than from the plan it showed', () => {
    const outcome = describeResetOutcome({
      written: 113, restored: 1, reverted: 3, removed: 0, kept_coach_created: 2,
    });
    // EVERY NON-ZERO FIGURE IS STATED, so the sentence can never be shorter than the truth.
    assert.match(outcome.detail, /3 changes were undone/u);
    assert.match(outcome.detail, /1 item was put back/u);
    assert.match(outcome.detail, /2 things you made yourself were left alone/u);
    // AND NOTHING THAT DID NOT HAPPEN IS REPORTED. Read on the real screen, this sentence carried
    // three noughts, two about things that did not happen and one about something he has none of.
    assert.doesNotMatch(outcome.detail, /\b0 /u, 'the outcome reports something that did not happen');
    assert.doesNotMatch(outcome.detail, /removed/u);
    // The reassurance stands whatever happened, because it is the half he is anxious about.
    assert.match(outcome.detail, /clients, sessions and diet plans were not touched/u);
    assert.equal(outcome.failed, false);

    // A reset that changed nothing says so, rather than listing four things it did not do.
    const quiet = describeResetOutcome({
      written: 113, restored: 0, reverted: 0, removed: 0, kept_coach_created: 0,
    });
    assert.match(quiet.detail, /^Nothing needed changing: it already matched\./u);
    assert.doesNotMatch(quiet.detail, /\b0 /u);
    assert.match(quiet.detail, /clients, sessions and diet plans were not touched/u);
    assert.equal(outcome.failed, false);
  });

  it('SAYS NOTHING WAS CHANGED WHEN THE RESET DID NOT RUN, in the refusal\'s own words', () => {
    const outcome = describeResetFailure(new Error('the browser refused to save the file'));
    assert.equal(outcome.failed, true);
    assert.match(outcome.headline, /nothing was changed/u);
    assert.match(outcome.detail, /the browser refused to save the file/u,
      'the refusal was reworded instead of being carried through');
  });

  it('NAMES THE THREE LIBRARY KINDS FROM THE CORE\'S OWN LIST, including intensity curves', () => {
    const phrase = kindsPhrase(SEED_TYPES);
    assert.match(phrase, /exercises/u);
    assert.match(phrase, /routines/u);
    // The kind that became editable only in this step and that a sentence typed from an older
    // mental model leaves out.
    assert.match(phrase, /intensity curves/u);
    assert.doesNotMatch(phrase, /intensity-pattern/u);
  });
});

describe('the absence-shaped rules, scanned over a scope discovered at runtime', () => {
  /**
   * EVERY SENTENCE THIS MODULE PUTS IN FRONT OF THE COACH, discovered from its own exports.
   *
   * The scope is DERIVED, never listed: a sentence added to the module tomorrow is scanned tomorrow.
   * A hand-written list of constants is a list that falls behind the file it describes, and it falls
   * behind silently — the new sentence is simply not checked, and everything still passes.
   */
  function everySentence(): { where: string; text: string }[] {
    const found: { where: string; text: string }[] = [];

    for (const [name, value] of Object.entries(words as Record<string, unknown>)) {
      if (typeof value === 'string') found.push({ where: name, text: value });
    }

    // The DERIVED sentences too, not only the constants — most of what he reads is composed.
    const plan: ResetPlanReading = {
      consequences: {
        restored_record_types: [...SEED_TYPES],
        reverts_coach_edits: 2,
        restores_missing: 1,
        removes_no_longer_shipped: 1,
        leaves_coach_created_untouched: 1,
        untouched_record_types: ['client', 'session', 'performed-record', 'reading', 'session-note', 'diet-plan'],
      },
      will_revert: [{ type: 'routine', name: 'Legs Strength' }],
      will_restore: [{ type: 'exercise', name: 'Back Squat' }],
      will_remove: [{ type: 'intensity-pattern', name: 'Old Curve' }],
      shipped_counts: { exercise: 99, routine: 7, 'intensity-pattern': 7 },
    };

    const confirmation = describeResetConfirmation(plan);
    found.push({ where: 'confirmation.title', text: confirmation.title });
    found.push({ where: 'confirmation.whatItDestroys', text: confirmation.whatItDestroys });
    found.push({ where: 'confirmation.whyItIsInAdmin', text: confirmation.whyItIsInAdmin });
    found.push({ where: 'confirmation.leftAlone', text: confirmation.leftAlone });
    found.push({ where: 'confirmation.cancelLabel', text: confirmation.cancelLabel });
    for (const line of confirmation.consequences) {
      found.push({ where: `consequence.${line.label}`, text: `${line.label} ${line.value} ${line.names.join(' ')}` });
    }

    const nothing = describeResetConfirmation({
      ...plan,
      consequences: {
        ...plan.consequences, reverts_coach_edits: 0, restores_missing: 0, removes_no_longer_shipped: 0,
      },
    });
    found.push({ where: 'confirmation.changesNothingWords', text: nothing.changesNothingWords ?? '' });

    for (const state of ['unanswered', 'with-backup', 'without-backup'] as const) {
      const offer = describeBackupOffer(state);
      found.push({ where: `offer.${state}`, text: `${offer.heading} ${offer.words} ${offer.takeLabel} ${offer.declineLabel}` });
      found.push({ where: `confirmLabel.${state}`, text: confirmLabelFor(state) ?? '' });
    }

    const outcome = describeResetOutcome({
      written: 113, restored: 1, reverted: 1, removed: 1, kept_coach_created: 1,
    });
    found.push({ where: 'outcome', text: `${outcome.headline} ${outcome.detail}` });

    return found.filter((one) => one.text.trim().length > 0);
  }

  /**
   * "THE REST" MEANING "THE REMAINDER", which this application may never say.
   *
   * `rest seconds` is a field on the very screens this button restores, so the phrase reads as the
   * rest period and produces a contradiction. It was found on a real screen after every property
   * check had passed, and it is the only defect class in this file that no assertion about intent
   * could catch.
   */
  const REST_AS_REMAINDER = /\b(the|and the|for the) rest\b(?! (period|between|seconds|of \d))/iu;

  /** No emoji in any user-facing string. Bound through token roles, never through a glyph in prose. */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/u;

  it('NEVER USES "REST" TO MEAN "THE REMAINDER", and the scan is shown able to catch it', () => {
    const sentences = everySentence();
    // NON-VACUITY: a scan whose whole output is an absence proves nothing unless it is shown to
    // have looked at something. Twenty is a floor, not a count — it only has to be a real number.
    assert.ok(sentences.length >= 20,
      `the scan found only ${String(sentences.length)} sentences, so its silence means nothing`);

    // THE POSITIVE CONTROL, in the same run: the matcher catches the phrase where it demonstrably
    // is. A pattern that could never match produces exactly the same clean result as clean prose.
    assert.match('Your edits go back and the rest of your library is left alone', REST_AS_REMAINDER);
    // And the loosening direction, so the guard is not one that refuses everything: the field's own
    // name in its own sense must still be sayable.
    assert.doesNotMatch('Ninety seconds rest between sets', REST_AS_REMAINDER);

    for (const { where, text } of sentences) {
      assert.doesNotMatch(text, REST_AS_REMAINDER,
        `${where} says "the rest" where it means the remainder, on a screen with a field called rest`);
    }
  });

  it('CARRIES NO EMOJI ANYWHERE, and the scan is shown able to catch one', () => {
    const sentences = everySentence();
    assert.ok(sentences.length >= 20);
    assert.match('All done \u{1F389}', EMOJI);
    for (const { where, text } of sentences) {
      assert.doesNotMatch(text, EMOJI, `${where} carries an emoji`);
    }
  });

  it('CLAIMS NOTHING ABOUT COMPLIANCE, CERTIFICATION OR SAFETY', () => {
    const forbidden = /HIPAA|GDPR|compliant|certified|endorsed|approved by|guaranteed|bank[- ]grade/iu;
    const sentences = everySentence();
    assert.ok(sentences.length >= 20);
    assert.match('This export is HIPAA compliant', forbidden);
    for (const { where, text } of sentences) {
      assert.doesNotMatch(text, forbidden, `${where} makes a claim this application may not make`);
    }
  });
});

describe('the control is really on the admin screen', () => {
  const ADMIN: Destination = (() => {
    const found = DESTINATIONS.find((destination) => destination.path === 'admin');
    if (found === undefined) throw new Error('there is no admin destination to render');
    return found;
  })();

  /** The admin screen, inside the providers `App.tsx` wires around it. */
  function paint(): string {
    const screen: ReactNode = createElement(AdminScreen, { destination: ADMIN });
    return renderToStaticMarkup(
      createElement(LocalStoreProvider, {
        opening: { state: 'opening' },
        children: createElement(PlatformStatusProvider, {
          status: { buildStamp: 'test-build', persistence: null, offlineStart: { registered: true, reason: null } },
          children: createElement(SyncStatusProvider, {
            reading: NO_BACKUP_YET,
            children: createElement(DivergenceProvider, {
              reading: NOTHING_TO_DECIDE,
              children: createElement(KeyMaterialProvider, {
                reading: NO_KEY_MATERIAL_CONDITION,
                children: createElement(StoppedChangesProvider, {
                  reading: NOTHING_STOPPED,
                  children: createElement(RemovalsProvider, {
                    reading: NOTHING_AWAITING_REMOVAL,
                    children: createElement(MemoryRouter, { children: screen }),
                  }),
                }),
              }),
            }),
          }),
        }),
      } as never),
    );
  }

  it('DRAWS THE CONTROL AND WHAT IT DESTROYS, on the real rendered screen', () => {
    const painted = paint();
    // The caller is proven by RENDERING rather than by grepping for an import: a card imported and
    // never mounted, or mounted behind a condition that never holds, passes every grep there is.
    assert.ok(painted.includes(RESET_TITLE), 'the reset control is not on the rendered admin screen');
    assert.ok(painted.includes(SEE_WHAT_WOULD_CHANGE), 'nothing on the screen opens the panel');
    assert.ok(painted.includes('will be gone'),
      'the screen does not say what the reset destroys before he opens anything');
    // THE POSITIVE CONTROL for a render assertion: a string that is demonstrably not there.
    assert.equal(painted.includes('Restore the library the app never came with'), false);
  });
});

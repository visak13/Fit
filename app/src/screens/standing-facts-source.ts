/**
 * WHERE THE STANDING FACTS COME FROM — the read, and none of the words.
 *
 * ## The window this closes, in the core's own words
 *
 * `core/outbox/scrub.js` leaves ONE kind of queued entry exactly as it is: an opaque payload whose
 * refs name the departed client AND somebody who is staying. It cannot be cleaned without destroying
 * the staying client's data, so it is left alone and reported `unresolved`. `core/INTEGRATION.md` §4
 * says in as many words that the conservative choice is CORRECT and is not being asked to change.
 *
 * `src/screens/removals.ts` says so — **only while that removal's manifest is still pending**. Once
 * the core confirms the removal propagated, the manifest leaves `pendingDeletions`, and the queued
 * entry, which was never touched by any of that, SURVIVES INDEFINITELY AND STOPS BEING MENTIONED
 * ANYWHERE. A departed client's data goes on sitting in his outbox with nothing telling him.
 *
 * That is what this read is for, and it is why it may not read `pendingDeletions`: the whole gap is
 * the removals that have LEFT that set.
 *
 * ## WHY IT IS NOT A NEEDS-ATTENTION ENTRY, WHICH IS THE OBVIOUS FIX
 *
 * `core/status/levels.js` floors the ladder at `overdue` while any needs-attention entry exists, and
 * this entry is uncleanable BY DESIGN — so counting it would pin the one indicator the coach is meant
 * to trust at overdue for ever, on a condition he can never clear. A permanent alarm is what teaches
 * him to ignore all of them, after which it cannot warn him when something is genuinely wrong.
 *
 * **Nothing in this file writes anything.** It is two reads and a lookup, so the ladder cannot move
 * because of it — a property `standing-facts.test.ts` proves by COMPARING the whole accountability
 * status before and after this read, rather than by asserting that no write was intended.
 *
 * ## THE SCOPE IS DISCOVERED, NEVER TYPED
 *
 * Every guard failure in this build traces to a hand-typed scan scope that quietly stopped matching
 * the world. So: the manifests are PAGED out of the deletions store — every status, not a chosen one
 * — and the entry identities come from what the purges themselves reported. Nothing here names an
 * entry, a client or a reason. What is read is whatever the store holds.
 *
 * And the reading carries {@link StandingFactsReading.manifestsRead} so a test can prove the scope
 * was not empty in the same run that proves a planted entry was found: a reader that finds nothing
 * and a reader that CAN find nothing are indistinguishable on a healthy store, and the second one
 * ships as a permanently empty surface that reads as good news.
 *
 * ## THE FACT IS "THE ENTRY STILL EXISTS", ASKED OF THE QUEUE
 *
 * A manifest records what was unresolved AT THE MOMENT OF THE PURGE. That is history, and history is
 * not a standing fact: the entry can be delivered and pruned, or removed by a later purge of the
 * staying client. So each reported identity is looked up in the outbox NOW, and only the ones the
 * queue still holds are carried. When the entry finally goes, this surface stops saying it — which is
 * the difference between a statement and a scar.
 */

import { getEntry } from '../../core/outbox/queue.js';
import { DELETIONS_STORE } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';
import type { DeletionManifest, UnresolvedEntry } from './removals';

/** How many manifests one page of the walk reads. The core's own default, named rather than implied. */
export const MANIFEST_PAGE_LIMIT = 25;

/**
 * How many pages the walk will take before it stops and SAYS it stopped.
 *
 * A ceiling rather than an unbounded loop, because a restored backup can produce many manifests at
 * once and this read runs on the admin screen. It is high enough that reaching it means something
 * unusual, and reaching it is REPORTED rather than silently truncated — see
 * {@link StandingFactsReading.complete}. A surface that quietly stopped looking would be the
 * permanently-empty defect wearing a bound.
 */
export const MANIFEST_PAGE_CEILING = 40;

/** One queued delivery that is still on this device, and the removal that could not clean it. */
export interface StandingResidual {
  /** The removal this came out of. The reference somebody helping him would ask for. */
  readonly deletionId: string;
  /** The departed client's identity. The only thing the manifest keeps about them, on purpose. */
  readonly subjectClientId: string;
  /** When the coach removed them. Literal: the instant is the evidence. */
  readonly removedAt: string;
  /** Whether the removal itself has since been confirmed — the window that used to hide this. */
  readonly removalStatus: string;
  /** The queued delivery, by identity. */
  readonly entryId: string;
  /** The declared CODE from `core/outbox/scrub.js`. Never a message, never a sentence. */
  readonly why: string;
  /** Which record identities of theirs the sweep saw named in it. Identities only. */
  readonly recordIds: readonly string[];
  /** The entry's own status word, as the queue holds it. Carried as evidence, never as a promise. */
  readonly entryStatus: string;
}

/**
 * What is standing on this device right now, and how much was looked at to find out.
 *
 * The counts are not decoration. `manifestsRead` is the DISCOVERED scope and `reportedUnresolved` is
 * what the purges themselves recorded; together they are what makes an empty `standing` list mean
 * "nothing is left behind" rather than "nothing was looked at".
 */
export interface StandingFactsReading {
  /** Every deletion manifest this walk read, whatever its status. The scope, measured. */
  readonly manifestsRead: number;
  /** How many unresolved entries those manifests reported, historically. */
  readonly reportedUnresolved: number;
  /** Those whose queued entry the outbox STILL holds. The standing facts themselves. */
  readonly standing: readonly StandingResidual[];
  /** False when the walk hit {@link MANIFEST_PAGE_CEILING} before the end of the list. */
  readonly complete: boolean;
}

/**
 * Nothing has been read yet — and it is NOT the same value as "nothing is standing".
 *
 * A screen that cannot tell those apart says "nothing was left behind" on the strength of never
 * having looked, which is the reassuring answer arrived at by not looking. So the reading is `null`
 * until a real read lands, and the card words that state itself.
 */
export const NOTHING_READ_YET: null = null;

/** One page of manifests exactly as the core paged it. `done` is what ends the walk honestly. */
interface ManifestPage {
  readonly items: readonly DeletionManifest[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** Every deletion manifest this device holds, paged, whatever status it is in. */
async function readManifests(
  store: LocalStore,
): Promise<{ manifests: DeletionManifest[]; complete: boolean }> {
  const manifests: DeletionManifest[] = [];
  let after: string | null = null;

  for (let pages = 0; pages < MANIFEST_PAGE_CEILING; pages += 1) {
    const cursor: string | null = after;
    // The core is plain ECMAScript typed in documentation comments, so the page's shape is stated
    // where it is used — as `removals.ts` states the manifest's, and for the same reason.
    // eslint-disable-next-line no-await-in-loop
    const page: ManifestPage = await store.read(DELETIONS_STORE, (scope) => scope.page({
      store: DELETIONS_STORE,
      limit: MANIFEST_PAGE_LIMIT,
      after: cursor,
    }));

    manifests.push(...page.items);
    if (page.done || page.items.length === 0) return { manifests, complete: true };
    after = page.cursor;
  }

  return { manifests, complete: false };
}

/**
 * Everything standing on this device, read from the store as it is right now.
 *
 * TWO READS AND A LOOKUP PER REPORTED ENTRY. The lookup is what makes this a statement about the
 * present rather than a recital of what a purge once found: an entry that has since been delivered
 * and pruned, or swept by a later purge, is not carried and this surface goes quiet about it.
 */
export async function readStandingFacts(store: LocalStore): Promise<StandingFactsReading> {
  const { manifests, complete } = await readManifests(store);

  const reported: { manifest: DeletionManifest; unresolved: UnresolvedEntry }[] = [];
  for (const manifest of manifests) {
    for (const unresolved of manifest.outbox?.unresolved ?? []) {
      reported.push({ manifest, unresolved });
    }
  }

  const standing: StandingResidual[] = [];
  for (const { manifest, unresolved } of reported) {
    // eslint-disable-next-line no-await-in-loop
    const entry = await getEntry(store, unresolved.entry_id);
    if (entry === undefined) continue;

    standing.push({
      deletionId: manifest.deletion_id,
      subjectClientId: manifest.subject_client_id,
      removedAt: manifest.requested_at,
      removalStatus: manifest.status,
      entryId: unresolved.entry_id,
      why: unresolved.why,
      recordIds: unresolved.record_ids,
      entryStatus: String((entry as { status?: unknown }).status ?? 'unknown'),
    });
  }

  return { manifestsRead: manifests.length, reportedUnresolved: reported.length, standing, complete };
}

/**
 * Read, and publish unless the caller has gone.
 *
 * A failure publishes NOTHING and is reported to the console, for the same reason the register's read
 * does it: an empty reading here says "nothing of anybody's was left behind on this device", and
 * producing that sentence out of a failed read would be this application inventing the reassuring
 * answer. The card stays in its "not known yet" state instead, which is true.
 *
 * @returns cancel
 */
export function publishStandingFacts(
  store: LocalStore,
  publish: (reading: StandingFactsReading) => void,
): () => void {
  let live = true;

  void readStandingFacts(store).then(
    (reading) => {
      if (live) publish(reading);
    },
    (error: unknown) => {
      console.error('[standing-facts] the local store could not be read for standing facts', error);
    },
  );

  return () => {
    live = false;
  };
}

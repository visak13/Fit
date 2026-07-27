/**
 * WHERE THE REGISTER'S FACTS COME FROM — every read and every write, extracted from the component.
 *
 * ## THIS SCREEN TAKES THE STORE RATHER THAN GROWING A SIXTH SEAM, AND HERE IS WHY
 *
 * The five reporting seams in `main.tsx` each carry a READING: a frozen page of facts pushed down
 * from above, with nothing callable on it. `shell/seams.test.ts` holds all five to that shape and
 * asserts that only the divergence seam may carry a way to act, because the other four are surfaces
 * the coach is TOLD things by, and a control arriving on one as a convenience is the defect that
 * test exists to catch.
 *
 * **The client register is the first READ-WRITE surface in this application.** The form must call a
 * create, and the list must re-read afterwards or the coach adds somebody and does not see them.
 * Neither is expressible on a reporting seam, and bending one to carry them would weaken the rule
 * for the four surfaces it protects.
 *
 * So the register takes the STORE, from `platform/LocalStore.tsx`, whose own header says in as many
 * words that it is THE SOURCE the five seams are fed from and NOT a sixth one — a live resource with
 * methods on it, which is precisely the thing a reading may never be. Nothing about the five-seam
 * property changes, and `seams.test.ts` is untouched.
 *
 * WHAT A LATER READ-WRITE SCREEN SHOULD COPY: this file, not a new idea. The reads and the write are
 * plain functions taking a store, so they are driven in a test against a REAL store on the core's own
 * platform double — the same reason `beginOpening` and `readPendingRemovals` were extracted from
 * their components. A static render never runs an effect, so logic living inside one is logic nothing
 * can check.
 *
 * ## NOTHING HERE VALIDATES A CLIENT
 *
 * `core/model/entities/client.js` is the schema and it is sealed. The field list, the length bounds,
 * the refusal of contact and identifying information by name, and the pairing of a reference pointer
 * with its label are ITS rules, checked by `store.create` on the way in. This file offers the draft
 * and lets the record answer. A check here would be a second copy that drifts, and the drift would be
 * silent — the screen would refuse something the record allows, or allow something it refuses.
 *
 * ## THE THREE REMOVAL WRITES CALL THE CORE'S OWN OPERATIONS AND ADD NOTHING
 *
 * `core/store/purge.js` already holds archiving, restoring and the purge, and the purge is the one
 * operation in this application it would be most damaging to write a second version of: it commits in
 * ONE transaction, it revises a shared session rather than deleting somebody else's history, it
 * sweeps the outbox — where a departed client's name was measured still living on — and it leaves a
 * manifest of identities and no content so the removal can reach the backup. Every one of those is a
 * property somebody had to discover. The functions below pass a client identity to it and hand back
 * what it returned; there is no second deletion routine anywhere in the interface.
 *
 * ## NOTHING IS CONVERTED ON THE WAY OUT
 *
 * The page goes to the screen as the core paged it: items, cursor and `done`. `clients.ts` is where a
 * record becomes words, and it takes the record whole. Dropping the cursor would silently turn "there
 * are more than these" into a claim that this is all of them.
 */

import {
  archiveClient, listClients, purgeClient, restoreClient, sessionCountForClient,
} from '../../core/store/store.js';
import { readLastCompletedSync } from '../../core/status/status.js';
import type { LocalStore } from '../../core/store/store.js';
import type { ClientDraft, ClientRecord, RegisterEntry, RegisterPage } from './clients';
import type { DeletionManifest } from './removals';

/**
 * How many people are read in one page.
 *
 * The core's own default, named here rather than left implicit, because the screen tells the coach
 * "there are more than these" off the back of it. Client volumes are unknown and cannot be clarified
 * — a dozen or two hundred — so the register is paged through the core's own cursor and never loads
 * everything in order to count it.
 */
export const REGISTER_PAGE_LIMIT = 25;

/** What a read of the register was asked for. */
export interface RegisterQuery {
  /** Archived clients are REACHABLE rather than hidden, and the ordinary path is the active ones. */
  readonly includeArchived: boolean;
  /** The cursor from the previous page, or null for the first. */
  readonly after: string | null;
}

/** The first page, active clients only. One value so the screen's initial state is not a literal. */
export const FIRST_PAGE: RegisterQuery = Object.freeze({ includeArchived: false, after: null });

/**
 * One page of the register, with each person's session count beside them.
 *
 * THE COUNT IS ASKED PER ROW, and it is an indexed count rather than a walk of anybody's history —
 * `sessionCountForClient` asks the platform how many entries a key range holds. It is asked for the
 * page only, never for the register, which is the property that keeps a coach with two hundred
 * clients paying the same as one with a dozen.
 */
export async function readRegisterPage(
  store: LocalStore,
  query: RegisterQuery = FIRST_PAGE,
): Promise<RegisterPage> {
  const page = await listClients(store, {
    limit: REGISTER_PAGE_LIMIT,
    after: query.after,
    includeArchived: query.includeArchived,
  });

  const items: RegisterEntry[] = await Promise.all(
    (page.items as ClientRecord[]).map(async (client) => ({
      client,
      sessionCount: await sessionCountForClient(store, client.record_id),
    })),
  );

  return { items, cursor: page.cursor, done: page.done };
}

/**
 * Read a page and publish it, dropping a page that arrives after the caller has gone.
 *
 * A failure is reported to the console and NOTHING is published. That is deliberate: an empty page
 * says "nobody is on your register yet", and publishing it after a failed read would tell a coach
 * with forty clients that he has none — the reassuring answer, arrived at by not having looked. The
 * screen guards on the store's own state instead, and says what it does not know.
 *
 * @returns cancel
 */
export function readRegister(
  store: LocalStore,
  query: RegisterQuery,
  publish: (page: RegisterPage) => void,
): () => void {
  let live = true;

  void readRegisterPage(store, query).then(
    (page) => {
      if (live) publish(page);
    },
    (error: unknown) => {
      console.error('[clients] the register could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/**
 * The next page joined onto the one already on screen.
 *
 * A pure function rather than a merge written inside the component, because it is the one place a
 * page can be LOST: keeping the older cursor would ask for the same page for ever, and keeping the
 * older `done` would either hide the rest of the register or claim there is more when there is not.
 * The items accumulate; the cursor and the end marker always come from the newer read.
 */
export function appendPage(held: RegisterPage, next: RegisterPage): RegisterPage {
  return {
    items: [...held.items, ...next.items],
    cursor: next.cursor,
    done: next.done,
  };
}

/**
 * Add a client, and resolve only once the write has COMMITTED.
 *
 * `store.create` does not resolve before the transaction completed, and a failure throws rather than
 * returning a status — so nothing may be reported to the coach as saved until this resolves. What it
 * throws on a refused draft is the record's own `StoreValidationError`, issues intact, which
 * `describeRefusal` in `clients.ts` puts labels in front of and rewords nowhere.
 *
 * THE ONE THING THIS DOES TO THE DRAFT is trim the edges of the name and the adaptation flag, and
 * omit the flag entirely when nothing is left. That is presentation, not a rule: leading spaces in a
 * name are never intended, and an EMPTY flag and an ABSENT flag are different things to the record —
 * the field is optional, and writing an empty string would record that he answered when he did not.
 * Notes are stored exactly as typed, because the shape of a paragraph is his.
 *
 * Whether the trimmed name is acceptable is still the record's answer, not this function's: a name of
 * nothing but spaces is refused by the schema, with the schema's own sentence.
 */
export async function registerClient(store: LocalStore, draft: ClientDraft): Promise<ClientRecord> {
  const flag = draft.adaptationFlag.trim();

  const content: Record<string, unknown> = {
    name: draft.name.trim(),
    notes: draft.notes,
    active: true,
  };
  if (flag.length > 0) content.adaptation_flag = flag;

  return (await store.create('client', content)) as ClientRecord;
}

/**
 * Archive a client: off the register, still in the history. The ordinary path, and reversible.
 *
 * It resolves once the revision has COMMITTED, for the same reason {@link registerClient} does:
 * nothing may be reported to the coach as done before it is done.
 */
export async function archiveOnRegister(store: LocalStore, clientId: string): Promise<ClientRecord> {
  return (await archiveClient(store, clientId)) as ClientRecord;
}

/** Bring an archived client back. The other half of the reversible pair. */
export async function restoreOnRegister(store: LocalStore, clientId: string): Promise<ClientRecord> {
  return (await restoreClient(store, clientId)) as ClientRecord;
}

/**
 * Remove a client and everything of theirs from this device, and leave the notice that carries the
 * removal outward.
 *
 * THE MANIFEST IS RETURNED RATHER THAN DISCARDED, and the screen needs it: a removal that has
 * committed locally is NOT a removal that has reached the backup, and the manifest is the only thing
 * that knows the difference. Swallowing it here would leave the interface with nothing to be honest
 * with.
 *
 * A failure throws, with the core's own error — a client identity that is not there, or a shared
 * session that could not be revised without becoming invalid. Both leave the transaction unwritten,
 * so nothing is half-removed, and the screen shows what was thrown rather than a sentence of its own.
 */
export async function removeClientForGood(
  store: LocalStore,
  clientId: string,
): Promise<DeletionManifest> {
  return (await purgeClient(store, clientId)) as DeletionManifest;
}

/**
 * THE REGISTER HAS NO READ OF ITS OWN FOR PENDING REMOVALS, AND THAT IS THE FIX RATHER THAN A GAP.
 *
 * There used to be a `readRegisterRemovals` here, delegating to `shell/removals-source.ts`, and the
 * reason was written down: the pending-removal seam filled ONCE per store and could not refresh, so
 * a register that took the seam would have told a coach who had just removed somebody that nothing
 * was waiting. That reason has stopped being true. The seam re-reads when a removal COMMITS on this
 * device — `platform/local-store.ts` holds the signal and `shell/RemovalsFromStore.tsx` consumes it
 * — so the second reader was two readers of one fact, and two readers of one fact eventually
 * disagree in front of the coach.
 *
 * The register now RAISES the signal, from `useLocalRemovals`, immediately after
 * {@link removeClientForGood} resolves, and reads the seam like every other surface. It is stated
 * here rather than left as an absence, because the absence is what a later author would fill back in.
 */

/**
 * WHETHER THIS DEVICE HAS EVER SYNCHRONISED — the one fact behind the protected field's sentence.
 *
 * ## Named for the argument it exists to fill, deliberately
 *
 * `establishKeyMaterial` in `core/crypto/guard.js` takes `ctx.hasEverSynchronised` and refuses on
 * false, because a device that cannot list the hidden space cannot know whether a key already exists,
 * and creating a second one splits the ciphertext silently and unrecoverably. The guard performs NO
 * detection of its own — a caller hands it the answer — so asking the guard why it says no is asking
 * a mirror. Nothing in the interface calls it yet; when something does, IT PASSES THIS IN rather than
 * working the answer out again.
 *
 * That is the whole reason this is here instead of a boolean local to the screen. If the register
 * decided connectedness one way and the guard were told another, the field would go on telling the
 * coach to connect an account that is already connected — no error anywhere, and the only symptom a
 * sentence that quietly stopped being true.
 *
 * ## What it reads, and why that is the same fact rather than a proxy for it
 *
 * `core/status/completion.js` holds ONE persisted answer to "has a real backup ever finished":
 * `readLastCompletedSync`, whose value can only have been written by `recordCompletedSync` from a
 * flush that genuinely drained the queue. A null completion means never, and it is never a guess —
 * `core/status/surface.js` derives its own `never_synchronised` from exactly this call, so the
 * register and the accountability indicator cannot disagree.
 *
 * **AND SOMETHING NOW WRITES ONE.** `shell/sync-runner.ts` hands a live pass's report straight to
 * `recordCompletedSync`, so this answers TRUE on a device that has genuinely backed up — which it
 * could not do while the join was missing. That is why the sentences around it were re-read rather
 * than assumed still right, and why `client-register-source.test.ts` proves the consequence by
 * running a real pass and then saving a note that was refused before it.
 *
 * IT IS STRICTER THAN THE GUARD'S QUESTION, and that is stated rather than glossed: the guard asks
 * whether this device has ever REACHED the hidden space, and this asks whether a synchronisation has
 * ever COMPLETED. Those come apart, and NOW THEY COME APART IN PRACTICE rather than only in
 * principle: passes really run, and a pass that meets a service failure or a file it cannot read
 * reaches the remote and earns no completion. It stays the safe direction — it can only ever refuse
 * a clinical note that might have been allowed, never allow one that should have been refused, and
 * the refusal is what protects the key.
 *
 * The two questions are also still asked of DIFFERENT SPACES: a pass works the visible one
 * (`DEFAULT_SPACE` in `core/sync/engine.js`), and the hidden one is reached only by
 * `establishKeyMaterial`, which nothing in the interface calls. The step that wires THAT should
 * narrow this to what it actually observes, HERE, in this one function.
 *
 * A store that cannot answer is reported as never synchronised, for the same reason: the false
 * direction that costs something is the reassuring one.
 */
export async function hasEverSynchronised(store: LocalStore): Promise<boolean> {
  try {
    const { completion } = await readLastCompletedSync(store);
    return completion !== null;
  } catch (error) {
    console.error('[clients] this device’s last backup could not be read', error);
    return false;
  }
}

/**
 * Ask whether this device has synchronised and publish the answer, dropping one that arrives late.
 *
 * Extracted for the same reason as the read above: a static render never runs an effect.
 *
 * @returns cancel
 */
export function readEverSynchronised(
  store: LocalStore,
  publish: (everSynchronised: boolean) => void,
): () => void {
  let live = true;

  void hasEverSynchronised(store).then((answer) => {
    if (live) publish(answer);
  });

  return () => {
    live = false;
  };
}

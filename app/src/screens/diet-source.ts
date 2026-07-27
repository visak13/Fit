/**
 * WHERE THE DIET SCREEN'S FACTS COME FROM — every read, extracted from the component.
 *
 * This screen only READS, so there is no write here and no seam question to settle: it takes the
 * STORE from `platform/LocalStore.tsx` the way `client-register-source.ts` does, because it needs a
 * read that depends on WHICH client the coach picked, and a reporting seam is a frozen page pushed
 * down from above that cannot answer a question. `client-register-source.ts` states in its own
 * header that a later screen should copy it rather than invent a sixth seam, and this is that.
 *
 * The reads are plain functions taking a store, so they are driven in a test against a REAL store on
 * the core's own platform double. A static render never runs an effect, so a read living inside a
 * component is a read nothing can check.
 *
 * ## NO QUERY IS WRITTEN HERE — `core/store/queries.js` ALREADY HAS THEM
 *
 * `listClients` for the picker and `dietPlansForClient` for one person's plans, both existing and
 * both indexed. Nothing below walks a store or filters a page by hand.
 *
 * **`dietPlanForClient` IS DELIBERATELY NOT CALLED, AND THAT IS A JUDGEMENT RATHER THAN AN
 * OVERSIGHT.** It reads the `by_client_status` index with `limit: 1`, so when two plans are both
 * marked current — two devices, or a new plan made current before the old one was marked past — it
 * returns whichever the index reaches first, silently. `core/diet/history.js` exists precisely to
 * refuse that: it reports `current` as null, names every claimant, and says in plain words that the
 * application will not choose between them, because the alternative is a coach shown one plan,
 * acting on it, and never learning the other existed. Calling both would also be TWO READERS OF ONE
 * FACT, which this application has already had to converge once on the register. So the plans are
 * read once, whole, and the projection decides which is current.
 *
 * ## A FAILED READ PUBLISHES NOTHING
 *
 * The same rule the register and the launchpad follow, for the same reason: an empty page says "this
 * client has no diet plan yet", and publishing it after a failed read would tell a coach that a
 * plan he transcribed last week is gone — the reassuring answer, arrived at by not having looked.
 * The screen guards on the store's own state instead and says what it does not know.
 */

import { dietPlansForClient, listClients } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';
import type { DietClient, DietPlanRecord } from './diet';

/**
 * How many people the picker offers at once.
 *
 * The register's own page size, named here rather than left implicit, because the screen tells the
 * coach "there are more than these" off the back of it. Client volumes are unknown and cannot be
 * clarified — a dozen or two hundred — so the picker is paged rather than loading everybody in
 * order to count them.
 */
export const DIET_CLIENT_PAGE_LIMIT = 25;

/**
 * How many of one client's plans are read at once.
 *
 * A client accumulates plans slowly — a nutritionist revises a chart every few weeks — so this is
 * comfortably the whole history for anybody real. It is still PAGED rather than unbounded, and the
 * page's own `done` is carried through to the screen: a history that stopped short is reported as
 * possibly incomplete rather than presented as all of it.
 */
export const DIET_PLAN_PAGE_LIMIT = 50;

/** A page of records exactly as the core paged it. `done` is carried, never dropped. */
interface Page<T> {
  readonly items: readonly T[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** A client record, in the one shape this screen reads off it. */
interface ClientRecord {
  readonly record_id: string;
  readonly content: { readonly name: string };
}

/** The picker's page: the people he can choose between. */
export interface ClientChoices {
  readonly items: readonly DietClient[];
  readonly done: boolean;
}

/** One client's plans, as the store paged them. */
export interface ClientPlans {
  readonly items: readonly DietPlanRecord[];
  readonly done: boolean;
}

/**
 * The people the coach can look at.
 *
 * ACTIVE CLIENTS ONLY, which is the same call the launchpad makes and for the same reason: an
 * archived client is somebody he has put away, and offering them here would undo the archiving.
 * Archived is reachable under Clients, which is where it belongs.
 */
export async function readDietClients(store: LocalStore): Promise<ClientChoices> {
  const page = (await listClients(store, {
    limit: DIET_CLIENT_PAGE_LIMIT,
    includeArchived: false,
  })) as Page<ClientRecord>;

  return {
    items: page.items.map((client) => ({ recordId: client.record_id, name: client.content.name })),
    done: page.done,
  };
}

/**
 * One client's diet plans — current, past, drafts, all of them, in one read.
 *
 * They come back UNCONVERTED, as the store holds them. `core/diet/` is where a plan becomes a chart
 * or a history, and both projections take the record whole; reshaping one on the way out would be a
 * second idea of what a plan is, living in the one place nothing validates it.
 */
export async function readDietPlans(store: LocalStore, clientId: string): Promise<ClientPlans> {
  const page = (await dietPlansForClient(store, clientId, {
    limit: DIET_PLAN_PAGE_LIMIT,
  })) as Page<DietPlanRecord>;

  return { items: page.items, done: page.done };
}

/**
 * Read the picker and publish it, dropping a page that arrives after the caller has gone.
 *
 * @returns cancel
 */
export function readDietClientsInto(
  store: LocalStore,
  publish: (choices: ClientChoices) => void,
): () => void {
  let live = true;

  void readDietClients(store).then(
    (choices) => {
      if (live) publish(choices);
    },
    (error: unknown) => {
      console.error('[diet] the register could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/**
 * Read one client's plans and publish them, dropping a read that arrives after the caller has gone.
 *
 * The cancel matters more here than on a one-shot read: the coach taps down a list of names, and
 * without it the answer for the third person can arrive after the answer for the fourth and leave
 * the wrong diet on screen under the right name.
 *
 * @returns cancel
 */
export function readDietPlansInto(
  store: LocalStore,
  clientId: string,
  publish: (plans: ClientPlans) => void,
): () => void {
  let live = true;

  void readDietPlans(store, clientId).then(
    (plans) => {
      if (live) publish(plans);
    },
    (error: unknown) => {
      console.error('[diet] this client’s diet plans could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

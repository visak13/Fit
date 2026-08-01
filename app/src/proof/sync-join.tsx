/**
 * A SECOND COMPOSITION ROOT, FOR WATCHING THE SYNCHRONISATION JOIN HAPPEN. IT IS NOT SHIPPED.
 *
 * ## What this is for
 *
 * The claim this step has to earn is that THE NUMBER ON SCREEN MOVED: a real synchronisation is caused,
 * the indicator is watched changing, and the evidence is the observed value rather than a reading of the
 * wire. Reading the wire and concluding it must work is exactly the reasoning that produced the unwired
 * join in the first place — every component was individually correct.
 *
 * A component test that renders the indicator with a hand-made reading proves nothing about that. What
 * is needed is the real application, over a real IndexedDB, in a real browser: the real store, the real
 * engine, the real runner, the real seam, the real indicator.
 *
 * ## THE ONE THING SUBSTITUTED, AND WHY IT IS ONE THING RATHER THAN TWO
 *
 * The REMOTE COPY, replaced by `core/remote`'s own in-memory double — and, riding on it, a credential
 * that says a connection is live, because "a remote that answers" and "a credential that works" are one
 * fact rather than two. Nothing else is substituted. Every other line is the production line.
 *
 * That boundary is exact and it is not blurred anywhere in the evidence: what this observes is OUR LOGIC
 * given the behaviour the double models. NOTHING HERE IS EVIDENCE ABOUT GOOGLE. The double is faithful to
 * two quirks that were measured on the real service — the hidden space does not enforce name uniqueness,
 * and there is no conditional-match facility — and to no more than that. Meeting the real service is
 * s11's, on real devices, against the deployed application.
 *
 * The join being closed here is between two pieces of OUR OWN code: `syncNow` returns a completion, the
 * accountability surface reads a persisted one, and nothing carried one to the other. Google is not a
 * party to that defect, and a live-service run would not make it more proven — it would prove something
 * else.
 *
 * ## WHY THIS IS NOT A BACKDOOR, WHICH IS THE PROPERTY THAT MAKES IT LEGITIMATE
 *
 * INJECTING A DEPENDENCY AT A COMPOSITION ROOT IS NOT A FLAG READ BY PRODUCTION CODE. `main.tsx` supplies
 * the real Drive copy, unconditionally, with no branch and no environment check; this file supplies a
 * different one. {@link Application} is IDENTICAL in both — which is the pattern this tree already chose,
 * since `OpeningLocalStore` takes `open` precisely so that it is the same component in the application
 * and under a test.
 *
 * AND IT MUST NOT SHIP. A page that writes the coach's practice to a fake backup destination, reachable
 * in the public bundle, would be the exact defect that discipline exists to prevent, arriving by a
 * different door. It is not an entry in the bundler's inputs, so `npm run build` never emits it — and
 * that is not left to a configuration anybody has to trust: `harness-does-not-ship.test.ts` asserts its
 * absence from the built output, with a positive control, so a build that quietly started emitting it
 * goes red.
 *
 * ## HOW IT IS DRIVEN
 *
 * The page renders the application and nothing else. Everything a run needs is on
 * `window.proofOfTheJoin`, so the driver causes real conditions — a record changed, a service that
 * refuses, a file written by a newer version — and then reads the SCREEN, never this object, for what
 * happened. The hooks cause; the screen is the evidence.
 */

// FIRST, AND ON PURPOSE, for the same reason `main.tsx` does it: the token layer before anything that
// renders. A page that loaded the components first would paint from whatever styles arrived first, and
// the observation would be of a differently-styled application.
import '../design/design-system';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Application } from '../App';
import { OpeningLocalStore } from '../platform/LocalStore';
import { accountOnThisDevice } from '../platform/drive-on-this-device';
import type { BackupAccess } from '../shell/SyncFromStore';

import { createEnvelope } from '../../core/model/model.js';
import { aClient } from '../../core/model/fixtures.js';
import { InMemoryRemoteStorage, SPACES } from '../../core/remote/remote.js';
import { readLastCompletedSync } from '../../core/status/status.js';
import { DOCUMENT_KINDS, areaFileName } from '../../core/sync/sync.js';
import { openLocalStore, browserPlatform, purgeClient } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';

const ROOT_ELEMENT_ID = 'root';

/** The one substituted dependency, and its switchboard for making the service misbehave on purpose. */
const remote = new InMemoryRemoteStorage();

/**
 * START WITH A SERVICE THAT REFUSES — `?broken` on the address.
 *
 * Not a convenience. The `open` opportunity runs a pass THE INSTANT the runner is armed, and on a
 * device with a service that answers, that pass completes before anything outside the page can look.
 * So the BEFORE state — nothing has ever been backed up — exists for a few milliseconds and cannot be
 * observed without racing it, which would make the central before-and-after of this whole action a
 * matter of luck.
 *
 * Arming the refusal here, before the first render, holds the application in that state honestly: the
 * pass genuinely runs, genuinely cannot reach the service, and genuinely earns no completion. Calming
 * the service afterwards and tapping the control is then a real transition with a real cause on both
 * sides of it, rather than a screenshot taken at the right moment.
 */
if (window.location.search.includes('broken')) remote.adversity.failNext(50);

/**
 * The backup access this root supplies.
 *
 * `credential` says a connection is live because the double answers; see the header for why those are
 * one fact. `connect` does nothing and refuses nothing — there is no account to connect to here, and a
 * sentence claiming otherwise would be this page inventing a state.
 */
const THE_DOUBLE: BackupAccess = {
  remote: remote as unknown as BackupAccess['remote'],
  credential: () => ({ present: true, expired: false }),
  connect: async () => null,

  /*
    THE TWO WAYS OUT, AND THEY ARE THE REAL ROUTINES OVER THE REAL CONNECTION.

    Nothing is substituted here beyond what this root already substitutes. `googleOnThisDevice` is
    the same single connection the application builds, and on this page it is genuinely NOT
    CONNECTED — no client id is configured and no consent has ever been given — so `signOutOfGoogle`
    answers `not-connected`, which is the TRUE answer about this page rather than a stubbed one.

    That is exactly what makes the erase gate observable here. The gate does not read the connection;
    it reads the DELIVERY FIGURES, and this root is the one place in the tree where a real queue can
    be filled with work that genuinely cannot be delivered — `breakTheService` above — so the
    refusal, its count, its named oldest entry and its still-retrying-or-stopped sentence can all be
    caused for real and read off the screen. Substituting a connection would have proved nothing the
    unit tests do not; substituting the SERVICE is what makes the refusal real.
  */
  signOut: (store) => accountOnThisDevice(window).signOut(store),
  eraseThisDevice: (store, reading, acknowledged) =>
    accountOnThisDevice(window).eraseThisDevice(store, reading, acknowledged),
};

/**
 * The store, opened by this root and REMEMBERED so the driver can cause conditions in it.
 *
 * A fixed device tag rather than a minted one, so a run is reproducible and the area file names in the
 * space are predictable enough to plant a file beside them.
 */
const DEVICE = 'proof-device01';

let opened: LocalStore | null = null;
let announceOpen: (store: LocalStore) => void = () => {};
const storeIsOpen = new Promise<LocalStore>((resolve) => {
  announceOpen = resolve;
});

async function openTheProofStore(): Promise<LocalStore> {
  const store = await openLocalStore({ platform: browserPlatform(window), device: DEVICE });
  opened = store;
  announceOpen(store);
  return store;
}

/** The store, once it is open. Every hook below waits on it rather than assuming. */
async function theStore(): Promise<LocalStore> {
  return opened ?? storeIsOpen;
}

/**
 * WHAT THE DRIVER MAY CAUSE, declared so the global is typed rather than inferred from itself.
 *
 * Named at length on purpose: it is not `window.proof`, because a short name on a global is what a
 * production file eventually reaches for.
 */
interface ProofHooks {
  ready(): Promise<string>;
  changeSomething(name?: string): Promise<string>;
  removeAClient(recordId: string): Promise<unknown>;
  breakTheService(count?: number, operation?: string): void;
  expireTheCredential(): void;
  calmTheService(): void;
  plantAFileFromANewerVersion(): Promise<string>;
  takeAPlantedFileBackOut(fileId: string): Promise<void>;
  persistedCompletion(): Promise<string | null>;
  filesInTheSpace(): Promise<number>;
}

/** Nothing here reports what happened — the screen does that. The hooks only CAUSE. */
const proofOfTheJoin: ProofHooks = {
  /** Resolves when the store is open, so a driver never races the opening. */
  async ready(): Promise<string> {
    const store = await theStore();
    return store.device;
  },

  /**
   * Change something, the way the coach would: one more client in the register.
   *
   * This is what gives a pass something to push, which is what makes the count on the indicator move.
   */
  async changeSomething(name = 'A client added by the proof run'): Promise<string> {
    const store = await theStore();
    const record = createEnvelope({
      type: 'client',
      content: aClient({ name }),
      device: store.device,
    });
    await store.putRecord(record);
    return record.record_id;
  },

  /** Remove a client, which leaves a deletion manifest pending until a pass confirms it went. */
  async removeAClient(recordId: string): Promise<unknown> {
    const store = await theStore();
    return purgeClient(store, recordId);
  },

  /**
   * Break the service for the next `count` calls — optionally only one operation of it.
   *
   * This is how a pass that EARNS NO COMPLETION is caused for real: a step that could not reach the
   * service withholds the completion, so the persisted last-backed-up value must stay exactly where it
   * was rather than being cleared or advanced.
   */
  breakTheService(count = 1, operation?: string): void {
    remote.adversity.failNext(count, operation === undefined ? {} : { operation });
  },

  /**
   * Let the credential run out at the service, which is the ORDINARY end of a foreground-only token.
   *
   * It causes the one reason with a one-tap remedy attached, so the `reconnect_google` control can be
   * watched appearing for a cause the coach will actually meet every hour.
   */
  expireTheCredential(): void {
    remote.adversity.expireCredential();
  },

  /** Back to a service that works, with a credential it accepts. */
  calmTheService(): void {
    remote.adversity.clear();
  },

  /**
   * Plant a file in the space that this build cannot decode, as a newer version of the app would write.
   *
   * This causes the FALSE GREEN condition for real: the pass finds a file it cannot read, skips it,
   * and must NOT report a clean completion — because it is holding none of what that file carried.
   */
  async plantAFileFromANewerVersion(): Promise<string> {
    const document = JSON.stringify({
      document_version: 99,
      kind: DOCUMENT_KINDS.PUSH,
      device: 'other-device01',
      written_at: new Date().toISOString(),
      cursor: '',
      records: [],
      purges: [],
    });
    const meta = await remote.create(SPACES.VISIBLE, {
      name: areaFileName('other-device01', 'push', 'planted-by-the-proof-run'),
      content: document,
    });
    return meta.file_id;
  },

  /**
   * TAKE A PLANTED FILE BACK OUT — which is how the RETURN out of the skipped state is caused for real.
   *
   * `readUnion` re-lists and re-reads the whole space on every pass; there is no cursor and nothing is
   * remembered between passes. So while an undecodable file sits in the space every pass skips it again,
   * and no amount of running one produces a clean report. That is correct behaviour and it is exactly
   * why this hook exists: the state the coach actually returns through is the one where the file is no
   * longer there to skip — the other device rewrote it, or this build was updated to understand it.
   *
   * It removes the file and nothing else. The pass that follows is a REAL pass over a real space that
   * genuinely has nothing unreadable in it, so the indicator coming home is the engine's own doing
   * rather than a state the driver painted.
   */
  async takeAPlantedFileBackOut(fileId: string): Promise<void> {
    await remote.remove(fileId);
  },

  /**
   * The PERSISTED completion, read the same way the surface reads it.
   *
   * Offered so a run can state the before-and-after of the value the whole join exists to advance. It
   * is not the observation — the observation is the screen — it is the corroborating figure beside it.
   */
  async persistedCompletion(): Promise<string | null> {
    const store = await theStore();
    const { completion } = await readLastCompletedSync(store);
    return completion === null ? null : completion.completed_sync_at;
  },

  /** How many files are in the space, so a run can say the double really was written to. */
  async filesInTheSpace(): Promise<number> {
    const files = await remote.list(SPACES.VISIBLE);
    return files.length;
  },
};

declare global {
  // eslint-disable-next-line no-var, vars-on-top
  var proofOfTheJoin: ProofHooks | undefined;
}

globalThis.proofOfTheJoin = proofOfTheJoin;

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) {
  throw new Error(`the proof page cannot start: no #${ROOT_ELEMENT_ID} element in the document`);
}

createRoot(rootElement).render(
  <StrictMode>
    <OpeningLocalStore open={openTheProofStore}>
      <Application backup={THE_DOUBLE} />
    </OpeningLocalStore>
  </StrictMode>,
);

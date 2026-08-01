/**
 * WHERE THIS DEVICE'S BACKUP ACTUALLY IS — the real Google Drive copy, on the one token this tab has.
 *
 * `shell/SyncFromStore.tsx` runs synchronisation against A REMOTE and knows nothing about providers;
 * `google-drive-remote.ts` is a remote and knows nothing about where its token comes from. This file
 * is the joint, and it is deliberately the only place in the interface where those two facts meet.
 *
 * ## IT ASKS `google-on-this-device.ts` FOR THE TOKEN AND HOLDS NONE OF ITS OWN
 *
 * There is ONE connection per tab and it holds the access token in memory. A second token path — a
 * second connection, a captured token, a copy kept here — would mean the code that backs up to Drive
 * asking Google for a token the code that mints a meeting link cannot see, and the coach meeting two
 * consent screens an hour instead of one. So the token is READ on every request through
 * `connection.tokenForRequest()`, which returns null when there is not a live one, and null is the
 * ordinary cold-start state rather than a fault: the durable queue turns it into a delay.
 *
 * ## WHY IT IS A FILE OF ITS OWN RATHER THAN A MEMBER OF `google-on-this-device.ts`
 *
 * It belongs there, and it should be folded in. It is here because that file was being written by
 * another strand at the moment this one needed it, and editing a file somebody else is live in to add
 * a member is how two half-correct versions of one thing end up merged. Nothing is duplicated by the
 * split — the connection is still the single instance, obtained from that module — and folding this
 * function into it later changes one import.
 *
 * ## NOTHING RUNS AT IMPORT, AND NOTHING HERE BRANCHES ON A FLAG
 *
 * `main.tsx` calls this once, unconditionally, and passes the result down. There is no environment
 * check and no test branch: choosing a different remote is something a DIFFERENT composition root does
 * by supplying a different value, which is why the component that consumes it is the same component
 * either way. A flag in production code that selected a fake backup destination would be a worse
 * defect than any this step was written to close.
 *
 *     npm run test:shell
 */

import {
  browserErasure, connectGoogleAccount, EraseAcknowledgement, eraseReadiness, signOutAndEraseThisDevice,
  signOutOfGoogle,
} from './google-account.ts';
import { ACQUIRE_REFUSALS, UserGesture } from './google-identity.ts';
import { GoogleDriveRemoteStorage } from './google-drive-remote.ts';
import { googleOnThisDevice } from './google-on-this-device.ts';
import { browserSettings } from './google-settings.ts';
import type { AccountActOutcome } from '../screens/admin-report.ts';
import type { BackupAccess, DeliveryFiguresOutcome } from '../shell/SyncFromStore.tsx';
import type { LocalStore } from '../../core/store/store.js';

/**
 * What is said when connecting failed for a reason that is not one of the acquisition's own.
 *
 * The one way {@link connectGoogleAccount} can throw is a log append that would not write, and it
 * deliberately rolls the connection back before letting the failure through — so the honest sentence
 * is that nothing was connected and nothing was lost. IT CARRIES NO PROVIDER TEXT AND NO EXCEPTION
 * MESSAGE: an error's words can hold the account address or a file identifier, and this sentence is
 * displayed, and may be read out. The platform's own words go to the console, where a person can
 * look for them.
 */
export const CONNECT_FAILED_LOCALLY =
  'The app could not finish connecting to Google on this device, so nothing has changed and nothing '
  + 'has been lost. Everything you have done is still saved here. Try Connect once more, and if it '
  + 'says this again, reload the app.';

/**
 * The real backup access for this application: the Drive copy, the credential, and connecting.
 *
 * @param global reached inside, so importing this module outside a browser is safe
 */
export function backupOnThisDevice(global: typeof globalThis = globalThis): BackupAccess {
  const google = googleOnThisDevice(global);

  const remote = new GoogleDriveRemoteStorage({
    // THE ONLY TOKEN PATH. This does not acquire, renew, or know how one is obtained.
    token: () => google.connection.tokenForRequest(),
  });

  return {
    remote: remote as unknown as BackupAccess['remote'],

    // Read on every refresh rather than captured: with no refresh token, a tab that has just opened
    // has a remembered connection and no live token, and that transition happens with nothing
    // re-rendering. `credential()` already returns exactly the shape `accountabilityStatus` accepts.
    credential: () => google.connection.credential(),

    async connect(event, store: LocalStore) {
      // The gesture is minted from the browser's own trusted flag and cannot be forged from script.
      // A null one is refused with its own sentence rather than treated as benign.
      const gesture = UserGesture.fromTrustedEvent(event);

      try {
        const outcome = await connectGoogleAccount({
          connection: google.connection,
          gesture,
          store,
        });
        if (outcome.outcome === 'refused') return outcome.sentence;

        // Acquired, but he may have unticked a permission on the consent screen. That is not a
        // refusal and must not be reported as one — he IS connected — but it must not pass in
        // silence either, because the operation that needs the missing scope will fail later with no
        // explanation. The scopes are named because they are OUR strings, not the provider's words.
        if (outcome.scopesNotGranted.length > 0) {
          return 'Google connected, but some permissions were not granted, so parts of backing up '
            + 'and creating meeting links will not work. Tap "Connect Google" again and leave every '
            + 'box ticked.';
        }
        return null;
      } catch (error) {
        // Logged, never shown. See CONNECT_FAILED_LOCALLY.
        console.error('[google] connecting could not be completed', error);
        return CONNECT_FAILED_LOCALLY;
      }
    },

    ...accountOnThisDevice(global),
  };
}

/** The two ways out of this device, as the interface calls them. */
export interface AccountOnThisDevice {
  signOut(store: LocalStore): Promise<AccountActOutcome>;
  eraseThisDevice(
    store: LocalStore,
    reading: DeliveryFiguresOutcome,
    acknowledged: boolean,
  ): Promise<AccountActOutcome>;
}

/**
 * SIGNING OUT, AND THE SEPARATE ACT OF ERASING — over the one connection this tab has.
 *
 * A function of its own rather than two members written inside {@link backupOnThisDevice}, because
 * the proof root supplies these two REAL and substitutes only the remote copy. Two roots calling one
 * factory is the whole of why that page proves anything: what it observes is the production path.
 *
 * @param global reached inside, so importing this module outside a browser is safe
 */
export function accountOnThisDevice(global: typeof globalThis = globalThis): AccountOnThisDevice {
  const google = googleOnThisDevice(global);

  return {
    /**
     * SIGN OUT — the plain one, which drops Google and touches nothing else.
     *
     * The routine is `google-account.ts`'s and is not reimplemented here: this maps its outcome onto
     * the plain fact the interface carries, and turns a throw into a state rather than letting one
     * escape. What can throw is the log append, and it deliberately happens BEFORE the connection is
     * dropped — so a failure leaves him exactly where he was, which is what the report then says.
     */
    async signOut(store: LocalStore): Promise<AccountActOutcome> {
      try {
        const outcome = await signOutOfGoogle({ connection: google.connection, store });
        return outcome.outcome === 'not-connected'
          ? { act: 'sign-out', result: 'not-connected' }
          : { act: 'sign-out', result: 'signed-out', revokedAtGoogle: outcome.revokedAtGoogle };
      } catch (error) {
        // Logged, never shown, for the reason CONNECT_FAILED_LOCALLY gives: a platform error's own
        // words can carry the account address. `verbatim` is what a person may read out, so it is
        // this application's own summary of the exception and never the exception's text.
        console.error('[google] signing out could not be completed', error);
        return { act: 'sign-out', result: 'failed', verbatim: null };
      }
    },

    /**
     * SIGN OUT AND ERASE THIS DEVICE — the separate act, and the gate is the mechanism's.
     *
     * The acknowledgement is MINTED FROM THE READINESS rather than passed as a boolean, which is the
     * whole reason `EraseAcknowledgement` is a class: it cannot be forged from a `true` and it
     * cannot be carried over from a calmer reading of the queue. `forReadiness` returns null unless
     * the verdict actually allows an override, so a `wait` cannot be overridden by anything this
     * function does, and the mechanism refuses it again regardless.
     */
    async eraseThisDevice(
      store: LocalStore,
      reading: DeliveryFiguresOutcome,
      acknowledged: boolean,
    ): Promise<AccountActOutcome> {
      try {
        const readiness = eraseReadiness(reading);
        const acknowledgement = acknowledged ? EraseAcknowledgement.forReadiness(readiness) : null;

        const outcome = await signOutAndEraseThisDevice({
          connection: google.connection,
          store,
          reading,
          erasure: browserErasure(global, browserSettings(global)),
          acknowledgement,
        });

        return outcome.outcome === 'erased'
          ? { act: 'erase', result: 'erased' }
          // WHY it was refused, read off the gate's own verdict rather than guessed here. The two
          // refusals describe different worlds — the queue moved under him, or nothing was ever
          // counted — and `admin-report.ts` has a sentence for each.
          : {
            act: 'erase',
            result: 'refused',
            because: readiness.verdict === 'unknown' ? 'not-read' : 'more-stopped',
          };
      } catch (error) {
        // The realistic one is another window holding the database open, and `browserErasure` words
        // that itself in a sentence written for a person. It is the ONE platform message this
        // application shows, because it names the only thing he can do about it — close the other
        // windows — and it carries no account address and no file identifier.
        console.error('[google] this device could not be erased', error);
        return { act: 'erase', result: 'failed', verbatim: blockedMessageOf(error) };
      }
    },
  };
}

/**
 * The one platform sentence this module lets through, and only when it is ours.
 *
 * `browserErasure` throws an Error whose message was WRITTEN HERE for the blocked case — another
 * window still has the app open — and that is worth showing, because it is the only failure the
 * coach can act on. Anything else is the platform's own words and is not shown; see
 * {@link CONNECT_FAILED_LOCALLY} for why. Matching on our own sentence rather than on an error type
 * keeps the test honest: a message reworded on one side and not the other stops matching, which is
 * loud, instead of a type check quietly passing a string that has drifted.
 */
function blockedMessageOf(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  return message.includes('Close every other window of the app') ? message : null;
}

/**
 * The refusal sentences this module can hand back that are NOT its own.
 *
 * Exported so a suite can assert that every sentence reaching the coach through {@link backupOnThisDevice}
 * is one of this application's written ones, rather than a string that happens to look like prose.
 */
export const REFUSAL_SENTENCES: readonly string[] = Object.freeze(Object.values(ACQUIRE_REFUSALS));

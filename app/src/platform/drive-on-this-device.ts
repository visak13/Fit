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

import { connectGoogleAccount } from './google-account.ts';
import { ACQUIRE_REFUSALS, UserGesture } from './google-identity.ts';
import { GoogleDriveRemoteStorage } from './google-drive-remote.ts';
import { googleOnThisDevice } from './google-on-this-device.ts';
import type { BackupAccess } from '../shell/SyncFromStore.tsx';
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
            + 'and creating meeting links will not work. Tap Connect again and leave every box '
            + 'ticked.';
        }
        return null;
      } catch (error) {
        // Logged, never shown. See CONNECT_FAILED_LOCALLY.
        console.error('[google] connecting could not be completed', error);
        return CONNECT_FAILED_LOCALLY;
      }
    },
  };
}

/**
 * The refusal sentences this module can hand back that are NOT its own.
 *
 * Exported so a suite can assert that every sentence reaching the coach through {@link backupOnThisDevice}
 * is one of this application's written ones, rather than a string that happens to look like prose.
 */
export const REFUSAL_SENTENCES: readonly string[] = Object.freeze(Object.values(ACQUIRE_REFUSALS));

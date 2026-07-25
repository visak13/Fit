/**
 * THE MODULE API for remote storage. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/model/model.js` is: directory resolution is a runtime convenience that browsers do
 * not have, and this core is written to be adopted unchanged by the browser application.
 * `'./core/remote/remote.js'` works in both places; `'./core/remote'` works in neither.
 *
 * `index.js` beside this file is the TEST ENTRY POINT, not the API. Nothing in the
 * application imports it — it pulls in the test runner, which has no place in a browser.
 */

export {
  SPACES,
  SPACE_VALUES,
  NAME_MAX,
  DEFAULT_TIMEOUT_MS,
  PORT_OPERATIONS,
  PORT_CAPABILITIES,
  MEASURED_QUIRKS,
  PROVES_NOTHING_ABOUT_THE_PLATFORM,
  RemoteStoragePort,
  RemoteError,
  RemoteInvalidRequest,
  RemoteFileNotFound,
  RemoteCredentialExpired,
  RemoteUnavailable,
  RemoteTimeout,
  RemoteNotImplemented,
  hasMoved,
  textToBytes,
  bytesToText,
  normalizeContent,
  assertSpace,
  assertName,
  assertFileId,
  assertTimeout,
} from './port.js';

export { InMemoryRemoteStorage, DOUBLE_REFUSES } from './memory-remote.js';
export { Adversity } from './adversity.js';
export { systemClock, manualClock } from './clock.js';

/**
 * PER-DEVICE PARTITIONING — the one idea the whole engine rests on.
 *
 * ## The hazard, stated first
 *
 * Two devices holding one shared writable object is a concurrent read-modify-write, and this service
 * offers no conditional match, so the sequence is: both read, both write, the second wins, the first
 * device's work is silently gone, and NOTHING anywhere reports an error. That is not a rare race — it
 * happened to this very build's shared test script while it was being written, in ordinary use, by
 * people doing nothing careless.
 *
 * ## The answer, and why it is structural rather than careful
 *
 * **A device writes only into its OWN area, and reads the union of every area.** No object is ever
 * written by two devices, so there is no read-modify-write to lose and nothing to detect. This is not
 * a lock, a lease, a retry or a merge — it is the absence of the shared object those would be
 * defending. Cross-device overwrite cannot occur because there is no code path on any device that
 * writes into another device's area, and a test proves the areas stay disjoint.
 *
 * An area is a NAME PREFIX, not a folder, because the port offers exactly one way to narrow a
 * listing: `namePrefix`. So an area is `fit.<device-tag>.` and everything a device writes begins with
 * it.
 *
 * ## Reading is the union, and duplicates across areas are fine
 *
 * Two areas may both hold a copy of one record — device B pulled A's record and later wrote its own
 * full state out. That is harmless and deliberate: the union resolves per record with the model's
 * one last-write-wins rule, and two copies of the SAME revision are equal by that rule, so no
 * conflict is manufactured out of redundancy. Redundancy is also what makes recovery on a fresh
 * device work when one area is unreadable.
 *
 * ## Two kinds of file in an area, and why both
 *
 * | Kind | Written | Holds |
 * |---|---|---|
 * | `push` | every sync that has something to say | the records changed since this device's last push |
 * | `state` | on compaction | this device's whole current state, replacing its earlier files |
 *
 * A push alone would grow without bound. A full state write every sync would be the most expensive
 * thing in the application. Compaction is also how a deletion reaches the remote copy: the departed
 * client's records are already gone locally, so a state file written from the local store cannot
 * contain them, and the older files that did are removed.
 *
 * ## The name is parsed, never trusted
 *
 * A device tag is lowercase letters, digits and single hyphens — it can never contain a dot — so
 * dot-segmentation is unambiguous. `snapshot` is refused as a device tag because the derived snapshot
 * lives at `fit.snapshot.json` and a device claiming that tag would write into it.
 */

import { DEVICE_TAG_MAX, DEVICE_TAG_MIN, DEVICE_TAG_PATTERN } from '../model/model.js';
import { keyedName } from '../outbox/outbox.js';
import { SyncBoundaryError } from './errors.js';

/** Every name this engine writes begins with this. One namespace, so a listing can be narrowed. */
export const NAMESPACE = 'fit';

/** The two kinds of file a device writes into its own area. */
export const AREA_FILE_KINDS = Object.freeze({ PUSH: 'push', STATE: 'state' });

/**
 * The single shared derived object. It is NOT in any device's area — deliberately, because it is the
 * one place in this design where a lost update is possible at all, and hiding that inside an area
 * would misrepresent it. See `snapshot.js`.
 */
export const SNAPSHOT_NAME = `${NAMESPACE}.snapshot.json`;

/** Its listing prefix, so the three-case guard can narrow to it. */
export const SNAPSHOT_PREFIX = `${NAMESPACE}.snapshot.`;

/**
 * Device tags that would collide with a reserved name. Refused at the boundary rather than checked
 * for later: a device that got this far would be writing into the shared snapshot.
 */
export const RESERVED_DEVICE_TAGS = Object.freeze(['snapshot']);

/**
 * Validate a device tag at the public boundary.
 *
 * @param {unknown} device
 * @returns {string}
 */
export function assertDeviceTag(device) {
  if (typeof device !== 'string' || !DEVICE_TAG_PATTERN.test(device)
      || device.length < DEVICE_TAG_MIN || device.length > DEVICE_TAG_MAX) {
    throw new SyncBoundaryError(
      'A device tag is lowercase letters, digits and single hyphens, for example coach-laptop.',
      { device },
    );
  }
  if (RESERVED_DEVICE_TAGS.includes(device)) {
    throw new SyncBoundaryError(
      `"${device}" is reserved for a shared object and cannot be a device tag.`, { device },
    );
  }
  return device;
}

/**
 * The listing prefix that is this device's whole area.
 * @param {string} device
 * @returns {string}
 */
export function areaPrefix(device) {
  return `${NAMESPACE}.${assertDeviceTag(device)}.`;
}

/**
 * The name of one file in a device's own area, carrying its idempotency key so a replayed delivery
 * can recognise its own earlier write. The outbox refuses a create whose name lacks the key.
 *
 * @param {string} device @param {string} kind One of {@link AREA_FILE_KINDS} @param {string} key
 * @returns {string}
 */
export function areaFileName(device, kind, key) {
  if (!Object.values(AREA_FILE_KINDS).includes(kind)) {
    throw new SyncBoundaryError(`"${kind}" is not a kind of area file.`, { kind });
  }
  return keyedName(`${areaPrefix(device)}${kind}.json`, key);
}

/**
 * Read a name back. Returns null for anything that is not an area file, INCLUDING the snapshot —
 * a caller must not be able to mistake the shared object for somebody's area.
 *
 * @param {string} name
 * @returns {{device: string, kind: string, key: string}|null}
 */
export function parseAreaFileName(name) {
  if (typeof name !== 'string') return null;
  const parts = name.split('.');
  if (parts.length !== 5) return null;
  const [namespace, device, kind, key, extension] = parts;
  if (namespace !== NAMESPACE || extension !== 'json') return null;
  if (!Object.values(AREA_FILE_KINDS).includes(kind)) return null;
  if (RESERVED_DEVICE_TAGS.includes(device) || !DEVICE_TAG_PATTERN.test(device)) return null;
  if (!key) return null;
  return { device, kind, key };
}

/**
 * Group a listing by the area each file belongs to.
 *
 * Anything unparseable is returned separately rather than dropped. A file in this space that this
 * engine does not recognise is a fact worth surfacing — it may be another version of this app, or
 * the account holder's own file — and silently ignoring it is how a foreign writer stays invisible.
 *
 * @param {readonly import('../remote/port.js').RemoteFileMeta[]} listing
 * @returns {{areas: Map<string, import('../remote/port.js').RemoteFileMeta[]>,
 *            unrecognised: import('../remote/port.js').RemoteFileMeta[]}}
 */
export function groupByArea(listing) {
  /** @type {Map<string, import('../remote/port.js').RemoteFileMeta[]>} */
  const areas = new Map();
  /** @type {import('../remote/port.js').RemoteFileMeta[]} */
  const unrecognised = [];

  for (const meta of listing) {
    const parsed = parseAreaFileName(meta.name);
    if (!parsed) { unrecognised.push(meta); continue; }
    const bucket = areas.get(parsed.device) || [];
    bucket.push(meta);
    areas.set(parsed.device, bucket);
  }
  return { areas, unrecognised };
}

/**
 * A file that is OURS BY NAME and that this build cannot place — which is the same defect as an
 * undecodable document, arriving through a door the version check does not watch.
 *
 * `parseAreaFileName` refuses any kind outside {@link AREA_FILE_KINDS}, so a build of this
 * application that adds a THIRD kind of area file writes names this one groups as `unrecognised`
 * rather than as an area. Until this existed, unrecognised files were not in the synchronisation
 * report at all: the older device skipped every one of them, met no failure and no unreadable
 * document, and reported a clean completion while holding none of that work. It is the false green
 * again, reached by an ORDINARY ADDITIVE CHANGE rather than by a document version bump — the kind of
 * change this codebase deliberately prefers, which makes this door the more likely of the two.
 *
 * ## What keeps this from becoming the OPPOSITE defect, which would be worse
 *
 * This whole area exists because an indicator that misleads the coach is dangerous. A PERMANENT FALSE
 * ALARM on the one indicator he is meant to trust is the same danger wearing a better disguise: it
 * would be technically accurate every time it fired, and it would teach him to ignore the surface
 * that has to warn him when something is genuinely wrong. So the question is not "can this file be
 * explained" but "is this file HIS WORK, missing".
 *
 * Enumerated from `parseAreaFileName`, a name fails to parse when the segment count is wrong, the
 * namespace or extension is wrong, the KIND is not one of {@link AREA_FILE_KINDS}, the device segment
 * is reserved or not a device tag, or the key is empty. Of those, only a name that is otherwise
 * well-formed FOR A DEVICE WE CAN SEE WRITING HERE is evidence of a build we do not know. The visible
 * space is a folder the coach browses and his own files may sit in it — `fit.` is a short prefix and
 * he is free to use it — so the namespace alone is suggestive, not conclusive.
 *
 * The conclusive test is therefore the DEVICE: this file's device segment names an area that holds at
 * least one file this build parsed. A device writing real area files into this space is an
 * installation of this application, and a name it wrote that this build cannot place came from a
 * build that knows a name this one does not. The coach's own file would have to be named for one of
 * his own device areas to reach that bar.
 *
 * **The honest residual, stated rather than left to be discovered:** a future build that changed the
 * naming scheme SO completely that a device had no parseable file at all would be under-reported
 * here. That device would also be missing from `devices` entirely, which is a larger and more visible
 * problem than this one; and under-reporting an exotic case is the right side to err on when the
 * alternative is a permanent false alarm on an ordinary one. The shared snapshot is excluded because
 * it is not an area file and was never meant to parse as one.
 *
 * @param {string} name
 * @param {readonly string[]} knownDevices Device tags that own at least one parseable area file here.
 * @returns {boolean}
 */
export function isUnplaceableAreaFile(name, knownDevices = []) {
  if (typeof name !== 'string') return false;
  if (!name.startsWith(`${NAMESPACE}.`)) return false;
  if (name.startsWith(SNAPSHOT_PREFIX)) return false;
  if (parseAreaFileName(name) !== null) return false;
  return knownDevices.includes(name.split('.')[1]);
}

/**
 * Whether this file belongs to the given device's area.
 * @param {string} name @param {string} device
 * @returns {boolean}
 */
export function isOwnArea(name, device) {
  const parsed = parseAreaFileName(name);
  return parsed !== null && parsed.device === device;
}

/**
 * **A declared value, asserted by a test rather than left as an absent check.**
 *
 * There is no function anywhere in this package that writes into an area belonging to another
 * device, and there is no parameter that would let a caller ask for one. An absent check reads as an
 * oversight to the next editor; this reads as a decision.
 */
export const WRITES_ONLY_ITS_OWN_AREA = true;

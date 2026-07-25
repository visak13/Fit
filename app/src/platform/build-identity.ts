/**
 * WHICH BUILD IS THIS?
 *
 * The built output is committed to the repository and served by a static host, which means the
 * running application is the only witness to which build actually reached the device. The stamp
 * below is substituted at build time from a hash of the source the artefact was produced from
 * (see `tools/source-stamp.mjs`), so the answer shown on screen can be compared with what the
 * repository claims.
 *
 * It is shown in the admin screen rather than buried in a console message, because the person who
 * needs it is being talked through the application over a video call.
 */

/** Substituted by the bundler. Absent only when a module is loaded outside a build. */
declare const __BUILD_STAMP__: string;

const UNKNOWN_STAMP = 'unknown';

/**
 * The source stamp of the running build, or `'unknown'` outside a build.
 *
 * Enumerated rather than claimed as universal: the bundler defines this constant for every module
 * it emits, and a module loaded directly by a test runner has no such definition — that case
 * returns `'unknown'` instead of throwing.
 */
export function buildStamp(): string {
  return typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : UNKNOWN_STAMP;
}

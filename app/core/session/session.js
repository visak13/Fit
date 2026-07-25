/**
 * SESSION DURABILITY AND STATE — the module API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
 * package; types are expressed in documentation comments. This is the state and persistence layer
 * for a running session, not its screen: the session runner mounts on top of what is exposed here.
 *
 * Start at `SESSION.md` beside this file for the written notes. This file is the entry point for
 * code — named explicitly rather than as a directory, because directory-index resolution does not
 * exist in a browser.
 *
 * ```js
 * import { openSession, previousSessionAtAGlance } from './core/session/session.js';
 *
 * const opened = await openSession(store, sessionId, { routine });
 * if (!opened.ok) return tell(opened.message);        // open in the other window, say so
 *
 * const live = opened.session;
 * await live.recordPerformed(clientId, { exerciseId: 'back-squat', sets: 3, repetitions: 8,
 *                                        observedLoad: '20kg' });
 * await live.recordReading(clientId, { kind: 'heart-rate', value: 132 });
 * await live.interrupt();                             // he had to go. Nothing is lost.
 *
 * const again = await openSession(store, sessionId);  // resumes exactly. Same door.
 * ```
 *
 * The four things worth knowing before using it:
 *
 *  1. **The session is a log of what occurred, not a position in a script.** Nothing stores where
 *     the coach has got to, so nothing can disagree with the record about it.
 *  2. **Opening IS resuming.** There is no separate resume path, and therefore no restore step that
 *     a power cut can interrupt.
 *  3. **A resolved write is a committed write**, inherited from the store. Nothing may be shown as
 *     saved before its promise resolves.
 *  4. **One window per session.** Opening one elsewhere returns a result that says so, rather than
 *     failing or quietly appending.
 */

export * from './errors.js';
export * from './journal.js';
export * from './projection.js';
export * from './live-session.js';
export * from './glance.js';

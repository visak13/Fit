/**
 * THE WALK PREAMBLE — run this BEFORE you assert anything about the running application.
 *
 * ## Read this first, next worker. It is four sentences.
 *
 * `npm run check:stale` proves that `dist/` matches the source ON DISK. It proves NOTHING about
 * what the browser LOADED. A service worker registered in an earlier session sits between the two
 * and serves its own precache, so the page can execute a PREVIOUS build while every file on disk
 * and every byte on the wire is correct. This module is the check that closes that gap: it clears
 * the worker and its caches, then reads the RUNNING PAGE to find out which build actually
 * executed, and refuses if it is not the one `dist/` names.
 *
 * ## Why this is not paranoia — it already happened here
 *
 * MEASURED, s9/a10, 2026-07-31: the dev server served the correct new entry module; `curl`
 * confirmed it from both the server and `dist/index.html`; the source stamp matched; `npm run
 * check:stale` passed — AND THE BROWSER EXECUTED A PREVIOUS BUILD, served by a worker registered
 * in an earlier session. It was loud only by luck: the stale HTML named a hashed filename that no
 * longer existed, so the module 404'd and the page was blank. Had the entry hash been unchanged —
 * a CSS-only or asset-only change — the old bundle would have loaded SILENTLY and every verdict
 * taken afterwards would have been about last build's code.
 *
 * That last case is why {@link CHECK_EXECUTED_STAMP} exists and is the load-bearing check here.
 * The entry filename can be identical across two builds; the build stamp compiled INTO the bundle
 * cannot, because it is a hash of every source file. The stamp is read out of the running
 * application's own rendered output, so it is the executed CODE reporting its identity — not the
 * markup, not the wire, not the disk.
 *
 * ## HOW A WALK GETS A BROWSER HERE — read this before you reach for the MCP tools
 *
 * PLANNER-RULED for the whole of s11, after this was measured: **the Playwright MCP browser is a
 * SINGLE SHARED SEAT across the pool.** Its profile is one fixed directory, and a second worker
 * asking for it gets `Browser is already in use`. Seven walk actions here need a browser, so they
 * would collide, and the tempting fix — killing the Chrome that is in the way — destroys a
 * sibling's walk in progress. DO NOT DO IT.
 *
 * Drive the SAME already-downloaded Chromium yourself instead, isolated on three axes:
 *
 *   - your own `user-data-dir`, so your service workers and caches are yours alone;
 *   - your own served port;
 *   - a scratch COPY of the tree — never the tracked `dist/`, which siblings are also serving.
 *
 * `npm i playwright-core` in a scratch directory finds the browser that is already on this
 * machine; `chromium.launchPersistentContext(profileDir, …)` is what makes a second run a genuine
 * RETURNING VISITOR rather than a fresh device.
 *
 * TWO THINGS THAT WILL WASTE AN HOUR IF YOU HAVE NOT BEEN TOLD, both measured here 2026-07-31:
 *
 *   1. **KEEP THE PROFILE PATH SHORT** — `C:/fw-profile`, not one nested under the scratch
 *      directory. With a long path, `caches.open()` fails inside the page with `UnknownError:
 *      Unexpected internal error`, the worker's very first install fails, and Chromium DISCARDS
 *      the registration. The application then reports "Starts without a network — Yes" (its
 *      `register()` call really did resolve) while `getRegistrations()` returns 0. Every reading
 *      looks like a device that simply has no worker, and nothing anywhere names the cause.
 *   2. **NAVIGATE VIA `about:blank` BETWEEN LOADS.** This application is hash-routed, so going to
 *      a URL that differs only in its FRAGMENT is a SAME-DOCUMENT navigation: `goto` does not
 *      reload, and every reading after the first is the same document wearing a new label. That
 *      is not a small error — the update path below is counted in DOCUMENT LOADS, and a run that
 *      never reloads reports the old build surviving forever.
 *
 * ## `npm run preview` CANNOT MEASURE AN OFFLINE START, AND THE FAILURE IS THE SERVER'S
 *
 * MEASURED, s11/a9, 2026-08-01, reproduced twice: a COLD OFFLINE start served by `npm run preview`
 * paints NOTHING. The document itself comes back 200 from the service worker, and then the entry
 * module AND the CSS both fail with `ERR_FAILED` — blank screen. THE APPLICATION IS NOT AT FAULT.
 * `vite preview` sends `Vary: Origin`, and that header defeats `caches.match` for the CROSSORIGIN
 * module request EVEN THOUGH THE PRECACHE HOLDS BOTH URLs. The same build served from a plain
 * static host with NO `Vary` header — the shape of a real static host, which is what this
 * application actually ships to — STARTS FULLY OFFLINE: every asset answered by the worker, 1,845
 * painted characters, ZERO request failures.
 *
 * So, plainly, and this binds any walk that asserts offline behaviour through this preamble:
 *
 *   - `npm run preview` is FINE for ONLINE readings.
 *   - AN OFFLINE READING NEEDS A PLAIN STATIC HOST WITH NO `Vary` HEADER. Take one through preview
 *     and you will measure a FALSE FAILURE, and then spend a day "fixing" an offline capability
 *     that already works.
 *
 * AND THE PROCEDURE BELOW WENT ON SAYING `npm run preview` FOR A WHOLE STEP AFTER THAT WAS
 * MEASURED — corrected here, in s12/a14, and the reason it survived is worth more than the
 * correction. The steer that sent a worker to fix this named `DEVICE-WALK.md` as the file that
 * still prescribed preview. `DEVICE-WALK.md` never said it; THIS module did. The ACT was right and
 * the NAME OF THE THING IT ACTS ON was wrong — the two halves of an instruction fail independently,
 * and a worker that checks only the act finds the named file clean and closes.
 *
 * ## The procedure, in the plainest terms
 *
 *   1. Serve the built site FROM A PLAIN STATIC HOST — and read the reason before you reach for
 *      something more convenient, because the failure it prevents does not look like a server
 *      fault. `npm run preview` sends `Vary: Origin`; that header defeats `caches.match` for the
 *      crossorigin module request, so a cold offline start through it PAINTS NOTHING. THE BLANK
 *      SCREEN IS THE INSTRUMENT, NOT THE APPLICATION — the same build served with no `Vary`
 *      header starts fully offline. Take a reading through preview and you will spend a day
 *      "fixing" an offline capability that already works.
 *
 *      A static host with no `Vary` header, on a port you chose yourself, is one command from
 *      `C:/Projects/Fit/app` (`PORT` and the served directory are the only things to change):
 *
 *          node -e "const h=require('node:http'),f=require('node:fs'),p=require('node:path');const R=p.resolve('dist'),T={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]).replace(/^\/Fit/,'')||'/';let t=p.join(R,u);if(!t.startsWith(R))return s.writeHead(403).end();if(f.existsSync(t)&&f.statSync(t).isDirectory())t=p.join(t,'index.html');if(!f.existsSync(t))return s.writeHead(404).end('no');s.writeHead(200,{'content-type':T[p.extname(t)]||'application/octet-stream','cache-control':'no-store'});s.end(f.readFileSync(t));}).listen(Number(process.env.PORT))"
 *
 *      The site is then at `http://localhost:<PORT>/Fit/`. USE `localhost`, NEVER `127.0.0.1`:
 *      service-worker registration is gated on a secure context, and code that registers only on
 *      `https` or `localhost` silently registers NOTHING on `127.0.0.1` — leaving you a clean
 *      device on which every clause passes trivially.
 *
 *      (`npm run dev` is source-truth and registers no worker. `npm run preview` remains fine for
 *      ONLINE readings about the built artefact, and only for those.)
 *   2. Open the site in the real browser (see the seat rules above).
 *   3. Evaluate {@link CLEAR_OFFLINE_STATE} in the page. It unregisters every service worker and
 *      deletes every cache this origin holds, and it TELLS YOU what it removed. Both page halves
 *      are exported as `async () => {…}` source: the MCP `browser_evaluate` tool takes that shape
 *      directly, and a raw Playwright `page.evaluate` needs it wrapped as `` `(${SOURCE})()` ``.
 *   4. RELOAD. This matters: the clearing only takes effect for the next document. A page cleared
 *      but not reloaded is still the page the old worker served you.
 *   5. Evaluate {@link READ_RUNNING_PAGE} in the reloaded page and keep the reading.
 *   6. In Node, call {@link expectedBuild} on `dist/`, then {@link judgeWalk} with both. If
 *      `ok` is false, STOP — you are not looking at this build and nothing you assert next is
 *      about it. Quote the failing check's own message; each check owns one.
 *   7. Say in your report that you ran the preamble and that it was green.
 *
 * ## WHAT THIS PREAMBLE FIXES FOR A WALK, AND WHAT IT LEAVES OPEN FOR THE COACH
 *
 * The clearing is a WALK tool. The coach has no such tool, and the same staleness is his problem
 * too. MEASURED here 2026-07-31 on a real browser with a real install, publishing one build over
 * another: a returning visitor with the application already installed runs the PREVIOUS build for
 * ONE TO TWO FULL OPENINGS after a correct publish (both figures observed across two runs; the new
 * worker installs during the first opening and only the following document load is served by it),
 * and the application says NOTHING about it at any point — the old version simply carries on,
 * looking exactly like a publish that never happened. There is no update wording anywhere in the
 * product and no control to take an update. That is reported as a GAP by a1, not fixed by it; do
 * not paper over it inside your own walk.
 *
 * ## What this does NOT prove
 *
 * It proves the browser executed the build `dist/` currently names — and nothing else: not that
 * `dist/` is fresh against source (that is `npm run check:stale`, a separate check that looks the
 * same and is not), not that the build is correct, and not that any other device is running it.
 *
 * ## Shape of this module
 *
 * The browser halves are exported as SOURCE STRINGS rather than functions, because they are
 * evaluated inside the page by a driver in another process. The deciding halves are ordinary
 * functions over plain data, so they are tested in `tools/walk-preamble.test.mjs` without a
 * browser — including the part that matters most, that each one can actually go red.
 *
 *     npm run test:tools
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BASE_PATH, OUTPUT_DIRECTORY } from './build-config.mjs';
import { applicationRoot } from './source-stamp.mjs';

/** The build record the post-build step writes, relative to the output directory. */
const BUILD_INFO_FILE = 'build-info.json';

/**
 * The path segment every emitted application chunk carries.
 *
 * Used to pick this application's own module chunks out of everything else the document loaded.
 * It is a segment of the emitted path rather than a filename pattern, so a differently hashed or
 * differently split chunk is still recognised as one of ours.
 */
export const APPLICATION_CHUNK_SEGMENT = '/assets/';

/** Every check this module can report, named once so a report can cite one. */
export const CHECK_CLEARED = 'offline-state-cleared';
/**
 * NOT "no worker is registered" — that check was written first and was WRONG, measured
 * 2026-07-31. The application registers its worker from its own start-up effect, so a page loaded
 * cleanly from the network has a registration again within a second and claims itself. A check on
 * `registrations === 0` therefore reds on a perfectly clean walk, and a preamble that cries wolf
 * is one the next worker learns to skip.
 *
 * What actually matters is narrower and answerable: was THIS DOCUMENT served by a worker, or did
 * it come from the network? `PerformanceNavigationTiming.workerStart` is zero when no worker
 * handled the navigation and non-zero when one did — the browser's own record, not an inference.
 */
export const CHECK_NOT_SERVED_BY_WORKER = 'this-document-was-not-served-by-a-service-worker';
export const CHECK_APPLICATION_RAN = 'application-actually-ran';
export const CHECK_CHUNKS_OBSERVED = 'entry-module-observed-at-all';
export const CHECK_EXECUTED_ENTRY = 'executed-entry-module-is-the-one-dist-names';
export const CHECK_EXECUTED_STAMP = 'executed-build-stamp-is-the-one-dist-names';

/**
 * PAGE SCRIPT — remove every service worker and every cache this origin holds.
 *
 * Every cache is deleted, not only the ones this application names. An orphan left by an older
 * naming scheme is exactly the thing that would survive a targeted delete and go on being served.
 *
 * THIS IS A WALK TOOL AND ITS RULE IS NOT THE SHIPPED WORKER'S RULE. It runs inside a throwaway
 * browser profile against a scratch copy of the tree, where every cache on the origin was put
 * there by this walk, so deleting all of them preserves nothing that matters. The SHIPPED worker
 * may not reason that way: it activates on a shared per-ORIGIN cache store, where a cache it did
 * not write belongs to a neighbouring project. See `OUR_CACHE_PREFIX` in the generated `sw.js`.
 *
 * Returns what it found and what remained, so the caller can assert the clearing WORKED rather
 * than assert that it was attempted.
 *
 * @type {string}
 */
export const CLEAR_OFFLINE_STATE = `async () => {
  const before = {
    registrations: 'serviceWorker' in navigator
      ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? '(no script url)')
      : [],
    caches: 'caches' in self ? await caches.keys() : [],
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
  };

  if ('serviceWorker' in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }
  }
  if ('caches' in self) {
    for (const name of await caches.keys()) await caches.delete(name);
  }

  const after = {
    registrations: 'serviceWorker' in navigator
      ? (await navigator.serviceWorker.getRegistrations()).length
      : 0,
    caches: 'caches' in self ? (await caches.keys()).length : 0,
  };

  return { before, after };
}`;

/**
 * PAGE SCRIPT — what the RUNNING document actually loaded and ran.
 *
 * Three independent readings, because they fail in different ways:
 *
 *  - `chunksLoaded` comes from the resource timeline, which is the browser's own record of what
 *    this document fetched in order to run. It is not the markup: a worker that answered the
 *    navigation with an older `index.html` shows up here as an older chunk URL.
 *  - `mounted` is whether the application actually rendered. A chunk that was fetched and then
 *    404'd or threw leaves this false, which is how a fetch-only reading would have lied.
 *  - `stamp` is read out of the rendered admin card, where the running code prints the build
 *    constant the bundler compiled INTO it. This is the executed code naming itself, and it is
 *    the only reading that can catch a build whose entry filename did not change.
 *
 * The stamp read is fail-closed on purpose: if the admin card cannot be found, `stamp` is null and
 * {@link judgeWalk} refuses, rather than quietly skipping the check that matters most.
 *
 * @type {string}
 */
export const READ_RUNNING_PAGE = `async () => {
  const chunkSegment = ${JSON.stringify(APPLICATION_CHUNK_SEGMENT)};

  const chunksLoaded = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.includes(chunkSegment) && name.endsWith('.js'))
    .map((name) => new URL(name).pathname)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();

  const root = document.getElementById('root');
  const mounted = root !== null && root.children.length > 0;

  // The admin card prints the running build's stamp. Found by its LABEL rather than by position,
  // so a reordered card reads correctly and a removed one reads as null instead of as a wrong
  // value.
  let stamp = null;
  for (const term of document.querySelectorAll('dt')) {
    if (term.textContent.trim().toLowerCase() !== 'build') continue;
    const value = term.nextElementSibling;
    if (value === null) continue;
    stamp = (value.querySelector('code') ?? value).textContent.trim();
    break;
  }

  // The browser's own record of whether a service worker handled THIS navigation. Zero means the
  // document came off the network. Null means the timing entry could not be read at all, which is
  // refused rather than treated as zero.
  const navigation = performance.getEntriesByType('navigation')[0];
  const navigationWorkerStart = navigation === undefined ? null : navigation.workerStart;

  return {
    url: location.href,
    chunksLoaded,
    mounted,
    stamp,
    navigationWorkerStart,
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
    registrations: 'serviceWorker' in navigator
      ? (await navigator.serviceWorker.getRegistrations()).length
      : 0,
    caches: 'caches' in self ? await caches.keys() : [],
  };
}`;

/**
 * What `dist/` says the browser ought to be running.
 *
 * Read from the build record rather than inferred from the built markup — the build wrote down
 * which chunk it emitted as the entry, and reading the producer's own account cannot drift the way
 * a reader's inference from rendered HTML can. `index.html` is read too, but only so a
 * disagreement between the record and the markup is VISIBLE rather than assumed away.
 *
 * @param {string} [root] absolute path to the application root
 * @returns {Promise<{sourceStamp: string, entryModule: string, entryPath: string, indexHtmlNamesEntry: boolean}>}
 */
export async function expectedBuild(root = applicationRoot) {
  const outputDirectory = path.join(root, OUTPUT_DIRECTORY);
  const record = JSON.parse(await readFile(path.join(outputDirectory, BUILD_INFO_FILE), 'utf8'));
  const markup = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');

  const entryPath = `${BASE_PATH}${record.entryModule}`;
  return {
    sourceStamp: record.sourceStamp,
    entryModule: record.entryModule,
    entryPath,
    indexHtmlNamesEntry: markup.includes(record.entryModule),
  };
}

/**
 * Did the clearing actually clear?
 *
 * Separate from {@link judgeWalk} because it answers a different question at a different moment:
 * this one is about the state you LEFT, the other is about the page you then loaded.
 *
 * @param {{before: object, after: {registrations: number, caches: number}}} clearing
 * @returns {{id: string, ok: boolean, message: string}}
 */
export function judgeClearing(clearing) {
  const { registrations, caches } = clearing.after;
  const ok = registrations === 0 && caches === 0;
  return {
    id: CHECK_CLEARED,
    ok,
    message: ok
      ? `cleared: ${clearing.before.registrations.length} service worker(s) and ` +
        `${clearing.before.caches.length} cache(s) removed, none remaining`
      : `THE CLEARING DID NOT CLEAR. After unregistering and deleting, this origin still holds ` +
        `${registrations} service worker registration(s) and ${caches} cache(s). Anything asserted ` +
        `about the page from here on may be about a build this walk did not choose.`,
  };
}

/**
 * THE VERDICT. Every check owns its own message, so a red can be attributed to the thing it
 * actually probed rather than to the walk in general.
 *
 * The order is deliberate: the cheap structural checks come first so that a genuinely blank page
 * reports "nothing ran" instead of reporting a mismatched stamp it never had.
 *
 * @param {{expected: Awaited<ReturnType<typeof expectedBuild>>, reading: object}} input
 * @returns {{ok: boolean, checks: Array<{id: string, ok: boolean, message: string}>}}
 */
export function judgeWalk({ expected, reading }) {
  const checks = [];

  const servedFromNetwork = reading.navigationWorkerStart === 0;
  checks.push({
    id: CHECK_NOT_SERVED_BY_WORKER,
    ok: servedFromNetwork,
    message: servedFromNetwork
      ? 'this document came off the network; no service worker handled the navigation ' +
        `(the application has since registered one again, which is normal and does not affect ` +
        `what already loaded)`
      : reading.navigationWorkerStart === null
        ? `THE NAVIGATION TIMING FOR THIS DOCUMENT COULD NOT BE READ, so whether a service worker ` +
          `served it is unknown. Refused rather than assumed: an unreadable answer and "no worker" ` +
          `are different things.`
        : `A SERVICE WORKER SERVED THIS DOCUMENT (navigation workerStart ` +
          `${reading.navigationWorkerStart}; controller ${reading.controller ?? 'none'}). It sat ` +
          `between dist/ and the browser and answered from its own precache, so nothing read from ` +
          `this page is evidence about the build on disk. Run the clearing step and RELOAD.`,
  });

  checks.push({
    id: CHECK_APPLICATION_RAN,
    ok: reading.mounted === true,
    message: reading.mounted
      ? 'the application rendered, so its entry module executed rather than merely being fetched'
      : `THE APPLICATION DID NOT RENDER at ${reading.url}. Its root element is empty, so the entry ` +
        `module was fetched but never ran — a 404 behind a stale markup reference looks exactly ` +
        `like this. Nothing about the application may be asserted from this page.`,
  });

  // The non-vacuity guard for the two checks below. Both compare against a list, and a comparison
  // against an EMPTY list is the absence-shaped pass this project keeps paying for: it would let a
  // page that loaded no application code at all through as "nothing mismatched".
  checks.push({
    id: CHECK_CHUNKS_OBSERVED,
    ok: reading.chunksLoaded.length > 0,
    message:
      reading.chunksLoaded.length > 0
        ? `${reading.chunksLoaded.length} application chunk(s) observed in the resource timeline`
        : `NO APPLICATION CHUNK WAS OBSERVED AT ALL in this document's resource timeline. The ` +
          `entry-module comparison below has nothing to compare and would pass vacuously, so it ` +
          `is refused here instead. Either the page never loaded the application, or the reading ` +
          `was taken from a document other than the one under test.`,
  });

  const unexpected = reading.chunksLoaded.filter((loaded) => loaded !== expected.entryPath);
  const loadedTheEntry = reading.chunksLoaded.includes(expected.entryPath);
  checks.push({
    id: CHECK_EXECUTED_ENTRY,
    ok: loadedTheEntry && unexpected.length === 0,
    message:
      loadedTheEntry && unexpected.length === 0
        ? `the executed entry module is ${expected.entryPath}, which is what dist/ names`
        : `THE BROWSER DID NOT EXECUTE THE ENTRY MODULE dist/ NAMES. dist/build-info.json names ` +
          `${expected.entryPath}; this document actually loaded ` +
          `[${reading.chunksLoaded.join(', ') || 'nothing'}]. A previous build is being served to ` +
          `this browser.`,
  });

  const stampMatches = reading.stamp !== null && reading.stamp === expected.sourceStamp;
  checks.push({
    id: CHECK_EXECUTED_STAMP,
    ok: stampMatches,
    message: stampMatches
      ? `the running application reports build stamp ${reading.stamp}, which is what dist/ names`
      : reading.stamp === null
        ? `THE RUNNING APPLICATION'S BUILD STAMP COULD NOT BE READ. The admin card labelled ` +
          `"Build" was not found on this page, so the one check that can catch a stale bundle ` +
          `whose entry FILENAME did not change has no answer. Refused rather than skipped.`
        : `THE RUNNING APPLICATION IS A DIFFERENT BUILD FROM THE ONE ON DISK. It reports build ` +
          `stamp ${reading.stamp}; dist/build-info.json says ${expected.sourceStamp}. This is the ` +
          `silent case: the entry filename can be identical across two builds, so only this ` +
          `comparison sees it.`,
  });

  return { ok: checks.every((check) => check.ok), checks };
}

/**
 * The verdict as lines a person reads, failures first.
 *
 * @param {ReturnType<typeof judgeWalk>} verdict
 * @returns {string}
 */
export function reportWalk(verdict) {
  const line = (check) => `${check.ok ? 'ok  ' : 'RED '} ${check.id}: ${check.message}`;
  const failures = verdict.checks.filter((check) => !check.ok);
  const passes = verdict.checks.filter((check) => check.ok);
  return [...failures, ...passes].map(line).join('\n');
}

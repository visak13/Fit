#!/usr/bin/env node
// publish-audit.mjs — the gate between this working tree and a public repository.
//
// Exit 0 means: the file set a commit would carry is free of the spike tree, free of the
// preserved spike evidence, and free of every account-linked identifier that evidence holds.
// Any non-zero exit names the reason on stdout.
//
// THREE THINGS THIS FILE IS BUILT AROUND, each of them a measured failure elsewhere in this
// build rather than a precaution:
//
//   1. IT CONTAINS NO SECRET. The denied values are DERIVED at run time by diffing
//      _spike-evidence/FINDINGS.md (the raw record) against FINDINGS-SCRUBBED.md (the same
//      document with every account-linked identifier replaced). This file is itself staged for
//      the commit it audits, so a hardcoded needle list would BE the leak it is looking for.
//      _spike-evidence/ is gitignored and never ships; the needles live only in memory.
//
//   2. EVERY ABSENCE-SHAPED SCAN CARRIES A NON-VACUITY PROBE. A scanner that reads nothing
//      reports exactly what a clean repository reports. So each scan is run a second time
//      against a temp copy with a synthetic marker planted in it, and a probe that goes quiet
//      FAILS THE AUDIT. That includes the enumeration itself: the path rule is probed by
//      re-enumerating with the ignore rules disabled and requiring the forbidden directories
//      to appear, because "no spike paths staged" and "the enumerator cannot see spike paths"
//      are otherwise the same green.
//
//   3. IT NEVER USES A LINE-ORIENTED MATCHER. dist/assets/index-*.js is one line of ~1 MB;
//      a line-based scan returns no match against text that is plainly there, and the result
//      is indistinguishable from a genuine absence. Every content test reads the whole file
//      and does a substring containment test. Source is additionally passed through a literal
//      joiner first, because this app splits nearly every sentence across two or three string
//      literals joined by `+`, and an unjoined scan cannot see a value written that way.
//
// It does not commit, does not stage, and does not touch a remote. `git add --dry-run` is the
// only git command that could write, and the index is compared before and after to prove it did not.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..');
const EVIDENCE = join(ROOT, '_spike-evidence');

const failures = [];
const notes = [];
const fail = (reason) => failures.push(reason);
const note = (line) => notes.push(line);

// advice.addEmbeddedRepo is off because probe A1 runs the enumeration with `--force`, which walks
// into the nested spike repository and prints a nine-line submodule hint every time. Silencing the
// hint is not silencing the finding: CHECK D asserts separately that no gitlink is in the commit set.
const git = (...args) =>
  execFileSync('git', ['-C', ROOT, '-c', 'advice.addEmbeddedRepo=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

// ---------------------------------------------------------------------------
// 0. The evidence directory is the source of truth for the denied values.
//    Missing it does not make the repository clean, it makes the audit blind.
// ---------------------------------------------------------------------------

if (!existsSync(join(EVIDENCE, 'FINDINGS.md')) || !existsSync(join(EVIDENCE, 'FINDINGS-SCRUBBED.md'))) {
  console.log('FAIL: _spike-evidence/FINDINGS.md and FINDINGS-SCRUBBED.md are the source of the');
  console.log('      denied-value list. Without both, every content scan below is vacuous, so this');
  console.log('      audit refuses to report a clean tree rather than reporting one it cannot see.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 1. THE UNIVERSE — the file set the resulting commit's tree would contain.
//
//    Not the diff. A commit carries the whole tree, so an identifier sitting in a file that
//    was committed at s8 and never touched since is exposed by publishing just as surely as
//    one added today. The universe is therefore: tracked files, plus everything `git add -A`
//    would add, minus everything it would remove. `git ls-files` alone is the universe that
//    was already measured blind here (~110 files behind on-disk state); the union is not.
// ---------------------------------------------------------------------------

const parseDryRun = (out) => {
  const added = [];
  const removed = [];
  for (const line of out.split('\n')) {
    const m = /^(add|remove) '(.*)'\s*$/.exec(line.trim());
    if (!m) continue;
    (m[1] === 'add' ? added : removed).push(m[2]);
  }
  return { added, removed };
};

const indexBefore = git('diff', '--cached', '--name-only');
const dryRun = parseDryRun(git('add', '-An', '--all', '.'));
const indexAfter = git('diff', '--cached', '--name-only');
if (indexBefore !== indexAfter) {
  fail('the dry-run enumeration modified the index — refusing to report on a tree it changed');
}

// THE PATHS THE UNIVERSE REACHES THAT ARE NOT IN HEAD. This is the quantity the non-vacuity floor
// below is placed on, and it is derived from HEAD rather than from the index because `git add -A` —
// the very act this audit exists to precede — moves a path from untracked into the index WITHOUT
// CHANGING THE UNIVERSE BY ONE PATH, so a floor on "untracked files exist" reads zero on the only
// state a publish actually runs in. Not-in-HEAD is the same set in both states (unstaged it is the
// untracked files; staged it is the added entries) and its value does not depend on whether
// somebody has run `git add`. -z because a path with a space or a non-ASCII byte comes back quoted
// from the newline form, and a mis-parsed path silently leaves a real file out of the floor's set.
const headPaths = git('ls-tree', '-r', '-z', '--name-only', 'HEAD').split('\0').filter(Boolean);
const headSet = new Set(headPaths);

const enumerate = () => {
  const tracked = git('ls-files').split('\n').map((s) => s.trim()).filter(Boolean);
  const dry = parseDryRun(git('add', '-An', '--all', '.'));
  const set = new Set(tracked);
  for (const p of dry.added) set.add(p);
  for (const p of dry.removed) set.delete(p);
  const trackedSet = new Set(tracked);
  const paths = [...set].sort();
  return {
    paths,
    tracked,
    added: dry.added,
    removed: dry.removed,
    // The region s11 measured a prose gate blind to: files that have never been through any
    // commit-time review, and which this first commit publishes in one act. Descriptive only —
    // it is zero on a staged tree, which is why the floor is on notInHead and not on this.
    untracked: dry.added.filter((p) => !trackedSet.has(p)),
    // The real quantity: everything this commit would publish that no commit has carried before,
    // whether it reached the universe as an untracked file or as a staged addition.
    notInHead: paths.filter((p) => !headSet.has(p)),
  };
};

const universe = enumerate();
const stagedPaths = universe.paths;

// THE UNIVERSE, STATED OUT LOUD. A reader of a passing run must be able to see what was walked
// rather than infer it — an absence-shaped pass whose universe is unstated is the failure this
// whole audit exists to prevent.
const UNIVERSE_SENTENCE =
  `UNIVERSE WALKED: the ${stagedPaths.length} paths the resulting commit's tree would contain — ` +
  `${universe.notInHead.length} of them NOT IN HEAD and so never commit-reviewed, ` +
  `${universe.tracked.length} in the index, ${universe.untracked.length} still untracked, ` +
  `${universe.added.length - universe.untracked.length} tracked-and-modified, ` +
  `less ${universe.removed.length} deletion(s). Enumerated from git, so the root .gitignore's ` +
  `/spike/ and /_spike-evidence/ rules are honoured — and probe A1 below proves that is exclusion ` +
  `rather than blindness.`;
note(UNIVERSE_SENTENCE);
if (stagedPaths.length < 200) {
  fail(`the universe holds only ${stagedPaths.length} paths, which is too few to be this repository — the enumeration is broken, not the tree clean`);
}
if (universe.notInHead.length === 0) {
  fail(
    'the enumeration reports ZERO paths outside HEAD. This tree is known to carry a large region ' +
      'that no commit has ever carried, and that region is the highest-risk part of a first ' +
      'commit. An enumeration that reaches nothing new is vacuous — its clean verdict would be a ' +
      'fact about an empty list rather than about the tree — so the audit reports that rather ' +
      'than reporting clean.'
  );
}

// ---------------------------------------------------------------------------
// 2. CHECK A — the spike tree and the preserved spike evidence never appear.
// ---------------------------------------------------------------------------

const FORBIDDEN_PREFIXES = ['_spike-evidence/', 'spike/'];
const forbiddenIn = (paths) =>
  paths.filter((p) => FORBIDDEN_PREFIXES.some((pre) => p === pre.slice(0, -1) || p.startsWith(pre)));

const hitsA = forbiddenIn(stagedPaths);
if (hitsA.length) {
  fail(`CHECK A: ${hitsA.length} forbidden path(s) would be committed: ${hitsA.slice(0, 20).join(', ')}`);
}

// Probe A1 — THE UNIVERSE PROBE. Disable the ignore rules and re-enumerate. The forbidden
// directories must appear. If they do not, check A's green describes an enumerator that cannot
// reach them, not a repository that excludes them — which is the same green and a different fact.
const unignored = parseDryRun(git('add', '-An', '--all', '--force', '.')).added;
const probeA1 = forbiddenIn(unignored);
const sawEvidence = probeA1.some((p) => p.startsWith('_spike-evidence/'));
const sawSpike = probeA1.some((p) => p.startsWith('spike/'));
if (!sawEvidence || !sawSpike) {
  fail(
    `PROBE A1 WENT QUIET: forcing the ignore rules off surfaced ${probeA1.length} forbidden path(s) ` +
      `(_spike-evidence: ${sawEvidence}, spike: ${sawSpike}). Both must appear, or CHECK A is asserting ` +
      `over a universe that never contained the thing it looks for.`
  );
} else {
  note(`probe A1 FIRED: ${probeA1.length} forbidden paths are reachable with ignores off and excluded with them on`);
}

// Probe A2 — the matcher itself, against synthetic paths.
const probeA2 = forbiddenIn([...stagedPaths, '_spike-evidence/SYNTHETIC.md', 'spike/synthetic.js']);
if (probeA2.length !== hitsA.length + 2) {
  fail(`PROBE A2 WENT QUIET: the path matcher found ${probeA2.length - hitsA.length} of 2 planted forbidden paths`);
} else {
  note('probe A2 FIRED: the path matcher flags both planted forbidden paths');
}

// ---------------------------------------------------------------------------
// 2b. CHECK C — what is committed as BUILD OUTPUT versus what is committed as SOURCE.
//
//     app/dist/ is tracked ON PURPOSE: the published site is a static host with no build step,
//     so the built output has to be in the repository, and both .gitignore files say so in
//     writing. That is a different thing from source, and the distinction has to survive here or
//     the next reader treats a committed bundle as evidence that committing build output is
//     normal. What must NOT be committed is a built artefact or a scratch tree ANYWHERE ELSE:
//     a second dist/, a coverage or cache directory, or the leavings of a walk that ran in-tree.
// ---------------------------------------------------------------------------

const BUILD_OUTPUT_ROOT = 'app/dist/';
const distStaged = stagedPaths.filter((p) => p.startsWith(BUILD_OUTPUT_ROOT));
const SCRATCH_OR_BUILT_ELSEWHERE = [
  [/(^|\/)dist\//, 'a built bundle outside app/dist'],
  [/(^|\/)build\//, 'a build directory'],
  [/(^|\/)coverage\//, 'a coverage report'],
  [/(^|\/)\.vite\//, 'a vite cache'],
  [/(^|\/)node_modules\//, 'a dependency tree'],
  [/fit-a\d+/i, 'a scratch walk tree'],
  [/scratchpad/i, 'a scratchpad artefact'],
  [/\.tsbuildinfo$/, 'a typescript build cache'],
];
const misfiled = [];
for (const p of stagedPaths) {
  if (p.startsWith(BUILD_OUTPUT_ROOT)) continue;
  for (const [re, what] of SCRATCH_OR_BUILT_ELSEWHERE) {
    if (re.test(p)) misfiled.push(`${p} — ${what}`);
  }
}
if (misfiled.length) {
  fail(`CHECK C: ${misfiled.length} path(s) would be committed as source but are built output or scratch:\n${misfiled.slice(0, 20).map((m) => '  ' + m).join('\n')}`);
}
note(
  `build output vs source: ${distStaged.length} paths under ${BUILD_OUTPUT_ROOT} are committed ` +
    `DELIBERATELY AS BUILD OUTPUT (static host, no build step; both .gitignore files record the ` +
    // The active voice below is deliberate, and src/proof's forbidden-claims gate is what chose it.
    // The passive phrasing this sentence first carried reads as a claim that the software has been
    // through a certification, which is a claim this repository forbids anywhere in its prose — and
    // it is the wrong claim besides. What is true is narrower: this script searched these files on
    // this run. The gate caught the sentence; the sentence changed, and the rule did not.
    `decision) and this script searches their content the same as source. The other ` +
    `${stagedPaths.length - distStaged.length} paths are committed as source, and none of them is ` +
    `a built artefact or a scratch tree.`
);

// ---------------------------------------------------------------------------
// 3. THE DENIED VALUES — derived, never written down.
//
//    This is the CONTENT half of the spike-evidence rule, and it is the half that matters.
//    Check A keeps _spike-evidence/ out by path. But the leak that actually happens is a COPY of
//    one of those strings — a Drive file id, a calendar event id, the base64 `eid` that decodes
//    to the signed-in address — pasted into a note, a fixture, a doc or a bundle that sits
//    nowhere near _spike-evidence/. Nothing about such a file looks wrong, and no credential
//    scanner fires on it, because none of it is shaped like a credential. So the values
//    themselves become the needles and every staged file is searched for them.
// ---------------------------------------------------------------------------

const readText = (p) => readFileSync(p, 'latin1');

const EVIDENCE_RAW = [
  join(EVIDENCE, 'FINDINGS.md'),
  join(EVIDENCE, 'results', 'laptop-preflight.json'),
  join(EVIDENCE, 'results', 'phone-ios-standalone.json'),
].filter(existsSync);

const rawEvidence = EVIDENCE_RAW.map(readText).join('\n');
const scrubbed = readText(join(EVIDENCE, 'FINDINGS-SCRUBBED.md'));

// `/` is deliberately NOT in the token class. With it, a URL becomes ONE token, so
// `//visak13.github.io/Fit/` is a different token from the bare `visak13.github.io` the scrubbed
// copy carries — and the published GitHub Pages origin, which _spike-evidence/README.md records
// as an explicit ALLOW, gets denied. Splitting on `/` loses nothing: the hazard in a Drive URL is
// the file id, and the id is captured on its own. Measured: 25 needles with `/`, of which 11 were
// URL-shaped noise and 2 were the allowed origin; 14 without, keeping all four calendar `eid`s.
const TOKEN = /[A-Za-z0-9_@.+-]{10,}/g;
const scrubTokens = new Set(scrubbed.match(TOKEN) ?? []);
const rawTokens = [...new Set(rawEvidence.match(TOKEN) ?? [])];

// Over-broad on purpose at the token step, then narrowed to identifier SHAPES. A false positive
// costs a line of output; a false negative is the leak. What is dropped here is prose, decimal
// measurements, SNAKE_CONSTANTS, filenames and public Google asset names — none of which is
// account-linked, all of which occur in ordinary source and would make the audit cry wolf.
const identifierShaped = (t) => {
  if (/^[0-9.]+$/.test(t)) return false;
  if (/^[a-z]+$/.test(t)) return false;
  if (/^[A-Z][a-z]+$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false;
  if (/^[A-Za-z0-9_]+\.[a-z0-9]{2,4}$/.test(t)) return false;
  if (/^[a-zA-Z]+(\.[a-zA-Z]+)+$/.test(t)) return false;
  const mixed = /[0-9]/.test(t) && /[A-Za-z]/.test(t);
  return (mixed && t.length >= 16) || t.length >= 24;
};

const needles = new Map(); // needle -> class

const addNeedle = (value, cls) => {
  if (typeof value !== 'string' || value.length < 8) return;
  if (!needles.has(value)) needles.set(value, cls);
};

for (const t of rawTokens) {
  if (!scrubTokens.has(t) && identifierShaped(t)) addNeedle(t, 'account-linked identifier');
}

// Google Meet codes are xxx-xxxx-xxx and never survive the shape filter above.
for (const m of new Set(rawEvidence.match(/\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/g) ?? [])) {
  if (!scrubTokens.has(m)) addNeedle(m, 'meeting code');
}

// The signed-in address is not in the evidence in plaintext — it is inside the calendar
// htmlLink `eid`, which is base64 of "<event id> <address>". Recover it, then deny it in
// plaintext AND in all three base64 phase alignments, because a re-encoding of the same
// address inside a longer string shares only one of the three.
const b64decode = (t) => {
  const s = t.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64').toString('latin1');
};
// Scanned with its OWN pattern, not from `rawTokens`: standard base64 contains `/`, and `/` is
// out of the token class above for the reason given there. An eid split at a `/` decodes to a
// truncated string whose address has lost its domain — which reads as "no address found".
const addresses = new Set();
const b64Runs = new Set([
  ...(rawEvidence.match(/[A-Za-z0-9+/_-]{28,}={0,2}/g) ?? []),
  ...rawTokens.filter((t) => t.length >= 20 && /^[A-Za-z0-9+/_-]+=*$/.test(t)),
]);
for (const t of b64Runs) {
  // Try every trailing truncation to a quad boundary: the run may carry a character that is valid
  // base64 but not part of the value, and one stray byte loses the tail of the decoded address.
  for (const end of [t.length, t.length - 1, t.length - 2, t.length - 3]) {
    if (end < 20) continue;
    let decoded;
    try {
      decoded = b64decode(t.slice(0, end));
    } catch {
      continue;
    }
    // A PARTIAL address, not a whole one, and deliberately so. FINDINGS.md quotes the `eid` with a
    // trailing ellipsis — the document truncated it when it was written — so the longest thing that
    // decodes out is the event id, a space, the account's local part and the first character of the
    // domain. Requiring a well-formed address here would assert a quantity the evidence does not
    // contain, and a floor placed on the wrong quantity is a lock, not a check. The local part on
    // its own is the account-linking half anyway, and because the needle is a PREFIX of the real
    // value, a substring search for it still catches the untruncated address wherever one appears.
    for (const a of decoded.match(/[A-Za-z0-9._%+-]{5,}@[A-Za-z0-9.-]*/g) ?? []) addresses.add(a);
  }
}
// A longer recovery subsumes a shorter one that is its own truncation.
for (const a of [...addresses]) {
  if ([...addresses].some((b) => b !== a && b.startsWith(a))) addresses.delete(a);
}
for (const a of addresses) {
  const localPart = a.split('@')[0];
  addNeedle(a, 'signed-in account fragment');
  if (localPart.length >= 6) addNeedle(localPart, 'signed-in account local part');
  // Denied in plaintext AND in all three base64 phase alignments: the same value re-encoded at a
  // different offset inside a longer string shares none of the other two encodings, so a single
  // alignment misses it. The README's own scrub verification searched all three; so does this.
  for (let phase = 0; phase < 3; phase += 1) {
    const encoded = Buffer.from('x'.repeat(phase) + localPart, 'latin1').toString('base64');
    const core = encoded.slice(Math.ceil((phase * 4) / 3) + 1, encoded.replace(/=+$/, '').length - 1);
    addNeedle(core, `signed-in account local part, base64 phase ${phase}`);
  }
}

// An operator-supplied list of real people, if one exists. It lives beside the evidence, which is
// gitignored, so naming a real client here never puts one in the repository.
const namesFile = join(EVIDENCE, 'DENIED-NAMES.txt');
let namesSourced = false;
if (existsSync(namesFile)) {
  for (const line of readText(namesFile).split('\n')) {
    const v = line.trim();
    if (v && !v.startsWith('#')) {
      addNeedle(v, 'real person name');
      namesSourced = true;
    }
  }
}

// Credential SHAPES. These need no source of truth: they are recognisable by construction, and
// they are the classes _spike-evidence/README.md points out the evidence does NOT contain — so
// they are here to catch something arriving from anywhere else, not to re-check the evidence.
//
// The patterns are ASSEMBLED FROM FRAGMENTS rather than written out. That is not obfuscation: a
// scanner whose source contains a literal `GOCSPX-...` or `ya29....` reports ITSELF on every run,
// and this file is staged for the very commit it audits. Measured on the first run — seven of the
// thirteen hits were this file quoting its own patterns. Fragmented, the file genuinely contains
// no credential-shaped string, so the finding disappears because the fact changed.
const SHAPES = [
  ['OAuth client id', new RegExp(String.raw`\b\d{6,}-[a-z0-9]{16,}\.apps\.` + 'google' + String.raw`usercontent\.com\b`, 'g')],
  ['OAuth client secret', new RegExp(String.raw`\bGO` + 'CSPX' + String.raw`-[A-Za-z0-9_-]{20,}`, 'g')],
  ['Google API key', new RegExp(String.raw`\bAI` + 'za' + String.raw`[0-9A-Za-z_-]{35}\b`, 'g')],
  ['OAuth access token', new RegExp(String.raw`\bya` + '29' + String.raw`\.[0-9A-Za-z._-]{20,}`, 'g')],
  ['OAuth refresh token', new RegExp(String.raw`\b1` + '//' + String.raw`0[0-9A-Za-z._-]{20,}`, 'g')],
  ['private key block', new RegExp('-----BEG' + String.raw`IN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----`, 'g')],
  ['assigned client secret', new RegExp(String.raw`\bclient` + '_secret' + String.raw`\s*[:=]\s*["'][^"'\s]{8,}["']`, 'g')],
  ['bearer JWT', new RegExp(String.raw`\bey` + 'J' + String.raw`[A-Za-z0-9_-]{10,}\.ey` + 'J' + String.raw`[A-Za-z0-9_-]{10,}\.`, 'g')],
];

// THE ALLOW LIST — the only way anything gets waved through, and it is a whitelist with a reason
// per entry, printed on every passing run so a reader sees what was excused rather than trusting
// that nothing was. Two guards keep it from becoming the hole it could be:
//   * an entry that matches NOTHING fails the audit. An allow for something no longer in the tree
//     is a lock waiting to hide the next arrival at that site — the dated-claim failure measured
//     in this build, where a parked reason stayed green through the step that falsified it.
//   * a credential-shape allow must ALSO be visibly synthetic at the site, so waving through a
//     test fixture cannot wave through a real value that happens to share its file.
const SYNTHETIC_MARKERS = ['NotAReal', 'notareal', 'not.a.real', 'not-a-real', 'AbCdEfGh', 'a1b2c3', 'abc123', 'example.com'];
const ALLOWED_SHAPES = [
  {
    path: 'app/src/platform/google-privacy.test.ts',
    cls: 'OAuth refresh token',
    reason:
      'the suite that asserts tokens and Drive ids NEVER leave the platform module; its fixtures are ' +
      'the forbidden values, so it necessarily contains credential shapes. Every one is self-labelled ' +
      'not real, and none is in the derived denied set.',
  },
  {
    path: 'app/src/screens/setup.test.ts',
    cls: 'OAuth client secret',
    reason:
      'the setup screen must TELL the coach when he has pasted the client secret instead of the client ' +
      'id, so the test drives a secret-shaped string through that check. Synthetic, and not in the ' +
      'derived denied set.',
  },
];
const allowUsed = new Set();

const byClass = new Map();
for (const cls of needles.values()) byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
note(
  `denied values derived from _spike-evidence: ${needles.size} across ${byClass.size} classes ` +
    `(${[...byClass].map(([c, n]) => `${c} x${n}`).join('; ')}); plus ${SHAPES.length} credential shapes`
);
if (!namesSourced) {
  note(
    'NOT ASSERTED — real client names: no _spike-evidence/DENIED-NAMES.txt exists, and nothing in ' +
      'this tree records a real client, so there is no list to search for. This class is reported ' +
      'unsourced rather than reported clean: a scan with an empty needle list passes for free.'
  );
}
// A floor on the DERIVATION, not just on the count. _spike-evidence/README.md names three hazard
// classes in writing: Drive file/folder ids, calendar event ids, and the base64 `eid` that decodes
// to the event id followed by the signed-in address. Each has a characteristic length here, so the
// derived set must contain one of each. A count alone passes the day the shape filter over-narrows.
const lengths = [...needles.keys()].map((n) => n.length);
const derivationFloor = [
  ['a Drive-id-length token (>=33)', lengths.some((n) => n >= 33)],
  ['a calendar-event-id-length token (>=26)', lengths.some((n) => n >= 26)],
  ['a base64 eid-length token (>=48)', lengths.some((n) => n >= 48)],
  ['a signed-in account fragment recovered out of a base64 calendar eid', addresses.size > 0],
];
const missingFloor = derivationFloor.filter(([, ok]) => !ok).map(([what]) => what);
if (missingFloor.length) {
  fail(`the derivation from _spike-evidence produced no ${missingFloor.join(', no ')} — the needle list is broken, and the evidence is not harmless just because the scan found nothing`);
}
if (needles.size < 10) {
  fail(`only ${needles.size} denied values were derived from the evidence — the derivation is broken, not the evidence harmless`);
}

// ---------------------------------------------------------------------------
// 4. THE SCANNER — whole-file substring, never a line matcher; literals joined first.
// ---------------------------------------------------------------------------

const JOINABLE = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.md', '.html', '.json']);

// This app writes nearly every sentence as two or three string literals joined by `+`. A value
// written that way exists in no file as a contiguous string, so it is invisible to a substring
// test until the literals are joined. Run to a fixpoint so three-part and longer chains collapse.
const joinAdjacentLiterals = (text) => {
  const PAIR = /(['"])((?:\\.|(?!\1)[^\\\r\n])*)\1\s*\+\s*(['"])((?:\\.|(?!\3)[^\\\r\n])*)\3/g;
  let out = text;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = out.replace(PAIR, (_m, q1, a, _q2, b) => `${q1}${a}${b}${q1}`);
    if (next === out) break;
    out = next;
  }
  return out;
};

// One scan of one file. `text` is read whole and tested with indexOf — deliberately not split
// into lines, because dist/assets/index-*.js is a single ~1 MB line and every line-oriented
// matcher reads nothing from it while reporting nothing found.
const scanText = (path, text) => {
  const found = [];
  const joined = JOINABLE.has(extname(path).toLowerCase()) ? joinAdjacentLiterals(text) : text;
  for (const [needle, cls] of needles) {
    if (text.includes(needle)) found.push({ path, cls, how: 'raw' });
    else if (joined !== text && joined.includes(needle)) found.push({ path, cls, how: 'joined literals' });
  }
  for (const [cls, re] of SHAPES) {
    re.lastIndex = 0;
    const hits = [...(text.match(re) ?? [])];
    re.lastIndex = 0;
    if (joined !== text) hits.push(...(joined.match(re) ?? []));
    if (!hits.length) continue;

    const allow = ALLOWED_SHAPES.find((a) => a.path === path && a.cls === cls);
    if (allow) {
      const notSynthetic = hits.filter(
        (h) => !SYNTHETIC_MARKERS.some((m) => h.toLowerCase().includes(m.toLowerCase()))
      );
      const alsoDenied = hits.filter((h) => [...needles.keys()].some((n) => h.includes(n)));
      if (notSynthetic.length || alsoDenied.length) {
        found.push({ path, cls, how: `shape — ALLOWED at this site, but ${notSynthetic.length} hit(s) carry no synthetic marker and ${alsoDenied.length} match a derived denied value; the allow does not cover them` });
      } else {
        allowUsed.add(`${path}|${cls}`);
      }
      continue;
    }
    found.push({ path, cls, how: 'shape' });
  }
  return found;
};

const scanFiles = (paths, root) => {
  const found = [];
  let read = 0;
  let bytes = 0;
  for (const p of paths) {
    const abs = join(root, p);
    if (!existsSync(abs)) continue;
    let text;
    try {
      text = readText(abs);
    } catch {
      continue;
    }
    read += 1;
    bytes += text.length;
    found.push(...scanText(p, text));
  }
  return { found, read, bytes };
};

const scan = scanFiles(stagedPaths, ROOT);
note(`scanned ${scan.read} files, ${(scan.bytes / 1048576).toFixed(2)} MiB, whole-file substring`);
if (scan.read < stagedPaths.length * 0.9) {
  fail(`only ${scan.read} of ${stagedPaths.length} staged paths were readable — a scan that skips files is not a clean result`);
}
if (scan.found.length) {
  const shown = scan.found.slice(0, 40).map((f) => `  ${f.path} — ${f.cls} (${f.how})`);
  fail(`CHECK B: ${scan.found.length} account-linked or credential hit(s) in files a commit would carry:\n${shown.join('\n')}`);
}

// The allow list, reported and policed. An entry that fired is printed with its reason so a
// passing run shows what was excused; an entry that fired for nothing is a stale lock and fails.
for (const a of ALLOWED_SHAPES) {
  const key = `${a.path}|${a.cls}`;
  if (allowUsed.has(key)) note(`ALLOWED — ${a.cls} in ${a.path}: ${a.reason}`);
  else fail(`the allow for "${a.cls}" in ${a.path} matched nothing. Either the file changed or the pattern did; an allow that covers nothing today is a hole waiting for tomorrow's arrival at that site, so it is removed or corrected, not left standing.`);
}

// A nested git repository is committed as a GITLINK: a 40-character pointer, with none of the
// content. Three .git directories sit inside this tree. A publish that silently carries an empty
// submodule reference is a broken repository at the public address, so it is named here.
const gitlinks = git('ls-files', '-s')
  .split('\n')
  .filter((l) => l.startsWith('160000'))
  .map((l) => l.split('\t').pop());
if (gitlinks.length) {
  fail(`CHECK D: ${gitlinks.length} nested repositor(y/ies) would be committed as an empty gitlink pointer, not as content: ${gitlinks.join(', ')}`);
} else {
  note('no gitlink in the commit set: no nested repository would publish as an empty submodule pointer');
}

// ---------------------------------------------------------------------------
// 5. NON-VACUITY PROBES for the content scan.
// ---------------------------------------------------------------------------

const distFiles = stagedPaths.filter((p) => p.startsWith('app/dist/'));
if (!distFiles.length) fail('no app/dist/ file is in the staged universe — dist is committed on purpose and must be audited');
const biggestDist = distFiles
  .map((p) => ({ p, n: (() => { try { return readText(join(ROOT, p)).length; } catch { return 0; } })() }))
  .sort((a, b) => b.n - a.n)[0];
note(`dist in universe: ${distFiles.length} files; largest ${biggestDist?.p} at ${biggestDist?.n} bytes`);

const tmp = mkdtempSync(join(tmpdir(), 'fit-publish-audit-'));
try {
  // Probe B1 — one plant per class, in a temp copy of the REAL largest dist bundle. Planting into
  // the actual minified one-liner is the point: it proves the reader and the matcher survive the
  // artefact that defeated a line-based scan here before, rather than proving it on a toy file.
  const bundleText = readText(join(ROOT, biggestDist.p));
  const plantedClasses = new Map();
  let planted = bundleText;
  for (const [needle, cls] of needles) {
    if (plantedClasses.has(cls)) continue;
    plantedClasses.set(cls, needle);
    planted += `\n/*probe*/var _p${plantedClasses.size}=${JSON.stringify(needle)};`;
  }
  // Same reason as the patterns: assembled from fragments so this file carries no contiguous
  // credential-shaped string of its own and does not report itself.
  const AZ = 'abcdefghijklmnopqrstuvwxyz';
  const shapeSamples = [
    ['OAuth client id', '123456789012-' + AZ + '012345' + '.apps.' + 'google' + 'usercontent.com'],
    ['OAuth client secret', 'GO' + 'CSPX' + '-' + AZ + '01'],
    ['Google API key', 'AI' + 'za' + 'SyA' + 'b'.repeat(32)],
    ['OAuth access token', 'ya' + '29' + '.' + AZ + '0123456789'],
    ['OAuth refresh token', '1' + '//' + '0' + AZ + '0123456789'],
    // These three are built with .join('') rather than `+`, and that is the literal joiner doing
    // its job on this very file: `'a' + 'b'` is exactly what the joiner reassembles, so a `+`
    // here puts the credential shape back together and this file reports itself. Measured.
    ['private key block', ['-----BEG', 'IN PRIVATE KEY-----'].join('')],
    ['assigned client secret', ['client', '_secret', ': "abcdefghijklmnop"'].join('')],
    ['bearer JWT', ['ey', 'JhbGciOiJIUzI1NiJ9.ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0.sig'].join('')],
  ];
  // Written raw, NOT through JSON.stringify: stringifying the client_secret sample escapes its
  // inner quotes to \" and the pattern stops matching, which reports as the probe going quiet.
  for (const [, sample] of shapeSamples) planted += `\n/*probe*/ ${sample} ;`;

  const b1Path = join(tmp, 'planted-bundle.js');
  writeFileSync(b1Path, planted, 'latin1');
  const b1 = scanText('app/dist/planted-bundle.js', readText(b1Path));
  const b1Classes = new Set(b1.map((f) => f.cls));
  const expected = [...plantedClasses.keys(), ...shapeSamples.map(([c]) => c)];
  const quiet = expected.filter((c) => !b1Classes.has(c));
  if (quiet.length) {
    fail(`PROBE B1 WENT QUIET for ${quiet.length} class(es): ${quiet.join(', ')}. The scanner cannot see values of these classes, so their absence from the tree is unproven.`);
  } else {
    note(`probe B1 FIRED: all ${expected.length} classes detected when planted in a ${planted.length}-byte copy of the real dist bundle`);
  }

  // Probe B2 — the positive control on dist. A reader that returns nothing reports a clean tree.
  // Take a string that IS in the shipped bundle and require the whole-file test to find it.
  const control = 'sourceMappingURL';
  const distIndex = stagedPaths.find((p) => p === 'app/dist/index.html');
  const controlHit =
    bundleText.includes(control) ||
    (distIndex ? readText(join(ROOT, distIndex)).includes('<script') : false);
  if (!controlHit) {
    fail('PROBE B2 WENT QUIET: neither a known bundle marker nor a script tag in dist/index.html was found by the whole-file reader — it is reading nothing, and "nothing found" above means nothing.');
  } else {
    note('probe B2 FIRED: the whole-file reader finds a string known to be in dist');
  }

  // Probe B3 — the literal joiner. Plant a needle SPLIT across two adjacent literals. The raw
  // test must miss it and the joined test must catch it; if the raw test catches it the probe
  // did not exercise the joiner and proves nothing about split text.
  const splitNeedle = [...needles.keys()].find((n) => n.length >= 16) ?? [...needles.keys()][0];
  const half = Math.floor(splitNeedle.length / 2);
  const b3Src = `export const m = ${JSON.stringify(splitNeedle.slice(0, half))} + ${JSON.stringify(splitNeedle.slice(half))};\n`;
  const b3Path = join(tmp, 'planted-split.ts');
  writeFileSync(b3Path, b3Src, 'latin1');
  const b3Text = readText(b3Path);
  const b3 = scanText('app/src/planted-split.ts', b3Text);
  if (b3Text.includes(splitNeedle)) {
    fail('PROBE B3 DID NOT APPLY: the split plant was contiguous in the file, so it never exercised the literal joiner');
  } else if (!b3.some((f) => f.how === 'joined literals')) {
    fail('PROBE B3 WENT QUIET: a denied value split across two adjacent string literals was not found. Values written the way this app writes them are invisible to this audit.');
  } else {
    note('probe B3 FIRED: a denied value split across two adjacent literals is caught only after joining');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 5b. THE UNIVERSE PROBES FOR CHECK B — the pair that makes a pass mean something.
//
//     B1/B2/B3 above prove the SCANNER works. They say nothing about the SET it was pointed at,
//     and the set is the layer nobody probes. Two plants, pulling opposite ways:
//
//       C1 (positive) — a denied value in a path THE FLOOR'S SET CONTAINS: one that the universe
//          reaches and HEAD does not. TWO ARMS, because that set is populated two different ways
//          and a probe covering one arm is silent about the other:
//            C1a — a NEW UNTRACKED file inside app/. s11 measured a prose gate that reported
//               everything clean while planted claims sat in exactly that region, because its
//               universe was `git ls-files`.
//            C1b — an EXISTING member of the not-in-HEAD set, a STAGED one wherever one exists.
//               On a staged tree — the only state a publish actually runs in — there are no
//               untracked files, so C1a plants the only untracked file in the run and proves
//               untracked coverage over a universe that has none. C1b plants where the risk
//               actually is. The plant is an append to the WORKING COPY, restored byte-for-byte
//               in the same run and asserted restored; the index is never touched.
//          Both arms must fire, in either state, or the audit has not proven it covers the set
//          its floor is placed on and it says so.
//
//       C2 (negative) — the same denied value in a file the universe EXCLUDES (an ignored path,
//          confirmed ignored by `git check-ignore`). This audit must NOT report it. A scanner
//          that fires everywhere is as uninformative as one that fires nowhere; without this
//          plant, C1 firing is equally consistent with an audit that walks the whole disk.
// ---------------------------------------------------------------------------

const probeNeedle = [...needles.keys()].sort((a, b) => b.length - a.length)[0];
const posProbePath = 'app/.publish-audit-untracked-probe.tmp.mjs';
const negProbePath = 'app/node_modules/.publish-audit-ignored-probe.tmp.mjs';
const posAbs = join(ROOT, posProbePath);
const negAbs = join(ROOT, negProbePath);
const probeBody = (p) => `// transient publish-audit probe (${p}); removed by the same run that wrote it\nexport const v = ${JSON.stringify(probeNeedle)};\n`;

// C1b's target: an existing member of the set the floor measures, preferring one that got there by
// being STAGED, since that is how every not-in-HEAD path arrives on the tree a publish runs against.
// -z for the same quoting reason as the HEAD listing above.
const stagedNotInHead = new Set(
  git('diff', '--cached', '--name-only', '--diff-filter=A', '-z', 'HEAD').split('\0').filter(Boolean)
);
const C1B_TEXT = new Set([...JOINABLE, '.txt', '.css', '.svg', '.yml', '.yaml']);
const sizeOnDisk = (p) => {
  try {
    return statSync(join(ROOT, p)).size;
  } catch {
    return 0;
  }
};
// Deterministic: staged first, then smallest, then alphabetical — so two runs of this audit over the
// same tree plant in the same file, and a reader can reproduce the arm rather than take it on trust.
const c1bTarget = universe.notInHead
  .filter((p) => p !== posProbePath && !p.startsWith(BUILD_OUTPUT_ROOT) && C1B_TEXT.has(extname(p).toLowerCase()))
  .map((p) => ({ p, staged: stagedNotInHead.has(p), n: sizeOnDisk(p) }))
  .filter((c) => c.n > 0 && c.n < 262144)
  .sort((a, b) => Number(b.staged) - Number(a.staged) || a.n - b.n || (a.p < b.p ? -1 : 1))[0];

if (existsSync(posAbs) || existsSync(negAbs)) {
  fail(`a probe file from a previous run is still on disk (${existsSync(posAbs) ? posProbePath : negProbePath}) — refusing to write over it or to report on a tree it is polluting`);
} else if (!existsSync(dirname(negAbs))) {
  fail(`the negative-universe probe needs an ignored directory to plant in and ${dirname(negProbePath)} does not exist — without it the audit cannot show that its universe EXCLUDES anything, so it does not claim a clean result`);
} else if (!c1bTarget) {
  fail(`PROBE C1b DID NOT APPLY: no existing readable text file in the universe is outside HEAD, so the arm that proves coverage of the set the floor measures has nowhere to plant. The audit does not report clean on a set it could not probe.`);
} else {
  const c1bAbs = join(ROOT, c1bTarget.p);
  // Saved and written back as raw bytes: `git checkout --` is NOT a byte-exact revert in this
  // repository (core.autocrlf is true and the comparison normalises), so the restore is this
  // buffer and it is asserted, never delegated to git.
  const c1bOriginal = readText(c1bAbs);
  try {
    writeFileSync(posAbs, probeBody(posProbePath), 'latin1');
    writeFileSync(negAbs, probeBody(negProbePath), 'latin1');
    writeFileSync(c1bAbs, c1bOriginal + `\n${probeBody(c1bTarget.p)}`, 'latin1');

    // The negative plant is only a negative plant if git agrees it is ignored.
    let negIgnored = false;
    try {
      execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', '--', negProbePath], { stdio: 'ignore' });
      negIgnored = true;
    } catch {
      negIgnored = false;
    }
    if (!negIgnored) {
      fail(`PROBE C2 DID NOT APPLY: ${negProbePath} is not ignored by git, so it does not sit outside the universe and proves nothing about exclusion`);
    }

    const reprobed = enumerate();
    const sawPos = reprobed.paths.includes(posProbePath);
    const sawNeg = reprobed.paths.includes(negProbePath);
    const rescan = scanFiles(reprobed.paths, ROOT);
    const posHit = rescan.found.some((f) => f.path === posProbePath);
    const negHit = rescan.found.some((f) => f.path === negProbePath);
    const sawC1b = reprobed.notInHead.includes(c1bTarget.p);
    const c1bHit = rescan.found.some((f) => f.path === c1bTarget.p);
    const c1bHow = c1bTarget.staged ? 'STAGED-BUT-NOT-IN-HEAD' : 'untracked-and-not-in-HEAD';

    if (!sawPos) {
      fail(`PROBE C1a WENT QUIET: a new untracked file under app/ did not enter the enumerated universe. The audit has NOT proven it covers files this commit would publish for the first time, and does not report clean.`);
    } else if (!posHit) {
      fail('PROBE C1a WENT QUIET: an untracked file carrying a denied value entered the universe but the content scan did not report it. Coverage of newly-appearing files is unproven.');
    } else {
      note(`probe C1a FIRED: a denied value planted in a new UNTRACKED file was enumerated and caught`);
    }

    if (!sawC1b) {
      fail(`PROBE C1b WENT QUIET: ${c1bTarget.p} is a path the universe reaches and HEAD does not, but it did not appear in the re-enumerated not-in-HEAD set. The floor's own set is not covered by the enumeration.`);
    } else if (!c1bHit) {
      fail(`PROBE C1b WENT QUIET: a denied value planted in ${c1bTarget.p} (${c1bHow}) was not reported by the content scan. The ${universe.notInHead.length} paths this commit would publish for the first time are NOT proven covered, and on a staged tree they are the whole of the new material.`);
    } else {
      note(`probe C1b FIRED: a denied value planted in ${c1bTarget.p} — an EXISTING ${c1bHow} member of the ${universe.notInHead.length}-path not-in-HEAD set — was caught; the set the floor measures is covered by construction, not by assumption`);
    }

    if (negIgnored && (sawNeg || negHit)) {
      fail(`PROBE C2 FAILED THE OTHER WAY: the audit reported a denied value planted in ${negProbePath}, which git ignores and which no commit would carry. Its universe is wider than the commit set, so its findings are not statements about what publishing exposes.`);
    } else if (negIgnored) {
      note('probe C2 FIRED: the same denied value planted in an ignored file was NOT reported — the universe excludes what a commit excludes');
    }

    // The scan the verdict rests on must be the one over the real tree, not the polluted one.
    if (rescan.found.length !== scan.found.length + (posHit ? 1 : 0) + (c1bHit ? 1 : 0)) {
      note(`(probe rescan saw ${rescan.found.length} hits against ${scan.found.length} in the clean tree; the verdict above uses the clean scan)`);
    }
  } finally {
    rmSync(posAbs, { force: true });
    rmSync(negAbs, { force: true });
    writeFileSync(c1bAbs, c1bOriginal, 'latin1');
  }

  // The C1b plant was made in a REAL file of this repository, so the restore is asserted, not
  // assumed: byte length first, then the bytes themselves. A probe that leaves a working file
  // altered has changed the tree it was auditing.
  const c1bRestored = readText(c1bAbs);
  if (c1bRestored.length !== c1bOriginal.length || c1bRestored !== c1bOriginal) {
    fail(`the C1b plant was not restored: ${c1bTarget.p} is ${c1bRestored.length} bytes and was ${c1bOriginal.length}. Restore it from the working copy before doing anything else.`);
  } else {
    note(`probe C1b restore verified: ${c1bTarget.p} is byte-identical at ${c1bOriginal.length} bytes`);
  }

  // A probe that leaves its plant behind has added a file to the very commit it audits.
  if (existsSync(posAbs) || existsSync(negAbs)) {
    fail('a probe file survived the run and is now sitting in the working tree — remove it before doing anything else');
  } else {
    const after = enumerate();
    if (after.paths.includes(posProbePath) || after.paths.includes(negProbePath)) {
      fail('a probe path is still in the enumerated universe after cleanup');
    } else if (after.paths.length !== stagedPaths.length) {
      fail(`the universe changed size across the run (${stagedPaths.length} -> ${after.paths.length}) — something wrote to the tree and the verdict cannot be trusted`);
    } else {
      note('probe cleanup verified: both plants removed and the universe is the size it started at');
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Report.
// ---------------------------------------------------------------------------

console.log('publish-audit — what a commit in ' + ROOT + ' would carry');
for (const n of notes) console.log('  ' + n);

if (failures.length) {
  console.log('');
  for (const f of failures) console.log('FAIL: ' + f);
  console.log('');
  console.log(`publish-audit: ${failures.length} failure(s). DO NOT PUBLISH.`);
  process.exit(1);
}

console.log('');
console.log('publish-audit: clean. No spike path and no derived account-linked value reaches the');
console.log('commit set, and every absence above was proven by a probe that fired.');
process.exit(0);

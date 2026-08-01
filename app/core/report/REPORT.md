# `core/report` — what a client's progress report SAYS

This package decides the **content** of the progress report a client receives. It does not decide the
file. Nothing here writes, encodes, packs or names an artefact: `core/export/` is deliberately the
only export machinery in this application, and a report is content that goes into it.

The API is **`report.js`**, imported **by path**. `index.js` beside it is the test entry point.
Directory-index resolution is a Node convenience the browser does not have, so a caller that imports
the directory passes every test in here and breaks the application.

```js
import { projectProgressReport } from './core/report/report.js';

const report = projectProgressReport({
  client,        // the client's own record — their name, and nothing else is read
  client_id,     // taken from the record when not passed
  sessions,      // the sessions they were on
  performed,     // their performed records
  readings,      // their readings
  exercises,     // the library, for movement names (optional)
});
```

Every input is a plain record or envelope, as the store hands it over. The package never fetches
anything.

## The three things it says

1. **Trends over time** in the readings the coach actually captures — one series per kind, with where
   it started, where it stands, and the movement between the two.
2. **Attendance and consistency** — how many sessions, over what stretch, how evenly they fall.
3. **A plain-language summary** of what they worked on, as sentences.

## And the fourth it deliberately does not

**No personal bests.** Bests were offered to the user and explicitly not chosen; an earlier decision
listing them is superseded. Nothing here takes a maximum, ranks a value, or crowns anything, and a
scan over this directory holds that. A best is the one number a client cannot beat on a tired day,
which turns a report meant to show movement into a standing reproach. *If a later step believes a
best would improve the report, that is a finding to raise — not a line to add.*

**No raw repetition counts, sets, loads or rest.** `participation.js` never carries them in, so there
is nothing to print by accident.

**No clinical content.** The client record's `notes`, `adaptation_flag` and sealed clinical fields are
never read. The default report needs no passphrase and has no friction, because there is nothing in it
that would justify either.

**No in-session notes at all.** The coach's note is his working record. It is not one of the three
things asked for, and a note written for himself is not a sentence written for a client to read.

## THE PRIVACY RULE, which is the one most likely to be missed

A session in this application carries **one to many** clients. A client's own report must never reveal
that anybody else was there — not a name, not an identifier, not a **count**, not a plural that
implies them, and not a session title that happens to carry one of them.

That rule is kept **structurally, not editorially**. `participation.js` REBUILDS a session out of an
allowlist (`session_id`, `at`, `status`, `mode`) rather than cleaning one. The roster, the
session-wide `summary`, the meeting link and the `routine_id` — which the coach may well have named
after the two people in it — are not stripped: they are never copied, and a field invented next year
is not copied either, because nothing copies it.

Downstream there is no filtering, because there is nothing left to filter.

`privacy.test.js` plants a genuinely shared session — two clients on the roster, the other one named
in the session summary and in the routine name, their own performed records and readings sitting in
the same arrays a caller hands over — and proves nothing about them reaches either the data or the
rendered words. It then **puts the leak back** and proves the identical assertion goes red, with the
leaked name in the failure message, so the red is attributable to the rule being probed.

## Guards

Every guard in this package derives its own scope by walking the directory and asserts that scope is
non-empty in the same run. Two vocabulary guards hold a map against the model rather than against a
memory: every unit in `READING_UNITS` must have words in `trends.js`, and every pattern in
`MOVEMENT_PATTERNS` must have a family in `focus.js`. A vocabulary that grows fails loudly instead of
quietly vanishing out of every summary.

## Purity

No store, no crypto, no browser, no clock, no randomness, no `node:` import. Every interval is
measured between two instants that are in the data — a report is a fixed statement, and
"last trained 3 days ago" rewrites itself into a reproach the week after it is sent.

## Tests

```
node --test core/report/index.js
```

**Adding a suite to this directory means adding a line to `index.js`.** On this runtime a positional
`--test` argument resolves as a MODULE, not a directory to search, so an unregistered suite runs zero
tests and reports pass. `tools/run-core-tests.mjs` checks the entry point imports every suite beside
it. Evidence is the COUNT of tests run, never an exit code.

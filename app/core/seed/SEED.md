# The seed package — shipped content, first-run import, and reset to defaults

Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no
third-party package; types are expressed in documentation comments. `seed.js` is the module
entry point for code; `index.js` is the test entry point and nothing else.

```js
import { seedIfNeeded, describeReset, resetToDefaults } from './core/seed/seed.js';

await seedIfNeeded(store);                       // first run: the shipped library lands
const plan = await describeReset(store);         // what the confirmation must be able to say
await resetToDefaults(store, { backup });        // backup runs first; if it fails, nothing happens
```

---

## 1. The rule that destroys real work if it is missed

**The shipped exercise catalogue deliberately exceeds the shipped week.**

The seven routines reference a little under two thirds of the 99 exercises. The remainder is not
dead weight, not orphaned data and not something to clean up — **the surplus IS the substitution
pool**, and two features depend on it existing:

- the coach swaps an exercise mid-session when a client turns up tired, injured, or training at
  home with no equipment — a knee push-up for a push-up, a band curl for a barbell one;
- the intensity adapter draws from the whole catalogue rather than from a routine's own list.

**Referential checking runs in ONE DIRECTION ONLY:** every exercise a routine names must exist,
and never the reverse. Being referenced by nothing is a normal state for an exercise.

No import, reset, migration or backup path in this package removes a catalogue entry because
nothing references it. That is declared as a value — `SEED_PRUNES_UNREFERENCED_CONTENT` — and
asserted, mirroring `PRUNES_UNREFERENCED_CONTENT` in the local store, because **an absence is
indistinguishable from an oversight to whoever edits this next**. `substitution-pool.test.js`
exists to state the guarantee, and a reviewer who finds no reverse check there has found the
requirement rather than a gap.

The failure this prevents is silent: an importer that filtered the catalogue down to what the
routines reach would write a perfectly valid library, pass every other test, and delete exactly
the pool the coach needs. He would meet it in front of a client, as a swap with nothing to offer.

---

## 2. Where the content lives, and why it is copied

| Location | What it is |
| --- | --- |
| `C:\Projects\Fit\seed\` | Where the content is **authored**. Source of truth. Holds the contract (`SCHEMA.md`), the JSON Schemas, and `validate_seed.py`, which is the acceptance gate on the content itself. |
| `app/core/seed/content/*.js` | The **application's own copy**, generated from the above. This is what the app imports at runtime, and the only content it reads. |

The published site is static and must work with no network at all, so it carries its own content
rather than reaching outside itself for it.

**Why the copy is a module and not a JSON file.** A JSON file would have to be fetched at runtime:
a path, a base URL, a network call that can fail, and a failure mode on the very first run of an
offline-first application. A module is part of the bundle — it cannot be half-present, it needs no
path, and it behaves identically in the test runner and in an installed app in aeroplane mode.
(Import attributes would avoid the copy, but their support across the Node and iOS Safari versions
this project targets is not something to bet the first run on.)

**Why the copy cannot silently drift.** `sync-content.mjs` embeds the authored file's own text,
byte for byte, between two markers. `content-drift.test.js` compares that text against the
authored file on **every test run**, and separately deep-compares the parsed records. A copy that
diverges from its source is a test failure, not something that ships. Line endings are normalised
on both sides — that is the one difference that carries no meaning on a Windows checkout.

```powershell
node core/seed/sync-content.mjs            # after editing seed/*.json
node core/seed/sync-content.mjs --check    # exit 1 if the copy has drifted
```

If the authored directory is entirely absent the drift suite skips, because the application
genuinely does not need it to run. If the directory is present but a file is missing, that fails.

---

## 3. The import

`seedIfNeeded(store)` is what the application calls on start-up. It is safe on every start: on a
seeded installation it reads three counts and returns, writing nothing.

**Content goes in verbatim.** Each record is wrapped in the record envelope, which NESTS content
rather than merging with it, so there is nothing to unpick and nothing to reshape:

```js
{ record_id: '3f6d…', type: 'exercise', rev: 1, device: 'coach-laptop',
  deleted: false, created_at: …, updated_at: …,
  content: { id: 'back-squat', … }        ← the shipped record, untouched
}
```

`content.id` is a **content key**, not a record identity. It stays an ordinary content field;
routines keep referencing exercises by it; the store files the record under its own opaque
`record_id`. Unknown keys are errors rather than things to ignore — that is the model's entity
validators, and every built record is validated before anything is written.

The whole set is written in **one transaction**. A half-applied library is worse than none: the
coach would be left with routines naming exercises that were not written.

Afterwards **everything is an ordinary record** — fully editable and deletable. Nothing is
read-only, and nothing about being shipped makes a record special except that `provenance`
remembers where it came from.

### How "first run" is decided

**By asking the store what is in it. Never by a flag.**

A flag — in meta, in local storage, in a file — is a second source of truth about whether seeding
happened, and it will eventually disagree with the store: it survives a database that was cleared,
and it is lost by a device that restored one. When the two disagree, the app either re-imports over
the coach's library or refuses to seed a genuinely empty one.

So: the library has been seeded when any library record exists. A record he **deleted** still
exists — deletion raises a tombstone rather than removing the row — so an emptied library is a
seeded library and is not silently refilled behind him.

`seed:last-import` is written to meta as **diagnostics only**, and `hasBeenSeeded` deliberately
does not read it. A test asserts that erasing it does not cause a re-import, so the day the two
disagree, the store wins.

> No boolean is indexed anywhere in this package. A boolean is not a valid key in the browser's
> indexed database, so an index on one silently holds zero entries while every query against it
> returns nothing and looks perfectly correct. Provenance is a three-value **string**, and the
> store's `by_provenance` index is on that string.

---

## 4. Reset to defaults

### What it does — decided by the content contract (§4.6), not inferred here

- **Restores the shipped set, including reverting shipped records the coach has edited.** That is
  what restoring defaults means. A `shipped-edited` record goes back to its `shipped-untouched`
  form.
- **Never touches anything he created himself.** A `coach-created` record is his work, not ours to
  revert, and it is not even rewritten.
- **Restores what is missing**, including records he deleted.
- **Removes shipped records that are no longer shipped** — a record from an older library version.
  Removal is a **tombstone**, so the deletion propagates instead of the record reappearing from the
  remote copy on the next sync.
- **Prunes nothing for being unreferenced** (§1).

Two details that are not cosmetic:

- **A restored record keeps its identity, and its revision goes UP.** A reset written as a fresh
  revision 1 would lose to the remote copy under last-write-wins, and the coach's edits would come
  straight back on the next sync — which reads exactly like the reset button not working.
- **A record he deleted comes back under a NEW identity.** A tombstone carries no content, so it
  cannot be found by content key and cannot be revived in place. The old tombstone stays a
  tombstone and still propagates, so the other device does not resurrect the old record.

### What it does NOT do

It does not touch clients, sessions, performed records, readings, session notes or diet plans. This
package restores the shipped **library**, which is what the content contract defines and what
"reset to defaults" restores. `describeReset` states that scope in
`consequences.untouched_record_types` rather than leaving the interface to assume it.

> **Settled 2026-07-25, after this step raised it rather than guessing.** Two recorded phrasings
> disagreed — the content contract's library-only reset, and a later answer about the confirmation
> dialog saying reset "starts a fresh slate". The ruling: **reset is library-only, and the
> fresh-slate phrasing is withdrawn as false.** His client history is not reachable by this button.
>
> Nothing in this package may expose or imply a fresh slate, in any field or any code. Saying so
> would either frighten the coach away from a safe action, or teach him the button does something
> it does not — and the second is worse, because he would eventually rely on it. A test asserts the
> plan contains no such claim. What the confirmation states instead is **what is restored and what
> is left alone**, which is `consequences.restored_record_types` against
> `consequences.untouched_record_types`.

### The backup-first capability

Reverting his edits is only safe because the confirmation offers to back the data up first, and
because every backup is a genuinely restorable point. Those two decisions are a pair. This package
exposes exactly what an interface needs to make that offer honestly, and **no wording at all**:

`describeReset(store)` returns counts, lists and machine-readable codes:

| Field | For |
| --- | --- |
| `destructive`, `scope`, `consequences.restored_record_types` | stating plainly what the action is and what it restores |
| `backup.offer_before`, `backup.reason_code` | offering the backup, and saying why it is offered |
| `why_it_exists`, `why_it_is_in_admin` | explaining why the action exists and why it lives in admin |
| `will_revert` | **which** of his edits are about to go, by name — the list that makes the offer honest rather than ceremonial |
| `will_restore`, `will_remove`, `consequences.leaves_coach_created_untouched` | the rest of the consequence |
| `consequences.untouched_record_types` | the scope, stated |

**Every code is a kebab-case token and a test enforces it**, so the interface cannot accidentally
render a sentence this module wrote and nobody reviewed. What the coach reads belongs to the
interface step.

`resetToDefaults(store, { backup })` runs `backup(plan)` **before anything is written**. If it
throws or rejects, nothing is written and the rejection is passed on: a failed backup followed by a
completed reset is the exact sequence the offer exists to prevent. The backup is not enforced —
whether to insist is the interface's call, and `will_revert.length` is the number that decides it.

### Provenance, in one place

`provenance.js` owns the rule, so the importer, the reset and the library screens cannot each
decide it slightly differently.

| value | means | reset does |
| --- | --- | --- |
| `shipped-untouched` | ours, unchanged | restores it |
| `shipped-edited` | ours, he has changed it | **reverts** it |
| `coach-created` | his own work | leaves it alone |

**The library editing screen should call `markEdited(content)` rather than assigning a provenance
value itself.** A screen that forgets leaves a record claiming to be untouched while showing his
changes, and the next reset silently reverts work he was never warned about. `describeReset`
defends against exactly that by comparing stored content to shipped content — all the way down,
including inside `entries` and `scaling` — rather than trusting the label.

---

## 5. The test gate

```powershell
node --test core/seed            # from C:\Projects\Fit\app
```

`index.js` exists because on this runtime a positional argument to `--test` is resolved as a
**module**, not searched as a directory: without an entry point importing each suite, that command
resolves to a barrel with no tests in it and reports success having executed nothing. **Read the
test count, not the exit code.** At the time of writing the suite reports **35 tests, 35 passing**.

What is covered: the drift check against the authored files; first-run import and its counts;
content stored verbatim; re-import writing nothing and not undoing an edit; first-run detection
ignoring the diagnostics marker; an emptied library staying seeded; reset restoring, reverting,
removing and keeping the right things; revision going up; backup-before-write and failed-backup
cancellation; the plan carrying codes and no prose and no fresh-slate claim; reverting an edited
shipped record while leaving a client and a session untouched, in one assertion, because those two
behaviours together are the settled decision; and — separately and deliberately — the survival of
an unreferenced exercise across both import and reset.

**No live Google call is made here and none is claimed.** This package touches the local store only.

---

## 6. Boundaries

- **The content contract owns content; this package owns the envelope and the store interaction.**
  Where a field is needed that the contract does not have, the contract is extended there first,
  not diverged from here.
- **`validate_seed.py` is the acceptance gate on the content itself** — the endorsement, imagery
  and progression rules (R7–R9) and the ordering rules are enforced there, on the authored files.
  This package validates against the **runtime record model**, which is a different question: it
  asks whether a record can be stored, not whether it should have been written.
- **Nothing in this package is touched by the shell or its build.** It stays plain modules with a
  build-free test gate, so the most safety-critical logic can be verified without a toolchain.

# The record model

This document is the contract for how the application stores data. It covers the **sync
envelope** that wraps every record, each **record** the envelope can hold, the exact
**encrypted-field set**, and the **one-directional referential rule**.

It is the counterpart to `seed/SCHEMA.md`, which is the contract for the shipped **content**.
That document owns what an exercise, a routine and an intensity pattern *are*. This one owns
everything that exists only because there are two devices, a history, or a secret. The two do
not overlap, and §2 states the test that decides which side a field falls on.

Code entry point: `core/model/model.js`.

---

## 1. What this layer is, and what it is not

`core/model` is **plain, dependency-free ECMAScript modules**. No framework, no bundler, no
build step, no third-party package. Types are expressed in documentation comments, so nothing
here presumes compilation. Whatever front-end stack is chosen must be able to adopt this core
**unchanged** — that is the constraint it is written to, and it is why the tests run on the
runtime's own test runner with nothing installed.

It is **only** the model: shapes, envelopes and validators. It holds no data, opens no
database, performs no cryptography, makes no network call and knows nothing about Google. The
local store, the durable outbox, the remote-storage port, the encryption envelope and the sync
engine are separate concerns that build on this one.

| File | What it holds |
| --- | --- |
| `model.js` | The barrel. `validateRecord`, plus everything below re-exported. |
| `issues.js` | The `{ ok, issues }` result shape and the closed set of issue codes. |
| `primitives.js` | Field checks: strings, integers, enums, content keys, identities, timestamps. |
| `vocabularies.js` | Every closed vocabulary, and the three refusal lists of §5, §6 and §2. |
| `envelope.js` | The sync envelope: create, revise, tombstone, validate, last-write-wins. |
| `sealed.js` | The ciphertext-bearing field set and the shape a sealed value takes. |
| `referential.js` | The one-directional reference rule of §7. |
| `entities/*.js` | One validator per record kind. |
| `fixtures.js` | Valid records of every kind, for tests. No real person appears in it. |
| `index.js` | **Test entry point only** — see §9. The API is `model.js`. |

Every validator returns the same shape and **never throws**:

```js
import { validateRecord, createEnvelope } from './core/model/model.js';

const record = createEnvelope({
  type: 'client',
  device: 'coach-laptop',
  content: { name: 'A. Client', notes: '', active: true },
});

const { ok, issues } = validateRecord(record);
// issues: [{ path: 'content.name', code: 'REQUIRED', message: 'This field is required.' }]
```

Each issue carries a `path` a screen can attach to a field, a `code` a test can assert on, and
a `message` a person can read. Validators report **every** problem, not the first.

---

## 2. The sync envelope

Every stored record lives inside an envelope, and the envelope **nests** the content rather
than merging with it:

```js
{
  record_id:  '3f6d1c8a-…',                 // stable record identity
  type:       'exercise',
  rev:        4,                            // revision
  device:     'coach-laptop',               // device tag
  deleted:    false,                        // tombstone marker
  deleted_at: null,
  created_at: '2026-07-25T09:30:00.000Z',
  updated_at: '2026-07-25T11:02:13.412Z',
  content:    { id: 'back-squat', name: 'Back Squat', … }
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `record_id` | UUID | The record's stable identity. Never the content key. See §3. |
| `type` | enum | Which record kind `content` holds, and therefore which validator applies. |
| `rev` | integer ≥ 1 | Revision. Starts at 1 and increments on every write, including a delete. |
| `device` | tag | Which installation wrote *this* revision, e.g. `coach-laptop`. |
| `deleted` | boolean | The tombstone marker. |
| `deleted_at` | timestamp \| null | When the tombstone was raised. Null while alive; required once deleted. |
| `created_at` | timestamp | When the record first existed anywhere. Survives every revision. |
| `updated_at` | timestamp | When this revision was written. Never earlier than `created_at`. |
| `content` | object \| null | The content record. **Null, and only null, on a tombstone.** |

Timestamps are written in one canonical form — ISO 8601, UTC, milliseconds, `Z` — so that a
string comparison and a chronological comparison agree and nothing has to parse a date to
order two revisions.

### 2.1 Why the content is nested

Nesting makes the boundary structural rather than a matter of care:

- a content field and an envelope field can never collide;
- importing a seed record is `{ ...envelope, content: theRecordVerbatim }`, with nothing to
  unpick, exactly as `seed/SCHEMA.md` §3 promised;
- the leak this design exists to prevent becomes something a validator catches.

### 2.2 The boundary test, and the guard that enforces it

Taken verbatim from the content contract:

> If a field would still exist in a single-device application with no synchronisation and no
> encryption, it is **content**. If it exists only because there are two devices, a history,
> or a secret, it is **envelope**.

`validateEnvelope` refuses a content record carrying an identity, a revision, a device tag, a
tombstone, a sync timestamp or an encryption marker, with its own code `ENVELOPE_LEAK` rather
than as a generic unknown field. `provenance` is deliberately allowed through: it records
whether a library record is shipped, shipped-and-edited or the coach's own, which is a
single-device concern that would exist with no sync and no encryption at all.

### 2.3 Revisions and tombstones

`reviseEnvelope` returns a **new** record with `rev + 1`, this write's `device` and
`updated_at`, and the original `record_id` and `created_at`. Records are treated as immutable
values, so a half-applied edit cannot exist and the outbox can hold a revision independently
of whatever the store does next.

`tombstoneEnvelope` raises a tombstone. A tombstone is a **revision, not a removal**: identity,
revision and timestamps survive, so a deletion propagates to the other device and to the
remote copy instead of the record quietly reappearing from a backup on the next sync.

**A tombstone drops the content entirely.** That matters most for a deleted client: a departed
client's clinical note must not go on living inside the tombstone that records their
departure, and dropping the payload here means no later step has to remember to strip it.

A tombstone does **not** win automatically. It is compared like any other revision, so an edit
made after a delete correctly resurrects the record.

### 2.4 Last-write-wins

Ordinary use is sequential — laptop for online sessions, phone for in-person ones, never both
at once — so per-record last-write-wins is sufficient and no merge logic is in scope.
`laterOf(a, b)` is the whole of that rule, written down once:

1. **higher `rev` wins** — a device that has seen more of a record's history is ahead of one
   that has seen less, whatever the clocks say;
2. **then later `updated_at`** — two devices that never saw each other's writes can reach the
   same revision number, and wall-clock is the honest tiebreak;
3. **then the device tag, lexicographically** — not meaningful, and that is the point: it
   exists so every device resolves an exact tie the *same* way. A tie broken differently on two
   devices converges to two different records, which is worse than losing the write.

The one genuine concurrent case — two windows on the **laptop** running two live sessions
against one shared local database, never on mobile — is a store concern needing cross-context
coordination and per-session isolation. The envelope's contribution is that every write
carries a revision and a device tag, so a lost update is at least detectable.

---

## 3. Two kinds of key, and when each is used

| | Content key | Record identity |
| --- | --- | --- |
| Where | `content.id` | `record_id` |
| Shape | `barbell-bent-over-row` | a UUID |
| Scope | unique within a kind | globally unique |
| Purpose | one piece of **content** points at another | the **store** addresses a record |
| Stability | stable forever; changing one orphans a routine entry | never changes |

Both exist and neither replaces the other. A seed record's `id` stays exactly where it is, as
an ordinary content field beside the identity — the importer unpicks nothing.

**Which one a reference uses follows from where the record came from:**

- **Library content** — exercises, routines, intensity patterns — carries a content key and is
  referenced **by content key**. This holds whether the record was shipped or the coach built
  it himself.
- **Records authored in the app** — clients, sessions, performed records, readings, notes,
  diet plans — have no content key and are referenced **by record identity**.

So a session names its routine by content key and its clients by record identity. That is not
an inconsistency; it is the rule above applied twice.

---

## 4. The records

Every record is **closed**: an unknown key is an error, not something to ignore, because a typo
in a field name would otherwise become a silently dropped value.

### 4.1 `exercise` — content, owned by `seed/SCHEMA.md` §4

`id`, `name`, `long_name?`, `movement_pattern`, `primary_muscles`, `secondary_muscles`,
`equipment`, `measurement`, `default_prescription`, `default_rest_seconds`, `intensity`,
`scaling`, `hiit_suitable`, `coaching_cue`, `provenance`.

`name` is **spoken aloud** by the browser speech synthesiser mid-session, so it is letters and
single spaces only, and abbreviations (`DB Press`) and bare single letters are refused too —
a synthesiser mangles them, and the coach hears something that is not the movement.

`scaling` carries three points and is ordered: across low → medium → high, work is
non-decreasing and strictly greater at high than at low, `sets` is non-decreasing, and
`rest_seconds` is non-increasing. The failure this catches is a harder point that is *easier*
than a softer one, which would make the adapter propose a session that gets easier as the
curve rises, in front of a client.

### 4.2 `routine` — content, owned by `seed/SCHEMA.md` §5

`id`, `name`, `split_day`, `focus`, `body_regions`, `description`, `entries`, `provenance`.

`split_day` is a **position in the split, not a calendar weekday** — the coach's week does not
necessarily start on a Monday. Entries reference exercises **by key only** and never copy a
definition in. The four optional entry fields are overrides; an override must agree with the
referenced exercise's `measurement`, which is checked in §7 because a routine on its own
cannot know.

`entries` is a **default order, not a script.** The coach jumps, reorders, skips, repeats,
substitutes and edits at will; nothing downstream may treat this order as what happened.

### 4.3 `intensity-pattern` — content, owned by `seed/SCHEMA.md` §6

`id`, `name`, `sequence`, `mapping_rule`, `description`, `provenance`.

If the name spells out a curve — two or more of `low`, `medium`, `high` — it must match the
sequence exactly, in order and in count. A button labelled one thing and doing another is a lie
told in front of a client.

Whether a pattern is *servable* by a given routine is **not** validated here. Shipped patterns
are all servable against the shipped routines; one the coach authors is under no such
guarantee, so the session runner must degrade honestly and say which level ran short rather
than silently substituting.

### 4.4 `client`

`name`, `notes`, `adaptation_flag?`, `clinical_note?`, `clinical_reference?`,
`clinical_reference_label?`, `active`.

That is the whole record. **No email, phone, address, date of birth or photograph** — those are
refused by name with the code `MINIMISATION`, because data that is never collected cannot leak,
and that is the strongest protection available to an application with no backend, served from a
public static site, storing to a personal Drive. The coach also never adds a client as a
meeting invitee, which is what keeps that true in practice rather than only in the schema.

The app does **not** store medical history. `adaptation_flag` is plaintext, short by design, and
is for what changes the programme — *knee injury, avoid deep squats* — never a diagnosis, a
medication or a doctor's note. The real detail lives in the coach's own records; the app stores
only a pointer to it. See §5.

### 4.5 `session`

`routine_id`, `client_ids`, `status`, `scheduled_at?`, `started_at?`, `ended_at?`, `meet_url?`,
`meet_source?`, `summary?`.

A session is **one routine and one to many clients** — not a client plus a routine. A single app
instance always drives a single routine however many people are in the call; two people needing
different programmes is handled by running two app instances, never by parallel timelines in one
screen.

Each attending client keeps their **own** readings, notes and performed records, because the
coach may modify an exercise for one tired client while the rest continue. Progress views and
exports are strictly per client even when the session was shared. No small fixed roster is
assumed.

`status` is one of `planned`, `in_progress`, `interrupted`, `completed`, `abandoned`.
**`interrupted` is a first-class state**: real sessions are disturbed by power cuts, illness,
phone calls and the browser closing, so an interrupted session resumes exactly where it left off
and a half-finished one is still saved as a partial record rather than lost.

There is deliberately **no cursor field** recording where the app thinks he should be. What
happened is reconstructed from the performed records. The app tracks; it never dictates.

`meet_url` holds the **joining link only**, and `meet_source` says whether it was minted through
the calendar or pasted in from a call already running — both paths are supported on purpose. A
raw provider response must never be stored, synced, backed up or exported: those responses embed
the signed-in account and internal identifiers, none of which is a credential and all of which
would be a leak into a client's hands.

### 4.6 `performed-record`

`session_id`, `client_id`, `exercise_id`, `position`, `status`, `substituted_for_exercise_id?`,
`sets_completed?`, `repetitions?`, `duration_seconds?`, `rest_seconds?`, `observed_load?`,
`intensity_level?`, `note?`, `recorded_at`.

One record per exercise, per client, per session. What is recorded is what was **performed**,
never what was proposed — a proposal is not history and never appears in a progress report.

**This is the one place a load may be recorded.** See §6.

### 4.7 `reading`

`client_id`, `session_id?`, `kind`, `value`, `unit`, `context`, `taken_at`, `note?`.

Heart rate, plank hold, hollow hold and the like — captured with a stopwatch or a verbal count,
in session or after it, against a **specific client**. These are what the progress report charts
as trends over time, which is what makes a report read like a report.

Known kinds are pinned to their unit, so a plank recorded in beats per minute is refused rather
than charted. A kind the coach invents is accepted — everything here is configurable — but must
be a well-formed key and must name its unit, because there is no pinned unit to fall back on.

### 4.8 `session-note`

`session_id`, `client_id?`, `text`, `taken_at`.

A note **with** a client is that person's and follows them into their progress view and export;
a note **without** one is about the session as a whole. In a shared session those are genuinely
different things, and inferring one from the other would put one client's note in another's
export.

Notes are **plaintext and not encrypted**. That obliges the interface to say, at the point of
entry, what a note is for — and that anything clinical belongs in the client's own reference,
outside the app.

### 4.9 `diet-plan`

`client_id`, `name`, `status`, `effective_from?`, `effective_to?`, `days`, `notes?`,
`source_note?`.

A week chart by **day and hour** that repeats. Each client accumulates a history, so the coach
can see the plan a client follows now against past ones; `status` records that explicitly rather
than leaving it to be inferred from dates.

**Plaintext, explicitly.** The case that a diet can be diagnostic on its face was put and
rejected for this practice: these plans are a food chart. A diet plan carries no encryption, no
sensitivity flag and no export gating, and a diet export is always openable with no passphrase
and no friction. Recorded here so a later step does not re-open it by instinct.

---

## 5. The encrypted-field set

**Exactly three fields in the entire application are ciphertext, all on the client record:**

| Field | Why |
| --- | --- |
| `clinical_note` | The note itself. |
| `clinical_reference` | The pointer to where the real detail lives. |
| `clinical_reference_label` | The pointer's display label. |

The third is the one that is easy to miss and matters most: a label such as
`cardiac-history.pdf` **is itself health information** — it discloses the condition without
anyone opening the file. Encrypting what a pointer points at while leaving its name in the clear
protects nothing.

**Everything else is plaintext, deliberately.** Names, general notes, the adaptation flag,
routines, exercises, sessions, performed records, readings, in-session notes and diet plans. That
is load-bearing in the reassuring direction: because this is field-level rather than whole-store
encryption, **the blast radius of losing a key is capped at the clinical notes alone.** Everything
else survives. Any framing of key loss must lead with that.

A sealed value is opaque to this layer:

```js
{ scheme: 1, iv: '<base64>', ct: '<base64>' }
```

`null` is always allowed and means the coach recorded nothing — an absent note must not be
represented as an encryption of the empty string. A readable string in one of these fields is
refused with its own code, `PLAINTEXT_IN_SEALED_FIELD`, because that is the exact failure the
field set exists to prevent. A pointer and its label travel together: both, or neither.

`ENCRYPTED_FIELDS` in `sealed.js` is the **authoritative list**. Anything deciding what may leave
the device — an export whitelist, a sync payload builder, a backup writer — reads it from there
rather than keeping its own copy, because two copies of a list like this drift silently.
`withoutEncryptedFields(type, content)` is the one-line strip that keeps clinical material out of
a payload by default; it removes rather than blanks, because an absent key is unambiguous.

**This layer performs no cryptography.** It declares the set and the shape. Key generation, the
multi-slot key envelope, adopting an existing envelope before writing, and the refusal to create
a clinical note on a device that has never synced all belong to a later step. The model and the
store stay equally innocent of it — they move sealed values around without ever being able to
read one.

---

## 6. No load in the library. One place, and one only, for an observed load

**Refused, with the code `FORBIDDEN_LOAD`, on every library record** — exercise, routine, routine
entry, intensity pattern, and inside any prescription or scaling point:

> any load, weight or resistance field.

A library load would be a **prescription**, and it would put the application in the position of
making a training-load judgement about people it has never seen. That judgement belongs to the
certified coach, who is also adapting to a client's history. A harder intensity point therefore
means **more work and less rest**, never more load, and §4.1's ordering rule enforces exactly
that relationship.

**Allowed, on `performed-record.observed_load`, and nowhere else:**

> what this person actually lifted, in this session, as the coach observed it.

That is an **observation**, not a prescription — the coach watched a specific person lift a
specific thing and wrote down what happened. It is free text (`20kg`, `red band`, `bodyweight`)
rather than a number and a unit, because the app has no business normalising what he observed into
a scale it can compute on.

Nothing derives from it, nothing charts it, and above all **nothing raises it**. The app never
auto-progresses a routine; it shows him the previous session — exercises, loads and readings —
precisely so that *he* decides whether anything goes up.

---

## 7. The referential rule runs in ONE direction

```
ENFORCED       every exercise a routine NAMES must exist.
NOT ENFORCED   an exercise that nothing names. That is a NORMAL and PROTECTED state.
```

The second line is not an omission, a simplification, or a check somebody forgot to write. It is
a requirement, and it is the one most likely to be "fixed" into a defect by a well-meaning later
change.

**Why the reverse must never be enforced.** The shipped exercise catalogue **deliberately exceeds
the shipped week** — the seven routines reference a little under two thirds of the library. The
remainder is not dead weight and not orphaned data awaiting cleanup: **the surplus IS the
substitution pool**, and two features depend on it.

- The coach swaps an exercise mid-session when a client is tired. What he swaps *to* is a
  regression such as a knee push-up, an equipment variant such as a band curl in place of a
  barbell one, or an alternative for a client training at home with nothing — exactly the
  exercises no routine currently references.
- The intensity adapter draws from the whole catalogue, not only from a routine's own list.

An importer, migration, reset or backup path that tidied away entries nothing points at would
therefore **silently delete precisely the pool the coach needs**, under the appearance of
housekeeping, and the failure would surface in front of a client as a substitution with nothing
to offer.

> **No import, migration, reset or backup path may drop a catalogue entry merely because no
> routine currently references it. A reviewer should treat any pruning of unreferenced content as
> a defect, not as tidying.**

`unreferencedExercises(routines, exercises)` exists to make that surplus **visible** — as a pool
to draw from and as a number a diagnostics screen can show. It is named for what the result *is*
rather than for what a caller might be tempted to do with it, and it reports no issue, because
there is nothing wrong.

The same discipline applies to the app's own records. A session's routine and clients must all
resolve; a routine that has never been run and a client who has not yet attended a session are
both entirely normal. `REFERENTIAL_DIRECTION` in `referential.js` states both directions as a
value, so the intent is testable rather than merely absent.

---

## 8. Extending this, and extending the content contract

Where the model needs a **content** field the seed contract lacks, `seed/SCHEMA.md` is
**extended there first** — never diverged from, and never worked around by adding the field
here. Apply the §2.2 test to decide which document a new field belongs in.

Where a new **record kind** is needed: add its vocabulary to `vocabularies.js`, its validator to
`entities/`, and its entry to `RECORD_TYPES` and the `VALIDATORS` registry. A test asserts those
two stay in step, so a kind added to one and not the other fails rather than silently having no
validator.

---

## 9. Running the tests

From `C:/Projects/Fit/app`:

```powershell
node --test core/model      # 113 tests, no install step, nothing to build
```

Note for anyone editing the layout: on Node 25 a positional argument to `--test` is a **file
glob, not a directory to search** — `node --test .` reports `Could not find '.'`. A directory
only works as a target if it resolves to a module that registers tests, which is what
`core/model/index.js` does and is its only purpose. Removing it would make the command resolve to
a barrel with no tests in it and report `pass 1, fail 0` having executed nothing — a gate that
passes vacuously, which is worse than one that fails. The API barrel is `core/model/model.js`,
named explicitly because directory-index resolution does not exist in a browser.

`core/model/seed-conformance.test.js` reads the real `seed/*.json` files and puts every shipped
record through these validators and through an envelope. If the seed directory is absent it skips
rather than fails. Agreement on paper between two contracts is worth nothing until the actual
content is run through both.

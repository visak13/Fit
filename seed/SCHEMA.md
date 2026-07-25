# Seed content contract

This directory holds the **shipped seed content** for the app: the curated exercise
library, the weekly routines built from it, and the configurable intensity patterns the
intensity adapter uses. This document is the contract.

**Who this is written for.** The foundation step (S3) defines the runtime record model and
the local store. It runs concurrently with this step, so rather than the two guessing at
each other, the content side fixes the shape first. S3 should adapt its record model to
what is written here. Where S3 needs a field this contract does not have, the contract is
extended here first — not diverged from.

**What these files are and are not.** They are the *starting point* the app imports into
the local browser store on first run, and the exact set the admin *reset to defaults*
restores. They are not a source of truth the coach edits. He edits exercises and routines
inside the app; he never opens these files. Every record is fully editable and deletable by
him once imported.

---

## 1. Files

```
seed/
  SCHEMA.md                            this contract
  schema/exercise.schema.json          JSON Schema for exercises.json
  schema/routine.schema.json           JSON Schema for routines.json
  schema/intensity-pattern.schema.json JSON Schema for intensity-patterns.json
  exercises.json                       the curated exercise library
  routines.json                        the weekly split
  intensity-patterns.json              the shipped intensity curves
  validate_seed.py                     standard-library-only validator
```

Each of the three JSON Schema files describes the **whole file** — the top-level array and
the records in it — not just one record.

## 2. File shape

Each seed data file is a **bare JSON array of content records** and nothing else:

```json
[
  { "id": "push-up", "name": "Push Up", ... },
  { "id": "goblet-squat", "name": "Goblet Squat", ... }
]
```

No wrapper object, no file header, no version field, no kind field. The filename says which
kind of record is inside, and a consumer reads it in one call with nothing to unwrap:

```js
const exercises = await (await fetch('seed/exercises.json')).json();   // an array
```

`additionalProperties` is `false` on every object in every record. An unknown key is an
error, not something to ignore — a typo in a field name would otherwise become a silently
dropped value.

### 2.1 What this contract does NOT define, deliberately

This contract covers **content shape only**: what an exercise *is*, what a routine *is*, what
an intensity pattern *is*. It stops there, and the line is hard.

**The record envelope belongs to the foundation step, which is building it in parallel with
this one.** Nothing in these files defines, hints at, or reserves space for:

- a record identity scheme
- a revision or version number, on a record or on a file
- a device tag
- a tombstone or deleted marker
- a created or modified timestamp
- any marker of which fields are encrypted

None of those is missing by oversight, and none should be added here later as a convenience.
The foundation step places every content record inside its own sync envelope carrying
revision, device tag and tombstones, and it handles the encrypted-field case. If this
contract had already guessed at those shapes, that step would be forced either to fight this
file format or to silently drop fields — both real defects, and both surfacing late.

**The test applied to every field below, and the test to apply to any field proposed later:**
if the field would still exist in a single-device application with no synchronisation and no
encryption, it is **content** and it belongs here. If it exists only because there are two
devices, a history, or a secret, it is **envelope** and it does not.

Two consequences worth stating outright, because both are easy to get wrong:

- `provenance` (§4, §4.6) **is** content and stays. It exists so the admin *reset to defaults*
  can tell shipped content from the coach's own additions — a single-device concern that would
  exist with no sync and no encryption at all. It is not a revision number, not a device tag
  and not a tombstone, and it must not acquire those characteristics: there is deliberately no
  timestamp recording *when* something was edited and no field tracking *which* shipped record
  an edited one came from. If a later step needs either, both are envelope.
- These files are consumed at runtime by the application, which is JavaScript. The Python
  validator is the acceptance gate and **only** the acceptance gate. No field, no encoding
  and no file layout here exists to make the Python side easier; that is precisely why the
  validator implements its own JSON Schema subset (§8) rather than the data being reshaped to
  suit a library.

## 3. Content keys

Every record carries an `id` matching:

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

Lowercase letters, digits and single hyphens; 3 to 60 characters; human-meaningful, for
example `barbell-bent-over-row`.

**This is a CONTENT KEY, not a record identity.** Read that literally. It is the handle one
piece of shipped content uses to point at another piece of shipped content — a routine entry
naming the exercise it wants. It is *not* the identity the local store files the record
under, it carries no revision, and it says nothing about how a record is stored, synced or
addressed once imported. The foundation step is free to wrap a content record in whatever
identity scheme it needs and to keep this key as an ordinary field alongside its own; it
should not have to unpick anything to do so. The same holds for the routine key and the
intensity pattern key — all three are content keys and nothing more.

What the key does have to be is **stable forever**. Routines reference exercises by this key
and by nothing else, so changing one orphans a routine entry and puts a dangling row on the
coach's screen in the middle of a session. Change a display name freely; never change a key.

Keys are unique within a file. Nothing stops an exercise and a routine sharing a key string —
separate files, separate namespaces — but the validator will not allow a duplicate inside
one file.

---

## 4. The EXERCISE record

`exercises.json` — a top-level array of exercise records.

| Field | Type | Required | Allowed values | Why it exists |
| --- | --- | --- | --- | --- |
| `id` | string | yes | id format, §3 | Routines reference this. It is the only durable handle on an exercise. |
| `name` | string | yes | letters and single spaces only, 3–48 chars, must start and end with a letter | The app **reads this aloud** with the browser speech synthesiser during a session. Punctuation, abbreviations and parenthetical asides read badly or not at all, so the format forbids them at schema level. Write it the way a coach says it out loud. |
| `long_name` | string | no | 3–120 chars | Only for the rare case where the spoken name is genuinely ambiguous on screen. Free-form; it is displayed, never spoken. Omit it rather than duplicating `name`. |
| `movement_pattern` | string | yes | see §4.1 | The intensity adapter and the routine author both need to know what a movement *is* in order to avoid stacking three of the same pattern in a row. |
| `primary_muscles` | array of string | yes | ≥1, unique, see §4.2 | Drives the weekly split: the coach programmes so body parts rest across the week, and that cannot be checked without knowing what each exercise works. Also feeds the plain-language "what you worked on" summary in the client progress report. |
| `secondary_muscles` | array of string | yes (may be empty) | unique, see §4.2 | Same purpose, weaker weight. Required as a key so consumers never have to test for its absence; use `[]` when there are none. |
| `equipment` | array of string | yes | ≥1, unique, see §4.3 | The coach works over video call and in person, and a client at home may have nothing. `["none"]` means bodyweight only. A list, because a bench press needs both a barbell and a bench. |
| `measurement` | string | yes | `"repetitions"` \| `"time"` | Decides how the session runner counts the exercise. A plank counted in repetitions is nonsense, and so is a sprint interval. This field must match the movement, and the validator cross-checks it against the prescription. |
| `default_prescription` | object | yes | §4.4 | What the coach sees before any intensity pattern is applied. |
| `default_rest_seconds` | integer | yes | 0–600 | Rest after the exercise at the default prescription. Separate from `scaling`, which is what the adapter uses. |
| `intensity` | string | yes | `"low"` \| `"medium"` \| `"high"` | The classification the intensity adapter **sorts on** when it reorders a session to a curve. |
| `scaling` | object | yes | §4.5 | The values the adapter **scales with**. Without these the adapter would have to invent numbers, which it must never do. |
| `hiit_suitable` | boolean | yes | — | Whether the exercise belongs in a high-intensity interval block. Loaded barbell work generally does not; a jump or a carry generally does. |
| `coaching_cue` | string | yes | 8–160 chars | One short, practical, safety-aware cue in plain words. Shown in-session so the coach does not have to remember his own phrasing for sixty movements. |
| `provenance` | string | yes | `"shipped-untouched"` \| `"shipped-edited"` \| `"coach-created"`; always `"shipped-untouched"` in a seed file | Where the record came from, and whether the coach has since changed it. This is what the admin *reset to defaults* reads to decide what it may revert and what it must leave alone. See §4.6 — it carries three states rather than a boolean for a concrete reason. |

### 4.1 `movement_pattern`

```
squat            hinge            lunge            single-leg
horizontal-push  vertical-push    horizontal-pull  vertical-pull
elbow-flexion    elbow-extension  shoulder-raise   carry
rotation         anti-extension   anti-rotation    anti-lateral-flexion
hip-extension    knee-flexion     calf-raise       locomotion
jump             isometric-hold   conditioning     mobility
olympic-derivative
```

### 4.2 muscle groups (`primary_muscles`, `secondary_muscles`)

```
chest            front-deltoids   side-deltoids    rear-deltoids
upper-back       lats             traps            lower-back
spinal-erectors  biceps           triceps          forearms
grip             abdominals       obliques         hip-flexors
glutes           quadriceps       hamstrings       adductors
abductors        calves           tibialis         neck
full-body        cardiovascular-system
```

`full-body` and `cardiovascular-system` are deliberate pseudo-groups for conditioning and
whole-body work, where naming individual muscles would be misleading rather than helpful.

### 4.3 `equipment`

```
none             mat              bench            box
step             chair            wall             dumbbell
barbell          weight-plate     kettlebell       resistance-band
pull-up-bar      dip-bars         gymnastic-rings  suspension-trainer
cable-machine    medicine-ball    slam-ball        sandbag
jump-rope        battle-rope      sled             agility-cone
ab-wheel         foam-roller      treadmill        stationary-bike
rowing-machine
```

`none` means the exercise needs nothing at all. It is a real value, not a placeholder, and
a meaningful proportion of the library uses it.

### 4.4 `default_prescription`

```json
{ "sets": 3, "repetitions": 10 }          // measurement: "repetitions"
{ "sets": 3, "duration_seconds": 30 }     // measurement: "time"
```

| Field | Type | Required | Range |
| --- | --- | --- | --- |
| `sets` | integer | yes | 1–10 |
| `repetitions` | integer | only when `measurement` is `"repetitions"` | 1–100 |
| `duration_seconds` | integer | only when `measurement` is `"time"` | 5–1800 |

Exactly one of `repetitions` / `duration_seconds` is present, enforced by the schema, and
**which** one is enforced against `measurement` by the validator. No other keys.

There is deliberately **no load, weight or resistance field.** The app does not decide
training load — the coach does, in the session, per client, adapting to that person. Adding
a prescribed weight to shipped content would make the app the decision-maker about load,
which it is not.

### 4.5 `scaling`

```json
"scaling": {
  "low":    { "sets": 2, "repetitions":  8, "rest_seconds": 90 },
  "medium": { "sets": 3, "repetitions": 10, "rest_seconds": 60 },
  "high":   { "sets": 4, "repetitions": 14, "rest_seconds": 40 }
}
```

All three points are required. Each point has the same shape as `default_prescription`
plus a required `rest_seconds` (0–600), and the same repetitions-versus-duration rule
applies to each point.

**What the three points mean.** They are the values the adapter uses when a routine
position lands on that point of an intensity curve. They describe *session effort demand* —
how much work and how little rest — and never load, because load is not stored at all.

**Ordering rules the validator enforces** (§7, rule `R6`), across `low` → `medium` → `high`:

- work (`repetitions` or `duration_seconds`) is **non-decreasing**, and strictly greater at
  `high` than at `low`, so the three points are genuinely different rather than filler;
- `sets` is **non-decreasing**;
- `rest_seconds` is **non-increasing**, because less rest is more demanding.

A harder point that is easier than a softer one is the failure this rule exists to catch: it
would make the adapter propose a session that gets easier as the curve rises, and the coach
would rightly stop trusting it.

**The adapter proposes; the coach disposes.** These numbers are a defensible starting point
for a proposal the coach then sees and edits. Every value stays manually overridable at all
times.

### 4.6 `provenance`, and what reset actually does

`provenance` appears on all three record kinds — exercises, routines and intensity patterns —
and it means the same thing on each.

| Value | Meaning |
| --- | --- |
| `shipped-untouched` | Came from this shipped library and the coach has not changed it. |
| `shipped-edited` | Came from this shipped library and the coach has since edited it. |
| `coach-created` | Never came from us at all. The coach made it himself. |

**Every record in every file in this directory is `shipped-untouched`**, which is true by
definition of what these files are: they *are* the shipped library, in its pristine state.
The other two values exist at runtime, once the records are in the local store and the coach
starts working. The validator enforces the seed-file case (rule `R12`), so a later editor
cannot quietly ship a record claiming the coach made it.

**Why three states and not a boolean.** Reset restores the shipped library. A boolean can
only say "ours" or "his", so it cannot express the middle case — an exercise that came from us
and that the coach has since changed. Without that middle state, reset either silently
discards his edits to shipped items with no way to even warn him, or it leaves edited items
alone and therefore no longer actually restores defaults. Both are defensible positions. What
is not acceptable is choosing between them by accident, which is exactly what a boolean would
do.

**The reset semantics, decided — the admin step implements this, it does not infer it:**

- Reset **restores the shipped set, including reverting shipped items the coach has edited.**
  That is what restoring defaults means. A `shipped-edited` record goes back to its
  `shipped-untouched` form.
- Reset **never touches anything the coach created himself.** A `coach-created` record is his
  work, not ours to revert, and it survives a reset untouched.

Reverting his edits is only safe because of the already-recorded requirement that **the reset
confirmation offers to back the data up first**, and that every backup is a genuinely
restorable point. Those two decisions are a pair: state the connection out loud rather than
letting the admin step meet the revert behaviour on its own and have to decide again how
careful to be about it.

Deliberately **not** here, because both are record envelope and belong to the foundation step:
any timestamp recording *when* something was edited, and any field tracking *which* shipped
record an edited one was derived from.

---

## 5. The ROUTINE record

`routines.json` — a top-level array of routine records.

| Field | Type | Required | Allowed values | Why it exists |
| --- | --- | --- | --- | --- |
| `id` | string | yes | id format, §3 | Sessions reference the routine they ran. |
| `name` | string | yes | 3–60 chars, no punctuation beyond spaces and hyphens | Displayed in the routine list and the session header. Looser than an exercise name because it is not spoken aloud. |
| `split_day` | integer | yes | 1–7 | Position in the weekly split, **not a calendar weekday.** The coach's week does not necessarily start on a Monday and clients train on different days; a position lets the split be ordered so body parts rest between consecutive sessions without the app claiming to own his calendar. |
| `focus` | string | yes | see §5.1 | The routine family. What the coach picks from when he wants "the pull day". |
| `body_regions` | array of string | yes | ≥1, unique, see §5.2 | Coarse regions, for the rest-across-the-week check and for the plain-language progress summary. Distinct from the per-exercise muscle lists, which are too fine-grained to reason about a week with. |
| `description` | string | yes | 10–400 chars | The intent of the session in one or two plain sentences, so the coach can tell two similar routines apart at a glance. |
| `entries` | array of object | yes | ≥1, §5.3 | The ordered exercise list. Order is the routine's default order; the coach can jump, reorder, skip, repeat or substitute freely in session, and the intensity adapter reorders it too. |
| `provenance` | string | yes | as §4.6; always `"shipped-untouched"` in a seed file | As §4.6. A routine the coach builds himself is `coach-created` and survives a reset. |

### 5.1 `focus`

```
push  pull  chest-and-shoulders  legs  hiit  functional
core-and-conditioning  full-body  upper-body  lower-body  active-recovery
```

### 5.2 `body_regions`

```
upper-body  lower-body  core  posterior-chain  anterior-chain  full-body
```

### 5.3 routine entries

```json
{ "exercise_id": "barbell-bent-over-row", "sets": 4, "repetitions": 8, "rest_seconds": 90 }
```

| Field | Type | Required | Range |
| --- | --- | --- | --- |
| `exercise_id` | string | yes | must resolve to a real exercise id |
| `sets` | integer | no | 1–10 |
| `repetitions` | integer | no | 1–100 |
| `duration_seconds` | integer | no | 5–1800 |
| `rest_seconds` | integer | no | 0–600 |

**Reference by id only. Never copy the exercise definition into the routine.** The coach
edits an exercise once and every routine using it changes — that is the whole point of the
in-app library, and a copied definition would silently keep the old values.

The four optional fields are **routine-level overrides** of the exercise defaults, for the
case where a movement is programmed differently on the pull day than on the functional day.
Omit a field to inherit the exercise default; do not restate a value that matches the
default, because a restated value stops tracking edits to the exercise.

An override must **agree with the referenced exercise's `measurement`**: a `repetitions`
override on a time-based exercise, or a `duration_seconds` override on a repetition-based
one, is an error the validator catches (rule `R5`). Overriding `sets` or `rest_seconds` is
always fine.

---

## 6. The INTENSITY PATTERN record

`intensity-patterns.json` — a top-level array of intensity pattern records.

Patterns ship as **data, not code**, precisely so the coach can configure them — add one,
edit one, delete one — without the app being rebuilt.

| Field | Type | Required | Allowed values | Why it exists |
| --- | --- | --- | --- | --- |
| `id` | string | yes | id format, §3 | The button the coach presses references this. |
| `name` | string | yes | 3–60 chars | The label on that button, e.g. `low medium high low`. |
| `sequence` | array of string | yes | 2–8 items, each `"low"` \| `"medium"` \| `"high"` | The curve itself: the ordered intensity points, in order. |
| `mapping_rule` | string | yes | `"stretch"` \| `"repeat-cycle"` \| `"hold-last"` | How a sequence of *k* points maps across a routine of *n* exercises, because a four-point curve has to shape a routine of nine. See §6.1. |
| `description` | string | yes | 10–300 chars | What the curve is for, in plain words, so the coach can pick one without experimenting mid-session. |
| `provenance` | string | yes | as §4.6; always `"shipped-untouched"` in a seed file | As §4.6. Patterns ship as data so the coach can add his own, and a `coach-created` pattern survives a reset. |

If the `name` **spells out a curve** — two or more of the words `low`, `medium`, `high` —
those words must match `sequence` exactly, in order and in count (rule `R11`). A pattern
labelled `low medium high low` whose sequence is anything else is a lie on a button the
coach presses in front of a client. A name containing one intensity word or none is treated
as a descriptive label, not a spelled-out curve, and is not checked against the sequence.

### 6.1 `mapping_rule`

For a routine of `n` exercises and a sequence of `k` points, the intensity point for
position `i` (zero-based, `0 <= i < n`) is:

| Rule | Formula | Behaviour |
| --- | --- | --- |
| `stretch` | `sequence[floor(i * k / n)]` | Spreads the curve proportionally across however many exercises there are. A four-point curve over nine exercises gives roughly two or three exercises per point. This is the default choice for a shaped session. |
| `repeat-cycle` | `sequence[i mod k]` | Repeats the sequence around the routine. Suits short alternating patterns such as `high low`, used for interval-style work. |
| `hold-last` | `sequence[min(i, k - 1)]` | Follows the sequence then holds the final point for the remainder. Suits a ramp that reaches a level and stays there. |

Worked example, the shipped `low-medium-high-low` (`k = 4`) over a routine of `n = 9`:

| position `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `floor(i * 4 / 9)` | 0 | 0 | 0 | 1 | 1 | 2 | 2 | 3 | 3 |
| point | low | low | low | medium | medium | high | high | low | low |

Two properties of `stretch` that the implementation must not "improve" on: the points come
out in sequence order and never reordered, and when `n < k` the curve is **sampled**, so a
five-point sequence over three exercises simply drops the points it has no room for. That is
correct behaviour, not a case to pad around, but §6.3 requires it to be *said* rather than
silently done.

The rest of §6 specifies the adapter completely enough to implement. It is written for the
session runner: nothing below is a suggestion, and nothing below leaves a value to be
invented at the keyboard.

### 6.2 The adapter, end to end

The adapter is a **pure function**:

```
propose(routine, pattern, exercise_library, client_baseline?) -> proposed_session
```

Same inputs, same output, every time. It reads; it writes nothing anywhere. Six steps, in
order.

**Step 1 — build the demand curve.** For each position `i` in `0 .. n-1`, resolve the
intensity point by the pattern's `mapping_rule` (§6.1). This gives a list of `n` wanted
levels, in routine position order. `n` is the number of entries in the routine, and the
curve never changes it: **a pattern never adds, removes or duplicates an exercise.** The
routine holds nine exercises, the proposal holds those same nine.

**Step 2 — build the pool.** Group the routine's entries by the `intensity` of the exercise
each one references (§4, the exercise's own field, resolved through `exercise_id`). Within
each group, keep the routine's authored order. That authored order is the coach's, and it is
the tie-breaker everywhere below.

**Step 3 — assign an exercise to each position.** Walk positions `0 .. n-1` in order. For
position `i` with wanted level `L`:

1. If the pool for `L` is non-empty, take its **first remaining** exercise — the one the
   coach placed earliest in the routine among those not yet used. Remove it from the pool.
2. If the pool for `L` is empty, substitute by §6.3.

This is the whole of "how an exercise is chosen", and it is deliberately a **consumption
walk rather than a division**. There is nothing to divide evenly: the curve decides how many
positions each level gets, the routine decides how many exercises it has at each level, and
the two need not agree. Because every position takes exactly one exercise and there are
exactly `n` of each, any surplus at one level is matched by an exact shortfall at another,
and §6.3 resolves every shortfall deterministically.

Two properties follow, and both are worth having:

- The walk is **stable**. Re-running it on the same routine gives the same order, so the
  coach is not shown a different session each time he presses the same button.
- A surplus exercise is **never dropped**. It is placed by §6.3 at a level the curve had a
  gap in, marked as a substitution. An exercise the coach put in the routine always appears
  in the proposal.

**Step 4 — scale each position.** §6.4.

**Step 5 — calibrate against the client baseline, if one is available.** §6.5.

**Step 6 — return a proposal.** §6.6. Not a session. Not a saved anything.

### 6.3 The missing-level case, and why it is never silent

**This case will occur.** A pull day of loaded barbell work may hold no `low` intensity
exercise at all, and `low-medium-high-low` asks for four. A routine of five exercises cannot
express an eight-point curve. Neither is a bug in the routine or in the pattern, and neither
may produce a session that quietly is not the shape on the button the coach pressed.

**The substitution ladder.** When the pool for wanted level `L` is empty, take the first
remaining exercise from the next level along this ladder, and keep walking the ladder until
a non-empty pool is found:

| wanted | then try | then try |
| --- | --- | --- |
| `high` | `medium` | `low` |
| `medium` | `low` | `high` |
| `low` | `medium` | `high` |

`medium` steps **down to `low` before up to `high`** on purpose. Every substitution is an
error in one of two directions, and they are not equally bad: proposing *less* demand than
the curve asked for gives the coach a session he can make harder in a tap, while proposing
*more* gives a client work the coach did not ask for. When the adapter must be wrong, it is
wrong on the easier side.

**Every substitution is recorded on the position it happened at**, and the proposal carries
those records to the screen:

```
position 6: wanted high, no high exercise remained, used medium (Goblet Squat)
```

**Every substitution that RAISES demand above the wanted level is flagged distinctly**, not
merely listed, because that is the one the coach may want to overrule.

**A wholly absent level gets a plain-language line at the top of the proposal**, stated once
in the coach's terms rather than repeated per position:

> This routine has no high intensity exercises, so the three hardest points of the curve
> were filled with medium ones.

**A curve the routine is too short to express gets the same treatment:**

> This routine has five exercises, so two points of this eight-point curve were not used.

**The hard rule, and the reason this section exists:** the adapter must never present a
substituted session as if it were the requested shape. Producing a wrong session silently is
worse than producing no session — the coach is standing in front of a client trusting the
button he just pressed. Failing loudly is available; failing invisibly is not. The adapter
also never refuses: it always returns a proposal, because refusing mid-session would make the
app the obstacle. It proposes, and it says exactly where it could not do what was asked.

### 6.4 Scaling — the numbers come from the library, never from the adapter

For a position with resolved level `L` (the wanted level, or the substituted level actually
used) and chosen exercise `x`, the proposed values are `x.scaling[L]` (§4.5), taken
**verbatim**:

| Proposed field | Source |
| --- | --- |
| `sets` | `x.scaling[L].sets` |
| `repetitions` | `x.scaling[L].repetitions` — present when `x.measurement` is `"repetitions"` |
| `duration_seconds` | `x.scaling[L].duration_seconds` — present when `x.measurement` is `"time"` |
| `rest_seconds` | `x.scaling[L].rest_seconds` |

**No arithmetic. No multiplier, no percentage, no rounding, no interpolation, no invented
number of any kind.** Every value the adapter proposes was authored into the library and can
be edited by the coach in the library. If a value looks wrong to him, there is exactly one
place to go and fix it, and fixing it there fixes every proposal that uses it. An adapter
that computed `+15%` would put a number on the screen that exists nowhere he can edit.

**There is no load, weight or resistance value in any of this**, because there is none in the
seed at all (§4.4). A harder point means **more work and less rest** and never more load;
that relationship is enforced on the library by rule `R6` (§4.5), so the adapter can rely on
it rather than re-check it. Load is a per-client judgement belonging to the coach, who is
also adapting to that client's medical history. Any load he records is an observation
captured in the session, never a value the library or the adapter suggests.

**Routine-entry overrides (§5.3) do not survive a pattern, and the proposal says so.** A
routine entry may override `sets`, work or `rest_seconds` for the unshaped default session.
Those overrides describe the routine *as written*; the pattern is a request to reshape it, so
`x.scaling[L]` wins. Where an override was replaced, the position records both values:

```
position 2: routine says 4 sets, the curve's medium point says 3 sets
```

so the coach can put his own number back with one tap. The alternative — scaling his override
proportionally — would mean inventing a number, which §6.4 forbids outright.

### 6.5 Baseline calibration — read only, and provably not progression

The adapter **may** use a client's recent performance as the baseline it calibrates against,
so a curve fits that person rather than being generic. This is narrow, and the narrowness is
the point: it was granted alongside an explicit and standing decision that the app **never**
raises load or work of its own accord (§7, `R9`). Both hold. The rules below are what makes
them compatible rather than contradictory.

**What calibration may do.** For a position at level `L` with exercise `x`, if the client has
recently performed `x` at level `L`, the adapter may propose **what that client actually did**
instead of the library value — carrying their own number forward, so a client who has been
doing twelve repetitions is not handed eight because that is what the library says.

**What calibration may never do**, each one stated so a reviewer can check it:

1. **Never propose more than the client has already done.** The proposed work at level `L` is
   at most `max(x.scaling[L], what the client last actually performed at L)`. Never that plus
   anything. There is no increment, no step, no "a little more this time".
2. **Never persist anything.** No calibrated target, offset, multiplier, level or ceiling is
   written to any record, any store or any backup. Calibration is a read of session records
   the coach already captured, performed fresh each time the button is pressed. It adds no
   field to any schema in this contract and none to the runtime store.
3. **Never carry state between proposals.** The adapter has no memory. Two presses of the
   same button on the same routine for the same client, with no new session recorded in
   between, produce **byte-identical** proposals.
4. **Never calibrate from nothing.** With no recent record for that client and exercise, the
   library value is used verbatim. The adapter does not extrapolate from a different
   exercise, a different level, or a different client.
5. **Bounded look-back.** Calibration reads only recent completed sessions for that client
   (the runner fixes the window; it is small and it is a window, not a history). A partial or
   abandoned session is not evidence of what a client can do.

**The acceptance test for this section, which the session runner should implement as a test
rather than reason about:**

> Run the same pattern on the same routine for the same client three sessions running, with
> the client performing exactly as proposed each time. The third proposal must be identical
> to the first. If it is higher, the implementation has encoded week-over-week progression
> and is wrong.

Getting this backwards reverses a decision the user made explicitly and repeatedly: the app
does not decide training load. It shows the coach what happened last time and proposes a
shape; he decides whether anything goes up.

### 6.6 The app proposes, the coach disposes

The output of §6.2 is a **proposal**, and the word is load-bearing:

- **It is never applied on its own.** Pressing a pattern shows the coach the proposed
  session. Nothing is written, started, or committed until he accepts it.
- **Every value is editable, before and during the session.** Order, exercise choice, sets,
  repetitions, duration, rest — all of it, at any time, with no mode to enter and nothing to
  unlock. The coach may also accept the shape and change one position, which is the common
  case.
- **It is discardable.** Dismissing the proposal leaves the routine exactly as authored, and
  restoring the routine's own order is one tap. Pressing a pattern is never a decision he has
  to undo carefully.
- **What gets recorded is what was performed**, never what was proposed. A proposal is not
  history and does not appear in a progress report.
- **The patterns themselves are his.** They ship as data precisely so he can add, edit and
  delete them; the shipped seven are a starting point, and the admin reset restores exactly
  them (§4.6).

The adapter changes the *shape* of a session — the order of the exercises, and how much work
and how little rest each one asks for. The one judgement with real physical consequence, what
load a particular person should handle today, stays with the certified professional standing
in the room.

### 6.7 How the shipped content actually behaves under §6.2, measured

Three facts about *this* seed set, established by running the walk of §6.2 over all seven
patterns against all seven routines. They are recorded because each one otherwise reads as a
bug to someone meeting these files cold.

**Every shipped routine carries all three intensity levels.** No routine is missing `low`,
`medium` or `high`. So on shipped content the wholly-absent-level notice of §6.3 — *"this
routine has no high intensity exercises"* — never fires. Every substitution that does occur is
the ordinary pool-exhausted case: the level exists in the routine, and the curve simply wanted
more positions at it than the routine had exercises for. Both cases are still implemented,
because the coach's own routines are under no such guarantee.

**Substitution is normal here, not a defect to design away.** A routine of eight or nine
exercises holds roughly three at each level, so any curve asking for more than about four
positions at one level must substitute. On the shipped set this runs from zero substitutions
(`steady-build`, which substitutes on none of three routines and once on the other four) to
about half the positions (`build-and-hold`, whose `hold-last` rule concentrates six or seven
positions on its final point, substituting on three to five of eight or nine). Across all
seven patterns against all seven routines, 108 of 413 positions substitute — about a quarter —
and none of the 49 combinations fails to produce a full proposal. That is the designed
behaviour of §6.3 and not a reason to pad, drop or reorder anything: the proposal reports each
substitution, flags the ones that raise demand distinctly, and still contains every exercise
the coach put in the routine.

**The library deliberately holds more exercises than the shipped week uses.** Of the exercises
in `exercises.json`, the seven routines reference a little under two thirds; only one exercise
is used by two routines and none by more than two. The unreferenced remainder is not dead
weight and must not be pruned as orphaned: they are the substitution bench — regressions such
as a knee push up, equipment variants such as a band or dumbbell curl in place of a barbell
one, and alternatives for a client training at home with nothing. The coach swaps an exercise
mid-session (§5.3, §6.6) and these are what he swaps to. An importer must load the whole file,
not only what the routines reach.

---

## 7. The three hard content rules

These are not style preferences. They are recorded product decisions, they are enforced by
the schema and the validator, and a violation blocks the step.

### R7 — no endorsement, certification or approval, anywhere

**No field, value, description or comment in any seed data file may claim or imply
endorsement, certification, accreditation or approval by any fitness body, and none may
name such a body as a source.** No logo, no wording, no attribution.

The library is curated from mainstream, widely accepted strength-and-conditioning practice.
Nobody has certified it and we cannot source that claim, so we do not make it. The coach is
the actual certified professional here; the shipped set is a starting point he corrects, not
a prescription with a credential behind it.

The validator does a **case-insensitive, word-boundary** scan of every string key and every
string value in every seed data file for:

*Organisation and credential acronyms*

```
nasm   ace   issa   acsm   nsca   nesta   afaa   ncsf   ncca
cscs   cpt   ces    pes    nfpt   isca
```

*Claim words and phrases*

```
certified      certification   certifying    certificate
endorsed       endorsement     endorses      endorse
approved       approval        approved by
accredited     accreditation   sanctioned
licensed       license         licence
official       officially      seal of approval
recognised by  recognized by   in partnership with   backed by
```

The scan is deliberately broad — broader than the literal rule — because a false positive
costs one reword and a false negative ships a claim we cannot back. Word boundaries are
what keep it usable: `ace` does not match `brace`, `pace`, `face` or `surface`, so ordinary
coaching cues are unaffected.

> This document names those acronyms **in order to ban them**, so it is not itself scanned.
> The scan covers `exercises.json`, `routines.json` and `intensity-patterns.json` only.

### R8 — no imagery, illustration or media of any kind

**No image, illustration, media path, media filename or external url field exists in the
schema at all**, and no value may look like one. The app ships no pose imagery; the coach
already knows the movements, and a public repository of borrowed exercise illustrations
would be both a licensing problem and dead weight in the bundle.

The validator rejects:

- any **key** containing `image`, `img`, `photo`, `picture`, `thumb`, `thumbnail`,
  `illustration`, `media`, `video`, `gif`, `icon`, `asset`, `url`, `uri`, `href`, `src`,
  `link`, `poster`, `animation`, `sprite`, `avatar`, `diagram`, `figure`;
- any **value** containing `http://`, `https://`, `data:`, `file://`, `//`-prefixed
  protocol-relative paths, or a media file extension: `png jpg jpeg gif svg webp avif bmp
  tif tiff ico mp4 webm mov m4v avi mp3 wav ogg`.

Since the schema sets `additionalProperties: false` everywhere, such a field cannot be
added by accident either. Both defences are kept: the schema stops the field, the scan
stops a media path smuggled into a legitimate text field.

### R9 — no week-over-week progression

**Nothing in the seed data may encode week-over-week progression, a prescribed multi-week
programme, or an instruction to add load or volume over time.** The app never
auto-progresses a routine. It shows the coach the previous session at a glance and he
adjusts everything manually — the app is a supporting role, not the driver, and automatic
progression would make it the decision-maker about training load for a client whose medical
history only the coach knows.

The validator rejects:

- any **key** containing `week`, `progression`, `deload`, `cycle`, `phase`,
  `periodization`, `periodisation`, `increment`, `ramp`;
- any **value** matching `week over week`, `week <number>`, `week one` … `week six`,
  `deload`, `periodization` / `periodisation`, `mesocycle`, `microcycle`, `macrocycle`,
  `progressive overload`, or an add/increase/raise/bump/progress/advance phrasing followed
  within a short span by `each` / `every` / `per` / `next` + `week` / `session` / `month`.

The bare word `week` is allowed **in a value** — a routine description may legitimately say
a split rests body parts across the week — but is banned **in a key**, where it could only
ever be structural.

---

## 8. What `validate_seed.py` checks

Standard library only. No third-party package, no package manifest, no node tooling, no
install step. It runs in seconds and is re-runnable identically by a reviewer in a fresh
shell. It resolves its own paths from the script's location, so it does not care what the
working directory is.

```powershell
uv run --no-project python validate_seed.py --self-test          # validate the validator
uv run --no-project python validate_seed.py                      # validate everything present
uv run --no-project python validate_seed.py --only exercises     # one file kind
uv run --no-project python validate_seed.py --only routines
uv run --no-project python validate_seed.py --only intensity-patterns
uv run --no-project python validate_seed.py --only patterns      # short form of the line above
uv run --no-project python validate_seed.py --list-rules          # what is enforced
```

`--only` also accepts the short forms `exercise`, `routine`, `intensity` and `patterns`,
each resolving to the canonical kind. The rest of this project calls that file kind "the
patterns", so a reviewer re-running the gate by hand types `--only patterns` without
thinking; rejecting it as bad usage would fail a run for a reason that has nothing to do
with the content.

Exit codes: `0` clean, `1` findings reported, `2` bad usage.

In the default mode a data file that does not exist yet is reported as skipped and does
**not** fail the run — the three files are authored in later actions and the contract has to
be checkable before they exist. With `--only`, a missing file **is** a failure, because it
was asked for by name.

Because the validator must not need `jsonschema`, it implements the subset of JSON Schema
the three schema files use: `$ref` to local `$defs`, `type`, `enum`, `const`, `required`,
`properties`, `additionalProperties`, `items`, `minItems`, `maxItems`, `uniqueItems`,
`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `allOf`, `anyOf`, `oneOf`, `not`.
The schema files themselves are plain, standard JSON Schema, so S3 can hand them to a real
validator in the browser or in a test if it wants to.

| Rule | What it checks |
| --- | --- |
| `R0` | A file requested by `--only` exists and parses as JSON. |
| `R1` | Every file is a top-level array and every record in it conforms to its JSON Schema. |
| `R2` | Content keys are unique within a file. |
| `R3` | Content keys match the stable format of §3. |
| `R4` | Every `exercise_id` referenced by a routine entry resolves to a real exercise. |
| `R5` | `measurement` and the prescription agree: a time-based exercise carries a duration and not a repetition count, at the default prescription and at all three scaling points; and a routine override does not contradict the exercise's measurement. |
| `R6` | `scaling` is present, complete and correctly ordered per §4.5: work non-decreasing and strictly greater at `high` than at `low`, `sets` non-decreasing, `rest_seconds` non-increasing. |
| `R7` | No banned endorsement term appears in any key or string value. |
| `R8` | No key or value looks like an image, media or url reference. |
| `R9` | No key or value encodes week-over-week progression. |
| `R10` | Exercise names are speakable: letters and single spaces only, no digits, no punctuation, no abbreviation tokens, no bare single letters other than `a` and `i`. |
| `R11` | An intensity pattern `name` that spells out a curve — two or more intensity words — matches its `sequence` exactly, in order and in count. |
| `R12` | Every record in a shipped seed file carries `provenance: "shipped-untouched"` (§4.6). The three-value vocabulary is for runtime; a seed file that claims the coach made something, or that he has already edited it, is wrong on its face. |

`--self-test` validates the validator rather than the content. It runs the full rule set
over small inline fixtures: one conforming fixture set that must produce **zero** findings,
and, for **each** rule above, a deliberately broken fixture that must produce a finding
carrying **that** rule's id. It touches no data file, reads only the schema files, and exits
`0` only if every one of those assertions holds. A rule that has quietly stopped firing is
therefore a self-test failure, not a silent pass on the content.

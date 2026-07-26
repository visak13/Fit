# The intensity package — the adapter that shapes a session to a curve

Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
package; types are expressed in documentation comments. `intensity.js` is the module entry point for
code; `index.js` is the test entry point and nothing else.

```js
import { proposeSession } from './core/intensity/intensity.js';

const proposal = proposeSession({
  pattern,                    // the intensity-pattern record: the curve he pressed
  routine,                    // the routine record he is running
  catalogue: allExercises,    // the WHOLE library, not the routine's own list
  history,                    // this client's recent performed records, or null
  variation: { rotate: 0 },   // which of several equally good substitutes to prefer
});
```

The package is a **leaf**. It opens no store, reads no clock, draws no random number, and imports
nothing outside its own directory — a test asserts that, and asserts the scan can find an outside
import when there is one. Everything it knows arrives as an argument.

---

## 1. It PROPOSES. The coach disposes

This is the rule most likely to be broken by accident, and it is built into the shape of the return
value rather than left as an instruction.

`proposeSession` returns a **deep-frozen description**: a curve, one line per position, the reference
every number was built from, and the places the routine ran short. It is not a routine, not a session,
not a record, and not anything the local store recognises. There is nothing here to save.

**This package exports no verb that would apply, commit, write, save or persist a proposal**, and a
test asserts the export list still does not. The screen that shows a proposal collects the coach's
edits and writes them through the session layer; the adapter never learns whether he accepted it.

Nothing here is applied silently and nothing raises anything on its own. Every value stays his to
alter, and the whole shape can be set aside. The proposal says so in its own first sentence, because a
rule that lives only in a document is a rule the next screen can contradict.

This is the same principle `core/session/SESSION.md` section 8 holds from the other direction, where
the glance panel SHOWS and does not suggest. Neither module may contradict the other in behaviour or
in its shipped words.

---

## 2. It REORDERS and it SCALES, and both halves are load-bearing

An adapter that only re-sorted, or only multiplied numbers, would have done half the job — and the
half it skipped is the one that makes the feature worth having.

**Reordering** (`placement.js`). Each position of the curve gets a movement, by three attempts in
order:

1. an exercise from the routine whose own intensity is the level asked for, in the coach's declared
   order;
2. a **substitute from the whole catalogue** at that level, swapped in for one of the routine's
   leftover exercises, and named on screen;
3. a leftover routine exercise at the nearest level available, recorded as a **shortfall** that says
   which level ran short.

**Scaling** (`effort.js`). Each position carries repetitions or a timer, sets, and rest, taken from the
exercise's own three-point `scaling` ladder at the level the curve asked for — never from its
`default_prescription`. Where the same movement sits at a level the library does not file it under, it
takes that level's numbers, which is what makes the curve shape effort rather than merely order.

**No load, ever.** Not at any level, not from any source, not in any field. A harder point means MORE
WORK and LESS REST, which is the relationship the exercise validator's `R6` enforces on the library
this reads from. Load is a per-client OBSERVATION the coach makes in a session and writes on a
performed record; the library never prescribes one and neither does this. `PROPOSES_NO_LOAD` is
declared in `effort.js` and asserted, because an absence is indistinguishable from an oversight to
whoever edits this next.

---

## 3. Calibration, and the invariant that makes it safe

Every number is built from ONE reference, chosen in this order:

| Order | Reference | When |
| --- | --- | --- |
| 1 | **What the client actually did** at this exercise, most recently | A record said which point it was worked at |
| 2 | **The number the coach wrote into this routine** for this exercise | He overrode the exercise default |
| 3 | **The exercise's own scaling point** at the level asked for | Otherwise |

The reference is reported back on every position — its source, its level, its numbers, and the day it
was recorded — so he can see WHY a number is what it is. A number he cannot account for is a number he
will not trust in front of a client.

> **THE INVARIANT.** No proposed number is ever greater than the largest work its three sources
> genuinely contain, and no proposed rest is ever shorter than the shortest they contain. Every one of
> those numbers was written by a person. This module has no fourth source and therefore no number of
> its own invention.

The arithmetic of a rising curve can overshoot all three — a client who managed thirty repetitions at
an exercise's low point, spread up a ladder whose high point is two and a half times its low, arrives
at seventy-five, and nobody asked for seventy-five. The ceiling catches exactly that, and the position
says which source held it and what the shape alone would have asked for.

Work scales by the **ratio** between the library's points, because the ladder's spacing is what makes
a client's own number mean something at a level he has not been measured at. Sets and rest scale by the
**difference**: a ratio on rest is undefined at the zero-rest point the model permits, and a ratio on
two sets jumps in steps too coarse to mean anything.

### Why there is no ratchet

This is the guarantee that matters, and it is structural rather than a check.

At the level he was measured at, the ladder's ratio is exactly one and the ceiling can only reduce, so
the proposal is **exactly what he last did there and never more**. Press the same curve every week for
a year and the number does not move. Shape him up to a harder point, record that, and shape him back
down, and he cannot arrive higher than he started.

Not claimed, deliberately: the round trip is not exactly reversible. Where the ceiling held the upward
step, the return lands lower than the starting number. That is the safe direction, and it is stated
rather than papered over.

### A client with no history

An ordinary, expected case — not an error, and not a silent default dressed up as a measurement. The
baseline reports `kind: 'none'`, every number comes from the coach's own library, and the proposal says
in plain words that it had nothing to work from and should be read as a starting point rather than as a
measurement. A screen full of confident numbers that look measured and are not is the worst outcome
available here.

The history is an **argument**, and so is the window it covers. The caller decides what "recent" means
and hands over the records. A module that fetched its own history would need a clock to bound it.

### A fact that does not say which point it was worked at

The near neighbour of the case above, and it used to be handled by **inventing the missing part**.
`effort.js` read a record with no `intensity_level` as though it had been performed at the exercise's
own filed level — `measured.level ?? exercise.intensity` — a fabricated measurement wearing a real
one's clothes. It was the one route by which the ratchet above could still happen: at the guessed level
the ladder's ratio is one and the ceiling is that same number, so work managed at a curve's HIGH point
came back proposed at its LOW one, off a fact that never recorded where it was done.

> **A fact with no measured level is not a baseline.** It is EXCLUDED from the calibration rather than
> counted at a guessed level, it is COUNTED as excluded, and the proposal SAYS SO. Silently wrong
> becomes visibly absent.

**Refusing outright was considered and rejected.** A level-less fact is correct and common in three
measured cases — every fact already on disk, a line run under no accepted curve, and a substitution the
coach made himself — so erroring would make an ordinary unshaped session unusable, which would be a
defect and not a hardening. An unshaped session still produces a usable proposal; it simply calibrates
from a stated absence instead of from a fabricated measurement, and the sentence he reads says the
shape rests on less of that person's record than it might have.

**Excluding is the safe direction in every case.** A candidate removed from a maximum can only lower a
ceiling, and one removed from a minimum can only lengthen a rest. Nothing the exclusion does can raise
a proposed number.

#### Why the level lives on the PERFORMED record and not on the session

Two people have already conflated these entities, so the reason is recorded rather than left to be
re-derived. A curve is **chosen** once for a session, but **performance** is per client and per
exercise: a session walks a curve, so its lines are deliberately at DIFFERENT points. A field on the
session record could only say which curve was chosen, never the point a particular line was actually
worked at — and every guarantee in this package reads the latter. On both, it would be two sources of
truth about one fact, which this build has already refused over stored cursors and over seeding flags.
`entities/performed-record.js` already validates `intensity_level` as one of low, medium, high;
**nothing was added anywhere** for this, and `core/sync/payload.test.js` proves the wire is unmoved in
both directions with the document version unchanged.

#### The backfill that cannot be done

Facts already on disk have no level and never will. Nobody recorded what those sessions were worked at,
and inventing it now would be the same fabrication one layer up. **It is not a gap to close; it is a
fact about the past.** The honest handling of it is the exclusion above plus the sentence that tells
the coach it happened.

---

## 4. It draws from the whole catalogue, and prunes nothing

`core/seed/SEED.md` section 1 is the reason: the shipped catalogue deliberately exceeds the shipped
week, and **the surplus IS the substitution pool**. This adapter is one of the two features that pool
exists for.

**Referential checking runs in ONE DIRECTION ONLY:** every exercise a routine names must exist, never
the reverse. An exercise no routine references is a NORMAL state, and this package is where those
exercises get used. Nothing here filters, shortens, rebuilds or returns a reduced catalogue.

A substitute must be credible rather than merely available, so a candidate is offered only if it shares
the displaced exercise's movement pattern, or a muscle with it, or a muscle with the routine as a whole
— and only if its equipment is equipment the routine already assumes. A barbell is never proposed into
a session he built out of bodyweight work.

Where several candidates are equally good, `variation.rotate` chooses among them. **Variation is an
argument**, never a random draw and never a clock: same request, same session, on every device and in
every run.

---

## 5. Honest degradation, in his own terms

A pattern the coach authors himself is under no guarantee of being servable. A routine of eight
exercises holds roughly three at each level, so a curve demanding five high positions cannot be filled.
When that happens:

- the session keeps its **full length** — never shorter than the routine;
- each affected position names the movement it holds and says whether it is an easier or a harder one
  than the curve asked for;
- the proposal carries one summary per level that ran short, saying how many of that level's positions
  were filled and how many were not.

Never a silent substitution of a different intensity, and never a shorter session than asked for.
Separately, a curve with more points than the routine has exercises reports which points went
unreached, rather than delivering two points of five as though that were the whole shape.

---

## 6. Verification: what is asserted, and how the absences are made honest

Six of this package's promises are ABSENCES — nothing is applied, nothing is mutated, no catalogue
entry is pruned, no clock is read, no sentence names a load, no sentence offers a progression. An
absence is the one shape of evidence this build has repeatedly caught lying, so each is handled twice
over:

- **A non-vacuity probe in the same run.** Every sweep is pointed at a known positive alongside the
  real subject, and the poison is asserted to be present before the sweep is asked about it. A sweep
  that is broken and a subject that is clean produce the same silence.
- **Proved by breaking.** Each guard has been broken on purpose, the break confirmed to have landed on
  disk, the suite watched going red, and the file restored. Nine guards, nine reds. A guard that has
  never failed is an untested guard.

Two findings from that pass are worth carrying rather than leaving as fixed bugs:

1. **A word sweep over generated prose must mask the content interpolated into it.** The shipped
   library holds an exercise called Bodyweight Squat, so sweeping the proposal's sentences for `weight`
   fired on the coach's own content. `findWords` takes the names to ignore and `namesIn` collects them.
   This is not a softening: a coach who names a routine Heavy Load Day has said `load` himself, and
   this application still has not.
2. **The rest floor's original test could not fail.** The assertion was correct and the fixture never
   reached below the floor. It was found only by breaking the floor and watching nothing go red — and
   fixing it exposed a real defect, a single clamp note written about work that would have been wrong
   the moment it was rest that moved. Notes are now per quantity.

The sweeps read **the sentences the proposal carries**, never the source that explains them. A sweep
pointed at source matches the very comments saying why a thing is forbidden, and then either fails on
its own documentation or gets "fixed" by deleting the explanation.

---

## 7. Extending this package

- **A new suite means a new line in `index.js`.** On this runtime a positional argument to
  `node --test` resolves as a module, not a searched directory, so a suite the entry point does not
  import runs not at all and still reports success. The evidence for a passing gate is the COUNT of
  tests actually run, never the exit status.
- **Keep it a leaf.** If a new rule needs a fact from elsewhere, take it as an argument. The moment
  this package imports the store, its suite needs a store double and its purity stops being provable.
- **A new field on the proposal that a human reads must be added to `humanSentencesOf`.** A test walks
  the whole proposal for anything sentence-shaped and asserts the collector returns exactly that set,
  so a sentence added to a new field fails there rather than escaping the sweeps.
- **A new bound belongs in `BOUNDS`, and it is checked against the real validator.** The ranges mirror
  `entities/exercise.js` and `entities/routine.js`; a test puts a routine through `validateRoutine` at
  each bound so a divergence fails rather than ships.
- **Do not add an apply path here.** The proposal is applied by the screen that shows it, through the
  session layer, with the coach's edits in it. A module that both proposes and applies is one refactor
  away from applying silently.
- **No emoji in any user-facing string**, and nothing anywhere may claim certification, compliance or
  endorsement.

## 8. Running the tests

```
cd C:\Projects\Fit\app
node --test core/intensity
```

Report the count of tests actually run. `core/intensity` resolves to `index.js`, which imports every
suite; `curve.test.js` is deliberately first because it verifies the arithmetic every other result here
is built on.

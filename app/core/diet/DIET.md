# The diet package

Start here: **`diet.js`** is the module API. `index.js` beside it is the test entry point, not the
API.

Plain, dependency-free ECMAScript. No framework, no bundler, no build step, no third-party package;
types are expressed in documentation comments. Nothing here draws, stores, reads a clock or touches a
browser — a plan goes in as a plain object and a view model comes out, which is why every one of
these is driven directly by a test with no store and no DOM anywhere near it.

This package answers the two questions the coach asks of a diet plan, and handles the way a plan
gets here in the first place:

- **What does this client eat this week?** → `projectWeekChart`
- **What do they follow now, and what did they follow before?** → `projectDietHistory`
- **Here is the plan my wife wrote — take it** → `importDietPlan`

---

## `projectWeekChart(plan)` — the grid

Days across, times down, each cell the food at that time on that day. Takes either a stored envelope
or a bare plan.

Four judgements are made here, and each one is a way a chart can look right and be wrong:

| Judgement | Why it matters |
|---|---|
| Times sort as **times** | `'9:00'` sorts before `'10:00'` as a time and after it as a string. A chart sorted as text still ascends inside each hour, so the mistake reads as merely odd rather than as broken. |
| A time is **one row across the whole week** | The coach compares Tuesday against Thursday by reading across. He can only do that if 08:00 is the same line on both. |
| A day with nothing at a time gets an **empty cell** | Omitting the cell shifts the row, and Thursday's lunch appears under the Tuesday column. That is the way a chart lies to the person reading it fastest. |
| A short plan keeps **short columns** | A five-day plan has five columns. `missing_days` names the other two so an interface can say "no plan for Saturday" instead of drawing a blank Saturday that reads as a fast day. |

**The week repeats.** No date from the record reaches the chart and there is no date arithmetic in
the file at all. `repeats: true` is on the view as a stated fact, because the first thing a renderer
is tempted to do with a day number is turn it into "this Tuesday". A test asserts that the plan's
`effective_from` does not appear anywhere in the projected chart.

`chartTable(chart)` is the same grid as a flat table — `{title, headings, rows}`, every cell a string,
`[headings, ...rows]` when a caller wants one array. That is the shape the diet export takes. This
package does not import the exporter and knows nothing about it; it simply does not produce a
structure that only a bespoke renderer could flatten.

## `projectDietHistory(plans, {client_id})` — now against before

**Status is a fact the coach set, never a sum this package works out.** The current plan is the one
whose `status` says `current`. There is no date arithmetic here and there must never be: a plan that
"became current" because an `effective_from` passed would change under him at midnight, with nothing
recorded and nothing to point at. `effective_from` and `effective_to` are shown, ordered by, and
never reasoned from.

Two cases are handled rather than assumed away, because both will happen:

- **No plans at all** — the common state, not an error. Every field is present and empty, so an
  interface cannot render half an answer.
- **More than one plan marked current** — two devices, or a new plan marked current before the old
  one was marked past. `current` is `null`, `contested_current` holds every claimant, and `problems`
  says so in plain words. Silently picking a winner is the one thing this must not do: the coach
  would be shown one plan, act on it, and never learn the other existed.

A plan belonging to another client is named in `problems` and kept **out** of the lists. One client's
facts never appear in another's history.

## `importDietPlan(text, {client_id, name, source_note})` — a paste in, a draft and a report out

The coach's wife is the nutritionist and he **transcribes** her plans. If pasting is worse than
typing he will type, and this feature has failed with every test still green. So this is generous
about the shape it is handed and severe about what it does with what it cannot read.

Returns `{draft, report}`. **The draft is offered, never stored** — the screen writes it, after the
coach has read the report and said yes.

### The one rule everything else serves: never guess in silence

A line dropped quietly is how a client's plan is lost with nobody noticing. No error, no gap the eye
catches, just a meal that is no longer there. It is far worse than a line the coach is asked about.

| Guarantee | How it is held |
|---|---|
| Nothing is dropped | `report.line_accounting` is a **partition** of the paste — blank, day heading, column heading, placed, unplaced — and the buckets must sum to the line count. Every unplaced line is quoted back **verbatim** in `could_not_place` with a reason. |
| Nothing is invented | No day, time, food or label reaches the draft that was not written. No date is read out of thin air; `effective_from` and `effective_to` are `null`. A test traces every value in the draft back to the paste or to a declared change. |
| Every change is named | `report.changed` lists each one with the line and both forms: `Line 5: "Tues" was read as Tuesday.` |
| Ambiguity is asked about, not resolved | `report.ambiguous` says what the coach has to decide. The reading taken is always the **literal** one. |
| The record judges the draft | `report.record_refusals` carries `validateDietPlan`'s own issues, **messages unchanged**. |

### The shapes it reads

- **Days across the top** — a heading row naming **two or more** days, the time and the slot in the
  columns before them, one food cell per day. Two is the threshold on purpose: a single day name
  among other words is far likelier to be a row that begins with its own day, and reading it as a
  heading would file the whole plan under the wrong shape.
- **A day in the first cell of each row.**
- **Loose day-headed text** — a day name alone on a line, the meals written beneath it.

Tabs and commas are both read; a tab wins where there is one. A **quoted cell keeps its commas**,
because that is what the quotes are for — a reader that ignored them would turn `"Oats, milk"` into
two columns and push every day one place to the right. A **blank line does not end a block**.

### The judgement calls, and why each one falls the way it does

| Call | Why |
|---|---|
| A **bare number is never a time** | `2 eggs on toast` starts a line in every real plan ever pasted. A reader generous enough to take `2` as `02:00` invents a meal at two in the morning, silently and plausibly. A time needs minutes or an am/pm. |
| A time before 07:00 with **no am/pm** is flagged | `1:00 Lunch` is read exactly as written, `01:00`, and `report.ambiguous` says so and names `13:00`. Choosing the afternoon because lunch is usually at lunchtime would be the app deciding what the nutritionist wrote. |
| A word is a **label only when the paste marks one** | Either a separator sets it off (`08:00 Breakfast - Oats`), or it is a slot people write (`Breakfast`, `Pre-workout`, `Meal 2`), or — in a spreadsheet row — the heading declared that column. Anything else is **food**: filing `Oats` as a slot name loses it from the items, which is the silent drop. |
| `rice/potato` is **not** split | A slash is a choice of one food. Splitting it tells the client to eat both. Nor is `and`, which is how `oats and milk` — one bowl — is written. Commas, semicolons, and the spaced `+` and `&` do split. |
| A meal with **no day above it** is not filed | It is reported, not guessed into Monday. |
| A time with **no food after it** is reported | It is not stored as an empty meal, and it is not thrown away either. |
| An over-long food is **carried whole** | Truncating it here would quietly change what the nutritionist wrote. The record says how long a food may be, and the record refuses it. |

### What it does not do

It does not validate, and it restates no rule: `core/model/entities/diet-plan.js` owns the field
lengths, the day range, the time pattern and the item bounds. A second copy of a rule is a copy that
drifts, so the refusal sentences in the report are the record's own words, carried through unchanged.

It resolves day names **through `week.js`**, never through a table of its own — see below.

## `week.js` — the one place a day number means something

The record stores a day as an integer 1..7 and stops there. The chart labels a column; the import
path reads "Tuesday" off a pasted plan and has to turn it back into the same number. If each wrote
its own table the coach would import into Tuesday and read it under Wednesday, with nothing erroring
anywhere — so the table lives here and both sides import it.

The numbering is ISO-8601: **1 is Monday, 7 is Sunday.** That is a decision, not something the record
states. Note the contrast with a routine's `position`, which its own header says is a slot in a
weekly split and explicitly *not* a calendar weekday; a diet day is different, because the
nutritionist writes the day name on the plan the coach is transcribing.

## Plaintext, by an explicit decision

A diet plan is a food chart: **no encryption, no sensitivity flag, no export gating** anywhere on
this path. The case for treating a diet as sensitive was put and rejected for this practice;
`core/model/entities/diet-plan.js` records it, and `purity.test.js` here fails if anything in the
package seals, unseals or asks for a passphrase. Reaching for the crypto module for diet data means
the step has been misread.

## What this package does NOT do

- It does not validate. `core/model/entities/diet-plan.js` owns every rule about field lengths, the
  day range, the time pattern and the item bounds. A second copy of a rule is a copy that drifts.
- It does not read the store. `dietPlanForClient` and `dietPlansForClient` in `core/store/queries.js`
  already exist; a caller uses those and hands the result here.
- It does not decide anything about a calendar.

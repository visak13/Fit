/**
 * THE DIET EDITOR — where the coach writes a plan, and where he stops retyping it.
 *
 * This file is the DRAWING and nothing else. The draft, the three moves that collapse the
 * repetition, what the plan covers, what it says nothing about, what happens when the record refuses
 * it — all of that is decided in `diet-editor.ts`, where each can be asserted with no browser and no
 * rendering at all, and the writes are in `diet-editor-source.ts`, driven against a real store. That
 * is the split `clients.ts` and `ClientsScreen.tsx` state as the pattern to copy: a static render
 * never runs an effect, so logic inside a component is logic nothing tests.
 *
 * ## WHY THE TYPING IS NOT DONE INSIDE THE GRID
 *
 * A diet week is a genuinely dense grid, and a5 measured what that costs: with the time column
 * pinned at 152px there is room for a time and a slot name and nothing else. Putting a food box in
 * there would either squeeze the food to a slot too narrow to read what was typed into it, or widen
 * the pinned column until the days it exists to hold still were pushed off a phone.
 *
 * So the two halves are separated by what they are FOR. Each meal is a PANEL — a time, a slot name,
 * the food, and the days it is eaten on as seven ordinary tick boxes that wrap. And the WEEK is
 * drawn underneath as the live preview of what he has built, through `WeekChart` — the same
 * component, the same `.week` classes and the same projection the read screen and the import
 * preview use. There is exactly one week grid in this application and this is it. He types where
 * there is room to type and reads the week where a week is readable, and what he confirms is laid
 * out identically to what he will read back tomorrow.
 *
 * ## DIET IS PLAINTEXT
 *
 * No passphrase, no gate, no sensitivity marking, and nothing here reaches for the crypto module. A
 * diet plan is a food chart.
 */

import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
// The ONE table of days, imported rather than restated. Every label, every tick box and every
// sentence naming a day on this surface comes off it — see `diet-guard.test.ts`.
import { WEEKDAYS, projectWeekChart } from '../../core/diet/diet.js';
import {
  ADD_MEAL, DAY_GRID_LABEL, MAKE_CURRENT, MAKE_CURRENT_WORDS, PREFER_PASTING, addMeal, copyDayOnto,
  describeCopyDay, describeEditor, nameOfDay, planContentFromDraft, removeMeal, toggleMealDay,
  updateMeal,
} from './diet-editor';
import type { MealRow, PlanDraft, PlanRefusal } from './diet-editor';
import { BACK_TO_THE_DIET, PASTE_A_PLAN, dietForClient, dietImport } from './diet';
import { WeekChart } from './WeekChart';

/** Everything the editor is handed. It owns the draft; it owns nothing else. */
export interface DietEditorProps {
  readonly clientId: string;
  /** Who the plan is for, so the heading says a person rather than an identity. */
  readonly clientName: string | null;
  /** True when an existing plan is being changed rather than a new one written. */
  readonly amending: boolean;
  readonly draft: PlanDraft;
  readonly onDraft: (draft: PlanDraft) => void;
  /** Save, and resolve only once the write has committed. */
  readonly onSave: () => void;
  /** Mark this plan the one they follow now. Absent while writing a plan that has never been saved. */
  readonly onMakeCurrent: (() => void) | null;
  /** True while a write is in flight, so the controls cannot be pressed twice. */
  readonly saving: boolean;
  /** The record's own refusal, or null. Every sentence in it was written by the record. */
  readonly refusal: PlanRefusal | null;
  /** Said once after a save has committed. */
  readonly saved: string | null;
}

/** ONE MEAL: what is in it, and the days it is eaten on. */
function MealPanel({ row, onDraft, draft, disabled }: {
  row: MealRow;
  draft: PlanDraft;
  onDraft: (draft: PlanDraft) => void;
  disabled: boolean;
}) {
  return (
    /*
      A `.row` HOLDING A `.row-panel`, AND IT WAS A BARE `.row-panel` FIRST — which looked, in the
      browser, like one unbroken column of inputs. `.row-panel` is `flex: 1 0 100%`: it is the thing
      that goes INSIDE a row that opens, and it carries no padding and no separator of its own, so
      seven meals ran together with their labels flush against the box edge and nothing saying where
      one meal ended. `.row` is what carries the padding and the hairline this list needs, and
      `.rows-boxed` around them draws the group. The idiom is the one `console.css` documents rather
      than a shape invented here.
    */
    <li className="row row-static row-wrap">
      {/* `row-static` because the PANEL is not a control — the controls are inside it. Without it
          the whole meal tinted under the pointer, which is `.row` saying "press me" about a block
          of text boxes. Seen by moving the mouse; no property check has an opinion about it. */}
      <div className="row-panel stack-tight">
        <div className="inline">
          <div className="field">
            <label htmlFor={`${row.id}-time`}>Time</label>
            <input
              id={`${row.id}-time`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="08:30"
              value={row.time}
              disabled={disabled}
              onChange={(event) => onDraft(updateMeal(draft, row.id, { time: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor={`${row.id}-label`}>What you call it</label>
            <input
              id={`${row.id}-label`}
              type="text"
              autoComplete="off"
              placeholder="Breakfast"
              value={row.label}
              disabled={disabled}
              onChange={(event) => onDraft(updateMeal(draft, row.id, { label: event.target.value }))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${row.id}-items`}>The food, one to a line</label>
          <textarea
            id={`${row.id}-items`}
            value={row.items}
            disabled={disabled}
            onChange={(event) => onDraft(updateMeal(draft, row.id, { items: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor={`${row.id}-notes`}>Anything to add</label>
          <input
            id={`${row.id}-notes`}
            type="text"
            autoComplete="off"
            value={row.notes}
            disabled={disabled}
            onChange={(event) => onDraft(updateMeal(draft, row.id, { notes: event.target.value }))}
          />
        </div>

        {/*
          THE DAYS THIS MEAL IS EATEN ON — the move that removes the retyping, drawn as the ordinary
          thing it is. Seven tick boxes, from the ONE table of days in `core/diet/week.js`; there is no
          list of day names in this file. They wrap rather than scroll, because a control the coach has
          to scroll sideways to reach is one he will not find on a phone.
        */}
        <div className="stack-tight" role="group" aria-labelledby={`${row.id}-days`}>
          <p className="pair-label" id={`${row.id}-days`}>{DAY_GRID_LABEL}</p>
          <div className="inline">
            {WEEKDAYS.map((weekday) => (
              <label className="choice" key={weekday.day} htmlFor={`${row.id}-day-${String(weekday.day)}`}>
                <input
                  id={`${row.id}-day-${String(weekday.day)}`}
                  type="checkbox"
                  checked={row.onDay(weekday.day)}
                  disabled={disabled}
                  aria-label={weekday.name}
                  onChange={() => onDraft(toggleMealDay(draft, row.id, weekday.day))}
                />
                {/*
                  THE SHORT FORM IS DRAWN AND THE FULL NAME IS THE CONTROL'S NAME — and it is an
                  `aria-label` rather than a `.visually-hidden` span BECAUSE OF A DEFECT MEASURED HERE.

                  `.visually-hidden` is `position: absolute` with no offsets, and `.content` — the one
                  thing on this screen that scrolls — is not itself positioned. So each hidden span's
                  containing block is the PAGE, not the scroll container, and it escapes the clip. One
                  of them costs nothing, which is why the read screen never showed this. Seven meals
                  times seven days is forty-nine of them, the lowest three thousand pixels down, and
                  the document grew to fit: the WHOLE APP FRAME then scrolled away — rail, navigation
                  and all — leaving a blank page with no way back. Typecheck clean, gate green, and
                  found only by dragging the page.

                  Both names still come off the one WEEKDAYS table, and "Mon" is the start of "Monday",
                  so what is read out contains what is drawn.
                */}
                <span aria-hidden="true">{weekday.short_name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="spread">
          {/* Said on a meal that several days carry, BEFORE he edits it — the whole point of the
              shape is that one edit changes them all, and a coach who did not know that would be
              surprised by his own plan. */}
          {row.repeatedWords !== null
            ? <p className="muted read">{row.repeatedWords}</p>
            : <span />}

          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={disabled}
            onClick={() => onDraft(removeMeal(draft, row.id))}
          >
            <Glyph name="delete" size="inline" decorative />
            <span>Take this meal off</span>
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * COPY A DAY ONTO OTHER DAYS — the one move the meal-carries-its-days shape does not give for free.
 *
 * It REPLACES what is on the days he copies onto, so it says what it will do before he presses it.
 * A control that silently replaced a day he had already written would be the editor losing his work
 * at the moment he was trying to save it.
 */
function CopyDay({ draft, onDraft, disabled }: {
  draft: PlanDraft;
  onDraft: (draft: PlanDraft) => void;
  disabled: boolean;
}) {
  const days = WEEKDAYS;
  const [from, setFrom] = useState(days[0].day);
  const [onto, setOnto] = useState<readonly number[]>([]);

  const willDo = describeCopyDay(draft, from, onto);

  return (
    <div className="stack-tight">
      <div className="field">
        <label htmlFor="copy-day-from">Copy a whole day</label>
        <select
          id="copy-day-from"
          value={from}
          disabled={disabled}
          onChange={(event) => setFrom(Number(event.target.value))}
        >
          {days.map((weekday) => (
            <option key={weekday.day} value={weekday.day}>{weekday.name}</option>
          ))}
        </select>
      </div>

      <div className="stack-tight" role="group" aria-labelledby="copy-day-onto">
        <p className="pair-label" id="copy-day-onto">Onto</p>
        <div className="inline">
          {days.filter((weekday) => weekday.day !== from).map((weekday) => (
            <label className="choice" key={weekday.day} htmlFor={`copy-onto-${String(weekday.day)}`}>
              <input
                id={`copy-onto-${String(weekday.day)}`}
                type="checkbox"
                checked={onto.includes(weekday.day)}
                disabled={disabled}
                aria-label={weekday.name}
                onChange={() => setOnto(onto.includes(weekday.day)
                  ? onto.filter((day) => day !== weekday.day)
                  : [...onto, weekday.day])}
              />
              {/* Named on the control rather than in a hidden span — see the meal panel above. */}
              <span aria-hidden="true">{weekday.short_name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* WHAT IT WILL DO, IN HIS WORDS, BEFORE HE DOES IT — including what gets replaced. */}
      {willDo !== null && (
        <p className="note note-warning read">
          <Glyph name="note" size="inline" decorative />
          <span>{willDo}</span>
        </p>
      )}

      <div>
        <button
          type="button"
          className="btn"
          disabled={disabled || willDo === null}
          onClick={() => {
            onDraft(copyDayOnto(draft, from, onto));
            setOnto([]);
          }}
        >
          <Glyph name="add" size="inline" decorative />
          <span>{`Copy ${nameOfDay(from)}`}</span>
        </button>
      </div>
    </div>
  );
}

export function DietEditor({
  clientId, clientName, amending, draft, onDraft, onSave, onMakeCurrent, saving, refusal, saved,
}: DietEditorProps) {
  const report = describeEditor(draft, { amending });
  const busy = saving;

  // THE LIVE PREVIEW IS THE REAL PROJECTION OF THE REAL DRAFT, not a sketch of one. It goes through
  // `planContentFromDraft` and `projectWeekChart`, so what he checks here is laid out by the same
  // code that will lay out what he reads back tomorrow.
  const preview = projectWeekChart(
    planContentFromDraft(draft, { clientId, status: 'draft' }),
  );

  return (
    <section className="card stack" aria-labelledby="diet-editor">
      <div className="spread">
        <h3 id="diet-editor" className="title-section">
          {clientName === null ? report.title : `${report.title} for ${clientName}`}
        </h3>
        <Link className="btn btn-quiet btn-sm" to={dietForClient(clientId)}>
          <Glyph name="link-back" size="inline" decorative />
          <span>{BACK_TO_THE_DIET}</span>
        </Link>
      </div>

      <p className="screen-intro read">{report.intro}</p>

      {/* PASTING IS THE PATH HE SHOULD BE ON, and it is named here rather than left to be found:
          he transcribes his wife's plans, and an editor that does not mention pasting is one he
          types the whole week into. */}
      {!amending && (
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{PREFER_PASTING}</span>
          <Link className="btn btn-sm" to={dietImport(clientId)}>{PASTE_A_PLAN}</Link>
        </p>
      )}

      <div className="field">
        <label htmlFor="plan-name">What to call this plan</label>
        <input
          id="plan-name"
          type="text"
          autoComplete="off"
          value={draft.name}
          disabled={busy}
          onChange={(event) => onDraft({ ...draft, name: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="plan-source">Who wrote it</label>
        <input
          id="plan-source"
          type="text"
          autoComplete="off"
          value={draft.sourceNote}
          disabled={busy}
          onChange={(event) => onDraft({ ...draft, sourceNote: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="plan-notes">Notes on the plan</label>
        <textarea
          id="plan-notes"
          value={draft.notes}
          disabled={busy}
          onChange={(event) => onDraft({ ...draft, notes: event.target.value })}
        />
      </div>

      <p className="muted read">{report.coverWords}</p>

      {/* WHAT THE PLAN SAYS NOTHING ABOUT, NAMED — the same honesty the read screen keeps, for the
          same reason: an absent day reads as a fast day just as easily as it reads as silence. */}
      {report.untouchedWords !== null && (
        <p className="note read">
          <Glyph name="filter" size="inline" decorative />
          <span>{report.untouchedWords}</span>
        </p>
      )}

      {/* MEALS HE HAS WRITTEN AND TICKED FOR NO DAY. They will not be saved, so they are named —
          what he typed and cannot find later is how a plan is lost with nobody noticing. */}
      {report.unplacedWords !== null && (
        <p className="note note-warning read" role="status">
          <Glyph name="note" size="inline" decorative />
          <span>{report.unplacedWords}</span>
        </p>
      )}

      {report.emptyWords !== null && <p className="read">{report.emptyWords}</p>}

      <ul className="rows rows-boxed">
        {report.rows.map((row) => (
          <MealPanel key={row.id} row={row} draft={draft} onDraft={onDraft} disabled={busy} />
        ))}
      </ul>

      <div className="inline">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onDraft(addMeal(draft))}
        >
          <Glyph name="add" size="inline" decorative />
          <span>{ADD_MEAL}</span>
        </button>
      </div>

      {report.rows.length > 0 && <CopyDay draft={draft} onDraft={onDraft} disabled={busy} />}

      {/* THE WEEK AS IT STANDS. The same component, the same classes and the same projection as the
          read screen and the import preview — one week grid in this application, not three. */}
      {!preview.is_empty && (
        <>
          <h4 className="title-block">The week as it stands</h4>
          <WeekChart chart={preview} caption="The plan you are writing" />
        </>
      )}

      <div className="inline">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
          <Glyph name="add" size="inline" decorative />
          <span>{report.saveWords}</span>
        </button>

        {/* MAKING A PLAN CURRENT IS AN EXPLICIT ACT AND IS NEVER A CONSEQUENCE OF SAVING. It only
            appears on a plan that exists, because there is nothing to make current until there is. */}
        {onMakeCurrent !== null && (
          <button type="button" className="btn" disabled={busy} onClick={onMakeCurrent}>
            <Glyph name="session-finish" size="inline" decorative />
            <span>{MAKE_CURRENT}</span>
          </button>
        )}
      </div>

      {onMakeCurrent !== null && <p className="muted read">{MAKE_CURRENT_WORDS}</p>}

      {saved !== null && (
        <p className="note read" role="status">
          <Glyph name="nav-diet" size="inline" decorative />
          <span>{saved}</span>
        </p>
      )}

      {/*
        WHY THIS IS THE RECORD TALKING AND NOT THIS SCREEN. Every sentence below was written by
        `core/model/entities/diet-plan.js`. It is passed through untouched; only the LABEL in front
        of it belongs to this application, and the label names the day and the meal he was typing in
        rather than the path a machine uses. A reworded refusal would be a second sentence about a
        rule the record already stated, drifting from it the moment either is edited.
      */}
      {refusal !== null && (
        <section className="stack" role="alert">
          <p className="note note-danger read">
            <Glyph name="sync-failed" size="inline" decorative />
            <span>{refusal.headline}</span>
          </p>

          {refusal.fields.length > 0 && (
            <dl className="pairs">
              {refusal.fields.map((field) => (
                <Fragment key={`${field.path}:${field.code}`}>
                  <dt className="pair-label">{field.label}</dt>
                  <dd className="pair-value read">{field.message}</dd>
                </Fragment>
              ))}
            </dl>
          )}

          {refusal.verbatim !== null && (
            <blockquote className="note read">
              <span>{refusal.verbatim}</span>
            </blockquote>
          )}
        </section>
      )}
    </section>
  );
}


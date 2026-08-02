/**
 * THE ROUTINES — the weekly split the coach trains from, and the form that builds or changes one.
 *
 * This file is the DRAWING and nothing else. Every judgement — what an empty list says, how a routine
 * is summarised, what an entry row reads as when it overrides nothing, which words go on a refusal,
 * what a removal asks and when it may not proceed — is decided in `library-routines.ts`, and every
 * read and write is in `library-routines-source.ts`. The same split as the exercise half beside it.
 *
 * ## THE ORDER IS A DEFAULT AND THE CONTROLS SAY SO
 *
 * `entities/routine.js`: the order is the routine's default and NOT a script — he jumps, skips,
 * repeats and substitutes mid-session, and the intensity adapter reorders it too. So these controls
 * are labelled as changing what he is shown first, never as scheduling anything.
 *
 * ## AN ENTRY OPENS THE EXERCISE. IT DOES NOT RESTATE IT.
 *
 * The three intensity points belong to the exercise and have an editor already. Every entry row
 * carries a control that opens THAT editor on THAT exercise, and this form has no scaling boxes at
 * all. A second place to set the same three values would be a second idea of one truth.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Glyph } from '../design/Glyph';
import { BODY_REGIONS, ROUTINE_FOCUS } from '../../core/model/model.js';
import { vocabularyWords } from './library-editor';
import type { RefusalReport } from './library-editor';
import {
  ADD_ENTRY_BUTTON, ADD_ROUTINE_BUTTON, ADD_ROUTINE_TITLE, CANCEL_ROUTINE_BUTTON,
  EDIT_ROUTINE_TITLE, OVERRIDE_HINT, ROUTINE_FIELD_LABELS, SAVE_ROUTINE_BUTTON,
  SCALING_LIVES_ON_THE_EXERCISE, SPLIT_DAY_HINT, addEntry, describeRoutineRefusal,
  describeRoutineRemoval, describeRoutines, draftFromRoutine, emptyRoutineDraft, moveEntry,
  openExerciseLabel, removeEntry, replaceEntry, routineContent, routineRemovedWords,
  routineSavedWords,
} from './library-routines';
import type {
  EntryDraft, EntryLine, ExerciseChoices, RoutineDraft, RoutinePage, RoutineRemoval, RoutineSummary,
} from './library-routines';
import { NO_CHOICES } from './library-routines';
import {
  addRoutine, appendRoutinePage, readExerciseChoices, readRoutinePage,
  readRoutines, removeRoutine, saveRoutine, sessionsUsing,
} from './library-routines-source';
import type { LocalStore } from '../../core/store/store.js';

/** The split is a POSITION in his week, one to seven. The record's own range, not a weekday list. */
const SPLIT_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/** The page on screen, and which store and which filter it was read with. */
interface Shown {
  readonly from: LocalStore;
  readonly search: string;
  readonly page: RoutinePage;
  /** How many the library holds, not how many are on the page. See `describeRoutines`. */
  readonly total: number;
}

/** Which routine the form is for: a new one, or one already in the library. */
interface Editing {
  readonly recordId: string;
  readonly rev: number;
  readonly contentKey: string;
  readonly name: string;
}

/** One entry as a row of the form: which exercise, what this routine overrides, and where it sits. */
function EntryFields({
  index, entry, choices, canMoveUp, canMoveDown, busy, onChange, onMove, onRemove, onOpenExercise,
}: {
  index: number;
  entry: EntryDraft;
  choices: ExerciseChoices;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onChange: (next: EntryDraft) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onOpenExercise: (contentKey: string) => void;
}) {
  const chosen = choices.byKey.get(entry.exerciseId);
  const position = index + 1;
  const amountHint = chosen === undefined
    ? 'Choose the exercise first.'
    : (chosen.measurement === 'time'
      ? 'Seconds each set is held or worked for.'
      : 'Repetitions in each set.');

  return (
    <fieldset className="stack-tight" aria-label={`Exercise ${String(position)} in this routine`}>
      <legend className="title-section">{`Exercise ${String(position)}`}</legend>

      <div className="field">
        <label htmlFor={`entry-${String(index)}-exercise`}>{ROUTINE_FIELD_LABELS.entryExercise}</label>
        <select
          id={`entry-${String(index)}-exercise`}
          value={entry.exerciseId}
          onChange={(event) => onChange({ ...entry, exerciseId: event.target.value })}
        >
          <option value="">Choose one</option>
          {choices.all.map((choice) => (
            <option value={choice.contentKey} key={choice.contentKey}>{choice.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`entry-${String(index)}-sets`}>{ROUTINE_FIELD_LABELS.entrySets}</label>
        <input
          id={`entry-${String(index)}-sets`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={entry.sets}
          onChange={(event) => onChange({ ...entry, sets: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor={`entry-${String(index)}-amount`}>{ROUTINE_FIELD_LABELS.entryAmount}</label>
        <input
          id={`entry-${String(index)}-amount`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={`entry-${String(index)}-amount-hint`}
          value={entry.amount}
          onChange={(event) => onChange({ ...entry, amount: event.target.value })}
        />
        <p id={`entry-${String(index)}-amount-hint`} className="muted read">{amountHint}</p>
      </div>

      <div className="field">
        <label htmlFor={`entry-${String(index)}-rest`}>{ROUTINE_FIELD_LABELS.entryRest}</label>
        <input
          id={`entry-${String(index)}-rest`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={entry.rest}
          onChange={(event) => onChange({ ...entry, rest: event.target.value })}
        />
      </div>

      <div className="inline">
        {/* MOVING IS DRAWN ONLY WHERE IT MEANS SOMETHING. A disabled "up" on the first line is a
            control offering an act the form has already decided against. */}
        {canMoveUp && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={`Show exercise ${String(position)} earlier in this routine`}
            disabled={busy}
            onClick={() => onMove(-1)}
          >
            Move up
          </button>
        )}
        {canMoveDown && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={`Show exercise ${String(position)} later in this routine`}
            disabled={busy}
            onClick={() => onMove(1)}
          >
            Move down
          </button>
        )}
        {chosen !== undefined && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={openExerciseLabel(chosen.name)}
            disabled={busy}
            onClick={() => onOpenExercise(chosen.contentKey)}
          >
            <Glyph name="edit" size="inline" decorative />
            {`Open ${chosen.name}`}
          </button>
        )}
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Take exercise ${String(position)} out of this routine`}
          disabled={busy}
          onClick={onRemove}
        >
          <Glyph name="delete" size="inline" decorative />
          Take it out
        </button>
      </div>
    </fieldset>
  );
}

/** One entry of a SAVED routine, as a line on the list. It reports; it does not act. */
function EntryLineRow({ line }: { line: EntryLine }) {
  return (
    <li className="row row-static row-wrap">
      <span className="row-value nowrap">{String(line.position)}</span>
      <span className="row-name">{line.exerciseName}</span>
      {line.inherited
        ? <span className="chip">Follows the exercise</span>
        : <span className="chip">This routine changes it</span>}
      <span className="row-value">{line.prescription}</span>
    </li>
  );
}

/** One routine, as a row with its exercises under it. */
function RoutineRow({
  routine, busy, onEdit, onRemove,
}: {
  routine: RoutineSummary;
  busy: boolean;
  onEdit: (routine: RoutineSummary) => void;
  onRemove: (routine: RoutineSummary) => void;
}) {
  return (
    <li className="row row-static row-wrap">
      <span className="row-name">{routine.name}</span>
      <span className="chip">{routine.provenanceWord}</span>
      <span className="chip">{routine.day}</span>
      <span className="chip">{routine.focus}</span>
      <span className="row-value nowrap">{routine.size}</span>

      <span className="row-actions">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Change ${routine.name}`}
          disabled={busy}
          onClick={() => onEdit(routine)}
        >
          <Glyph name="edit" size="inline" decorative />
          Change
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Remove ${routine.name}`}
          disabled={busy}
          onClick={() => onRemove(routine)}
        >
          <Glyph name="delete" size="inline" decorative />
          Remove
        </button>
      </span>

      <details className="disclose">
        <summary>
          {ROUTINE_FIELD_LABELS.entries}
          <span className="count">{routine.entries.length}</span>
        </summary>
        <div className="card-body">
          <p className="muted read">{routine.description}</p>
          <ul className="stack-tight">
            {routine.entries.map((line) => (
              <EntryLineRow key={`${String(line.position)}-${line.exerciseKey}`} line={line} />
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

/**
 * THE REMOVAL CONFIRMATION, with two shapes because there are two answers.
 *
 * A routine some session has already run draws NO confirming control at all — the sessions are named
 * instead, so what he can do about it is on the screen rather than left for him to find.
 */
function RoutineRemovalPanel({
  confirmation, busy, onConfirm, onCancel,
}: {
  confirmation: RoutineRemoval;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card card-tight" aria-labelledby="routine-removal-confirm">
      <div className="card-header">
        <h3 id="routine-removal-confirm" className="title-section">{confirmation.title}</h3>
      </div>
      <div className="card-body stack">
        <p className="read">{confirmation.whatWillHappen}</p>

        {confirmation.usedBy.length > 0 && (
          <ul className="stack-tight">
            {confirmation.usedBy.map((session) => (
              <li className="row row-static" key={session}>
                <span className="row-name">{session}</span>
              </li>
            ))}
          </ul>
        )}

        {/* The safe choice is first and prominent — the opposite of the arrangement that makes
            "yes" the reflex. */}
        <div className="inline">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onCancel}>
            {confirmation.cancelLabel}
          </button>
          {confirmation.allowed && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
              <Glyph name="delete" size="inline" decorative />
              {confirmation.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * @param libraryVersion bumped by the screen after every EXERCISE write, so the catalogue behind the
 * entry rows follows a rename instead of going on offering the old name until a reload.
 * @param onOpenExercise the reachability hop — the screen opens its own exercise form on that key.
 */
export function LibraryRoutines({
  store, libraryVersion, onOpenExercise,
}: {
  store: LocalStore;
  libraryVersion: number;
  onOpenExercise: (contentKey: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [reloads, setReloads] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [choices, setChoices] = useState<ExerciseChoices>(NO_CHOICES);

  const [draft, setDraft] = useState<RoutineDraft>(() => emptyRoutineDraft());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<RefusalReport | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<
    { routine: RoutineSummary; confirmation: RoutineRemoval } | null
  >(null);
  const [removing, setRemoving] = useState(false);

  // THE SEARCH IS NOT BOUND TO A PAGE. `readRoutines` filters over the collection, so a routine that
  // sorts onto page two is found rather than reported absent by a screen whose uniqueness guard
  // would then refuse to let him create it.
  useEffect(() => readRoutines(store, search, (readout) =>
    setShown({ from: store, search, page: readout.page, total: readout.total })),
  [store, search, reloads]);

  useEffect(() => {
    let live = true;
    void readExerciseChoices(store).then(
      (read) => {
        if (live) setChoices(read);
      },
      (error: unknown) => console.error('[library] the exercise catalogue could not be read', error),
    );
    return () => {
      live = false;
    };
  }, [store, libraryVersion, reloads]);

  const showMore = useCallback(() => {
    if (shown === null || shown.page.cursor === null) return;
    const after = shown.page.cursor;

    void readRoutinePage(store, { search, after }).then(
      (next) => setShown((held) =>
        (held === null || held.from !== store || held.search !== search
          ? held
          : { ...held, page: appendRoutinePage(held.page, next) })),
      (error: unknown) => console.error('[library] the next page of routines could not be read', error),
    );
  }, [store, shown, search]);

  const startAdding = useCallback(() => {
    setEditing(null);
    setDraft(emptyRoutineDraft());
    setRefusal(null);
    setOutcome(null);
  }, []);

  const startEditing = useCallback((routine: RoutineSummary) => {
    if (shown === null) return;
    const record = shown.page.items.find((held) => held.record_id === routine.recordId);
    if (record === undefined) return;

    setEditing({
      recordId: routine.recordId,
      rev: routine.rev,
      contentKey: routine.contentKey,
      name: routine.name,
    });
    setDraft(draftFromRoutine(record));
    setRefusal(null);
    setOutcome(null);
  }, [shown]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) return;

      setSaving(true);
      setRefusal(null);
      setOutcome(null);

      const content = routineContent(draft, choices, editing?.contentKey ?? null);

      try {
        const saved = editing === null
          ? await addRoutine(store, content)
          : await saveRoutine(store, editing.recordId, content, editing.rev);
        // Only now: the write COMMITTED.
        setOutcome(routineSavedWords(saved.content.name, editing === null));
        setEditing(null);
        setDraft(emptyRoutineDraft());
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        setRefusal(describeRoutineRefusal(error));
      } finally {
        setSaving(false);
      }
    },
    [store, draft, choices, editing, saving],
  );

  /** Ask what has already run it BEFORE offering to remove it, so he is told rather than refused. */
  const askToRemove = useCallback(
    async (routine: RoutineSummary) => {
      setOutcome(null);
      setRefusal(null);
      try {
        const usedBy = await sessionsUsing(store, routine.contentKey);
        setConfirming({ routine, confirmation: describeRoutineRemoval(routine, usedBy) });
      } catch (error: unknown) {
        setRefusal(describeRoutineRefusal(error));
      }
    },
    [store],
  );

  const confirmRemoval = useCallback(async () => {
    if (confirming === null || removing) return;

    setRemoving(true);
    try {
      await removeRoutine(store, confirming.routine.recordId, confirming.routine.rev);
      setOutcome(routineRemovedWords(confirming.routine.name));
      setConfirming(null);
      if (editing?.recordId === confirming.routine.recordId) {
        setEditing(null);
        setDraft(emptyRoutineDraft());
      }
      setReloads((count) => count + 1);
    } catch (error: unknown) {
      setRefusal(describeRoutineRefusal(error));
    } finally {
      setRemoving(false);
    }
  }, [store, confirming, removing, editing]);

  const report = shown === null
    ? null
    : describeRoutines({
      page: shown.page, search: shown.search, choices, total: shown.total,
    });

  const busy = saving || removing;

  return (
    <>
      <section className="card card-tight" aria-labelledby="library-routines">
        <div className="card-header">
          <h3 id="library-routines" className="title-section">Routines</h3>
          <span className="spacer" />
          {report !== null && <span className="chip">{report.count}</span>}
        </div>

        <div className="card-body stack">
          <div className="field">
            <label htmlFor="routine-search">Find a routine</label>
            <input
              id="routine-search"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {outcome !== null && (
            <p className="note read" aria-live="polite">
              <Glyph name="note" size="inline" decorative />
              <span>{outcome}</span>
            </p>
          )}

          {report !== null && (
            <>
              <p className="read">{report.intro}</p>

              {!report.empty && (
                <ul className="stack-tight">
                  {report.items.map((routine) => (
                    <RoutineRow
                      key={routine.recordId}
                      routine={routine}
                      busy={busy}
                      onEdit={startEditing}
                      onRemove={(chosen) => void askToRemove(chosen)}
                    />
                  ))}
                </ul>
              )}

              {report.moreWords !== null && (
                <>
                  <p className="muted read">{report.moreWords}</p>
                  <p>
                    <button type="button" className="btn btn-quiet" onClick={showMore}>
                      Show more
                    </button>
                  </p>
                </>
              )}
            </>
          )}

          {confirming !== null && (
            <RoutineRemovalPanel
              confirmation={confirming.confirmation}
              busy={removing}
              onConfirm={() => void confirmRemoval()}
              onCancel={() => setConfirming(null)}
            />
          )}
        </div>
      </section>

      <section className="card stack" aria-labelledby="library-routine-form">
        <div className="inline">
          <h3 id="library-routine-form" className="title-section">
            {editing === null ? ADD_ROUTINE_TITLE : EDIT_ROUTINE_TITLE}
          </h3>
          <span className="spacer" />
          {editing !== null && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={startAdding}>
              {CANCEL_ROUTINE_BUTTON}
            </button>
          )}
        </div>

        {editing !== null && <p className="read">{`You are changing ${editing.name}.`}</p>}

        {/* THE CATALOGUE STOPPED SHORT. Said rather than swallowed: a picker that quietly holds
            only part of his library would look complete and be missing the exercise he wants. */}
        {!choices.whole && choices.all.length > 0 && (
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>
              {`Showing ${String(choices.all.length)} of your exercises; the list stopped short of `
                + 'the end.'}
            </span>
          </p>
        )}

        {refusal !== null && (
          <div className="note note-danger read" aria-live="polite">
            <Glyph name="sync-failed" size="inline" decorative />
            <div className="stack-tight">
              <strong>{refusal.headline}</strong>
              {refusal.fields.map((field) => (
                <span key={`${field.path}-${field.code}`}>{`${field.label}: ${field.message}`}</span>
              ))}
              {refusal.verbatim !== null && <span>{refusal.verbatim}</span>}
            </div>
          </div>
        )}

        <form className="stack" onSubmit={(event) => void submit(event)}>
          <div className="field">
            <label htmlFor="routine-name">{ROUTINE_FIELD_LABELS.name}</label>
            <input
              id="routine-name"
              type="text"
              autoComplete="off"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="routine-split-day">{ROUTINE_FIELD_LABELS.splitDay}</label>
            <select
              id="routine-split-day"
              aria-describedby="routine-split-day-hint"
              value={draft.splitDay}
              onChange={(event) => setDraft({ ...draft, splitDay: event.target.value })}
            >
              <option value="">Choose one</option>
              {SPLIT_DAYS.map((day) => (
                <option value={String(day)} key={day}>{`Day ${String(day)}`}</option>
              ))}
            </select>
            <p id="routine-split-day-hint" className="muted read">{SPLIT_DAY_HINT}</p>
          </div>

          <div className="field">
            <label htmlFor="routine-focus">{ROUTINE_FIELD_LABELS.focus}</label>
            <select
              id="routine-focus"
              value={draft.focus}
              onChange={(event) => setDraft({ ...draft, focus: event.target.value })}
            >
              <option value="">Choose one</option>
              {ROUTINE_FOCUS.map((focus: string) => (
                <option value={focus} key={focus}>{vocabularyWords(focus)}</option>
              ))}
            </select>
          </div>

          <fieldset className="stack-tight" aria-label={ROUTINE_FIELD_LABELS.bodyRegions}>
            <legend className="title-section">{ROUTINE_FIELD_LABELS.bodyRegions}</legend>
            {BODY_REGIONS.map((region: string) => (
              <label className="inline" key={region} htmlFor={`routine-region-${region}`}>
                <input
                  id={`routine-region-${region}`}
                  type="checkbox"
                  checked={draft.bodyRegions.includes(region)}
                  onChange={() => setDraft({
                    ...draft,
                    bodyRegions: draft.bodyRegions.includes(region)
                      ? draft.bodyRegions.filter((held) => held !== region)
                      : [...draft.bodyRegions, region],
                  })}
                />
                <span>{vocabularyWords(region)}</span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="routine-description">{ROUTINE_FIELD_LABELS.description}</label>
            <textarea
              id="routine-description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>

          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{OVERRIDE_HINT}</span>
          </p>

          {draft.entries.map((entry, index) => (
            <EntryFields
              // eslint-disable-next-line react/no-array-index-key
              key={`entry-${String(index)}`}
              index={index}
              entry={entry}
              choices={choices}
              canMoveUp={index > 0}
              canMoveDown={index < draft.entries.length - 1}
              busy={busy}
              onChange={(next) => setDraft(replaceEntry(draft, index, next))}
              onMove={(delta) => setDraft(moveEntry(draft, index, delta))}
              onRemove={() => setDraft(removeEntry(draft, index))}
              onOpenExercise={onOpenExercise}
            />
          ))}

          <p>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => setDraft(addEntry(draft))}
            >
              <Glyph name="add" size="inline" decorative />
              {ADD_ENTRY_BUTTON}
            </button>
          </p>

          <p className="muted read">{SCALING_LIVES_ON_THE_EXERCISE}</p>

          <p>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Glyph name={editing === null ? 'add' : 'edit'} size="inline" decorative />
              <span>{editing === null ? ADD_ROUTINE_BUTTON : SAVE_ROUTINE_BUTTON}</span>
            </button>
          </p>
        </form>
      </section>
    </>
  );
}

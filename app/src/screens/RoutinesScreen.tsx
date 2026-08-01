/**
 * THE LIBRARY — the exercises the coach trains from, and the form that adds or changes one.
 *
 * This file is the DRAWING and nothing else. Every judgement — what an empty library says, how an
 * exercise is summarised, which words go on a refusal, what a removal asks and when it may not
 * proceed — is decided in `library-editor.ts`, and every read and write is in
 * `library-editor-source.ts`, where each can be asserted with no browser and no rendering at all.
 * The same split as `clients.ts` and `ClientsScreen.tsx`, which is the pattern this screen copies.
 *
 * ## THIS IS THE SCREEN THE EMPTY-LIBRARY MESSAGE HAS BEEN POINTING AT
 *
 * The Routines destination has been live in the navigation since the shell was built, and its screen
 * was `PlaceholderScreen`. Two defensible things composed into a dead end: an empty routine list
 * politely told the coach to build a routine under Routines, and Routines could not help him. This
 * is the screen that makes that instruction true.
 *
 * `no-dead-ends.test.ts` cannot tell that it landed, and that is not a gap in it: it proves a
 * destination RESOLVES, RENDERS and SAYS WHICH DESTINATION IT IS, and the placeholder satisfies all
 * three by design, because naming its own destination is its entire job. So the assertion that this
 * screen is what the address reaches lives in `library-editor.test.ts`, reading the shipped
 * `ROUTE_TABLE` through react-router's own matcher.
 *
 * ## NO WEIGHT BOX, AND IT IS EXPLAINED RATHER THAN LEFT AS AN ABSENCE
 *
 * The record refuses any field that looks like a load, and the reason is a recorded decision: load is
 * the coach's per-client judgement, made for the person in front of him, and a shipped library
 * carrying weights would be prescribing numbers for people it has never seen. Unexplained, the
 * missing box reads as an oversight, and the natural response to an oversight is to type the weight
 * into the coaching cue where nothing can ever use it. So it is said, once, where he would look for
 * it — see `NO_LOAD_HERE`.
 *
 * ## THE THREE INTENSITY POINTS ARE WHERE THE CONTENT CONTRACT LIVES
 *
 * A harder point asks for more work and less rest, never more load. That rule belongs to
 * `core/model/entities/exercise.js` and is enforced there, on every save, for the life of the
 * installation. This screen does not check it a second time — it says it before he types, and shows
 * the record's own sentence when the record refuses. A screen that pre-validated would be a second
 * copy of the contract, and the copy is the thing that cannot be wrong.
 *
 * ## THE LONG VOCABULARIES FOLD, AND THE FOLD IS COUNTED
 *
 * Twenty-six muscle groups and twenty-nine pieces of equipment cannot all be on screen at once
 * without burying the four fields that identify the exercise. They fold into disclosures whose
 * summaries carry what he has chosen, so nothing is hidden — the dense-screen rule is hierarchy and
 * progressive disclosure, never discarding, and a fold that does not say what is inside it is the
 * discarding it exists to avoid.
 *
 * ## REMOVAL IS A PANEL IN THE FLOW, NOT A MODAL
 *
 * `console.css` holds the ruling: a modal gets dismissed reflexively, which makes the important
 * message the one least likely to land. And the panel has TWO shapes, because there are two answers:
 * an exercise nothing points at asks a plain question, and one a routine is still using is refused
 * with the routines named, since removing it would leave that routine pointing at nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Glyph } from '../design/Glyph';
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import type { Destination } from '../shell/navigation';
import {
  EQUIPMENT, INTENSITY_LEVELS, MEASUREMENTS, MOVEMENT_PATTERNS, MUSCLE_GROUPS,
} from '../../core/model/model.js';
import {
  ADD_BUTTON, ADD_FORM_TITLE, CANCEL_BUTTON, EDIT_FORM_TITLE, FIELD_LABELS, NAME_HINT,
  NO_LOAD_HERE, SAVE_BUTTON, SCALING_CONTRACT_HINT, amountHint, describeContractNotice,
  describeExerciseRefusal, describeLibrary, describeRemoval, draftFromExercise, emptyExerciseDraft,
  exerciseContent, removedWords, savedWords, vocabularyWords,
} from './library-editor';
import type {
  ContractNotice, ExerciseDraft, ExerciseSummary, LibraryPage, PointDraft, RefusalReport,
  RemovalConfirmation,
} from './library-editor';
import {
  addExercise, appendPage, readLibrary, readLibraryPage, removeExercise, routinesUsing,
  saveExercise,
} from './library-editor-source';
import { LibraryRoutines } from './LibraryRoutines';
import { LibraryPatterns } from './LibraryPatterns';
import { exerciseGoneWords } from './library-routines';
import { readExerciseByKey } from './library-routines-source';
import type { LocalStore } from '../../core/store/store.js';

/** The record model's own levels, in its own order. Never a list written beside it. */
const LEVELS: readonly string[] = INTENSITY_LEVELS;

/**
 * The page on screen, and WHICH store and which filter it was read with.
 *
 * Both are carried so a stale page can be discarded during render rather than by an effect whose
 * only job is to reset state — the same reason the register carries the store its page came from.
 */
interface Shown {
  readonly from: LocalStore;
  readonly search: string;
  readonly page: LibraryPage;
  /** How many the library holds, not how many are on the page. See `describeLibrary`. */
  readonly total: number;
}

/** Which exercise the form is for: a new one, or one already in the library. */
interface Editing {
  readonly recordId: string;
  readonly rev: number;
  readonly contentKey: string;
  readonly name: string;
}

/** A closed vocabulary as a set of boxes, folded, with what he has chosen on the summary. */
function VocabularyChoice({
  id, label, options, chosen, onChange,
}: {
  id: string;
  label: string;
  options: readonly string[];
  chosen: readonly string[];
  onChange: (next: readonly string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(chosen.includes(value) ? chosen.filter((held) => held !== value) : [...chosen, value]);
  };

  return (
    <details className="disclose">
      <summary>
        {label}
        {/* WHAT IS FOLDED IS STILL ACCOUNTED FOR. A count of nought is a real answer and is shown as
            one, because a summary with nothing on it reads as a control that failed to load. */}
        <span className="count">{chosen.length}</span>
      </summary>
      <div className="card-body">
        <fieldset className="stack-tight" aria-label={label}>
          {options.map((value) => (
            <label className="inline" key={value} htmlFor={`${id}-${value}`}>
              <input
                id={`${id}-${value}`}
                type="checkbox"
                checked={chosen.includes(value)}
                onChange={() => toggle(value)}
              />
              <span>{vocabularyWords(value)}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}

/** One of the three intensity points. Three boxes, in the order the contract reads them. */
function PointFields({
  level, point, measurement, onChange,
}: {
  level: string;
  point: PointDraft;
  measurement: string;
  onChange: (next: PointDraft) => void;
}) {
  return (
    <fieldset className="stack-tight" aria-label={`${vocabularyWords(level)} point`}>
      <legend className="title-section">{vocabularyWords(level)}</legend>

      <div className="field">
        <label htmlFor={`point-${level}-sets`}>{FIELD_LABELS.defaultSets}</label>
        <input
          id={`point-${level}-sets`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={point.sets}
          onChange={(event) => onChange({ ...point, sets: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor={`point-${level}-amount`}>{FIELD_LABELS.defaultAmount}</label>
        <input
          id={`point-${level}-amount`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={`point-${level}-amount-hint`}
          value={point.amount}
          onChange={(event) => onChange({ ...point, amount: event.target.value })}
        />
        <p id={`point-${level}-amount-hint`} className="muted read">{amountHint(measurement)}</p>
      </div>

      <div className="field">
        <label htmlFor={`point-${level}-rest`}>Rest after each set</label>
        <input
          id={`point-${level}-rest`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={point.rest}
          onChange={(event) => onChange({ ...point, rest: event.target.value })}
        />
      </div>
    </fieldset>
  );
}

/** One exercise, as a row. The row REPORTS; the two controls on it are the things that act. */
/**
 * WHAT THE CONTRACT NOTICED, DRAWN AND NOT DECIDED HERE.
 *
 * Every word comes from `describeContractNotice`; this draws them. It is a NOTE and not an error
 * band: the user settled that a ladder he means to set stands, so the app says what it noticed and
 * gets out of the way. `aria-live="polite"` because it appears and disappears as he types, and a
 * screen reader that never mentions it would leave him with no warning at all.
 *
 * One line per offending point, each naming the point. They are deliberately NOT joined into a
 * sentence: three findings collapsed into one line is the "check your values" warning this exists
 * instead of.
 */
function ContractNoticePanel({ notice }: { notice: ContractNotice }) {
  return (
    <div className="note stack-tight" aria-live="polite">
      <p className="read">
        <Glyph name="note" size="inline" decorative />
        <span>{notice.title}</span>
      </p>
      <ul className="stack-tight">
        {notice.points.map((point) => (
          <li className="row row-static row-wrap" key={`${String(point.level)}-${point.message}`}>
            <span className="row-name">{point.label}</span>
            <span className="row-sentence">{point.message}</span>
          </li>
        ))}
      </ul>
      <p className="muted read">{notice.closing}</p>
    </div>
  );
}

function ExerciseRow({
  exercise, busy, onEdit, onRemove,
}: {
  exercise: ExerciseSummary;
  busy: boolean;
  onEdit: (exercise: ExerciseSummary) => void;
  onRemove: (exercise: ExerciseSummary) => void;
}) {
  return (
    <li className="row row-static row-wrap">
      <span className="row-name">{exercise.name}</span>

      {/* The WORD carries where it came from, never a tone on its own. It is what tells him which of
          these the admin reset would put back and which are his. */}
      <span className="chip">{exercise.provenanceWord}</span>
      <span className="chip">{exercise.movement}</span>
      <span className="row-value nowrap">{exercise.prescription}</span>

      <span className="row-actions">
        {/* The accessible name says WHICH exercise: a list of ninety-nine rows otherwise offers
            ninety-nine controls announcing the identical sentence. */}
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Change ${exercise.name}`}
          disabled={busy}
          onClick={() => onEdit(exercise)}
        >
          <Glyph name="edit" size="inline" decorative />
          Change
        </button>

        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Remove ${exercise.name}`}
          disabled={busy}
          onClick={() => onRemove(exercise)}
        >
          <Glyph name="delete" size="inline" decorative />
          Remove
        </button>
      </span>

      {/* THE CONTRACT'S NOTICE, STILL HERE WHEN HE COMES BACK. He was told when he saved and he
          saved anyway, which is his right — but a warning that lives only in the moment of saving
          is one he never sees again, and the ladder goes on shaping every session from then on.
          Quiet: the row's own voice, no tone of its own, and nothing that escalates anywhere. */}
      {exercise.contractNotice !== null && (
        <span className="row-sentence muted">{exercise.contractNotice}</span>
      )}
    </li>
  );
}

/**
 * THE REMOVAL CONFIRMATION, and it has two shapes because there are two answers.
 *
 * When a routine is still using the exercise there is NO confirming control at all. A disabled
 * button, or one that refuses when pressed, would be the app inviting an act it has already decided
 * against; the routines are named instead, so what he has to do next is on the screen.
 */
function RemovalPanel({
  confirmation, busy, onConfirm, onCancel,
}: {
  confirmation: RemovalConfirmation;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card card-tight" aria-labelledby="library-removal-confirm">
      <div className="card-header">
        <h3 id="library-removal-confirm" className="title-section">{confirmation.title}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{confirmation.whatWillHappen}</p>

        {confirmation.usedBy.length > 0 && (
          <ul className="stack-tight">
            {confirmation.usedBy.map((routine) => (
              <li className="row row-static" key={routine}>
                <span className="row-name">{routine}</span>
              </li>
            ))}
          </ul>
        )}

        {/* The safe choice is first and it is the prominent one — the opposite of the arrangement
            that makes "yes" the reflex. */}
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

export function RoutinesScreen({ destination }: { destination: Destination }) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;

  const [search, setSearch] = useState('');
  // Bumped after every write, so the effect below reads the library again. The list must show him
  // what he just did; anything less is the screen lying about the one thing he came here to do.
  const [reloads, setReloads] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);

  const [draft, setDraft] = useState<ExerciseDraft>(() => emptyExerciseDraft(LEVELS));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<RefusalReport | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  // What the contract noticed about the exercise he just SAVED. Held beside the outcome rather than
  // folded into it, because it is one line per offending point and the outcome is one sentence.
  const [savedNotice, setSavedNotice] = useState<ContractNotice | null>(null);

  // Who he is being asked about, held BY NAME as well as by identity: the moment the removal commits
  // there is nothing left that could answer "which was that", and the sentence afterwards is owed
  // its name rather than a reference.
  const [confirming, setConfirming] = useState<
    { exercise: ExerciseSummary; confirmation: RemovalConfirmation } | null
  >(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (store === null) return undefined;
    // THE SEARCH IS NOT BOUND TO A PAGE. `readLibrary` filters over the collection, so an exercise
    // that sorts onto page two is found rather than reported absent by a screen whose uniqueness
    // guard would then refuse to let him create it.
    return readLibrary(store, search, (readout) =>
      setShown({ from: store, search, page: readout.page, total: readout.total }));
  }, [store, search, reloads]);

  const showMore = useCallback(() => {
    if (store === null || shown === null || shown.page.cursor === null) return;
    const after = shown.page.cursor;

    void readLibraryPage(store, { search, after }).then(
      (next) => setShown((held) =>
        (held === null || held.from !== store || held.search !== search
          ? held
          : { ...held, page: appendPage(held.page, next) })),
      (error: unknown) => console.error('[library] the next page could not be read', error),
    );
  }, [store, shown, search]);

  const startAdding = useCallback(() => {
    setEditing(null);
    setDraft(emptyExerciseDraft(LEVELS));
    setRefusal(null);
    setOutcome(null);
    setSavedNotice(null);
  }, []);

  const startEditing = useCallback((exercise: ExerciseSummary) => {
    if (shown === null) return;
    const record = shown.page.items.find((held) => held.record_id === exercise.recordId);
    if (record === undefined) return;

    setEditing({
      recordId: exercise.recordId,
      rev: exercise.rev,
      contentKey: exercise.contentKey,
      name: exercise.name,
    });
    setDraft(draftFromExercise(record, LEVELS));
    setRefusal(null);
    setOutcome(null);
    setSavedNotice(null);
  }, [shown]);

  /**
   * THE REACHABILITY HOP — a routine's entry opening THIS editor on the exercise it names.
   *
   * It reads the record off the store by content key rather than looking in the exercise page above,
   * and the difference is the whole point: the exercise a routine names is very often not on the
   * page he happens to be looking at, and a hop that only worked for the first twenty-five would
   * quietly send him to the routine form to type the three intensity points in again — which is the
   * second idea of one truth this action exists to avoid.
   */
  const openExerciseByKey = useCallback(
    async (contentKey: string) => {
      if (store === null) return;
      setRefusal(null);
      setOutcome(null);
    setSavedNotice(null);

      try {
        const record = await readExerciseByKey(store, contentKey);
        if (record === undefined) {
          setOutcome(exerciseGoneWords(contentKey));
          return;
        }
        setEditing({
          recordId: record.record_id,
          rev: record.rev,
          contentKey: record.content.id,
          name: record.content.name,
        });
        setDraft(draftFromExercise(record, LEVELS));
      } catch (error: unknown) {
        setRefusal(describeExerciseRefusal(error));
      }
    },
    [store],
  );

  /**
   * WHAT THE CONTRACT NOTICES ABOUT THE FORM AS IT STANDS.
   *
   * Derived on every render from the very content the save would send, so there is no second copy
   * of the rule and no state to go stale. A half-typed ladder produces nothing — the record's own
   * detector needs three complete points before an ordering can be true or false — which is why
   * this appears as he finishes rather than scolding him at the first empty box.
   */
  const draftNotice = describeContractNotice(
    exerciseContent(draft, LEVELS, editing?.contentKey ?? null),
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (store === null || saving) return;

      setSaving(true);
      setRefusal(null);
      setOutcome(null);
    setSavedNotice(null);

      const content = exerciseContent(draft, LEVELS, editing?.contentKey ?? null);

      try {
        const saved = editing === null
          ? await addExercise(store, content)
          : await saveExercise(store, editing.recordId, content, editing.rev);
        // Only now: the write COMMITTED, and nothing may be reported to him as saved before that.
        setOutcome(savedWords(saved.content.name, editing === null));
        // AT THE MOMENT HE SAVES, and read off what actually COMMITTED rather than off the draft
        // that was sent — the notice must describe the record he now has.
        setSavedNotice(describeContractNotice(saved.content));
        setEditing(null);
        setDraft(emptyExerciseDraft(LEVELS));
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        // Whatever the record refused, in the record's own words. Nothing is reworded here — and
        // this is the path the content contract reaches him by.
        setRefusal(describeExerciseRefusal(error));
      } finally {
        setSaving(false);
      }
    },
    [store, draft, editing, saving],
  );

  /** Ask what is using it BEFORE offering to remove it, so he is told rather than refused. */
  const askToRemove = useCallback(
    async (exercise: ExerciseSummary) => {
      if (store === null) return;
      setOutcome(null);
    setSavedNotice(null);
      setRefusal(null);

      try {
        const usedBy = await routinesUsing(store, exercise.contentKey);
        setConfirming({ exercise, confirmation: describeRemoval(exercise, usedBy) });
      } catch (error: unknown) {
        setRefusal(describeExerciseRefusal(error));
      }
    },
    [store],
  );

  const confirmRemoval = useCallback(async () => {
    if (store === null || confirming === null || removing) return;

    setRemoving(true);
    try {
      await removeExercise(store, confirming.exercise.recordId, confirming.exercise.rev);
      setOutcome(removedWords(confirming.exercise.name));
      setConfirming(null);
      // The form was open on the exercise that has just gone: it is closed rather than left holding
      // a record identity that no longer resolves.
      if (editing?.recordId === confirming.exercise.recordId) {
        setEditing(null);
        setDraft(emptyExerciseDraft(LEVELS));
      }
      setReloads((count) => count + 1);
    } catch (error: unknown) {
      setRefusal(describeExerciseRefusal(error));
    } finally {
      setRemoving(false);
    }
  }, [store, confirming, removing, editing]);

  const report = shown === null
    ? null
    : describeLibrary({ page: shown.page, search: shown.search, total: shown.total });

  const busy = saving || removing;

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby={`screen-${destination.path}`}>
        <div className="inline">
          {/* The same mark the rail carries, so arriving here confirms the tap landed where he
              aimed. Decorative: the heading beside it already says the word. */}
          <Glyph name={destination.glyph} size="lead" decorative />
          <h2 id={`screen-${destination.path}`} className="title-screen">{destination.label}</h2>
        </div>
        <p className="screen-intro">{destination.summary}</p>
      </section>

      <section className="card card-tight" aria-labelledby="library-exercises">
        <div className="card-header">
          <h3 id="library-exercises" className="title-section">Exercises</h3>
          <span className="spacer" />
          {report !== null && <span className="chip">{report.count}</span>}
        </div>

        <div className="card-body stack">
          {store === null ? (
            <LocalStoreNotice opening={opening} />
          ) : (
            <>
              <div className="field">
                <label htmlFor="library-search">Find an exercise</label>
                <input
                  id="library-search"
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

              {/* WHAT THE CONTRACT NOTICED ABOUT WHAT HE JUST SAVED — beside the sentence saying it
                  saved, because that is the moment. It is not a refusal: the record committed. */}
              {savedNotice !== null && <ContractNoticePanel notice={savedNotice} />}

              {report !== null && (
                <>
                  <p className="read">{report.intro}</p>

                  {!report.empty && (
                    <ul className="stack-tight">
                      {report.items.map((exercise) => (
                        <ExerciseRow
                          key={exercise.recordId}
                          exercise={exercise}
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
                <RemovalPanel
                  confirmation={confirming.confirmation}
                  busy={removing}
                  onConfirm={() => void confirmRemoval()}
                  onCancel={() => setConfirming(null)}
                />
              )}
            </>
          )}
        </div>
      </section>

      {store !== null && (
        <section className="card stack" aria-labelledby="library-exercise-form">
          <div className="inline">
            <h3 id="library-exercise-form" className="title-section">
              {editing === null ? ADD_FORM_TITLE : EDIT_FORM_TITLE}
            </h3>
            <span className="spacer" />
            {editing !== null && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={startAdding}>
                {CANCEL_BUTTON}
              </button>
            )}
          </div>

          {editing !== null && (
            <p className="read">{`You are changing ${editing.name}.`}</p>
          )}

          {refusal !== null && (
            <div className="note note-danger read" aria-live="polite">
              <Glyph name="sync-failed" size="inline" decorative />
              <div className="stack-tight">
                <strong>{refusal.headline}</strong>
                {refusal.fields.map((field) => (
                  <span key={`${field.path}-${field.code}`}>
                    {`${field.label}: ${field.message}`}
                  </span>
                ))}
                {/* The failure's own words, kept verbatim: he may have to read them out. */}
                {refusal.verbatim !== null && <span>{refusal.verbatim}</span>}
              </div>
            </div>
          )}

          <form className="stack" onSubmit={(event) => void submit(event)}>
            <div className="field">
              <label htmlFor="exercise-name">{FIELD_LABELS.name}</label>
              <input
                id="exercise-name"
                type="text"
                autoComplete="off"
                aria-describedby="exercise-name-hint"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <p id="exercise-name-hint" className="muted read">{NAME_HINT}</p>
            </div>

            <div className="field">
              <label htmlFor="exercise-long-name">{FIELD_LABELS.longName}</label>
              <input
                id="exercise-long-name"
                type="text"
                autoComplete="off"
                value={draft.longName}
                onChange={(event) => setDraft({ ...draft, longName: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="exercise-movement">{FIELD_LABELS.movementPattern}</label>
              <select
                id="exercise-movement"
                value={draft.movementPattern}
                onChange={(event) => setDraft({ ...draft, movementPattern: event.target.value })}
              >
                <option value="">Choose one</option>
                {MOVEMENT_PATTERNS.map((pattern: string) => (
                  <option value={pattern} key={pattern}>{vocabularyWords(pattern)}</option>
                ))}
              </select>
            </div>

            <VocabularyChoice
              id="exercise-primary-muscles"
              label={FIELD_LABELS.primaryMuscles}
              options={MUSCLE_GROUPS}
              chosen={draft.primaryMuscles}
              onChange={(next) => setDraft({ ...draft, primaryMuscles: next })}
            />

            <VocabularyChoice
              id="exercise-secondary-muscles"
              label={FIELD_LABELS.secondaryMuscles}
              options={MUSCLE_GROUPS}
              chosen={draft.secondaryMuscles}
              onChange={(next) => setDraft({ ...draft, secondaryMuscles: next })}
            />

            <VocabularyChoice
              id="exercise-equipment"
              label={FIELD_LABELS.equipment}
              options={EQUIPMENT}
              chosen={draft.equipment}
              onChange={(next) => setDraft({ ...draft, equipment: next })}
            />

            <div className="field">
              <label htmlFor="exercise-measurement">{FIELD_LABELS.measurement}</label>
              <select
                id="exercise-measurement"
                value={draft.measurement}
                onChange={(event) => setDraft({ ...draft, measurement: event.target.value })}
              >
                <option value="">Choose one</option>
                {MEASUREMENTS.map((measurement: string) => (
                  <option value={measurement} key={measurement}>
                    {vocabularyWords(measurement)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="exercise-intensity">{FIELD_LABELS.intensity}</label>
              <select
                id="exercise-intensity"
                value={draft.intensity}
                onChange={(event) => setDraft({ ...draft, intensity: event.target.value })}
              >
                <option value="">Choose one</option>
                {LEVELS.map((level) => (
                  <option value={level} key={level}>{vocabularyWords(level)}</option>
                ))}
              </select>
            </div>

            <fieldset className="stack-tight" aria-label="What it usually asks for">
              <legend className="title-section">What it usually asks for</legend>

              <div className="field">
                <label htmlFor="exercise-default-sets">{FIELD_LABELS.defaultSets}</label>
                <input
                  id="exercise-default-sets"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.defaultSets}
                  onChange={(event) => setDraft({ ...draft, defaultSets: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="exercise-default-amount">{FIELD_LABELS.defaultAmount}</label>
                <input
                  id="exercise-default-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby="exercise-default-amount-hint"
                  value={draft.defaultAmount}
                  onChange={(event) => setDraft({ ...draft, defaultAmount: event.target.value })}
                />
                <p id="exercise-default-amount-hint" className="muted read">
                  {amountHint(draft.measurement)}
                </p>
              </div>

              <div className="field">
                <label htmlFor="exercise-default-rest">{FIELD_LABELS.defaultRest}</label>
                <input
                  id="exercise-default-rest"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.defaultRest}
                  onChange={(event) => setDraft({ ...draft, defaultRest: event.target.value })}
                />
              </div>
            </fieldset>

            <label className="inline" htmlFor="exercise-hiit">
              <input
                id="exercise-hiit"
                type="checkbox"
                checked={draft.hiitSuitable}
                onChange={(event) => setDraft({ ...draft, hiitSuitable: event.target.checked })}
              />
              <span>{FIELD_LABELS.hiitSuitable}</span>
            </label>

            <div className="field">
              <label htmlFor="exercise-cue">{FIELD_LABELS.coachingCue}</label>
              <textarea
                id="exercise-cue"
                value={draft.coachingCue}
                onChange={(event) => setDraft({ ...draft, coachingCue: event.target.value })}
              />
            </div>

            {/* THE CONTRACT, SAID BEFORE HE TYPES. A plain note in the voice of the screen: nothing
                is wrong yet, and a warning band here would be one he stops seeing by the second
                week — which would take the sentence with it. */}
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{SCALING_CONTRACT_HINT}</span>
            </p>

            {LEVELS.map((level) => (
              <PointFields
                key={level}
                level={level}
                point={draft.scaling[level]}
                measurement={draft.measurement}
                onChange={(next) => setDraft({
                  ...draft,
                  scaling: { ...draft.scaling, [level]: next },
                })}
              />
            ))}

            {/* AND WHILE HE IS STILL TYPING. Derived from the draft through the record's own
                detector, so the form cannot disagree with what the record will say a moment later.
                It appears and disappears as he changes a figure, which is what makes it a notice
                about THIS point rather than a standing alarm. */}
            {draftNotice !== null && <ContractNoticePanel notice={draftNotice} />}

            <p className="muted read">{NO_LOAD_HERE}</p>

            <p>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Glyph name={editing === null ? 'add' : 'edit'} size="inline" decorative />
                <span>{editing === null ? ADD_BUTTON : SAVE_BUTTON}</span>
              </button>
            </p>
          </form>
        </section>
      )}

      {/* THE OTHER TWO LIBRARY KINDS, each its own section on this screen.
          They take the store rather than a reading, exactly as the exercise half does, and they
          decide none of their own words — `library-routines.ts` and `library-patterns.ts` do.
          `reloads` is handed to the routines panel as the version of the exercise catalogue: it is
          bumped by every exercise write above, so a renamed exercise reads correctly on the entry
          rows straight away instead of after a reload. */}
      {store !== null && (
        <LibraryRoutines
          store={store}
          libraryVersion={reloads}
          onOpenExercise={(contentKey) => void openExerciseByKey(contentKey)}
        />
      )}

      {store !== null && <LibraryPatterns store={store} />}
    </div>
  );
}

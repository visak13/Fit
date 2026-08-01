/**
 * THE CURVES — the shapes a session can be put into, and the form that adds or changes one.
 *
 * The third library kind, and the one nothing in the interface could edit. Seven ship; the coach
 * presses them mid-session on the runner and, until this panel, could neither add one nor change one
 * nor take one away — while the admin reset restored them faithfully to a set he had no way to see
 * the whole of.
 *
 * This file is the DRAWING and nothing else. `library-patterns.ts` decides every word.
 *
 * ## THERE ARE NO NUMBERS ON THIS FORM, AND THAT IS EXPLAINED RATHER THAN LEFT AS AN ABSENCE
 *
 * A curve names points; what the work and the rest actually ARE at each point belongs to each
 * exercise's own three intensity points, where the rule that a harder point asks for more work and
 * less rest is enforced. Unexplained, the missing boxes read as an oversight — see
 * `CURVE_HAS_NO_NUMBERS`, said once where he would go looking for them.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Glyph } from '../design/Glyph';
import { INTENSITY_LEVELS, MAPPING_RULES } from '../../core/model/model.js';
import { vocabularyWords } from './library-editor';
import type { RefusalReport } from './library-editor';
import {
  ADD_PATTERN_BUTTON, ADD_PATTERN_TITLE, CANCEL_PATTERN_BUTTON, CURVE_HAS_NO_NUMBERS, CURVE_HINT,
  EDIT_PATTERN_TITLE, NAME_MUST_MATCH_HINT, PATTERN_FIELD_LABELS, SAVE_PATTERN_BUTTON, addPoint,
  describePatternRefusal, describePatternRemoval, describePatterns, draftCurveWords,
  draftFromPattern, emptyPatternDraft, mappingWords, movePoint, patternContent, patternRemovedWords,
  patternSavedWords, removePoint,
} from './library-patterns';
import type { PatternDraft, PatternPage, PatternRemoval, PatternSummary } from './library-patterns';
import {
  addPattern, appendPatternPage, countPatterns, readPatternPage, readPatterns,
  removePattern, savePattern,
} from './library-patterns-source';
import type { LocalStore } from '../../core/store/store.js';

interface Shown {
  readonly from: LocalStore;
  readonly search: string;
  readonly page: PatternPage;
  /** How many the library holds, not how many are on the page. See `describePatterns`. */
  readonly total: number;
}

interface Editing {
  readonly recordId: string;
  readonly rev: number;
  readonly contentKey: string;
  readonly name: string;
}

/** One curve, as a row. */
function PatternRow({
  pattern, busy, onEdit, onRemove,
}: {
  pattern: PatternSummary;
  busy: boolean;
  onEdit: (pattern: PatternSummary) => void;
  onRemove: (pattern: PatternSummary) => void;
}) {
  return (
    <li className="row row-static row-wrap">
      <span className="row-name">{pattern.name}</span>
      <span className="chip">{pattern.provenanceWord}</span>
      {/* THE CURVE ITSELF, spelled out in the same words the button he presses uses. */}
      <span className="row-value nowrap">{pattern.curveWords}</span>
      <span className="chip">{pattern.length}</span>

      <span className="row-actions">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Change ${pattern.name}`}
          disabled={busy}
          onClick={() => onEdit(pattern)}
        >
          <Glyph name="edit" size="inline" decorative />
          Change
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Remove ${pattern.name}`}
          disabled={busy}
          onClick={() => onRemove(pattern)}
        >
          <Glyph name="delete" size="inline" decorative />
          Remove
        </button>
      </span>

      <details className="disclose">
        <summary>What it is for</summary>
        <div className="card-body stack-tight">
          <p className="read">{pattern.description}</p>
          <p className="muted read">{pattern.mapping}</p>
        </div>
      </details>
    </li>
  );
}

function PatternRemovalPanel({
  confirmation, busy, onConfirm, onCancel,
}: {
  confirmation: PatternRemoval;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card card-tight" aria-labelledby="pattern-removal-confirm">
      <div className="card-header">
        <h3 id="pattern-removal-confirm" className="title-section">{confirmation.title}</h3>
      </div>
      <div className="card-body stack">
        <p className="read">{confirmation.whatWillHappen}</p>
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

export function LibraryPatterns({ store }: { store: LocalStore }) {
  const [search, setSearch] = useState('');
  const [reloads, setReloads] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);

  const [draft, setDraft] = useState<PatternDraft>(() => emptyPatternDraft());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<RefusalReport | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<
    { pattern: PatternSummary; confirmation: PatternRemoval } | null
  >(null);
  const [removing, setRemoving] = useState(false);

  // THE SEARCH IS NOT BOUND TO A PAGE. `readPatterns` filters over the collection, so a curve that
  // sorts onto page two is found rather than reported absent by a screen whose uniqueness guard
  // would then refuse to let him create it.
  useEffect(() => readPatterns(store, search, (readout) =>
    setShown({ from: store, search, page: readout.page, total: readout.total })),
  [store, search, reloads]);

  const showMore = useCallback(() => {
    if (shown === null || shown.page.cursor === null) return;
    const after = shown.page.cursor;

    void readPatternPage(store, { search, after }).then(
      (next) => setShown((held) =>
        (held === null || held.from !== store || held.search !== search
          ? held
          : { ...held, page: appendPatternPage(held.page, next) })),
      (error: unknown) => console.error('[library] the next page of curves could not be read', error),
    );
  }, [store, shown, search]);

  const startAdding = useCallback(() => {
    setEditing(null);
    setDraft(emptyPatternDraft());
    setRefusal(null);
    setOutcome(null);
  }, []);

  const startEditing = useCallback((pattern: PatternSummary) => {
    if (shown === null) return;
    const record = shown.page.items.find((held) => held.record_id === pattern.recordId);
    if (record === undefined) return;

    setEditing({
      recordId: pattern.recordId,
      rev: pattern.rev,
      contentKey: pattern.contentKey,
      name: pattern.name,
    });
    setDraft(draftFromPattern(record));
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

      const content = patternContent(draft, editing?.contentKey ?? null);

      try {
        const saved = editing === null
          ? await addPattern(store, content)
          : await savePattern(store, editing.recordId, content, editing.rev);
        setOutcome(patternSavedWords(saved.content.name, editing === null));
        setEditing(null);
        setDraft(emptyPatternDraft());
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        setRefusal(describePatternRefusal(error));
      } finally {
        setSaving(false);
      }
    },
    [store, draft, editing, saving],
  );

  /**
   * COUNT THE WHOLE LIBRARY BEFORE ASKING, so "this is your last curve" is a measured claim rather
   * than a reading of the page he happens to be filtered down to.
   */
  const askToRemove = useCallback(
    async (pattern: PatternSummary) => {
      setOutcome(null);
      setRefusal(null);
      try {
        const total = await countPatterns(store);
        setConfirming({ pattern, confirmation: describePatternRemoval(pattern, total - 1) });
      } catch (error: unknown) {
        setRefusal(describePatternRefusal(error));
      }
    },
    [store],
  );

  const confirmRemoval = useCallback(async () => {
    if (confirming === null || removing) return;

    setRemoving(true);
    try {
      await removePattern(store, confirming.pattern.recordId, confirming.pattern.rev);
      setOutcome(patternRemovedWords(confirming.pattern.name));
      setConfirming(null);
      if (editing?.recordId === confirming.pattern.recordId) {
        setEditing(null);
        setDraft(emptyPatternDraft());
      }
      setReloads((count) => count + 1);
    } catch (error: unknown) {
      setRefusal(describePatternRefusal(error));
    } finally {
      setRemoving(false);
    }
  }, [store, confirming, removing, editing]);

  const report = shown === null
    ? null
    : describePatterns({ page: shown.page, search: shown.search, total: shown.total });

  const busy = saving || removing;

  return (
    <>
      <section className="card card-tight" aria-labelledby="library-curves">
        <div className="card-header">
          <h3 id="library-curves" className="title-section">Session shapes</h3>
          <span className="spacer" />
          {report !== null && <span className="chip">{report.count}</span>}
        </div>

        <div className="card-body stack">
          <p className="read">{CURVE_HINT}</p>

          <div className="field">
            <label htmlFor="pattern-search">Find a curve</label>
            <input
              id="pattern-search"
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
                  {report.items.map((pattern) => (
                    <PatternRow
                      key={pattern.recordId}
                      pattern={pattern}
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
            <PatternRemovalPanel
              confirmation={confirming.confirmation}
              busy={removing}
              onConfirm={() => void confirmRemoval()}
              onCancel={() => setConfirming(null)}
            />
          )}
        </div>
      </section>

      <section className="card stack" aria-labelledby="library-pattern-form">
        <div className="inline">
          <h3 id="library-pattern-form" className="title-section">
            {editing === null ? ADD_PATTERN_TITLE : EDIT_PATTERN_TITLE}
          </h3>
          <span className="spacer" />
          {editing !== null && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={startAdding}>
              {CANCEL_PATTERN_BUTTON}
            </button>
          )}
        </div>

        {editing !== null && <p className="read">{`You are changing ${editing.name}.`}</p>}

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
            <label htmlFor="pattern-name">{PATTERN_FIELD_LABELS.name}</label>
            <input
              id="pattern-name"
              type="text"
              autoComplete="off"
              aria-describedby="pattern-name-hint"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <p id="pattern-name-hint" className="muted read">{NAME_MUST_MATCH_HINT}</p>
          </div>

          <fieldset className="stack-tight" aria-label={PATTERN_FIELD_LABELS.sequence}>
            <legend className="title-section">{PATTERN_FIELD_LABELS.sequence}</legend>

            <p className="read">{draftCurveWords(draft.sequence)}</p>

            <ul className="stack-tight">
              {draft.sequence.map((level, index) => (
                <li
                  className="row row-static row-wrap"
                  // eslint-disable-next-line react/no-array-index-key
                  key={`point-${String(index)}`}
                >
                  <span className="row-value nowrap">{String(index + 1)}</span>
                  <span className="row-name">{vocabularyWords(level)}</span>
                  <span className="row-actions">
                    {index > 0 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        aria-label={`Move point ${String(index + 1)} earlier in the curve`}
                        disabled={busy}
                        onClick={() => setDraft(movePoint(draft, index, -1))}
                      >
                        Move earlier
                      </button>
                    )}
                    {index < draft.sequence.length - 1 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        aria-label={`Move point ${String(index + 1)} later in the curve`}
                        disabled={busy}
                        onClick={() => setDraft(movePoint(draft, index, 1))}
                      >
                        Move later
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={`Take point ${String(index + 1)} out of the curve`}
                      disabled={busy}
                      onClick={() => setDraft(removePoint(draft, index))}
                    >
                      <Glyph name="delete" size="inline" decorative />
                      Take it out
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {/* The levels come from the record model's own vocabulary, never a list written here. */}
            <div className="inline">
              {INTENSITY_LEVELS.map((level: string) => (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  key={level}
                  aria-label={`Add a ${vocabularyWords(level)} point to the end of the curve`}
                  disabled={busy}
                  onClick={() => setDraft(addPoint(draft, level))}
                >
                  <Glyph name="add" size="inline" decorative />
                  {vocabularyWords(level)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="stack-tight" aria-label={PATTERN_FIELD_LABELS.mappingRule}>
            <legend className="title-section">{PATTERN_FIELD_LABELS.mappingRule}</legend>
            {MAPPING_RULES.map((rule: string) => (
              <label className="inline" key={rule} htmlFor={`pattern-rule-${rule}`}>
                <input
                  id={`pattern-rule-${rule}`}
                  type="radio"
                  name="pattern-mapping-rule"
                  checked={draft.mappingRule === rule}
                  onChange={() => setDraft({ ...draft, mappingRule: rule })}
                />
                <span>{mappingWords(rule)}</span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="pattern-description">{PATTERN_FIELD_LABELS.description}</label>
            <textarea
              id="pattern-description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>

          <p className="muted read">{CURVE_HAS_NO_NUMBERS}</p>

          <p>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Glyph name={editing === null ? 'add' : 'edit'} size="inline" decorative />
              <span>{editing === null ? ADD_PATTERN_BUTTON : SAVE_PATTERN_BUTTON}</span>
            </button>
          </p>
        </form>
      </section>
    </>
  );
}

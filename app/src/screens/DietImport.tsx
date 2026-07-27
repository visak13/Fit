/**
 * THE PASTE SURFACE — the way a plan actually gets into this application.
 *
 * The coach's wife is the nutritionist and he TRANSCRIBES her plans. This is the PRIMARY input path,
 * not an advanced feature: if pasting is worse than typing, he types, and the feature has failed
 * with every test still green.
 *
 * This file is the DRAWING and nothing else. The reading is `core/diet/import.js`, which is pure and
 * has its own suite; the flow and every sentence around it are decided in `diet-import.ts`, which
 * cannot write because it is handed no store; the write is `saveImportedPlan` in
 * `diet-editor-source.ts` and it happens on ONE press, here, and nowhere else.
 *
 * ## THE THREE THINGS THIS SURFACE MUST NOT DO, DRAWN SO THAT IT CANNOT
 *
 * **It must not write before he agrees.** The read control produces a reading and nothing else; the
 * confirm control is the only thing in this file that touches a store, and it is not even rendered
 * until there is something to confirm.
 *
 * **It must not hide a line it could not place.** They are drawn IN FULL, each quoted exactly as he
 * pasted it with the core's own reason beside it, and never collapsed to a count. A line dropped
 * quietly is how a client's plan is lost with nobody noticing.
 *
 * **It must not reword the record.** When the record refuses the draft, its own sentences are shown.
 *
 * ## AND WHAT IT SHOWS HIM INSTEAD OF ASKING HIM TO TRUST IT
 *
 * The preview is the WEEK — the same `WeekChart` component, the same `.week` classes and the same
 * projection the diet screen draws. What he checks against the paper in his hand is laid out exactly
 * like what he will read back tomorrow. A list of facts would make him rebuild the week in his head,
 * which is the work he was pasting to avoid.
 *
 * Diet is PLAINTEXT: no passphrase, no gate, no sensitivity marking anywhere on this.
 */

import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import {
  CONFIRM_IMPORT, PASTE_LABEL, READ_PASTE, RECORD_REFUSED_WORDS, describeImport, readPaste,
} from './diet-import';
import type { ImportReading } from './diet-import';
import { BACK_TO_THE_DIET, dietForClient } from './diet';
import { WeekChart } from './WeekChart';

/** Everything the paste surface is handed. */
export interface DietImportProps {
  readonly clientId: string;
  readonly clientName: string | null;
  /** Save the draft the core built, exactly as it built it. Resolves once the write has committed. */
  readonly onConfirm: (draft: Record<string, unknown>) => void;
  /** True while the write is in flight, so nothing can be confirmed twice. */
  readonly saving: boolean;
  /** Said once, after the write has committed. */
  readonly saved: string | null;
  /** The store's own words when the write failed, or null. */
  readonly failure: string | null;
}

export function DietImport({
  clientId, clientName, onConfirm, saving, saved, failure,
}: DietImportProps) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [reading, setReading] = useState<ImportReading | null>(null);

  const report = describeImport(saved === null ? (reading === null ? 'nothing-pasted' : 'read') : 'saved', reading);

  return (
    <section className="card stack" aria-labelledby="diet-import">
      <div className="spread">
        <h3 id="diet-import" className="title-section">
          {clientName === null ? report.title : `${report.title} for ${clientName}`}
        </h3>
        <Link className="btn btn-quiet btn-sm" to={dietForClient(clientId)}>
          <Glyph name="link-back" size="inline" decorative />
          <span>{BACK_TO_THE_DIET}</span>
        </Link>
      </div>

      <p className="screen-intro read">{report.intro}</p>

      <div className="field">
        <label htmlFor="import-name">What to call this plan</label>
        <input
          id="import-name"
          type="text"
          autoComplete="off"
          value={name}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="import-source">Who wrote it</label>
        <input
          id="import-source"
          type="text"
          autoComplete="off"
          value={sourceNote}
          disabled={saving}
          onChange={(event) => setSourceNote(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="import-paste">{PASTE_LABEL}</label>
        <textarea
          id="import-paste"
          value={text}
          disabled={saving}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      <div className="inline">
        {/* IT READS. IT DOES NOT SAVE — and the words on it say so, because a control labelled
            "Import" on a surface that then shows a report reads as though the import already
            happened. */}
        <button
          type="button"
          className="btn"
          disabled={saving || text.trim().length === 0}
          onClick={() => setReading(readPaste(text, { clientId, name, sourceNote }))}
        >
          <Glyph name="search" size="inline" decorative />
          <span>{READ_PASTE}</span>
        </button>
      </div>

      {report.reading !== null && (
        <>
          {/* THE ACCOUNT, NOT A REASSURANCE: how many lines went in, how many became meals, how many
              could not be placed. A count of what was KEPT cannot tell him whether anything was lost. */}
          <p className="note read" role="status">
            <Glyph name="note" size="inline" decorative />
            <span>{report.summary}</span>
          </p>

          <h4 className="title-block">{report.previewTitle}</h4>
          {report.reading.preview.is_empty ? (
            <p className="read">Nothing in this paste became a meal. Nothing has been saved.</p>
          ) : (
            <WeekChart chart={report.reading.preview} caption="What this paste was read as" />
          )}

          {/* EVERY LINE THAT COULD NOT BE PLACED, QUOTED AS HE WROTE IT. Never a count, never
              collapsed, and never behind a control he has to find. */}
          {report.couldNotPlaceTitle !== null && (
            <section className="stack-tight" role="alert">
              <h4 className="title-block">{report.couldNotPlaceTitle}</h4>
              {/*
                A FRAGMENT AND NOT A WRAPPING ELEMENT, and it was WRONG the other way first.

                `.pairs` lays the label and its value out as a two-column grid, and a grid only sees
                its DIRECT children. Wrapping each pair in a div made every pair one grid cell, so
                the reason — the sentence saying WHY a line of a client's plan could not be placed —
                was squeezed into a 230px column beside a page of empty space, at six words a line.
                Every property check passed: the lines were there, quoted, in order. It was found by
                looking. `ClientsScreen` uses a Fragment here for exactly this reason.
              */}
              <dl className="pairs">
                {report.reading.couldNotPlace.map((line) => (
                  <Fragment key={`${String(line.line)}-${line.text}`}>
                    <dt className="pair-label">{`Line ${String(line.line)}`}</dt>
                    <dd className="pair-value read">
                      <q>{line.text}</q>
                      {` — ${line.reason}`}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {/* AND SAID OUT LOUD WHEN THERE WERE NONE. A blank space where the unplaced lines would go
              is indistinguishable from a surface that forgot to draw them. */}
          {report.everythingPlacedWords !== null && (
            <p className="note read">
              <Glyph name="session-finish" size="inline" decorative />
              <span>{report.everythingPlacedWords}</span>
            </p>
          )}

          {/* WHAT WAS READ DIFFERENTLY FROM HOW IT WAS WRITTEN. `Tues` becoming Tuesday is a change
              to what the nutritionist wrote, and he agrees to it here rather than discovering it. */}
          {report.changedTitle !== null && (
            <section className="stack-tight">
              <h4 className="title-block">{report.changedTitle}</h4>
              <ul className="rows rows-boxed">
                {report.reading.changed.map((change) => (
                  <li key={change} className="row row-static row-wrap">
                    <span className="row-sentence read">{change}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* READINGS THE COACH SETTLES, NOT ONES TAKEN FOR HIM. The core takes the literal reading
              and asks; a surface that hid the question would be the app deciding what his wife wrote. */}
          {report.ambiguousTitle !== null && (
            <section className="stack-tight">
              <h4 className="title-block">{report.ambiguousTitle}</h4>
              <ul className="rows rows-boxed">
                {report.reading.ambiguous.map((item) => (
                  <li key={`${String(item.line)}-${item.question}`} className="row row-static row-wrap">
                    <span className="row-sentence read">
                      {`Line ${String(item.line)}: `}
                      <q>{item.text}</q>
                      {` — ${item.question}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* THE RECORD'S OWN REFUSALS, ITS SENTENCES UNCHANGED. Nothing in this direction validates
              in front of it — a second copy of a rule is a copy that drifts. */}
          {report.reading.recordRefusals.length > 0 && (
            <section className="stack" role="alert">
              <p className="note note-danger read">
                <Glyph name="sync-failed" size="inline" decorative />
                <span>{RECORD_REFUSED_WORDS}</span>
              </p>
              <dl className="pairs">
                {report.reading.recordRefusals.map((issue) => (
                  <Fragment key={`${issue.path}:${issue.code}`}>
                    <dt className="pair-label">{issue.path}</dt>
                    <dd className="pair-value read">{issue.message}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {/* THE ONE PRESS THAT WRITES. It is the only thing on this surface that touches a store. */}
          <div className="inline">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!report.canConfirm || saving}
              onClick={() => onConfirm(report.reading?.draft ?? {})}
            >
              <Glyph name="add" size="inline" decorative />
              <span>{CONFIRM_IMPORT}</span>
            </button>
          </div>
        </>
      )}

      {saved !== null && (
        <p className="note read" role="status">
          <Glyph name="nav-diet" size="inline" decorative />
          <span>{saved}</span>
        </p>
      )}

      {failure !== null && (
        <p className="note note-danger read" role="alert">
          <Glyph name="sync-failed" size="inline" decorative />
          <span>{failure}</span>
        </p>
      )}
    </section>
  );
}

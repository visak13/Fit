/**
 * SENDING ONE CLIENT THEIR PROGRESS REPORT — the card, and nothing else.
 *
 * Self-contained on purpose. Every decision it makes is made in a module beside it that a test can
 * drive: `client-report-source.ts` reads the history and says whether it read all of it,
 * `core/report/` decides what the report says, `core/artefacts/` lays it out, and `client-export.ts`
 * makes the file and words the outcome. This file is the markup and the two pieces of state, so the
 * screen that mounts it needs to know none of that.
 *
 * ## THE TWO REFUSALS ARE DRAWN, NOT SWALLOWED
 *
 * A client with nothing recorded yet, and a history that could not be read to the end, are different
 * things and are said differently. Neither is an error tone: the first is an ordinary Tuesday for a
 * new client, and the second is a read to try again, not a fault the coach caused.
 */

import { useEffect, useState } from 'react';

import { projectProgressReport } from '../../core/report/report.js';
import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import {
  browserExportSurfaces, NOTHING_TO_REPORT, REPORT_EXPORT_TITLE, REPORT_EXPORT_WORDS,
  reportExportOffer, SEND_REPORT_AS_IMAGE, SEND_REPORT_AS_SPREADSHEET, sendClientReport,
} from './client-export';
import type { ClientExportKind, ClientExportReport } from './client-export';
import { exportJournal } from './export-audit';
import { HISTORY_INCOMPLETE, readWholeHistory } from './client-report-source';
import type { WholeHistory } from './client-report-source';

/** Said while the history is being read, because a year of sessions is not instant on a phone. */
export const READING_THE_HISTORY = 'Reading this client\'s history...';

/** What the control that closes the card says. */
export const DONE_WITH_THIS = 'Close';

/** How an outcome's tone becomes a class. Decides nothing: `client-export.ts` decided the tone. */
function noteClass(tone: ClientExportReport['tone']): string {
  return tone === 'warning' ? 'note note-danger read' : 'note read';
}

export function ClientReportCard({
  store, client, onClose,
}: {
  store: LocalStore;
  client: { recordId: string; name: string; record?: unknown };
  onClose: () => void;
}) {
  const [history, setHistory] = useState<WholeHistory | null>(null);
  const [sending, setSending] = useState<ClientExportKind | null>(null);
  const [outcome, setOutcome] = useState<ClientExportReport | null>(null);

  useEffect(() => {
    let live = true;
    setHistory(null);
    setOutcome(null);
    void readWholeHistory(store, client).then((read) => { if (live) setHistory(read); });
    return () => { live = false; };
  }, [store, client.recordId]);

  const report = history === null ? null : projectProgressReport({
    client: client.record ?? { record_id: client.recordId, content: { name: client.name } },
    client_id: client.recordId,
    sessions: history.sessions,
    performed: history.performed,
    readings: history.readings,
    exercises: history.exercises,
  });

  const offer = reportExportOffer(report);

  /*
   * THE WHOLE OF THE EXPORT WIRING, and it is three lines because none of it is written here.
   * `sendClientReport` lays the report out through the artefact package, makes the file through the
   * platform layer and delivers it through the share layer. It never throws: every path, including a
   * history too long to draw as one picture, comes back as a sentence.
   */
  async function send(kind: ClientExportKind): Promise<void> {
    if (report === null) return;
    setSending(kind);
    setOutcome(null);
    try {
      // The disclosure is recorded against THIS client — which record, and never a word of what it
      // says. The sink is built here, from the store this card already holds, because the log is
      // written on the device the export left.
      const done = await sendClientReport({
        journal: exportJournal(store),
        about: { type: 'client', record_id: client.recordId },
      }, kind, report, browserExportSurfaces(
        document,
        window,
        { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
      ));
      setOutcome(done);
    } finally {
      setSending(null);
    }
  }

  return (
    <section className="card card-tight" aria-labelledby="client-report">
      <div className="card-header">
        <h3 id="client-report" className="title-section">
          {`${REPORT_EXPORT_TITLE} — ${client.name}`}
        </h3>
        <span className="spacer" />
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>{DONE_WITH_THIS}</button>
      </div>

      <div className="card-body stack">
        {history === null && <p className="muted read" role="status">{READING_THE_HISTORY}</p>}

        {/*
          AN INCOMPLETE READ REFUSES RATHER THAN SENDING A SHORT REPORT. A report projected from part
          of a history is complete in shape and wrong in substance — it understates the client's own
          progress, and neither he nor they would have any way of noticing.
        */}
        {history !== null && !history.complete && (
          <p className="note note-danger read" role="alert">
            <Glyph name="help-explain" size="inline" decorative />
            <span>{HISTORY_INCOMPLETE}</span>
          </p>
        )}

        {history !== null && history.complete && !offer.offered && offer.instead !== null && (
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{NOTHING_TO_REPORT}</span>
          </p>
        )}

        {history !== null && history.complete && offer.offered && (
          <>
            <p className="read">{REPORT_EXPORT_WORDS}</p>

            <div className="spread">
              <button
                type="button"
                className="btn btn-sm"
                disabled={sending !== null}
                onClick={() => { void send('picture'); }}
              >
                <Glyph name="export" size="inline" decorative />
                {SEND_REPORT_AS_IMAGE}
              </button>

              <button
                type="button"
                className="btn btn-sm"
                disabled={sending !== null}
                onClick={() => { void send('spreadsheet'); }}
              >
                <Glyph name="export" size="inline" decorative />
                {SEND_REPORT_AS_SPREADSHEET}
              </button>
            </div>
          </>
        )}

        {/* The delivery layer's own sentence, reworded nowhere. A cancellation is not a failure and
            a fallback download is not a delivery, and neither is dressed up as one here. */}
        {outcome !== null && (
          <p className={noteClass(outcome.tone)} role="status">
            <span>{outcome.words}</span>
          </p>
        )}
      </div>
    </section>
  );
}

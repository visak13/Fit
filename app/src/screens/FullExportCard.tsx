/**
 * THE FULL EXPORT — the checklist card, self-contained so its mount is two lines.
 *
 * It is its own component rather than markup inside the admin screen for a reason recorded at the
 * time: the admin screen is under review by another shell, and a lost update between a builder and a
 * reviewer is the same defect as between two builders and harder to spot, because the reviewer's
 * edit is a correction somebody trusts. So the capability and its tests live here, owned by one
 * author, and only the mount is serialised.
 *
 * Every judgement is made in a module a test can drive with no browser: `core/artefacts/` owns the
 * items, the gate and what each item puts in the file; `full-export.ts` owns when he is asked for a
 * passphrase and what he is told afterwards; `full-export-source.ts` owns reading the practice to
 * the end. This file is markup and four pieces of state.
 *
 * ## THE SEALING IS BUILT HERE, FROM THE PASSPHRASE HE JUST TYPED
 *
 * It was briefly a required prop, on the reasoning that a component which cannot be mounted without a
 * sealer cannot ship one that quietly skips it. The passphrase settled it: the phrase belongs to THIS
 * export and lives in this component state, so a sealer built anywhere else would have to be handed
 * it, and a sealer built once and reused would carry one export s phrase into the next. It is built
 * per export by clinical-sealing.ts and passed to makeFullExport, which still REFUSES if it is
 * missing. The requiredness lives where it always mattered - at the boundary that would otherwise
 * write an unsealed part.
 */

import { useEffect, useState } from 'react';

import { CHECKLIST_TITLE, CHECKLIST_WORDS, PASSPHRASE_PROMPT } from '../../core/artefacts/artefacts.js';
import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import { anchorDownload, browserSharing } from '../platform/share-delivery';
import {
  FULL_EXPORT_HEADING, FULL_EXPORT_ITEMS, FULL_EXPORT_WORDS, fullExportOffer, MAKE_THE_FILE,
  MAKING_THE_FILE, makeFullExport, PASSPHRASE_AGAIN, PASSPHRASE_CANNOT_BE_RECOVERED,
} from './full-export';
import type { FullExportReport } from './full-export';
import { sealClinicalWith } from './clinical-sealing';
import { exportJournal } from './export-audit';
import { PRACTICE_INCOMPLETE, readWholePractice } from './full-export-source';
import type { WholePractice } from './full-export-source';

/** Said while the practice is being read, because a whole practice is not instant on a phone. */
export const READING_YOUR_RECORDS = 'Reading your records...';

/** How an outcome's tone becomes a class. Decides nothing: `full-export.ts` decided the tone. */
function noteClass(tone: FullExportReport['tone']): string {
  return tone === 'warning' ? 'note note-danger read' : 'note read';
}

export function FullExportCard({ store }: { store: LocalStore }) {
  const [practice, setPractice] = useState<WholePractice | null>(null);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [making, setMaking] = useState(false);
  const [outcome, setOutcome] = useState<FullExportReport | null>(null);

  useEffect(() => {
    let live = true;
    void readWholePractice(store).then((read) => { if (live) setPractice(read); });
    return () => { live = false; };
  }, [store]);

  // The records are passed so the offer can refuse a selection that would produce a file holding
  // nothing. Before they are read it is not passed, because a surface that has not looked must not
  // refuse on the strength of not having looked.
  const offer = fullExportOffer(
    ticked, passphrase, again,
    practice === null ? undefined : { ...practice, clinical: [] },
  );

  function toggle(id: string): void {
    setOutcome(null);
    setTicked((held) => (held.includes(id) ? held.filter((one) => one !== id) : [...held, id]));
  }

  async function make(): Promise<void> {
    if (practice === null || !offer.offered) return;
    setMaking(true);
    setOutcome(null);
    try {
      const done = await makeFullExport(
        // No subject: this file is the whole practice rather than one record, and an identifier
        // field is not somewhere to put a description of what he ticked.
        { journal: exportJournal(store) },
        ticked,
        { ...practice, clinical: [] },
        {
          sharing: browserSharing(window.navigator),
          download: anchorDownload(
            { createAnchor: () => document.createElement('a') },
            { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
          ),
        },
        // Built from the phrase he typed, for this export and no other.
        sealClinicalWith(passphrase),
      );
      setOutcome(done);
      // The passphrase is not kept a moment longer than the file needed it. It is the one secret
      // this screen ever holds, and a coach who walks away leaves the screen behind him.
      setPassphrase('');
      setAgain('');
    } finally {
      setMaking(false);
    }
  }

  return (
    <section className="card card-tight" aria-labelledby="admin-full-export">
      <div className="card-header">
        <h3 id="admin-full-export" className="title-section">{FULL_EXPORT_HEADING}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{FULL_EXPORT_WORDS}</p>

        {practice === null && <p className="muted read" role="status">{READING_YOUR_RECORDS}</p>}

        {/* AN INCOMPLETE READ REFUSES. A backup is the one file whose incompleteness is discovered
            at the moment it is the only copy left. */}
        {practice !== null && !practice.complete && (
          <p className="note note-danger read" role="alert">
            <Glyph name="help-explain" size="inline" decorative />
            <span>{PRACTICE_INCOMPLETE}</span>
          </p>
        )}

        {practice !== null && practice.complete && (
          <>
            <h4 className="title-section">{CHECKLIST_TITLE}</h4>
            <p className="read">{CHECKLIST_WORDS}</p>

            <ul className="rows rows-boxed">
              {FULL_EXPORT_ITEMS.map((item) => (
                <li key={item.id} className="row row-static row-wrap">
                  <label className="row-name">
                    <input
                      type="checkbox"
                      checked={ticked.includes(item.id)}
                      disabled={making}
                      onChange={() => toggle(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                  <span className="muted read">{item.words}</span>
                </li>
              ))}
            </ul>

            {/* ASKED FOR ONLY WHEN THE SELECTION DEMANDS IT, and the demand comes from the checklist
                rather than from this component. Nothing about a passphrase is drawn otherwise — not
                a disabled box, not a hint — because an unticked gate must leave no trace that
                anything was withheld. */}
            {offer.asksForAPassphrase && (
              <div className="stack">
                <p className="read">{PASSPHRASE_PROMPT}</p>
                <p className="note read">
                  <Glyph name="protected-clinical-note" size="inline" decorative />
                  <span>{PASSPHRASE_CANNOT_BE_RECOVERED}</span>
                </p>

                <label className="stack">
                  <span>Passphrase</span>
                  <input
                    type="password"
                    value={passphrase}
                    disabled={making}
                    onChange={(event) => setPassphrase(event.target.value)}
                  />
                </label>

                <label className="stack">
                  <span>{PASSPHRASE_AGAIN}</span>
                  <input
                    type="password"
                    value={again}
                    disabled={making}
                    onChange={(event) => setAgain(event.target.value)}
                  />
                </label>
              </div>
            )}

            {offer.instead !== null && (
              <p className="note read" role="status">
                <Glyph name="note" size="inline" decorative />
                <span>{offer.instead}</span>
              </p>
            )}

            <div className="spread">
              <button
                type="button"
                className="btn btn-sm"
                disabled={!offer.offered || making}
                onClick={() => { void make(); }}
              >
                <Glyph name="backup" size="inline" decorative />
                {making ? MAKING_THE_FILE : MAKE_THE_FILE}
              </button>
            </div>
          </>
        )}

        {/* The delivery layer's own sentence, reworded nowhere. */}
        {outcome !== null && (
          <p className={noteClass(outcome.tone)} role="status">
            <span>{outcome.words}</span>
          </p>
        )}
      </div>
    </section>
  );
}

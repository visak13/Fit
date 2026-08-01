/**
 * BACKING UP THE LIBRARY — one tap, and nothing waiting on anything.
 *
 * Its own component rather than a section of the full-export card, and that is not tidiness. The
 * full export is HELD behind a cryptographic ruling; the library backup holds no client data and no
 * clinical content at all, so there is no reason for it to wait on a question about medical notes.
 * Separate components mean this one can mount the day it is ready and the other can follow.
 *
 * Every judgement is made in a module a test can drive: `core/artefacts/` decides what a library
 * backup contains and refuses one missing a kind, `library-backup-export.ts` makes the file and
 * words the outcome, `full-export-source.ts` reads the library to the end. This file is markup and
 * three pieces of state.
 */

import { useEffect, useState } from 'react';

import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import { anchorDownload, browserSharing } from '../platform/share-delivery';
import { exportJournal } from './export-audit';
import { PRACTICE_INCOMPLETE, readWholeLibrary } from './full-export-source';
import type { WholeLibrary } from './full-export-source';
import {
  LIBRARY_BACKUP_HEADING, LIBRARY_BACKUP_WORDS, libraryBackupSummary, makeLibraryBackup,
  MAKE_THE_BACKUP, MAKING_THE_BACKUP, NOTHING_IN_THE_LIBRARY,
} from './library-backup-export';
import type { LibraryBackupReport } from './library-backup-export';

/** Said while the library is being read. */
export const READING_YOUR_LIBRARY = 'Reading your library...';

/** How an outcome's tone becomes a class. Decides nothing. */
function noteClass(tone: LibraryBackupReport['tone']): string {
  return tone === 'warning' ? 'note note-danger read' : 'note read';
}

export function LibraryBackupCard({ store }: { store: LocalStore }) {
  const [read, setRead] = useState<WholeLibrary | null>(null);
  const [making, setMaking] = useState(false);
  const [outcome, setOutcome] = useState<LibraryBackupReport | null>(null);

  useEffect(() => {
    let live = true;
    void readWholeLibrary(store).then((got) => { if (live) setRead(got); });
    return () => { live = false; };
  }, [store]);

  const summary = read === null ? null : libraryBackupSummary(read.library);

  async function make(): Promise<void> {
    if (read === null || !read.complete) return;
    setMaking(true);
    setOutcome(null);
    try {
      // No subject: a library backup is about the library rather than one record. The count it
      // records is the same one drawn above, so the log and the screen cannot disagree.
      const done = await makeLibraryBackup({ journal: exportJournal(store) }, read.library, {
        sharing: browserSharing(window.navigator),
        download: anchorDownload(
          { createAnchor: () => document.createElement('a') },
          { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
        ),
      });
      setOutcome(done);
    } finally {
      setMaking(false);
    }
  }

  return (
    <section className="card card-tight" aria-labelledby="admin-library-backup">
      <div className="card-header">
        <h3 id="admin-library-backup" className="title-section">{LIBRARY_BACKUP_HEADING}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{LIBRARY_BACKUP_WORDS}</p>

        {read === null && <p className="muted read" role="status">{READING_YOUR_LIBRARY}</p>}

        {/* An incomplete read refuses. A backup written from a partial read of the library is one
            that restores a library missing part of itself, discovered when it is the only copy. */}
        {read !== null && !read.complete && (
          <p className="note note-danger read" role="alert">
            <Glyph name="help-explain" size="inline" decorative />
            <span>{PRACTICE_INCOMPLETE}</span>
          </p>
        )}

        {read !== null && read.complete && summary !== null && (
          <>
            {/* THE COUNT, because a backup of nothing and a backup of a practice produce
                identical-looking files and he has no other way to tell them apart. */}
            <p className="muted read" role="status">
              {summary.total === 0 ? NOTHING_IN_THE_LIBRARY : summary.words}
            </p>

            <div className="spread">
              <button
                type="button"
                className="btn btn-sm"
                disabled={making || summary.total === 0}
                onClick={() => { void make(); }}
              >
                <Glyph name="backup" size="inline" decorative />
                {making ? MAKING_THE_BACKUP : MAKE_THE_BACKUP}
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

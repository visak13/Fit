/**
 * THE COPY HE KEEPS ELSEWHERE — the control, and the monthly nudge that sits on it.
 *
 * The decisions live in `backup-archive.ts` and in `core/backup/`; this is markup.
 *
 * THE NUDGE IS DRAWN HERE AND NOWHERE ELSE. It sits on the control that resolves it, so reading it
 * and acting on it are the same gesture. It never blocks: there is no dialog, no interstitial and
 * nothing that waits for an answer anywhere on this path, and there may never be — the application
 * is a supporting role, and the worst thing this feature could do is stand between him and a
 * session on the morning it was trying to protect one.
 *
 * The real `navigator` is bridged by `browserSharing`, the one named function for it, rather than
 * being handed to the seam directly: the seam declares its files readonly and the browser declares
 * them mutable, and that is a type mismatch at the edge rather than a missing capability.
 */

import { useCallback, useEffect, useState } from 'react';

import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import { anchorDownload, browserSharing } from '../platform/share-delivery';
import {
  ARCHIVE_HEADING, ARCHIVE_WORDS, CHOOSE_A_PASSPHRASE, CLINICAL_STAYS_LOCKED, SAVE_THE_COPY,
  SAVING_THE_COPY, readArchiveState, saveBackupArchive,
} from './backup-archive';
import type { ArchiveReport } from './backup-archive';
import { exportJournal } from './export-audit';

type ArchiveState = Awaited<ReturnType<typeof readArchiveState>>;

/** How an outcome's tone becomes a class. Decides nothing. */
function noteClass(tone: ArchiveReport['tone']): string {
  return tone === 'warning' ? 'note note-danger read' : 'note read';
}

export function BackupArchiveCard({ store }: { store: LocalStore }) {
  const [state, setState] = useState<ArchiveState | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<ArchiveReport | null>(null);

  const reread = useCallback(async () => {
    setState(await readArchiveState(store, new Date().toISOString()));
  }, [store]);

  useEffect(() => { void reread(); }, [reread]);

  async function save(): Promise<void> {
    setSaving(true);
    setOutcome(null);
    try {
      const report = await saveBackupArchive(store, {
        passphrase,
        at: new Date().toISOString(),
        // No subject: this file is the whole practice. The count it records is the one the sentence
        // afterwards quotes back to him.
        audit: { journal: exportJournal(store) },
        surfaces: {
          sharing: browserSharing(window.navigator),
          download: anchorDownload(
            { createAnchor: () => document.createElement('a') },
            { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
          ),
        },
      });
      setOutcome(report);
      // The nudge is re-read from the store rather than assumed cleared: it goes away because the
      // file really left, not because the button was pressed.
      if (report.saved_at !== null) { setPassphrase(''); await reread(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card-tight" aria-labelledby="admin-backup-archive">
      <div className="card-header">
        <h3 id="admin-backup-archive" className="title-section">{ARCHIVE_HEADING}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{ARCHIVE_WORDS}</p>

        {/* The limit, stated where he decides rather than discovered on the day he restores. */}
        <p className="muted read">{CLINICAL_STAYS_LOCKED}</p>

        {/* THE NUDGE. A plain note, never an alert and never a blocker: it resolves by itself the
            moment he presses the control directly beneath it. */}
        {state !== null && state.nudge.due && (
          <p className="note read" role="status">
            <Glyph name="backup" size="inline" decorative />
            <span>{state.nudge.words}</span>
          </p>
        )}

        <label className="stack">
          <span className="read">{CHOOSE_A_PASSPHRASE}</span>
          {/* NO CLASS. `className="input"` was here and it matched no rule in any stylesheet —
              enumerating every rule this element matched returned an EMPTY LIST while the box
              measured 326 x 21.2 at 13.3333px. The sizing is bound at element level in the
              foundation now, so a class here would be either inert or a second opinion. */}
          <input
            type="password"
            value={passphrase}
            autoComplete="new-password"
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>

        <div className="spread">
          <button
            type="button"
            className="btn btn-sm"
            disabled={saving || (state !== null && !state.holds_records)}
            onClick={() => { void save(); }}
          >
            <Glyph name="backup" size="inline" decorative />
            {saving ? SAVING_THE_COPY : SAVE_THE_COPY}
          </button>
        </div>

        {outcome !== null && (
          <p className={noteClass(outcome.tone)} role="status">
            <span>{outcome.words}</span>
          </p>
        )}
      </div>
    </section>
  );
}

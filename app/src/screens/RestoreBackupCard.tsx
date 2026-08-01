/**
 * PUTTING A BACKUP BACK — the control, beside the one that makes them.
 *
 * The decisions all live in `restore-backup.ts` and in `core/backup/`; this is markup and the file
 * picker. Two deliberate acts stand between him and the write — choosing a file, then pressing the
 * control — which is the confirmation, rather than a dialog on top of a dialog.
 *
 * THE PASSPHRASE BOX APPEARS ONLY WHEN THE FILE NEEDS ONE, decided by reading the file rather than
 * its name. A passphrase question in front of a plain backup would be friction on exactly the path
 * he takes when something has already gone wrong.
 */

import { useRef, useState } from 'react';

import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import {
  CHOOSE_A_FILE, needsPassphrase, PASSPHRASE_PROMPT, PUTTING_IT_BACK, putABackupBack,
  RESTORE_HEADING, RESTORE_WORDS,
} from './restore-backup';
import type { RestoreReport } from './restore-backup';

/** Said once a file is chosen, so the control names what it is about to act on. */
const PUT_IT_BACK = 'Put this file back';

/** How an outcome's tone becomes a class. Decides nothing. */
function noteClass(tone: RestoreReport['tone']): string {
  return tone === 'warning' ? 'note note-danger read' : 'note read';
}

export function RestoreBackupCard({ store }: { store: LocalStore }) {
  const picker = useRef<HTMLInputElement | null>(null);
  const [chosen, setChosen] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<RestoreReport | null>(null);

  async function choose(file: File | undefined): Promise<void> {
    setOutcome(null);
    setPassphrase('');
    if (file === undefined) { setChosen(null); return; }
    setChosen({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  async function putItBack(): Promise<void> {
    if (chosen === null) return;
    setWorking(true);
    setOutcome(null);
    try {
      setOutcome(await putABackupBack(store, {
        bytes: chosen.bytes,
        passphrase,
        now: new Date().toISOString(),
      }));
    } finally {
      setWorking(false);
    }
  }

  const sealed = chosen !== null && needsPassphrase(chosen.bytes);

  return (
    <section className="card card-tight" aria-labelledby="admin-restore-backup">
      <div className="card-header">
        <h3 id="admin-restore-backup" className="title-section">{RESTORE_HEADING}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{RESTORE_WORDS}</p>

        <input
          ref={picker}
          type="file"
          className="visually-hidden"
          onChange={(event) => { void choose(event.target.files?.[0]); }}
        />

        <div className="spread">
          <button
            type="button"
            className="btn btn-sm"
            disabled={working}
            onClick={() => picker.current?.click()}
          >
            <Glyph name="backup" size="inline" decorative />
            {CHOOSE_A_FILE}
          </button>
        </div>

        {chosen !== null && (
          <>
            {/* The file he chose, read back to him. He may well have several and they look alike. */}
            <p className="muted read" role="status">{chosen.name}</p>

            {sealed && (
              <label className="stack">
                <span className="read">{PASSPHRASE_PROMPT}</span>
                {/* NO CLASS, for the reason recorded on the same box in BackupArchiveCard: `.input`
                    matched no rule in any stylesheet. The foundation binds the sizing now. */}
                <input
                  type="password"
                  value={passphrase}
                  autoComplete="off"
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </label>
            )}

            <div className="spread">
              <button
                type="button"
                className="btn btn-sm"
                disabled={working}
                onClick={() => { void putItBack(); }}
              >
                {working ? PUTTING_IT_BACK : PUT_IT_BACK}
              </button>
            </div>
          </>
        )}

        {/* The core's own sentence, reworded nowhere: a refusal NAMES what is missing. */}
        {outcome !== null && (
          <p className={noteClass(outcome.tone)} role="status">
            <span>{outcome.words}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * THE DIET SCREEN — what a client is eating, as a week the coach can read at a glance, and the two
 * surfaces that put it there.
 *
 * This file is the DRAWING and nothing else. What the picker asks, which plan is drawn, what a
 * client with no plan yet is told, what a plan covering part of the week says, and every sentence on
 * the screen are decided in `diet.ts`, where each can be asserted with no browser and no rendering
 * at all. The chart itself is decided further down still, in `core/diet/chart.js`, which is pure and
 * has its own suite. That is the split `clients.ts` and `ClientsScreen.tsx` state as the pattern to
 * copy: a static render never runs an effect, so logic inside a component is logic nothing tests.
 *
 * ## THE WRITE HALF HANGS OFF THE SAME ADDRESS
 *
 * Writing a plan is not a different PLACE — it is Diet with the editor open on a client he has
 * already chosen. So the two write surfaces are QUERIES on this destination, exactly as the choice
 * of client and plan already are, and `diet.ts` states the reason: a segment underneath would be a
 * second address for one screen and `no-dead-ends.test.ts` would be holding two routes where the
 * application has one. It also means the editor he left open is the editor he comes back to.
 *
 * `DietEditor.tsx` and `DietImport.tsx` beside this file draw them, and the writes themselves are in
 * `diet-editor-source.ts`, driven in a test against a real store. What lives HERE is only the
 * wiring: which surface the address asks for, and re-reading after a write so that what he saved is
 * what he then sees.
 *
 * ## THE WEEK REPEATS AND CARRIES NO DATES
 *
 * There is no date on this screen and no arithmetic that could produce one. The record is a food
 * chart for a repeating week, and `REPEATS_WORDS` says so above the grid — because a grid with
 * Monday at the left is exactly what a dated week looks like, and a coach reading it as "this week"
 * would go looking for last week's.
 *
 * **The day names come off the chart**, which takes them from the one frozen table in
 * `core/diet/week.js`. There is no list of day names in this file. The importer resolves a pasted
 * day name through that same table, and two private tables is how the coach imports into Tuesday and
 * reads it under Wednesday with nothing erroring anywhere.
 *
 * ## READING A DENSE GRID, AND WHAT IT BECOMES ON A PHONE
 *
 * `app/DESIGN.md` had already ruled on this before the screen existed, and it is followed rather
 * than re-argued: the table scrolls inside its own container and the TIME COLUMN PINS. The time
 * stays under his thumb while the days move past it. It is the same information architecture at
 * both widths — never a second design — and it keeps the thing the chart is FOR, which is reading
 * ACROSS: Tuesday against Thursday, on one line.
 *
 * ## THE STORE MAY NOT HAVE OPENED, AND THIS SCREEN MAY NOT PRETEND OTHERWISE
 *
 * A local database can refuse: a private window, a device with no room, a second window holding the
 * old version. When it has, this screen says so from `LocalStoreNotice` and does NOT fall back on
 * the empty reading — "no diet plan yet" read off a store that never opened would tell the coach
 * that a plan he transcribed last week is gone, on the strength of never having looked.
 *
 * ## DIET IS PLAINTEXT
 *
 * No passphrase, no gate, no sensitivity marking anywhere on this path, and nothing here imports the
 * crypto module. A diet plan is a food chart; `core/model/entities/diet-plan.js` records the
 * decision and there is nothing on this screen to switch on later.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import type { Destination } from '../shell/navigation';
import {
  BACK_TO_CURRENT, BACK_TO_THE_DIET, CHANGE_THIS_PLAN, DIET_CLIENT_KEY, DIET_EDIT_KEY,
  DIET_PLAN_KEY, NEW_PLAN, PASTE_A_PLAN, WRITE_A_PLAN, chooseClientLabel, describeDiet,
  describePicker, dietAmendPlan, dietForClient, dietForPlan, dietImport, dietNewPlan,
  whichDietSurface,
} from './diet';
import type { DietClient, HistoryEntry } from './diet';
import { readDietClientsInto, readDietPlansInto } from './diet-source';
import type { ClientChoices, ClientPlans } from './diet-source';
import { DietEditor } from './DietEditor';
import { DietImport } from './DietImport';
import { WeekChart } from './WeekChart';
import {
  EMPTY_DRAFT, describePlanRefusal, draftFromPlan, leftWithNoCurrentWords, madeCurrentWords,
  planContentFromDraft, savedPlanWords,
} from './diet-editor';
import type { MadeCurrent, PlanDraft, PlanRefusal } from './diet-editor';
import {
  NEW_PLAN_STATUS, makePlanCurrent, saveChangesToPlan, saveImportedPlan, saveNewPlan,
} from './diet-editor-source';
import { savedWords } from './diet-import';
import {
  EXPORT_TITLE, EXPORT_WORDS, SEND_AS_IMAGE, SEND_AS_SPREADSHEET, browserExportSurfaces,
  dietExportTable, exportOffer, sendDietExport,
} from './diet-export';
import type { DietExportKind, DietExportReport, ExportTone } from './diet-export';
import { exportJournal } from './export-audit';
import { verbatimOf } from './clients';
import { planIdOf } from '../../core/diet/plan.js';
import type { LocalStore } from '../../core/store/store.js';

/**
 * A read on screen, and WHICH store it came from.
 *
 * Carried so a page belonging to a store no longer in play is discarded during render rather than by
 * an effect whose only job is to reset state — the same reason `ClientsScreen` and
 * `RemovalsFromStore` carry theirs.
 */
interface From<T> {
  readonly from: LocalStore;
  readonly what: T;
}

/**
 * One person on the picker.
 *
 * A LINK rather than a button, because choosing somebody goes somewhere: the address carries who is
 * on screen, so it can be opened in a second window, restored after the phone reclaims the tab, and
 * reached by the coach's own gesture for "take me there". The accessible name says whose diet,
 * because a picker of forty rows otherwise offers forty controls announcing one sentence.
 */
function ClientChoice({ client, chosen }: { client: DietClient; chosen: boolean }) {
  return (
    // `row-toggle`: the row rhythm at the 44px target this application holds anything tapped during
    // a session to. `.row` alone binds `--row-height`, which is 40px in the compact density and
    // therefore under that floor.
    <li>
      <Link
        className="row row-toggle row-wrap"
        to={dietForClient(client.recordId)}
        aria-label={chooseClientLabel(client.name)}
        aria-current={chosen ? 'true' : undefined}
      >
        {/* The mark differs by SILHOUETTE between chosen and not, and the word beside it says the
            same thing again: colour is lost to a colour-blind reader, to sunlight on a phone, and to
            the compression of the video call this application will be introduced over. */}
        <Glyph name={chosen ? 'session-finish' : 'nav-diet'} size="inline" decorative />
        <span className="row-name">{client.name}</span>
        {chosen && <span className="row-value nowrap">Showing</span>}
      </Link>
    </li>
  );
}

/**
 * ONE EARLIER PLAN, REACHABLE. This is the half of the screen that answers "what changed".
 *
 * The status word travels on the row so a DRAFT is never read as something the client followed, and
 * the plan currently drawn is marked rather than dropped from the list — a list that loses a row
 * when you open it is a list whose length changes under the coach as he reads it.
 */
function HistoryRow({ entry, clientId }: { entry: HistoryEntry; clientId: string }) {
  return (
    <li>
      <Link
        className="row row-toggle row-wrap"
        to={dietForPlan(clientId, entry.planId)}
        aria-current={entry.showing ? 'true' : undefined}
      >
        <Glyph name={entry.showing ? 'session-finish' : 'link-forward'} size="inline" decorative />
        <span className="row-name">{entry.name}</span>
        <span className="chip">{entry.statusWord}</span>
        <span className="row-value nowrap">{entry.covers}</span>
      </Link>
    </li>
  );
}

/**
 * THE MARK BESIDE THE OUTCOME OF AN EXPORT — drawing, and only drawing.
 *
 * WHICH outcome happened was decided by `share-delivery.ts`, and how loudly to say it by `toneOf` in
 * `diet-export.ts`. This turns that answer into a glyph and a class and decides nothing: the four
 * tones differ by SILHOUETTE and the sentence beside them says the same thing again, because colour
 * is lost to a colour-blind reader, to sunlight on a phone, and to the compression of a video call.
 *
 * Only `delivered` carries the finish mark. A fallback download and a cancellation must not wear the
 * mark that means the client has it.
 */
const EXPORT_MARKS: Record<ExportTone, { glyph: 'session-finish' | 'export' | 'note'; className: string }> = {
  delivered: { glyph: 'session-finish', className: 'note' },
  kept: { glyph: 'export', className: 'note' },
  stopped: { glyph: 'note', className: 'note' },
  warning: { glyph: 'note', className: 'note note-warning' },
};

export function DietScreen({ destination }: { destination: Destination }) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;
  const navigate = useNavigate();

  // WHO IS ON SCREEN AND WHICH OF THEIR PLANS — both from the address, so the screen he left open is
  // the screen he comes back to. See `diet.ts` for why an identity travels there and a name never
  // does. The two write surfaces are on the same address, for the same reason.
  const [address] = useSearchParams();
  const clientId = address.get(DIET_CLIENT_KEY);
  const showing = address.get(DIET_PLAN_KEY);
  // WHICH SURFACE, from the address, through the one function that decides it — see `diet.ts`.
  const surface = whichDietSurface(address);
  const pasting = surface === 'paste';
  const editing = surface === 'editor' ? address.get(DIET_EDIT_KEY) : null;

  const [choices, setChoices] = useState<From<ClientChoices> | null>(null);
  const [plans, setPlans] = useState<From<ClientPlans> | null>(null);

  /*
   * WHAT MAKES THE SCREEN RE-READ AFTER A WRITE.
   *
   * A read that ran once when the client was chosen would leave him looking at the plan he had a
   * moment ago: he saves, the store commits, and the screen goes on drawing what it read before.
   * The register solved the same problem by re-reading after its own write, and this counts the
   * writes so the effect below depends on them.
   */
  const [written, setWritten] = useState(0);

  /** The draft, and WHICH surface it was seeded for, so switching plans re-seeds it. */
  const [editingDraft, setEditingDraft] = useState<{ for: string; draft: PlanDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<PlanRefusal | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (store === null) return undefined;
    return readDietClientsInto(store, (what) => setChoices({ from: store, what }));
  }, [store]);

  useEffect(() => {
    if (store === null || clientId === null) return undefined;
    return readDietPlansInto(store, clientId, (what) => setPlans({ from: store, what }));
  }, [store, clientId, written]);

  const known = opening.state === 'open';
  const readChoices = choices !== null && choices.from === store ? choices.what : null;
  // The plans on screen belong to the client on screen, or they are not used at all. Without that
  // guard the answer for the person he tapped a moment ago stays under the name he tapped now.
  const readPlans = plans !== null && plans.from === store && clientId !== null ? plans.what : null;

  const clients = readChoices?.items ?? [];
  const reading = {
    clients,
    clientsComplete: readChoices?.done ?? true,
    clientId,
    clientName: clients.find((client) => client.recordId === clientId)?.name ?? null,
    plans: readPlans?.items ?? [],
    plansComplete: readPlans?.done ?? true,
    showing,
  };

  const picker = describePicker(reading);
  const report = describeDiet(reading);
  const offer = exportOffer(report.chart);

  // ── Sending the week ────────────────────────────────────────────────────────────────────────

  /** Which artefact is being made right now, so the control he pressed says so and cannot be pressed twice. */
  const [sending, setSending] = useState<DietExportKind | null>(null);
  /**
   * What happened last time, in the delivery layer's own words, and WHICH week it was about.
   *
   * The identity is carried for the same reason `From` carries one on a read: without it the
   * sentence about Priya's chart stays on screen under the next client he taps, telling him a week
   * he has not sent has gone. Discarded during render rather than by an effect, which would run
   * after a render that had already said the wrong thing.
   */
  const [exported, setExported] = useState<{ for: string; report: DietExportReport } | null>(null);
  const sentFor = `${clientId ?? ''}:${report.drawingPlanId ?? ''}`;
  const outcome = exported !== null && exported.for === sentFor ? exported.report : null;

  /*
   * THE WHOLE OF THE EXPORT WIRING, and it is four lines because none of it is written here.
   *
   * `dietExportTable` hands the chart to the seam as the seam's own table — no adapter, nothing
   * flattened here — and `sendDietExport` makes the file through `platform/table-export.ts` and
   * delivers it through `platform/share-delivery.ts`. There is no canvas, no ZIP, no OOXML and no
   * `navigator` in this direction: the seam was built once and this is its first caller. It never
   * throws; every path comes back as a sentence, because a coach must not meet "something went
   * wrong" with a client waiting for their chart.
   */
  async function sendWeek(kind: DietExportKind): Promise<void> {
    // The store is what the log is written to, so an export cannot proceed without one. It is never
    // null when a chart is on screen — the chart is read THROUGH the store — and asking is how that
    // stays true rather than assumed.
    if (report.chart === null || store === null || report.drawingPlanId === null) return;
    setSending(kind);
    setExported(null);
    try {
      const table = dietExportTable(report.chart, reading.clientName);
      const done = await sendDietExport({
        journal: exportJournal(store),
        // WHICH plan left the application. The client's name is on the file; the log holds the plan
        // identity and not one word of what is in it.
        about: { type: 'diet-plan', record_id: report.drawingPlanId },
      }, kind, table, browserExportSurfaces(
        document,
        window,
        { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
      ));
      setExported({ for: sentFor, report: done });
    } finally {
      setSending(null);
    }
  }

  // ── The write surfaces ──────────────────────────────────────────────────────────────────────

  /*
   * WHICH DRAFT IS ON SCREEN, DERIVED DURING RENDER RATHER THAN SET BY AN EFFECT.
   *
   * The draft is seeded from the plan the address names, and it is HELD only once he has typed into
   * it. Carrying which surface it was seeded FOR is what stops the draft for one plan appearing
   * under another when he moves between them — the same guard `From` carries for a read, and for
   * the same reason. An effect that reset it would run after a render that had already drawn the
   * wrong plan.
   */
  /** True while either write surface is open. The read half stands down while it is. */
  const writing = known && clientId !== null && (pasting || editing !== null);

  const seededFor = editing === null ? null : `${clientId ?? ''}:${editing}`;
  const amending = editing !== null && editing !== NEW_PLAN;
  const openPlan = amending
    ? (readPlans?.items ?? []).find((plan) => planIdOf(plan) === editing) ?? null
    : null;
  const held = editingDraft !== null && editingDraft.for === seededFor ? editingDraft.draft : null;
  const draft = held ?? (openPlan === null ? EMPTY_DRAFT : draftFromPlan(openPlan));

  function takeDraft(next: PlanDraft): void {
    if (seededFor === null) return;
    setEditingDraft({ for: seededFor, draft: next });
    // The refusal belonged to the draft he has just changed, so it stops being about what is on
    // screen the moment he changes it. Leaving it up would have him reading the record's objection
    // to something he no longer has.
    setRefusal(null);
    setSaved(null);
  }

  /** Everything a write has to reset before it starts, so nothing stale is read as current. */
  function beginWrite(): void {
    setSaving(true);
    setRefusal(null);
    setFailure(null);
    setSaved(null);
  }

  async function save(): Promise<void> {
    if (store === null || clientId === null || editing === null) return;
    beginWrite();
    try {
      const stored = amending
        ? await saveChangesToPlan(store, editing, draft, clientId)
        : await saveNewPlan(store, draft, clientId);
      setSaved(savedPlanWords(draft.name));
      setWritten((count) => count + 1);
      // A new plan STOPS being new the moment it commits, so the address stops saying that it is.
      // Otherwise pressing save twice writes the plan twice.
      if (!amending) navigate(dietAmendPlan(clientId, stored.record_id));
    } catch (error) {
      // The record's own sentences, labelled and reworded nowhere. The content is passed so a path
      // like `days[2].entries[0].time` can be named as the day and the meal he was typing in.
      setRefusal(describePlanRefusal(
        error,
        planContentFromDraft(draft, { clientId, status: NEW_PLAN_STATUS }),
      ));
    } finally {
      setSaving(false);
    }
  }

  async function makeCurrent(): Promise<void> {
    if (store === null || clientId === null || !amending || editing === null) return;
    beginWrite();
    try {
      const result = await makePlanCurrent(store, {
        clientId, planId: editing, plans: readPlans?.items ?? [],
      });
      setSaved(madeCurrentWords(result));
      setWritten((count) => count + 1);
    } catch (error) {
      // The demotions may have committed while the promotion did not, which leaves the client with
      // no current plan. That is carried on the error by `makePlanCurrent` and it is SAID, because
      // the alternative is him discovering it by opening the diet and finding no chart.
      const partial = (error as { madeCurrent?: MadeCurrent }).madeCurrent;
      setWritten((count) => count + 1);
      setFailure(partial === undefined
        ? verbatimOf(error)
        : `${leftWithNoCurrentWords(partial.demoted)} ${verbatimOf(error) ?? ''}`.trim());
    } finally {
      setSaving(false);
    }
  }

  async function confirmImport(imported: Record<string, unknown>): Promise<void> {
    if (store === null) return;
    beginWrite();
    try {
      await saveImportedPlan(store, imported);
      const name = typeof imported.name === 'string' ? imported.name : '';
      setSaved(savedWords(name));
      setWritten((count) => count + 1);
    } catch (error) {
      setFailure(verbatimOf(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-diet">
        <div className="inline">
          {/* The same mark the rail carries, so arriving here confirms the tap landed where he aimed. */}
          <Glyph name={destination.glyph} size="lead" decorative />
          <h2 id="screen-diet" className="title-screen">
            {destination.label}
          </h2>
        </div>

        {/*
          THE PICKER IS PUT AWAY WHILE HE IS WRITING, and that is about his work rather than about
          tidiness: every row on it is a link that leaves the screen, and leaving takes an unsaved
          draft with it. The way back is the labelled control on the surface itself.
        */}
        {known && !writing ? (
          <>
            <p className="screen-intro read">{picker.intro}</p>

            {!picker.empty && (
              <ul className="rows rows-boxed">
                {picker.items.map((client) => (
                  <ClientChoice
                    key={client.recordId}
                    client={client}
                    chosen={client.recordId === picker.chosenId}
                  />
                ))}
              </ul>
            )}

            {picker.moreWords !== null && <p className="muted read">{picker.moreWords}</p>}
          </>
        ) : null}

        {!known && <LocalStoreNotice opening={opening} />}
      </section>

      {/* THE PASTE SURFACE — the primary way a plan gets in. Nothing it shows is written until he
          presses the one control on it that writes. */}
      {writing && pasting && clientId !== null && (
        <DietImport
          clientId={clientId}
          clientName={reading.clientName}
          onConfirm={(imported) => { void confirmImport(imported); }}
          saving={saving}
          saved={saved}
          failure={failure}
        />
      )}

      {/* THE EDITOR. An existing plan is not opened until it has actually been read: seeding the
          draft from a store that has not answered yet would put an empty week in front of him and
          then save it over the plan he was trying to change. */}
      {writing && !pasting && editing !== null && clientId !== null && (
        amending && openPlan === null ? (
          <section className="card stack">
            <p className="read">
              {readPlans === null
                ? 'Reading this plan…'
                : 'That plan is not on this client’s history. Nothing has been changed.'}
            </p>
            <p>
              <Link className="btn" to={dietForClient(clientId)}>
                <Glyph name="link-back" size="inline" decorative />
                <span>{BACK_TO_THE_DIET}</span>
              </Link>
            </p>
          </section>
        ) : (
          <DietEditor
            clientId={clientId}
            clientName={reading.clientName}
            amending={amending}
            draft={draft}
            onDraft={takeDraft}
            onSave={() => { void save(); }}
            onMakeCurrent={amending ? () => { void makeCurrent(); } : null}
            saving={saving}
            refusal={refusal}
            saved={saved === null && failure !== null ? failure : saved}
          />
        )
      )}

      {known && !writing && report.chosen && (
        <section className="card stack" aria-labelledby="screen-diet-plan">
          <h3 id="screen-diet-plan" className="title-section">
            {report.chartCaption ?? report.statement ?? ''}
          </h3>

          {/* The history's own sentence: what they follow now, how many plans came before, how many
              drafts. One line, and it is the projection's rather than a second summary of it. */}
          {report.statement !== null && report.chartCaption !== null && (
            <p className="muted read">{report.statement}</p>
          )}

          {/*
            ANYTHING HE HAS TO RESOLVE HIMSELF, IN THE PROJECTION'S OWN WORDS — two plans both marked
            current, a status this application does not recognise, a plan belonging to somebody else.
            Nothing is resolved on his behalf and no winner is picked: being shown one of two current
            plans, acting on it, and never learning the other existed is the failure `history.js`
            exists to refuse. When the current plan is contested there is deliberately NO chart below
            this, because drawing either claimant would be this application choosing.
          */}
          {report.problems.length > 0 && (
            <section className="stack" role="alert">
              {report.problems.map((problem) => (
                <p key={problem} className="note note-warning read">
                  <Glyph name="note" size="inline" decorative />
                  <span>{problem}</span>
                </p>
              ))}
            </section>
          )}

          {/* A CLIENT WITH NO PLAN YET. The ordinary state of somebody just added, worded as one —
              never an error and never a blank panel. */}
          {report.noPlanWords !== null && <p className="read">{report.noPlanWords}</p>}

          {report.chart !== null && (
            <>
              <p className="note read">
                <Glyph name="note" size="inline" decorative />
                <span>{report.repeatsWords}</span>
              </p>

              {/* WHAT THE PLAN SAYS NOTHING ABOUT, NAMED. The chart holds only the days the plan
                  holds, because an empty Saturday column reads as a fast day — but an absent column
                  is silent, and silence reads the same way. So it is said in words. */}
              {report.shortWeekWords !== null && (
                <p className="note read">
                  <Glyph name="filter" size="inline" decorative />
                  <span>{report.shortWeekWords}</span>
                </p>
              )}

              {report.emptyChartWords !== null ? (
                <p className="read">{report.emptyChartWords}</p>
              ) : (
                <WeekChart chart={report.chart} caption={report.chartCaption ?? ''} />
              )}

              {/*
                SENDING THE WEEK — a supporting action on a reading surface, drawn under the chart
                it is about rather than beside the heading, because the screen exists to be READ and
                the export is what he does once he has read it.

                Both artefacts are made on this device by the export seam: no third-party service and
                nothing uploaded. DIET IS PLAINTEXT — there is no passphrase, no gate and no
                sensitivity marking on this path, and there is nothing here to switch on later.
              */}
              <section className="stack" aria-labelledby="screen-diet-send">
                <h4 id="screen-diet-send" className="title-section">{EXPORT_TITLE}</h4>

                {offer.instead !== null && <p className="read">{offer.instead}</p>}

                {offer.offered && (
                  <>
                    <p className="muted read">{EXPORT_WORDS}</p>

                    <div className="inline">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => { void sendWeek('picture'); }}
                        disabled={sending !== null}
                      >
                        <Glyph name="share" size="inline" decorative />
                        <span>{sending === 'picture' ? 'Making the image…' : SEND_AS_IMAGE}</span>
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => { void sendWeek('spreadsheet'); }}
                        disabled={sending !== null}
                      >
                        <Glyph name="export" size="inline" decorative />
                        <span>
                          {sending === 'spreadsheet' ? 'Making the spreadsheet…' : SEND_AS_SPREADSHEET}
                        </span>
                      </button>
                    </div>
                  </>
                )}

                {/*
                  WHERE IT ACTUALLY WENT, in the delivery layer's own sentence and reworded nowhere.
                  Only a share the platform ACCEPTED is worded as sent; a fallback download says it
                  was saved to this device, and closing the share sheet says nothing was sent — which
                  is not an error, because he decided it. `role="status"` rather than `alert`: this
                  is the answer to something he just did, not an interruption.
                */}
                {outcome !== null && (
                  <p className={`${EXPORT_MARKS[outcome.tone].className} read`} role="status">
                    <Glyph name={EXPORT_MARKS[outcome.tone].glyph} size="inline" decorative />
                    <span>{outcome.words}</span>
                  </p>
                )}
              </section>

              {/* The way back from an earlier plan to the one they follow now. Drawn only when he is
                  on an earlier one, because a control that returns him where he already is teaches
                  him that controls on this screen sometimes do nothing. */}
              {report.showingEarlier && clientId !== null && (
                <p>
                  <Link className="btn" to={dietForClient(clientId)}>
                    <Glyph name="link-back" size="inline" decorative />
                    <span>{BACK_TO_CURRENT}</span>
                  </Link>
                </p>
              )}
            </>
          )}

          {/*
            THE TWO WAYS A PLAN GETS WRITTEN, ON THE SCREEN THAT SHOWS THERE IS NOT ONE.

            PASTING IS NAMED FIRST and it is not a preference: he TRANSCRIBES his wife's plans, and
            an interface where typing is the obvious control is one he types the whole week into.

            The control that CHANGES a plan points at the plan actually drawn, taken from the report
            rather than worked out again here — which matters most in the case this screen is
            careful about, a contested current, where the honest answer is that nothing is drawn and
            so there is nothing to change.
          */}
          {clientId !== null && (
            <div className="inline">
              <Link className="btn btn-primary" to={dietImport(clientId)}>
                <Glyph name="add" size="inline" decorative />
                <span>{PASTE_A_PLAN}</span>
              </Link>
              <Link className="btn" to={dietNewPlan(clientId)}>
                <Glyph name="edit" size="inline" decorative />
                <span>{WRITE_A_PLAN}</span>
              </Link>
              {report.drawingPlanId !== null && (
                <Link className="btn" to={dietAmendPlan(clientId, report.drawingPlanId)}>
                  <Glyph name="edit" size="inline" decorative />
                  <span>{CHANGE_THIS_PLAN}</span>
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {known && !writing && report.history.length > 0 && clientId !== null && (
        <section className="card stack" aria-labelledby="screen-diet-history">
          <h3 id="screen-diet-history" className="title-section">
            {report.historyTitle}
          </h3>

          {report.historyIncomplete !== null && (
            <p className="muted read">{report.historyIncomplete}</p>
          )}

          <ul className="rows rows-boxed">
            {report.history.map((entry) => (
              <HistoryRow key={entry.planId} entry={entry} clientId={clientId} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * THE CALENDAR — the way into running a session, and nothing else.
 *
 * This file is the DRAWING and nothing else. Every judgement — what a valid selection is, what the
 * glance says, the wording of a first session and of one left unfinished, what each answer to
 * "where are you" actually does — is decided in `launcher.ts`, and every read and the one write live
 * in `launcher-source.ts`, where both can be asserted with no browser and no rendering at all. The
 * same split as `screens/clients.ts` and `ClientsScreen.tsx`.
 *
 * ## THERE ARE NO REMINDERS AND NO NOTIFICATIONS HERE, AND THERE IS NO MONTH GRID
 *
 * The destination is called Calendar because that is the coach's own word for where sessions live,
 * and the requirement behind it is that he can START one. He knows his own schedule; an application
 * that pesters him is the burden this product exists not to be. A month grid would be the obvious
 * thing to build from the name and would answer a question nobody asked, on the screen he uses with a
 * client already standing in front of him. `launcher.test.ts` asserts the absence rather than
 * trusting it, because an absent feature and a forgotten one look identical to the next editor.
 *
 * ## THE SECOND READ-WRITE SURFACE, AND IT DOES NOT RE-ASK THE QUESTION THE FIRST ANSWERED
 *
 * It takes the STORE from `platform/LocalStore.tsx` — the source the five reporting seams in
 * `main.tsx` are fed from, and deliberately not a sixth one. `client-register-source.ts` settled
 * that for the register and `launcher-source.ts` follows it; no seam was added and `seams.test.ts` is
 * untouched.
 *
 * ## THE STORE MAY NOT HAVE OPENED, AND THIS SCREEN MAY NOT PRETEND OTHERWISE
 *
 * A local database can refuse. When it has, this screen says so in the coach's words through
 * `LocalStoreNotice`, and it does NOT fall back on an empty roster: "nobody is on your register" read
 * off a store that never opened would be a nought this app never counted.
 *
 * ## DENSITY AND SPEED ARE THE REQUIREMENT, NOT THE POLISH
 *
 * Two people, a routine and a place must be a few taps with nothing collapsing or reflowing
 * underneath him. So the three choices sit in ONE card, as rows rather than as a wizard: nothing
 * appears or disappears as he chooses, except the joining-link box, which belongs to one answer and
 * would be a lie on the other. The panels below it — last time, unfinished, already done — are
 * separate cards because they are things he READS while choosing, not things he acts on.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import type { Destination } from '../shell/navigation';
import {
  WITH_CLIENT_KEY, aboutClientDescription, describeArrivedWith, registerAboutClient,
  selectionArrivingWith,
} from './circular-navigation';
import {
  GLANCE_NOBODY_CHOSEN, HISTORY_EMPTY, HISTORY_INTRO, HISTORY_NOBODY_CHOSEN, HISTORY_TITLE,
  LAUNCHER_INTRO, MODE_CHOICES, NO_CLIENTS, NO_ROUTINES, PASTED_LINK_HINT,
  PASTED_LINK_LABEL, SECTION_TITLES, UNFINISHED_INTRO, UNFINISHED_TITLE, chooseMode, chooseRoutine,
  describeGlance, describeHistory, describeOutcome, describeStart, describeUnfinished, linkToStore,
  pasteLink, toggleClient,
} from './launcher';
import type {
  GlanceReport, OutcomeReport, Selection, SessionPerson, SessionRecord,
} from './launcher';
import {
  pickUpTheSession, readGlancesInto, readHistoryInto, readLaunchpadInto, startTheSession,
} from './launcher-source';
import type { GlanceReading, Launchpad } from './launcher-source';
import type { LocalStore } from '../../core/store/store.js';

/**
 * What was read, and WHICH store it was read from.
 *
 * The store is carried so a page belonging to a store that has since been replaced is discarded
 * during render rather than by an effect whose only job is to reset state — the same reason
 * `ClientsScreen` and `RemovalsFromStore` carry theirs.
 */
interface Read<T> {
  readonly from: LocalStore;
  readonly what: T;
}

/**
 * One choosable thing, as a row that toggles.
 *
 * NOT INSIDE A LIST, and that was decided by looking. The read-only rows elsewhere in this
 * application are `<li className="row">`, where the list item IS the row and its `display: flex`
 * quietly removes the marker the user agent would otherwise draw. Wrapping a BUTTON in an `<li>`
 * breaks that: the list item keeps its default display, and every row rendered with a bullet beside
 * it. A group of two-state buttons is what this is, `role="group"` says so, and the heading above
 * names it — so there is no list to have a marker.
 */
function ChoiceRow({
  chosen, name, onChoose,
}: {
  chosen: boolean;
  name: string;
  onChoose: () => void;
}) {
  return (
    // `row-toggle`: the row rhythm at the 44px target this application holds anything tapped during
    // a session to. `.row` alone binds --row-height, which is 40px in the compact density and
    // therefore UNDER that floor — a named token that is nonetheless the wrong one, which has
    // already shipped a 26px control in this build once.
    <button
      type="button"
      className="row row-toggle row-wrap"
      aria-pressed={chosen}
      onClick={onChoose}
    >
      {/*
        The mark differs by SILHOUETTE between chosen and not — a tick against a plus — because
        colour is lost to a colour-blind reader, to sunlight and to a greyscale screenshot. The word
        beside it says the same thing again.
      */}
      <Glyph name={chosen ? 'session-finish' : 'add'} size="inline" decorative />
      <span className="row-name">{name}</span>
      {chosen && <span className="row-value nowrap">Chosen</span>}
    </button>
  );
}

/** What one person did last time. It SHOWS; nothing here suggests anything. */
function GlancePanel({ report }: { report: GlanceReport }) {
  return (
    <div className="stack-tight">
      <p className="read">
        <strong>{report.headline}</strong>
      </p>

      {report.partialWords !== null && (
        <p className="note read">
          <Glyph name="session-pause" size="inline" decorative />
          <span>{report.partialWords}</span>
        </p>
      )}

      {report.nothingRecorded !== null && <p className="muted read">{report.nothingRecorded}</p>}

      {report.performed.length > 0 && (
        <ul className="rows">
          {report.performed.map((words, at) => (
            // The list is a projection of one session in the order it ran; there is no identity on
            // a line of it to key by, and the order is the meaning.
            // eslint-disable-next-line react/no-array-index-key
            <li key={`${report.clientId}-performed-${at}`} className="row row-static row-wrap">
              <span className="row-sentence">{words}</span>
            </li>
          ))}
        </ul>
      )}

      {/* `inline` and not `muted read` alone: `.muted read` is not a flex row, so the mark sat
          jammed against the first word with no gap. `.note` supplies that gap but is a panel, and
          this is one quiet line. Measured by looking, not by reading the class names. */}
      {report.readings.length > 0 && (
        <p className="inline muted read">
          <Glyph name="reading-heart-rate" size="inline" decorative />
          <span>{report.readings.join(' · ')}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The people in one session, each a way back to them on the register.
 *
 * A LINK PER PERSON rather than one link to the register, because "back to the people in it" is
 * about a person and not about a screen. The visible words are the name — that is what he is reading
 * the row for — and the accessible name says where it goes, so a screen reader does not announce
 * four links called nothing but names.
 *
 * There is deliberately no contextual trail on the other end of this. Both ends of the loop are
 * DESTINATIONS today, and `shell/trail.ts` refuses a destination for a reason that still holds; see
 * `circular-navigation.ts` for the whole argument and for the trap in it.
 */
function SessionPeople({ people }: { people: readonly SessionPerson[] }) {
  if (people.length === 0) return null;

  return (
    // `inline` rather than a list: these are two or three names on one line beside a sentence, and
    // `.rows` would give each its own 44px row and turn a roster into a stack.
    <span className="inline">
      <Glyph name="nav-clients" size="inline" decorative />
      {people.map((person) => (
        <Link
          key={person.clientId}
          to={registerAboutClient(person.clientId)}
          aria-label={aboutClientDescription(person.name)}
        >
          {person.name}
        </Link>
      ))}
    </span>
  );
}

export function CalendarScreen({ destination }: { destination: Destination }) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;

  // WHO HE CAME HERE TO TRAIN, if he arrived from a person's row on the register. A query on this
  // destination rather than an address of its own: this is the calendar with one answer already
  // filled in, not a second place. `circular-navigation.ts` owns the key and the words.
  const [address] = useSearchParams();
  const arrivedWith = address.get(WITH_CLIENT_KEY);

  // The chosen set STARTS with him and is his from that moment: this is the initial value of state,
  // not a value forced on every render, so unchoosing him sticks. A screen that re-imposed the
  // address's answer would be a screen he cannot argue with.
  const [selection, setSelection] = useState<Selection>(() => selectionArrivingWith(arrivedWith));
  // Bumped after a session starts or is picked up, so the unfinished list is read again. He has just
  // changed what is open; a list that still showed the old answer would be the screen lying about
  // the one thing he pressed.
  const [reloads, setReloads] = useState(0);
  const [launchpad, setLaunchpad] = useState<Read<Launchpad> | null>(null);
  const [glances, setGlances] = useState<Read<GlanceReading> | null>(null);
  const [history, setHistory] = useState<Read<readonly SessionRecord[]> | null>(null);

  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeReport | null>(null);

  const chosenIds = selection.clientIds;
  // The identity of the chosen set, so the two effects below re-run when the SET changes and not on
  // every render that happens to rebuild the array.
  const chosenKey = chosenIds.join(',');

  useEffect(() => {
    if (store === null) return undefined;
    return readLaunchpadInto(store, (what) => setLaunchpad({ from: store, what }));
  }, [store, reloads]);

  useEffect(() => {
    if (store === null) return undefined;
    return readGlancesInto(store, chosenKey === '' ? [] : chosenKey.split(','), (what) =>
      setGlances({ from: store, what }));
  }, [store, chosenKey, reloads]);

  useEffect(() => {
    if (store === null) return undefined;
    return readHistoryInto(store, chosenKey === '' ? [] : chosenKey.split(','), (what) =>
      setHistory({ from: store, what }));
  }, [store, chosenKey, reloads]);

  const pad = launchpad !== null && launchpad.from === store ? launchpad.what : null;

  /** Every person's name by identity, for reading a session's roster back. */
  const namesById = useMemo(() => {
    const found = new Map<string, string>();
    for (const client of pad?.clients.items ?? []) found.set(client.record_id, client.content.name);
    return found;
  }, [pad]);

  /** Every routine's name by its content key, which is what a session references it by. */
  const routineNames = useMemo(() => {
    const found = new Map<string, string>();
    for (const routine of pad?.routines.items ?? []) found.set(routine.content.id, routine.content.name);
    return found;
  }, [pad]);

  const chosenNames = chosenIds.map((id) => namesById.get(id) ?? id);
  const routineName = selection.routineId === null
    ? null
    : routineNames.get(selection.routineId) ?? null;
  const start = describeStart(selection, chosenNames, routineName);

  /**
   * The people in a session, by identity AND name.
   *
   * Somebody whose name cannot be read back is left out rather than shown as their identity: a row
   * reading "client-8f2a" is a machine talking, and the reports below already say "this session"
   * when the roster comes back empty. The identity is carried because each name is a way back to
   * that person, and a link needs to know who it is about.
   */
  const peopleOf = useCallback(
    (session: SessionRecord): readonly SessionPerson[] =>
      session.content.client_ids
        .map((id) => ({ clientId: id, name: namesById.get(id) }))
        .filter((person): person is SessionPerson => person.name !== undefined),
    [namesById],
  );

  const pressStart = useCallback(async () => {
    if (store === null || starting || !start.canStart) return;
    // `canStart` has already established all three, and the compiler cannot see that through it.
    if (selection.routineId === null || selection.mode === null) return;

    setStarting(true);
    setOutcome(null);
    try {
      const answer = await startTheSession(store, {
        routineId: selection.routineId,
        clientIds: selection.clientIds,
        // HIS ANSWER, explicitly, every time. Nothing here defaults it and the core no longer does.
        mode: selection.mode,
        meetUrl: linkToStore(selection),
      });
      setOutcome(describeOutcome(answer));
      setReloads((count) => count + 1);
    } catch (error: unknown) {
      console.error('[calendar] the session could not be started', error);
      setOutcome({
        started: false,
        headline: 'That session could not be started on this device.',
        // The failure's own text, kept verbatim: he may have to read it out.
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        sessionId: null,
      });
    } finally {
      setStarting(false);
    }
  }, [store, starting, start.canStart, selection]);

  const pressPickUp = useCallback(
    async (sessionId: string) => {
      if (store === null || starting) return;
      setStarting(true);
      setOutcome(null);
      try {
        setOutcome(describeOutcome(await pickUpTheSession(store, sessionId)));
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        console.error('[calendar] the session could not be picked up', error);
        setOutcome({
          started: false,
          headline: 'That session could not be opened on this device.',
          detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          sessionId,
        });
      } finally {
        setStarting(false);
      }
    },
    [store, starting],
  );

  const known = opening.state === 'open';
  // What to say about a person the address chose for him. His name is only known once the register
  // has been read back, and the notice words both states rather than waiting for the second.
  const arrived = describeArrivedWith(
    arrivedWith,
    arrivedWith === null ? null : namesById.get(arrivedWith) ?? null,
  );
  const unfinished = pad?.unfinished ?? [];
  const done = history !== null && history.from === store ? history.what : [];
  const glanceReading = glances !== null && glances.from === store ? glances.what : null;

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-calendar">
        <div className="inline">
          {/* The same mark the rail carries, so arriving here confirms the tap landed where he aimed. */}
          <Glyph name={destination.glyph} size="lead" decorative />
          <h2 id="screen-calendar" className="title-screen">
            {destination.label}
          </h2>
        </div>

        {known ? (
          <>
            <p className="screen-intro read">{LAUNCHER_INTRO}</p>

            {/*
              HE ARRIVED FROM SOMEBODY'S ROW, SO SAY SO. A screen that opens with a choice already
              made and mentions nothing has decided for him — and the rows on the register are names
              one thumb-width apart, so tapping the wrong one is ordinary rather than careless. The
              version of this that costs him something is the one where he finds out after the
              session is running under the wrong name.

              A NOTE AND NOT A WARNING: nothing is wrong, and the way to change it is the same toggle
              he would have used to choose in the first place. There is deliberately no second
              "clear" control — a second way to undo something that already has one is a second
              thing to find.
            */}
            {arrived.present && (
              <div className="note read" role="status">
                <Glyph name="nav-clients" size="inline" decorative />
                <div className="stack-tight">
                  <span>{arrived.words}</span>
                  <span className="muted">{arrived.howToChange}</span>
                </div>
              </div>
            )}

            <h3 id="screen-calendar-who" className="title-section">{SECTION_TITLES.clients}</h3>
            {pad === null || pad.clients.items.length === 0 ? (
              <p className="muted read">{NO_CLIENTS}</p>
            ) : (
              <>
                <div className="rows rows-boxed" role="group" aria-labelledby="screen-calendar-who">
                  {pad.clients.items.map((client) => (
                    <ChoiceRow
                      key={client.record_id}
                      chosen={chosenIds.includes(client.record_id)}
                      name={client.content.name}
                      onChoose={() => setSelection((held) => toggleClient(held, client.record_id))}
                    />
                  ))}
                </div>
                {!pad.clients.done && (
                  <p className="muted read">
                    There are more people on your register than these. They are shown in name order.
                  </p>
                )}
              </>
            )}

            <h3 id="screen-calendar-which" className="title-section">{SECTION_TITLES.routine}</h3>
            {pad === null || pad.routines.items.length === 0 ? (
              <p className="muted read">{NO_ROUTINES}</p>
            ) : (
              <>
                {/*
                  THE ROUTINE'S NAME AND NOTHING ELSE. A chip carrying `focus` was drawn here and
                  removed after looking at it: `focus` is a machine vocabulary — it rendered as a
                  boxed lowercase "push" beside a routine the coach had named "Pull Day Back And
                  Biceps", which reads as a contradiction rather than as a category. He picks a
                  routine by the name he gave it.
                */}
                <div className="rows rows-boxed" role="group" aria-labelledby="screen-calendar-which">
                  {pad.routines.items.map((routine) => (
                    <ChoiceRow
                      key={routine.record_id}
                      chosen={selection.routineId === routine.content.id}
                      name={routine.content.name}
                      onChoose={() =>
                        setSelection((held) => chooseRoutine(held, routine.content.id))}
                    />
                  ))}
                </div>
                {!pad.routines.done && (
                  <p className="muted read">There are more routines in your library than these.</p>
                )}
              </>
            )}

            {/*
              WHERE HE IS, ASKED AND NEVER ASSUMED. Neither answer is pre-selected: a screen that
              opened with "Online" already chosen would answer for him, and a session held in a room
              would go on record as a call — the exact ambiguity this field exists to end. The start
              control stays refused until he has said.

              A radio group rather than two toggles, because the two answers are exclusive and a
              radio group says so to a keyboard and to a screen reader without this screen having to.
            */}
            {/* `stack` and not `field`: `.field input` gives an input a border, a background and a
                44px box, which is right for something typed into and wrong for a radio — it drew
                each one as an empty input box with a dot in it. */}
            <fieldset className="stack">
              <legend className="title-section">{SECTION_TITLES.mode}</legend>
              {MODE_CHOICES.map((choice) => (
                <div key={choice.value} className="stack-tight">
                  {/* `choice` is the TARGET: the whole label, full width and 44px tall. The radio's
                      own box is the 24px mark inside it, which is what a radio is. */}
                  <label className="choice" htmlFor={`session-mode-${choice.value}`}>
                    <input
                      id={`session-mode-${choice.value}`}
                      type="radio"
                      name="session-mode"
                      value={choice.value}
                      checked={selection.mode === choice.value}
                      onChange={() => setSelection((held) => chooseMode(held, choice.value))}
                    />
                    <span>{choice.label}</span>
                  </label>
                  {/* Permanent, at the reading floor: it is what choosing this answer DOES, and the
                      in-person half is a promise about what the app does not do out of his sight. */}
                  <p className="muted read">{choice.consequence}</p>
                </div>
              ))}
            </fieldset>

            {/* Only on the online answer. On the other it would be a control that cannot do what
                its words say — the record refuses a link on an in-person session outright. */}
            {selection.mode === 'online' && (
              <div className="field">
                <label htmlFor="session-meet-url">{PASTED_LINK_LABEL}</label>
                <input
                  id="session-meet-url"
                  name="meet_url"
                  type="url"
                  autoComplete="off"
                  aria-describedby="session-meet-url-hint"
                  value={selection.pastedLink}
                  onChange={(event) =>
                    setSelection((held) => pasteLink(held, event.target.value))}
                />
                <p id="session-meet-url-hint" className="muted read">
                  {PASTED_LINK_HINT}
                </p>
              </div>
            )}

            {/* Read back beside the button, so what he is about to start is on screen. */}
            {start.summary !== null && <p className="read">{start.summary}</p>}

            {start.secondInstanceHint !== null && (
              <p className="note read">
                <Glyph name="note" size="inline" decorative />
                <span>{start.secondInstanceHint}</span>
              </p>
            )}

            {/* What is still needed, as the thing to do rather than as a fault. Never a warning
                band: he has not made a mistake, he simply has not finished choosing. */}
            {start.missing.length > 0 && (
              <ul className="rows">
                {start.missing.map((words) => (
                  <li key={words} className="row row-static row-wrap">
                    <span className="row-sentence">{words}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="spread">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!start.canStart || starting}
                onClick={() => void pressStart()}
              >
                <Glyph name="session-start" size="inline" decorative />
                {start.label}
              </button>
            </div>

            {outcome !== null && (
              <section className="stack" role="status">
                <p className={outcome.started ? 'note read' : 'note note-danger read'}>
                  <Glyph
                    name={outcome.started ? 'session-start' : 'sync-failed'}
                    size="inline"
                    decorative
                  />
                  <span>{outcome.headline}</span>
                </p>
                {outcome.detail !== null && (
                  <blockquote className="note read">
                    <span>{outcome.detail}</span>
                  </blockquote>
                )}
              </section>
            )}
          </>
        ) : (
          <LocalStoreNotice opening={opening} />
        )}
      </section>

      <section className="card stack" aria-labelledby="screen-calendar-glance">
        <h3 id="screen-calendar-glance" className="title-section">
          {SECTION_TITLES.glance}
        </h3>
        {chosenIds.length === 0 ? (
          <p className="muted read">{GLANCE_NOBODY_CHOSEN}</p>
        ) : (
          (glanceReading?.items ?? []).map((found) => (
            <GlancePanel
              key={found.clientId}
              report={describeGlance(
                found.clientId,
                namesById.get(found.clientId) ?? found.clientId,
                found.glance,
                found.glance === null ? null : routineNames.get(found.glance.routine_id) ?? null,
                glanceReading?.exerciseNames,
              )}
            />
          ))
        )}
      </section>

      {/* Offered whenever there is one, whoever is chosen: a session he left open is a session he
          left open, and hiding it behind a selection would be hiding the thing he came back for. */}
      {unfinished.length > 0 && (
        <section className="card stack" aria-labelledby="screen-calendar-unfinished">
          <h3 id="screen-calendar-unfinished" className="title-section">
            {UNFINISHED_TITLE}
          </h3>
          <p className="read">{UNFINISHED_INTRO}</p>
          <ul className="rows rows-boxed">
            {unfinished.map((session) => {
              const report = describeUnfinished(
                session,
                routineNames.get(session.content.routine_id) ?? null,
                peopleOf(session),
              );
              return (
                <li key={report.sessionId} className="row row-static row-wrap">
                  <span className="row-sentence">{report.words}</span>
                  {/* The way back to the people in it. It is on the row rather than behind the
                      pick-up control, because reaching a person is not the same act as resuming
                      their session and must not be reached through it. */}
                  <SessionPeople people={report.people} />
                  <span className="chip">{report.modeWords}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={starting}
                    onClick={() => void pressPickUp(report.sessionId)}
                  >
                    <Glyph name="session-start" size="inline" decorative />
                    {report.pickUpLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card stack" aria-labelledby="screen-calendar-history">
        <h3 id="screen-calendar-history" className="title-section">
          {HISTORY_TITLE}
        </h3>
        <p className="muted read">{HISTORY_INTRO}</p>
        {chosenIds.length === 0 ? (
          <p className="muted read">{HISTORY_NOBODY_CHOSEN}</p>
        ) : done.length === 0 ? (
          <p className="muted read">{HISTORY_EMPTY}</p>
        ) : (
          <ul className="rows rows-boxed">
            {done.map((session) => {
              const report = describeHistory(
                session,
                routineNames.get(session.content.routine_id) ?? null,
                peopleOf(session),
              );
              return (
                <li key={report.sessionId} className="row row-static row-wrap">
                  <span className="row-sentence">{report.words}</span>
                  <SessionPeople people={report.people} />
                  <span className="chip">{report.statusWords}</span>
                  <span className="row-value nowrap">{report.modeWords}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

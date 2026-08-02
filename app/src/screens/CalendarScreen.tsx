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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { useViewportWidth } from '../design/viewport-width';
import { LibraryNotice, LocalStoreNotice, useLibrarySeeding, useLocalStore } from '../platform/LocalStore';
import { librarySnag } from '../platform/library-seeding';
import type { Destination } from '../shell/navigation';
import {
  WITH_CLIENT_KEY, aboutClientDescription, describeArrivedWith, registerAboutClient,
  selectionArrivingWith,
} from './circular-navigation';
import { UserGesture } from '../platform/google-identity';
import { googleOnThisDevice } from '../platform/google-on-this-device';
import {
  GLANCE_NOBODY_CHOSEN, HISTORY_EMPTY, HISTORY_INTRO, HISTORY_NOBODY_CHOSEN, HISTORY_TITLE,
  LAUNCHER_INTRO, LINK_CHOICES, LINK_QUESTION, MODE_CHOICES, NO_CLIENTS, NO_ROUTINES,
  LINK_PASTED, PASTE_AFTERWARDS_BUTTON, PASTE_AFTERWARDS_LABEL,
  PASTED_LINK_HINT, PASTED_LINK_LABEL, SECTION_TITLES, UNFINISHED_INTRO, UNFINISHED_TITLE,
  chooseLinkPlan, chooseMode, chooseRoutine, describeFailedLaunchpadRead, describeGlance,
  describeAcquire, describeHistory, describeMint, describeOutcome, describeStart, describeUnfinished,
  linkToStore,
  pasteLink, preselectLastChoice, readLastSessionChoice, shouldMint, toggleClient,
  writeLastSessionChoice,
} from './launcher';
import type {
  GlanceReport, MintReport, OutcomeReport, RoutineRecord, Selection, SessionPerson, SessionRecord,
} from './launcher';
import {
  LAUNCHPAD_NOT_READ_YET, attachTheLink, mintTheLink, pickUpTheSession, readGlancesInto,
  readHistoryInto, readLaunchpadInto, startTheSession,
} from './launcher-source';
import type { GlanceReading, LaunchpadReading } from './launcher-source';
import {
  RUNNER_ADDRESS, RUNNER_WAY_IN_LABEL, RUNNER_WAY_IN_WORDS, sessionAddress,
} from './runner';
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
  // Whether the shipped library reached this device. Read here and worded below, where the routine
  // list is empty — this is the screen the coach meets that fact on, because it is the screen where
  // an empty library stops him doing the thing he opened the app to do.
  const snag = librarySnag(useLibrarySeeding());

  // WHO HE CAME HERE TO TRAIN, if he arrived from a person's row on the register. A query on this
  // destination rather than an address of its own: this is the calendar with one answer already
  // filled in, not a second place. `circular-navigation.ts` owns the key and the words.
  const [address] = useSearchParams();
  const arrivedWith = address.get(WITH_CLIENT_KEY);

  // WHERE A STARTED SESSION GOES. The runner is the screen that runs it, and it is reached rather
  // than rendered in place: the address is what survives a refresh, and the coach mid-session whose
  // laptop slept comes back to it by that address.
  const goToTheSession = useNavigate();

  // The chosen set STARTS with him and is his from that moment: this is the initial value of state,
  // not a value forced on every render, so unchoosing him sticks. A screen that re-imposed the
  // address's answer would be a screen he cannot argue with.
  const [selection, setSelection] = useState<Selection>(() => selectionArrivingWith(arrivedWith));
  // Bumped after a session starts or is picked up, so the unfinished list is read again. He has just
  // changed what is open; a list that still showed the old answer would be the screen lying about
  // the one thing he pressed.
  const [reloads, setReloads] = useState(0);
  const [launchpad, setLaunchpad] = useState<Read<LaunchpadReading> | null>(null);
  const [glances, setGlances] = useState<Read<GlanceReading> | null>(null);
  const [history, setHistory] = useState<Read<readonly SessionRecord[]> | null>(null);

  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeReport | null>(null);
  // WHAT CAME OF ASKING FOR A JOINING LINK, and it is state rather than a passing message because
  // its failure carries a way out he has to be able to act on: the paste box below is drawn from it.
  const [mint, setMint] = useState<MintReport | null>(null);
  // The session a link is still owed to. Set when a mint did not produce one, so what he pastes
  // afterwards lands on the session that has ALREADY STARTED rather than on a new one.
  const [awaitingLink, setAwaitingLink] = useState<string | null>(null);
  const [afterwards, setAfterwards] = useState('');

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

  /**
   * THE FIRST READ, AS ONE OF THREE STATES — and `pad` is now reachable only from ONE of them.
   *
   * It used to be `Launchpad | null`, which merged two different facts into one value: the read has
   * not landed, and the read FAILED. `null` is worded below as "nobody is on your register", so a
   * failed read told a coach with forty clients that he had none. `launcher-source.ts` states the
   * whole of it; what matters here is that the empty-register wording is now unreachable from the
   * failed state, by the compiler rather than by everyone remembering.
   */
  const reading: LaunchpadReading = launchpad !== null && launchpad.from === store
    ? launchpad.what
    : LAUNCHPAD_NOT_READ_YET;
  const pad = reading.status === 'read' ? reading.launchpad : null;
  /** The report drawn INSTEAD of the two lists when the read failed. Null in the other two states. */
  const couldNotRead = reading.status === 'failed'
    ? describeFailedLaunchpadRead(reading.failure)
    : null;

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

  /**
   * Every routine's whole RECORD by its content key.
   *
   * Handed to the core when a session opens, so the live handle the runner receives already carries
   * the routine and projects a view with its lines in it. Without one the view still describes
   * everything that HAPPENED, but "what has nothing recorded against it yet" would be unknown — and
   * this screen has the record in its hand, so making the runner re-read it would be a second read
   * of something already here.
   */
  const routinesByKey = useMemo(() => {
    const found = new Map<string, RoutineRecord>();
    for (const routine of pad?.routines.items ?? []) found.set(routine.content.id, routine);
    return found;
  }, [pad]);

  /*
    LAST TIME'S PEOPLE AND ROUTINE, OFFERED AGAIN — once, when the register first lands, and only
    onto a selection he has not touched. Arriving with a client in the address wins over the memory,
    an id whose person or routine is gone is dropped, and `mode` is never remembered: it records
    where the session actually happens and is answered every time. Un-choosing what was offered
    sticks, because this runs once rather than on every render.
  */
  const offeredLastChoice = useRef(false);
  useEffect(() => {
    if (pad === null || offeredLastChoice.current) return;
    offeredLastChoice.current = true;
    if (arrivedWith !== null) return;
    setSelection((held) => {
      if (held.clientIds.length > 0 || held.routineId !== null || held.mode !== null) return held;
      return preselectLastChoice(
        held,
        readLastSessionChoice(window.localStorage),
        new Set(namesById.keys()),
        new Set(routinesByKey.keys()),
      );
    });
  }, [pad, arrivedWith, namesById, routinesByKey]);

  const chosenNames = chosenIds.map((id) => namesById.get(id) ?? id);
  const routineName = selection.routineId === null
    ? null
    : routineNames.get(selection.routineId) ?? null;
  /*
    HOW WIDE THE WINDOW IS — measured here and judged in `launcher.ts`, which is the same split this
    screen keeps everywhere else. It decides one thing: whether the second-window hint is said at
    all. A phone cannot open a second window, so on a phone that sentence is advice he cannot
    follow, and CSS cannot withhold it — `display: none` leaves the words in the markup.
  */
  const viewportWidth = useViewportWidth();
  const start = describeStart(selection, chosenNames, routineName, viewportWidth);

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

  /**
   * START, AND MINT THE JOINING LINK IF THAT IS WHAT HE ASKED FOR.
   *
   * ## The session first, the link second, and never the other way round
   *
   * The identifier that makes a retry idempotent is derived from the session's own id, so there is
   * nothing stable to send Google until the session has been written. One session, one meeting link,
   * however many times this is retried. And the ordering is what makes the whole path safe: by the
   * time anything is asked of Google the session is REAL and is being recorded into, so no answer
   * Google gives — and no answer it fails to give — can cost him the session he just started.
   *
   * ## The token is acquired INSIDE THE TAP, because there is nowhere else it can be
   *
   * There is no refresh token on this origin and none is obtainable, so a token lives about an hour
   * and is renewed only in a gesture. Minting a link IS such a gesture, so the acquisition happens
   * here, from the event the browser marked trusted. There is no second token path and no background
   * renewal to fall back on.
   *
   * ## HE IS ONLY TAKEN TO THE RUNNER ONCE THE LINK QUESTION IS SETTLED
   *
   * When a link was made, or when he never asked for one, the runner is where he goes. When the mint
   * came back without one, he STAYS HERE — because every one of those sentences ends by telling him
   * he can paste a link instead, and navigating away from the only box he could paste it into would
   * be a dead end wearing the words of a way out. The session is started either way and is one tap
   * away below.
   */
  const pressStart = useCallback(async (event: { isTrusted?: boolean; type?: string }) => {
    if (store === null || starting || !start.canStart) return;
    // `canStart` has already established all three, and the compiler cannot see that through it.
    if (selection.routineId === null || selection.mode === null) return;

    setStarting(true);
    setOutcome(null);
    setMint(null);
    setAwaitingLink(null);
    try {
      const minting = shouldMint(selection);
      // Asked for BEFORE the session is written, so the popup rides the gesture that is still live.
      // A token acquired after two awaits is a token the browser refuses to open a window for.
      // When the gesture comes back short, the session still starts — but the mint is not attempted,
      // because its specific sentence (declined, unconfigured, scope missing) beats the generic
      // credential sentence the doomed call would produce.
      let acquireReport: MintReport | null = null;
      if (minting) {
        const acquired = await googleOnThisDevice().connection
          .acquireForGesture(UserGesture.fromTrustedEvent(event));
        acquireReport = describeAcquire(acquired);
      }

      const answer = await startTheSession(store, {
        routineId: selection.routineId,
        clientIds: selection.clientIds,
        // HIS ANSWER, explicitly, every time. Nothing here defaults it and the core no longer does.
        mode: selection.mode,
        meetUrl: linkToStore(selection),
        routine: routinesByKey.get(selection.routineId) ?? null,
      });
      setOutcome(describeOutcome(answer));
      setReloads((count) => count + 1);

      if (!answer.ok || answer.session_id === undefined) return;

      // Remembered only once the session is real, so a refusal never overwrites a working memory.
      writeLastSessionChoice(window.localStorage, {
        clientIds: selection.clientIds,
        routineId: selection.routineId,
      });

      if (minting) {
        const got = acquireReport ?? describeMint(await mintTheLink(
          store, googleOnThisDevice().meet, answer.session_id, new Date(),
        ));
        setMint(got);
        if (!got.linked) {
          // The exit has to be reachable, so he stays where the box is. See the note above.
          setAwaitingLink(answer.session_id);
          setReloads((count) => count + 1);
          return;
        }
      }

      // THE LEASE IS NOW HELD FOR THE RUNNER, so the runner is where he goes. Leaving him on the
      // calendar with a session open behind the screen would be this window holding a lease nothing
      // on screen is using.
      goToTheSession(sessionAddress(answer.session_id));
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
  }, [store, starting, start.canStart, selection, routinesByKey, goToTheSession]);

  /**
   * PASTE A LINK ONTO THE SESSION THAT HAS ALREADY STARTED — the exit, made real.
   *
   * This is what stops every "you can paste one instead" sentence in this screen being a form of
   * words. The session is running and this window holds its lease, so the link goes onto the record
   * through the held handle. `pasted` is the truth about where it came from, and the record holds a
   * link and its origin to travelling together.
   */
  const pressAttach = useCallback(async () => {
    if (store === null || awaitingLink === null) return;
    const link = afterwards.trim();
    if (link.length === 0) return;

    const written = await attachTheLink(store, awaitingLink, link, 'pasted');
    if (!written) {
      setMint({
        linked: false,
        headline: 'That link could not be saved onto the session. Check it starts with https:// and '
          + 'try again, or open the session and carry on without one.',
        offerPaste: true,
        url: null,
      });
      return;
    }
    setMint({ linked: true, headline: LINK_PASTED, offerPaste: false, url: link });
    setAwaitingLink(null);
    setAfterwards('');
    setReloads((count) => count + 1);
    goToTheSession(sessionAddress(awaitingLink));
  }, [store, awaitingLink, afterwards, goToTheSession]);

  const pressPickUp = useCallback(
    async (sessionId: string, routineKey: string) => {
      if (store === null || starting) return;
      setStarting(true);
      setOutcome(null);
      try {
        // PICKING UP IS THE SAME OPERATION AS STARTING, and it hands the lease over the same way —
        // a resumed session whose handle was dropped would put him in front of a runner that cannot
        // write, forty minutes into a session that already has facts in it.
        const answer = await pickUpTheSession(
          store, sessionId, routinesByKey.get(routineKey) ?? null,
        );
        setOutcome(describeOutcome(answer));
        setReloads((count) => count + 1);
        if (answer.ok) goToTheSession(sessionAddress(sessionId));
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
    [store, starting, routinesByKey, goToTheSession],
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

        {/*
          THE WAY INTO THE SESSION RUNNER, AND IT IS DRAWN IN EVERY STATE OF THIS SCREEN.

          Permanent, and never conditional on there being a session open — the same choice, for the
          same reason, as the links to the four other screens that are not destinations: a way in
          that appears only when there is something to see is a way in he cannot learn, and he needs
          it most in the state where this screen has least to say. It is also the way BACK to a
          session he is running after he has been somewhere else, which is the case that has no other
          answer: the runner is not in the navigation surface, deliberately, because a session is
          opened by starting or picking one up rather than walked into.

          `no-dead-ends.test.ts` requires exactly this of every route that is not a destination — a
          LABELLED link that RESOLVES, from a screen that is itself reachable — and it requires it of
          the screen as rendered, which includes the state where the local store has not opened.
        */}
        <p className="inline">
          <Glyph name="link-forward" size="inline" decorative />
          <Link to={RUNNER_ADDRESS}>{RUNNER_WAY_IN_LABEL}</Link>
        </p>
        <p className="muted read">{RUNNER_WAY_IN_WORDS}</p>

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

            {/*
              THE READ FAILED, AND IT SAYS SO ONCE, ABOVE BOTH LISTS.

              Once rather than twice because ONE read produced both of them: two notices would read
              as two faults. It sits ABOVE the sections rather than inside either, because what
              failed is the reading of this screen and not the choosing of a person.

              AND THE TWO EMPTY SENTENCES BELOW ARE SUPPRESSED IN THIS STATE. That is the fix and not
              a decoration: a notice above words that still say "nobody is on your register" leaves
              those words on the screen, and he reads the sentence, not the layout.
            */}
            {couldNotRead !== null && (
              <div className="note read" role="status">
                <Glyph name="nav-calendar" size="inline" decorative />
                <div className="stack-tight">
                  <span>{couldNotRead.headline}</span>
                  <span>{couldNotRead.whatFailed}</span>
                  <span>{couldNotRead.notAVerdict}</span>
                  <span className="muted">{couldNotRead.whatToDo}</span>
                  <span className="muted">{`${couldNotRead.stage} · ${couldNotRead.errorName}`}</span>
                </div>
              </div>
            )}

            <h3 id="screen-calendar-who" className="title-section">{SECTION_TITLES.clients}</h3>
            {/*
              NO_CLIENTS IS NOW REACHABLE ONLY FROM A READ THAT LANDED, and that is the fix rather
              than the notice above it.

              This branch used to be `pad === null || items.length === 0`, and `pad === null` was
              THREE different facts wearing one value: the read has not landed, the read FAILED, and
              there is genuinely nobody. It painted the third one's sentence for all three. So a
              coach with forty clients was told "Nobody is on your register yet. Add the people you
              train under Clients" — an instruction, on a failed read, on the screen a cold start
              lands on.
              `reading.status` is what separates them, and an unread register now draws a BLANK: an
              empty value DRAWN AS A BLANK is honest, and the same value WORDED AS A FACT is not.
            */}
            {reading.status !== 'read' || pad === null ? null
              : pad.clients.items.length === 0 ? (
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
            {/*
              WHY THERE IS NOTHING TO CHOOSE FROM, AND THE TWO ANSWERS ARE NOT THE SAME ANSWER.

              The shipped library is put on the device the first time the app opens there. So an
              empty routine list means the coach DELETED the routines, which is his decision and
              which the app does not undo behind him — {@link NO_ROUTINES} says exactly that. A
              library that could NOT be written is a different fact with a different thing to do
              about it, and showing the deletion sentence over it would tell him he deleted
              something that never arrived. `librarySnag` is the judgement and it is asserted with
              no rendering at all.
            */}
            {pad === null || pad.routines.items.length === 0 ? (
              <>
                <LibraryNotice condition={snag} />
                {/*
                  NO_ROUTINES SAYS HE DELETED HIS ROUTINES — a statement about something HE DID, and
                  the strongest false-fact on this screen after the register sentence. It is drawn
                  only from a read that LANDED, for the reason given above the clients section: over
                  an unread or failed read it accuses him of a deletion nothing measured.
                */}
                {snag === null && reading.status === 'read'
                  && <p className="muted read">{NO_ROUTINES}</p>}
              </>
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

            {/*
              HOW THIS SESSION GETS ITS LINK — and making one and pasting one are TWO ANSWERS TO ONE
              QUESTION rather than a feature and its fallback. Only on the online answer: on the
              other it would be a control that cannot do what its words say, because the record
              refuses a link on an in-person session outright.
            */}
            {selection.mode === 'online' && (
              <fieldset className="stack">
                <legend className="title-section">{LINK_QUESTION}</legend>
                {LINK_CHOICES.map((choice) => (
                  <div key={choice.value} className="stack-tight">
                    <label className="choice" htmlFor={`session-link-${choice.value}`}>
                      <input
                        id={`session-link-${choice.value}`}
                        type="radio"
                        name="session-link"
                        value={choice.value}
                        checked={selection.linkPlan === choice.value}
                        onChange={() => setSelection((held) => chooseLinkPlan(held, choice.value))}
                      />
                      <span>{choice.label}</span>
                    </label>
                    <p className="muted read">{choice.consequence}</p>
                  </div>
                ))}

                {/*
                  WHICH CALENDAR THIS LANDS ON, SAID BEFORE IT LANDS THERE — permanent, ahead of the
                  tap, never once-only and never afterwards. This application cannot create or even
                  find a calendar under the narrow scope it holds, so until he sets one aside the
                  events go on his own. That is a working state he can change, and it is honest only
                  for as long as it is on the screen.
                */}
                {selection.linkPlan === 'mint' && (
                  <p className="note read">
                    <Glyph name="note" size="inline" decorative />
                    <span>{googleOnThisDevice().meet.calendarNotice()}</span>
                  </p>
                )}

                {selection.linkPlan === 'paste' && (
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
              </fieldset>
            )}

            {/* Read back beside the button, so what he is about to start is on screen. */}
            {start.summary !== null && <p className="read">{start.summary}</p>}

            {start.secondInstanceHint !== null && (
              <p className="note read">
                <Glyph name="note" size="inline" decorative />
                <span>{start.secondInstanceHint}</span>
              </p>
            )}

            {/*
              THE SIXTY-MINUTE CUT, AT BOOKING TIME. Here rather than when the call drops: a session
              runs about an hour and Google cuts a group call at an hour on a free personal account,
              so for two clients this is the ordinary case. The words attribute it to Google and say
              it applies to a link he makes himself, so it does not read as this app being deficient.
            */}
            {start.groupCallWarning !== null && (
              <p className="note read">
                <Glyph name="note" size="inline" decorative />
                <span>{start.groupCallWarning}</span>
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
                // THE EVENT ITSELF is passed on, because a token can only be acquired inside
                // something the coach did: `UserGesture` is minted from an event the BROWSER marked
                // trusted, and there is no other way to obtain one.
                onClick={(event) => void pressStart(event.nativeEvent)}
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

            {/*
              WHAT CAME OF THE LINK, AND THE WAY OUT WHERE IT IS NEEDED.

              Never a danger band. Not one of these situations is a failure of the session: it has
              started, it is being recorded into, and what is in question is only the link. A red
              band here would tell him something went wrong with the thing that did not.
            */}
            {mint !== null && (
              <section className="stack" role="status">
                <p className="note read">
                  <Glyph name={mint.linked ? 'session-start' : 'note'} size="inline" decorative />
                  <span>{mint.headline}</span>
                </p>

                {/*
                  THE EXIT, AND IT IS A REAL ONE. Every sentence above ends by telling him he can
                  paste a link instead, so the box to paste it into is right here, pointed at the
                  session that has ALREADY STARTED. Without it those words would be a dead end
                  wearing the clothes of a way out.
                */}
                {mint.offerPaste && awaitingLink !== null && (
                  <div className="field">
                    <label htmlFor="session-meet-url-after">{PASTE_AFTERWARDS_LABEL}</label>
                    <input
                      id="session-meet-url-after"
                      name="meet_url_after"
                      type="url"
                      autoComplete="off"
                      value={afterwards}
                      onChange={(event) => setAfterwards(event.target.value)}
                    />
                    <div className="spread">
                      <button
                        type="button"
                        className="btn"
                        disabled={afterwards.trim().length === 0}
                        onClick={() => void pressAttach()}
                      >
                        <Glyph name="add" size="inline" decorative />
                        {PASTE_AFTERWARDS_BUTTON}
                      </button>
                    </div>
                  </div>
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
                    onClick={() => void pressPickUp(report.sessionId, session.content.routine_id)}
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

/**
 * SETUP — the place `CALENDAR_NOTICE` has been sending the coach to since before it existed.
 *
 * This file is the DRAWING and nothing else. Every sentence on it comes from one of three modules
 * where it can be asserted: `setup.ts` (the walk to the two ids, the links, the shape checks),
 * `setup-honesty.ts` (what to expect, what is encrypted, what is not claimed, the handover), and
 * `setup-surface.ts` (the headings, the tick words, the origin, and where a tick is remembered).
 * NOTHING IS RE-WORDED HERE and nothing new is decided here — a sentence written into markup is a
 * sentence only a human reading this file would notice going missing.
 *
 * ## THE STEP TITLE IS THE LINK
 *
 * USER-RULED: "Just use hyperlinks." Each step opens the specific Google console page it is about,
 * in a new tab, and the title is the link text — so there is no screenshot to go stale and no
 * directions through a menu Google can move. Each link carries the family's external mark, because
 * a link that leaves the application without saying so is a surprise on a phone, where a new tab is
 * a bigger event than on a laptop.
 *
 * A LINK IS A DESTINATION CLAIM LIKE ANY OTHER, so `setup-surface.test.ts` holds every href here to
 * being present, absolute, https and opening in a new tab, and holds the two in-application claims —
 * the heading the shipped notice names, and Admin's tooltip promise — against the source that
 * renders them rather than against a string written twice.
 *
 * ## THE TICKS AND THE PROOF ARE DIFFERENT THINGS AND ARE DRAWN AS DIFFERENT THINGS
 *
 * A tick records that HE SAYS he did a step. There is no progress count, no "setup complete" and
 * nothing anywhere on this screen that turns a column of ticks into a confirmation, because the
 * application cannot see what he did inside Google. `TICKS_ARE_YOURS` says so permanently, at the
 * top of the list rather than under it. Whether an id has ever actually WORKED is a separate
 * question with its own evidence and its own action; `setup-surface.ts` states that boundary.
 *
 * ## WHY THERE IS NO SYNCHRONISATION READING HERE
 *
 * The frame owns the one live accountability reading and `frame-structure.test.ts` forbids a screen
 * from taking a second. Nothing on this screen needs one: the two boxes are device settings, read
 * and written through `google-settings.ts`, and a storage refusal is drawn as the state it is.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';

import { Glyph } from '../design/Glyph';
import type { SmallFactStorage } from '../platform/google-identity';
import {
  ALGORITHM_FACTS, EXPECTATIONS, NOT_AUDITED, SECURITY_SENTENCES, WHO_CAN_READ_THE_NOTES,
} from './setup-honesty';
import { useSyncActionsIfWired } from '../shell/sync-actions';
import { CONSOLE_TRAPS, ORIGIN_RULE } from './setup';
import type { SetupStep } from './setup';
import {
  CARD_TITLES, CLEARED_HERE, CLEARING_TAKES_IT_BACK, COPY_THE_ORIGIN, NOT_SAVED_HERE,
  OPENS_IN_A_NEW_TAB, ORIGIN_COPIED, ORIGIN_NOT_COPIED, ORIGIN_NOT_KNOWN, SAME_CONNECTING,
  SAVED_HERE, SAVE_LABEL, SETUP_HEADING, SETUP_INTRO, SETUP_SECTIONS, TICKS_ARE_YOURS,
  TICKS_NOT_REMEMBERED, TRYING_THE_CLIENT_ID, TRY_THE_CLIENT_ID, rememberTicks, runningOrigin,
  setupStorage, standingFor, tickName, tickedSteps,
} from './setup-surface';
import type { SetupSection } from './setup-surface';

/**
 * One step: a tick he owns, and a link whose words are the step.
 *
 * The tick is NOT a `<label>` wrapping the title, which is the obvious construction and the wrong
 * one: the title is an anchor, and an anchor inside a label is a control inside a control — pressing
 * the link would also toggle the tick, so following a step would silently mark it done. The tick
 * carries its own accessible name saying what pressing it will do.
 */
function Step({
  step, ticked, onTick, besideTheLink,
}: {
  step: SetupStep;
  ticked: boolean;
  onTick: (id: string, next: boolean) => void;
  besideTheLink: string | null;
}) {
  return (
    <li>
      <div className="choice">
        <input
          type="checkbox"
          checked={ticked}
          aria-label={tickName(step, ticked)}
          onChange={(event) => onTick(step.id, event.target.checked)}
        />
        {/*
          `noopener noreferrer` on every one of these. `noopener` is the load-bearing half — a page
          opened with `target="_blank"` can otherwise reach back through `window.opener` and
          navigate the tab this application is running in, which on an installed application is the
          only tab he has.
        */}
        <a href={step.href} target="_blank" rel="noopener noreferrer" className="row-sentence">
          {step.title}
          {' '}
          <Glyph name="link-external" size="inline" label={OPENS_IN_A_NEW_TAB} />
        </a>
      </div>

      {/* AT THE LINK, never folded and never at the foot of the card: a warning about what a link
          does is read after he has followed it if it is anywhere else — and it stands BEFORE the
          clicks, because it is about the trip the first click takes. */}
      {besideTheLink !== null && (
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{besideTheLink}</span>
        </p>
      )}

      {/* The step's one-line why or what-to-check, under the act rather than folded into it. */}
      {step.detail !== undefined && (
        <p className="muted read step-detail">{step.detail}</p>
      )}

      {/* THE CLICKS THEMSELVES, numbered, on the page the link opens. Measured, and dated by the
          card's own advice date rather than pretending Google's pages hold still. */}
      {step.substeps !== undefined && (
        <ol className="steps step-substeps">
          {step.substeps.map((substep) => (
            <li key={substep} className="muted read">{substep}</li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * One box, with its key already attached by `setup.ts`.
 *
 * THE SHAPE CHECK RUNS AT THE POINT OF ENTRY, on what is in the box right now, so an obvious paste
 * error is named while he is still looking at the field rather than after he has moved on. It never
 * blocks the save — `setup.ts` declares that as data and argues it there.
 *
 * WHAT THE STORAGE ANSWERED IS SHOWN. `writeSetting` returns whether this device accepted the value
 * and REMOVES the name when the box is empty, which is how a setting is taken back. All three
 * outcomes — saved, cleared, refused — are different sentences, because a refusal that looked like a
 * save would leave the whole application behaving as though he had never typed anything.
 */
function Field({ section, storage }: { section: SetupSection; storage: SmallFactStorage | null }) {
  const { field } = section;
  const [typed, setTyped] = useState('');
  const [outcome, setOutcome] = useState<'saved' | 'cleared' | 'refused' | null>(null);
  /**
   * WHAT MOVED, so the statement is re-derived rather than remembered.
   *
   * A counter rather than a copy of the standing: what the statement says is a function of storage,
   * and holding the answer here would be a second place the truth lives. This says only that
   * something happened which could have changed it — a save, or a sign-in that settled.
   */
  const [revision, setRevision] = useState(0);
  const [standing, setStanding] = useState<ReturnType<typeof standingFor> | null>(null);

  const actions = useSyncActionsIfWired();
  const connecting = actions !== null && actions.running;

  // Read after mount rather than at module scope: this file is rendered by a suite that runs
  // outside a browser and has no storage to read.
  useEffect(() => {
    setTyped(field.read(storage) ?? '');
    setOutcome(null);
  }, [field, storage]);

  /**
   * THE STATEMENT, RE-DERIVED AT EVERY MOMENT IT COULD HAVE CHANGED.
   *
   * Three of them: the screen arriving, a save landing, and a connection attempt finishing —
   * `connecting` in the dependency list is what catches the last, because the proof is written by the
   * acquisition rather than by anything this screen can see directly. Nothing here decides the state;
   * `standingFor` reads what is saved and what has been proven and `setup.ts` words it.
   */
  useEffect(() => {
    setStanding(standingFor(storage, field));
  }, [field, storage, revision, connecting]);

  const check = field.check(typed);
  const boxId = `setup-${section.id}-value`;
  const sayingId = `setup-${section.id}-saying`;

  const save = useCallback(() => {
    const accepted = field.save(storage, typed);
    // The statement is re-derived either way. A REFUSED save is exactly the case where it must be:
    // the setting is still whatever it was, and a screen that quietly left the old statement up
    // would be the one place on this card not telling him the save did not happen.
    setRevision((held) => held + 1);
    if (!accepted) {
      setOutcome('refused');
      return;
    }
    setOutcome(typed.trim().length === 0 ? 'cleared' : 'saved');
  }, [field, storage, typed]);

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={boxId}>{field.label}</label>
        <input
          id={boxId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={field.placeholder}
          aria-describedby={sayingId}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setOutcome(null);
          }}
        />
      </div>

      {/*
        `muted read` rather than `field-hint`: this is prose he reads to decide what to type, and it
        belongs at the sixteen-pixel reading floor rather than at the 14px meta role — the same
        choice, for the same reason, that `ClientsScreen.tsx` states beside its own hint.
      */}
      <p id={sayingId} className="muted read">{check.sentence}</p>
      <p className="muted read">{CLEARING_TAKES_IT_BACK}</p>

      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={save}>
          <Glyph name="backup" size="inline" decorative />
          <span>{SAVE_LABEL}</span>
        </button>
      </div>

      {/*
        `role="status"` so the outcome is announced rather than only drawn. Polite, never an alert:
        it is the answer to something he just pressed, and it must not interrupt him.
      */}
      {outcome !== null && (
        <p className={outcome === 'refused' ? 'note note-warning read' : 'note read'} role="status">
          <Glyph name={outcome === 'refused' ? 'sync-pending-warning' : 'note'} size="inline" decorative />
          <span>
            {outcome === 'refused' && NOT_SAVED_HERE}
            {outcome === 'cleared' && CLEARED_HERE}
            {outcome === 'saved' && SAVED_HERE}
          </span>
        </p>
      )}

      {/*
        WHERE THIS SETTING ACTUALLY STANDS — and it is a different question from the shape check
        above it, which is why it is a different sentence in a different place rather than a stronger
        wording of that one. The shape check says a value is PLAUSIBLE; this says whether it has ever
        been PROVEN, and names which proof. `setup.ts` owns all three sentences.

        Rendered only once the browser has answered. A static render has read no storage, so drawing
        anything here would be a claim about a setting nothing has looked at yet — which is the exact
        defect this whole section exists to close, arriving from the interface.
      */}
      {standing !== null && (
        <p className="read" data-standing={standing.state}>{standing.sentence}</p>
      )}

      {/*
        THE TRY-IT. It is the SAME act as the accountability indicator's — one context, one
        connection, one token — and its words are that act's own, so the two controls cannot come to
        be labelled differently.

        ABSENT rather than disabled when nothing has been saved: there is no id to try, and the
        statement above has just said so in words. Absent rather than dead when nothing supplied the
        acts, which is `sync-actions.tsx`'s rule and its argument — a control that cannot do what it
        says is worse than no control.
      */}
      {section.canTryHere && actions !== null && field.read(storage) !== null && (
        <div className="stack-tight">
          <div className="inline">
            <button
              type="button"
              className="btn"
              disabled={actions.running}
              onClick={(event) => actions.connect(event.nativeEvent)}
            >
              <Glyph name="sync-pending" size="inline" decorative />
              <span>{actions.running ? TRYING_THE_CLIENT_ID : TRY_THE_CLIENT_ID}</span>
            </button>
          </div>
          <p className="muted read">{SAME_CONNECTING}</p>
          {/* What just happened when he tapped, in this application's own words and never a
              provider's — the same value the indicator shows, from the same place, so the two cannot
              tell him different things about one attempt. */}
          {actions.refusal !== null && (
            <p className="note note-warning read" role="status">
              <Glyph name="sync-pending-warning" size="inline" decorative />
              <span>{actions.refusal}</span>
            </p>
          )}
        </div>
      )}

      {/* An absent control with no reason given is the state a reader concludes is broken. */}
      {section.insteadOfTryIt !== null && (
        <p className="muted read">{section.insteadOfTryIt}</p>
      )}
    </div>
  );
}

/**
 * THE ADDRESS TO GIVE GOOGLE, computed from the browser rather than asked for as typing.
 *
 * He is copying this INTO Google, not into us, so nothing here is a box. It is read from the running
 * origin — scheme and host, no path — which is a stronger guarantee than a constant could be: a
 * value typed from a document is a value that is wrong the day the site moves, and Google's
 * rejection of a wrong origin arrives as a form error he has no way to interpret.
 *
 * THE COPY CONTROL IS ABSENT RATHER THAN DISABLED where the clipboard is refused, and the address
 * itself is always on screen and selectable — so the failure costs him a longer route rather than
 * the step.
 */
function Origin() {
  const [origin, setOrigin] = useState<string | null>(null);
  const [copying, setCopying] = useState<'copied' | 'refused' | null>(null);

  useEffect(() => {
    setOrigin(runningOrigin());
  }, []);

  const copy = useCallback(() => {
    if (origin === null) return;
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      setCopying('refused');
      return;
    }
    clipboard.writeText(origin).then(
      () => setCopying('copied'),
      (error: unknown) => {
        console.error('[setup] this browser refused the clipboard', error);
        setCopying('refused');
      },
    );
  }, [origin]);

  return (
    <section className="card card-tight" aria-labelledby="setup-origin">
      <div className="card-header">
        <h3 id="setup-origin" className="title-section">{CARD_TITLES.origin}</h3>
      </div>

      <div className="card-body stack">
        <p className="read">{ORIGIN_RULE}</p>

        {origin === null ? (
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{ORIGIN_NOT_KNOWN}</span>
          </p>
        ) : (
          <>
            {/* `.copy-value`, never `.value-display` — see console.css. This is an address he
                reads character by character, not the one figure the screen is for, and at a phone
                width the display-size class ran it clean out of the card. */}
            <p className="copy-value"><code>{origin}</code></p>
            <div className="inline">
              <button type="button" className="btn" onClick={copy}>
                <Glyph name="export" size="inline" decorative />
                <span>{COPY_THE_ORIGIN}</span>
              </button>
            </div>
            {copying !== null && (
              <p className="muted read" role="status">
                {copying === 'copied' ? ORIGIN_COPIED : ORIGIN_NOT_COPIED}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function SetupScreen() {
  const [storage, setStorage] = useState<SmallFactStorage | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set<string>());
  const [remembered, setRemembered] = useState(true);

  useEffect(() => {
    const found = setupStorage();
    setStorage(found);
    setTicked(tickedSteps(found));
  }, []);

  const onTick = useCallback((id: string, next: boolean) => {
    setTicked((held) => {
      const now = new Set(held);
      if (next) now.add(id);
      else now.delete(id);
      setRemembered(rememberTicks(setupStorage(), now));
      return now;
    });
  }, []);

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-setup">
        <h2 id="screen-setup" className="title-screen">{SETUP_HEADING}</h2>
        <p className="screen-intro">{SETUP_INTRO}</p>
      </section>

      {SETUP_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="card card-tight"
          aria-labelledby={`setup-${section.id}`}
        >
          <div className="card-header">
            <h3 id={`setup-${section.id}`} className="title-section">{section.title}</h3>
          </div>

          <div className="card-body stack">
            {/* PERMANENT and never folded — it is what stops the ticks below reading as the app
                confirming anything, and a fold is a place a sentence goes to be unread. */}
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{TICKS_ARE_YOURS}</span>
            </p>

            <ol className="steps">
              {section.steps.map((step) => (
                <Step
                  key={step.id}
                  step={step}
                  ticked={ticked.has(step.id)}
                  onTick={onTick}
                  besideTheLink={section.besideTheLink}
                />
              ))}
            </ol>

            {!remembered && (
              <p className="note note-warning read" role="status">
                <Glyph name="sync-pending-warning" size="inline" decorative />
                <span>{TICKS_NOT_REMEMBERED}</span>
              </p>
            )}

            {section.notes.map((note) => (
              <p className="read" key={note}>{note}</p>
            ))}

            <Field section={section} storage={storage} />
          </div>
        </section>
      ))}

      <Origin />

      {/*
        THE TWO CONSOLE TRAPS, folded and counted. They are the only thing on this screen that is
        troubleshooting rather than instruction — he reads them when a control is not where the step
        said, and only then. Nothing is deleted: the summary carries the count, and each carries the
        date it was measured, because Google owns those screens and this build has already been
        burned by their layout moving.
      */}
      <section className="card card-tight" aria-labelledby="setup-traps">
        <div className="card-header">
          <h3 id="setup-traps" className="title-section">{CARD_TITLES.traps}</h3>
        </div>
        <details className="disclose">
          <summary>
            What has moved, and what is simply not there
            <span className="count">{CONSOLE_TRAPS.length}</span>
          </summary>
          <div className="card-body stack">
            {CONSOLE_TRAPS.map((trap) => (
              <div className="stack-tight" key={trap.id}>
                <p className="read">{trap.cause}</p>
                <p className="read">{trap.whatYouShouldSee}</p>
                <p>
                  <a href={trap.href} target="_blank" rel="noopener noreferrer">
                    Open the page it is on now
                    {' '}
                    <Glyph name="link-external" size="inline" label={OPENS_IN_A_NEW_TAB} />
                  </a>
                </p>
                <p className="muted read">
                  Checked
                  {' '}
                  {trap.measuredOn}
                </p>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/*
        WHAT TO EXPECT AFTERWARDS, folded and counted. Each expectation still carries its consequence
        — `setup-honesty.ts` keeps the halves as separate fields so neither can be trimmed — but the
        card opens closed: this is reading for later, not part of the walk.
      */}
      <section className="card card-tight" aria-labelledby="setup-expect">
        <div className="card-header">
          <h3 id="setup-expect" className="title-section">{CARD_TITLES.expectations}</h3>
        </div>
        <details className="disclose">
          <summary>
            Read once you are set up
            <span className="count">{EXPECTATIONS.length}</span>
          </summary>
          <div className="card-body stack">
            {EXPECTATIONS.map((expectation) => (
              <div className="stack-tight" key={expectation.id}>
                <strong>{expectation.title}</strong>
                <p className="read">{expectation.says}</p>
                <p className="read">{expectation.consequence}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/*
        WHAT IS TRUE ABOUT THE ENCRYPTION. The two sentences a reader looking for reassurance must
        MEET — who can read the notes, and that nothing here is audited or certified — stay unfolded;
        `setup-surface.test.ts` holds them out of any fold. The rest of the statement and the
        algorithm names fold beneath them, still verbatim from `setup-honesty.ts`.
      */}
      <section className="card card-tight" aria-labelledby="setup-security">
        <div className="card-header">
          <h3 id="setup-security" className="title-section">{CARD_TITLES.security}</h3>
        </div>
        <div className="card-body stack">
          <p className="read">{WHO_CAN_READ_THE_NOTES}</p>
          <p className="read">{NOT_AUDITED}</p>
        </div>
        <details className="disclose">
          <summary>
            The full statement, and the names for whoever is helping you
            <span className="count">{SECURITY_SENTENCES.length + ALGORITHM_FACTS.length - 2}</span>
          </summary>
          <div className="card-body stack">
            {SECURITY_SENTENCES
              .filter((sentence) => sentence !== WHO_CAN_READ_THE_NOTES && sentence !== NOT_AUDITED)
              .map((sentence) => (
                <p className="read" key={sentence}>{sentence}</p>
              ))}
            <dl className="pairs">
              {ALGORITHM_FACTS.map((fact) => (
                <Fragment key={fact.purpose}>
                  <dt className="pair-label">{fact.purpose}</dt>
                  <dd className="pair-value">{fact.named}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </details>
      </section>
    </div>
  );
}

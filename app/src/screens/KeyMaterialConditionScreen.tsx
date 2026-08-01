/**
 * THE KEY-MATERIAL CONDITION SCREEN — both candidates shown, nothing changed, and who to ask.
 *
 * This file is the DRAWING and nothing else. Every judgement it renders — what each condition is
 * called, what it means for the coach, which one is the more dangerous, what is shown per candidate,
 * and all four of the sentences that must never be softened — is decided in
 * `key-material-condition.ts`, where it can be asserted. A sentence written into markup is a sentence
 * only a human reading the file would notice going missing, and on this screen the sentences ARE the
 * deliverable.
 *
 * ## What it does NOT have, and why the absence is the design
 *
 * There is no button on this screen. Not a disabled one, not one behind a flag, not a "let the app
 * try" — nothing that discards, picks, merges or tidies. The user ruled on 2026-07-26 that this
 * surface SHOWS BOTH CANDIDATES, CHANGES NOTHING, AND TELLS HIM TO GET HELP, and the reason is
 * arithmetic rather than caution: discarding the wrong key makes every clinical note encrypted under
 * it permanently unreadable, and the person who would be pressing it is a non-technical coach
 * mid-recovery of a wiped device with no second device left to check against.
 *
 * `key-material-condition.test.ts` holds that absence rather than trusting it, in three ways that
 * fail differently: nothing in the report is callable, the reading has no way back on it at all, and
 * a scan of this file's own code — with its comments stripped, so this paragraph cannot be what makes
 * the scan pass or fail — finds no control and no handler, proven in the same run against the
 * divergence picker, which has both.
 *
 * ## Six conditions, one screen, and what varies between them is DATA
 *
 * The family in `key-material-condition.ts` words six conditions and this file draws all six. Four of
 * them carry no candidates, so they have no figure, no list of things to compare and nothing anyone
 * could be tempted to delete; two of them have a real step the coach can take alone. Every one of
 * those differences arrives here as a NULL or an empty list on the report, and the only thing this
 * file does about it is not draw what is not there. There is no branch on a condition's code in this
 * file and there must not be one: a second differently-worded surface for the same subject is exactly
 * what the family shape exists to prevent, and the moment a `code` is read here that prevention is
 * gone.
 *
 * ## Where the dense-screen rule lands here
 *
 * ONE FIGURE THE SCREEN IS FOR: how many were found where one was expected. On every visit but the
 * one that matters it is 1, and that is a good state worded as one rather than as an empty screen.
 * A condition with no candidates has NO figure — null, not zero — and the figure is simply absent
 * rather than drawn as a nought, which would read as a defect report about the wrong thing.
 *
 * THE SECONDARY FOLDS AND IS COUNTED: the candidates' own detail — identifiers, dates, sizes — is the
 * forensic half, and it is what the person helping him will read out. It sits behind a
 * `<details className="disclose">` whose summary carries the count, so what is folded is still
 * accounted for and nothing is discarded.
 *
 * WHAT MUST NOT FOLD: the four standing sentences and the danger note. They are the whole of what
 * changes what he should do next, and disclosure is for detail BEHIND a decision, never the decision
 * — the same argument `admin-report.ts` makes about a persistence failure.
 *
 * ONE CARD PER QUESTION: what happened, what to do, and the evidence are three different moments.
 */

import { Fragment } from 'react';

import { Glyph } from '../design/Glyph';
import { useKeyMaterial } from '../shell/KeyMaterial';
import { describeCondition, describeNotChecked } from './key-material-condition';
import type { CandidateReport, ConditionReport, NotCheckedReport } from './key-material-condition';

/** One candidate's facts, drawn with the label-and-value primitive the admin screen established. */
function Candidate({ candidate }: { candidate: CandidateReport }) {
  return (
    <div className="stack-tight">
      <h4 className="title-section">{candidate.heading}</h4>
      <dl className="pairs">
        {candidate.facts.map((fact) => (
          <Fragment key={fact.label}>
            <dt className="pair-label">{fact.label}</dt>
            <dd className="pair-value">{fact.literal ? <code>{fact.value}</code> : fact.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/**
 * The state every device is in: nothing has surveyed anything, said as exactly that.
 *
 * NO FIGURE IS DRAWN. The report carries none, and that is the whole correction: the "1" that used
 * to sit here was a constant in the wording module and never a count of anything, under a sentence
 * saying his devices agreed.
 */
function NotChecked({ report }: { report: NotCheckedReport }) {
  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-key-material">
        <h2 id="screen-key-material" className="title-screen">
          {report.title}
        </h2>
        <p className="screen-intro read">{report.intro}</p>
      </section>
    </div>
  );
}

function Condition({ report }: { report: ConditionReport }) {
  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-key-material">
        <h2 id="screen-key-material" className="title-screen">
          {report.title}
        </h2>
        {/* The figure and its sentence travel together, and both are absent for a condition that
            found nothing. A nought here would be a number nobody asked for. */}
        {report.count !== null && (
          <>
            <p className="value-display">{report.count}</p>
            <p className="screen-intro read">{report.countMeans}</p>
          </>
        )}
      </section>

      <section className="card card-tight" aria-labelledby="key-material-what">
        <div className="card-header">
          <h3 id="key-material-what" className="title-section">
            What has happened
          </h3>
          <span className="spacer" />
          {/* The WORD carries the state. The tone is a second channel and never the only one. */}
          <span className={report.moreDangerous ? 'chip chip-danger' : 'chip chip-warning'}>
            {report.moreDangerous ? 'Sort this out now' : 'Needs sorting out'}
          </span>
        </div>

        <div className="card-body stack">
          <p className="read">{report.whatHappened}</p>
          <p className="read">{report.whatItMeans}</p>

          {/* NOT foldable. The one condition that is silent until it is too late has to say so where
              he cannot miss it, and a fold is a place a sentence goes to be unread. */}
          {report.dangerNote !== null && (
            <p className="note note-danger read">
              <Glyph name="protected-clinical-note" size="inline" decorative />
              <span>{report.dangerNote}</span>
            </p>
          )}

          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{report.nothingWasChanged}</span>
          </p>
        </div>
      </section>

      <section className="card card-tight" aria-labelledby="key-material-what-to-do">
        <div className="card-header">
          <h3 id="key-material-what-to-do" className="title-section">
            What to do
          </h3>
        </div>

        <div className="card-body stack">
          {/* HIS OWN STEPS COME FIRST where he has any, because a person who can fix this himself
              in a minute should not read a paragraph about who to telephone before he reads how.
              Where he has none the order is unchanged from the duplicates this screen was built
              for: the named person is the first thing under the heading rather than the last thing
              on the screen. Read-only means the application will not resolve those; if the person
              who set it up for him is not named there, he has been stopped with nowhere to go. */}
          {report.whatHeCanDo.length > 0 && (
            <ol className="steps">
              {report.whatHeCanDo.map((step) => (
                <li key={step} className="read">
                  {step}
                </li>
              ))}
            </ol>
          )}

          {/* Said OUT LOUD rather than left as an empty space. A screen that shows a problem and
              offers nothing reads as one that is quietly working on it, and nothing behind this
              screen is. */}
          {report.noExitOfHisOwn !== null && (
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{report.noExitOfHisOwn}</span>
            </p>
          )}

          {report.whoToAsk !== null && <p className="read">{report.whoToAsk}</p>}

          {report.doNotDelete !== null && (
            <p className="note note-danger read">
              <Glyph name="delete" size="inline" decorative />
              <span>{report.doNotDelete}</span>
            </p>
          )}

          {report.doNotContinue !== null && (
            <p className="note note-warning read">
              <Glyph name="note" size="inline" decorative />
              <span>{report.doNotContinue}</span>
            </p>
          )}
        </div>
      </section>

      {/* Drawn only where the core carried candidates out of the failure. An empty "what was found"
          with a nought on its chip is a card that says a thing was looked for and missing. */}
      {report.candidates.length > 0 && (
      <section className="card card-tight" aria-labelledby="key-material-candidates">
        <div className="card-header">
          <h3 id="key-material-candidates" className="title-section">
            What was found
          </h3>
          <span className="spacer" />
          <span className="chip">{report.count}</span>
        </div>

        <div className="card-body stack">
          {report.candidates.map((candidate) => (
            <Candidate key={candidate.heading} candidate={candidate} />
          ))}
        </div>
      </section>
      )}

      {/* The app's own wording, folded and carried through unchanged for whoever is helping him.
          ALWAYS PRESENT, on every one of the six conditions, because it is the only thing on this
          screen the core itself wrote and it is what the person helping him will want to see; it
          used to sit inside the candidates card, which would have taken it away from the four
          conditions that have no candidates. It is not what he reads first: for the recovery key
          the core words both conditions the same way and names the wrong object — measured, and
          stated in `key-material-condition.ts` rather than papered over here. */}
      <section className="card card-tight" aria-labelledby="key-material-as-reported">
        <div className="card-header">
          <h3 id="key-material-as-reported" className="title-section">
            What the app itself reported
          </h3>
        </div>
        <details className="disclose">
          <summary>
            In the app&apos;s own words
            <span className="count">1</span>
          </summary>
          <div className="card-body">
            <p className="muted read">{report.asTheAppPutIt}</p>
          </div>
        </details>
      </section>
    </div>
  );
}

/**
 * THE SELECTION IS HALF THE FIX AND IT USED TO BE THE LYING HALF.
 *
 * This branched on `condition === null` into a component called `Settled` — and `condition` is null
 * on every device, because nothing in this application surveys anything. So the reassuring screen was
 * not a rare good-news state that happened to be common; it was the ONLY state, reached through a
 * branch whose name asserted a condition nobody had measured. Changing its words alone would have
 * left an honest sentence arriving through a path named for the opposite thing, which is the same
 * defect with better manners. The seam now carries `checked`, and this reads that.
 */
export function KeyMaterialConditionScreen() {
  const reading = useKeyMaterial();

  return reading.checked ? (
    <Condition report={describeCondition(reading.condition)} />
  ) : (
    <NotChecked report={describeNotChecked()} />
  );
}

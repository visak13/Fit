/**
 * THE FINISH CONTROL'S WORDS AND ITS ONE ENDING.
 *
 * The judgement half. `session-ending-source.test.ts` beside this one drives the write against a real
 * store and reads the record back; nothing here touches a store.
 *
 * ## THE ASSERTION THIS FILE EXISTS FOR IS AN ABSENCE, SO IT CARRIES ITS OWN NON-VACUITY PROBE
 *
 * A control that could reach `interrupt()` or `abandon()` would file "abandoned" on a day the coach
 * meant "done" — corrupting his record in the one direction he has no reason to go looking in. The
 * guard is therefore that neither verb is reachable from the three files this surface is made of, and
 * every such scan here first proves it can SEE `complete(` in the same file. An enumeration that
 * matches nothing passes exactly as loudly as one that matches everything it should.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  FINISHED_NOT_BUILT, FINISHED_WHERE, FINISHED_WORDS, FINISHING_WORDS, FINISH_CANCEL_LABEL,
  FINISH_CONFIRM_LABEL, FINISH_CONFIRM_WORDS, FINISH_LABEL, FINISH_TITLE, FINISH_WORDS,
  asking, canFinish, finished, finishing, noEnding, notYet, refused,
} from './session-ending';
import { STARTED_WORDS, statusWords } from './launcher';

/** A source file read WHOLE. Never a line-oriented matcher: a sentence here spans lines. */
function sourceOf(name: string): string {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}

/**
 * A file's text as the words it actually SAYS.
 *
 * This application wraps nearly every sentence across two or three string literals joined by `+`, so
 * an unjoined scan misses a real claim AND reds on the app's own disclaimers. `src/proof/
 * forbidden-claims.test.ts` settled the rule; this is the same one-line join, kept local because that
 * gate does not export it and a shared file must not be edited from a parallel worker.
 */
function asSaid(text: string): string {
  return text.replace(/(['"`])\s*\+\s*(['"`])/gu, '');
}

/**
 * A source file's CODE, with the comments taken out.
 *
 * A comment naming the two endings this surface must not reach is the whole reason they are written
 * down; a scan that redded on it would push the reason out of the file. So the absence assertions run
 * over the code, and the probe that keeps them honest runs over the same text.
 */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');
}

const ENDING_WORDS = sourceOf('./session-ending.ts');
const ENDING_SOURCE = sourceOf('./session-ending-source.ts');
const ENDING_SCREEN = sourceOf('./SessionEnding.tsx');

describe('the finish control reaches ONE ending, and it is the one the user ruled', () => {
  it('calls complete() — the verb that means the session went as planned', () => {
    assert.ok(
      /live\.complete\(\)/u.test(ENDING_SOURCE),
      'the finish control must reach the core\'s own complete(), not write a status itself',
    );
  });

  /**
   * THE NON-VACUITY PROBE FOR EVERY ABSENCE BELOW, in the same run.
   *
   * It proves the scan can see a call of this shape in these files at all. Without it, a typo in the
   * pattern would make all three absence assertions below pass over a file that called `abandon()` on
   * every line.
   */
  it('the scan looking for the other two endings can see a call of that shape', () => {
    const verbs = (text: string) => [...codeOf(text).matchAll(/\.\s*(complete|interrupt|abandon)\s*\(/gu)]
      .map((found) => found[1]);
    assert.deepEqual(
      verbs(ENDING_SOURCE),
      ['complete'],
      'the verb scan found something other than exactly one complete() — if it found NOTHING, every '
        + 'absence assertion in this file is vacuous',
    );
  });

  it('never reaches interrupt() or abandon(), in the writer, the words or the drawing', () => {
    for (const [where, text] of [
      ['session-ending-source.ts', ENDING_SOURCE],
      ['session-ending.ts', ENDING_WORDS],
      ['SessionEnding.tsx', ENDING_SCREEN],
    ] as const) {
      const code = codeOf(text);
      assert.equal(
        /\.\s*(interrupt|abandon)\s*\(/u.test(code),
        false,
        `${where} can reach an ending other than complete(); a single control covering more than one `
          + 'ending records "abandoned" on a day the coach meant "done"',
      );
    }
  });

  it('imports neither of the other two endings', () => {
    assert.equal(/\binterrupt\b|\babandon\b/u.test(asSaid(ENDING_SOURCE).split('\n')
      .filter((line) => line.startsWith('import')).join('\n')), false);
  });
});

describe('what the control says about itself', () => {
  /**
   * THE INSTRUCTIONAL LEAD-IN WAS CUT — "Use this when the session went as planned and there is
   * nothing more to record in it" — because a coach who has been running this screen for a session
   * already knows when he presses Finish; what he needs is the one fact that is easy to get backwards.
   * `FINISH_LABEL` still names the act on the control itself, so nothing about what the button DOES
   * is lost, only the paragraph explaining it.
   */
  it('no longer explains when to use the control, only what leaving it does', () => {
    assert.equal(/went as planned/u.test(FINISH_WORDS), false);
    assert.equal(FINISH_LABEL, 'Finish this session');
  });

  it('says plainly that leaving the screen finishes nothing', () => {
    // The one thing a coach could get wrong here, and it is the direction that loses him a session's
    // ending: leaving is `interrupt()`'s meaning and always has been.
    assert.match(FINISH_WORDS, /Leaving this screen without pressing it does not finish anything/u);
  });

  it('warns that finishing is one-way, because openSession refuses an ended session', () => {
    assert.match(FINISH_CONFIRM_WORDS, /cannot be picked up again/u);
    assert.match(FINISH_CONFIRM_WORDS, /Everything already recorded in it is kept/u);
  });

  it('has a way out of the confirmation that claims nothing', () => {
    assert.equal(FINISH_CANCEL_LABEL, 'Not yet');
  });

  it('says what it is doing while it does it', () => {
    assert.match(FINISHING_WORDS, /Finishing/u);
  });

  it('every word it draws is a sentence rather than a record\'s status', () => {
    for (const words of [
      FINISH_TITLE, FINISH_WORDS, FINISH_LABEL, FINISH_CONFIRM_WORDS, FINISH_CONFIRM_LABEL,
      FINISH_CANCEL_LABEL, FINISHING_WORDS, FINISHED_WORDS, FINISHED_WHERE, FINISHED_NOT_BUILT,
    ]) {
      assert.equal(/in_progress|completed|abandoned|interrupted/u.test(words), false,
        `"${words}" shows the record's own status word on the screen he reads with a client there`);
    }
  });
});

describe('the aftermath sentence, whose clauses session-ending-source.test.ts reads back', () => {
  it('claims what is still there rather than that anything was saved by the press', () => {
    assert.match(FINISHED_WORDS, /still here/u);
    // Every fact was saved as it was recorded. "Saved" here would imply the earlier ones had been
    // waiting for this press — the family of claim this build has shipped wrong before.
    assert.equal(/\bsaved\b/u.test(FINISHED_WORDS), false);
  });

  it('names the two lists by the words the calendar actually draws over them', () => {
    assert.match(FINISHED_WHERE, /Sessions you have not finished/u);
    assert.match(FINISHED_WHERE, /Sessions already done/u);
  });

  it('says in the same breath what he still cannot do there', () => {
    assert.match(FINISHED_NOT_BUILT, /not built yet/u);
  });
});

describe('where the control is in its own small life', () => {
  it('starts with nothing pressed, nothing asked and nothing refused', () => {
    assert.deepEqual(noEnding, { asking: false, finishing: false, finished: false, refusal: null });
  });

  it('asks before it finishes', () => {
    assert.equal(asking(noEnding).asking, true);
    assert.equal(asking(noEnding).finished, false);
  });

  it('backing out writes nothing and claims nothing', () => {
    assert.deepEqual(notYet(asking(noEnding)), noEnding);
  });

  it('clears a previous refusal when he is asked again, rather than telling him twice', () => {
    const told = refused(noEnding, { headline: 'no', detail: null, journalFull: false });
    assert.equal(asking(told).refusal, null);
  });

  it('is in flight between the confirmation and the ending, so one press writes one ending', () => {
    const flight = finishing(asking(noEnding));
    assert.equal(flight.finishing, true);
    assert.equal(flight.asking, false);
    assert.equal(flight.finished, false);
  });

  it('a refusal leaves finished FALSE, so a control that fell quiet cannot read as a success', () => {
    const told = refused(finishing(noEnding), { headline: 'no', detail: null, journalFull: false });
    assert.equal(told.finished, false);
    assert.equal(told.finishing, false);
    assert.equal(told.refusal?.headline, 'no');
  });

  it('the ending landing and the read-back failing is still finished, with the sentence kept', () => {
    // `throughTheHeldSession` reports that case as ok with a refusal on it. Telling him it did not
    // finish would have him press again on a session the core will now refuse.
    const both = refused(finished(finishing(noEnding)),
      { headline: 'read-back failed', detail: null, journalFull: false });
    assert.equal(both.finished, true);
    assert.equal(both.refusal?.headline, 'read-back failed');
  });
});

describe('whether the control is offered at all', () => {
  it('is offered while the record says the session is running', () => {
    assert.equal(canFinish({ live: true }), true);
  });

  it('is not offered once the record says it is not', () => {
    assert.equal(canFinish({ live: false }), false);
  });

  it('is not offered when there is nothing to say about the session', () => {
    assert.equal(canFinish(null), false);
  });

  it('is not conditional on anything having been recorded', () => {
    // A session where nothing was written down still happened. The only input is `live`, and this
    // asserts the shape rather than the behaviour: a second field would be a second opinion about
    // what counts as a real session.
    assert.equal(canFinish({ live: true, recorded: 0 } as { live: boolean }), true);
  });
});

describe('the landing place was already built, and this proves it rather than assuming it', () => {
  it('a completed session reads back to the coach as Finished', () => {
    assert.equal(statusWords('completed'), 'Finished');
  });
});

describe('the calendar no longer says the screen that runs a session is unbuilt', () => {
  const LAUNCHER = sourceOf('./launcher.ts');

  it('the false claim is gone from the sentence AND from the comment above it', () => {
    // BOTH, and read WHOLE with adjacent literals joined: the claim was written across a `+` in the
    // constant and again in prose in the doc comment, and a scan of either alone would have found one
    // of them and reported the file clean.
    assert.equal(
      asSaid(LAUNCHER).includes('the screen that runs a session is being built'),
      false,
      'launcher.ts still tells the coach the runner is unbuilt while he is standing on it',
    );
    assert.equal(asSaid(LAUNCHER).includes('What does not exist yet is the screen that RUNS one'), false);
  });

  it('the scan can see a sentence of that shape in that file', () => {
    // NON-VACUITY. This phrase IS in launcher.ts and is STILL TRUE — reading a past session back in
    // full is not built, and it stays declared. If this went missing the absences above would be
    // meaningless.
    assert.ok(asSaid(LAUNCHER).includes('is not built yet'));
  });

  it('what it says instead is what the calendar actually does', () => {
    // `CalendarScreen.tsx` goes straight to `sessionAddress(...)` after a start, so the session opens
    // rather than waiting to be found.
    assert.match(STARTED_WORDS, /It opens on the session screen now/u);
    assert.match(STARTED_WORDS, /Sessions you have not finished/u);
  });

  it('and it still does not promise a session ends by itself', () => {
    assert.equal(/finishes it|ends it|finished automatically/u.test(STARTED_WORDS), false);
  });
});

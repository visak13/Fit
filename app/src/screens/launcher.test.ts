/**
 * WHAT THE LAUNCHER SAYS AND REFUSES TO SAY — asserted with no browser and no rendering.
 *
 * `screens/launcher.ts` holds every judgement the calendar screen makes, so every judgement is
 * checkable here: what a valid selection is, what the coach must have ANSWERED before he can start,
 * how a first session is worded, and what this screen must never grow.
 *
 * ## Three of these tests assert an ABSENCE, and that is deliberate
 *
 * An absent feature and a forgotten one look identical to the next editor. There are no reminders
 * and no notifications in this application, this screen never suggests a heavier load, and it is not
 * a month grid — all three are decisions, all three would be plausible to add, and prose saying so
 * rots silently while an assertion cannot. `core/session/glance.js` guards its own absence the same
 * way, and this file copies that rather than inventing a shape.
 *
 * ## The mode list is checked against the CORE, not against a copy
 *
 * `MODE_CHOICES` must offer exactly the values `core/model/vocabularies.js` permits. This suite reads
 * both and requires them to AGREE — two independent readings of one truth, where the disagreement is
 * the alarm. A copy of the list here would drift the day either changed, and the screen would go on
 * offering an answer the record refuses, with no error anywhere until a coach pressed it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SESSION_MODES } from '../../core/model/vocabularies.js';
import * as launcher from './launcher.ts';
import {
  GLANCE_NOBODY_CHOSEN, HISTORY_TITLE, LINK_CHOICES, LINK_MADE, MODE_CHOICES, NOTHING_CHOSEN,
  SECOND_INSTANCE_HINT, START_BUTTON, UNFINISHED_INTRO, canOpenASecondWindow, canStart,
  chooseLinkPlan, chooseMode,
  chooseRoutine, describeGlance, describeHistory, describeMint, describeOutcome, describeStart,
  describeUnfinished, firstSessionWords, linkToStore, listWords, modeWords, pasteLink, shouldMint,
  statusWords, toggleClient,
} from './launcher.ts';
import { EXPANDED_VIEWPORT_MIN } from '../design/viewport.ts';
import {
  GROUP_CALL_WARNING, MINT_REFUSALS, NO_CONFERENCE, PASTE_INSTEAD, STILL_PENDING,
} from '../platform/google-meet.ts';
import type { Glance, Selection, SessionRecord } from './launcher.ts';

/**
 * THE TWO WIDTHS EVERY `describeStart` CALL BELOW IS MADE AT.
 *
 * `LAPTOP` is the default for the tests that are not about the width, because it is the context in
 * which every one of those sentences is unconditionally correct — a test asserting the group-call
 * warning must not go green or red for a reason to do with the window.
 */
const PHONE = 390;
const LAPTOP = 1280;

/** A selection with everything answered. Built through the verbs, never by hand. */
function everythingChosen(): Selection {
  let held = toggleClient(NOTHING_CHOSEN, 'client-ana');
  held = chooseRoutine(held, 'push-day');
  held = chooseMode(held, 'in_person');
  return held;
}

describe('choosing who is training', () => {
  it('takes one or many, because more than one person can be in a single call', () => {
    let held = toggleClient(NOTHING_CHOSEN, 'client-ana');
    assert.deepEqual(held.clientIds, ['client-ana']);

    held = toggleClient(held, 'client-ben');
    assert.deepEqual(held.clientIds, ['client-ana', 'client-ben']);
  });

  it('keeps the order he chose them in, which is the order he reads them back', () => {
    let held = toggleClient(NOTHING_CHOSEN, 'client-ben');
    held = toggleClient(held, 'client-ana');
    assert.deepEqual(held.clientIds, ['client-ben', 'client-ana']);
  });

  it('lets a mis-tap out again', () => {
    const held = toggleClient(toggleClient(NOTHING_CHOSEN, 'client-ana'), 'client-ana');
    assert.deepEqual(held.clientIds, []);
  });
});

describe('choosing the routine', () => {
  it('holds exactly one, however many people are in the room', () => {
    let held = chooseRoutine(NOTHING_CHOSEN, 'push-day');
    held = chooseRoutine(held, 'pull-day');
    assert.equal(held.routineId, 'pull-day');
  });

  it('is undone by the same control that chose it, so a mis-tap is not a one-way door', () => {
    const held = chooseRoutine(chooseRoutine(NOTHING_CHOSEN, 'push-day'), 'push-day');
    assert.equal(held.routineId, null);
  });
});

describe('where the session happens', () => {
  /**
   * THE CHECK THAT CANNOT DRIFT. The screen may only offer answers the record accepts, and the
   * record's list is `SESSION_MODES`. Reading both and comparing is a different thing from copying
   * one into the other: a copy passes forever while the two disagree.
   */
  it('offers exactly the answers the record permits, read from the core rather than copied', () => {
    assert.deepEqual(MODE_CHOICES.map((choice) => choice.value), [...SESSION_MODES]);
  });

  it('gives every answer words for what it actually does', () => {
    for (const choice of MODE_CHOICES) {
      assert.ok(choice.label.length > 0, `${choice.value} has no label`);
      assert.ok(
        choice.consequence.length > 0,
        `${choice.value} does not say what choosing it does, and the two answers differ by exactly that`,
      );
    }
  });

  it('promises in as many words that in person creates nothing anywhere else', () => {
    const inPerson = MODE_CHOICES.find((choice) => choice.value === 'in_person');
    assert.ok(inPerson !== undefined);
    // The promise is unverifiable by the coach, so it has to be stated. These are the three things
    // an in-person start must not do, and the sentence names all three.
    for (const word of ['calendar', 'link', 'request']) {
      assert.ok(
        inPerson.consequence.toLowerCase().includes(word),
        `the in-person answer does not mention "${word}", and it is one of the things it promises not to do`,
      );
    }
  });

  it('starts with NEITHER answer chosen, so the app never answers for him', () => {
    assert.equal(NOTHING_CHOSEN.mode, null);
  });
});

describe('the joining link', () => {
  it('is optional, and an empty box is nothing rather than an empty string', () => {
    const held = chooseMode(NOTHING_CHOSEN, 'online');
    assert.equal(linkToStore(held), null);
    assert.equal(linkToStore(pasteLink(held, '   ')), null);
  });

  it('is trimmed and carried through as he pasted it, and is never invented', () => {
    const held = pasteLink(chooseMode(NOTHING_CHOSEN, 'online'), '  https://meet.google.com/abc-defg-hij ');
    assert.equal(linkToStore(held), 'https://meet.google.com/abc-defg-hij');
  });

  it('never travels with an in-person session, whatever was typed before he changed his mind', () => {
    let held = pasteLink(chooseMode(NOTHING_CHOSEN, 'online'), 'https://meet.google.com/abc-defg-hij');
    held = chooseMode(held, 'in_person');
    assert.equal(held.pastedLink, '');
    assert.equal(linkToStore(held), null);
  });

  it('never blocks starting', () => {
    let held = toggleClient(NOTHING_CHOSEN, 'client-ana');
    held = chooseRoutine(held, 'push-day');
    held = chooseMode(held, 'online');
    assert.equal(canStart(held), true, 'an online session with no link must still be startable');
  });
});

describe('whether he can start', () => {
  it('refuses until people, a routine AND a place have all been given', () => {
    assert.equal(canStart(NOTHING_CHOSEN), false);
    assert.equal(canStart(toggleClient(NOTHING_CHOSEN, 'client-ana')), false);
    assert.equal(canStart(chooseRoutine(toggleClient(NOTHING_CHOSEN, 'client-ana'), 'push-day')), false);
    assert.equal(canStart(everythingChosen()), true);
  });

  /**
   * THE ONE THIS ACTION EXISTS FOR. `core/session/live-session.js` used to write `online` when its
   * caller passed nothing. This screen is that caller, and it must not reintroduce the same default
   * one layer up by letting the button through with the question unanswered.
   */
  it('refuses with people and a routine but no answer about where he is', () => {
    let held = toggleClient(NOTHING_CHOSEN, 'client-ana');
    held = chooseRoutine(held, 'push-day');
    assert.equal(held.mode, null);
    assert.equal(
      canStart(held),
      false,
      'the start control was offered before the coach said where he is, which is how a session held '
        + 'in a room gets recorded as a call',
    );
  });

  it('says what is still needed, in the order the screen asks for it', () => {
    const report = describeStart(NOTHING_CHOSEN, [], null, LAPTOP);
    assert.equal(report.canStart, false);
    assert.equal(report.missing.length, 3);
    assert.match(report.missing[0], /who is training/i);
    assert.match(report.missing[1], /routine/i);
    assert.match(report.missing[2], /call or in the room/i);
  });

  it('says nothing is missing once everything is chosen', () => {
    assert.deepEqual(describeStart(everythingChosen(), ['Ana'], 'Push Day', LAPTOP).missing, []);
  });

  it('reads the choice back in one line as it is being made', () => {
    const report = describeStart(everythingChosen(), ['Ana'], 'Push Day', LAPTOP);
    assert.equal(report.summary, 'Ana, Push Day, in the room.');
    assert.equal(report.label, START_BUTTON);
  });

  it('mentions the second window only when more than one person is attending', () => {
    assert.equal(
      describeStart(everythingChosen(), ['Ana'], 'Push Day', LAPTOP).secondInstanceHint,
      null,
    );

    const two = toggleClient(everythingChosen(), 'client-ben');
    assert.equal(
      describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP).secondInstanceHint,
      SECOND_INSTANCE_HINT,
    );
  });

  /**
   * ADVICE THE PHONE CANNOT FOLLOW, AND THE HALF OF THE FIX THAT IS EASY TO LOSE.
   *
   * The hint is CORRECT — on a laptop. Running two sessions side by side is a laptop capability,
   * and an installed home-screen app has no second window to open. So the question this asks is
   * REACHABILITY, never wording: with the precondition DRIVEN — two people actually chosen — is the
   * sentence offered where it cannot be acted on?
   *
   * BOTH DIRECTIONS OR NEITHER. A gate that suppressed it everywhere would satisfy the phone half,
   * remove a real feature the coach uses, and look exactly as green as the correct fix; so the same
   * selection is asserted at both widths and the laptop assertion is also what stops the phone
   * assertion passing vacuously — a `secondInstanceHint` hardcoded to null passes the first
   * assertion perfectly and reds the second.
   */
  it('withholds the second-window hint on a phone and keeps it on a laptop, same selection', () => {
    const two = toggleClient(everythingChosen(), 'client-ben');
    assert.equal(two.clientIds.length, 2, 'the precondition has to be DRIVEN, not assumed');

    assert.equal(
      describeStart(two, ['Ana', 'Ben'], 'Push Day', PHONE).secondInstanceHint,
      null,
      'the phone was offered a second window, which an installed home-screen app cannot open — he '
        + 'reads that as his own failure to find it, with two people in front of him',
    );

    assert.equal(
      describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP).secondInstanceHint,
      SECOND_INSTANCE_HINT,
      'the gate suppressed the hint on a LAPTOP too, which removes a real capability the coach uses '
        + 'and looks exactly as green as the correct fix',
    );
  });

  /**
   * THE BOUNDARY IS THE FRAME'S, READ FROM `viewport.ts` RATHER THAN WRITTEN OUT.
   *
   * A number copied here would go on passing the day the frame's boundary moved, and the hint would
   * be offered on one side of a line nothing else in the application draws.
   */
  it('turns the hint on exactly where the interface stops being the phone\'s', () => {
    const two = toggleClient(everythingChosen(), 'client-ben');

    assert.equal(canOpenASecondWindow(EXPANDED_VIEWPORT_MIN - 1), false);
    assert.equal(canOpenASecondWindow(EXPANDED_VIEWPORT_MIN), true);

    assert.equal(
      describeStart(two, ['Ana', 'Ben'], 'Push Day', EXPANDED_VIEWPORT_MIN - 1).secondInstanceHint,
      null,
    );
    assert.equal(
      describeStart(two, ['Ana', 'Ben'], 'Push Day', EXPANDED_VIEWPORT_MIN).secondInstanceHint,
      SECOND_INSTANCE_HINT,
    );
  });

  /**
   * THE WIDTH GATES THAT SENTENCE AND NOTHING ELSE ON THIS REPORT.
   *
   * Everything else the start control says is about the SELECTION, and a width that changed any of
   * it would be this screen quietly behaving differently on his phone. Asserted as a whole-report
   * comparison rather than field by field, so a field added later is covered without being named.
   */
  it('changes nothing else about the start report between a phone and a laptop', () => {
    let two = toggleClient(everythingChosen(), 'client-ben');
    two = chooseMode(two, 'online');

    const onThePhone = describeStart(two, ['Ana', 'Ben'], 'Push Day', PHONE);
    const onTheLaptop = describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP);

    assert.deepEqual(
      { ...onThePhone, secondInstanceHint: null },
      { ...onTheLaptop, secondInstanceHint: null },
    );
    assert.notEqual(onThePhone.secondInstanceHint, onTheLaptop.secondInstanceHint);
    assert.equal(onThePhone.groupCallWarning, GROUP_CALL_WARNING,
      'the sixty-minute cut is a fact about Google, not about his window, and it must survive the gate');
  });

  /**
   * THE SIXTY-MINUTE CUT, AND THE MOMENT IT IS SAID.
   *
   * At BOOKING TIME, meaning here — while he is choosing — and not when the call drops. A session
   * runs about an hour and a free personal account cuts a group call at an hour, so with two clients
   * in the session this is the ordinary case rather than an edge one.
   */
  it('warns about the group-call limit from TWO clients up, because he is the third person', () => {
    const online = chooseMode(everythingChosen(), 'online');
    assert.equal(describeStart(online, ['Ana'], 'Push Day', LAPTOP).groupCallWarning, null,
      'one client and him is a one-to-one call, which is not affected at all');

    const two = toggleClient(online, 'client-ben');
    assert.equal(describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP).groupCallWarning, GROUP_CALL_WARNING);
  });

  it('says nothing about it for a session in the room, which has no call to be cut', () => {
    const two = toggleClient(everythingChosen(), 'client-ben');
    assert.equal(two.mode, 'in_person');
    assert.equal(describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP).groupCallWarning, null);
  });
});

describe('how the session gets its joining link', () => {
  it('offers making one and pasting one as TWO ANSWERS, not a feature and a fallback', () => {
    assert.deepEqual(LINK_CHOICES.map((choice) => choice.value), ['mint', 'paste', 'none']);
    for (const choice of LINK_CHOICES) {
      assert.ok(choice.label.length > 0);
      assert.ok(choice.consequence.length > 0,
        `${choice.value} must say what it DOES, permanently and on the screen`);
    }
  });

  it('says out loud that making one puts a real event on his calendar and may ask him to connect', () => {
    const mint = LINK_CHOICES.find((choice) => choice.value === 'mint');
    assert.ok(mint !== undefined);
    assert.match(mint.consequence, /event on your calendar/i,
      'every online session lands as a real calendar event, and he must not discover that by '
      + 'watching his calendar fill up');
    assert.match(mint.consequence, /ask you to connect/i);
    assert.match(mint.consequence, /paste a link instead/i, 'and the exit is named before it is needed');
  });

  it('promises that the other two answers send nothing anywhere', () => {
    for (const value of ['paste', 'none']) {
      const choice = LINK_CHOICES.find((held) => held.value === value);
      assert.ok(choice !== undefined);
      assert.match(choice.consequence, /nothing is (created|sent)/i,
        `${value} is a promise about what the app does NOT do out of his sight`);
    }
  });

  it('asks Google only when he asked for it, and never behind a link he already has', () => {
    const online = chooseMode(everythingChosen(), 'online');
    assert.equal(shouldMint(online), true, 'the recorded decision is mint on demand at session start');

    assert.equal(shouldMint(everythingChosen()), false, 'in person creates NOTHING remote');
    assert.equal(shouldMint(chooseLinkPlan(online, 'none')), false);
    assert.equal(shouldMint(chooseLinkPlan(online, 'paste')), false);
    assert.equal(
      shouldMint(pasteLink(chooseLinkPlan(online, 'paste'), 'https://meet.google.com/abc-defg-hij')),
      false,
      'minting behind a link he pasted would make a second meeting for a session that already '
      + 'knows where it is going',
    );
  });

  it('clears what he pasted when he leaves the paste answer, so an unseen link cannot be written', () => {
    const pasted = pasteLink(
      chooseLinkPlan(chooseMode(everythingChosen(), 'online'), 'paste'),
      'https://meet.google.com/abc-defg-hij',
    );
    assert.equal(linkToStore(pasted), 'https://meet.google.com/abc-defg-hij');
    assert.equal(linkToStore(chooseLinkPlan(pasted, 'mint')), null);
    assert.equal(linkToStore(chooseLinkPlan(pasted, 'none')), null);
  });
});

describe('what came of asking for a link', () => {
  it('says the plain fact when there is one, and offers no way out because none is needed', () => {
    const report = describeMint({
      outcome: 'minted', url: 'https://meet.google.com/abc-defg-hij', onMainCalendar: true, polls: 0,
    });
    assert.equal(report.linked, true);
    assert.equal(report.headline, LINK_MADE);
    assert.equal(report.offerPaste, false);
    assert.equal(report.url, 'https://meet.google.com/abc-defg-hij');
  });

  /**
   * THE SENTENCE IS `google-meet.ts`'s OWN, CARRIED THROUGH UNCHANGED — the same rule
   * `describeOutcome` follows for the core's refusals, and for the same reason: a second version of
   * one situation's words drifts from the first the moment either is edited.
   */
  it('carries the platform\'s own sentence for every situation that produced no link, and offers the box', () => {
    const situations = [
      { outcome: 'no-conference' as const, sentence: NO_CONFERENCE, requestFailed: false },
      { outcome: 'still-pending' as const, sentence: STILL_PENDING, polls: 8 },
      { outcome: 'refused' as const, code: 'not-reachable' as const, sentence: MINT_REFUSALS['not-reachable'] },
    ];

    for (const situation of situations) {
      const report = describeMint(situation);
      assert.equal(report.linked, false);
      assert.equal(report.url, null);
      assert.equal(report.headline, situation.sentence, `${situation.outcome} is not reworded here`);
      assert.ok(report.headline.includes(PASTE_INSTEAD),
        'and every one of them ends by telling him what he can do instead');
      assert.equal(report.offerPaste, true,
        'so the box to paste it into HAS to be offered, or those words are a dead end wearing the '
        + 'clothes of a way out');
    }
  });
});

describe('names, as a person writes them', () => {
  it('joins two with "and" rather than with a comma', () => {
    assert.equal(listWords(['Ana']), 'Ana');
    assert.equal(listWords(['Ana', 'Ben']), 'Ana and Ben');
    assert.equal(listWords(['Ana', 'Ben', 'Cara']), 'Ana, Ben and Cara');
  });
});

describe('the previous session at a glance', () => {
  /** One previous session, shaped exactly as `core/session/glance.js` returns it. */
  const aGlance = (over: Partial<Glance> = {}): Glance => ({
    session_id: 'session-1',
    routine_id: 'push-day',
    status: 'completed',
    started_at: '2026-07-19T09:00:00.000Z',
    partial_record: false,
    performed: [{
      exercise_id: 'bench-press',
      substituted_for_exercise_id: null,
      status: 'performed',
      sets_completed: 3,
      repetitions: 10,
      duration_seconds: null,
      observed_load: '40kg',
    }],
    loads: [{ exercise_id: 'bench-press', observed_load: '40kg' }],
    readings: [{ kind: 'heart-rate', value: 128, unit: 'bpm' }],
    ...over,
  });

  /**
   * THE CORE RETURNS NULL ON A CLIENT'S FIRST SESSION, and its own header says the interface must
   * word that as the good news it is. A blank panel is the shape of a failed read, and the coach has
   * no way to tell the two apart.
   */
  it('words a first session as a first session and never as missing data', () => {
    const report = describeGlance('client-ana', 'Ana', null, null);
    assert.equal(report.firstSession, true);
    assert.equal(report.headline, firstSessionWords('Ana'));
    assert.match(report.headline, /first session/i);

    for (const wrong of ['no data', 'missing', 'not found', 'unavailable', 'empty', 'error']) {
      assert.ok(
        !report.headline.toLowerCase().includes(wrong),
        `a first session was worded with "${wrong}", which reads as a fault on the very first visit`,
      );
    }
    assert.deepEqual(report.performed, []);
  });

  it('shows what was performed and the loads he wrote down, verbatim', () => {
    const report = describeGlance('client-ana', 'Ana', aGlance(), 'Push Day');
    assert.equal(report.firstSession, false);
    assert.match(report.headline, /Ana last did Push Day on 2026-07-19/);
    assert.deepEqual(report.performed, ['bench-press 3 x 10 40kg']);
    assert.deepEqual(report.loads, ['bench-press: 40kg']);
    assert.deepEqual(report.readings, ['heart-rate 128bpm']);
  });

  it('says a previous session did not finish, because interrupted history is still history', () => {
    const report = describeGlance('client-ana', 'Ana', aGlance({ partial_record: true }), 'Push Day');
    assert.ok(report.partialWords !== null);
    assert.match(report.partialWords, /did not finish/i);
  });

  it('says so when nothing was recorded against that person, rather than showing an empty panel', () => {
    const bare = aGlance({ performed: [], loads: [], readings: [] });
    const report = describeGlance('client-ana', 'Ana', bare, 'Push Day');
    assert.equal(report.firstSession, false);
    assert.ok(report.nothingRecorded !== null);
  });

  it('falls back to the routine identifier rather than inventing a name it does not have', () => {
    const report = describeGlance('client-ana', 'Ana', aGlance(), null);
    assert.match(report.headline, /push-day/);
  });

  /**
   * A glance names exercises by CONTENT KEY. Rendered straight, the panel told the coach he last
   * did `look-bench-press` — a machine's word for something he named himself, on the panel he reads
   * to remember where somebody got to. Found by looking at the rendered screen.
   */
  it('says an exercise by the name he gave it, not by its key', () => {
    const named = new Map([['bench-press', 'Bench Press']]);
    const report = describeGlance('client-ana', 'Ana', aGlance(), 'Push Day', named);
    assert.deepEqual(report.performed, ['Bench Press 3 x 10 40kg']);
    assert.deepEqual(report.loads, ['Bench Press: 40kg']);
  });

  it('shows a key it has no name for AS IT STANDS, rather than hiding or guessing at it', () => {
    // An exercise the coach has since deleted is genuinely gone from the library, and the session
    // really did reference it. The key is something he can look up; an invented name is not.
    const report = describeGlance('client-ana', 'Ana', aGlance(), 'Push Day', new Map());
    assert.deepEqual(report.performed, ['bench-press 3 x 10 40kg']);
  });

  it('names both halves of a substitution, so what it replaced is not left as a key', () => {
    const substituted = aGlance({
      performed: [{
        exercise_id: 'incline-press',
        substituted_for_exercise_id: 'bench-press',
        status: 'substituted',
        sets_completed: 3,
        repetitions: 10,
        duration_seconds: null,
        observed_load: null,
      }],
    });
    const named = new Map([['bench-press', 'Bench Press'], ['incline-press', 'Incline Press']]);
    const report = describeGlance('client-ana', 'Ana', substituted, 'Push Day', named);
    assert.deepEqual(report.performed, ['Incline Press — instead of Bench Press 3 x 10']);
  });
});

describe('a session left unfinished', () => {
  const aSession = (over: Partial<SessionRecord['content']> = {}): SessionRecord => ({
    record_id: 'session-2',
    content: {
      routine_id: 'push-day',
      client_ids: ['client-ana'],
      status: 'in_progress',
      mode: 'in_person',
      started_at: '2026-07-25T09:00:00.000Z',
      ...over,
    },
  });

  it('is offered as an ordinary start rather than as a recovery mode', () => {
    const report = describeUnfinished(aSession(), 'Push Day', [{ clientId: 'client-ana', name: 'Ana' }]);
    assert.equal(report.sessionId, 'session-2');
    assert.match(report.words, /Push Day on 2026-07-25/);
    assert.equal(report.modeWords, 'In person');

    // THE ROSTER COMES OUT WHOLE, BESIDE THE SENTENCE RATHER THAN INSIDE IT, and that is what makes
    // "a session leads back to the people in it" possible: a name folded into a finished sentence
    // cannot also be a link, and repeating the same names underneath as links would be the same
    // words twice on a phone row. See `screens/circular-navigation.ts`.
    assert.deepEqual(report.people, [{ clientId: 'client-ana', name: 'Ana' }]);
    assert.ok(
      !report.words.includes('Ana'),
      'the roster is in the sentence as well as beside it, so the row says every name twice',
    );

    // Nothing in the words may read as a crash report. A power cut is normal, and on the day
    // nothing went wrong he must not be told something did.
    const said = `${UNFINISHED_INTRO} ${report.pickUpLabel}`.toLowerCase();
    for (const wrong of ['recover', 'crash', 'error', 'corrupt', 'failed', 'restore']) {
      assert.ok(!said.includes(wrong), `an unfinished session was worded with "${wrong}"`);
    }
    assert.match(UNFINISHED_INTRO, /same as starting/i);
  });

  it('names the session rather than nobody when the roster cannot be read back', () => {
    assert.match(describeUnfinished(aSession(), 'Push Day', []).words, /this session/);
  });

  it('shows a mode this version does not know about as it stands, rather than translating it', () => {
    assert.equal(modeWords('online'), 'Online');
    assert.equal(modeWords('in_person'), 'In person');
    assert.equal(modeWords('something-later'), 'something-later');
  });
});

describe('sessions already done', () => {
  it('says enough to see that they happened, and says that reading one is not built', () => {
    const report = describeHistory(
      {
        record_id: 'session-3',
        content: {
          routine_id: 'push-day',
          client_ids: ['client-ana'],
          status: 'completed',
          mode: 'online',
          started_at: '2026-07-19T09:00:00.000Z',
        },
      },
      'Push Day',
      [{ clientId: 'client-ana', name: 'Ana' }],
    );
    assert.equal(report.words, '2026-07-19 — Push Day');
    assert.deepEqual(report.people, [{ clientId: 'client-ana', name: 'Ana' }]);
    assert.equal(report.statusWords, 'Finished');
    assert.equal(report.modeWords, 'Online');
  });

  it('has a word for every status the record can hold, and shows an unknown one as it stands', () => {
    assert.equal(statusWords('completed'), 'Finished');
    assert.equal(statusWords('interrupted'), 'Interrupted');
    assert.equal(statusWords('abandoned'), 'Not finished');
    assert.equal(statusWords('in_progress'), 'Still open');
    assert.equal(statusWords('planned'), 'Planned');
    assert.equal(statusWords('something-later'), 'something-later');
  });

  it('says what it is, so nobody mistakes it for the session reader that is coming', () => {
    assert.match(HISTORY_TITLE, /already done/i);
  });
});

describe('what happened when he pressed start', () => {
  it('reports a started session as saved, and says where it is waiting', () => {
    const report = describeOutcome({ ok: true, session_id: 'session-4' });
    assert.equal(report.started, true);
    assert.equal(report.sessionId, 'session-4');
    assert.match(report.headline, /saved on this device/i);
  });

  /**
   * The core writes a sentence for the coach on every reason it can refuse. Carrying it through
   * unchanged is the same rule `clients.ts` follows for a record's refusal: a second version here
   * would be two sentences about one refusal, drifting apart from the moment either is edited.
   */
  it('shows the core\'s own sentence for a refusal, unchanged', () => {
    const said = 'That session is open in your other window. Continue it there.';
    const report = describeOutcome({ ok: false, reason: 'held_elsewhere', message: said, session_id: 's' });
    assert.equal(report.started, false);
    assert.equal(report.headline, said);
  });

  it('still says something when the core refused without a sentence', () => {
    const report = describeOutcome({ ok: false, reason: 'not_found' });
    assert.equal(report.started, false);
    assert.ok(report.headline.length > 0);
  });
});

describe('what this screen is deliberately NOT', () => {
  /**
   * EVERYTHING THIS MODULE CAN PUT IN FRONT OF THE COACH, gathered once.
   *
   * ## Why this is the WORDS and not the source text
   *
   * The first version of this sweep read `launcher.ts` and `CalendarScreen.tsx` off disk, and it
   * failed immediately — on the file headers, which explain the absences using the very words they
   * forbid. That is a harness manufacturing a defect: the finding arrives looking like evidence, and
   * acting on it would have meant deleting the comments that record WHY the decisions were made,
   * which is the one thing that stops the next editor re-adding the feature.
   *
   * The corpus is therefore what actually reaches the coach: every string this module exports, plus
   * the output of every function that words something, driven across the states it has. A comment
   * cannot fail it and a sentence on screen cannot escape it, which is the right way round.
   */
  const SPOKEN = (() => {
    const said: string[] = Object.values(launcher)
      .filter((held): held is string => typeof held === 'string');

    for (const held of Object.values(launcher)) {
      // The frozen groups of sentences — SECTION_TITLES, MODE_CHOICES — carry words too.
      if (typeof held === 'object' && held !== null) said.push(JSON.stringify(held));
    }

    let two = toggleClient(everythingChosen(), 'client-ben');
    two = pasteLink(chooseMode(two, 'online'), 'https://meet.google.com/abc-defg-hij');

    said.push(JSON.stringify(describeStart(NOTHING_CHOSEN, [], null, LAPTOP)));
    said.push(JSON.stringify(describeStart(two, ['Ana', 'Ben'], 'Push Day', LAPTOP)));
    // The same selection on a phone, because a state that says something DIFFERENT is a state the
    // sweep has to read too — a gate is a new branch, and an unswept branch is where the next
    // forbidden sentence lands.
    said.push(JSON.stringify(describeStart(two, ['Ana', 'Ben'], 'Push Day', PHONE)));
    said.push(JSON.stringify(describeGlance('client-ana', 'Ana', null, null)));
    said.push(JSON.stringify(describeOutcome({ ok: true, session_id: 'session-1' })));
    said.push(JSON.stringify(describeOutcome({ ok: false, reason: 'not_found' })));

    const session: SessionRecord = {
      record_id: 'session-2',
      content: {
        routine_id: 'push-day',
        client_ids: ['client-ana'],
        status: 'in_progress',
        mode: 'in_person',
        started_at: '2026-07-25T09:00:00.000Z',
      },
    };
    const roster = [{ clientId: 'client-ana', name: 'Ana' }];
    said.push(JSON.stringify(describeUnfinished(session, 'Push Day', roster)));
    said.push(JSON.stringify(describeHistory(session, 'Push Day', roster)));

    return said.join('\n').toLowerCase();
  })();

  /**
   * THE POSITIVE CONTROL, AND IT RUNS FIRST FOR A REASON.
   *
   * A sweep whose whole output is an absence can be dead and report clean — an empty corpus, a case
   * mismatch, a module that failed to load — and a dead sweep looks exactly like a healthy one. So
   * the same corpus is searched for phrases that are CERTAINLY in it, in the same run. Every
   * absence asserted below is worthless if this does not hold.
   */
  it('proves the sweep can find a word at all, before any of its silences are believed', () => {
    assert.ok(SPOKEN.length > 2000, `the sweep gathered only ${SPOKEN.length} characters, so its clean result means nothing`);
    for (const certain of ['in person', 'routine', 'first session']) {
      assert.ok(
        SPOKEN.includes(certain),
        `the sweep cannot find "${certain}", which this module certainly says. It is dead, and every `
          + 'absence it reports below is worthless.',
      );
    }
  });

  /**
   * THE ABSENCES. Each would be a plausible thing to add to a screen called Calendar, and each is a
   * recorded decision not to. Prose saying so rots silently; an assertion cannot.
   */
  it('never says anything about a reminder or a notification', () => {
    for (const word of ['remind', 'notification', 'notify', 'alert you']) {
      assert.ok(
        !SPOKEN.includes(word),
        `the launcher says "${word}" to the coach. He knows his own schedule, and an application `
          + 'that pesters him is the burden this product exists not to be.',
      );
    }
  });

  it('never suggests a heavier load, a longer hold or more repetitions', () => {
    for (const word of ['progression', 'suggest', 'recommend', 'try heavier', 'next time']) {
      assert.ok(
        !SPOKEN.includes(word),
        `the launcher says "${word}" to the coach. It SHOWS the previous session; the judgement `
          + 'about training load belongs to the certified professional, who is also adapting to a '
          + 'medical history.',
      );
    }
  });

  /**
   * NOT A MONTH GRID — and this one cannot be answered by words, because a grid is a structure
   * rather than a sentence. So the module's own SURFACE is what is checked: a date view would have
   * to expose something to move between months, weeks or days, and there is nothing here to move
   * with. The screen offers today's session and the history of the people chosen, and nothing else.
   */
  it('exposes nothing for moving around a date view, because there is not one', () => {
    const named = Object.keys(launcher).join(' ').toLowerCase();
    for (const word of ['month', 'week', 'grid', 'calendarday', 'nextday', 'previousday']) {
      assert.ok(
        !named.includes(word),
        `the launcher exports something named for "${word}". The destination is called Calendar; `
          + 'what was asked for is the way into running a session, and a date view has to earn its '
          + 'place as a finding rather than arrive with the name.',
      );
    }
  });
});

describe('the standing sentences', () => {
  it('tells him what to do before anybody has been chosen, rather than showing a blank panel', () => {
    assert.match(GLANCE_NOBODY_CHOSEN, /choose who is training/i);
  });
});

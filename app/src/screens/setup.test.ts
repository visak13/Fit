/**
 * WHAT THE SETUP WORDS ACTUALLY SAY, AND WHERE THE LINKS ACTUALLY GO.
 *
 * Three things are defended here, and only the first is the obvious one.
 *
 * THE FIRST is that every sentence says the thing it exists to say. Asserting a constant is non-empty
 * proves a string exists; it does not prove the string tells a coach to publish his sign-in screen
 * rather than to add himself as a test user, which is the exact difference between a working setup
 * and one that signs him out every week. So the assertions below read the CONTENT.
 *
 * THE SECOND is the two false instructions this build knows about by name. A prototype was used for
 * the SHAPE of this screen, and two of its four steps contradict settled decisions here: it enables
 * an API this application never calls, and it leaves the project in testing. Both would be
 * undetectable to the coach — he would follow them, and the failure would arrive weeks later looking
 * like a defect in this application. They are asserted ABSENT, and each absence check is paired with
 * a positive control so it cannot pass by being pointed at nothing.
 *
 * THE THIRD is the boundary between plausible and proven. A shape check must accept a value it must
 * accept AND reject one it must reject — a check that only ever says yes is decoration — and it must
 * never be the thing that stops him saving, because his own main calendar's id is his e-mail address
 * and a stricter check would refuse a value Google accepts.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CALENDAR_NOTICE } from '../platform/google-meet.ts';
import type { SmallFactStorage } from '../platform/google-identity.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY } from '../platform/google-settings.ts';
import * as SETUP from './setup.ts';
import {
  AUTHORISED_JAVASCRIPT_ORIGIN, CALENDAR_ID_LOCATION, CALENDAR_NOTICE_NAMING_THIS_PLACE,
  CALENDAR_SIGN_IN_FIRST, CALENDAR_STEPS, CLIENT_ID_PLACEHOLDER, CLIENT_ID_STEPS, CLIENT_ID_SUFFIX,
  COACHING_CALENDAR_SUFFIX, CONSENT_MUST_BE_PUBLISHED, CONSOLE_ADVICE_DATE, CONSOLE_TRAPS,
  NO_CLIENT_SECRET, ORIGIN_RULE, SETUP_FIELDS, SETUP_LABEL, SHAPE_CHECK_BLOCKS_SAVING,
  checkCalendarIdShape, checkClientIdShape, clientIdStanding, coachingCalendarStanding,
} from './setup.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The corpus every sweep runs over, and a storage that behaves like the browser's
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Every string reachable from a value, however it is nested. */
function stringsWithin(value: unknown, into: string[]): void {
  if (typeof value === 'string') { into.push(value); return; }
  if (Array.isArray(value)) { for (const member of value) stringsWithin(member, into); return; }
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) stringsWithin(member, into);
  }
}

/**
 * EVERY SENTENCE THIS MODULE CAN PUT IN FRONT OF THE COACH — READ FROM THE MODULE, NEVER LISTED HERE.
 *
 * This was a hand-written list first, and a break probe killed it: a planted claim in a NEW exported
 * constant sailed through every sweep below, because the sweeps could only see what the list
 * remembered to mention. A hand-maintained corpus makes the prohibition checks weakest exactly when a
 * later author adds something — which is the only moment they were ever going to matter.
 *
 * So the corpus is the module's own namespace, walked. A new exported sentence is swept the day it is
 * written, by nobody's decision.
 */
function everySentence(): string[] {
  const spoken: string[] = [];
  for (const exported of Object.values(SETUP)) stringsWithin(exported, spoken);

  // The sentences that are RETURNED rather than exported, driven through every branch that produces
  // one. A walk of the namespace cannot reach these.
  for (const field of SETUP_FIELDS) {
    for (const value of ['', 'anything at all', 'a@b.com', CLIENT_ID_PLACEHOLDER]) {
      spoken.push(field.check(value).sentence);
    }
    for (const entered of [true, false]) {
      for (const proven of [true, false]) spoken.push(field.standing({ entered, proven }).sentence);
    }
  }

  return spoken;
}

/** The browser's small-fact storage, as much of it as `readSetting`/`writeSetting` touch. */
function fakeStorage(): SmallFactStorage & { readonly held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
    removeItem: (key: string) => { held.delete(key); },
  } as SmallFactStorage & { readonly held: Map<string, string> };
}

/**
 * Whole words, by walking characters.
 *
 * A substring sweep for the product term "drive" flags "driven"; a check that cries wolf is deleted
 * within a week, which returns you to the failure it existed to prevent. Nothing here is a pattern —
 * this house does not put one in front of the coach's values or its own prose without asking.
 */
function words(text: string): string[] {
  const found: string[] = [];
  let current = '';
  for (const character of text.toLowerCase()) {
    const isWordCharacter =
      (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9');
    if (isWordCharacter) current += character;
    else if (current.length > 0) { found.push(current); current = ''; }
  }
  if (current.length > 0) found.push(current);
  return found;
}

function saysWord(text: string, word: string): boolean {
  return words(text).includes(word);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The steps
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the walk, as a list of destinations', () => {
  it('gives every step a stable id, and no two the same', () => {
    const ids = [...CLIENT_ID_STEPS, ...CALENDAR_STEPS].map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length, 'two steps share an id, so a tick would follow both');
    for (const id of ids) assert.ok(id.length > 0);
  });

  it('makes every step title a link that is absolute, https, and openable in a new tab', () => {
    for (const step of [...CLIENT_ID_STEPS, ...CALENDAR_STEPS]) {
      assert.ok(step.href.startsWith('https://'), `${step.id} is not an https address`);
      // Absolute means a browser can open it with nothing around it: a real host, and a path that is
      // part of the address rather than a fragment resolved against this application.
      const parsed = new URL(step.href);
      assert.equal(parsed.protocol, 'https:');
      assert.ok(parsed.host.length > 0);
      assert.ok(step.title.length > 0, `${step.id} has no link text`);
    }
  });

  it('titles what he is there to ACHIEVE rather than where to click', () => {
    for (const step of [...CLIENT_ID_STEPS, ...CALENDAR_STEPS]) {
      assert.ok(!saysWord(step.title, 'click'), `${step.id} tells him where to click`);
      assert.ok(!saysWord(step.title, 'button'), `${step.id} names a button Google can move`);
      assert.ok(!saysWord(step.title, 'menu'), `${step.id} names a menu Google can move`);
    }
  });

  it('covers the six things a client id needs, in the order they have to happen', () => {
    assert.deepEqual(
      CLIENT_ID_STEPS.map((step) => step.id),
      ['project', 'drive-api', 'calendar-api', 'consent', 'scopes', 'client'],
    );
  });

  it('has him register the three scopes under Data access, naming all three', () => {
    const scopes = CLIENT_ID_STEPS.find((step) => step.id === 'scopes');
    assert.ok(scopes !== undefined);
    // Un-registered scopes fail the same way an un-enabled API does: after sign-in already worked.
    const said = `${scopes.title} ${scopes.detail ?? ''}`;
    assert.ok(said.includes('drive.file'));
    assert.ok(said.includes('drive.appdata'));
    assert.ok(said.includes('calendar.events'));
    assert.ok(scopes.href.includes('/auth/scopes'));
  });

  it('enables each API as its own step, at its own page', () => {
    const drive = CLIENT_ID_STEPS.find((step) => step.id === 'drive-api');
    const calendar = CLIENT_ID_STEPS.find((step) => step.id === 'calendar-api');
    assert.ok(drive !== undefined && calendar !== undefined);
    // Its own page rather than the library's front door: a search box is a place to get lost, and an
    // API left off fails only AFTER sign-in succeeds, which reads as this application being broken.
    assert.notEqual(drive.href, calendar.href);
    assert.ok(drive.href.includes('drive.googleapis.com'));
    assert.ok(calendar.href.includes('calendar-json.googleapis.com'));
  });

  it('sends him to a calendar’s own settings for the id, and says the id is not the name', () => {
    assert.equal(CALENDAR_STEPS.length, 1);
    assert.ok(CALENDAR_STEPS[0].href.startsWith('https://calendar.google.com/'));
    assert.ok(saysWord(CALENDAR_ID_LOCATION, 'settings'));
    assert.ok(saysWord(CALENDAR_ID_LOCATION, 'name'), 'it must say the id is not the name he gave it');
  });

  it('closes the one link that does not preserve its destination, in words', () => {
    // MEASURED 2026-07-31: signed out, this link lands on a page about Google Calendar rather than on
    // sign-in, so it is the one destination claim in this module that a signed-out coach does not
    // arrive at. The gap is stated rather than pretended away.
    assert.ok(saysWord(CALENDAR_SIGN_IN_FIRST, 'sign'));
    assert.ok(saysWord(CALENDAR_SIGN_IN_FIRST, 'nothing') && saysWord(CALENDAR_SIGN_IN_FIRST, 'wrong'),
      'it must tell him nothing is wrong, or he concludes the instructions are');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two false instructions, asserted absent against a positive control
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the two instructions that would be false here', () => {
  it('never tells him to enable the Meet REST API, which this application does not call', () => {
    const corpus = everySentence().join(' ');
    assert.ok(!corpus.includes('Meet REST'), 'the Meet REST API is named somewhere in the setup words');
    assert.ok(!corpus.includes('meet.googleapis.com'));
    assert.ok(!corpus.includes('spaces.create'));

    // POSITIVE CONTROL. The check above is an absence, and an absence check pointed at nothing passes
    // for ever. This proves the same sweep sees the claim when it is actually there.
    const planted = `${corpus} enable the Meet REST API`;
    assert.ok(planted.includes('Meet REST'), 'the sweep cannot see a planted claim, so it proves nothing');
  });

  it('tells him to PUBLISH the sign-in screen, and never to add himself as a test user', () => {
    const consent = CLIENT_ID_STEPS.find((step) => step.id === 'consent');
    assert.ok(consent !== undefined);
    assert.ok(saysWord(consent.title, 'publish'), 'the publishing is the step, not a detail of it');

    // THE SWEEP DISTINGUISHES AN INSTRUCTION FROM AN EXPLANATION, because this module has to say the
    // words "test users" to explain why that section is missing. Sweeping the whole corpus for the
    // phrase would match its own explanation — so what is asserted absent is the phrase appearing in
    // anything he is told to DO: the step titles and the publishing sentence.
    const instructions = [
      ...CLIENT_ID_STEPS.map((step) => step.title),
      ...CALENDAR_STEPS.map((step) => step.title),
      CONSENT_MUST_BE_PUBLISHED,
    ].join(' ');
    assert.ok(!instructions.includes('test user'), 'somewhere he is told to add himself as a test user');

    const planted = `${instructions} add yourself as a test user`;
    assert.ok(planted.includes('test user'), 'the sweep cannot see a planted instruction');
  });

  it('mentions test users only to explain their ABSENCE, never to send him to add one', () => {
    for (const trap of CONSOLE_TRAPS) {
      for (const prose of [trap.cause, trap.whatYouShouldSee]) {
        if (!prose.includes('test user')) continue;
        // The one legitimate reason to say it: the list is not there, and here is why.
        assert.ok(saysWord(prose, 'no') || saysWord(prose, 'nothing'),
          'test users are mentioned without saying the list is absent');
        assert.ok(!saysWord(prose, 'add'), 'the explanation has turned into an instruction');
      }
    }
  });

  it('says why publishing matters in terms of what happens TO HIM', () => {
    // Not "set the publishing status to In Production", which is a console state he cannot weigh.
    assert.ok(saysWord(CONSENT_MUST_BE_PUBLISHED, 'expire'));
    assert.ok(saysWord(CONSENT_MUST_BE_PUBLISHED, 'week'));
    assert.ok(saysWord(CONSENT_MUST_BE_PUBLISHED, 'testing'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The origin, and the secret there is none of
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the authorised JavaScript origin', () => {
  it('is scheme and host and nothing else — no path, no trailing slash', () => {
    const parsed = new URL(AUTHORISED_JAVASCRIPT_ORIGIN);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(AUTHORISED_JAVASCRIPT_ORIGIN, parsed.origin, 'anything beyond the origin is rejected by Google');
    assert.ok(!AUTHORISED_JAVASCRIPT_ORIGIN.endsWith('/'));
    // The published site sits under a folder; the origin deliberately does not carry it.
    assert.ok(!AUTHORISED_JAVASCRIPT_ORIGIN.includes('/Fit'));
  });

  it('says the rule as a shape rather than as a Google error message', () => {
    assert.ok(saysWord(ORIGIN_RULE, 'folder'));
    assert.ok(saysWord(ORIGIN_RULE, 'slash'));
    assert.ok(saysWord(ORIGIN_RULE, 'copy'), 'he copies it; he is never asked to type it');
  });

  it('tells him there is no client secret, because the same console page offers him one', () => {
    assert.ok(saysWord(NO_CLIENT_SECRET, 'never'));
    assert.ok(saysWord(NO_CLIENT_SECRET, 'secret'));
    assert.ok(saysWord(NO_CLIENT_SECRET, 'leave'), 'silence would send him looking for somewhere to put it');
  });

  it('shows the real client-id format in the empty box', () => {
    assert.ok(CLIENT_ID_PLACEHOLDER.endsWith(CLIENT_ID_SUFFIX));
    assert.ok(CLIENT_ID_PLACEHOLDER.indexOf('-') > 0, 'a real one begins with a long number and a dash');
    assert.equal(checkClientIdShape(CLIENT_ID_PLACEHOLDER).verdict, 'looks-right');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two traps a link cannot carry
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the console traps', () => {
  it('carries the date as ONE constant rather than typed into the prose', () => {
    for (const trap of CONSOLE_TRAPS) {
      assert.equal(trap.measuredOn, CONSOLE_ADVICE_DATE);
      assert.ok(!trap.cause.includes(CONSOLE_ADVICE_DATE), 'the date is written into the sentence too');
      assert.ok(!trap.whatYouShouldSee.includes(CONSOLE_ADVICE_DATE));
    }
  });

  it('names where the moved controls actually live now', () => {
    const moved = CONSOLE_TRAPS.find((trap) => trap.id === 'moved-under-audience');
    assert.ok(moved !== undefined);
    assert.ok(moved.cause.includes('Data access'));
    assert.ok(moved.cause.includes('Audience'));
    assert.ok(moved.whatYouShouldSee.includes('Audience'), 'he needs to know he is in the right place');
    assert.ok(moved.href.startsWith('https://'));
  });

  it('says the test-users list is ABSENT rather than empty, and names the cause', () => {
    const production = CONSOLE_TRAPS.find((trap) => trap.id === 'no-test-users-in-production');
    assert.ok(production !== undefined);
    // Absent-with-no-explanation is what makes a non-technical reader conclude he broke something.
    assert.ok(saysWord(production.cause, 'no'));
    assert.ok(production.cause.includes('In Production'));
    assert.ok(saysWord(production.cause, 'testing'), 'the cause is unusable without naming the way back');
    assert.ok(saysWord(production.cause, 'broken') || saysWord(production.cause, 'hidden'),
      'it must say nothing is broken, which is the thing he will assume');
  });

  it('gives every trap a cause AND what he should see, never one without the other', () => {
    for (const trap of CONSOLE_TRAPS) {
      assert.ok(trap.cause.length > 0);
      assert.ok(trap.whatYouShouldSee.length > 0, `${trap.id} names a cause with nothing to check it against`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The shape checks — one it must accept, one it must reject
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the client id shape check', () => {
  it('accepts a real client id', () => {
    const check = checkClientIdShape('123456789012-abc123def456.apps.googleusercontent.com');
    assert.equal(check.verdict, 'looks-right');
    assert.ok(check.sentence.length > 0);
  });

  it('rejects the client secret from the same page, and says which is which', () => {
    const check = checkClientIdShape('GOCSPX-a1b2c3d4e5f6g7h8i9j0');
    assert.equal(check.verdict, 'looks-wrong');
    assert.ok(check.sentence.includes(CLIENT_ID_SUFFIX), 'it must say what a real one ends with');
    assert.ok(saysWord(check.sentence, 'secret'), 'it must name the thing he most likely pasted');
  });

  it('catches half a client id — the right ending with the front missing', () => {
    // The ending is right, so the first branch passes it. What is missing is the long number and the
    // dash at the front — the half he loses when a double-click selects only the tail.
    const check = checkClientIdShape('abcdef.apps.googleusercontent.com');
    assert.equal(check.verdict, 'looks-wrong');
    assert.ok(saysWord(check.sentence, 'whole'));
    assert.ok(saysWord(check.sentence, 'dash'), 'it must name what is missing, not just say it is wrong');
  });

  it('treats an empty box as empty rather than as wrong, and says what it costs him', () => {
    for (const nothing of ['', '   ', null, undefined]) {
      assert.equal(checkClientIdShape(nothing).verdict, 'empty');
    }
    assert.ok(saysWord(checkClientIdShape('').sentence, 'connect'));
  });
});

describe('the coaching calendar shape check', () => {
  it('accepts a calendar made for coaching', () => {
    assert.equal(
      checkCalendarIdShape(`c_9f3b21${COACHING_CALENDAR_SUFFIX}`).verdict,
      'looks-right',
    );
  });

  it('ACCEPTS his own e-mail address, because that is his main calendar’s real id', () => {
    // The refusal this check must not make. His primary calendar id is his address, Google accepts
    // it, and a check built only around the coaching suffix would block a legitimate value.
    const check = checkCalendarIdShape('the.coach@gmail.com');
    assert.equal(check.verdict, 'looks-right');
    assert.ok(saysWord(check.sentence, 'main'), 'it must say WHERE sessions will land, not just accept it');
  });

  it('rejects the calendar’s NAME, which is what he is most likely to paste', () => {
    const check = checkCalendarIdShape('Coaching sessions');
    assert.equal(check.verdict, 'looks-wrong');
    assert.ok(check.sentence.includes(COACHING_CALENDAR_SUFFIX));
    assert.ok(saysWord(check.sentence, 'name'));
  });

  it('treats an empty box as a WORKING state rather than an unfinished one', () => {
    const check = checkCalendarIdShape(null);
    assert.equal(check.verdict, 'empty');
    assert.ok(saysWord(check.sentence, 'main'), 'it must say where sessions go meanwhile');
  });
});

describe('what a shape check is allowed to do', () => {
  it('never blocks a save, and that is declared as data rather than left as an absent branch', () => {
    // A later author turning this into a gate has to change a constant a test is watching.
    assert.equal(SHAPE_CHECK_BLOCKS_SAVING, false);
  });

  it('saves a value its own check called wrong, proving the warning is not a refusal', () => {
    const storage = fakeStorage();
    const field = SETUP_FIELDS.find((entry) => entry.key === COACHING_CALENDAR_KEY);
    assert.ok(field !== undefined);
    assert.equal(field.check('Coaching sessions').verdict, 'looks-wrong');
    assert.equal(field.save(storage, 'Coaching sessions'), true);
    assert.equal(field.read(storage), 'Coaching sessions');
  });

  it('says something in every verdict — a verdict with no sentence is a red box with no reason', () => {
    for (const field of SETUP_FIELDS) {
      for (const value of ['', 'plainly wrong', CLIENT_ID_PLACEHOLDER, 'a@b.com']) {
        assert.ok(field.check(value).sentence.length > 0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Entered is not confirmed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('entered versus confirmed', () => {
  it('separates nothing-entered from entered-but-never-used from proven', () => {
    assert.equal(clientIdStanding({ entered: false, proven: false }).state, 'nothing-entered');
    assert.equal(clientIdStanding({ entered: true, proven: false }).state, 'never-used');
    assert.equal(clientIdStanding({ entered: true, proven: true }).state, 'proven');
  });

  it('names SIGNING IN as the client id’s proof, in both the unproven and proven sentences', () => {
    const never = clientIdStanding({ entered: true, proven: false }).sentence;
    const proven = clientIdStanding({ entered: true, proven: true }).sentence;
    for (const sentence of [never, proven]) {
      assert.ok(saysWord(sentence, 'signing'), 'the proof is named, never left as "not verified"');
    }
    assert.ok(saysWord(never, 'typed'), 'it must say the saved value is only what he typed');
  });

  it('names MAKING A MEETING LINK as the calendar’s proof, and it is a different proof', () => {
    const never = coachingCalendarStanding({ entered: true, proven: false }).sentence;
    const proven = coachingCalendarStanding({ entered: true, proven: true }).sentence;
    for (const sentence of [never, proven]) {
      assert.ok(saysWord(sentence, 'meeting') && saysWord(sentence, 'link'));
    }
    assert.ok(!saysWord(never, 'signing'), 'the two settings do not share one proof');
  });

  it('does not call an unset calendar unfinished, because it is a working state', () => {
    const nothing = coachingCalendarStanding({ entered: false, proven: false });
    assert.equal(nothing.state, 'nothing-entered');
    assert.ok(saysWord(nothing.sentence, 'works'), 'an honest fallback must not read as a fault');
  });

  it('is told whether a value has worked rather than deciding it from the shape', () => {
    // A client id from the wrong project has a perfect shape and fails at the moment he signs in.
    const perfectlyShaped = '123456789012-abc.apps.googleusercontent.com';
    assert.equal(checkClientIdShape(perfectlyShaped).verdict, 'looks-right');
    assert.equal(clientIdStanding({ entered: true, proven: false }).state, 'never-used');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The fields, bound to the keys this application already has
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the two fields', () => {
  it('uses s7’s keys and invents none of its own', () => {
    assert.deepEqual(
      SETUP_FIELDS.map((field) => field.key),
      [GOOGLE_CLIENT_ID_KEY, COACHING_CALENDAR_KEY],
    );
  });

  it('binds each field’s reader and writer to its OWN key', () => {
    // The defect this catches saves the calendar id under the client id's name, where neither value
    // errors and the app simply never sees either of them.
    const storage = fakeStorage();
    for (const field of SETUP_FIELDS) field.save(storage, `value for ${field.key}`);
    for (const field of SETUP_FIELDS) {
      assert.equal(storage.held.get(field.key), `value for ${field.key}`);
      assert.equal(field.read(storage), `value for ${field.key}`);
    }
  });

  it('forgets a setting when he clears the box, rather than leaving the old value in use', () => {
    const storage = fakeStorage();
    const [clientId] = SETUP_FIELDS;
    clientId.save(storage, CLIENT_ID_PLACEHOLDER);
    clientId.save(storage, '');
    assert.equal(storage.held.has(clientId.key), false);
    assert.equal(clientId.read(storage), null);
  });

  it('survives a browser that refuses storage, because that is a state and not an exception', () => {
    for (const field of SETUP_FIELDS) {
      assert.equal(field.read(null), null);
      assert.equal(field.save(null, 'anything'), false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The promise that was already on screen
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the name of this place', () => {
  it('is spelled the way the shipped calendar notice already spells it', () => {
    // `google-meet.ts` has told the coach to "paste its id into Setup" since the Google step. This is
    // the assertion that stops a rename here turning that shipped sentence into a dead instruction.
    assert.ok(CALENDAR_NOTICE.main.includes(SETUP_LABEL));
    assert.ok(CALENDAR_NOTICE.own.includes(SETUP_LABEL));
    assert.equal(CALENDAR_NOTICE_NAMING_THIS_PLACE, CALENDAR_NOTICE.main);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The house prohibitions, each with a positive control
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Anything outside plain text and the two typographic marks this house actually uses. */
function nonPlainCharacters(text: string): string[] {
  const found: string[] = [];
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x0080) continue;
    // The right single quote and the em dash are typography, not decoration, and both are in use
    // across this application's copy already.
    if (character === '’' || character === '—') continue;
    found.push(character);
  }
  return found;
}

describe('what these words are not allowed to contain', () => {
  it('has no emoji in any string', () => {
    for (const sentence of everySentence()) {
      assert.deepEqual(nonPlainCharacters(sentence), [], `not plain text: ${sentence}`);
    }
    assert.deepEqual(nonPlainCharacters('done ✅'), ['✅'], 'the sweep cannot see an emoji');
  });

  it('makes no Android claim anywhere, not even as pending', () => {
    const corpus = everySentence().join(' ');
    assert.ok(!saysWord(corpus, 'android'));
    assert.ok(saysWord(`${corpus} coming soon on Android`, 'android'));
  });

  it('makes no security, encryption or compliance claim — a2 owns that wording, not this module', () => {
    const corpus = everySentence().join(' ');
    for (const claim of ['secure', 'safe', 'encrypted', 'private', 'hipaa', 'gdpr', 'compliant', 'certified']) {
      assert.ok(!saysWord(corpus, claim), `the setup words make a "${claim}" claim`);
    }
    // POSITIVE CONTROL, and it matters here more than anywhere: this sweep is the only thing standing
    // between a second, differently-worded security promise and the coach.
    assert.ok(saysWord(`${corpus} your data is safe`, 'safe'));
  });
});

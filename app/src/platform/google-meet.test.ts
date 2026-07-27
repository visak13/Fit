/**
 * MINTING A MEETING LINK, DRIVEN THROUGH A FAKE CALENDAR THAT IS RUDER THAN THE REAL ONE.
 *
 * ## WHAT A GREEN RUN PROVES, AND WHAT IT DOES NOT
 *
 * It proves `google-meet.ts` behaves correctly GIVEN THE RESPONSES MODELLED HERE. It proves nothing
 * about Google: no request in this file leaves the machine, the transport is injected, and there is
 * no network anywhere in it.
 *
 * ONE THING IN PARTICULAR IS NOT PROVEN AND IT IS NAMED SO NOBODY LATER READS THIS SUITE AS SAYING
 * OTHERWISE. **The pending-to-success polling loop has never executed against the real service.**
 * Both mints on the platform spike came back `success` immediately, so the loop was never entered.
 * It is UNEXERCISED, WHICH IS NOT DISPROVEN. What is exercised here is the loop against a double that
 * answers pending first, and against one that answers pending for ever. A green run of the two tests
 * below is evidence about this code, not about Google, and it must never be reported as a live proof.
 *
 * ## AND THE FAKE IS DELIBERATELY NOT KINDER THAN REALITY
 *
 * A fake that answers more politely than the service silently disarms every sweep downstream of it:
 * a whitelist test fed a tidy response passes over a payload that never contained the dangerous thing
 * in the first place, and an unarmed sweep is indistinguishable from a clean codebase. So
 * {@link aRealCalendarResponse} carries the whole shape — `htmlLink` with the segment that base64
 * embeds the signed-in address, `creator` and `organizer` blocks, `iCalUID`, a `conferenceId`,
 * MORE THAN ONE KIND OF ENTRY POINT with the video one NOT first, and keys this application has no
 * use for. {@link the whitelist is proved against it} rather than against a stub.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { Clock } from '../../core/remote/clock.js';

import {
  CALENDARS_ENDPOINT,
  CONFERENCE_DATA_VERSION,
  CONFERENCE_SOLUTION,
  CONFERENCE_STATUS,
  GROUP_CALL_LIMIT_MINUTES,
  GROUP_CALL_WARNING,
  GoogleMeetLinks,
  MAIN_CALENDAR_ID,
  MINT_REFUSALS,
  NO_CONFERENCE,
  PASTE_INSTEAD,
  SESSION_EVENT_TITLE,
  STILL_PENDING,
  CALENDAR_NOTICE,
  calendarNotice,
  conferenceReading,
  groupCallWarning,
  insertBody,
  requestIdFor,
  videoEntryPoint,
} from './google-meet.ts';
import type { HttpRequestLike, HttpResponseLike } from './google-drive-remote.ts';
import { CarriedToken } from './google-identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A token that is live and says nothing about anybody. */
function aToken(): CarriedToken {
  return new CarriedToken('not-a-real-access-token', '2099-01-01T00:00:00.000Z', []);
}

/** A clock whose sleep resolves only when the test says so, so a deadline is a decision. */
function testClock(start = '2026-07-26T09:00:00.000Z'): Clock & {
  passEveryDeadline(): void; advance(ms: number): void;
} {
  let at = Date.parse(start);
  let pending: (() => void)[] = [];
  return {
    now: () => at,
    sleep: (ms: number) => new Promise<void>((resolve) => {
      pending.push(() => { at += ms; resolve(); });
    }),
    passEveryDeadline() {
      const due = pending;
      pending = [];
      for (const expire of due) expire();
    },
    advance(ms: number) { at += ms; },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The fake, and what makes it rude
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The signed-in account. It appears NOWHERE in the clear in the response built below. */
const COACH_ADDRESS = 'not.a.real.coach@example.com';

/** The joining address the service hands back. The only string this application may end up with. */
const MEET_URL = 'https://meet.google.com/abc-defg-hij';

/**
 * A calendar response shaped like the real one, INCLUDING EVERYTHING THIS APPLICATION MUST DROP.
 *
 * The `eid` on `htmlLink` is base64 of "<event id> <calendar id>", and the calendar id of a personal
 * account IS the account's email address. Nothing here is a credential; every credential-shaped
 * scanner passes it; the address is in it all the same.
 *
 * THE VIDEO ENTRY POINT IS DELIBERATELY NOT FIRST and is not alone. A reader that took
 * `entryPoints[0]` would hand the coach a telephone number.
 */
function aRealCalendarResponse(
  status: string = CONFERENCE_STATUS.SUCCESS,
  { withConference = true }: { withConference?: boolean } = {},
): Record<string, unknown> {
  const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
  const event: Record<string, unknown> = {
    kind: 'calendar#event',
    etag: '"3421887654321000"',
    id: 'evt7g3k9q2m4',
    status: 'confirmed',
    htmlLink: `https://www.google.com/calendar/event?eid=${eid}`,
    created: '2026-07-26T09:00:00.000Z',
    updated: '2026-07-26T09:00:01.000Z',
    summary: SESSION_EVENT_TITLE,
    creator: { email: COACH_ADDRESS, self: true },
    organizer: { email: COACH_ADDRESS, self: true },
    start: { dateTime: '2026-07-26T09:00:00Z', timeZone: 'Europe/London' },
    end: { dateTime: '2026-07-26T10:00:00Z', timeZone: 'Europe/London' },
    iCalUID: 'evt7g3k9q2m4@google.com',
    sequence: 0,
    reminders: { useDefault: true },
    eventType: 'default',
  };

  if (!withConference) return event;

  event.hangoutLink = MEET_URL;
  event.conferenceData = {
    createRequest: {
      requestId: requestIdFor('session-1'),
      conferenceSolutionKey: { type: CONFERENCE_SOLUTION },
      status: { statusCode: status },
    },
    entryPoints: status === CONFERENCE_STATUS.SUCCESS
      ? [
        // Not first, and not alone. See the note above.
        { entryPointType: 'more', uri: 'https://tel.meet/abc-defg-hij?pin=1234567890123' },
        { entryPointType: 'phone', uri: 'tel:+44-20-7946-0000', pin: '123456789' },
        { entryPointType: 'video', uri: MEET_URL, label: 'meet.google.com/abc-defg-hij' },
      ]
      : [],
    conferenceSolution: { key: { type: CONFERENCE_SOLUTION }, name: 'Google Meet' },
    conferenceId: 'abc-defg-hij',
    signature: 'ADQ8v0Ynot_a_real_signature_value',
  };
  return event;
}

/** One canned answer. */
interface Answer {
  readonly ok?: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly unreadable?: boolean;
  readonly throws?: boolean;
}

interface Sent {
  readonly url: string;
  readonly request: HttpRequestLike;
}

/** A transport that answers from a script and records what it was asked. */
function scripted(answers: readonly Answer[]): {
  transport: (url: string, request: HttpRequestLike) => Promise<HttpResponseLike>;
  readonly sent: Sent[];
} {
  const sent: Sent[] = [];
  let at = 0;
  return {
    sent,
    transport(url, request) {
      sent.push({ url, request });
      const answer = answers[Math.min(at, answers.length - 1)] ?? {};
      at += 1;
      if (answer.throws === true) return Promise.reject(new Error('no network'));
      return Promise.resolve({
        ok: answer.ok ?? true,
        status: answer.status ?? 200,
        json: () => (answer.unreadable === true
          ? Promise.reject(new Error('not json'))
          : Promise.resolve(answer.body)),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    },
  };
}

/** The subject, wired to a script. `waitBetweenPolls` is instant so a suite is not a stopwatch. */
function links(
  answers: readonly Answer[],
  { calendarId = null as string | null, token = aToken() as CarriedToken | null, maxPolls = 8 } = {},
) {
  const clock = testClock();
  const wire = scripted(answers);
  let waited = 0;
  const meet = new GoogleMeetLinks({
    token: () => token,
    coachingCalendarId: () => calendarId,
    transport: wire.transport,
    clock,
    maxPolls,
    waitBetweenPolls: (ms) => { waited += 1; clock.advance(ms); return Promise.resolve(); },
  });
  return { meet, clock, sent: wire.sent, waits: () => waited };
}

/** One mint request. */
const A_SESSION = Object.freeze({
  sessionId: 'session-1',
  startsAt: new Date('2026-07-26T09:00:00.000Z'),
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('platform — minting a meeting link on the calendar', () => {
  it('inserts a real event with conferenceDataVersion=1 and reads the link from the VIDEO entry point', async () => {
    const { meet, sent } = links([{ body: aRealCalendarResponse() }]);

    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'minted');
    assert.equal(outcome.outcome === 'minted' ? outcome.url : null, MEET_URL,
      'the address came from the entry point, which is NOT the first one in the array');
    assert.equal(sent.length, 1);
    assert.ok(sent[0].url.startsWith(`${CALENDARS_ENDPOINT}/${MAIN_CALENDAR_ID}/events`));
    assert.ok(sent[0].url.includes(`conferenceDataVersion=${CONFERENCE_DATA_VERSION}`),
      'without this parameter the service accepts the insert and silently makes no conference');
    assert.equal(sent[0].request.method, 'POST');
  });

  it('sends a STABLE request identifier, so a retry asks for the meeting it already made', async () => {
    const first = links([{ body: aRealCalendarResponse() }]);
    await first.meet.mint(A_SESSION);
    const second = links([{ body: aRealCalendarResponse() }]);
    await second.meet.mint(A_SESSION);

    const idOf = (sent: Sent) => JSON.parse(new TextDecoder().decode(sent.request.body))
      .conferenceData.createRequest.requestId;

    assert.equal(idOf(first.sent[0]), idOf(second.sent[0]),
      'the same session must always send the same identifier or a retry mints a SECOND meeting');
    assert.equal(idOf(first.sent[0]), requestIdFor(A_SESSION.sessionId));
    assert.notEqual(requestIdFor('session-1'), requestIdFor('session-2'),
      'and two different sessions must not collide onto one meeting');
  });

  it('sends nothing about the clients: no attendees, no names, no description', async () => {
    const { sent } = links([{ body: aRealCalendarResponse() }]);
    const body = JSON.parse(new TextDecoder().decode(insertBody(A_SESSION)));

    assert.deepEqual(Object.keys(body).sort(), ['conferenceData', 'end', 'start', 'summary']);
    assert.equal(body.summary, SESSION_EVENT_TITLE);
    assert.equal(body.attendees, undefined,
      'the client is never an invitee, so no client address is ever collected or sent');
    assert.equal(sent.length, 0);
  });

  it('books the session for its length, from the instant it starts', () => {
    const body = JSON.parse(new TextDecoder().decode(
      insertBody({ ...A_SESSION, minutes: 45 }),
    ));
    assert.equal(body.start.dateTime, '2026-07-26T09:00:00.000Z');
    assert.equal(body.end.dateTime, '2026-07-26T09:45:00.000Z');
  });
});

describe('platform — the pending conference, and the loop that has never run against Google', () => {
  it('polls a PENDING conference through to success and only then reads the entry point', async () => {
    const { meet, sent, waits } = links([
      { body: aRealCalendarResponse(CONFERENCE_STATUS.PENDING) },
      { body: aRealCalendarResponse(CONFERENCE_STATUS.PENDING) },
      { body: aRealCalendarResponse(CONFERENCE_STATUS.SUCCESS) },
    ]);

    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'minted');
    assert.equal(outcome.outcome === 'minted' ? outcome.url : null, MEET_URL);
    assert.equal(outcome.outcome === 'minted' ? outcome.polls : -1, 2,
      'it entered the loop twice — this is the ONLY place that loop has ever been entered');
    assert.equal(waits(), 2, 'and it waited between polls rather than spinning');
    assert.equal(sent.length, 3);
    assert.equal(sent[1].request.method, 'GET', 'a poll re-reads the event, it does not re-insert');
    assert.ok(sent[1].url.includes(`conferenceDataVersion=${CONFERENCE_DATA_VERSION}`),
      'a poll without the parameter comes back with no conference and reads as a degradation');
  });

  it('GIVES UP on a conference that stays pending for ever, rather than spinning where he cannot leave', async () => {
    const { meet, sent } = links(
      [{ body: aRealCalendarResponse(CONFERENCE_STATUS.PENDING) }],
      { maxPolls: 3 },
    );

    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'still-pending');
    assert.equal(outcome.outcome === 'still-pending' ? outcome.polls : -1, 3);
    assert.equal(sent.length, 4, 'the insert and exactly three polls, then it stopped');
    assert.equal(outcome.outcome === 'still-pending' ? outcome.sentence : '', STILL_PENDING);
    assert.ok(STILL_PENDING.includes(PASTE_INSTEAD), 'and it tells him what to do instead');
  });

  it('a conference request that comes back FAILURE degrades rather than being retried for ever', async () => {
    const { meet } = links([{ body: aRealCalendarResponse(CONFERENCE_STATUS.FAILURE) }]);
    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'no-conference');
    assert.equal(outcome.outcome === 'no-conference' ? outcome.requestFailed : false, true);
    assert.equal(outcome.outcome === 'no-conference' ? outcome.sentence : '', NO_CONFERENCE);
  });
});

describe('platform — degrading at the insert boundary, which is the only boundary there is', () => {
  it('an insert that comes back WITHOUT a conference says what the calendar cannot do AND what he can, in that order', async () => {
    const { meet } = links([{ body: aRealCalendarResponse('', { withConference: false }) }]);

    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'no-conference');
    const said = outcome.outcome === 'no-conference' ? outcome.sentence : '';
    assert.ok(said.includes('cannot create meeting links'), 'the limitation is named plainly');
    assert.ok(said.endsWith(PASTE_INSTEAD), 'and the way out arrives in the same breath, AFTER it');
    assert.ok(said.indexOf('cannot create meeting links') < said.indexOf(PASTE_INSTEAD),
      'limitation first, exit second — a way out offered before the problem reads as a non-sequitur');
    assert.equal(/fail|error|sorry|unable/i.test(said), false,
      'and it does not read as something he did wrong, because it is not');
  });

  it('every refusal carries the same exit, so it cannot go missing from one of them', () => {
    for (const [code, sentence] of Object.entries(MINT_REFUSALS)) {
      assert.ok(sentence.includes(PASTE_INSTEAD), `${code} offers the way out`);
      assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sentence), false,
        `${code} carries no emoji`);
    }
    assert.ok(NO_CONFERENCE.includes(PASTE_INSTEAD));
    assert.ok(STILL_PENDING.includes(PASTE_INSTEAD));
  });

  it('no live token is a refusal with words, never an exception at the moment he presses start', async () => {
    const { meet, sent } = links([{ body: aRealCalendarResponse() }], { token: null });
    const outcome = await meet.mint(A_SESSION);

    assert.equal(outcome.outcome, 'refused');
    assert.equal(outcome.outcome === 'refused' ? outcome.code : '', 'no-credential');
    assert.equal(sent.length, 0, 'and nothing was sent anywhere');
  });

  it('an unreachable network, a refusal, an unreadable answer and a deadline are four different sentences', async () => {
    const unreachable = await links([{ throws: true }]).meet.mint(A_SESSION);
    assert.equal(unreachable.outcome === 'refused' ? unreachable.code : '', 'not-reachable');

    const refused = await links([{ ok: false, status: 400 }]).meet.mint(A_SESSION);
    assert.equal(refused.outcome === 'refused' ? refused.code : '', 'refused');

    const stale = await links([{ ok: false, status: 401 }]).meet.mint(A_SESSION);
    assert.equal(stale.outcome === 'refused' ? stale.code : '', 'no-credential',
      'a 401 is his hour having run out, and retrying it for ever renews nothing');

    const unreadable = await links([{ unreadable: true }]).meet.mint(A_SESSION);
    assert.equal(unreadable.outcome === 'refused' ? unreadable.code : '', 'unreadable');

    const sentences = new Set([unreachable, refused, stale, unreadable]
      .map((o) => (o.outcome === 'refused' ? o.sentence : '')));
    assert.equal(sentences.size, 4, 'four states he can do four different things about');
  });

  it('a deadline ABORTS the request rather than leaving it holding a socket', async () => {
    const clock = testClock();
    const sent: Sent[] = [];
    const meet = new GoogleMeetLinks({
      token: () => aToken(),
      coachingCalendarId: () => null,
      clock,
      transport: (url, request) => {
        sent.push({ url, request });
        // Never answers. The deadline is the only thing that can settle this.
        return new Promise<HttpResponseLike>(() => {});
      },
    });

    const pending = meet.mint(A_SESSION);
    await Promise.resolve();
    clock.passEveryDeadline();
    const outcome = await pending;

    assert.equal(outcome.outcome === 'refused' ? outcome.code : '', 'timed-out');
    assert.equal(sent[0].request.signal.aborted, true, 'the request was actually aborted');
  });
});

describe('platform — the whitelist, proved against a response that is NOT tidied up', () => {
  it('the fake genuinely carries the dangerous thing, or everything below proves nothing', () => {
    const raw = JSON.stringify(aRealCalendarResponse());

    assert.equal(raw.includes(COACH_ADDRESS), true,
      'in the clear, in creator and organizer');
    const eid = String(aRealCalendarResponse().htmlLink).split('eid=')[1];
    assert.equal(
      Buffer.from(eid, 'base64').toString('utf8').includes(COACH_ADDRESS), true,
      'AND encoded inside the event link, where a plaintext grep cannot see it',
    );
    assert.equal(raw.includes('conferenceId'), true);
    assert.equal(raw.includes('iCalUID'), true);
  });

  it('carries forward THREE named fields and nothing else — not the link, not the creator, not the id', () => {
    const reading = conferenceReading(aRealCalendarResponse());

    assert.notEqual(reading, null);
    assert.deepEqual(Object.keys(reading!).sort(), ['eventId', 'status', 'videoUrl']);
    assert.equal(reading!.videoUrl, MEET_URL);
    assert.equal(reading!.status, CONFERENCE_STATUS.SUCCESS);

    const carried = JSON.stringify(reading);
    for (const forbidden of ['htmlLink', 'creator', 'organizer', 'iCalUID', 'conferenceId',
      'calendar#event', 'signature', COACH_ADDRESS]) {
      assert.equal(carried.includes(forbidden), false, `${forbidden} does not travel`);
    }
  });

  it('what a minted outcome hands its caller is a URL and two facts, never an object off the wire', async () => {
    const { meet } = links([{ body: aRealCalendarResponse() }]);
    const outcome = await meet.mint(A_SESSION);

    assert.deepEqual(Object.keys(outcome).sort(), ['onMainCalendar', 'outcome', 'polls', 'url']);
    assert.equal(JSON.stringify(outcome).includes(COACH_ADDRESS), false);
  });

  it('refuses to read a URL from anything that is not the video entry point', () => {
    assert.equal(videoEntryPoint({ entryPoints: [{ entryPointType: 'phone', uri: 'tel:+441234' }] }), null);
    assert.equal(videoEntryPoint({ entryPoints: [{ entryPointType: 'video' }] }), null,
      'an entry point with no address is not an address');
    assert.equal(videoEntryPoint({ entryPoints: [{ entryPointType: 'video', uri: 'http://meet.google.com/x' }] }), null,
      'and a joining link this app would write down is https');
    assert.equal(videoEntryPoint({ conferenceId: 'abc-defg-hij' }), null,
      'A CONFERENCE ID IS NOT A LINK. Nothing here builds one from it.');
    assert.equal(videoEntryPoint(null), null);

    // The positive control, in the same run: the same function DOES find one when it is there.
    assert.equal(
      videoEntryPoint({ entryPoints: [{ entryPointType: 'video', uri: MEET_URL }] }), MEET_URL,
      'and the check is not simply returning null at everything',
    );
  });
});

describe('platform — the two paths this file may never take', () => {
  /**
   * THE SOURCE WITH ITS PROSE TAKEN OFF, and this is the whole reason these two tests work.
   *
   * The house style documents a prohibition BESIDE the code it constrains, so a scan over raw source
   * matches the very sentences explaining why the forbidden thing is forbidden. A scan built that way
   * either fails on its own documentation or gets "fixed" by somebody deleting the explanation, which
   * is the worse of the two. So the comments come off first and the assertions read CODE.
   */
  const code = readFileSync(join(HERE, 'google-meet.ts'), 'utf8')
    .split('\n')
    .filter((line) => {
      const at = line.trimStart();
      return !at.startsWith('*') && !at.startsWith('//') && !at.startsWith('/*');
    })
    .join('\n');

  it('never reaches for the Meet REST spaces path, which does not exist for this account type', () => {
    assert.equal(/spaces\.create|meet\.googleapis\.com|\/v2\/spaces/.test(code), false,
      'the spike measured that this path is not available on a free personal Gmail account');

    // NON-VACUITY: the same search over the same text finds the path that IS taken. Without this,
    // an empty result would be indistinguishable from having read the wrong file, or from the
    // comment strip above having eaten everything.
    assert.ok(/calendar\/v3\/calendars/.test(code),
      'and the scan is looking at code that really does contain the calendar path');
  });

  it('never synthesises a joining address and never asks for a pre-flight', () => {
    assert.equal(/meet\.google\.com/.test(code), false,
      'no template, no host, nothing a URL could be built out of');
    assert.equal(/calendarList/.test(code), false,
      'calendarList.get is 403 under the narrow scope; the degradation is at the insert boundary');

    assert.ok(/entryPointType/.test(code), 'and the scan is reading real code, not an empty string');
  });
});

describe('platform — which calendar this lands on, said before it lands there', () => {
  it('falls back to his MAIN calendar and says so, because the app cannot make one of its own', async () => {
    const { meet } = links([{ body: aRealCalendarResponse() }]);

    assert.deepEqual(meet.calendarInUse(), { calendarId: MAIN_CALENDAR_ID, onMainCalendar: true });
    assert.equal(meet.calendarNotice(), CALENDAR_NOTICE.main);
    assert.ok(CALENDAR_NOTICE.main.includes('your main Google calendar'), 'it names WHICH calendar');
    assert.ok(CALENDAR_NOTICE.main.includes('Setup'), 'and how to change it, in the same breath');
    assert.equal(/fail|error|cannot|problem/i.test(CALENDAR_NOTICE.main), false,
      'landing on his own calendar is a working state, not a fault');

    const outcome = await meet.mint(A_SESSION);
    assert.equal(outcome.outcome === 'minted' ? outcome.onMainCalendar : null, true);
  });

  it('uses the coaching calendar he supplied, and the event goes THERE', async () => {
    const { meet, sent } = links([{ body: aRealCalendarResponse() }],
      { calendarId: 'coaching-abc123@group.calendar.google.com' });

    assert.equal(meet.calendarInUse().onMainCalendar, false);
    assert.equal(meet.calendarNotice(), CALENDAR_NOTICE.own);

    const outcome = await meet.mint(A_SESSION);
    assert.equal(outcome.outcome === 'minted' ? outcome.onMainCalendar : null, false);
    assert.ok(sent[0].url.includes(encodeURIComponent('coaching-abc123@group.calendar.google.com')));
    assert.equal(sent[0].url.includes(`/${MAIN_CALENDAR_ID}/`), false);
  });

  it('an empty or blank calendar id is not a calendar id', () => {
    assert.equal(calendarNotice(''), CALENDAR_NOTICE.main);
    assert.equal(calendarNotice('   '), CALENDAR_NOTICE.main);
    assert.equal(calendarNotice(null), CALENDAR_NOTICE.main);
    assert.equal(calendarNotice('mine@group.calendar.google.com'), CALENDAR_NOTICE.own);
  });
});

describe('platform — the group call, warned about when he books it', () => {
  it('warns from two clients up, because the coach is the third person in the call', () => {
    assert.equal(groupCallWarning(1, 'online'), null, 'one client and him is one to one');
    assert.equal(groupCallWarning(2, 'online'), GROUP_CALL_WARNING);
    assert.equal(groupCallWarning(5, 'online'), GROUP_CALL_WARNING);
  });

  it('says nothing about a session in the room, which has no call to be cut', () => {
    assert.equal(groupCallWarning(4, 'in_person'), null);
    assert.equal(groupCallWarning(4, null), null);
  });

  it('names the limit, attributes it to GOOGLE, and says his own links are cut the same way', () => {
    assert.ok(GROUP_CALL_WARNING.includes(String(GROUP_CALL_LIMIT_MINUTES)));
    assert.ok(/Google's limit and not this app's/.test(GROUP_CALL_WARNING),
      'without the attribution he reads it as this app being deficient');
    assert.ok(/link you make yourself/.test(GROUP_CALL_WARNING),
      'and goes off making links by hand, which costs him effort and changes nothing');
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(GROUP_CALL_WARNING), false);
  });
});

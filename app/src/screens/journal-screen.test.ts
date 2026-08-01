/**
 * THE ACTIVITY LOG ON SCREEN — and the six ways this surface can be wrong while looking right.
 *
 * **One. The log is FICTIONAL.** A hand-built reading proves this screen can draw an object of that
 * shape and nothing else. So every entry here is REAL: a real store on the platform double, real
 * clients created through it, real journal entries appended by the core's own write path, and the
 * reading assembled by `readJournalPage` and `verifyJournal` — the same two calls the seam makes. When
 * a break is asserted it is a REAL break, induced by editing a stored row the way
 * `journal-source.test.ts` induces one, with the edit proven to have landed before the red is believed.
 *
 * **Two. THE TAMPER-EVIDENCE SENTENCE IS SOMEWHERE HE WILL NEVER READ.** This is the most tempting
 * screen in the application to overclaim on: a green chip beside a word like "checked" reads as a
 * guarantee. `WHAT_THE_CHECK_CAN_AND_CANNOT_DO` is asserted to be in the rendered screen, character for
 * character, in EVERY state including the one where the store never opened — and asserted to be OUTSIDE
 * every `<details>` fold, because a sentence behind a fold under the good news is a sentence that is
 * not on the screen. It is asserted BEFORE the verification result in the document, too: the order is
 * the whole of what makes it a caveat rather than a footnote.
 *
 * **Three. It says something it cannot stand behind.** The screen's own markup is swept for the
 * vocabulary of compliance, certification, regulation, security and tamper-PROOFING, and for emoji —
 * with a PLANTED POSITIVE in the same run, because a scan whose entire output is an absence proves
 * nothing until it has been shown able to speak.
 *
 * **Four. It is a screen the coach cannot reach.** The address is asserted to resolve against the
 * SHIPPED route table to THIS component — not merely to render, and not to the placeholder. That is
 * this build's standing rule: the dead-ends suite asserts a route resolves and renders, and a
 * placeholder satisfies both by design.
 *
 * **Five. It says "this is all there is" while entries sit behind a filter.** The journal store carries
 * no index, so a filtered page can be short while hundreds of matching entries sit further down the
 * chains. It is asserted from a REAL log longer than one page that the whole-log total reaches the
 * screen and is LARGER than what is drawn, and that the Show more control is offered.
 *
 * **Six. THE EMPTY READING STANDS IN FOR A STORE THAT NEVER OPENED.** "This app has not checked its own
 * list yet" is honest for the instant before the first read lands and is a lie on a device whose
 * database refused. It is asserted that a screen rendered over a store that is still opening says so,
 * and does NOT say the log joins up.
 *
 * WHAT THIS FILE DOES NOT PROVE, stated rather than left to be assumed: it is rendered markup, not a
 * browser, so nothing here shows an element is visible, on screen, or reachable by touch. `console.css`
 * decides that and a rendered check has never been able to see it.
 *
 *     node tools/run-suite-tests.mjs shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes } from 'react-router';

import { DIVERGENCE } from '../../core/journal/chain.js';
import { JOURNAL_KINDS } from '../../core/journal/kinds.js';
import { aClient } from '../../core/model/fixtures.js';
import { runWrite } from '../../core/store/db.js';
import type { Scope } from '../../core/store/db.js';
import { JOURNAL_STORE } from '../../core/store/schema.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop, settle } from '../../core/store/testing/platform-double.js';
import { readChainPage } from '../../core/journal/durable.js';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING } from '../platform/local-store.ts';
import { JournalProvider } from '../shell/Journal.tsx';
import { JOURNAL_PATH } from '../shell/navigation.ts';
import { ROUTE_TABLE } from '../shell/routes.tsx';
import { JournalLog, JournalScreen } from './JournalScreen.tsx';
import { PlaceholderScreen } from './PlaceholderScreen.tsx';
import {
  A_FAILED_READ_IS_NOT_A_VERDICT, COULD_NOT_READ_THE_LIST, JOURNAL_TITLE, READ_STAGE_WORDS,
  WHAT_THE_CHECK_CAN_AND_CANNOT_DO, WHO_TO_ASK, WHO_TO_ASK_ABOUT_A_FAILED_READ,
} from './journal.ts';
import { FIRST_JOURNAL_PAGE, readJournal, readJournalPage, verifyJournal } from './journal-source.ts';
import type { JournalLogReading, JournalQuery, JournalWasRead } from './journal-source.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const LAPTOP = 'coach-laptop';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: LAPTOP });
  opened.push(store);
  return store;
}

/**
 * `n` clients really created, which is `n` `record.created` entries really appended to this device's
 * chain by the core's own write path. Nothing about the log is constructed here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createClients(store: any, count: number): Promise<void> {
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- writes are sequential, as they are in the app.
    await store.create('client', aClient({ name: `Example Client ${n}` }));
  }
}

/** The reading the seam would carry, assembled by the two calls the seam itself makes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aReading(store: any, query: JournalQuery = FIRST_JOURNAL_PAGE)
  : Promise<JournalWasRead> {
  const [page, verification] = await Promise.all([
    readJournalPage(store, query),
    verifyJournal(store),
  ]);
  return { status: 'read', page, verification };
}

/** The drawing, rendered over a reading. The screen's own markup and nothing around it. */
function drawn(reading: JournalLogReading, query: JournalQuery = FIRST_JOURNAL_PAGE): string {
  return renderToStaticMarkup(
    createElement(JournalProvider, {
      reading,
      children: createElement(JournalLog, { query, onQuery: () => undefined }),
    }),
  );
}

/** Everything inside a `<details>`, which is everything the coach has to open something to see. */
function folded(html: string): string {
  return [...html.matchAll(/<details\b[\s\S]*?<\/details>/g)].map((found) => found[0]).join('');
}

/**
 * Whatever the PRODUCTION read published — the function the seam calls, not a hand-built reading.
 *
 * `settle` is called repeatedly rather than once: a read on the double is a scheduled task several
 * transactions deep, and one settle would report "nothing was published" for a read still healthily
 * in flight. Copied from `journal-source.test.ts`, where the same wait is explained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readThrough(store: any, query: JournalQuery = FIRST_JOURNAL_PAGE)
  : Promise<JournalLogReading> {
  let seen: JournalLogReading | null = null;
  readJournal(store, query, (reading) => { seen = reading; });

  for (let attempt = 0; attempt < 60 && seen === null; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await settle();
  }
  assert.ok(seen !== null, 'the read published nothing at all, which is the defect this suite closes');
  return seen;
}

/**
 * The failed read logs to the console as well as publishing, deliberately. Held quiet for the length
 * of one call so a gate that is passing does not read as a gate that is on fire.
 */
async function quietly<T>(work: () => Promise<T>): Promise<T> {
  const held = console.error;
  console.error = () => undefined;
  try {
    return await work();
  } finally {
    console.error = held;
  }
}

// ── A READ THAT FAILED  (s17/r2's F1) ───────────────────────────────────────────────────────────

/**
 * THE ONE THAT MATTERS, AND WHY IT IS DRIVEN THROUGH THE PRODUCTION READ.
 *
 * A test proving the catch ran is compatible with every wrong thing the screen then says, and that is
 * exactly how this defect survived a whole build and a first review: `readJournal` caught, logged and
 * published NOTHING, so the seam stayed at its empty value and the screen said "There is nothing here
 * yet" and "This app has not checked its own list yet" — the two most reassuring sentences it owns —
 * about a log it had FAILED TO READ.
 *
 * So the read is made to throw the way r2 made it throw: a row carrying NO DEVICE TAG put into a real
 * journal store, which is precisely the shape `core/journal/survey.js` refuses and precisely what this
 * screen exists to notice. The assertions are about the RENDERED MARKUP, and the absences are asserted
 * beside the presences — a screen that says the failure sentence AND that there is nothing here is
 * still lying, only more confusingly.
 */
describe('a read that failed', () => {
  /** A row that no chain can hold, put straight into the store the way a foreign writer would. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function plantATaglessRow(store: any): Promise<void> {
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) => scope.put(JOURNAL_STORE, {
      device: '',
      seq: 1,
      entry_id: 'not-written-by-this-application',
      kind: JOURNAL_KINDS.RECORD_CREATED,
      at: new Date(Date.UTC(2026, 6, 31)).toISOString(),
      subject: null,
      affected_count: null,
      previous_hash: null,
    }));

    // CONFIRM IT LANDED. A plant that failed to apply renders exactly like a healthy store, and every
    // colour below would then be the absence of a defect rather than the presence of a guard.
    const stored = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => scope.get(JOURNAL_STORE, ['', 1]),
    );
    assert.ok(stored, 'the tagless row never reached the store, so nothing here is exercised');
  }

  it('SAYS SO, unfolded, and says neither that the log is empty nor that it has not been checked', async () => {
    const store = await aStore();
    await createClients(store, 3);
    await plantATaglessRow(store);

    const reading = await quietly(() => readThrough(store));
    assert.ok(
      reading.status === 'failed',
      `the real read did not fail, so this proves nothing: ${JSON.stringify(reading)}`,
    );

    const html = drawn(reading);

    assert.ok(
      html.includes(COULD_NOT_READ_THE_LIST),
      'the screen never says the app tried to read its own list and could not',
    );
    assert.ok(
      !folded(html).includes(COULD_NOT_READ_THE_LIST),
      'the failure is behind a fold, which is a failure the coach never reads',
    );
    assert.ok(
      html.includes(READ_STAGE_WORDS[reading.failure.stage]),
      'the screen does not say WHICH part of the reading went wrong',
    );
    assert.ok(html.includes(A_FAILED_READ_IS_NOT_A_VERDICT), 'nothing says what this does NOT mean');
    assert.ok(html.includes(WHO_TO_ASK_ABOUT_A_FAILED_READ), 'the exit is not named');
    assert.ok(
      html.includes(WHAT_THE_CHECK_CAN_AND_CANNOT_DO),
      'the standing sentence about what the check is worth is missing in this state',
    );

    // THE TWO SENTENCES THIS ACTION EXISTS TO REMOVE FROM THIS STATE.
    assert.ok(
      !html.includes('There is nothing here yet'),
      'a read that FAILED still renders as an empty log, which is the reassuring answer arrived at by '
      + 'never having looked',
    );
    assert.ok(
      !html.includes('This app has not checked its own list yet'),
      'a read that FAILED still renders as a log nobody has got round to checking',
    );
    // And it does not swing the other way either: a failed read is not evidence of tampering.
    assert.ok(!html.includes(WHO_TO_ASK), 'a failed read is worded as a break in the chain');
    assert.ok(!html.includes('does not join up'), 'a failed read is worded as a broken list');
  });

  it('and those sentences are ones this screen genuinely says, over a log it could read', async () => {
    // THE PAIRED POSITIVE, and without it the four absences above prove only that a string is hard to
    // find. A real store nothing has been written to renders BOTH of them and no failure sentence.
    const html = drawn(await aReading(await aStore()));

    assert.ok(
      html.includes('There is nothing here yet'),
      'an empty log does not say it is empty, so the absence asserted above means nothing',
    );
    assert.ok(
      html.includes('This app has not checked its own list yet'),
      'an unchecked log does not say so, so the absence asserted above means nothing',
    );
    assert.ok(
      !html.includes(COULD_NOT_READ_THE_LIST),
      'a log that WAS read still says the app could not read it, so the sentence is unconditional',
    );
    assert.ok(!html.includes(A_FAILED_READ_IS_NOT_A_VERDICT));
    assert.ok(!html.includes(WHO_TO_ASK_ABOUT_A_FAILED_READ));
  });

  it('cannot put what the exception said on screen, however the exception was worded', async () => {
    // The one string in this application whose contents nobody controls is an exception message: a
    // store error can quote the key or the row it choked on, and in this log a key is an identity and
    // a row can hold what somebody wrote down. The published failure carries a STAGE and a CLASS NAME,
    // so this passes by construction rather than by filtering.
    const store = await aStore();
    await createClients(store, 1);
    const NAME = 'Rekha Iyer';
    const thrown = new Error(`could not read the row belonging to ${NAME}`);
    assert.ok(thrown.message.includes(NAME), 'the planted exception does not carry the name');

    const brittle = new Proxy(store, {
      get(target: object, property: string | symbol) {
        if (property === 'read') return async () => { throw thrown; };
        return Reflect.get(target, property, target);
      },
    });

    const reading = await quietly(() => readThrough(brittle));
    assert.ok(reading.status === 'failed', 'the read did not fail, so the leak was never possible');
    assert.ok(
      !JSON.stringify(reading).includes(NAME),
      'the exception message reached the published value, and with it whatever the store quoted',
    );
    assert.ok(
      !drawn(reading).includes(NAME),
      'the exception message reached the screen, and with it whatever the store quoted',
    );
    assert.equal(reading.failure.errorName, 'Error', 'the CLASS of the failure is what is carried');
    assert.ok(drawn(reading).includes(COULD_NOT_READ_THE_LIST), 'and the screen still says what happened');
  });
});

describe('the activity log is reachable', () => {
  /**
   * THE FIVE-LINE MOUNT CHECK, and it is not a duplicate of the dead-ends suite.
   *
   * That suite asserts a route RESOLVES, RENDERS and names itself — and `PlaceholderScreen` satisfies
   * all three by design, because naming its own destination is its entire job. This asserts the element
   * the shipped table carries at this address IS this screen's component. Nothing is hand-typed: the
   * address comes from `navigation.ts` and the table from `routes.tsx`.
   */
  it('resolves against the SHIPPED route table to this screen rather than to the placeholder', () => {
    const matched = matchRoutes([...ROUTE_TABLE], `/${JOURNAL_PATH}`);
    assert.ok(matched !== null, `/${JOURNAL_PATH} matches no route at all`);
    assert.notEqual(matched.at(-1)?.route.path, '*', `/${JOURNAL_PATH} falls through to not-found`);

    const element = matched.at(-1)?.route.element as { type?: unknown } | undefined;
    assert.equal(element?.type, JournalScreen, 'the address reaches something other than this screen');
    assert.notEqual(element?.type, PlaceholderScreen, 'the address still reaches the placeholder');
  });
});

describe('the activity log, over a real log', () => {
  it('says in plain words what happened, and puts the references behind the fold', async () => {
    const store = await aStore();
    await createClients(store, 3);
    const reading = await aReading(store);
    const html = drawn(reading);

    assert.ok(reading.page.entries.length >= 3, 'the store wrote no entries, so this proves nothing');

    // The core's own kind name is a thing somebody helping him searches for, and it belongs BEHIND the
    // fold. The plain sentence is what is on the face.
    assert.ok(
      html.includes('Something new was written down.'),
      'the plain sentence for a created record never reaches the screen',
    );
    // The face of the ROWS. Two things are stripped, and the second was measured rather than
    // anticipated: the folds, obviously — and the filter's `<select>`, whose `<option value="...">`
    // carries the core's kind as the machine value while the words the coach reads are the plain
    // sentence. An attribute nobody sees is not the raw event kind being put in front of him, and an
    // assertion that could not tell the two apart would have forced the filter to be built wrong.
    const face = html
      .replace(/<details\b[\s\S]*?<\/details>/g, '')
      .replace(/<select\b[\s\S]*?<\/select>/g, '');
    assert.ok(
      !face.includes('record.created'),
      'the raw event kind is on the face of every row, which is the log this screen exists to replace',
    );
    assert.ok(
      folded(html).includes('record.created'),
      'the raw event kind is nowhere at all, so somebody helping him has nothing to search for',
    );
  });

  it('never shows the name of a record it wrote an entry about', async () => {
    const store = await aStore();
    await store.create('client', aClient({ name: 'Rekha Iyer' }));
    const html = drawn(await aReading(store));

    // The entry holds an OPAQUE identity and no content, deliberately, so that removing somebody does
    // not leave their name behind in the record of them being removed. A screen that joined it back to
    // a live record would resurrect exactly that.
    assert.ok(
      !html.includes('Rekha Iyer'),
      'a record name reached the log screen, so something joined the opaque identity back to a record',
    );
  });

  it('carries the whole-log total beside the page, so it never says this is all there is', async () => {
    const store = await aStore();
    // More than one page: `JOURNAL_PAGE_LIMIT` is 25 per device, so 30 clients is 30 entries.
    await createClients(store, 30);
    const reading = await aReading(store);
    const html = drawn(reading);

    assert.ok(
      reading.page.total > reading.page.entries.length,
      `the log is not longer than one page (${String(reading.page.total)} matching, `
      + `${String(reading.page.entries.length)} drawn), so this check exercised nothing`,
    );
    assert.ok(
      html.includes(String(reading.page.total)),
      'the total matching the filter across the whole log never reaches the screen, so the short page '
      + 'is presented as everything there is',
    );
    assert.ok(html.includes('Show more'), 'a log longer than one page offers no way to see the rest');

    // PAIRED: a log that FITS in one page offers no Show more, so the control above is the page being
    // short rather than the control being unconditional.
    const small = await aStore();
    await createClients(small, 2);
    assert.ok(
      !drawn(await aReading(small)).includes('Show more'),
      'a log that fits on one page still offers Show more, so the control says nothing',
    );
  });
});

describe('the search box', () => {
  /**
   * WHAT HE TYPED AND WHAT WAS ASKED FOR ARE TWO VALUES, and the box shows the first.
   *
   * A read here is a WALK — each device paged and the whole log walked to count what matches — and the
   * seam is keyed on the query, so typing straight into it made a six-letter word six whole-log walks.
   * `JournalScreen` lets the typing settle before it moves the query, which is only safe if the box
   * itself does not wait with it. That is what is asserted: the input draws what he typed even when
   * the query still holds something else.
   *
   * WHAT THIS DOES NOT PROVE, stated rather than left to be assumed: the settling itself is a timer in
   * an effect, and `renderToStaticMarkup` never runs effects. Nothing rendered can show it elapsing.
   */
  it('draws what he TYPED, not what has been read', async () => {
    const store = await aStore();
    await createClients(store, 2);
    const reading = await aReading(store);

    const html = renderToStaticMarkup(
      createElement(JournalProvider, {
        reading,
        children: createElement(JournalLog, {
          query: { ...FIRST_JOURNAL_PAGE, search: 'already-read' },
          search: 'still-typing',
          onQuery: () => undefined,
        }),
      }),
    );

    assert.ok(html.includes('value="still-typing"'), 'the box drops letters while the read settles');
    assert.ok(
      !html.includes('value="already-read"'),
      'the box draws the query rather than the typing, so a settled read would overwrite what he typed',
    );

    // PAIRED: a caller that does not debounce passes no typed value, and the box falls back to the
    // query — so the field above is being read rather than a constant being drawn.
    const plain = drawn(reading, { ...FIRST_JOURNAL_PAGE, search: 'already-read' });
    assert.ok(plain.includes('value="already-read"'));
  });
});

describe('what the check is worth', () => {
  it('is on the screen, unfolded, and ABOVE the verification result', async () => {
    const store = await aStore();
    await createClients(store, 2);
    const html = drawn(await aReading(store));

    assert.ok(
      html.includes(WHAT_THE_CHECK_CAN_AND_CANNOT_DO),
      'the sentence saying what this check can and cannot do is not on the screen at all',
    );
    assert.ok(
      !folded(html).includes(WHAT_THE_CHECK_CAN_AND_CANNOT_DO),
      'it is inside a fold. A caveat behind a fold under the good news is a caveat he never reads.',
    );

    const caveat = html.indexOf(WHAT_THE_CHECK_CAN_AND_CANNOT_DO);
    const verdict = html.indexOf('journal-verification');
    assert.ok(verdict > -1, 'the verification panel is not on the screen');
    assert.ok(
      caveat < verdict,
      'the verification result is stated before the sentence that says what it is worth, so the tick '
      + 'is read as a guarantee and the caveat as a footnote to it',
    );
  });

  it('is still there on a device whose database never opened', () => {
    const html = renderToStaticMarkup(
      createElement(LocalStoreProvider, {
        opening: STILL_OPENING,
        children: createElement(JournalScreen),
      }),
    );

    assert.ok(html.includes(JOURNAL_TITLE), 'the screen does not say where he is');
    assert.ok(
      !html.includes('every entry joins up'),
      'a store that has not opened produced a screen saying the log joins up, which is the reassuring '
      + 'answer arrived at by never having looked',
    );
  });
});

describe('a real break in the chain', () => {
  it('says WHERE and WHAT and names the exit, rather than that something is wrong', async () => {
    const store = await aStore();
    await createClients(store, 4);

    // A REAL alteration to a stored row, and it is proven to have landed before any colour is believed
    // — an unapplied edit renders exactly like an intact chain.
    const page = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => readChainPage(scope, LAPTOP, { limit: 4 }),
    );
    const original = page.items[2];
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, { ...original, at: new Date(Date.UTC(2020, 0, 1)).toISOString() }));
    const stored = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => scope.get(JOURNAL_STORE, [LAPTOP, original.seq]),
    );
    assert.notEqual(stored.at, original.at, 'the alteration never reached the stored row');

    const reading = await aReading(store);
    const device = reading.verification.devices.find((held) => held.device === LAPTOP);
    assert.ok(device !== undefined && device.ok === false, 'the core did not see the alteration');
    assert.equal(device.first_divergence?.reason, DIVERGENCE.ALTERED);

    const html = drawn(reading);
    assert.ok(
      html.includes('no longer matches its own record of itself'),
      'WHAT went wrong is not said — the core worked out which of the seven it was and the screen '
      + 'threw it away',
    );
    assert.ok(
      html.includes(`position ${String((device.first_divergence?.index ?? 0) + 1)}`),
      'WHERE it went wrong is not said, so nothing he can repeat localises the break',
    );
    assert.ok(html.includes(WHO_TO_ASK), 'the exit is not named, so the screen is a dead end');
    assert.ok(
      !folded(html).includes(WHO_TO_ASK),
      'the exit is behind a fold. Disclosure is for detail BEHIND a decision, never the decision.',
    );

    // PAIRED: restore the row and the same surface says the list joins up and offers no exit — so the
    // words above are the break being reported rather than the screen always saying them.
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, original));
    const restored = drawn(await aReading(store));
    assert.ok(restored.includes('every entry joins up'), 'a restored chain is still reported as broken');
    assert.ok(!restored.includes(WHO_TO_ASK), 'an intact chain still names the exit from a break');
  });
});

describe('what this screen may not say', () => {
  /**
   * The vocabulary a log screen reaches for when it wants to sound reassuring, and the emoji it reaches
   * for when it wants to sound friendly. Neither belongs on the one surface whose job is to be exact.
   */
  const FORBIDDEN = [
    /tamper[\s-]?proof/i, /\bsecure(ly|d)?\b/i, /\bcertif/i, /complian/i, /\bregulat/i,
    /\bguarantee/i, /\bencrypted\b/i, /\baudited\b/i,
  ];

  /** Emoji and pictographs, which no user-facing string in this application carries. */
  const EMOJI = /[\p{Extended_Pictographic}]/u;

  it('claims nothing about compliance, certification, regulation or security', async () => {
    const store = await aStore();
    await createClients(store, 3);
    const html = drawn(await aReading(store));

    for (const pattern of FORBIDDEN) {
      assert.ok(!pattern.test(html), `the screen says something matching ${String(pattern)}`);
    }

    // THE PLANTED POSITIVE. Without it, a scan whose whole output is an absence proves only that it
    // ran, and a broken pattern set reports the same clean pass as a clean screen.
    const planted = `${html}<p>This list is certified tamper-proof and fully compliant.</p>`;
    assert.ok(
      FORBIDDEN.some((pattern) => pattern.test(planted)),
      'the forbidden-claim scan cannot detect a claim it was handed, so its silence means nothing',
    );
  });

  it('carries no emoji in anything it draws', async () => {
    const store = await aStore();
    await createClients(store, 3);
    const html = drawn(await aReading(store));

    assert.ok(!EMOJI.test(html), 'an emoji reached a user-facing string on this screen');
    assert.ok(EMOJI.test(`${html} \u{1F600}`), 'the emoji scan cannot see an emoji it was handed');
  });

  /**
   * NO LITERAL COLOUR, SIZE OR DURATION, read off the screen's own source.
   *
   * `design/tokens/` is the only place such a value may be written down, and `design/console.css` the
   * only file that dereferences one. A literal here would be a piece of the design system minted a
   * second time, in a screen, where nothing would ever reconcile it — and it is grep-able, which is why
   * it is grepped rather than trusted.
   */
  it('holds no literal colour, size or duration value in its own source', async () => {
    const source = await readFile(path.join(here, 'JournalScreen.tsx'), 'utf8');
    const LITERALS = [/#[0-9a-fA-F]{3,8}\b/, /\b\d+px\b/, /\b\d+m?s\b/, /\brgba?\(/];

    for (const pattern of LITERALS) {
      assert.ok(
        !pattern.test(source),
        `JournalScreen.tsx writes a literal matching ${String(pattern)}, which belongs in design/tokens/`,
      );
    }

    assert.ok(
      LITERALS.some((pattern) => pattern.test(`${source} color: #ff0000; width: 12px;`)),
      'the literal scan cannot detect a literal it was handed, so its silence means nothing',
    );
  });
});

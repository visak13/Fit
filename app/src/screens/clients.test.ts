/**
 * WHAT THE CLIENT REGISTER SAYS, ASSERTED — including the sentences it must NOT write.
 *
 * The register is mostly wording, and wording is the deliverable here rather than the packaging: an
 * empty register worded as a fault teaches a new coach that this application complains at him on his
 * very first visit, and a protected field whose refusal is vague teaches him that the app is broken.
 * So the words are decided in `clients.ts` and held here.
 *
 * ## THE THREE THINGS THIS SUITE HOLDS THAT READING THE FILE WOULD NOT TELL YOU
 *
 *  1. **The record's own refusals arrive UNCHANGED.** The minimisation sentence is driven out of a
 *     REAL `store.create` against the REAL schema, not described, and compared byte for byte with
 *     what `classifyClientKey` wrote. A reworded refusal in the core fails here rather than reaching
 *     the coach as two sentences that disagree.
 *  2. **This module writes no second version of that sentence.** Proven by a scan — and the scan is
 *     pointed at a known positive IN THE SAME RUN, because a scan whose entire output is an absence
 *     produces exactly the same output when it is broken.
 *  3. **The protected field cannot accept text in ANY state.** That assertion is designed to FAIL the
 *     day somebody wires sealing, which is the day the sentences about it stop being true and must be
 *     rewritten. A limitation described in prose rots silently; one asserted in a test cannot.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { classifyClientKey } from '../../core/model/entities/client.js';
import { NotConnectedYet } from '../../core/crypto/errors.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING, STILL_OPENING_WORDS, describeOpeningFailure } from '../platform/local-store.ts';
import type { LocalStoreOpening } from '../platform/local-store.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import { DESTINATIONS } from '../shell/navigation.ts';
import type { Destination } from '../shell/navigation.ts';
import { ClientsScreen } from './ClientsScreen.tsx';
import {
  ADAPTATION_FLAG_LIMIT, CLINICAL_DETAIL_HINT, FIELD_LABELS, NOTHING_HAS_BACKED_UP_HERE_YET,
  PROTECTED_FIELD_PURPOSE, PROTECTED_FIELD_TITLE, WHERE_TO_CONNECT, describeClient,
  describeClinicalField, describeRefusal, describeRegister, fieldLabel, registeredWords,
  sessionWords,
} from './clients';
import type { RegisterEntry, RegisterReading } from './clients';
import { BACKUP_HISTORY } from './backup-history';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

/** A real store on the core's own in-process double. Nothing here is a stub of the record model. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aRealStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/** One entry on the register. Invented names, deliberately unmistakable: this repository is public. */
function anEntry(over: {
  name?: string; flag?: string | null; active?: boolean; sessions?: number; id?: string;
} = {}): RegisterEntry {
  return {
    client: {
      record_id: over.id ?? 'client-one',
      content: {
        name: over.name ?? 'Test Person One',
        notes: '',
        adaptation_flag: over.flag === undefined ? null : over.flag,
        active: over.active ?? true,
      },
    },
    sessionCount: over.sessions ?? 0,
  };
}

function aReading(items: readonly RegisterEntry[], over: Partial<RegisterReading> = {}): RegisterReading {
  return {
    page: { items, cursor: null, done: true, ...(over.page ?? {}) },
    includingArchived: over.includingArchived ?? false,
  };
}

describe('how many sessions somebody has done', () => {
  it('says nought as a state rather than as a missing value', () => {
    assert.equal(sessionWords(0), 'No sessions yet');
  });

  it('counts one and many differently', () => {
    assert.equal(sessionWords(1), '1 session');
    assert.equal(sessionWords(12), '12 sessions');
  });
});

describe('one person on the register', () => {
  it('carries only what helps him recognise them and decide to open them', () => {
    const summary = describeClient(anEntry({ name: 'Test Person One', flag: 'knee injury', sessions: 3 }));

    assert.equal(summary.name, 'Test Person One');
    assert.equal(summary.adaptationFlag, 'knee injury');
    assert.equal(summary.sessionWords, '3 sessions');
  });

  it('shows the flag as he typed it, and NOTHING where there is none', () => {
    assert.equal(describeClient(anEntry({ flag: null })).adaptationFlag, null);
    assert.equal(describeClient(anEntry({ flag: '' })).adaptationFlag, null, 'an empty flag is not a flag');
  });

  it('carries the archived state as a WORD, not only as a state to colour', () => {
    const archived = describeClient(anEntry({ active: false }));
    assert.equal(archived.archived, true);
    assert.equal(
      archived.archivedWord,
      'Archived',
      'colour is lost to a colour-blind reader, to sunlight and to a greyscale screenshot, so it is '
        + 'never the only thing carrying a state',
    );
    assert.equal(describeClient(anEntry({ active: true })).archivedWord, null);
  });
});

describe('an empty register', () => {
  it('is worded as a welcome with the way to add somebody, and never as an error', () => {
    const report = describeRegister(aReading([]));

    assert.equal(report.empty, true);
    assert.equal(report.count, 0);
    assert.match(report.intro, /Add the first person/);

    for (const word of ['error', 'Error', 'failed', 'problem', 'sorry', 'unable', 'cannot']) {
      assert.ok(
        !report.intro.includes(word),
        `the first thing a new coach sees says "${word}". Nothing is wrong: he has simply not added `
          + 'anybody yet, and a first visit that reads as a fault teaches him this app complains at him.',
      );
    }
  });

  it('says something DIFFERENT when archived clients were counted too', () => {
    const active = describeRegister(aReading([], { includingArchived: false }));
    const all = describeRegister(aReading([], { includingArchived: true }));

    assert.notEqual(
      active.intro,
      all.intro,
      'nobody on the register and nobody on it even counting the archived are different facts, and '
        + 'only one of them means he has never added anyone',
    );
  });

  it('still offers the way to reach archived clients, so they are reachable rather than hidden', () => {
    assert.equal(describeRegister(aReading([])).archivedToggleLabel, 'Show archived clients');
    assert.equal(
      describeRegister(aReading([], { includingArchived: true })).archivedToggleLabel,
      'Hide archived clients',
    );
  });
});

describe('a register with people on it', () => {
  it('counts them, and counts one differently from many', () => {
    assert.match(describeRegister(aReading([anEntry()])).intro, /1 person/);
    assert.match(
      describeRegister(aReading([anEntry({ id: 'a' }), anEntry({ id: 'b' })])).intro,
      /2 people/,
    );
  });

  it('says the count is a FLOOR when the page stopped short of the end', () => {
    const more = describeRegister({
      page: { items: [anEntry()], cursor: 'next', done: false },
      includingArchived: false,
    });

    assert.equal(more.more, true);
    assert.ok(more.moreWords !== null && more.moreWords.length > 0);
  });

  it('says nothing about more when the core said the list was finished', () => {
    const done = describeRegister(aReading([anEntry()]));
    assert.equal(done.more, false);
    assert.equal(done.moreWords, null, 'a claim there is more, on a list that is all of it');
  });
});

describe('what the record refused, in the RECORD\'S words', () => {
  it('carries the minimisation sentence through UNCHANGED, driven from a real refusal', async () => {
    const store = await aRealStore();

    const refused = await store
      .create('client', { name: 'Test Person One', notes: '', active: true, email: 'nobody@example.invalid' })
      .then(() => null, (error: unknown) => error);

    assert.ok(refused !== null, 'the schema accepted an email address, which it exists to refuse');

    const report = describeRefusal(refused);
    const minimisation = report.fields.filter((field) => field.code === 'MINIMISATION');

    assert.equal(minimisation.length, 1, 'the refusal did not arrive as a minimisation decision');

    // The record's own classification of that key, asked for directly. Null here would mean the
    // schema had stopped refusing an email address BY NAME, which is a decision rather than a bound.
    const byName = classifyClientKey('email');
    assert.ok(byName !== null, 'the record no longer refuses an email address by name');

    assert.equal(
      minimisation[0].message,
      byName.message,
      'the screen is showing a REWORDED version of the record\'s refusal. There is one sentence in '
        + 'this application about what it does not collect, the record wrote it, and a second copy '
        + 'drifts from it the moment either is edited.',
    );
    assert.match(minimisation[0].message, /never collected cannot leak/);
    assert.equal(report.verbatim, null, 'a refusal the record explained does not need the raw failure');
  });

  it('carries an ordinary refusal through unchanged too, and labels the field in his words', async () => {
    const store = await aRealStore();

    const refused = await store
      .create('client', { name: '   ', notes: '', active: true })
      .then(() => null, (error: unknown) => error);

    assert.ok(refused !== null, 'the schema accepted a name of nothing but spaces');

    const report = describeRefusal(refused);
    assert.ok(report.fields.length > 0);
    assert.equal(report.fields[0].label, 'Name', 'the coach was shown a machine\'s word for the field');
    assert.ok(report.fields[0].message.length > 0);
  });

  it('reports EVERY issue the record raised rather than only the first', async () => {
    const store = await aRealStore();

    const refused = await store
      .create('client', {
        name: '', notes: '', active: true, phone: '000', address: 'somewhere',
      })
      .then(() => null, (error: unknown) => error);

    const report = describeRefusal(refused);
    assert.ok(
      report.fields.length >= 3,
      'issues were dropped on the way to the screen, so he fixes one and meets the next',
    );
  });

  it('keeps the failure\'s own words when it was not a refusal the record explained', () => {
    const report = describeRefusal(new Error('the database went away'));

    assert.deepEqual(report.fields, [], 'fields were invented for a failure that named none');
    assert.ok(
      report.verbatim !== null && report.verbatim.includes('the database went away'),
      'the failure\'s own words were discarded, and he may have to read them out',
    );
  });

  it('survives being handed nothing at all', () => {
    assert.doesNotThrow(() => describeRefusal(undefined));
    assert.equal(describeRefusal(undefined).verbatim, null, 'words were invented where there were none');
  });
});

describe('the words in front of a refused field', () => {
  it('names the three fields the coach types into', () => {
    assert.equal(fieldLabel('name'), 'Name');
    assert.equal(fieldLabel('notes'), 'Notes');
    assert.equal(fieldLabel('adaptation_flag'), 'Adaptation flag');
  });

  /**
   * MEASURED RATHER THAN ASSUMED, and it had to be: the first version of this screen matched on the
   * bare field name and every real refusal arrived headed `content.name`, because `store.create`
   * validates the whole record and the record NESTS its content under its own key. Nothing errored —
   * the coach was simply shown a machine's word for a box he had just typed in.
   */
  it('reads the path the STORE actually hands back, which carries the envelope\'s prefix', () => {
    assert.equal(fieldLabel('content.name'), 'Name');
    assert.equal(fieldLabel('content.notes'), 'Notes');
    assert.equal(fieldLabel('content.adaptation_flag'), 'Adaptation flag');
    assert.equal(fieldLabel('content.clinical_note'), 'Protected clinical note');
  });

  it('collapses the three clinical fields into the ONE thing he sees', () => {
    const labels = ['clinical_note', 'clinical_reference', 'clinical_reference_label'].map(fieldLabel);
    assert.deepEqual(
      new Set(labels).size === 1 ? labels[0] : labels,
      'Protected clinical note',
      'he is shown a field name he has never seen, for a box that is one thing to him',
    );
  });

  it('shows a path it has no word for rather than swallowing the issue', () => {
    assert.equal(
      fieldLabel('something_the_screen_never_heard_of'),
      'something_the_screen_never_heard_of',
      'an unlabelled issue is a refusal he can see the effect of and not the cause',
    );
  });
});

describe('the protected clinical field', () => {
  // DERIVED from the state's own tuple rather than listed here: a hand-maintained list guards the
  // list, and a state added without words would simply never be covered by the loops below.
  const STATES = BACKUP_HISTORY;

  it('CANNOT ACCEPT TEXT IN ANY STATE, and this assertion is meant to fail one day', () => {
    for (const state of STATES) {
      assert.equal(
        describeClinicalField(state).canAccept,
        false,
        `the protected field reports that it can accept text in the "${state}" state. If sealing has `
          + 'just been wired, this test is doing its job: every sentence in clients.ts about this '
          + 'field has now stopped being true and must be rewritten, and the form needs the three '
          + 'inputs it deliberately does not have. Do not relax this assertion to make it pass.',
      );
    }
  });

  it('promises, in every state, that nothing is being kept in the clear', () => {
    for (const state of STATES) {
      const report = describeClinicalField(state);
      assert.ok(
        report.nothingIsKept.length > 0,
        `the "${state}" state dropped the one promise he has no way to check for himself`,
      );
    }
  });

  /**
   * THE REFUSAL SAYS THE FACT THIS SCREEN MEASURED, AND KEEPS THE CORE'S REASONING.
   *
   * It used to be `new NotConnectedYet().userMessage` verbatim — one refusal, one author, which is a
   * sound rule and is not what went wrong. The core's sentence opens with a claim about the PRESENT
   * connection, and this screen reads whether a backup has ever COMPLETED. A sign-out separates the
   * two, and the borrowed sentence was measured sitting under an indicator saying the opposite.
   *
   * A PAIR, for the reason s11/a29 named: an assertion re-aimed at the author's own new copy is
   * indistinguishable in a diff from an assertion softened. The FORBIDDING half fires if a claim
   * about the present connection returns; the REQUIRING half fires if the core's argument — which is
   * why the refusal exists at all — is dropped, and it was TRUE OF THE BORROWED SENTENCE TOO, so the
   * two cannot both go red on one probe.
   */
  it('states the fact it measured — never a claim about the connection it did not', () => {
    const { whatHappened } = describeClinicalField('never-backed-up');

    assert.equal(
      /\bconnected\b/iu.test(whatHappened),
      false,
      'the protected field answers the BACKUP HISTORY in the backup indicator\'s present-tense '
        + `vocabulary again, which is the contradiction backup-history.ts exists to close: ${whatHappened}`,
    );
    // NON-VACUITY: the same matcher over the sentence that carried the defect. If this goes quiet the
    // assertion above is proving nothing.
    assert.equal(
      /\bconnected\b/iu.test(new NotConnectedYet().userMessage),
      true,
      'the matcher no longer finds a present-connection claim in the core\'s own refusal sentence, '
        + 'so it would not find one in this screen\'s either',
    );
    assert.equal(whatHappened, NOTHING_HAS_BACKED_UP_HERE_YET);
  });

  it('keeps the core\'s reason for the refusal: a second set of details nothing could read', () => {
    const { whatHappened } = describeClinicalField('never-backed-up');
    assert.match(
      whatHappened,
      /encryption details/iu,
      `the refusal no longer says what it is protecting, only that it refuses: ${whatHappened}`,
    );
    assert.match(
      whatHappened,
      /two sets cannot read each other|second set/iu,
      'the refusal dropped WHY a second set of encryption details is the thing being avoided, which '
        + `is the half that makes it read as care rather than as an obstacle: ${whatHappened}`,
    );
  });

  it('tells him where to go, which is the half the refusal itself does not carry', () => {
    const report = describeClinicalField('never-backed-up');
    assert.ok(report.whatToDo !== null && report.whatToDo.includes('Admin'));
  });

  it('says something DIFFERENT once the device HAS backed up, rather than repeating itself', () => {
    const never = describeClinicalField('never-backed-up');
    const backedUp = describeClinicalField('has-backed-up');

    assert.notEqual(
      never.whatHappened,
      backedUp.whatHappened,
      'a device that has backed up would still be told to go and connect. Nothing errors, and the '
        + 'only symptom is a sentence that quietly stopped being true.',
    );
    assert.equal(
      /\bconnected\b/iu.test(backedUp.whatHappened),
      false,
      'the has-backed-up state makes a claim about the present connection off a fact about the past. '
        + 'MEASURED: it said "This device is connected to your Google account" while the indicator '
        + `six inches above it said Google was not connected: ${backedUp.whatHappened}`,
    );
    assert.match(
      backedUp.whatHappened,
      /has backed up/iu,
      `the has-backed-up state no longer says the one thing it actually read: ${backedUp.whatHappened}`,
    );
  });

  it('says nothing it does not know while the store has not answered', () => {
    const unknown = describeClinicalField('unknown');
    assert.equal(unknown.whatToDo, null, 'he was told to do something about a state nobody has read');
  });

  it('has different words for all three states, so no two are being confused', () => {
    const said = STATES.map((state) => describeClinicalField(state).whatHappened);
    assert.equal(new Set(said).size, STATES.length);
  });
});

describe('the screen itself, rendered', () => {
  const clients = DESTINATIONS.find((destination) => destination.path === 'clients');
  assert.ok(clients !== undefined, 'there is no Clients destination for this screen to be routed to');

  /**
   * A sentence as it appears in RENDERED markup, not as it appears in source.
   *
   * MEASURED, and it cost a false failure before it was understood: React escapes all five of
   * `& < > " '` in text, so `PROTECTED_FIELD_PURPOSE` — which quotes a filename and uses an
   * apostrophe — is simply not present in the output as a literal, and the assertion failed while
   * the sentence was on the screen. A harness reporting a defect that is not there is exactly as
   * convincing as one reporting a pass, and acting on it would have meant editing correct copy.
   */
  function rendered(text: string): string {
    return text
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;')
      .split("'").join('&#x27;');
  }

  /**
   * The register, rendered as `main.tsx` renders it.
   *
   * THE PENDING-REMOVAL SEAM IS NOT SCAFFOLDING HERE. The register used to keep a read of its own
   * for the removals awaiting confirmation, from the days when the seam filled once per store and
   * could not refresh. The seam re-reads now — see `shell/removals-refresh.test.ts` — so the second
   * read was two readers of one fact and is gone, and this screen consumes the seam like every other
   * surface. It is provided with the seam's own EMPTY reading, which is a real value rather than a
   * placeholder: it is what `pendingDeletions` returns over a store nobody has removed anybody from.
   */
  function render(opening: LocalStoreOpening, address = '/clients'): string {
    return renderToStaticMarkup(
      // A ROUTER IS NOT SCAFFOLDING EITHER, and it became required rather than convenient. The
      // register now carries a way from each person to a session with them, and it reads the
      // address to find out whether the coach arrived back here about somebody in a session — both
      // halves of the circular navigation the product promises. A link and an address are the two
      // things that need a router, and rendering without one would only prove that this file can
      // construct a React tree. `MemoryRouter` is the smallest one that answers both.
      createElement(MemoryRouter, {
        initialEntries: [address],
        children: createElement(LocalStoreProvider, {
          opening,
          children: createElement(RemovalsProvider, {
            reading: NOTHING_AWAITING_REMOVAL,
            children: createElement(ClientsScreen, { destination: clients as Destination }),
          }),
        }),
      }),
    );
  }

  it('says NOTHING about the register on a device whose storage never opened', () => {
    const html = render({
      state: 'unavailable',
      condition: describeOpeningFailure(new Error('QuotaExceededError: no space')),
    });

    assert.ok(
      html.includes('There is no room left on this device'),
      'the store refused and the screen said nothing about it',
    );
    assert.ok(
      !html.includes('Nobody is on your register'),
      'THE FALSE GOOD NEWS. A coach with forty clients was told he has none, on the strength of a '
        + 'store that never opened — a nought this app never counted.',
    );
    assert.ok(
      !html.includes('people on your register'),
      'a count was reported from a store that never answered',
    );
  });

  it('says it is still opening rather than showing a blank panel on a cold start', () => {
    const html = render(STILL_OPENING);
    assert.ok(html.includes(STILL_OPENING_WORDS));
    assert.ok(!html.includes('Nobody is on your register'), 'an empty register before the store answered');
  });

  /**
   * The form is the half that works with no store at all being readable yet, and it must be on
   * screen in every state — including the two where the register cannot be. A screen that showed
   * only a refusal would leave him unable to do the one thing this page is for.
   */
  it('draws the form and the protected field in EVERY state of the store', () => {
    const states: LocalStoreOpening[] = [
      STILL_OPENING,
      { state: 'unavailable', condition: describeOpeningFailure(new Error('refused')) },
    ];

    for (const opening of states) {
      const html = render(opening);
      for (const label of [FIELD_LABELS.name, FIELD_LABELS.notes, FIELD_LABELS.adaptationFlag]) {
        assert.ok(html.includes(label), `the ${opening.state} state lost the "${label}" field`);
      }
      assert.ok(html.includes(PROTECTED_FIELD_TITLE), `the ${opening.state} state lost the protected field`);
      assert.ok(
        html.includes(rendered(PROTECTED_FIELD_PURPOSE)),
        `the ${opening.state} state drew the protected field with no explanation, which is the `
          + 'disabled-control-with-no-reason this action exists to avoid',
      );
    }
  });

  it('offers NOWHERE to type a clinical note, in any state', () => {
    for (const opening of [STILL_OPENING, { state: 'open' as const, store: null as never }]) {
      const html = render(opening as LocalStoreOpening);
      for (const name of ['clinical_note', 'clinical_reference', 'clinical_reference_label']) {
        assert.ok(
          !html.includes(`name="${name}"`),
          `there is an input for ${name}. This build cannot lock that text, so an input for it can `
            + 'only end in the one outcome forbidden here: text accepted and silently dropped.',
        );
      }
    }
  });

  it('names the destination it was routed to, rather than a title of its own', () => {
    assert.ok(
      render(STILL_OPENING).includes((clients as Destination).label),
      'a coach who arrived from a stale link cannot tell where he is',
    );
  });
});

describe('this module does not write a second version of the record\'s refusal', () => {
  /**
   * AN ABSENCE-SCAN, POINTED AT A KNOWN POSITIVE IN THE SAME RUN.
   *
   * The real assertion below is that a phrase does NOT appear in `clients.ts`. That is exactly the
   * shape that passes forever when it is broken: a wrong path, a moved file, a read that returns
   * nothing, and the scan reports clean while saying nothing about the world. So the same scanner is
   * pointed at the file that MUST contain the phrase, and if that probe goes quiet this suite fails
   * even though the real assertion "passed".
   */
  const PHRASE = 'cannot leak';

  it('finds the phrase where it genuinely lives, which is what makes the absence below evidence', async () => {
    const record = await readFile(
      path.join(here, '..', '..', 'core', 'model', 'entities', 'client.js'), 'utf8',
    );
    assert.ok(
      record.includes(PHRASE),
      'the scan cannot find the minimisation sentence in the record that writes it, so this scanner '
        + 'is broken and its clean result below is evidence of nothing',
    );
  });

  it('does not repeat it in the screen\'s own words', async () => {
    const words = await readFile(path.join(here, 'clients.ts'), 'utf8');
    const sentences = words
      .split('\n')
      .filter((line) => line.includes(PHRASE) && !line.trimStart().startsWith('*'));

    assert.deepEqual(
      sentences,
      [],
      'clients.ts has grown its own sentence about what the app does not collect. The record already '
        + 'wrote that sentence and hands it back on every refusal; a second one drifts.',
    );
  });
});

describe('the standing sentences', () => {
  it('word the one-time hint as a note rather than as a warning', () => {
    for (const word of ['warning', 'Warning', 'must not', 'do not', 'never']) {
      assert.ok(
        !CLINICAL_DETAIL_HINT.includes(word),
        `the hint says "${word}". It is shown before he has made any mistake at all, and a note that `
          + 'tells him off on his first visit is one he stops reading by the second week.',
      );
    }
  });

  /**
   * DRIVEN AGAINST THE REAL SCHEMA, NOT COMPARED WITH A NUMBER TYPED HERE.
   *
   * `ADAPTATION_FLAG_LIMIT` is the bound the form stops him at, and the record holds the same bound
   * inline where it validates. Asserting it equals 120 would be asserting one copy against another
   * copy — both could be wrong together, which is the only way this can actually fail. So the record
   * is asked: a flag OF that length is accepted, and one character more is refused. A bound changed
   * in the schema fails here rather than costing the coach the end of a sentence he had typed.
   */
  it('stop him at exactly the length the RECORD will store, asked of the record itself', async () => {
    const store = await aRealStore();
    const flagOf = (length: number) => 'x'.repeat(length);

    const accepted = await store.create('client', {
      name: 'Test Person One', notes: '', active: true, adaptation_flag: flagOf(ADAPTATION_FLAG_LIMIT),
    });
    assert.ok(accepted.record_id, 'the record refused a flag the form would have let him type');

    const refused = await store
      .create('client', {
        name: 'Test Person Two',
        notes: '',
        active: true,
        adaptation_flag: flagOf(ADAPTATION_FLAG_LIMIT + 1),
      })
      .then(() => null, (error: unknown) => error);

    assert.ok(
      refused !== null,
      'the record accepts more than the form allows, so the form is stopping him short of what he '
        + 'could have written',
    );
  });

  it('confirm the saved client by name, because that is what he just did', () => {
    assert.match(registeredWords('Test Person One'), /^Test Person One/);
  });
});

/**
 * THE DIRECTION OUT OF THE REFUSAL NAMES ONLY CONTROLS THAT ARE REALLY THERE.
 *
 * ## Why this is a PAIR and not one assertion
 *
 * The wording below was CORRECTED ON PURPOSE by s11/a41: it used to end "and connect your Google
 * account there" after naming Admin, and there is no connect act on the Admin screen — `AdminScreen`
 * draws none and `shell/refusal-names-a-real-control.test.ts` FORBIDS it from carrying one. Changing
 * a sentence and then aiming an assertion at the new sentence is INDISTINGUISHABLE IN A DIFF FROM
 * SOFTENING THE ASSERTION, so there are two here and they fail in opposite directions:
 *
 *  - the FORBIDDING half fires if the old location claim comes back;
 *  - the REQUIRING half fires if the direction is deleted or hollowed out instead of corrected.
 *
 * AND THE REQUIRING HALF IS WORDED TO SURVIVE THE OLD COPY — that is s11/a34's refinement, found the
 * hard way. A requiring half that only the NEW sentence satisfies goes red on the same probe as the
 * forbidding one, and then the pair is one assertion wearing two names rather than two opposed
 * claims. Everything it asks for was true of the sentence BEFORE the correction as well.
 */
describe('the way out of the not-connected refusal', () => {
  it('does not send him to press a connect control on the Admin screen, which has none', () => {
    // THE FORBIDDING HALF. Deliberately shaped at the CLAIM rather than at the old string: "connect
    // ... there" is the promise that the act is on the screen just named, whatever verb spells it.
    assert.equal(
      /connect[^.]*\bthere\b/iu.test(WHERE_TO_CONNECT),
      false,
      'the refusal again tells him to connect his Google account on the screen it just named, and '
        + 'the Admin screen holds no connect act — refusal-names-a-real-control.test.ts forbids it '
        + `from carrying one: ${WHERE_TO_CONNECT}`,
    );
  });

  it('still tells him where to go and still promises the rest of the page saved', () => {
    // THE REQUIRING HALF. Both of these were true of the sentence before the correction too, so this
    // stays GREEN under a probe that restores the old copy and goes RED only if the direction is
    // deleted — which is the whole point of the pair.
    assert.match(
      WHERE_TO_CONNECT,
      /\bAdmin\b/u,
      'the refusal no longer names the destination that leads to the connecting, so a coach who has '
        + `just been refused is told nothing about what to do next: ${WHERE_TO_CONNECT}`,
    );
    assert.match(
      WHERE_TO_CONNECT,
      /saves on this device/u,
      'the refusal no longer promises that the rest of the page saved anyway, which is the half that '
        + `stops it reading as "nothing you typed was kept": ${WHERE_TO_CONNECT}`,
    );
  });
});

/**
 * READINGS, NOTES AND HIS PLACE — asserted with no rendering at all.
 *
 * Every value here is driven through the real module, and where a bound, a unit or a refusal belongs
 * to the core it is driven through the CORE rather than described in this file's own words. A suite
 * satisfied by a shape it wrote itself goes on passing while the thing it is about moves underneath it.
 *
 * ## THE PROPERTY THIS FILE EXISTS FOR
 *
 * `core/session/SESSION.md` §6 hands one property to whoever builds this screen: capturing a reading
 * for a specific client must not lose the coach's place. That is not a thing a record can be right
 * about, so it is made into a VALUE — `capturePlace` — and the assertion is a single equality across a
 * capture. And because the whole assertion is an absence of change, IT IS POINTED AT A KNOWN POSITIVE
 * IN THE SAME TEST: a state change that DOES move his place is shown to be visible to the same
 * comparison. An equality that cannot fail proves nothing.
 *
 * ## THE FOUR ABSENCES
 *
 * Nothing suggests, recommends or proposes; nothing says where the session has got to; no emoji; and
 * no drawing that scrolls, focuses or remounts, because each of those moves the page under his thumb.
 * EVERY ONE OF THOSE SCANS IS POINTED AT A KNOWN POSITIVE IN THE SAME RUN — a scan whose entire output
 * is an absence produces exactly the same output when it is broken, misdirected or looking for the
 * wrong shape. And the source scans read CODE LINES rather than prose: this build documents a
 * prohibition in a comment beside the code it constrains, so a sweep over whole source text matches
 * the very sentences explaining why the forbidden thing is forbidden.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { validateReading, validateSessionNote } from '../../core/model/model.js';
import {
  READING_CONTEXTS, READING_KINDS, READING_UNITS,
} from '../../core/model/vocabularies.js';
import { assertRoom } from '../../core/session/journal.js';
import { describeRefusal } from './modular-control';
import {
  CAPTURE_INTRO, CUSTOM_KIND, CUSTOM_KIND_HINT, CUSTOM_KIND_LABEL, EMPTY_READING,
  GLANCE_LESS_LABEL, GLANCE_MORE_LABEL, GLANCE_READING_WORDS, LEAVE_IT_LABEL, NOTES_TAKEN_TITLE,
  NOTE_ABOUT_CLIENT_LABEL, NOTE_ABOUT_CLIENT_TITLE, NOTE_ABOUT_SESSION_LABEL,
  NOTE_ABOUT_SESSION_TITLE, NOTE_ABOUT_SESSION_WORDS, NOTE_MAX, NOTE_RECORDED_WORDS,
  NOTHING_RECORDED_YET, NO_NOTE_YET, NO_NUMBER_YET, READINGS_TAKEN_TITLE, READING_FIELD_LABELS,
  READING_KINDS_OFFERED, READING_KIND_LABELS, READING_LABEL, READING_NOTE_MAX, READING_TITLE,
  RECORD_NOTE_LABEL, RECORD_READING_LABEL, UNITS_OFFERED, WHEN_LABELS, WHEN_OFFERED, captureKey,
  capturePlace, capturing, captureRefused, changeNote, changeReading, closeCapture, confirmationFor,
  editReading, glanceIsOpen, isCustomKind, kindOfDraft, noCaptures, noteAboutClientWords,
  noteDraftOf, noteFromDraft, noteKey, noteProblem, noteProblemShown, noteRecorded, notesOf,
  openCapture, readingDraftOf, readingFromDraft, readingProblem, readingProblemShown,
  readingRecorded, readingRecordedWords, readingWhoseWords, readingWords, readingsOf, refusalFor,
  toggleGlance, unitOfDraft, valueLabel,
} from './session-readings';
import type { CaptureState, ProjectedForCapture, ReadingDraft } from './session-readings';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Three people in one session, because the requirement is about the second of three. */
const FIRST = 'the-first-client';
const SECOND = 'the-second-client';
const THIRD = 'the-third-client';

/** The four kinds the requirement itself names, in the core's own keys. */
const HEART = 'heart-rate';
const PLANK = 'plank-hold';
/** The same key as PLANK, named for the reading that carries it into a label. */
const HOLD_KIND = 'plank-hold';

/** A reading he has typed but not yet recorded. */
function typed(draft: Partial<ReadingDraft> = {}): ReadingDraft {
  return { ...EMPTY_READING, ...draft };
}

/**
 * A REAL SESSION, DEEP IN: three people, the second one's reading panel open, and the first and third
 * having their previous session expanded.
 *
 * That last part is the "nothing collapsed" half of the property, and it has to be set up before the
 * capture or the assertion afterwards would be about a state with nothing to lose.
 */
function midSession(): CaptureState {
  let state = noCaptures();
  state = toggleGlance(state, FIRST);
  state = toggleGlance(state, THIRD);
  state = openCapture(state, { kind: 'reading', clientId: SECOND });
  state = changeReading(state, 'kind', HEART);
  state = changeReading(state, 'value', '128');
  state = changeReading(state, 'note', 'After the second round');
  return state;
}

/** Everything this module ever says to the coach, as one blob for the absence sweeps. */
function everyWordHeReads(): string {
  const view = aViewWith({
    [SECOND]: {
      readings: [
        { kind: HEART, value: 128, unit: 'bpm', context: 'in_session', note: 'Steady' },
        { kind: PLANK, value: 62, unit: 'seconds', context: 'post_session', note: null },
        { kind: 'grip-strength', value: 34, unit: 'count', context: 'in_session', note: null },
      ],
      notes: ['Tired today, dropped the last set.'],
    },
  });

  return [
    CAPTURE_INTRO, CUSTOM_KIND_HINT, CUSTOM_KIND_LABEL, GLANCE_LESS_LABEL, GLANCE_MORE_LABEL,
    GLANCE_READING_WORDS, LEAVE_IT_LABEL, NOTES_TAKEN_TITLE, NOTE_ABOUT_CLIENT_LABEL,
    NOTE_ABOUT_CLIENT_TITLE, NOTE_ABOUT_SESSION_LABEL, NOTE_ABOUT_SESSION_TITLE,
    NOTE_ABOUT_SESSION_WORDS, NOTE_RECORDED_WORDS, NOTHING_RECORDED_YET, READINGS_TAKEN_TITLE,
    READING_LABEL, READING_TITLE, RECORD_NOTE_LABEL, RECORD_READING_LABEL, NO_NOTE_YET,
    NO_NUMBER_YET,
    valueLabel(typed()),
    valueLabel(typed({ kind: HOLD_KIND })),
    valueLabel(typed({ kind: CUSTOM_KIND, customKind: 'grip-strength' })),
    ...Object.values(READING_FIELD_LABELS),
    ...Object.values(READING_KIND_LABELS),
    ...Object.values(WHEN_LABELS),
    readingWhoseWords('Priya'),
    noteAboutClientWords('Priya'),
    readingRecordedWords(readingWords(HEART, 128, 'bpm')),
    readingProblem(typed({ value: '' })) ?? '',
    readingProblem(typed({ value: 'a hundred' })) ?? '',
    readingProblem(typed({ value: '-1' })) ?? '',
    readingProblem(typed({ value: '120', note: 'x'.repeat(READING_NOTE_MAX + 1) })) ?? '',
    readingProblem(typed({ kind: CUSTOM_KIND, customKind: '', value: '1' })) ?? '',
    readingProblem(typed({ kind: CUSTOM_KIND, customKind: 'Grip Strength', value: '1' })) ?? '',
    noteProblem('') ?? '',
    noteProblem('x'.repeat(NOTE_MAX + 1)) ?? '',
    JSON.stringify(readingsOf(view, SECOND)),
    JSON.stringify(notesOf(view, SECOND)),
    JSON.stringify(describeEveryRefusal()),
  ].join('\n');
}

/** Every refusal this surface can show, including the one the CORE writes rather than this file. */
function describeEveryRefusal() {
  return [
    describeRefusal(theJournalFullFailure()),
    describeRefusal(new Error('a failure nobody worded')),
  ];
}

/** The real refusal the core raises at a client's reading cap. Thrown, not described. */
function theJournalFullFailure(): unknown {
  let thrown: unknown = null;
  try {
    assertRoom('readingsPerClient', 400, { session_id: 'a-full-session', client_id: SECOND });
  } catch (error: unknown) {
    thrown = error;
  }
  assert.notEqual(thrown, null, 'the reading cap did not refuse at its own declared limit, so this '
    + 'suite is about to assert the wording of a refusal that never happened');
  return thrown;
}

/** As much of a projection as this module reads, built for however many people are asked for. */
function aViewWith(people: Record<string, {
  readings?: { kind: string; value: number; unit: string; context: string; note: string | null }[];
  notes?: string[];
}>): ProjectedForCapture {
  return {
    clients: Object.entries(people).map(([clientId, held]) => ({
      client_id: clientId,
      readings: (held.readings ?? []).map((content, at) => ({
        record_id: `${clientId}-reading-${at}`,
        content,
      })),
      notes: (held.notes ?? []).map((text, at) => ({
        record_id: `${clientId}-note-${at}`,
        content: { text, taken_at: '2026-07-26T09:00:00.000Z' },
      })),
    })),
  };
}

describe('the vocabulary is the core\'s, and this module only words it', () => {
  /**
   * A MIRROR DRIFTS, so the two readings are required to AGREE.
   *
   * If `READING_KINDS` grows a kind, the picker must offer it and the panel must have words for it —
   * otherwise a machine key appears on the screen he reads with a client in front of him, which is the
   * exact defect a substitute's name was found with on this same screen (s6/a4).
   */
  it('has words for every kind the core knows, and knows no kind the core does not', () => {
    for (const kind of Object.keys(READING_KINDS)) {
      assert.equal(
        typeof READING_KIND_LABELS[kind],
        'string',
        `the core knows the reading kind "${kind}" and this screen has no words for it, so it would `
          + 'reach him as a content key',
      );
      assert.ok(READING_KINDS_OFFERED.includes(kind), `"${kind}" is not offered in the picker`);
    }
    for (const kind of Object.keys(READING_KIND_LABELS)) {
      assert.ok(
        Object.keys(READING_KINDS).includes(kind),
        `this screen words a reading kind "${kind}" that the core does not know, so the record would `
          + 'refuse it after he typed the number',
      );
    }
  });

  it('offers exactly the units the record permits', () => {
    assert.deepEqual([...UNITS_OFFERED], [...READING_UNITS]);
  });

  /**
   * `standalone` IS DELIBERATELY NOT OFFERED. A reading taken outside a session entirely is not
   * something this screen can capture, because this screen only exists while one is open — and the
   * suite says so rather than leaving the omission to look like an oversight.
   */
  it('offers the two contexts a live session can produce, and not the third', () => {
    for (const when of WHEN_OFFERED) {
      assert.ok(READING_CONTEXTS.includes(when), `"${when}" is not a context the record permits`);
      assert.equal(typeof WHEN_LABELS[when], 'string', `"${when}" has no words`);
    }
    assert.ok(READING_CONTEXTS.includes('standalone'), 'the core no longer has a standalone context, '
      + 'so the reason this screen does not offer one has changed');
    assert.ok(!WHEN_OFFERED.includes('standalone'));
  });

  /** The sentinel must be impossible to mistake for a kind, even if it ever reached the record. */
  it('uses a sentinel for a kind of his own that no content key could be', () => {
    assert.ok(!Object.keys(READING_KINDS).includes(CUSTOM_KIND));
    assert.equal(
      validateReading(aReadingWith({ kind: CUSTOM_KIND })).ok,
      false,
      'the sentinel validates as a reading kind, so a picker left on it would record one',
    );
  });
});

describe('what a reading records, and the unit that is not his to choose', () => {
  /**
   * THE UNIT IS PINNED WHEREVER THE CORE PINS IT, and the record is driven to prove it.
   *
   * `READING_KINDS` says a plank hold is seconds. If this screen offered a unit for it, a mis-tap
   * would record a plank in beats per minute — which the record refuses, in front of a client, after
   * he had already measured it.
   */
  it('sends the unit the record pins for every kind it offers', () => {
    for (const kind of READING_KINDS_OFFERED) {
      const values = readingFromDraft(typed({ kind, value: '30' }));
      assert.notEqual(values, null, `a plain reading of ${kind} was refused`);
      assert.equal(values?.unit, READING_KINDS[kind], `${kind} is not sent as the core's own unit`);
      assert.equal(
        validateReading(aReadingWith({ kind, value: 30, unit: values?.unit })).ok,
        true,
        `the record refuses a ${kind} reading this screen would send`,
      );
      // The known positive: the record DOES catch a unit that does not belong to the kind, so the
      // agreement above is worth something.
      const wrong = READING_UNITS.find((unit: string) => unit !== READING_KINDS[kind]);
      assert.equal(
        validateReading(aReadingWith({ kind, value: 30, unit: wrong })).ok,
        false,
        `the record accepts a ${kind} measured in ${wrong}, so pinning the unit proves nothing`,
      );
    }
  });

  it('records the number, the context and the note he actually typed', () => {
    const values = readingFromDraft(typed({
      kind: PLANK, value: '62', note: 'Held it well', when: 'post_session',
    }));

    assert.deepEqual(values, {
      kind: PLANK, value: 62, unit: 'seconds', context: 'post_session', note: 'Held it well',
    });
  });

  it('omits a note he left empty rather than recording an empty one', () => {
    assert.deepEqual(readingFromDraft(typed({ value: '70' })), {
      kind: HEART, value: 70, unit: 'bpm', context: 'in_session',
    });
  });

  it('treats nought as a reading and not as nothing recorded', () => {
    assert.equal(readingProblem(typed({ value: '0' })), null);
    assert.equal(readingFromDraft(typed({ value: '0' }))?.value, 0);
  });

  it('refuses a value it cannot record, with a sentence rather than half of it', () => {
    for (const draft of [
      typed({ value: '' }),
      typed({ value: '  ' }),
      typed({ value: 'a hundred and twenty' }),
      typed({ value: '-1' }),
      typed({ value: '120', note: 'x'.repeat(READING_NOTE_MAX + 1) }),
      typed({ value: '120', when: 'standalone' }),
      typed({ kind: CUSTOM_KIND, customKind: '', value: '5' }),
      typed({ kind: CUSTOM_KIND, customKind: 'Grip Strength', value: '5' }),
      typed({ kind: CUSTOM_KIND, customKind: 'grip--strength', value: '5' }),
      typed({ kind: CUSTOM_KIND, customKind: 'grip-strength', customUnit: '', value: '5' }),
    ]) {
      assert.notEqual(readingProblem(draft), null, `${JSON.stringify(draft)} was accepted`);
      assert.equal(readingFromDraft(draft), null, 'half of what he typed would have been recorded');
    }
  });

  /**
   * THE KIND VOCABULARY IS OPEN, because everything in this application is his to configure. A kind he
   * invented must be a well-formed content key and must name its own unit, because there is no pinned
   * one to fall back on — and the record is driven to prove both readings agree.
   */
  it('accepts a kind of his own when it is well formed and names a unit', () => {
    const draft = typed({
      kind: CUSTOM_KIND, customKind: 'grip-strength', customUnit: 'count', value: '34',
    });

    assert.ok(isCustomKind(draft));
    assert.equal(kindOfDraft(draft), 'grip-strength');
    assert.equal(unitOfDraft(draft), 'count');
    assert.equal(readingProblem(draft), null);
    assert.equal(
      validateReading(aReadingWith({ kind: 'grip-strength', value: 34, unit: 'count' })).ok,
      true,
      'the record refuses a kind of his own that this screen accepts',
    );
  });

  /**
   * NO CEILING OF THIS MODULE'S OWN, and the record is asked to confirm there is none to mirror. A
   * mirror that invented one would refuse a value he could legitimately record — a dead hang, a heart
   * rate and a count of repetitions do not share an upper bound.
   */
  it('refuses exactly what the record refuses about a value, and nothing more', () => {
    assert.equal(validateReading(aReadingWith({ value: 0 })).ok, true);
    assert.equal(readingProblem(typed({ value: '0' })), null);

    assert.equal(validateReading(aReadingWith({ value: -1 })).ok, false);
    assert.notEqual(readingProblem(typed({ value: '-1' })), null);

    assert.equal(
      validateReading(aReadingWith({ value: 100000 })).ok,
      true,
      'the record has grown an upper bound on a reading, so this screen is now missing a mirror of it',
    );
    assert.equal(readingProblem(typed({ value: '100000' })), null);
  });

  it('agrees with the record about how long a reading\'s note may be', () => {
    assert.equal(
      validateReading(aReadingWith({ note: 'x'.repeat(READING_NOTE_MAX) })).ok,
      true,
      `the record refuses a reading note of ${READING_NOTE_MAX}, which this screen accepts`,
    );
    assert.equal(
      validateReading(aReadingWith({ note: 'x'.repeat(READING_NOTE_MAX + 1) })).ok,
      false,
      `the record accepts a reading note past ${READING_NOTE_MAX}, so this screen refuses one he `
        + 'could legitimately record',
    );
    assert.equal(readingProblem(typed({ value: '1', note: 'x'.repeat(READING_NOTE_MAX) })), null);
    assert.notEqual(
      readingProblem(typed({ value: '1', note: 'x'.repeat(READING_NOTE_MAX + 1) })),
      null,
    );
  });
});

describe('what a note records', () => {
  it('agrees with the record about how long a note may be', () => {
    assert.equal(
      validateSessionNote(aNoteWith('x'.repeat(NOTE_MAX))).ok,
      true,
      `the record refuses a note of ${NOTE_MAX}, which this screen accepts`,
    );
    assert.equal(
      validateSessionNote(aNoteWith('x'.repeat(NOTE_MAX + 1))).ok,
      false,
      `the record accepts a note past ${NOTE_MAX}, so this screen refuses one he could write`,
    );
    assert.equal(noteProblem('x'.repeat(NOTE_MAX)), null);
    assert.notEqual(noteProblem('x'.repeat(NOTE_MAX + 1)), null);
  });

  it('refuses a note with nothing in it rather than recording a blank fact', () => {
    assert.notEqual(noteProblem(''), null);
    assert.notEqual(noteProblem('   \n  '), null);
    assert.equal(noteFromDraft('   '), null);
    assert.equal(validateSessionNote(aNoteWith('')).ok, false, 'the record accepts an empty note, so '
      + 'refusing one here is this screen\'s own rule rather than the record\'s');
  });

  it('records what he wrote, trimmed of the whitespace he did not mean', () => {
    assert.equal(noteFromDraft('  Tired today.  '), 'Tired today.');
  });
});

describe('CAPTURING A READING DOES NOT LOSE HIS PLACE', () => {
  /**
   * THE PROPERTY, AS ONE EQUALITY.
   *
   * Three attendees, the SECOND one's panel open, two people's previous sessions expanded — and a
   * reading recorded for that second person. His place afterwards is the place before it, exactly.
   */
  it('leaves the panel open, the person selected and every expanded section expanded', () => {
    const before = midSession();
    const after = readingRecorded(before, SECOND, 'Recorded for them: Heart rate 128 bpm.');

    assert.deepEqual(
      capturePlace(after),
      capturePlace(before),
      'recording a reading moved the coach: SESSION.md §6 gives this screen the one property the '
        + 'record cannot hold for it, and this is it',
    );
    assert.equal(after.open?.clientId, SECOND, 'the client was silently reselected');
    assert.equal(after.open?.kind, 'reading', 'the panel he was in is no longer the panel open');
    assert.ok(glanceIsOpen(after, FIRST), 'somebody\'s expanded history collapsed');
    assert.ok(glanceIsOpen(after, THIRD), 'somebody\'s expanded history collapsed');
    assert.equal(after.recording, false, 'the controls stayed refused after the reading landed');
  });

  /**
   * THE KNOWN POSITIVE FOR THE ASSERTION ABOVE, and without it that assertion is worth nothing: the
   * whole of it is an absence of change, and an equality that cannot fail proves nothing.
   *
   * Each of the three ways a screen throws his place away is shown to be VISIBLE to the same
   * comparison — the panel closing, the selection moving, a section collapsing.
   */
  it('and the same comparison sees a place that DID move', () => {
    const before = midSession();

    assert.notDeepEqual(
      capturePlace(closeCapture(before)),
      capturePlace(before),
      'a panel that closed is invisible to this comparison, so the assertion above cannot fail',
    );
    assert.notDeepEqual(
      capturePlace(openCapture(before, { kind: 'reading', clientId: THIRD })),
      capturePlace(before),
      'a client reselected is invisible to this comparison',
    );
    assert.notDeepEqual(
      capturePlace(toggleGlance(before, FIRST)),
      capturePlace(before),
      'a section collapsed is invisible to this comparison',
    );
  });

  /**
   * WHAT MAY CHANGE, AND IT IS EXACTLY TWO THINGS. The number and its note are cleared, so the next
   * reading is not a correction of the last by accident; and a sentence says what went on the record,
   * because a press with no visible consequence is the absence that looks like a pass.
   *
   * The kind, the unit and the when are KEPT: a second reading in the same moment is usually the same
   * kind for the same person, and re-picking it is a tap he does not need with a client waiting.
   */
  it('clears the number and keeps the kind, so the next reading is one field away', () => {
    const before = midSession();
    const after = readingRecorded(before, SECOND, 'Recorded: Heart rate 128 bpm.');
    const draft = readingDraftOf(after, SECOND);

    assert.equal(draft.value, '', 'the number stayed, so pressing again would record it twice');
    assert.equal(draft.note, '', 'the note stayed on a reading that is already recorded');
    assert.equal(draft.kind, HEART, 'the kind was thrown away, so he re-picks it with a client waiting');
    assert.equal(draft.when, WHEN_OFFERED[0]);
    assert.equal(
      confirmationFor(after, captureKey('reading', SECOND)),
      'Recorded: Heart rate 128 bpm.',
    );
  });

  /** A note landing moves him no more than a reading does. */
  it('leaves his place alone when a note lands, about a person or about the session', () => {
    let state = noCaptures();
    state = toggleGlance(state, THIRD);
    state = openCapture(state, { kind: 'note', clientId: SECOND });
    state = changeNote(state, 'Dropped the last set.');

    const after = noteRecorded(state, SECOND, NOTE_RECORDED_WORDS);
    assert.deepEqual(capturePlace(after), capturePlace(state));
    assert.equal(noteDraftOf(after, SECOND), '', 'the text stayed, so he would record it twice');
    assert.equal(confirmationFor(after, noteKey(SECOND)), NOTE_RECORDED_WORDS);

    let session = openCapture(noCaptures(), { kind: 'note', clientId: null });
    session = changeNote(session, 'The connection dropped twice.');
    const settled = noteRecorded(session, null, NOTE_RECORDED_WORDS);
    assert.deepEqual(capturePlace(settled), capturePlace(session));
    assert.equal(noteDraftOf(settled, null), '');
  });

  /**
   * A REFUSAL KEEPS BOTH HIS PLACE AND HIS NUMBER.
   *
   * Closing the panel would take the number away at the moment he has to act on the refusal, and he
   * would have to measure again to find out whether the refusal was about the number at all. The
   * journal being full is the reachable case this matters most for.
   */
  it('keeps his place and what he typed when the capture is refused', () => {
    const before = midSession();
    const refusal = describeRefusal(theJournalFullFailure());
    const after = captureRefused(before, captureKey('reading', SECOND), refusal);

    assert.deepEqual(capturePlace(after), capturePlace(before));
    assert.equal(readingDraftOf(after, SECOND).value, '128', 'his measurement was thrown away');
    assert.equal(refusalFor(after, captureKey('reading', SECOND))?.journalFull, true);
    assert.equal(
      refusalFor(after, captureKey('reading', FIRST)),
      null,
      'one person\'s refusal is drawn on another person\'s panel',
    );
  });

  /** In flight, nothing else may be pressed, so one press records one fact. */
  it('refuses a second press while one is in flight, and moves nothing doing it', () => {
    const before = midSession();
    const inFlight = capturing(before, true);

    assert.equal(inFlight.recording, true);
    assert.deepEqual(capturePlace(inFlight), capturePlace(before));
  });
});

describe('per client, always', () => {
  it('keeps each person\'s reading draft to themselves', () => {
    let state = openCapture(noCaptures(), { kind: 'reading', clientId: SECOND });
    state = changeReading(state, 'value', '128');
    state = openCapture(state, { kind: 'reading', clientId: THIRD });
    state = changeReading(state, 'value', '96');

    assert.equal(readingDraftOf(state, SECOND).value, '128', 'one person\'s number moved onto another\'s');
    assert.equal(readingDraftOf(state, THIRD).value, '96');
    assert.equal(readingDraftOf(state, FIRST).value, '', 'a person nobody typed for has a number');
  });

  /**
   * A KEYSTROKE CANNOT LAND ON THE WRONG PERSON EVEN BY A CALLER'S MISTAKE, because the person comes
   * from the OPEN PANEL and not from the caller.
   */
  it('drops a reading keystroke when what is open is not a reading panel', () => {
    const closed = noCaptures();
    assert.deepEqual(changeReading(closed, 'value', '128'), closed);

    const note = openCapture(closed, { kind: 'note', clientId: SECOND });
    assert.deepEqual(changeReading(note, 'value', '128'), note);

    const sessionNote = openCapture(closed, { kind: 'note', clientId: null });
    assert.deepEqual(changeReading(sessionNote, 'value', '128'), sessionNote);
  });

  it('drops a note keystroke when no note is open', () => {
    const reading = openCapture(noCaptures(), { kind: 'reading', clientId: SECOND });
    assert.deepEqual(changeNote(reading, 'anything'), reading);
  });

  /**
   * A NOTE ABOUT ONE PERSON AND A NOTE ABOUT THE SESSION ARE TWO DRAFTS, never one. The core
   * distinguishes the two records and says nothing infers one from the other; conflating them at the
   * screen would put one person's note where nobody's belongs.
   */
  it('holds a person\'s note apart from the session\'s own', () => {
    let state = openCapture(noCaptures(), { kind: 'note', clientId: SECOND });
    state = changeNote(state, 'About them.');
    state = openCapture(state, { kind: 'note', clientId: null });
    state = changeNote(state, 'About the session.');

    assert.equal(noteDraftOf(state, SECOND), 'About them.');
    assert.equal(noteDraftOf(state, null), 'About the session.');
    assert.notEqual(noteKey(SECOND), noteKey(null));
  });

  /** One panel at a time: on a phone, two open panels is a screen he has to scroll to read. */
  it('opens one panel at a time, and the control that opened it closes it', () => {
    let state = openCapture(noCaptures(), { kind: 'reading', clientId: SECOND });
    state = openCapture(state, { kind: 'note', clientId: THIRD });

    assert.deepEqual(state.open, { kind: 'note', clientId: THIRD });

    const away = openCapture(state, { kind: 'note', clientId: THIRD });
    assert.equal(away.open, null);
  });

  /** What he typed OUTLIVES the panel, so coming back does not silently discard a measurement. */
  it('keeps what he typed when he puts a panel away and comes back', () => {
    let state = openCapture(noCaptures(), { kind: 'reading', clientId: SECOND });
    state = changeReading(state, 'value', '128');
    state = closeCapture(state);
    state = openCapture(state, { kind: 'reading', clientId: SECOND });

    assert.equal(readingDraftOf(state, SECOND).value, '128', 'his measurement was re-seeded away');
  });

  /**
   * READ OUT OF EACH PERSON'S OWN SLICE, so nobody else's reading or note can appear in their panel.
   * The projection already keeps them apart; this is the assertion that the screen does not undo it.
   */
  it('reads each person\'s readings and notes from their own slice and nowhere else', () => {
    const view = aViewWith({
      [FIRST]: {
        readings: [{ kind: HEART, value: 60, unit: 'bpm', context: 'in_session', note: null }],
        notes: ['The first person\'s note.'],
      },
      [SECOND]: {
        readings: [{ kind: PLANK, value: 62, unit: 'seconds', context: 'post_session', note: 'Solid' }],
        notes: ['The second person\'s note.'],
      },
    });

    const second = readingsOf(view, SECOND);
    assert.equal(second.length, 1);
    assert.match(second[0].words, /Plank hold 62 seconds/);
    assert.equal(second[0].whenWords, WHEN_LABELS.post_session);
    assert.equal(second[0].note, 'Solid');
    assert.deepEqual(notesOf(view, SECOND).map((row) => row.text), ['The second person\'s note.']);

    for (const row of second) {
      assert.ok(!row.words.includes('60'), 'the first person\'s reading appeared in the second\'s');
    }
    assert.deepEqual(notesOf(view, FIRST).map((row) => row.text), ['The first person\'s note.']);
    // Somebody not in the view has nothing, rather than everybody's.
    assert.deepEqual(readingsOf(view, THIRD), []);
    assert.deepEqual(notesOf(view, THIRD), []);
  });

  it('says when a reading was taken after the session, and stays quiet when it was during it', () => {
    const view = aViewWith({
      [SECOND]: {
        readings: [
          { kind: HEART, value: 128, unit: 'bpm', context: 'in_session', note: null },
          { kind: PLANK, value: 62, unit: 'seconds', context: 'post_session', note: null },
        ],
      },
    });
    const rows = readingsOf(view, SECOND);

    assert.equal(rows[0].whenWords, null, 'every row is marked, which is four hundred rows of noise');
    assert.equal(rows[1].whenWords, WHEN_LABELS.post_session);
  });
});

describe('a reading reads as words and never as a content key', () => {
  it('words the kinds the app knows', () => {
    assert.equal(readingWords(HEART, 128, 'bpm'), 'Heart rate 128 bpm');
    assert.equal(readingWords(PLANK, 62, 'seconds'), 'Plank hold 62 seconds');
  });

  /** His own key is words he wrote, so it is titled rather than rewritten by a machine. */
  it('titles a kind of his own from his own key', () => {
    assert.equal(readingWords('grip-strength', 34, 'count'), 'Grip strength 34');
  });

  it('says nothing after the number where the unit is a count of the thing itself', () => {
    assert.equal(readingWords('sit-ups', 20, 'repetitions'), 'Sit ups 20 reps');
    assert.equal(readingWords('rounds', 5, 'count'), 'Rounds 5');
  });

  /** A unit the vocabulary grows later falls through to its own key rather than disappearing. */
  it('carries a unit it has no words for rather than dropping it', () => {
    assert.equal(readingWords('some-distance', 5, 'kilometres'), 'Some distance 5 kilometres');
  });

  it('chooses the glyph by the unit, so a kind of his own still gets the right one', () => {
    const view = aViewWith({
      [SECOND]: {
        readings: [
          { kind: HEART, value: 128, unit: 'bpm', context: 'in_session', note: null },
          { kind: PLANK, value: 62, unit: 'seconds', context: 'in_session', note: null },
          { kind: 'sit-ups', value: 20, unit: 'repetitions', context: 'in_session', note: null },
          { kind: 'rounds', value: 5, unit: 'count', context: 'in_session', note: null },
        ],
      },
    });

    assert.deepEqual(readingsOf(view, SECOND).map((row) => row.glyph), [
      'reading-heart-rate', 'reading-timer', 'reading-repetition-count', 'reading-held-position',
    ]);
  });
});

describe('the absences, each pointed at a known positive', () => {
  /**
   * The module's own CODE LINES, with prose stripped. The house style documents a prohibition in a
   * comment beside the code it constrains, so a sweep over whole source text matches the very
   * sentences explaining why the forbidden thing is forbidden.
   */
  async function codeOf(file: string): Promise<string> {
    const text = await readFile(path.join(here, file), 'utf8');
    return text
      .split('\n')
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
      })
      .join('\n')
      .toLowerCase();
  }

  const MINE = ['session-readings.ts', 'session-readings-source.ts', 'SessionReadings.tsx'];

  /**
   * NOTHING SUGGESTS ANYTHING, and this is the screen where breaking it would feel most helpful: the
   * panel showing what he did last time is one field away from proposing what he should do now.
   */
  it('says nothing that suggests, recommends or proposes', () => {
    const words = everyWordHeReads().toLowerCase();

    for (const forbidden of ['suggest', 'recommend', 'progression', 'you should', 'ought to',
      'increase', 'heavier', 'next time', 'aim for', 'target', 'try for', 'improve on',
      'last time you']) {
      assert.ok(
        !words.includes(forbidden),
        `the coach is told "${forbidden}". The app supports and the coach decides; a training-load `
          + 'judgement belongs to a certified professional adapting to a client\'s history.',
      );
    }
    // The scan pointed at a known positive, so its silence above means something.
    assert.ok('we suggest something heavier next time'.includes('suggest'));
    assert.ok('we suggest something heavier next time'.includes('heavier'));
    assert.ok('we suggest something heavier next time'.includes('next time'));
  });

  it('names no suggestion in its own code either', async () => {
    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const forbidden of ['suggest', 'recommend', 'progression', 'proposeload', 'carryforward']) {
        assert.ok(!code.includes(forbidden), `${file} names ${forbidden} in its code`);
      }
      // The same scan, pointed at something every one of these files genuinely has.
      assert.ok(code.includes('reading'), `the scan read no code at all out of ${file}`);
    }
  });

  /** `SESSION.md` §2: where the session has got to is derived, never persisted and never sent. */
  it('says nothing about where the session has got to', () => {
    const words = everyWordHeReads().toLowerCase();

    for (const forbidden of ['current exercise', 'next exercise', 'step index', 'cursor', 'up next',
      'coming up', 'you are on', 'move on to', 'carry on with']) {
      assert.ok(
        !words.includes(forbidden),
        `the coach is told "${forbidden}", which is a position in a script. SESSION.md §2: a session `
          + 'is a record of what OCCURRED and the application never dictates what happens after.',
      );
    }
    assert.ok('a cursor and up next'.includes('cursor'));
    assert.ok('a cursor and up next'.includes('up next'));
  });

  it('names no cursor in its own code', async () => {
    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const forbidden of ['currentexercise', 'nextexercise', 'stepindex', 'cursor']) {
        assert.ok(!code.includes(forbidden), `${file} names ${forbidden} in its code`);
      }
      assert.ok(code.includes('clientid'), `the scan read no code at all out of ${file}`);
    }
  });

  /**
   * THE FOUR WAYS A DRAWING THROWS HIS PLACE AWAY, scanned for in the drawing itself.
   *
   * A panel that closes on success is asserted above on the state. The other three are properties of
   * the drawing and nothing else can see them: a component that scrolls, a field that takes focus and
   * scrolls the page to itself, or a section keyed by something that changes when the session is read
   * back. The glyph family holds a next and a previous, which are a cursor with a picture on it.
   */
  it('does not scroll, focus or reach for a cursor with a picture on it', async () => {
    const drawing = await codeOf('SessionReadings.tsx');

    for (const forbidden of ['scrollintoview', 'scrollto', 'window.scroll', 'autofocus',
      '.focus()', 'session-next-exercise', 'session-previous-exercise']) {
      assert.ok(
        !drawing.includes(forbidden),
        `the drawing uses ${forbidden}, which moves the page under his thumb at the moment he `
          + 'records a reading — the one thing SESSION.md §6 hands this screen',
      );
    }
    // The same scan, pointed at things this drawing genuinely has.
    assert.ok(drawing.includes('reading-heart-rate'), 'the scan found no glyph name at all, so it '
      + 'proves nothing about the two it is looking for');
    assert.ok(drawing.includes('onclick'), 'the scan found no handler at all in the drawing');
  });

  /**
   * THE PANEL'S STATUS LINE IS DRAWN BEFORE ANYTHING IS RECORDED, and that is why recording changes
   * words rather than the height of everything above the routine. The proof available without a
   * browser is that the drawing has a word for the nought case at all; the height itself was measured
   * by hand.
   */
  it('has words for the panel before anything has gone through it', async () => {
    const drawing = await codeOf('SessionReadings.tsx');

    // THE FALLBACK ITSELF, not merely a mention of it: a scan for the name alone passes on an import
    // nothing uses, which is exactly the state the file would be in if the line were made conditional.
    assert.ok(
      drawing.includes('?? nothing_recorded_yet'),
      'the status line no longer falls back to words for a panel nothing has been recorded through, '
        + 'so it APPEARS when the first reading lands and makes the panel taller under his thumb — '
        + 'which moves the routine he was reading',
    );
    assert.ok(NOTHING_RECORDED_YET.trim().length > 0);
  });

  /**
   * THE STATUS LINE'S HEIGHT IS RESERVED, and this is the guard on the fix rather than on the defect.
   *
   * MEASURED at 390px in a real session (s6/a5): the panel was 546px with one line of status on it and
   * 572px with two, and those 26 pixels moved the routine the coach was reading at the moment he
   * pressed Record. Chromium's scroll anchoring compensated exactly and hid it; WebKit does not
   * implement `overflow-anchor` and this build is designed to the weaker iOS baseline by a recorded
   * decision, so on the coach's own phone nothing would have compensated.
   *
   * Asserted on the FOUNDATION and on the USE, because either half alone is a rule nothing applies or
   * a class that does nothing.
   */
  it('reserves the status line\'s height, in the foundation and on the line itself', async () => {
    const css = await readFile(path.join(here, '..', 'design', 'console.css'), 'utf8');
    const rule = /\.status-held\s*\{([^}]*)\}/u.exec(css);

    assert.notEqual(rule, null, 'the reserved-height rule is gone from the foundation, so a status '
      + 'line one word longer than a line makes the panel taller and moves the routine below it');

    /*
     * WHAT THE RULE MUST SAY, and not merely that it says something.
     *
     * The first version of this assertion matched `/min-height/` and nothing more. Broken on purpose to
     * `min-height: 0`, IT STAYED GREEN — a reserve of nothing satisfied a guard about reserving. That
     * was the guard being too weak rather than the break, which is the pair a green break cannot tell
     * apart, so it is written out here: the height must be TEXT-RELATIVE (`em`, so it holds under the
     * reading floor and a larger system font) and must be TWO lines of it.
     */
    const reserved = /min-height:\s*([^;]+);/u.exec(String(rule?.[1]));
    assert.notEqual(reserved, null, 'the rule no longer reserves a height at all');
    const value = String(reserved?.[1]);
    // `2em` AND NOT `\b2em\b`: in "2em" the digit and the letter are both word characters, so there is
    // no word boundary between them and the anchored pattern matches nothing. Written the first way, it
    // was red on the good tree — and every deliberate break of it then reported RED for that reason
    // instead of for the reason being probed, which is a probe proving nothing while looking convincing.
    assert.match(value, /2em/u, `the reserve is "${value}", which is not TWO lines of text-relative `
      + 'height — a pixel guess stops being two lines the moment the reading floor or the system font '
      + 'moves, and one line is the height that was measured moving the routine');
    // The same reading, pointed at the two values a weakened rule would carry: neither may satisfy it.
    assert.doesNotMatch('0', /2em/u, 'this reading cannot tell a reserve from no reserve at all');
    assert.doesNotMatch('calc(1em * var(--leading-loose))', /2em/u, 'this reading cannot tell two '
      + 'lines from one, which is the whole of what it is measuring');
    // A HEIGHT IN THE FOUNDATION AND NOTHING WEARING IT is a rule that does nothing.
    const drawing = await codeOf('SessionReadings.tsx');
    assert.ok(
      drawing.includes('status-held'),
      'the status line does not wear the class that reserves its height',
    );
    // The same scan, pointed at a class this drawing genuinely wears.
    assert.ok(drawing.includes('card-tight'), 'the scan read no class names at all out of the drawing');
  });

  it('carries no emoji in anything it says', () => {
    const words = everyWordHeReads();

    assert.doesNotMatch(words, /\p{Extended_Pictographic}/u, 'an emoji reached a user-facing string');
    // WRITTEN AS AN ESCAPE, never as a literal character: a probe written as the character itself puts
    // a real emoji into the source tree, which is the thing being forbidden.
    assert.match('\u{1F600}', /\p{Extended_Pictographic}/u, 'the emoji scan cannot see an emoji');
  });

  /** Every sentence he reads is a sentence, so a blank one cannot pass as an absence of one. */
  it('leaves nothing it says empty', () => {
    for (const words of [CAPTURE_INTRO, CUSTOM_KIND_HINT, CUSTOM_KIND_LABEL, GLANCE_LESS_LABEL,
      GLANCE_MORE_LABEL, GLANCE_READING_WORDS, LEAVE_IT_LABEL, NOTES_TAKEN_TITLE,
      NOTE_ABOUT_CLIENT_LABEL, NOTE_ABOUT_CLIENT_TITLE, NOTE_ABOUT_SESSION_LABEL,
      NOTE_ABOUT_SESSION_TITLE, NOTE_ABOUT_SESSION_WORDS, NOTE_RECORDED_WORDS, NOTHING_RECORDED_YET,
      READINGS_TAKEN_TITLE, READING_LABEL, READING_TITLE, RECORD_NOTE_LABEL, RECORD_READING_LABEL,
      NO_NOTE_YET, NO_NUMBER_YET, valueLabel(typed()),
      readingWhoseWords('Priya'), noteAboutClientWords('Priya')]) {
      assert.ok(words.trim().length > 0);
    }
    for (const label of Object.values(READING_FIELD_LABELS)) assert.ok(label.trim().length > 0);
    for (const label of Object.values(READING_KIND_LABELS)) assert.ok(label.trim().length > 0);
    for (const label of Object.values(WHEN_LABELS)) assert.ok(label.trim().length > 0);
  });

  /**
   * THE NOTE BOX SAYS WHAT MUST NOT GO IN IT. `core/model/entities/session-note.js` obliges the
   * interface that renders the record to say so at the point of entry, because an in-session note is
   * PLAINTEXT — stored, synchronised and backed up in the clear — and a free-text box invites clinical
   * detail. This is that obligation, asserted on the words rather than trusted to the comment.
   */
  it('says at the point of entry that a medical detail does not belong in a note', () => {
    for (const words of [noteAboutClientWords('Priya'), NOTE_ABOUT_SESSION_WORDS]) {
      assert.match(words, /plain text/, 'the note box does not say it is kept as plain text');
      assert.match(
        words,
        /medical|clinical/,
        'the note box does not say where a medical detail belongs, which the record obliges it to',
      );
      assert.match(words, /your own private records/);
    }
  });

  it('says whose a note is, because the record keeps the two apart', () => {
    assert.match(noteAboutClientWords('Priya'), /Priya/);
    assert.match(noteAboutClientWords('Priya'), /export/);
    assert.match(NOTE_ABOUT_SESSION_WORDS, /nobody/);
  });

  /** One keystroke, one draft back, and nothing else on it moves. */
  it('changes one field of a draft and leaves the rest of it alone', () => {
    const draft = editReading(typed({ value: '128', note: 'Steady' }), 'value', '130');

    assert.equal(draft.value, '130');
    assert.equal(draft.note, 'Steady');
    assert.equal(draft.kind, HEART);
  });
});

describe('a box he has not typed into yet is not a mistake he has made', () => {
  /**
   * MEASURED BY LOOKING (s6/a5): the reading panel opened with "A reading needs the number you
   * measured" already on it, telling him off for not having filled in a box he had that moment opened.
   * The control that records is refused anyway, and the empty box says the same thing without the
   * reprimand.
   */
  it('says nothing about a number he has not typed, while still refusing to record one', () => {
    const untouched = typed();

    assert.equal(readingProblem(untouched), NO_NUMBER_YET, 'an empty reading can be recorded');
    assert.equal(readingFromDraft(untouched), null);
    assert.equal(
      readingProblemShown(untouched),
      null,
      'the panel tells him off for not having typed into a box he has just opened',
    );
  });

  /** Every OTHER problem is drawn as soon as it is true, because each is a thing he did type. */
  it('says so at once about anything he DID type wrongly', () => {
    for (const draft of [
      typed({ value: 'a hundred' }),
      typed({ value: '-1' }),
      typed({ value: '120', note: 'x'.repeat(READING_NOTE_MAX + 1) }),
      typed({ kind: CUSTOM_KIND, customKind: 'Grip Strength', value: '5' }),
      typed({ kind: CUSTOM_KIND, customKind: 'grip-strength', customUnit: '', value: '5' }),
    ]) {
      assert.notEqual(
        readingProblemShown(draft),
        null,
        `${JSON.stringify(draft)} is refused with no sentence beside the control that refused it`,
      );
    }
  });

  it('says nothing about a note he has not written, and still refuses to record one', () => {
    assert.equal(noteProblem(''), NO_NOTE_YET);
    assert.equal(noteFromDraft(''), null);
    assert.equal(noteProblemShown(''), null);
    assert.notEqual(noteProblemShown('x'.repeat(NOTE_MAX + 1)), null);
  });

  /**
   * THE UNIT IS IN THE LABEL, because a line under every field is how a panel outgrows the phone it is
   * read on. Measured at 390px: the panel was 769px tall inside a 706px scroller.
   */
  it('carries the pinned unit in the number field\'s own label', () => {
    assert.match(valueLabel(typed({ kind: HEART })), / in bpm$/);
    assert.match(valueLabel(typed({ kind: HOLD_KIND })), / in seconds$/);
    // A kind of his own names its unit in a field of its own, so there is nothing to carry.
    assert.equal(
      valueLabel(typed({ kind: CUSTOM_KIND, customKind: 'grip-strength' })),
      READING_FIELD_LABELS.value,
    );
  });
});

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * A whole reading with candidate fields overridden, for the agreement tests.
 *
 * Every other field is a valid minimum, so the only thing the record can object to is the field under
 * test — otherwise a bound that had drifted would be hidden behind an unrelated issue.
 */
function aReadingWith(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    client_id: '11111111-1111-4111-8111-111111111111',
    session_id: '33333333-3333-4333-8333-333333333333',
    kind: HEART,
    value: 120,
    unit: 'bpm',
    context: 'in_session',
    taken_at: '2026-07-26T09:00:00.000Z',
    ...fields,
  };
}

/** A whole note with one text, for the agreement test. */
function aNoteWith(text: string): Record<string, unknown> {
  return {
    session_id: '33333333-3333-4333-8333-333333333333',
    text,
    taken_at: '2026-07-26T09:00:00.000Z',
  };
}

/**
 * WHAT THE STANDING-FACTS CARD SAYS — the whole derivation, and none of the drawing.
 *
 * ## THE SURFACE THIS BUILD DID NOT HAVE
 *
 * Everything else this application reports resolves itself. A queued change lands, a removal is
 * confirmed, a credential comes back — every surface the coach reads is a surface that empties. So
 * every one of them ESCALATES, because on a surface that empties, escalation is how a thing that has
 * been sitting too long gets noticed.
 *
 * There is exactly one fact in this build that does NOT resolve itself, ever: an opaque queued
 * payload naming a departed client and a staying one, which `core/outbox/scrub.js` deliberately and
 * correctly leaves alone because cleaning it would destroy the staying client's data. It had nowhere
 * to be said. The removals screen says it only while that removal is still pending, and the moment
 * the removal is confirmed — the moment everything looks finished — it goes quiet while the entry
 * stays. This card is the place it can be said afterwards, calmly, for as long as it is true.
 *
 * ## THE RULE THIS CARD EXISTS TO HONOUR, AND IT IS THE ONE THAT BINDS EVERY LATER SURFACE
 *
 * **BEFORE PUTTING ANYTHING ON AN ESCALATING SURFACE, ASK: DOES THIS EVER RESOLVE BY ITSELF?**
 * If it cannot, it does not belong there. `core/status/levels.js` floors the ladder at `overdue`
 * while a needs-attention entry exists, so routing this here would pin the one indicator the coach is
 * meant to trust at overdue FOR EVER, on a condition he can never act on — and a permanent alarm is
 * precisely what teaches him to ignore the indicator, after which it cannot warn him about anything.
 * That was the obvious fix, it was reached for three times on the previous step, and it is wrong.
 *
 * SO EVERY STATE OF THIS CARD IS CALM. The tone is `neutral` or `success` and there is no third
 * value — a fault tone is unrepresentable here rather than merely unused, and
 * `standing-facts.test.ts` asserts it across every state the card can produce. The WORDS carry the
 * fact; the tone is a second channel and never the only one.
 *
 * ## NOTHING IS REWORDED HERE THAT IS ALREADY WORDED SOMEWHERE
 *
 * `removals.ts` already words an unresolved entry from its DECLARED CODE — never from message text —
 * and already owns the sentence that says this one will not clear on its own. Those are imported and
 * used, not paraphrased. A second copy of a sentence is a second copy that drifts, and the drift is
 * silent: two surfaces would describe the same file differently and the coach would believe they were
 * two files. What is NEW here, and said nowhere else, is {@link STILL_HERE_AFTER_THE_REMOVAL_IS_DONE}
 * — the fact that finishing the removal did not take this with it, which is the whole gap.
 *
 * ## AND IT SAYS WHEN IT DOES NOT KNOW
 *
 * "Nothing was left behind" and "this device has not been read yet" are different facts and only one
 * of them is reassuring. The card holds them apart: a null reading is its own state with its own
 * words, and it never produces the settled sentence. That is the same rule the removals chip follows,
 * for the same reason — a green nought on a device whose storage never opened is good news
 * manufactured out of never having looked.
 */

import type { ReportPair } from './admin-report';
import type { LeftBehindItem } from './removals';
import { NO_NAME_IS_DELIBERATE, describeLeftBehind } from './removals';
import type { StandingFactsReading, StandingResidual } from './standing-facts-source';

/** The card's own heading. One card, one question: what is on this device that is not going to change. */
export const STANDING_FACTS_TITLE = 'Left here on purpose';

/**
 * WHAT THIS CARD IS, said once and permanently, in both the empty state and the full one.
 *
 * It is the sentence that stops the card reading as a fault list. Every other surface in this
 * application is a list of things that are going to change; this is the one that is not, and saying
 * so is what makes an entry on it legible rather than alarming.
 */
export const WHAT_THIS_CARD_IS =
  'Some things cannot be undone without taking somebody else\'s data with them, so this app leaves '
  + 'them exactly as they are and tells you they are there. Nothing on this card is waiting on you, '
  + 'and nothing on it is going wrong. It stays here for as long as it is true.';

/**
 * THE FACT THAT IS SAID NOWHERE ELSE, and the whole reason this card exists.
 *
 * The removals screen shows an unresolved entry while its removal is still being confirmed. Once the
 * removal IS confirmed it leaves that screen — and the entry does not leave the queue. So the moment
 * everything reads as finished is the moment this stops being mentioned, which is exactly when he
 * would most reasonably assume it is gone.
 */
/**
 * IT SAYS NOTHING ABOUT WHERE THE FILE IS, and that is a correction rather than a style.
 *
 * The first version of this sentence ended "...and it is still waiting to go to your Google Drive",
 * which was read off the code rather than off the queue. On the very first walk of the rendered card
 * the pass had already DELIVERED the entry, so the card said the file was waiting to go directly
 * above a sentence saying it had already gone. Where the file is belongs to the queue's own status
 * word and is said in exactly one place — {@link StandingFactItem.whereItIs}. This one says only what
 * it is for: that finishing the removal did not take it with it.
 */
export const STILL_HERE_AFTER_THE_REMOVAL_IS_DONE =
  'Finishing the removal did not take this with it. The removal itself is done; this is a separate '
  + 'copy of some work that was already queued when you removed them.';

/** What is true when this device has not been read. It is not the empty answer, and never reads as one. */
export const NOT_READ_YET =
  'This app has not been able to look on this device yet, so it cannot tell you either way. It is '
  + 'not saying there is nothing.';

/** What is true when the walk stopped short. Said out loud, because a bound nobody sees is a lie. */
export const MORE_THAN_THESE =
  'There are more removals on this device than this card was able to read in one go. What is shown '
  + 'is the oldest of them.';

/** Which of the three things this card is saying. Named so a test asserts the branch, not the sentence. */
export type StandingFactsState = 'not-known' | 'settled' | 'standing';

/**
 * How the chip is drawn. `neutral` or `success` and there is deliberately no third value.
 *
 * A warning tone is UNREPRESENTABLE here rather than merely unused: the one condition this card
 * reports can never be cleared, so a warning on it would be a permanent one. See the header.
 */
export type StandingTone = 'neutral' | 'success';

/** One standing fact, worded. Identities and this application's own words only. */
export interface StandingFactItem {
  /** The heading. Never a name, because none was kept — see {@link NO_NAME_IS_DELIBERATE}. */
  readonly heading: string;
  /** The departed client's reference, which is what somebody helping him would ask for. */
  readonly clientReference: string;
  /** When he removed them. Literal: the instant is the evidence. */
  readonly removedAt: string;
  /** That finishing the removal did not take this with it. Its own field: it is the new fact. */
  readonly stillHere: string;
  /** How much of theirs is named in it, in plain words. Never a bare number. */
  readonly whatRemains: string;
  /**
   * WHERE THAT FILE IS NOW, read from the queue's own status word rather than assumed.
   *
   * A queued delivery that has already GONE is a different fact from one still waiting, and the
   * difference matters to him: one of them means a departed client's data reached his Google Drive.
   * The outbox keeps a delivered entry deliberately — it is the evidence of the delivery and the
   * local half of the duplicate defence — so "delivered" never means "gone from this device".
   */
  readonly whereItIs: string;
  /**
   * The queued delivery itself, worded by `removals.ts` from the DECLARED CODE.
   *
   * Imported rather than re-worded so the two surfaces cannot describe the same file differently —
   * it carries what it means, that it will not clear on its own, what to do, and the references.
   */
  readonly entry: LeftBehindItem;
  /** The forensic half: references, folded and counted. Nothing is discarded. */
  readonly forensic: readonly ReportPair[];
}

/** Everything the card says. */
export interface StandingFactsReport {
  readonly title: string;
  readonly state: StandingFactsState;
  /** The chip's word. A word rather than a number, because two of the three states have no figure. */
  readonly chip: string;
  readonly tone: StandingTone;
  /** How many facts are standing right now. Zero in both of the other states. */
  readonly count: number;
  readonly intro: string;
  /** {@link WHAT_THIS_CARD_IS}, in every state, never reworded. */
  readonly meaning: string;
  /** Said only when the walk stopped short of the end. Null otherwise. */
  readonly moreWords: string | null;
  /** Why no name is shown. Present only when there is something to attach it to. */
  readonly noName: string | null;
  readonly items: readonly StandingFactItem[];
}

/** How much of theirs is named in the entry, in plain words rather than as a bare figure. */
function remainsWords(recordIds: readonly string[]): string {
  if (recordIds.length === 0) {
    return 'A file this app had queued for your Google Drive still refers to this client.';
  }
  return recordIds.length === 1
    ? 'A file this app had queued for your Google Drive has 1 record of theirs named in it.'
    : `A file this app had queued for your Google Drive has ${recordIds.length} records of theirs `
      + 'named in it.';
}

/**
 * The queue's word for where that file has got to, said as a fact about now.
 *
 * DELIVERED IS NOT GONE, and that is the sentence a reader would most easily get wrong. The outbox
 * keeps a delivered entry on purpose — `core/outbox/queue.js` says why: it is the evidence the
 * delivery happened and the local half of the duplicate defence — so the copy on this device is
 * still here, and the file is now in the backup as well. Both halves are said.
 */
function whereWords(entryStatus: string): string {
  if (entryStatus === 'delivered') {
    return 'That file has already gone to your Google Drive, and this device still keeps its own '
      + 'copy of it. Neither copy can be taken apart without taking the other client\'s data too.';
  }
  return 'That file is still on this device, waiting to go to your Google Drive.';
}

/** One standing fact, worded. */
export function describeStandingFact(residual: StandingResidual): StandingFactItem {
  const entry = describeLeftBehind({
    entry_id: residual.entryId,
    why: residual.why,
    record_ids: residual.recordIds,
  });

  return {
    heading: 'A client you removed, and a file of theirs that is still on this device',
    clientReference: residual.subjectClientId,
    removedAt: residual.removedAt,
    stillHere: STILL_HERE_AFTER_THE_REMOVAL_IS_DONE,
    whatRemains: remainsWords(residual.recordIds),
    whereItIs: whereWords(residual.entryStatus),
    entry,
    forensic: [
      { label: 'Removal reference', literal: true, value: residual.deletionId },
      { label: 'Client reference', literal: true, value: residual.subjectClientId },
      { label: 'Removed at', literal: true, value: residual.removedAt },
      { label: 'State of the removal', literal: true, value: residual.removalStatus },
      { label: 'State of the queued delivery', literal: true, value: residual.entryStatus },
      ...entry.forensic,
    ],
  };
}

function things(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

/**
 * Everything the card says, from the reading the store handed over.
 *
 * A NULL READING IS ITS OWN STATE. It is not folded into the empty one, because "nothing was left
 * behind" is the reassuring sentence and it may only be said by a card that has actually looked.
 */
export function describeStandingFacts(reading: StandingFactsReading | null): StandingFactsReport {
  if (reading === null) {
    return {
      title: STANDING_FACTS_TITLE,
      state: 'not-known',
      chip: 'Not known yet',
      tone: 'neutral',
      count: 0,
      intro: NOT_READ_YET,
      meaning: WHAT_THIS_CARD_IS,
      moreWords: null,
      noName: null,
      items: [],
    };
  }

  const items = reading.standing.map(describeStandingFact);
  const moreWords = reading.complete ? null : MORE_THAN_THESE;

  if (items.length === 0) {
    return {
      title: STANDING_FACTS_TITLE,
      state: 'settled',
      chip: 'Nothing left here',
      tone: 'success',
      count: 0,
      intro:
        'Nothing of anybody\'s has been left behind on this device. When you remove a client, '
        + 'anything of theirs this app cannot take out of your Google Drive queue is listed here, and '
        + 'it stays listed for as long as it is there.',
      meaning: WHAT_THIS_CARD_IS,
      moreWords,
      noName: null,
      items,
    };
  }

  return {
    title: STANDING_FACTS_TITLE,
    state: 'standing',
    // A word AND the figure, never a bare number on its own: the figure is what he acts on and the
    // word is what stops the chip reading as a count of problems.
    chip: `${things(items.length)} left here`,
    // NEUTRAL AND NOT A WARNING, in the state where a warning is the reflex. See the header: this
    // condition cannot be cleared, so a warning here would be a permanent one.
    tone: 'neutral',
    count: items.length,
    intro:
      `${things(items.length)} on this device ${items.length === 1 ? 'was' : 'were'} left exactly as `
      + `${items.length === 1 ? 'it was' : 'they were'} when you removed a client, because removing `
      + `${items.length === 1 ? 'it' : 'them'} would have taken another client's data as well.`,
    meaning: WHAT_THIS_CARD_IS,
    moreWords,
    noName: NO_NAME_IS_DELIBERATE,
    items,
  };
}

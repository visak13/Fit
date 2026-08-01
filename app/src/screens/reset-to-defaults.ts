/**
 * WHAT THE RESET CONTROL SAYS — the whole derivation, and none of the drawing.
 *
 * `core/seed/reset.js` has held `describeReset` and `resetToDefaults` since the seed step, correct,
 * tested, and CALLED BY NOTHING. This is the half that reaches the coach. Not one line of the
 * mechanism is repeated here: what a reset would do is the plan `describeReset` computed off his
 * real store, and this file turns that plan into sentences. `ResetToDefaultsCard.tsx` beside it
 * draws them and decides nothing.
 *
 * ## THE WORDS ARE DERIVED HERE SO THEY CAN BE ASSERTED
 *
 * The same split as `admin-report.ts`, `full-export.ts` and `library-editor.ts`, and for a sharper
 * reason on this screen than on any of them: the rules this copy is held to are not stylistic.
 *
 *   - It must NAME WHAT IT DESTROYS rather than what it restores. "Restore the shipped library"
 *     is true and is the wrong sentence: what he needs to weigh is that the routines, exercises
 *     and curves he added to a shipped record or changed on one are about to go.
 *   - It must NOT say "a fresh slate". Reset is library-only and settled as such. That phrase
 *     would either frighten him off a safe action or teach him the button clears his clients —
 *     and the second is worse, because he would eventually rely on it.
 *   - It must say WHY THE ACTION LIVES IN ADMIN, because a destructive control found by accident
 *     reads as a trap and one found deliberately reads as a tool.
 *   - It must OFFER THE BACKUP FIRST, and the offer must cover EXACTLY what the act destroys.
 *
 * A sentence living inside a renderer cannot be held to any of those.
 *
 * ## THE WORD "REST" NEVER MEANS "THE REMAINDER" ANYWHERE IN THIS APPLICATION
 *
 * `rest seconds` is a field on the library screens this button restores, so "the rest of your
 * library" reads as the rest period and produces a contradiction where it is least affordable.
 * "Everything else" is the phrase. `library-routines.ts` met the same trap and this file inherits
 * its rule rather than rediscovering it; the guard is in the suite beside this file, asserted on
 * the finished sentences rather than on the intent.
 *
 * ## THE FIGURES ARE THE PLAN'S, AND A FIGURE THIS FILE CANNOT SEE IS NOT INVENTED
 *
 * Every count comes off `describeReset`. Where the plan has not been read yet, the report says so
 * in as many words rather than drawing a reassuring nought — a green "0 changes will be lost" on a
 * store nobody has looked at is the reassuring answer arrived at by not having looked, which is the
 * one shape this build keeps meeting from every direction.
 */

/**
 * The plan `core/seed/reset.js` computes, in the shape this file reads it.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED, so
 * the part of its shape that is used is stated where it is used. Only what is read is declared:
 * a wider restatement would be a second, drifting copy of a core type.
 */
export interface ResetPlanReading {
  readonly consequences: {
    readonly restored_record_types: readonly string[];
    readonly reverts_coach_edits: number;
    readonly restores_missing: number;
    readonly removes_no_longer_shipped: number;
    readonly leaves_coach_created_untouched: number;
    readonly untouched_record_types: readonly string[];
  };
  readonly will_revert: readonly { readonly type: string; readonly name: string }[];
  readonly will_restore: readonly { readonly type: string; readonly name: string }[];
  readonly will_remove: readonly { readonly type: string; readonly name: string }[];
  readonly shipped_counts: Readonly<Record<string, number>>;
}

/**
 * WHAT EACH LIBRARY KIND IS CALLED IN HIS LANGUAGE.
 *
 * A lookup from the record's own kind value to a noun, which is the one direction that cannot
 * invent a fourth kind. A kind with no word here is shown AS THE RECORD HOLDS IT rather than
 * swallowed: a row he can see the effect of and not the cause is worse than an unfamiliar word.
 */
const KIND_NOUNS: Readonly<Record<string, string>> = {
  exercise: 'exercises',
  routine: 'routines',
  'intensity-pattern': 'intensity curves',
};

/** The plural noun for a library kind, or the kind exactly as the record holds it. */
export function kindNoun(kind: string): string {
  return KIND_NOUNS[kind] ?? kind;
}

/**
 * A list of kinds as a sentence fragment: "exercises, routines and intensity curves".
 *
 * Built from the kinds the PLAN names rather than from a phrase typed here, so the day a fourth
 * library kind ships, the sentence he reads is about the library he actually has. The intensity
 * curves are the ones a hand-typed sentence forgets — they became editable only in this step, and a
 * confirmation written from an older mental model would name two kinds and destroy three.
 */
export function kindsPhrase(kinds: readonly string[]): string {
  const words = kinds.map(kindNoun);
  if (words.length === 0) return 'nothing';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The heading over the card. It names the act, not the machinery. */
export const RESET_TITLE = 'Restore the library the app came with';

/**
 * THE WORDS ON THE CONTROL THAT OPENS THE PANEL, AND THEY ARE NOT THE HEADING AGAIN.
 *
 * Found by reading the rendered card: the heading and the button both said "Restore the library the
 * app came with", one directly under the other, and the panel then said it a third time. Every
 * property check passed — there is nothing wrong with any one of those sentences.
 *
 * It matters beyond tidiness. A button repeating the heading reads as THE ACT, so a coach who wants
 * to know what would happen has to press what looks like the destructive control to find out. What
 * it actually does is show him the figures for his own library, and saying so is what makes the
 * panel safe to open.
 */
export const SEE_WHAT_WOULD_CHANGE = 'See what restoring would change';

/**
 * WHY THIS CONTROL IS IN ADMIN AND NOT WHERE HE EDITS THE LIBRARY.
 *
 * Asked and answered on the screen, because a destructive control found by accident reads as a trap
 * and one found on purpose reads as a tool. It also says the thing that makes the button matter at
 * all: the app seeds the library ONCE and never puts it back on its own, deliberately, so that
 * deleting a routine stays deleted. That is what makes this the only way back.
 */
export const WHY_IT_IS_IN_ADMIN =
  'This is in Admin rather than beside your library because it undoes work, and a control that '
  + 'undoes work should be somewhere you went on purpose. It is also the only way back: the app '
  + 'puts its library in once, when you first open it, and never again on its own — so a routine '
  + 'you delete stays deleted until you press this.';

/**
 * WHAT THE ACT DESTROYS, said before anything else and in his words.
 *
 * Named as the loss rather than the restoration. The second half is the reassurance, and it is here
 * because the phrase this button used to carry — a fresh slate — is false and would have him
 * believing his clients were at risk.
 */
export const WHAT_IT_DESTROYS =
  'Your changes to anything the app came with will be gone: an exercise you corrected, a routine '
  + 'you reordered, a curve you retuned. Anything you made yourself is left exactly as it is, and '
  + 'so is everything else in the app.';

/**
 * THE HALF THAT IS NOT ABOUT THE LIBRARY AT ALL, and it is the sentence that stops him worrying.
 *
 * `describeReset` carries the untouched kinds as a list, so this is composed from the plan rather
 * than typed — a kind the reset stops touching, or starts, changes this sentence by itself.
 */
export function whatIsLeftAlone(untouched: readonly string[]): string {
  const nouns = untouched.map((kind) => LEFT_ALONE_NOUNS[kind] ?? kind);
  const phrase = nouns.length === 0
    ? 'nothing'
    : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `This button cannot reach ${phrase}. None of it is touched, read or moved.`;
}

/** The record kinds the reset never touches, as the coach would name them. */
const LEFT_ALONE_NOUNS: Readonly<Record<string, string>> = {
  client: 'your clients',
  session: 'your sessions',
  'performed-record': 'what was actually done in them',
  reading: 'the readings you took',
  'session-note': 'your notes',
  'diet-plan': 'your diet plans',
};

// ═══════════════════════════════════════════════════════════════════════════════
// The backup offer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HIS ANSWER TO THE BACKUP OFFER, and it is an INTENTION rather than an outcome.
 *
 * The copy is made INSIDE the reset, immediately before the first write, because that is the only
 * ordering under which a copy that fails to save is followed by no reset — `core/seed/reset.js`
 * runs its `backup` argument first and lets a rejection through untouched. So there is no "saved"
 * state to hold here: a copy taken by a separate button minutes earlier would be a copy of a
 * different library, and its failure would be a failure the reset never heard about.
 *
 * `unanswered` is the state the confirming control is ABSENT in. It is not a default that resolves
 * itself; the offer is a question and he answers it.
 */
export type BackupState = 'unanswered' | 'with-backup' | 'without-backup';

/** What the backup offer says right now. */
export interface BackupOffer {
  readonly heading: string;
  readonly words: string;
  /** The words on the control that chooses to save one. */
  readonly takeLabel: string;
  /** The words on the control that chooses to go without. */
  readonly declineLabel: string;
  /** True once the question has an answer. Until then there is nothing to confirm. */
  readonly answered: boolean;
}

/** Said while the file is being made and the library restored, because neither is instant. */
export const MAKING_THE_BACKUP = 'Saving your copy...';

/**
 * THE OFFER, AND IT COVERS EXACTLY WHAT THE ACT DESTROYS.
 *
 * A library backup rather than a backup of everything, and that is a precision rather than a
 * shortcut: this button destroys library records and nothing else, so an offer to "back up your
 * data" would imply his clients and sessions were at risk. The sentence would overstate the danger
 * of a safe act, which is the same defect as understating a dangerous one and is how a coach learns
 * to stop reading confirmations.
 *
 * THE OFFER SAYS WHAT THE FILE CAN DO, AND THAT SENTENCE CHANGED WHEN THE RESTORE WAS BUILT.
 *
 * It used to say that nothing in this application read a backup file back in, so the file was a copy
 * he kept rather than a button that undid this. That was true when it was written and it is now
 * FALSE. `core/backup/` reads exactly this file — the library archive this offer saves, bare content
 * and no envelopes — and `RestoreBackupCard` on this same screen is where he chooses it.
 *
 * The correction matters in both directions and the pessimistic one is the easier mistake to leave
 * standing. A coach who believes he can restore with one tap presses reset more freely than one who
 * knows he cannot, so overstating would be this screen's doing. But a warning that UNDERSTATES what
 * the app can do is still a warning that misinforms: it would talk him out of a safe act, or worse,
 * leave him rebuilding a library by hand beside a file that would have put it back.
 *
 * `restore-backup.test.ts` and `core/backup/restore.test.js` are what keep this sentence true. The
 * second of those restores THIS SHAPE OF FILE specifically, so if it ever stops being readable the
 * suite goes red rather than this paragraph going quietly wrong.
 */
export function describeBackupOffer(state: BackupState): BackupOffer {
  if (state === 'with-backup') {
    return {
      heading: 'A copy will be saved first',
      words:
        'The copy is made at the moment you restore, so it holds your library exactly as it is '
        + 'now, and you can put it back from this page if you change your mind. If it cannot be '
        + 'saved, nothing is restored and your library is left alone.',
      takeLabel: 'Save a copy first',
      declineLabel: 'Change to going without a copy',
      answered: true,
    };
  }

  if (state === 'without-backup') {
    return {
      heading: 'Going ahead without a copy',
      words:
        'You have chosen not to save one. Your changes to anything the app came with will be gone, '
        + 'and without a copy there is no file to put back afterwards.',
      takeLabel: 'Change to saving a copy first',
      declineLabel: 'Go ahead without a copy',
      answered: true,
    };
  }

  return {
    heading: 'Save a copy of your library first?',
    words:
      'A copy is one file holding every exercise, routine and curve you have, made on this device '
      + 'at the moment you restore. It covers exactly what this button changes and nothing else. '
      + 'You can put it back later from the "Put a backup back" card on this page, so this is a '
      + 'way to undo what you are about to do — which is the reason to take it before you press '
      + 'anything, not after.',
    takeLabel: 'Save a copy first',
    declineLabel: 'Go ahead without a copy',
    answered: false,
  };
}

/**
 * THE WORDS ON THE DESTRUCTIVE BUTTON, AND THEY CARRY HIS ANSWER.
 *
 * One button whose label states what is about to happen in full, rather than a button reading
 * "Restore" beside a tick box he may not have noticed. He should not have to look in two places to
 * know whether a copy is being saved.
 */
export function confirmLabelFor(state: BackupState): string | null {
  if (state === 'with-backup') return 'Save a copy and restore the library';
  if (state === 'without-backup') return 'Restore the library without a copy';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The confirmation
// ═══════════════════════════════════════════════════════════════════════════════

/** One line of the plan, as the confirmation lists it. */
export interface ResetConsequence {
  readonly label: string;
  readonly value: string;
  /** The names behind the figure, so a figure he does not believe can be checked. */
  readonly names: readonly string[];
}

/** Everything the confirmation says. */
export interface ResetConfirmation {
  readonly title: string;
  readonly whatItDestroys: string;
  readonly whyItIsInAdmin: string;
  readonly leftAlone: string;
  /** The four figures, in the order he would weigh them: what he loses, then what he gains. */
  readonly consequences: readonly ResetConsequence[];
  /** True when the plan says this reset would change nothing at all. */
  readonly changesNothing: boolean;
  /** Said instead of the figures when the plan changes nothing. Null otherwise. */
  readonly changesNothingWords: string | null;
  readonly cancelLabel: string;
}

/**
 * A count and its noun, agreeing with each other.
 *
 * Branched rather than pluralised by suffix, because rendered the other way round reads
 * "1 routines" — the fault the library list shipped with twice, and found both times by reading the
 * screen after every property check had passed.
 */
export function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * A figure on the consequence list, with NONE said as a word.
 *
 * Read on the real screen, three rows in a row said "0 items", which is dry where it should be
 * reassuring — the label already carries the meaning, so the value only has to say how much, and
 * "None" says it in the language he would use. It is still a measured claim and not an omission:
 * the row stays, because a row that disappeared when it had nothing to report would leave him
 * unable to tell "nothing will be removed" from "this screen forgot to say".
 */
function figure(count: number): string {
  return count === 0 ? 'None' : counted(count, 'item', 'items');
}

/**
 * THE CONFIRMATION, from the plan the core computed off his real library.
 *
 * The four figures are what a reset would actually do to the library he has today, not a
 * description of what reset means. That is the difference between a confirmation and a warning
 * label: a coach who has changed nothing sees that he is losing nothing, and one who has spent an
 * evening retuning curves sees the number and can read their names.
 */
export function describeResetConfirmation(plan: ResetPlanReading): ResetConfirmation {
  const { consequences } = plan;
  const changesNothing =
    consequences.reverts_coach_edits === 0
    && consequences.restores_missing === 0
    && consequences.removes_no_longer_shipped === 0;

  return {
    // NOT THE CARD'S HEADING AGAIN. It names what the panel is: the figures for HIS library, which
    // is what he opened it for.
    title: 'What restoring would change',
    whatItDestroys: WHAT_IT_DESTROYS,
    whyItIsInAdmin: WHY_IT_IS_IN_ADMIN,
    leftAlone: whatIsLeftAlone(consequences.untouched_record_types),
    changesNothing,
    changesNothingWords: changesNothing
      ? nothingToChangeWords(consequences.leaves_coach_created_untouched)
      : null,
    consequences: [
      {
        label: 'Your changes that will be undone',
        value: consequences.reverts_coach_edits === 0
          ? 'None'
          : counted(consequences.reverts_coach_edits, 'change', 'changes'),
        names: plan.will_revert.map(named),
      },
      {
        label: 'Things you deleted that will come back',
        value: figure(consequences.restores_missing),
        names: plan.will_restore.map(named),
      },
      {
        label: 'Old items that will be removed',
        value: figure(consequences.removes_no_longer_shipped),
        names: plan.will_remove.map(named),
      },
      {
        label: 'Things you made yourself, left alone',
        value: figure(consequences.leaves_coach_created_untouched),
        names: [],
      },
    ],
    cancelLabel: 'Leave my library as it is',
  };
}

/**
 * SAID WHEN A RESET WOULD CHANGE NOTHING, and the nought is BRANCHED rather than dropped into a
 * sentence written for a number.
 *
 * Found by reading the rendered card on a fresh library: it said "0 things you made yourself are
 * left alone either way", which is true, useless, and reads as a figure that failed to load — a
 * nought in the middle of the one sentence whose whole job is reassurance. A coach who has made
 * nothing of his own has nothing to be told is safe, so he is told the thing that IS true of him.
 */
function nothingToChangeWords(coachCreated: number): string {
  const opening = 'Your library already matches what the app came with, so this would change nothing.';
  if (coachCreated === 0) {
    return `${opening} You have not added anything of your own yet, so there is nothing else here `
      + 'for it to leave alone.';
  }
  return `${opening} ${counted(coachCreated, 'thing you made yourself is', 'things you made '
    + 'yourself are')} left alone either way.`;
}

/** One record on a consequence list: what he calls it, and which kind it is. */
function named(record: { readonly type: string; readonly name: string }): string {
  const noun = kindNoun(record.type);
  // The SINGULAR of the kind, because this labels one record. Derived from the plural rather than
  // kept as a second table, and the one plural that is not an "s" away from its singular is named.
  const singular = noun === 'intensity curves' ? 'intensity curve' : noun.replace(/s$/u, '');
  return `${record.name ?? 'An unnamed item'} (${singular})`;
}

/** Said while the reset is running. */
export const RESTORING = 'Restoring your library...';

/**
 * WHAT HAPPENED, from the result the core returned.
 *
 * Every figure is read back off what was WRITTEN rather than off the plan that was shown, because
 * the two are computed at different moments and a report built from the plan would tell him what
 * was about to happen even if it had not.
 */
export interface ResetOutcome {
  readonly headline: string;
  readonly detail: string;
  readonly failed: boolean;
}

/** The result shape `resetToDefaults` returns, in the part of it that is read. */
export interface ResetResultReading {
  readonly written: number;
  readonly restored: number;
  readonly reverted: number;
  readonly removed: number;
  readonly kept_coach_created: number;
}

/**
 * What the screen says once the library is back.
 *
 * ONLY WHAT HAPPENED IS REPORTED. Read on the real screen, the sentence said "1 change was undone,
 * 0 items were put back, and 0 old items were removed. 0 things you made yourself were left alone"
 * — three noughts, two of them about things that did not happen and one about something he has none
 * of. Every figure was correct and the sentence was still the wrong sentence.
 *
 * WHAT IS NOT DROPPED: a figure that is not nought is always stated, so the sentence can never be
 * shorter than the truth; and the line about his clients and sessions stays whatever happened,
 * because it is the half he is actually anxious about and it is equally true on every run.
 */
export function describeResetOutcome(result: ResetResultReading): ResetOutcome {
  const happened: string[] = [];
  if (result.reverted > 0) {
    happened.push(`${counted(result.reverted, 'change was', 'changes were')} undone`);
  }
  if (result.restored > 0) {
    happened.push(`${counted(result.restored, 'item was', 'items were')} put back`);
  }
  if (result.removed > 0) {
    happened.push(`${counted(result.removed, 'old item was', 'old items were')} removed`);
  }

  const did = happened.length === 0
    ? 'Nothing needed changing: it already matched.'
    : `${happened.length === 1
      ? happened[0]
      : `${happened.slice(0, -1).join(', ')} and ${happened[happened.length - 1]}`}.`;

  const his = result.kept_coach_created > 0
    ? ` ${counted(result.kept_coach_created, 'thing you made yourself was',
      'things you made yourself were')} left alone.`
    : '';

  return {
    headline: 'Your library is back to what the app came with',
    detail: `${did}${his} Your clients, sessions and diet plans were not touched.`,
    failed: false,
  };
}

/**
 * WHAT THE SCREEN SAYS WHEN THE RESET DID NOT RUN, in the refusal's own words.
 *
 * Carried through unchanged the way this application carries every refusal. The one sentence added
 * is the one he needs and the failure cannot know: that nothing was written. A refusal that leaves
 * him unsure whether his library is half restored is worse than the refusal.
 */
export function describeResetFailure(error: unknown): ResetOutcome {
  const said = error instanceof Error ? error.message : String(error);
  return {
    headline: 'Your library was not restored, and nothing was changed',
    detail: said,
    failed: true,
  };
}

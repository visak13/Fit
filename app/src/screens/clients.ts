/**
 * WHAT THE CLIENT REGISTER SAYS — the whole derivation, and none of the drawing.
 *
 * The register is the list of people the coach trains and the form that adds one. Every judgement
 * about it is decided here, in a plain module a test can assert with no browser and no rendering at
 * all, and `ClientsScreen.tsx` beside it draws the result and holds no decisions. The same split as
 * `screens/removals.ts` and `screens/RemovalsScreen.tsx`, which is the pattern this file copies
 * rather than a shape invented for it.
 *
 * ## NO CLIENT RULE LIVES HERE, AND THAT IS THE POINT
 *
 * `core/model/entities/client.js` is the schema and it is sealed: the field list, the length bounds,
 * the refusal of contact and identifying information BY NAME, and the rule that a reference pointer
 * and its label travel together are all ITS rules. This file does not restate one of them. When the
 * record refuses something, {@link describeRefusal} carries the record's OWN sentence through
 * UNCHANGED and puts a field label in front of it — because a second copy of a rule is a copy that
 * drifts, and a reworded refusal is a sentence the record never agreed to.
 *
 * That is why there is no validation in front of the write. The screen offers the draft to
 * `store.create`, and what comes back is either a committed record or the record's own issues.
 *
 * ## THE ONE SENTENCE THIS SURFACE MUST GET RIGHT
 *
 * **The protected clinical field cannot save yet, and saying so plainly is the whole feature.**
 * What it must never do is accept the text and drop it, store any of the three fields in the clear,
 * or generate a key locally to avoid the message.
 *
 * THE REASON HAS CHANGED, AND SAYING WHICH ONE IS THE POINT. `core/crypto/guard.js` REFUSES to
 * establish key material on a device that has never synchronised, and that refusal is correct:
 * creating a key without first listing what already exists is how two devices end up with two
 * families of ciphertext that cannot read each other — a split reproduced by accident in fifteen
 * minutes of ordinary two-device use. But passes now run and complete, so THAT refusal no longer
 * applies to a device that has backed up: `client-register-source.test.ts` runs a real pass and then
 * saves a note the same path refused before it. What is missing now is the sealing itself — nothing
 * in the interface calls `establishKeyMaterial` or seals a field — and the `has-backed-up` wording
 * below is the one that says so. This file words BOTH states, and the state is read rather than assumed.
 *
 * ## AND THE STATE IS THE BACKUP HISTORY, SAID IN THE HISTORY'S OWN WORDS
 *
 * The fact read here is `hasEverSynchronised` — whether a backup has ever COMPLETED on this device.
 * These sentences used to answer it in the vocabulary the PRESENT-tense backup indicator owns
 * ("connected", "never connected"), one of them borrowed verbatim from `NotConnectedYet`, and the two
 * surfaces were measured contradicting each other on one screen at one instant. `backup-history.ts`
 * carries that transcription and owns the state; `one-question-one-vocabulary.test.ts` fails if either
 * vocabulary crosses back into the other's question.
 *
 * ## WHY THE WAY TO ADMIN IS NAMED IN WORDS RATHER THAN LINKED
 *
 * `app/DESIGN.md` and `shell/trail.ts` both hold the same rule: a destination never appears inside a
 * screen, because two navigation layers that both claim to say where the coach is start disagreeing.
 * Admin is a destination and the rail carries it at every width, so {@link WHERE_TO_CONNECT} NAMES
 * it in his own words instead of drawing a second control that would collide with the first.
 */

import type { BackupHistory } from './backup-history';

// ═══════════════════════════════════════════════════════════════════════════════
// What the core hands over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A client record exactly as the store holds it: an envelope with the content nested under its own
 * key, never merged into it.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED — see
 * `tsconfig.json` — so the shape it needs is stated where it is used. Only the fields this surface
 * reads are named; the rest of the envelope travels past it untouched.
 */
export interface ClientRecord {
  readonly record_id: string;
  readonly content: {
    readonly name: string;
    readonly notes: string;
    /** Plaintext, short, non-clinical. Absent when the coach recorded none. */
    readonly adaptation_flag?: string | null;
    /** False for an archived client. Archived is reachable, never hidden. */
    readonly active: boolean;
  };
}

/**
 * One person on the register, with the one number that helps him recognise them.
 *
 * The count is carried BESIDE the record rather than on it, because it is not a field of a client —
 * it is the answer to `sessionCountForClient`, asked per row. Merging it into the content would
 * invent a field the record does not have and that nothing could ever validate.
 */
export interface RegisterEntry {
  readonly client: ClientRecord;
  readonly sessionCount: number;
}

/** A page of the register exactly as the core paged it. `done` is carried, never dropped. */
export interface RegisterPage {
  readonly items: readonly RegisterEntry[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** What the screen has been told about the register right now. */
export interface RegisterReading {
  readonly page: RegisterPage;
  /** Whether the page was read with archived clients included. Changes what an empty page MEANS. */
  readonly includingArchived: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The standing sentences
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * THERE IS NO TITLE CONSTANT IN THIS FILE, AND THAT IS DELIBERATE.
 *
 * The register is a DESTINATION's own screen, and `shell/navigation.ts` is the one list that says
 * what a destination is called — read by the route table, by the rail and by the bottom bar. A title
 * here would be a second copy of that word, and a second copy is how a screen ends up heading itself
 * something the navigation surface disagrees with. The screen takes its heading from the destination
 * it was routed to. (`removals.ts` keeps a title of its own for the opposite reason: that screen is
 * deliberately not a destination, so no list owns its name.)
 */

/**
 * THE ONE-TIME HINT, and it is the part of this screen most easily got wrong.
 *
 * Once and gently. A note in the ordinary voice of the screen, never a warning band and never a
 * colour that says something is wrong — because nothing IS wrong: he has not made a mistake yet and
 * may never make one. A warning shown on every visit is one he stops reading by the second week, and
 * it would take this sentence with it.
 *
 * Whether it has been seen is remembered on the device — see `clinical-hint.ts`, which owns that
 * half. This file owns the words.
 */
export const CLINICAL_DETAIL_HINT =
  'One thing worth knowing before you start. Keep general notes for how someone trains — what they '
  + 'are working towards, what they find hard, how a session went. Anything medical belongs in the '
  + 'protected field lower down, which is locked, rather than in these notes, which are not.';

/** What the coach presses to say he has read it. An acknowledgement, never a dismissal. */
export const CLINICAL_DETAIL_HINT_ACKNOWLEDGEMENT = 'I understand';

/**
 * WHAT THE ADAPTATION FLAG IS FOR, standing under the field itself rather than shown once.
 *
 * This is ordinary field guidance and it is REQUIRED to be at the point of entry: the recorded
 * decision is that the app advises him, in plain language where he types, to record only what
 * changes the programme and never a diagnosis, a medication or a doctor's note. It is a different
 * sentence from {@link CLINICAL_DETAIL_HINT} and does a different job — that one is shown once and
 * says WHERE clinical detail goes; this one is permanent and says what THIS box is for.
 */
export const ADAPTATION_FLAG_HINT =
  'What changes the programme, in a few words — "knee injury, avoid deep squats". Never a '
  + 'diagnosis, a medication or a doctor\'s note.';

/** How long the record lets the flag be. Read off the schema's own bound, never guessed. */
export const ADAPTATION_FLAG_LIMIT = 120;

/**
 * THE REFUSAL, IN THE WORDS OF THE FACT THIS SCREEN ACTUALLY MEASURED — and it is no longer the core's.
 *
 * It used to be `new NotConnectedYet().userMessage` verbatim, on the sound principle that one refusal
 * should have one author. **The borrowing is what carried the defect across the boundary.** The core's
 * sentence opens "This device has not connected to your Google account yet", which is a claim about the
 * PRESENT connection — a question this screen never asks and cannot answer. What it reads is
 * `hasEverSynchronised`: whether a backup has ever COMPLETED here. Those come apart in both directions,
 * and on the running application the borrowed sentence sat inches under the indicator saying the
 * opposite. See `backup-history.ts` for the transcription.
 *
 * So this says the measured fact and keeps the core's REASONING, which is the half worth having: the
 * refusal exists because a device that has not been in the backup cannot tell whether encryption
 * details already exist, and creating a second set would split the locked notes silently. That
 * argument is `core/crypto/guard.js`'s and it is unchanged; only the opening claim — the one this
 * screen has no measurement for — is now the one it does.
 */
export const NOTHING_HAS_BACKED_UP_HERE_YET =
  'This device has not backed anything up yet, so it cannot tell whether the encryption details for '
  + 'these notes already exist on your other device. It will not make a second set: two sets cannot '
  + 'read each other, and nothing would say so. Back up once from this device and this part opens up. '
  + 'Everything else in the app works normally, and nothing you have already entered is affected.';

/**
 * WHERE TO GO AND DO IT — the half the core's sentence deliberately does not carry.
 *
 * The core says he must connect once and why. It does not and should not know what this
 * application's navigation is called. This adds that and nothing else: it is not a second version of
 * the refusal, it is the direction the refusal is missing. Admin is NAMED rather than linked — see
 * the note at the top of this file.
 *
 * IT NAMES TWO CONTROLS AND CLAIMS NO THIRD, and that is the whole correction s11/a41 made.
 *
 * It used to end "and connect your Google account there", which sent him to Admin to press something
 * Admin does not have and is FORBIDDEN to have: `AdminScreen.tsx` draws no connect act, and
 * `shell/refusal-names-a-real-control.test.ts` actively forbids it from naming the indicator's
 * control words. The instruction and that guard were enforcing opposite things and both were green.
 *
 * SO IT POINTS AT THE SCREEN AND NOT AT A BUTTON, because MEASURED IN A LIVE BROWSER neither place
 * that really holds the connect act can be promised to be on screen when he reads this. The frame
 * indicator's control is `display: none` at rest at >= 840px — `design/console.css` collapses it with
 * the rail, and at 1280 wide at rest it is absent from the ACCESSIBILITY TREE as well as from the
 * paint, returning only on hover or focus. And Setup's own try-it is drawn only once a Google client
 * id has been saved on this device (`SetupScreen.tsx`), which is exactly what a coach who has never
 * connected does not have. BOTH controls are conditional; the two things this sentence names are not.
 * "Admin" is on the rail and the bar at every width, and "Open Setup" is the Admin card's permanent
 * link, both measured painted and in the accessibility tree at rest at 1280 and at 390.
 */
export const WHERE_TO_CONNECT =
  'Open Admin, on the navigation, then Open Setup — connecting your Google account is set up on that '
  + 'screen. Everything else on this page saves on this device straight away, with or without a '
  + 'connection.';

/**
 * WHAT THE PROTECTED FIELD IS, said before he learns he cannot fill it in yet.
 *
 * He is told what it holds and why it is locked, so that the refusal reads as a thing not yet
 * switched on rather than as something broken.
 */
export const PROTECTED_FIELD_PURPOSE =
  'This is the one part of a client record that is locked. It holds a short medical note, a link or '
  + 'a file path pointing at where the real detail lives in your own records, and a name for that '
  + 'pointer. All three are locked together, including the pointer\'s name, because a name like '
  + '"heart-condition.pdf" says the thing on its own.';

/**
 * THE PROMISE THAT MAKES THE REFUSAL SAFE TO BELIEVE.
 *
 * Said out loud because the alternative — a field that quietly took the text and dropped it, or
 * saved it in the clear — is the failure this whole design exists to prevent, and he has no way to
 * check which one happened.
 */
export const NOTHING_IS_KEPT_IN_THE_CLEAR =
  'Until it is switched on, this app will not take that text at all. It will not save it half-way, '
  + 'it will not keep it unlocked, and it will not hold on to it in the background. There is nothing '
  + 'to type into yet, on purpose.';

// ═══════════════════════════════════════════════════════════════════════════════
// The register
// ═══════════════════════════════════════════════════════════════════════════════

/** One person on the register, worded. */
export interface ClientSummary {
  readonly recordId: string;
  /** Their name, which is how he recognises them. Never anything else, because there is nothing else. */
  readonly name: string;
  /** The plaintext adaptation flag, or null. Shown as it was typed; it is his own shorthand. */
  readonly adaptationFlag: string | null;
  /** How many sessions they have done, as words rather than a bare number. */
  readonly sessionWords: string;
  readonly archived: boolean;
  /** The word for an archived client, or null for an active one. The WORD carries it, not a colour. */
  readonly archivedWord: string | null;
}

/** What the whole register says. */
export interface RegisterReport {
  /** How many are on this PAGE. A floor when {@link more} is true, and worded as one. */
  readonly count: number;
  readonly intro: string;
  /** True when there is nobody at all to show, which for a new coach is the first thing he sees. */
  readonly empty: boolean;
  /** True when the page stopped short of the end, so the count is a floor rather than a total. */
  readonly more: boolean;
  readonly moreWords: string | null;
  readonly items: readonly ClientSummary[];
  /** What the archived control says right now. Archived is reachable, never hidden. */
  readonly archivedToggleLabel: string;
  readonly includingArchived: boolean;
}

/** How many sessions, in words. Nought is a state a new client is genuinely in, not a missing value. */
export function sessionWords(count: number): string {
  if (count === 0) return 'No sessions yet';
  return count === 1 ? '1 session' : `${count} sessions`;
}

/** One client, worded. */
export function describeClient(entry: RegisterEntry): ClientSummary {
  const { content } = entry.client;
  const flag = typeof content.adaptation_flag === 'string' && content.adaptation_flag.length > 0
    ? content.adaptation_flag
    : null;
  const archived = content.active !== true;

  return {
    recordId: entry.client.record_id,
    name: content.name,
    adaptationFlag: flag,
    sessionWords: sessionWords(entry.sessionCount),
    archived,
    // The word, not a tone. A colour is lost to a colour-blind reader, to sunlight and to a
    // greyscale screenshot, so it is never the only thing carrying a state.
    archivedWord: archived ? 'Archived' : null,
  };
}

/**
 * Everything the register says, from the page the core handed over.
 *
 * AN EMPTY REGISTER IS THE STATE A NEW COACH SEES FIRST, and it is worded as a welcome with the way
 * to add somebody — never as an error and never as a blank panel. An empty screen that reads as a
 * fault on the very first visit teaches him that this application complains at him, which is the
 * opposite of what it is for.
 *
 * The empty sentence differs by whether archived clients were included, because the two states are
 * different facts: one says nobody is on the register, the other says nobody is on it even counting
 * the people he has put away.
 */
export function describeRegister(reading: RegisterReading): RegisterReport {
  const items = reading.page.items.map(describeClient);
  const empty = items.length === 0;

  return {
    count: items.length,
    intro: registerIntro(items.length, reading.includingArchived),
    empty,
    more: !reading.page.done,
    moreWords: reading.page.done
      ? null
      : 'There are more than these. This shows them in name order, a page at a time.',
    items,
    archivedToggleLabel: reading.includingArchived ? 'Hide archived clients' : 'Show archived clients',
    includingArchived: reading.includingArchived,
  };
}

function registerIntro(count: number, includingArchived: boolean): string {
  if (count === 0) {
    return includingArchived
      ? 'Nobody is on your register, and that includes anyone you have archived. Add the first '
        + 'person you train below.'
      : 'Nobody is on your register yet. Add the first person you train below, and they will appear '
        + 'here. Everything you enter is saved on this device, whether you have a connection or not.';
  }

  const people = count === 1 ? '1 person' : `${count} people`;
  return includingArchived
    ? `${people} on your register, archived clients included.`
    : `${people} on your register.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The form
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What the coach typed, before the record has seen it.
 *
 * THREE FIELDS, and the fourth — the protected clinical field — is deliberately absent from this
 * shape rather than present and ignored. A draft that carried a clinical note this build cannot seal
 * would be a value with nowhere to go, and the one outcome forbidden here is text accepted and
 * silently dropped. When the sealing step lands it adds the field to this interface and the
 * compiler names every place that has to change.
 */
export interface ClientDraft {
  readonly name: string;
  readonly notes: string;
  readonly adaptationFlag: string;
}

/** An empty form. One value, so the screen and its reset cannot disagree about what empty is. */
export const EMPTY_DRAFT: ClientDraft = Object.freeze({ name: '', notes: '', adaptationFlag: '' });

/** The words on each field, in the order they are asked for. */
export const FIELD_LABELS = Object.freeze({
  name: 'Name',
  notes: 'Notes',
  adaptationFlag: 'Adaptation flag',
});

/** What the button says. A person, not a record: he is adding somebody he trains. */
export const REGISTER_BUTTON = 'Add this client';

/** What the form is called, above it. */
export const REGISTER_FORM_TITLE = 'Add a client';

/**
 * One issue the record raised, with a field label in front of it.
 *
 * `message` is the record's own sentence, carried through UNCHANGED. `code` is carried so a test can
 * assert WHICH rule refused rather than matching on prose, and so a reader can tell a typo from a
 * decision — `MINIMISATION` is a decision, and the record says so itself.
 */
export interface RefusedField {
  readonly label: string;
  readonly path: string;
  readonly code: string;
  /** The record's own words. Never reworded here — see the note at the top of this file. */
  readonly message: string;
}

/** What the screen says when a client could not be added. */
export interface RefusalReport {
  readonly headline: string;
  /** Every issue the record raised, in the order it raised them. Nothing is dropped or merged. */
  readonly fields: readonly RefusedField[];
  /**
   * The failure's own text when it was not a validation refusal — a store that would not write, a
   * device out of room. Kept verbatim: he may have to read it out.
   */
  readonly verbatim: string | null;
}

/**
 * The envelope's own prefix on a validation path.
 *
 * MEASURED, not assumed: `store.create` validates the whole RECORD, and the record nests its content
 * under one key rather than merging the two — so a refused name arrives as `content.name` and not as
 * `name`. A screen matching on the bare field name silently labels nothing, and every refusal reaches
 * the coach headed by a machine's word for a box he has typed in.
 */
const CONTENT_PREFIX = 'content.';

/**
 * A field's label from the path the record named it by.
 *
 * The three clinical fields collapse to ONE label, deliberately: they are three parts of one thing
 * to the coach, and telling him that `clinical_reference_label` is wrong would be naming a machine's
 * word for something he has never seen.
 */
export function fieldLabel(path: string): string {
  const field = path.startsWith(CONTENT_PREFIX) ? path.slice(CONTENT_PREFIX.length) : path;

  switch (field) {
    case 'name': return FIELD_LABELS.name;
    case 'notes': return FIELD_LABELS.notes;
    case 'adaptation_flag': return FIELD_LABELS.adaptationFlag;
    case 'clinical_note':
    case 'clinical_reference':
    case 'clinical_reference_label':
      return 'Protected clinical note';
    // A path this screen has no word for is shown as the record named it, IN FULL, rather than
    // swallowed. An issue with no label would be a refusal the coach can see the effect of and not
    // the cause; the whole path is shown because it is then something he can read out.
    default: return path;
  }
}

/** A validation issue as `core/model/issues.js` shapes it, and as `StoreValidationError` carries it. */
interface Issue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** Whether a thrown thing is a refusal carrying the record's own issues. */
function issuesOf(error: unknown): readonly Issue[] | null {
  if (error === null || typeof error !== 'object') return null;
  const held = (error as { issues?: unknown }).issues;
  if (!Array.isArray(held)) return null;
  const issues = held.filter(
    (issue): issue is Issue =>
      issue !== null && typeof issue === 'object'
      && typeof (issue as Issue).path === 'string'
      && typeof (issue as Issue).code === 'string'
      && typeof (issue as Issue).message === 'string',
  );
  return issues.length > 0 ? issues : null;
}

/**
 * The failure's own text, or null. Never parsed for meaning.
 *
 * EXPORTED so that `client-removal.ts` shows a failed archive or a failed removal in the same shape
 * as a failed create, rather than growing a second idea of what "the failure's own words" means. What
 * differs between them is the headline, which is the sentence this application wrote; what must not
 * differ is the part that belongs to whatever actually went wrong.
 */
export function verbatimOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const held = error as { name?: unknown; message?: unknown };
  const message = typeof held.message === 'string' ? held.message : String(error);
  const name = typeof held.name === 'string' ? held.name : 'Error';
  return `${name}: ${message}`;
}

/**
 * Why a client could not be added, in the record's words.
 *
 * The record refuses contact and identifying information BY NAME and hands back a written sentence
 * saying that data never collected cannot leak. That sentence is shown as it was written. This
 * function adds a label and an order and takes nothing away — there is no second sentence anywhere
 * in this file about what the app does not collect, because the record already wrote the only one.
 */
export function describeRefusal(error: unknown): RefusalReport {
  const issues = issuesOf(error);

  if (issues === null) {
    return {
      headline: 'That client could not be saved on this device',
      fields: [],
      verbatim: verbatimOf(error),
    };
  }

  return {
    headline: issues.length === 1
      ? 'That client was not added, and this is why'
      : 'That client was not added, and these are the reasons',
    fields: issues.map((issue) => ({
      label: fieldLabel(issue.path),
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })),
    verbatim: null,
  };
}

/** What the screen says when a client HAS been added. Said once, then gone. */
export function registeredWords(name: string): string {
  return `${name} is on your register and saved on this device.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The protected clinical field
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What is true about this device's ability to lock a clinical note IS THE BACKUP HISTORY, and it is
 * now said in the history's own words — see `backup-history.ts` for the contradiction that forced it.
 *
 * This surface used to answer in `'connected' | 'never-connected'`, which is the vocabulary the
 * PRESENT-tense backup indicator owns, while deriving from a fact about the PAST. The two disagreed on
 * the running application. The state is re-exported under this file's own name for the callers that
 * read a clinical-field state; the words below are the history's, never the connection's.
 *
 * There is no second type here. A `ClinicalFieldState` of its own — even one with identical members —
 * would be a second place for this question to be answered, which is the shape that produced the
 * disagreement in the first place.
 */

/** What the screen says about the protected field. */
export interface ClinicalFieldReport {
  readonly title: string;
  readonly purpose: string;
  /** What is true about this device, in his words. */
  readonly whatHappened: string;
  /** What he can do about it. Always something he can actually cause himself, or null when nothing. */
  readonly whatToDo: string | null;
  /** The promise that nothing is being kept in the clear. Present in EVERY state, never dropped. */
  readonly nothingIsKept: string;
  /**
   * Whether this build can accept clinical text at all. FALSE IN EVERY STATE TODAY, and asserted as
   * false by this module's own suite.
   *
   * That assertion is designed to FAIL the day somebody wires sealing — which is exactly the day the
   * sentences above stop being true and must be rewritten. A limitation described in prose rots
   * silently; a limitation asserted in a test cannot.
   */
  readonly canAccept: false;
}

/** The heading on the protected field, wherever it appears. */
export const PROTECTED_FIELD_TITLE = 'Protected medical note';

/**
 * What the protected field says, for the state this device is actually in.
 *
 * THE STATE IS READ, NOT ASSUMED, and that is the whole reason this takes an argument. The sentence
 * "this device has not connected yet" USED TO BE TRUE OF EVERY DEVICE, and it is not any more: the
 * join from a completed pass to the persisted record landed, so `connected` is a state real devices
 * reach and both branches below are live. A field that went on saying the first one would be telling
 * the coach he cannot do something he can — an absence of an error, and a sentence that quietly
 * stopped being true, which is the failure shape this build keeps meeting.
 * `client-register-source.ts` reads the one fact that answers it, and reads it from the persisted
 * completion rather than taking anybody's word for it.
 */
export function describeClinicalField(state: BackupHistory): ClinicalFieldReport {
  const common = {
    title: PROTECTED_FIELD_TITLE,
    purpose: PROTECTED_FIELD_PURPOSE,
    nothingIsKept: NOTHING_IS_KEPT_IN_THE_CLEAR,
    canAccept: false as const,
  };

  switch (state) {
    case 'unknown':
      return {
        ...common,
        whatHappened:
          'This app is still checking what this device can do. It will say in a moment whether this '
          + 'part is ready.',
        whatToDo: null,
      };

    case 'never-backed-up':
      return {
        ...common,
        // The measured fact, and the core's reasoning for the refusal. See NOTHING_HAS_BACKED_UP_HERE_YET.
        whatHappened: NOTHING_HAS_BACKED_UP_HERE_YET,
        whatToDo: WHERE_TO_CONNECT,
      };

    case 'has-backed-up':
      return {
        ...common,
        // This device HAS backed up, so a sentence sending him to connect would be false. The honest
        // answer is the uncomfortable one: the part that locks these notes is not built.
        //
        // AND IT SAYS "HAS BACKED UP", NOT "IS CONNECTED". That is the fact this screen read — the
        // persisted completion — and it is a fact about the past. Whether Google is reachable now is
        // the indicator's question, asked of the credential, and it answers `no` on this very device
        // the moment he signs out while this sentence stays true. Saying "is connected" here put the
        // two answers on one screen contradicting each other; see `backup-history.ts`.
        whatHappened:
          'This device has backed up to your Google account before, and the part of the app that locks '
          + 'these notes is not finished yet. It is the last piece of this to be built.',
        whatToDo: null,
      };

    default: {
      // A state with no words is a compile error here, which is the point of this clause.
      const unreached: never = state;
      throw new Error(`no words were written for the clinical-field state "${String(unreached)}"`);
    }
  }
}

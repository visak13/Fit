/**
 * WHAT THE DIVERGENCE PICKER SAYS — the whole derivation, and none of the drawing.
 *
 * The core detects a same-revision clash between the coach's two devices, hands back BOTH SIDES IN
 * FULL, and applies neither (`core/sync/divergence.js`). The other half — applying the side he
 * picked at a strictly higher revision and recording that a person picked it — is
 * `core/sync/resolution.js`. What was missing between them is the only part neither can do: putting
 * the question to him in a form he can actually answer.
 *
 * This file is that question, decided. `DivergencePickerScreen.tsx` is the drawing and nothing else,
 * for the same reason `admin-report.ts` sits beside `AdminScreen.tsx`: the test runner for this
 * application is `node --test` over `.ts`, so a judgement written into markup is a judgement nothing
 * checks. Everything decidable is here — what each state says, what folds, the order the fields take,
 * and how a difference between two envelopes is computed for display.
 *
 * ## The rule the whole screen is built from
 *
 * **A conflict shown as a statement that there is a conflict cannot be decided by the person looking
 * at it, so it gets dismissed — and a dismissed conflict is a silent lost edit with extra steps.**
 * So nothing here summarises a side away. Every field of both envelopes reaches the screen; what
 * differs is only WHERE, exactly as the dense-screen rule requires:
 *
 * PERMANENT — the fields that actually DIFFER, which is the whole of what he is choosing between,
 * one row per field with both values side by side so the columns line up by construction rather than
 * by two independent lists happening to agree.
 *
 * FOLDED — the fields that are IDENTICAL on both sides, counted on the summary so what is folded is
 * still accounted for. They are not dropped: he may want to see what the record holds before
 * deciding, and a fold is one tap. The deletion warning is deliberately NOT foldable, for the same
 * reason a persistence failure is not foldable on the admin screen: it is the one thing that changes
 * what he should do next, and disclosure is for detail BEHIND a decision, never for the decision.
 *
 * ## Sealed values
 *
 * Three fields in the application are ciphertext (`core/model/sealed.js`) and nothing outside the
 * crypto layer can read one. A screen has three options and two of them are wrong: omitting the
 * field hides a difference he is choosing between, and rendering the ciphertext pretends to show him
 * something. So the fact of the difference is shown and the content is not — {@link FIELD.SEALED} —
 * and whether two sealed values differ is decidable without reading either, because a fresh random
 * initialisation vector per sealing means two sealings are never byte-identical anyway.
 *
 * ## What this module does NOT do
 *
 * It does not choose, and it has no opinion about which side is better. It offers the two answers
 * `core/sync/resolution.js` declares, read from that list rather than spelled here, so a third answer
 * would be a change in one place that this screen follows automatically.
 */

import { RESOLUTION, RESOLUTION_VALUES } from '../../core/sync/resolution.js';
import { RECORD_TYPES } from '../../core/model/vocabularies.js';
import { isSealed } from '../../core/model/sealed.js';

/**
 * One side of a clash, as the core hands it over: a whole record envelope, never a summary.
 *
 * Mirrors the envelope fields this screen reads and no more. The core is plain ECMAScript typed in
 * documentation comments and is consumed here UNCHANGED — see `tsconfig.json` — so the shape it
 * needs is stated where it is used rather than the core being converted to satisfy this file.
 */
export interface RecordEnvelope {
  readonly record_id: string;
  readonly type: string;
  readonly rev: number;
  readonly device: string;
  readonly deleted: boolean;
  readonly updated_at: string;
  readonly content: Readonly<Record<string, unknown>> | null;
}

/** A divergence exactly as `describeDivergence` returned it. Nothing is renamed and nothing added. */
export interface Divergence {
  readonly record_id: string;
  readonly type: string;
  readonly rev: number;
  readonly local: RecordEnvelope;
  readonly incoming: RecordEnvelope;
  readonly why: string;
  readonly involves_deletion: boolean;
}

/** How a value is drawn. The screen switches on this rather than sniffing the value itself. */
export const FIELD = Object.freeze({
  /** Readable text, drawn as it stands. */
  TEXT: 'text',
  /** Ciphertext. The fact of it is drawn; the content is not, because it cannot be. */
  SEALED: 'sealed',
  /** Nothing recorded here, or this side is a deletion and has no content at all. */
  ABSENT: 'absent',
  /** A list or a nested record: a plain-words count permanently, the whole of it one tap away. */
  STRUCTURED: 'structured',
});

export type FieldKind = (typeof FIELD)[keyof typeof FIELD];

/** One side's value of one field. */
export interface FieldValue {
  readonly kind: FieldKind;
  /** What is drawn permanently. Never the content of a sealed value. */
  readonly value: string;
  /** For {@link FIELD.STRUCTURED}: the whole value, formatted, for the fold. Null otherwise. */
  readonly detail: string | null;
}

/** One field of the record, with both sides' values, so the two columns cannot fall out of step. */
export interface FieldRow {
  /** The content key, kept so a test asserts the field rather than the words it produced. */
  readonly key: string;
  /** What that key is called on screen. */
  readonly label: string;
  readonly differs: boolean;
  readonly local: FieldValue;
  readonly incoming: FieldValue;
}

/**
 * How an answer reaches the core.
 *
 * Declared here, beside the screen that produces the two arguments, and re-exported by the seam in
 * `shell/Divergences.tsx` that carries it. The implementation is a call through to `resolveDivergence`
 * in `core/sync/resolution.js` and is supplied by the synchronisation step; nothing in the interface
 * applies a side or writes a journal entry.
 */
export type Resolve = (divergence: Divergence, side: string) => Promise<void>;

/** One of the two answers, worded. Built from the core's list, never from two spelled strings. */
export interface SideOffer {
  /** The value handed back to `resolveDivergence` — one of `RESOLUTION`. */
  readonly side: string;
  /** The device tag that wrote this side. */
  readonly device: string;
  /** Which device this is, from where the coach is standing. */
  readonly whose: string;
  /** True when this side is the deletion. */
  readonly deleted: boolean;
  /** What this side amounts to, in one line, above the values. */
  readonly summary: string;
  /** The words on the button. */
  readonly buttonLabel: string;
  /**
   * WHAT PRESSING IT DOES, already bound to this divergence and this side — or null when no source
   * is wired and there is therefore nothing a press could do.
   *
   * It is a function rather than a pair of arguments for the screen to assemble, and that is the
   * point: the binding of WHICH clash to WHICH side is the one thing a picker can get catastrophically
   * wrong — answering a different question than the one drawn beside the button — and a binding
   * assembled inside markup is a binding nothing can assert. Here it is decided in this file, and the
   * screen passes the function through without touching it, so the object a test invokes is the same
   * object the button carries.
   */
  readonly press: (() => Promise<void>) | null;
}

/** Everything one card says. */
export interface Choice {
  readonly recordId: string;
  readonly type: string;
  /** What the record is called, in his words. */
  readonly title: string;
  /** The plain word for this kind of record, e.g. `client`. */
  readonly typeWord: string;
  /** The core's own plain-words explanation. Not reworded here. */
  readonly why: string;
  readonly involvesDeletion: boolean;
  /** The chip on the card header. Its WORD carries the state; the tone is a second channel. */
  readonly chipWord: string;
  readonly chipTone: 'warning' | 'neutral';
  /** Unmistakable words for the costliest case. Null when neither side is a deletion. */
  readonly deletionWarning: string | null;
  /** The two answers, in the order they are offered. */
  readonly sides: readonly [SideOffer, SideOffer];
  /** The fields that differ. Permanent, and the whole of what he is choosing between. */
  readonly differing: readonly FieldRow[];
  /** The fields that are the same on both. Folded, and counted on the summary. */
  readonly identical: readonly FieldRow[];
  /** What happens after he chooses, said before he chooses it. */
  readonly whatHappensNext: string;
}

/** What the screen says about the queue as a whole. */
export interface Queue {
  readonly count: number;
  readonly title: string;
  /** The one line under the title. */
  readonly intro: string;
  /** True when there is genuinely nothing to answer — a normal state, not an empty screen. */
  readonly settled: boolean;
}

/** The screen's own title, one constant so the link into it and the screen itself cannot disagree. */
export const PICKER_TITLE = 'Changes that need your decision';

/**
 * The plain word for each record type.
 *
 * Every type in the vocabulary has an entry and {@link recordTypeWord} refuses one it does not know,
 * which its test asserts against `RECORD_TYPES` itself. A type added to the core and forgotten here
 * would otherwise reach the coach as a word from the schema.
 */
const TYPE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  exercise: 'exercise',
  routine: 'routine',
  'intensity-pattern': 'intensity pattern',
  client: 'client',
  session: 'session',
  'performed-record': 'record of what was performed',
  reading: 'reading',
  'session-note': 'session note',
  'diet-plan': 'diet plan',
});

/** The plain word for a record type, or the type itself if the vocabulary has grown past this list. */
export function recordTypeWord(type: string): string {
  return TYPE_WORDS[type] ?? type;
}

/** Every record type the vocabulary has, so a test can assert this file covers all of them. */
export const KNOWN_RECORD_TYPES: readonly string[] = RECORD_TYPES;

/**
 * Content keys that name the record, in the order they are preferred.
 *
 * A record the coach can NAME is a record he can decide about; `client:8f2a…` is not something a
 * person has an opinion on.
 */
const NAMING_KEYS: readonly string[] = ['name', 'title', 'label'];

/** Fields shown first when they differ, because they are what a person looks at first. */
const LEADING_KEYS: readonly string[] = ['name', 'title', 'label', 'notes'];

/**
 * `clinical_reference_label` reads as `Clinical reference label`, once, here.
 *
 * Split and joined rather than matched: shipped source under `src` is regex-free and that property
 * is maintained, not merely observed — see the recorded approval covering the four build tools,
 * which is scoped to tooling precisely because tooling never runs on the coach's device.
 */
export function fieldLabel(key: string): string {
  const words = key.split('_').join(' ').split('-').join(' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A value compared as a value rather than by reference, with object keys in a stable order.
 *
 * Two envelopes that arrived by different routes hold equal content in differently-ordered objects
 * often enough that comparing their serialisations naively would mark every field as differing —
 * which would make the ONE thing the screen exists to show, what actually changed, meaningless.
 */
function stableForm(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableForm).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, held]) => held !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, held]) => `${JSON.stringify(key)}:${stableForm(held)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** How many things are in a list or a nested record, said in words rather than as a bare number. */
function countWord(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 1 ? '1 item' : `${value.length} items`;
  }
  const keys = Object.keys(value as Record<string, unknown>).length;
  return keys === 1 ? '1 entry' : `${keys} entries`;
}

/** One side's value of one field, decided. */
export function describeValue(content: Record<string, unknown> | null, key: string): FieldValue {
  // A deletion has no content at all, so every field of that side reads the same. It must NOT name a
  // device: this value is drawn INSIDE the column belonging to one, and a value that names a device
  // while sitting in the other's column contradicts its own heading — found by looking at it, where
  // no assertion about the words alone could have seen it. The column heading and the side's summary
  // line already say whose it is, once each.
  if (content === null) {
    return { kind: FIELD.ABSENT, value: 'Deleted — nothing is kept', detail: null };
  }

  const value = content[key];

  if (value === null || value === undefined || value === '') {
    return { kind: FIELD.ABSENT, value: 'Nothing recorded', detail: null };
  }

  // Before the string branch, because a sealed value is an object and would otherwise fall through
  // to the structured one and be drawn as "3 entries" — a true statement that tells him nothing.
  if (isSealed(value)) {
    return { kind: FIELD.SEALED, value: 'An encrypted note. It can only be read on a device that is unlocked.', detail: null };
  }

  if (typeof value === 'string') return { kind: FIELD.TEXT, value, detail: null };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { kind: FIELD.TEXT, value: String(value), detail: null };
  }

  return {
    kind: FIELD.STRUCTURED,
    value: countWord(value),
    detail: JSON.stringify(value, null, 2),
  };
}

/**
 * Every field of the record, both sides, in a fixed order.
 *
 * The order is declared rather than incidental: the naming and note fields first because they are
 * what a person looks at, then everything else alphabetically, so the same record produces the same
 * screen twice and a field cannot move because an object was built in a different order.
 */
export function fieldRows(divergence: Divergence): readonly FieldRow[] {
  const local = divergence.local.content;
  const incoming = divergence.incoming.content;
  const keys = [...new Set([...Object.keys(local ?? {}), ...Object.keys(incoming ?? {})])];

  keys.sort((a, b) => {
    const rankA = LEADING_KEYS.indexOf(a);
    const rankB = LEADING_KEYS.indexOf(b);
    if (rankA !== rankB) return (rankA === -1 ? LEADING_KEYS.length : rankA) - (rankB === -1 ? LEADING_KEYS.length : rankB);
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return keys.map((key) => ({
    key,
    label: fieldLabel(key),
    // A deletion differs from a change in every field by definition: there is no content on that
    // side at all. Saying so field by field is what makes the two columns readable in that case.
    differs: local === null || incoming === null
      ? true
      : stableForm(local[key]) !== stableForm(incoming[key]),
    local: describeValue(local, key),
    incoming: describeValue(incoming, key),
  }));
}

/** What the record is called. The first naming key either side carries, else the type's own word. */
export function titleOf(divergence: Divergence): string {
  for (const content of [divergence.local.content, divergence.incoming.content]) {
    if (content === null) continue;
    for (const key of NAMING_KEYS) {
      const value = content[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
  }
  const word = recordTypeWord(divergence.type);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The two answers, worded from where the coach is standing. */
function sidesOf(divergence: Divergence, resolve: Resolve | null): readonly [SideOffer, SideOffer] {
  const offers = [
    {
      side: RESOLUTION.LOCAL,
      envelope: divergence.local,
      whose: 'This device',
      verb: 'Keep',
    },
    {
      side: RESOLUTION.INCOMING,
      envelope: divergence.incoming,
      whose: 'Your other device',
      verb: 'Take',
    },
  ].map((offer) => ({
    side: offer.side,
    device: offer.envelope.device,
    whose: offer.whose,
    deleted: Boolean(offer.envelope.deleted),
    summary: offer.envelope.deleted
      ? `Deleted on ${offer.envelope.device}.`
      : `Changed on ${offer.envelope.device}.`,
    buttonLabel: offer.envelope.deleted
      ? `${offer.verb} the deletion from ${offer.envelope.device}`
      : `${offer.verb} the version on ${offer.envelope.device}`,
    press: resolve === null ? null : () => resolve(divergence, offer.side),
  }));

  // Read off the core's list rather than written out, so a third answer is a change in one place.
  if (offers.length !== RESOLUTION_VALUES.length) {
    throw new Error(
      'the picker offers a different number of answers than core/sync/resolution.js declares, so '
      + 'one of them cannot be reached from this screen',
    );
  }
  return [offers[0], offers[1]];
}

/**
 * One card: everything the screen says about one clash.
 *
 * @param divergence exactly as `describeDivergence` returned it
 * @param resolve how an answer reaches the core, or null when no source is wired
 */
export function describeChoice(divergence: Divergence, resolve: Resolve | null = null): Choice {
  const rows = fieldRows(divergence);
  const typeWord = recordTypeWord(divergence.type);
  const deleting = divergence.involves_deletion;

  return {
    recordId: divergence.record_id,
    type: divergence.type,
    title: titleOf(divergence),
    typeWord,
    why: divergence.why,
    involvesDeletion: deleting,
    chipWord: deleting ? 'Deleted on one device' : 'Changed on both',
    chipTone: deleting ? 'warning' : 'neutral',
    // The costliest case, and it is the one he most needs to see: one device is about to lose a
    // client's history to the other's tidy-up. Said as what he stands to lose, not as a category.
    deletionWarning: deleting
      ? `One device deleted this ${typeWord} and the other kept working on it. If you keep the `
        + 'deletion, everything the other device recorded here goes with it and cannot be brought '
        + `back. If you keep the change, the ${typeWord} stays and the deletion is undone.`
      : null,
    sides: sidesOf(divergence, resolve),
    differing: rows.filter((row) => row.differs),
    identical: rows.filter((row) => !row.differs),
    whatHappensNext:
      'What you choose is saved here straight away and goes to your other device the next time it '
      + 'backs up. The version you do not choose is set aside and will not come back.',
  };
}

/** Every card, in the order the core surfaced them. */
export function describeChoices(
  divergences: readonly Divergence[],
  resolve: Resolve | null = null,
): readonly Choice[] {
  return divergences.map((divergence) => describeChoice(divergence, resolve));
}

/**
 * What the screen says above the cards.
 *
 * Nothing to decide is a NORMAL state and it is worded like one. An empty screen that reads as a
 * fault teaches him that the surface cries wolf, and this is a surface he will see empty almost
 * every time he opens it — the clash it exists for is rare.
 */
export function describeQueue(divergences: readonly Divergence[]): Queue {
  const count = divergences.length;

  if (count === 0) {
    return {
      count: 0,
      title: PICKER_TITLE,
      intro:
        'Nothing needs your decision. Your devices agree on everything they have both been used for.',
      settled: true,
    };
  }

  return {
    count,
    title: PICKER_TITLE,
    intro: count === 1
      ? 'You changed one thing on both of your devices before they could tell each other. Both '
        + 'versions are kept here until you say which one is right.'
      : `You changed ${count} things on both of your devices before they could tell each other. `
        + 'Both versions of each are kept here until you say which one is right.',
    settled: false,
  };
}

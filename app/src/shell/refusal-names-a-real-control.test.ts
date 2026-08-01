/**
 * A REFUSAL MAY NAME ONLY A CONTROL THAT IS ACTUALLY OFFERED IN THE STATE THAT PRODUCED IT.
 *
 * ## The defect, which every test in this build passed straight through
 *
 * The erase gate refused with "Connect to Google and tap Sync, then come back" in EVERY refusing
 * state. s9/a3 pressed through to one in a real browser and went looking for the control; the
 * sentence was describing a screen from memory. Only four of the core's nine reasons name an act at
 * all — `no_network`, `local_failure` and `backup_partly_unreadable` deliberately name none, and the
 * two review codes are a SCREEN rather than a button — so on an ordinary offline device the app was
 * refusing to erase and telling the coach to press something that is not there. That is the
 * borrowed-machine case the erase feature exists for.
 *
 * Every unit test passed because each side was checked against itself: the sentence was asserted to
 * be non-empty and to say the right things about the queue, and the indicator was asserted to draw a
 * control exactly when the table says one exists. NOTHING ASKED WHETHER THE TWO WERE TALKING ABOUT
 * THE SAME SCREEN. Two sentences that contradict each other pass every property check ever written
 * about either one — the same shape s9/a4 found on the standing-facts card.
 *
 * ## So this holds the two against each other, and nothing else
 *
 * For every refusing state this application can reach, the control the refusal NAMES is compared
 * with the acts the indicator OFFERS for the same reason, derived independently through
 * `performedFor` — the indicator's own lookup — rather than restated here.
 *
 * ## WHY A QUOTED NAME IS THE THING IT READS
 *
 * The house rule the refusal now follows is that the name of a control or a screen is QUOTED and
 * nothing else in the sentence ever is. That turns "what does this tell him to press" into something
 * extractable from the FINISHED PROSE — the string that reaches the card — instead of something a
 * reviewer has to notice. A future author who writes `tap "Sync now"` is caught by this file,
 * because "Sync now" is not one of the acts the table offers.
 *
 * ## NOTHING HERE IS HAND-TYPED, and that is the point rather than a style
 *
 * The reasons come from `REASONS` at runtime; the verdicts come from `ERASE_VERDICTS`, which the
 * `EraseVerdict` type is DERIVED FROM, so a fourth verdict cannot exist without appearing here; the
 * control words come from the table. The enumeration is then asserted COMPLETE in both directions —
 * every verdict the module declares is produced, every action code the table holds is reached — and
 * asserted NON-EMPTY and non-uniform, because a matrix that silently collapsed to one cell would
 * pass every rule below while checking nothing. A hand-typed list of states is what let this defect
 * survive: no list anybody typed ever grew the state that was wrong.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { REASONS } from '../../core/status/reasons.js';
import { PERSISTENT_WARNING_MS } from '../../core/status/levels.js';

import { ERASE_VERDICTS, eraseReadiness } from '../platform/google-account.ts';
import type { DeliveryReading, DeliveryReadingOutcome, EraseVerdict } from '../platform/google-account.ts';
import { describeEraseConfirmation } from '../screens/admin-report.ts';

import { ACTION_DESTINATIONS, REMEDY, performedFor, remedyForAction } from './action-destinations.ts';
import { DESTINATIONS } from './navigation';

/**
 * The leading reasons the indicator can be showing, from the core at runtime, plus no reason at all.
 *
 * `null` is a real state and not a filler: everything is backed up, or the caller genuinely has no
 * reason to hand. A refusal must be honest there too.
 */
const LEADING_REASONS: readonly (DeliveryReading['reason'])[] = Object.freeze([
  null,
  ...Object.entries(REASONS).map(([code, reason]) =>
    Object.freeze({ code, action: reason.action })),
]);

/** The state that produces each verdict. Keyed by verdict, and the keys are CHECKED below. */
const FIGURES_FOR_VERDICT: Readonly<Record<string, Omit<DeliveryReading, 'reason'>>> = Object.freeze({
  clear: {
    pending: 0,
    waiting_for_credential: 0,
    rejected: 0,
    ambiguous: 0,
    oldest_undelivered_label: null,
    oldest_undelivered_age_ms: null,
  },
  wait: {
    pending: 2,
    waiting_for_credential: 0,
    rejected: 0,
    ambiguous: 0,
    oldest_undelivered_label: 'the session with Priya',
    oldest_undelivered_age_ms: 60_000,
  },
  decide: {
    pending: 1,
    waiting_for_credential: 0,
    rejected: 1,
    ambiguous: 0,
    oldest_undelivered_label: 'the session with Priya',
    oldest_undelivered_age_ms: PERSISTENT_WARNING_MS,
  },
});

/**
 * THE READING THAT PRODUCES `unknown` — and it has no figures and no reason, which is the state.
 *
 * `unknown` is not a queue shape like the other three. It is the read itself not coming back, so
 * there is nothing to count and no reason being shown beside it. That is exactly why the gate
 * refuses on it: the four zeroes it used to fall back to were read as a device with nothing to lose.
 */
const READ_DID_NOT_COME_BACK = Object.freeze({
  status: 'failed' as const,
  failure: Object.freeze({ stage: 'accountability', errorName: 'Error' }),
});

/** One state this application can be in: a queue shape, and the reason being shown beside it. */
interface Cell {
  readonly verdict: EraseVerdict;
  readonly reading: DeliveryReadingOutcome;
  readonly where: string;
}

/** The reason being shown beside a reading, or null — including when there is no reading at all. */
function reasonOn(reading: DeliveryReadingOutcome): DeliveryReading['reason'] {
  return reading.status === 'failed' ? null : reading.reason;
}

/** Every state, as the cross product of the two runtime enumerations. */
const CELLS: readonly Cell[] = Object.freeze(
  ERASE_VERDICTS.flatMap((verdict) =>
    LEADING_REASONS.map((reason) => {
      const reading: DeliveryReadingOutcome = verdict === 'unknown'
        ? READ_DID_NOT_COME_BACK
        : { status: 'read', ...FIGURES_FOR_VERDICT[verdict], reason };
      return Object.freeze({
        verdict,
        reading,
        where: `${verdict} / reason ${(reason as { code?: string } | null)?.code ?? 'none'}`,
      });
    })),
);

/** What the coach actually reads on the card. The refusal's own field, not the readiness's. */
function sentenceOn(reading: DeliveryReadingOutcome): string {
  const confirmation = describeEraseConfirmation(reading);
  return confirmation.refusal === null
    ? eraseReadiness(reading).whatToDo
    : confirmation.refusal.whatToDo;
}

/** Every name the finished sentence tells him to press or open. The house rule, read back. */
function namesInside(sentence: string): string[] {
  return [...sentence.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('the erase refusal names only controls that exist in the state that produced it', () => {
  it('NAMES NOTHING THE INDICATOR IS NOT OFFERING, in every state this application can reach', () => {
    for (const cell of CELLS) {
      const readiness = eraseReadiness(cell.reading);
      const named = namesInside(sentenceOn(cell.reading));

      // THE LOAD-BEARING ASSERTION, FIRST, so no earlier tally can shadow it: what the words tell
      // him to press is exactly what the gate says is there, and nothing besides.
      assert.deepEqual(
        named,
        readiness.remedy.named === null ? [] : [readiness.remedy.named],
        `${cell.where}: the words name ${JSON.stringify(named)} but the remedy is `
        + `${JSON.stringify(readiness.remedy.named)}`,
      );

      // And that remedy is what the INDICATOR offers for the same reason, looked up the way the
      // indicator looks it up rather than restated here.
      //
      // A CLEAR GATE IS EXEMPT FROM THE SECOND HALF AND NOT THE FIRST. Nothing is outstanding, so
      // there is nothing to remedy however loudly the indicator is offering to connect — the panel's
      // own confirm button is the control in that state. What it may still not do is name one.
      const offered = performedFor(reasonOn(cell.reading)?.action ?? null);
      if (readiness.verdict === 'clear') {
        assert.equal(readiness.remedy.kind, REMEDY.NONE,
          `${cell.where}: nothing is outstanding and the panel still carries a remedy`);
      } else if (readiness.remedy.kind === REMEDY.ACT) {
        assert.notEqual(offered, null, `${cell.where}: named a control the indicator does not draw`);
        assert.equal(readiness.remedy.named, offered?.words,
          `${cell.where}: the refusal and the button say different things`);
      } else {
        assert.equal(offered, null,
          `${cell.where}: an act IS offered here and the refusal failed to name it`);
      }

      if (readiness.remedy.kind === REMEDY.ADDRESS) {
        const code = reasonOn(cell.reading)?.action ?? '';
        assert.equal(readiness.remedy.path, ACTION_DESTINATIONS[code]?.path,
          `${cell.where}: the screen it names is not the one the table addresses`);
      }

      // The honest answer, said plainly — and only where something is being REFUSED. A clear gate
      // names no remedy for the same reason it needs none: nothing is in his way, and the control
      // that panel does offer is its own confirm button. This is the sentence that replaces the
      // invented one, and a refusal that merely went quiet would leave him hunting the screen
      // exactly as before.
      //
      // `unknown` IS EXEMPT FROM THE SENTENCE AND NOT FROM THE RULE. There is no remedy there for a
      // different reason — no reason was read, so none can be looked up — and the honest advice is
      // not "there is nothing you can press" but RELOAD, which names no control of this
      // application's and so still satisfies the naming rule above. It is asserted, not skipped.
      if (readiness.verdict === 'unknown') {
        assert.ok(sentenceOn(cell.reading).toLowerCase().includes('reload'),
          `${cell.where}: an unread status names no control and does not say what to do either: `
          + sentenceOn(cell.reading));
      } else if (readiness.remedy.kind === REMEDY.NONE && readiness.verdict !== 'clear') {
        assert.ok(sentenceOn(cell.reading).includes('nothing here you can press'),
          `${cell.where}: there is no remedy and the words do not say so: ${sentenceOn(cell.reading)}`);
      }
    }
  });

  it('is checking a real matrix rather than one state three times', () => {
    assert.ok(Object.keys(REASONS).length > 0, 'the core declares no reasons at all');
    assert.ok(ERASE_VERDICTS.length > 0, 'the gate declares no verdicts at all');
    assert.equal(CELLS.length, ERASE_VERDICTS.length * LEADING_REASONS.length);
    assert.ok(CELLS.length > 1, 'a single-cell matrix would pass every rule above while checking nothing');

    // All three remedy shapes are genuinely exercised. Without this the rules above could all be
    // holding over one shape — the absence-shaped check's non-vacuity probe, applied to a matrix.
    const kinds = new Set(CELLS.map((cell) => eraseReadiness(cell.reading).remedy.kind));
    assert.deepEqual([...kinds].sort(), [REMEDY.ACT, REMEDY.ADDRESS, REMEDY.NONE].sort(),
      'the matrix never reaches one of the three kinds of remedy');

    // And both outcomes of the rule: a state that names something, and a state that names nothing.
    const naming = CELLS.filter((cell) => namesInside(sentenceOn(cell.reading)).length > 0);
    assert.ok(naming.length > 0, 'no state names a control, so the rule about names never fired');
    assert.ok(naming.length < CELLS.length, 'every state names a control, so the honest-silence half never fired');
  });

  it('COVERS EVERY BRANCH THE CODE CAN PRODUCE, so one added later cannot slip through', () => {
    // Verdicts: the matrix produces every verdict the module declares, and declares every verdict
    // it produces. `EraseVerdict` is derived from `ERASE_VERDICTS`, so a fourth branch cannot be
    // added to the gate without appearing in this enumeration.
    const produced = new Set(CELLS.map((cell) => eraseReadiness(cell.reading).verdict));
    assert.deepEqual([...produced].sort(), [...ERASE_VERDICTS].sort(),
      'a verdict the gate declares is never produced here, or one is produced that it does not declare');

    // Action codes: every destination in the table is reached by some reason in the matrix. A code
    // added to the core and mapped in the table, but produced by no reason, would be a destination
    // this guard has never looked at.
    const reached = new Set(
      LEADING_REASONS.map((reason) => reason?.action).filter((action): action is string => Boolean(action)),
    );
    assert.deepEqual([...reached].sort(), Object.keys(ACTION_DESTINATIONS).sort(),
      'the table and the reasons have come apart, so this guard is not covering every destination');

    // Every address in the table can be NAMED. An address with no title would silently degrade to
    // "there is nothing you can press" in front of him; it fails here instead.
    for (const [code, destination] of Object.entries(ACTION_DESTINATIONS)) {
      if (destination.path === null) continue;
      const remedy = remedyForAction(code);
      assert.equal(remedy.kind, REMEDY.ADDRESS, `${code} addresses a screen but yields no address remedy`);
      assert.ok(remedy.named !== null && remedy.named.length > 0,
        `${code} addresses a screen this application cannot name, so a refusal could not send him there`);
    }
  });

  it('STILL REFUSES, still separates retrying from stopped, and still ends by itself', () => {
    for (const cell of CELLS) {
      const confirmation = describeEraseConfirmation(cell.reading);
      if (cell.verdict === 'clear') {
        assert.equal(confirmation.refusal, null, `${cell.where}: refused with nothing outstanding`);
        continue;
      }

      // A refusal is never bare, in any state, whatever the remedy turned out to be.
      assert.notEqual(confirmation.refusal, null, `${cell.where}: deliverable work and no refusal`);
      assert.ok((confirmation.refusal?.whatIsOutstanding.length ?? 0) > 0, `${cell.where}: nothing outstanding named`);
      assert.ok((confirmation.refusal?.stillRetryingOrStopped.length ?? 0) > 0,
        `${cell.where}: does not say whether it is still retrying or stopped for good`);

      // NO WAY THROUGH AT ALL, and it is the strictest of the four. A `wait` ends by itself and a
      // `decide` can be acknowledged; an unread status has neither, because there is nothing to name
      // and therefore nothing he could have agreed to lose.
      if (cell.verdict === 'unknown') {
        assert.equal(confirmation.confirmLabel, null,
          `${cell.where}: a button was drawn for an erase the gate refuses outright`);
        assert.equal(confirmation.acknowledgeLabel, null,
          `${cell.where}: an override was offered for a reading nobody took`);
        assert.equal(
          /\b\d+ changes?\b/u.test(Object.values(confirmation.refusal ?? {}).join(' ')),
          false,
          `${cell.where}: the refusal quoted a figure over a queue that was never counted`,
        );
      } else if (cell.verdict === 'wait') {
        assert.equal(confirmation.confirmLabel, null, `${cell.where}: a wait offered a way through`);
        assert.equal(confirmation.acknowledgeLabel, null, `${cell.where}: a wait offered an override`);
        // TIME-BOUNDED, in his units and from the ladder's own figure. A lost Google account may not
        // leave him unable to erase a borrowed machine for ever — and it is now the only promise in
        // the sentence when there is no control to name.
        const days = Math.round(PERSISTENT_WARNING_MS / (24 * 60 * 60_000));
        assert.ok(confirmation.refusal?.whatToDo.includes(`after ${days} days`),
          `${cell.where}: the wait does not say when it ends: ${confirmation.refusal?.whatToDo}`);
      } else {
        assert.notEqual(confirmation.acknowledgeLabel, null, `${cell.where}: no way to decide`);
        assert.notEqual(confirmation.confirmLabel, null, `${cell.where}: decided and still no way through`);
      }
    }

    // The exit really opens: the same queue, aged past the ladder's ceiling, stops being a wait —
    // whatever reason is being shown beside it.
    for (const reason of LEADING_REASONS) {
      const stuck: DeliveryReadingOutcome = {
        status: 'read',
        ...FIGURES_FOR_VERDICT.wait,
        oldest_undelivered_age_ms: PERSISTENT_WARNING_MS,
        reason,
      };
      assert.equal(eraseReadiness(stuck).verdict, 'decide',
        'a wait that never becomes a decision is the permanent dead end one level down');
    }
  });

  it('carries no emoji into any of it', () => {
    const everything = CELLS.map((cell) => sentenceOn(cell.reading)).join(' ');
    assert.ok(everything.length > 500, 'and it really did read the sentences rather than empty strings');
    for (const character of [...everything]) {
      assert.ok(character.codePointAt(0)! < 0x2190, `an emoji reached the refusal: ${character}`);
    }
  });

  it('leaves the SCREEN with no opinion of its own about the remedy', () => {
    // One sentence, one owner. The card draws `refusal.whatToDo` and does not reword it — a second
    // opinion drawn in a .tsx is precisely what nothing would check.
    const screen = readFileSync(new URL('../screens/AdminScreen.tsx', import.meta.url), 'utf8');
    assert.ok(screen.includes('refusal.whatToDo'), 'the card no longer draws the refusal it was given');

    for (const destination of Object.values(ACTION_DESTINATIONS)) {
      if (destination.performed === null) continue;
      assert.equal(screen.includes(destination.performed.words), false,
        `AdminScreen.tsx names the control "${destination.performed.words}" itself, which is a second `
        + 'opinion about what is on the indicator');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE SAME RULE, OVER A UNIVERSE NOBODY TYPED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EVERY INSTRUCTION THIS APPLICATION GIVES NAMES A CONTROL OR A SCREEN IT ACTUALLY HAS.
 *
 * ## Why the guard above was not enough, which is the finding rather than the fix
 *
 * Everything above is real, is proven, and reads THREE FILES: `google-account.ts`, `admin-report.ts`
 * and `AdminScreen.tsx`. It has been cited ever since as "refusals name real controls", and what it
 * means is "three named files' refusals name real controls". `screens/removals.ts` was never in its
 * universe, and it told the coach to "Tap Sync" three times — in a file a previous fix had already
 * visited — while this suite stayed green. A GUARD NARROWER THAN THE SENTENCE PEOPLE REMEMBER IT BY
 * is how that recurred, and a wider named list would only move the boundary.
 *
 * ## THE DISCOVERY RULE, STATED SO IT CAN BE ARGUED WITH
 *
 * The universe is DERIVED FROM WHAT THE DEFECT IS, not from where it has been found before: an
 * instruction the coach reads can be authored in any module that writes prose for him, and this build
 * writes such prose in BOTH trees — `core/status/statement.js` addresses him as directly as any
 * screen does. So the universe is EVERY non-test source file under `src/` and `core/`, walked from
 * the filesystem. No path pattern, no file-name shape, no directory list: a rule that could not reach
 * `removals.ts` without naming it would be a named list wearing a discovered-universe costume, and
 * the same is true of one that stops at the `src/` boundary because the awkward file is on the far
 * side of it.
 *
 * ## What is extracted, and why a NAME rather than an imperative
 *
 * An instruction has two independently falsifiable halves — the ACT and the NAME of the thing it acts
 * on — and a sweep aimed at one is blind to the other. "whenever you tap Sync" is grammatical rather
 * than imperative-initial and reads as correct to any matcher and any human skim; the defect is
 * entirely in the referent. So this extracts the REFERENT: an operating verb, then a name, where a
 * name is a quoted string or a capitalised run. "press a curve" names no control and is not a claim
 * about one; "tap Sync" is.
 *
 * ## The inventory is discovered too, or the hole simply moves
 *
 * A hand-typed list of real labels would fail exactly as a hand-typed list of files did. It is the
 * acts the table declares, the destinations the navigation declares, and every short complete string
 * literal the walked universe itself declares — the application's own vocabulary of labels, read back
 * out of the application.
 *
 * Comments are stripped before any of it. Three files in this tree QUOTE the historical defect in
 * their own documentation, and a sweep that read those would red on the record of the fix.
 */

/** The two trees that hold coach-facing prose. Both are walked whole; neither is filtered by name. */
const TREES = ['../../src', '../../core'];

/** One module in the universe: where it is, and everything it says. */
interface Module {
  readonly where: string;
  readonly source: string;
}

/** Every non-test source file in both trees, from the filesystem rather than from a list. */
function everyModule(): readonly Module[] {
  const modules: Module[] = [];
  for (const tree of TREES) {
    const root = fileURLToPath(new URL(tree, import.meta.url));
    for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
      const name = entry.replace(/\\/gu, '/');
      if (!/\.(ts|tsx|js|jsx)$/u.test(name)) continue;
      if (/\.test\.[a-z]+$/u.test(name)) continue;
      modules.push({
        where: `${tree.replace('../../', '')}/${name}`,
        source: readFileSync(`${root}/${entry}`, 'utf8'),
      });
    }
  }
  return modules;
}

/**
 * The prose alone: comments away, adjacent literals joined.
 *
 * BOTH HALVES ARE PAID FOR IN MEASURED DEFECTS. Without the comment strip this reds on this build's
 * own record of the fix — `action-destinations.ts` and `google-account.ts` both quote the erase
 * gate's old sentence in their documentation. Without the join it misses a claim split across the
 * `+` this application wraps nearly every sentence with.
 */
function proseOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/^\s*\/\/.*$/gmu, ' ')
    .replace(/'\s*\+\s*'/gu, '')
    .replace(/"\s*\+\s*"/gu, '')
    .replace(/`\s*\+\s*`/gu, '');
}

/**
 * The verbs that mean "operate a control or open a screen".
 *
 * `open` is here with the other three because a screen is a referent exactly as a button is, and the
 * half of an instruction that goes wrong is the referent either way.
 */
const OPERATING_VERBS = /\b(?:tap|press|click|open)\s+(?:on\s+)?(?:the\s+)?([^.,;:!?)\]]{1,60})/giu;

/**
 * THE SECOND SHAPE, AND IT IS HERE BECAUSE THIS FILE ADMITTED IT COULD NOT SEE IT.
 *
 * `use the X button` puts the name BEFORE the noun instead of after the verb, so the extractor above
 * — aimed at `verb name` — is structurally blind to it however wide its verb list grows.
 * `google-identity.ts` said "Use the Connect button rather than waiting for it to happen on its own"
 * and was found BY EYE rather than by this suite. The blind spot was written down below rather than
 * fixed, which is honest; leaving it written down a second time would not be.
 *
 * A MATCHER AIMED AT ONE SHAPE IS FULLY BLIND TO ANOTHER — the same finding that produced this whole
 * file, met one level in. The capture is lazy up to the noun so the name stops where the label does.
 */
const BUTTON_PHRASING = /\buse\s+(?:the\s+)?([^.,;:!?)\]]{1,60}?)\s+button\b/giu;

/** A name in quotes, whichever pair of quotes the author reached for. */
const QUOTED_NAME = /^["“”'‘’`]([^"“”'‘’`]+)["“”'‘’`]/u;

/**
 * The NAME an instruction points at, or null when it points at no name at all.
 *
 * A quoted run is a name because the house rule says so. An unquoted one is a name only when it
 * starts with a capital, which is what separates "tap Sync" from "press a curve to see what it would
 * make of this routine" — the second instructs an act on no named thing and is not a claim about a
 * control. At most four words: a label is a label, and reading further would swallow the sentence.
 */
function nameAfterVerb(tail: string): string | null {
  const quoted = QUOTED_NAME.exec(tail.trim());
  if (quoted !== null) {
    const inside = quoted[1].trim();
    // See the composed-name note below: quoting a hole does not make it readable at source.
    return inside.startsWith('${') ? null : inside;
  }

  const words = tail.trim().split(/\s+/u).slice(0, 4)
    // The literal's own delimiters travel with the last word when a sentence ends on the name, and a
    // trailing quote turned a real label into a name no file holds.
    .map((word) => word.replace(/^["“”'‘’`]+|["“”'‘’`]+$/gu, ''))
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  // A NAME THIS SWEEP CANNOT SEE, AND SAYING SO IS BETTER THAN GUESSING. A referent composed WHOLLY
  // from an identifier exists in no file, so a source sweep has nothing to compare — the measured
  // rule that painted output is a third instrument rather than a wider version of this one. The
  // module that composes such a name is the thing that must refuse to load without it.
  if (words[0].startsWith('${')) return null;
  if (!/^[A-Z]/u.test(words[0])) return null;
  return words.join(' ');
}

/** One place this application tells the coach to operate something, and what it called it. */
interface Instruction {
  readonly where: string;
  readonly name: string;
  readonly sentence: string;
}

/** Every instruction in one module's prose. */
function instructionsIn(where: string, source: string): Instruction[] {
  const found: Instruction[] = [];
  const prose = proseOf(source);
  for (const shape of [OPERATING_VERBS, BUTTON_PHRASING]) {
    for (const match of prose.matchAll(shape)) {
      const name = nameAfterVerb(match[1]);
      if (name === null) continue;
      found.push({ where, name, sentence: match[0].trim() });
    }
  }
  return found;
}

/**
 * EVERY NAME THIS APPLICATION REALLY HAS, discovered from the application.
 *
 * Three sources and not one of them typed here: the acts `action-destinations.ts` declares, the
 * destinations `navigation.ts` declares, and every short complete string literal the walked universe
 * itself holds — which is where a screen's own heading and a button's own label live. A name absent
 * from all three is a name that exists in no file, which is precisely the defect.
 */
function everyNameThisAppHas(modules: readonly Module[]): ReadonlySet<string> {
  const names = new Set<string>();

  for (const destination of Object.values(ACTION_DESTINATIONS)) {
    if (destination.performed !== null) names.add(destination.performed.words);
  }
  for (const destination of DESTINATIONS) names.add(destination.label);

  for (const module of modules) {
    for (const match of proseOf(module.source).matchAll(/'([^'\n]{1,40})'|"([^"\n]{1,40})"/gu)) {
      const literal = (match[1] ?? match[2]).trim();
      // A label, not a sentence and not a template: something with a full stop in it is prose, and
      // something with a hole in it is not a name anybody could read off a control.
      if (literal.length === 0 || literal.includes('${') || /[.!?]/u.test(literal)) continue;
      names.add(literal);
    }

    // AND THE FIXED HEAD OF EVERY COMPOSED LABEL. `Open ${exercise.name}` is a real control whose
    // full words exist in no file — the same shape as the claim assembled from two identifiers — and
    // its head is the part an instruction can honestly name. Dropping these would report a control
    // the coach presses every day as invented.
    for (const match of proseOf(module.source).matchAll(/`([^`\n$]{1,40})\$\{/gu)) {
      const head = match[1].trim();
      if (head.length > 0 && !/[.!?]/u.test(head)) names.add(head);
    }
  }

  return names;
}

/**
 * Whether the application has this name, allowing for a capture that ran on past the label.
 *
 * The longest prefix wins and any prefix will do: "Back up now on the backup" is the extractor taking
 * four words off a sentence that names a three-word control, and holding that against the inventory
 * would be reporting the extractor rather than the application.
 */
function appHasName(name: string, inventory: ReadonlySet<string>): boolean {
  const words = name.split(/\s+/u);
  for (let take = words.length; take >= 1; take -= 1) {
    if (inventory.has(words.slice(0, take).join(' '))) return true;
  }
  return false;
}

/**
 * WHAT THIS SWEEP CANNOT SEE. Kept here rather than only in a report, because the next person to
 * trust this guard reads the file and not the report, and a green that implies completeness is the
 * failure this whole family of defects is made of.
 *
 * - ~~IT MATCHES `tap X`, NOT `use the X button`.~~ CLOSED. That blindness is what let
 *   `google-identity.ts:327` be found by eye rather than by this suite, and it is now read by
 *   {@link BUTTON_PHRASING}. Kept visible rather than deleted: the shape of what a sweep could not
 *   see is worth more to the next reader than a clean list, and the count below moved with it.
 * - IT CANNOT READ A NAME COMPOSED FROM AN IDENTIFIER. See {@link nameAfterVerb}.
 * - IT IS A SOURCE SWEEP. It says nothing about whether a sentence is painted, and painted output is
 *   a third instrument rather than a wider setting of this one.
 *
 * Each of these is a place the next instance can hide. Widen the guard when you meet one; do not
 * read its green as coverage of them.
 */
const WHAT_THIS_SWEEP_CANNOT_SEE = 2;

/**
 * THE DEBT REGISTER: instructions in this tree that name a control this application does not have.
 *
 * ## READ THIS BEFORE YOU ADD A LINE
 *
 * EVERY ENTRY BELOW IS A LIVE OR LATENT DEFECT THAT IS STILL IN THE TREE. This is not a list of
 * exceptions, a configuration, or a set of files the rule does not apply to. It is a list of
 * sentences that lie to the coach, written down because closing them belongs to somebody who is not
 * the author of this guard. ADDING AN ENTRY HERE IS ADMITTING ONE OF THESE, IN WRITING, WITH YOUR
 * NAME ON THE COMMIT. It is not housekeeping and it is not how you get back to green.
 *
 * If you have arrived here because the assertion below went red: the honest move is to FIX THE
 * SENTENCE. A red here means the application has grown a new instruction naming something it does
 * not have, which is the exact defect that shipped "Connect to Google and tap Sync, then come back"
 * and "Tap Sync" three times on the removals screen.
 *
 * ## IT IS AN EQUALITY, AND THAT IS THE WHOLE DESIGN
 *
 * The unmatched set is asserted EQUAL to this list, never contained by it. So it bites BOTH ways: a
 * new instance reds on arrival, AND fixing one of these without shortening this list ALSO reds. A
 * suppression list only fails in the direction that hides things; this one cannot rot silently in
 * either direction, which is the only reason it is allowed to exist.
 */
interface OwedFix {
  /** Where it is, precisely enough to open. */
  readonly where: string;
  /** What the coach is told to operate. */
  readonly phrase: string;
  /** What the control is REALLY called, so the fix is written down beside the defect. */
  readonly saysInstead: string;
  /** Whether he can meet it today, MEASURED rather than assumed. */
  readonly reach: string;
  /** Whose leg closes it. Not "later" — a name, so this cannot become nobody's. */
  readonly owner: string;
}

/**
 * THE REGISTER IS EMPTY. ALL FIVE ENTRIES THAT EVER STOOD HERE ARE CLOSED, AND EACH WAS SHORTENED
 * OUT OF THE LIST IN THE SAME EDIT THAT FIXED IT, WHICH IS WHAT THE EQUALITY ABOVE EXISTS TO FORCE.
 *
 * THEY ARE KEPT STRUCK THROUGH RATHER THAN DELETED, the way {@link WHAT_THIS_SWEEP_CANNOT_SEE}
 * keeps its closed blind spot: the SHAPE of what this guard could not see, and of what a fix
 * costs, outlives the individual sentence. A clean page teaches the next reader nothing.
 *
 * - ~~`google-identity.ts` :327, :337, :340 and `drive-on-this-device.ts:103` said `tap Sync`.~~
 *   CLOSED by s11/a35 — they now name `"Connect Google"`, which is what `action-destinations.ts`
 *   declares the act to be.
 * - ~~`core/status/statement.js` `PROMISES.backs_up` said "whenever you tap Sync".~~ CLOSED by
 *   s11/a35 — it now reads "whenever you ask it to" and NAMES NO CONTROL AT ALL, which is the
 *   stronger of the two available repairs: a promise that names a button is only true while that
 *   button is on screen. The two assertions that REQUIRED the old wording — `statement.test.js`
 *   and `surface.test.js` — were replaced by opposed pairs rather than re-aimed.
 * - ~~`core/status/statement.js` `BACKUP_OPPORTUNITIES` carried "whenever you tap Sync" as its own
 *   array element, separately from `PROMISES.backs_up`.~~ CLOSED by s11/r3, same file, same class,
 *   one field away from the one a35 corrected — a35 had the file open and REPORTED it rather than
 *   fixing it because it sat outside that action's closed list, correctly. It now reads "whenever
 *   you ask it to". THE LESSON WORTH MORE THAN THE FIX: nothing in `core/status`'s 72 tests
 *   objected to it. `statement.test.js` asserted every opportunity matched `/^(when|every so
 *   often)/` and forbade background/closed/automatic, and "whenever you tap Sync" PASSED BOTH —
 *   the defect was entirely in the REFERENT, which is the axis this guard exists for and the one
 *   the sibling suite had no assertion on. That suite now carries the same opposed pair, in place.
 *
 * IF THIS LIST GROWS AGAIN, read the note above `OwedFix` before you type. An empty register is the
 * only honest end state; a one-item register whose item is fixed is worse than none, because the
 * next reader sees a live debt that is not live.
 */
const STILL_OWED: readonly OwedFix[] = Object.freeze([]);

/** One instruction, keyed by where it is and what it called the thing. */
function keyOf(instruction: { where: string; name: string }): string {
  return `${instruction.where}::${instruction.name.split(/\s+/u)[0]}`;
}

/** The register's own keys, from the entries rather than typed a second time. */
const OWED_KEYS: readonly string[] = Object.freeze(STILL_OWED.map((owed) => {
  const [file] = owed.where.split(':');
  return `${file}::${owed.phrase.split(/\s+/u).slice(-1)[0]}`;
}));

describe('every instruction this application gives names something it actually has', () => {
  const modules = everyModule();
  const inventory = everyNameThisAppHas(modules);
  const instructions = modules.flatMap((module) => instructionsIn(module.where, module.source));

  it('NAMES NOTHING THAT EXISTS IN NO FILE, except what is written down as still owed', () => {
    const invented = instructions.filter((instruction) => !appHasName(instruction.name, inventory));

    assert.deepEqual(
      invented.map(keyOf).sort(),
      [...OWED_KEYS].sort(),
      'THE INSTRUCTIONS THAT NAME NOTHING THIS APPLICATION HAS ARE NO LONGER THE ONES WRITTEN DOWN '
      + 'IN `STILL_OWED`. If this grew, the application has a NEW sentence telling the coach to '
      + 'operate something that does not exist — fix the sentence; adding a line to that list is '
      + 'admitting a live defect in writing, not getting back to green. If it shrank, one was fixed '
      + 'and the register was not shortened — shorten it. Read the note above `STILL_OWED` before '
      + 'doing either. Found: '
      + JSON.stringify(invented.map((one) => `${one.where}: ${one.sentence}`), null, 2),
    );
  });

  it('the debt register says what is owed, to whom, rather than being a list of paths', () => {
    // THE ASSERTION THAT STOOD HERE WAS `STILL_OWED.length > 0`, AND IT WAS A NON-VACUITY PROBE ON
    // THE WRONG QUANTITY. It read "nothing is owed" as "this rule is checking nothing", so the edit
    // that closed the last debt could not be made without redding the guard that proves debts get
    // closed — a register that punishes reaching empty is a register nobody empties. EMPTY IS A
    // REAL STATE. The sweep's own non-vacuity is proven by the test below, over modules,
    // instructions and inventory, which is where it belongs; the loop that follows is a SHAPE guard
    // on whatever entries exist, and it is correct over none.
    for (const owed of STILL_OWED) {
      assert.ok(/:\d+/u.test(owed.where), `${owed.where}: no line number, so nobody can open it`);
      assert.ok(owed.phrase.length > 0 && owed.saysInstead.length > 0,
        `${owed.where}: an entry that does not carry the wrong words AND the right ones is a path, not a debt`);
      assert.ok(owed.reach.length > 20, `${owed.where}: does not say whether the coach can meet it`);
      assert.ok(owed.owner.length > 0, `${owed.where}: owed by nobody, which is how it stays owed`);
    }
    assert.equal(WHAT_THIS_SWEEP_CANNOT_SEE, 2,
      'the known blind spots above were edited without the count being reconsidered');
  });

  it('is sweeping a real universe rather than an empty one', () => {
    // Every absence-shaped check needs its non-vacuity probe in the same run. All three halves can
    // fail independently: no files, no instructions, no inventory.
    assert.ok(modules.length > 100, `only ${modules.length} modules were walked, so the universe is not the tree`);
    assert.ok(instructions.length > 5, `only ${instructions.length} instructions were extracted`);
    assert.ok(inventory.size > 100, `only ${inventory.size} names were discovered`);

    // AND IT REACHES THE FILES THE OLD GUARD COULD NOT SEE. Named as a floor on the walk, not as the
    // universe: the walk is the filesystem's and these are two files it must have arrived at.
    const walked = new Set(modules.map((module) => module.where));
    assert.ok(walked.has('src/screens/removals.ts'), 'the walk never reached the screen the old guard missed');
    assert.ok(walked.has('core/status/statement.js'), 'the walk stopped at the src boundary');
  });

  it('DISCRIMINATES: it catches an invented name and clears a real one', () => {
    // SYNTHETIC, both of them. A fixture lifted out of the tree would point the sweep away from the
    // live offender it was copied from.
    const invented = instructionsIn('fixture', "const a = 'Tap Wobbleplinth to carry on';");
    assert.equal(invented.length, 1, 'the extractor did not see an instruction it was handed');
    assert.equal(invented[0].name.split(' ')[0], 'Wobbleplinth');
    assert.equal(appHasName(invented[0].name, inventory), false,
      'a name no file holds was accepted, so the rule above can never fire');

    const real = instructionsIn('fixture', `const a = 'Tap ${[...inventory].includes('Back up now') ? 'Back up now' : 'Admin'} to carry on';`);
    assert.equal(real.length, 1);
    assert.equal(appHasName(real[0].name, inventory), true,
      'a control this application really offers was reported as invented');
  });

  it('AND IT SEES THE SHAPE IT USED TO BE BLIND TO: `use the X button`, both ways', () => {
    // The widening is worth nothing unless it DISCRIMINATES in this shape too, so both directions
    // are proven here rather than inferred from the sweep going green. SYNTHETIC, as above: a
    // fixture lifted out of the tree would aim this away from the offender it was copied from.
    const invented = instructionsIn('fixture', "const a = 'Use the Wobbleplinth button to carry on';");
    assert.equal(invented.length, 1, 'the extractor is still blind to `use the X button`');
    assert.equal(invented[0].name, 'Wobbleplinth');
    assert.equal(appHasName(invented[0].name, inventory), false,
      'a name no file holds was accepted in the button shape, so the rule above can never fire on it');

    const real = instructionsIn('fixture', "const a = 'Use the \"Connect Google\" button to carry on';");
    assert.equal(real.length, 1);
    assert.equal(appHasName(real[0].name, inventory), true,
      'a control this application really offers was reported as invented in the button shape');

    // And a name with no capital is still not a claim about a control, in this shape as in the
    // other — otherwise the widening would red on every ordinary sentence containing "button".
    assert.deepEqual(instructionsIn('fixture', "const a = 'Use the round button to carry on';"), []);
  });
});

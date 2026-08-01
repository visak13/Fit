/**
 * A READ THAT FAILED, AND THE FENCE THAT KEEPS A RECORD'S BYTES OUT OF WHAT THE SCREEN SAYS ABOUT IT.
 *
 * This module holds NOTHING NEW. Every line of it was written in `screens/journal-source.ts` when
 * s17 fixed the journal, and it is here rather than there because four more surfaces need the same
 * thing and a second copy of a security fence is a fence that gets fixed in one place. The rule this
 * file exists to keep is the one that had already been broken once: the guarantee is stated as a
 * property of the SHAPE, so it has to hold for every value that can arrive rather than for the
 * values that arrive today.
 *
 * ## THE DEFECT ALL OF THIS IS FOR
 *
 * A read rejects, the catch logs to the console and PUBLISHES NOTHING. The surface therefore stays at
 * its empty literal — and in this application an empty literal is not drawn as a blank, it is WORDED
 * AS A REAL CONDITION: "Nobody is on your register yet", "Nothing is waiting", "This app has not
 * checked its own list yet". So a failed read renders as THE MOST REASSURING STATE THE SCREEN OWNS,
 * and it hides in review because the sentence is right for the state the value claims. "Failed" and
 * "empty" were the SAME VALUE.
 *
 * The fix is a TYPE and never a flag: THREE outcomes — not yet, failed, read — mutually exclusive at
 * the type level, so a caller cannot reach the facts without first saying which of the three it is
 * looking at. A boolean bolted beside the existing value re-creates the defect one refactor later,
 * because the next reader of that value is under no obligation to consult the flag.
 *
 * ## WHAT A FAILURE MAY CARRY, AND WHY IT IS SO LITTLE
 *
 * A closed set of stage tags and the CLASS of what was thrown. NEVER THE MESSAGE. An exception
 * message is the one string in this offline application whose contents nobody controls: a store or
 * platform error can quote the key or the row it choked on, and in this application a key is an
 * identity and a row can hold a client's name, a note somebody wrote down, or a diet. The screen is
 * specific about WHAT failed without any of that being reachable, BY CONSTRUCTION rather than by
 * filtering afterwards.
 *
 * AND THE CLASS NAME IS READ OFF THE PROTOTYPE. `thrown.constructor` is an ordinary property lookup,
 * so an OWN `constructor` shadows the prototype's — and `JSON.parse('{"constructor":{"name":"…"}}')`
 * produces exactly that shape. s17/r3 measured a planted client name reaching rendered markup through
 * that hole. Reading the prototype's own constructor and then requiring the result to be
 * identifier-shaped leaves no path from a stored byte to this string.
 *
 * ## WHAT THIS FILE DOES NOT DO
 *
 * It words nothing. A stage tag is a tag; the sentence for it belongs in the screen's own `.ts` words
 * module, where the whole set of a surface's sentences is reviewed together for overclaim. A
 * reassuring sentence written next to the read is the failure that review exists to catch.
 */

/**
 * A read that was attempted and did not come back.
 *
 * Generic in its stage set so each surface declares its OWN closed set of halves and its words module
 * must hold a sentence for every member. One shared union of every stage in the application would be
 * a set no single words module could be complete against.
 */
export interface ReadFailure<Stage extends string = string> {
  readonly stage: Stage;
  /** The CLASS of what was thrown. A class name comes from code, never from a record. */
  readonly errorName: string;
}

/**
 * Is this a name a CLASS DEFINITION could have produced? A short walk, never a pattern over data.
 *
 * The character walk is the same instrument `core/model` uses on anything it did not mint itself, and
 * for the same reason: this string is about to be drawn on screen, and the one thing it may not be is
 * something a record was carrying. A class name is an identifier — letters, digits, `_` and `$` — so
 * a name holding a space, a bracket or a full stop was not one, whatever it was read off.
 */
function looksLikeAClassName(name: string): boolean {
  if (name.length === 0 || name.length > 64) return false;
  for (const character of name) {
    const identifier = (character >= 'a' && character <= 'z')
      || (character >= 'A' && character <= 'Z')
      || (character >= '0' && character <= '9')
      || character === '_'
      || character === '$';
    if (!identifier) return false;
  }
  return true;
}

/**
 * What was thrown, named by its CLASS rather than by anything it was handed. See the header.
 *
 * Nothing in `core/store` throws a data-shaped value today — every rejection there is a
 * `StoreWriteError` — which is why this is a FENCE rather than a repair.
 */
export function nameOfThrown(error: unknown): string {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return 'unknown';

  const prototype = Object.getPrototypeOf(error) as { constructor?: unknown } | null;
  const constructor = prototype === null ? undefined : prototype.constructor;
  const name = typeof (constructor as { name?: unknown } | undefined)?.name === 'string'
    ? (constructor as { name: string }).name
    : '';

  return looksLikeAClassName(name) ? name : 'unknown';
}

/**
 * A rejection from one half of a read, carrying WHICH half and the class of what was thrown.
 *
 * Its own message is FIXED TEXT built from the surface name and the stage tag, both of which come
 * from code. The original is kept as the cause, for the console, which is where a developer looks.
 * Nothing on this object that reaches a {@link ReadFailure} came from data.
 */
export class ReadStageError extends Error {
  readonly stage: string;

  readonly errorName: string;

  constructor(surface: string, stage: string, error: unknown) {
    super(`the ${surface} read failed while reading the ${stage}`, { cause: error });
    this.name = 'ReadStageError';
    this.stage = stage;
    this.errorName = nameOfThrown(error);
  }
}

/**
 * One half of a read, tagged with WHICH half it is so a rejection can say so.
 *
 * @param surface the surface's own word, for the console line only.
 * @param which the stage tag, from that surface's closed set.
 */
export async function inStage<T>(surface: string, which: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    throw new ReadStageError(surface, which, error);
  }
}

/**
 * What may be published about a rejection: the stage and the class, and nothing else at all.
 *
 * @param fallback the stage to report when the rejection did not come through {@link inStage} — a
 * throw from the read's own body rather than from one of its tagged halves.
 */
export function failureFrom<Stage extends string>(
  thrown: unknown,
  fallback: Stage,
): ReadFailure<Stage> {
  return thrown instanceof ReadStageError
    ? Object.freeze({ stage: thrown.stage as Stage, errorName: thrown.errorName })
    : Object.freeze({ stage: fallback, errorName: nameOfThrown(thrown) });
}

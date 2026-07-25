/**
 * WHAT THE ADMIN SCREEN SAYS ABOUT THIS DEVICE — the whole derivation, and none of the drawing.
 *
 * It is separate from the screen for the same reason `sync-indicator.ts` is separate from the chip:
 * this is where the judgements live — which of six states the device is in, which words go with it,
 * and, the one that matters most here, WHAT STAYS ON THE SCREEN AND WHAT FOLDS AWAY. Those are
 * decisions that can be asserted, and a decision buried in a `.tsx` among the markup is a decision
 * nothing checks, because the test runner for this application is `node --test` over `.ts` and it
 * cannot render a component.
 *
 * ## The rule that shapes the split, and it is the dense-screen rule
 *
 * A dense screen stays legible through HIERARCHY AND PROGRESSIVE DISCLOSURE, and never by
 * discarding information. So nothing here is dropped: every field of the record reaches the screen.
 * What differs is only WHERE.
 *
 * PERMANENT — the answer in words, the literal answer the browser gave beside it, any failure, and
 * the sentence about what a grant does not buy. A coach on a video call being asked "did it work"
 * reads those without touching anything.
 *
 * FOLDED — the forensic remainder: the type of that literal value, whether it was already persisted
 * before we asked, when it was asked, and the byte-exact figures. One tap away, counted on the
 * summary so what is folded is still accounted for, and never needed to answer a question he
 * actually has.
 *
 * A failure is deliberately NOT foldable. It is the one field that changes what he should do next.
 */

import type { PersistenceRecord } from '../platform/storage-persistence';

/** One label and the value it names, in the order the screen shows them. */
export interface ReportPair {
  readonly label: string;
  /** True when the value came from the machine verbatim and is drawn as `<code>`. */
  readonly literal: boolean;
  readonly value: string;
}

/**
 * How the answer is drawn as a chip. Only ever `success` or `neutral`: a refusal is not a fault and
 * an unsupported browser is not a fault, and drawing either as a warning would be the application
 * raising its voice about something the coach cannot act on and that costs him nothing while the
 * backup path works. A real failure is loud in words instead, permanently, in its own pair.
 */
export type AnswerTone = 'success' | 'neutral';

export interface PersistenceReport {
  /** The state, named. Kept so a test asserts the branch rather than the sentence it produced. */
  readonly state: 'pending' | 'granted' | 'refused' | 'unsupported' | 'failed' | 'unanswered';
  /** The chip's word. Short enough to read at a glance on a phone. */
  readonly word: string;
  readonly tone: AnswerTone;
  /** What that means for him, in his words rather than the interface's. */
  readonly plainWords: string;
  /** Permanently on screen, under the words. Never empty. */
  readonly permanent: readonly ReportPair[];
  /** One tap away, counted on the summary. */
  readonly folded: readonly ReportPair[];
}

/** The one figure this screen exists to show, and the sentence that gives it its scale. */
export interface StorageReading {
  /** The `.value-display`: what the application is using, rounded to something readable. */
  readonly used: string;
  /** What that is out of, or the plain admission that the browser did not say. */
  readonly capacity: string;
}

const BYTES_PER_GIGABYTE = 1024 ** 3;
const GIGABYTE_DECIMALS = 2;

/** A size a person reads, rather than a size a machine reported. The exact figure is kept too. */
function gigabytes(bytes: number): string {
  return `${(bytes / BYTES_PER_GIGABYTE).toFixed(GIGABYTE_DECIMALS)} GB`;
}

/**
 * The storage figures, or the honest absence of them.
 *
 * `estimate()` is optional in the platform and its numbers are deliberately approximate, so "not
 * reported" is a real answer about this device rather than a hole in the screen — and it is said in
 * words instead of being left as a blank where a number should be.
 */
export function describeStorage(record: PersistenceRecord | null): StorageReading {
  if (record === null || record.usageBytes === null) {
    return {
      used: 'Not reported',
      capacity: 'This browser does not tell the application how much room it is using.',
    };
  }

  if (record.quotaBytes === null) {
    return {
      used: gigabytes(record.usageBytes),
      capacity: 'This browser does not say how much room it allows in total.',
    };
  }

  return {
    used: gigabytes(record.usageBytes),
    capacity: `of the ${gigabytes(record.quotaBytes)} this browser allows the application on this device.`,
  };
}

/** `true` and `'true'` have to stay distinguishable, so the value is shown as it would be written. */
function literalValue(value: boolean | null): string {
  return JSON.stringify(value);
}

/**
 * Everything the screen says about persistence, derived once.
 *
 * A pending record is a real state and not a blank: the request is asynchronous and the screen can
 * be open before it settles, which on a slow device is a second of a screen saying nothing at all
 * about the thing it exists to report.
 */
export function describePersistence(record: PersistenceRecord | null): PersistenceReport {
  if (record === null) {
    return {
      state: 'pending',
      word: 'Still asking',
      tone: 'neutral',
      plainWords:
        'The browser has not answered yet. This takes a moment on the first start after installing.',
      permanent: [{ label: 'What the browser answered', literal: false, value: 'Nothing yet' }],
      folded: [],
    };
  }

  const folded: ReportPair[] = [
    {
      label: 'The type of that answer',
      literal: true,
      value: record.literalAnswerType,
    },
    {
      label: 'Already kept before asking',
      literal: true,
      value: literalValue(record.alreadyPersisted),
    },
    { label: 'Asked at', literal: false, value: record.askedAt },
    {
      label: 'Room used, to the byte',
      literal: false,
      value: record.usageBytes === null ? 'Not reported' : `${record.usageBytes} bytes`,
    },
    {
      label: 'Room allowed, to the byte',
      literal: false,
      value: record.quotaBytes === null ? 'Not reported' : `${record.quotaBytes} bytes`,
    },
  ];

  const answered: ReportPair = {
    label: 'What the browser answered',
    literal: true,
    value: literalValue(record.literalAnswer),
  };

  // A failure stays beside the answer rather than folding with the rest. It is the only field here
  // that changes what the coach should do next, and progressive disclosure is for the detail behind
  // a decision, never for the thing the decision is about.
  const failed: ReportPair[] =
    record.failure === null
      ? []
      : [{ label: 'What went wrong', literal: false, value: record.failure }];

  if (!record.supported) {
    return {
      state: 'unsupported',
      word: 'Cannot be asked',
      tone: 'neutral',
      plainWords:
        'This browser has no way to be asked to keep the data, so it was not asked. Everything still works; keep your backups current.',
      permanent: [answered, ...failed],
      folded,
    };
  }

  if (record.failure !== null) {
    return {
      state: 'failed',
      word: 'The request failed',
      tone: 'neutral',
      plainWords:
        'The browser was asked and something went wrong before it answered. Nothing has been lost by this; keep your backups current.',
      permanent: [answered, ...failed],
      folded,
    };
  }

  if (record.literalAnswer === true) {
    return {
      state: 'granted',
      word: 'Kept',
      tone: 'success',
      plainWords: 'This browser agreed to keep the application data on this device.',
      permanent: [answered],
      folded,
    };
  }

  if (record.literalAnswer === false) {
    return {
      state: 'refused',
      word: 'Not kept',
      tone: 'neutral',
      plainWords:
        'This browser did not agree to keep the data. It may clear it when the device runs short of room, so keep your backups current.',
      permanent: [answered],
      folded,
    };
  }

  return {
    state: 'unanswered',
    word: 'No answer',
    tone: 'neutral',
    plainWords:
      'The browser was asked and gave no answer either way. Keep your backups current.',
    permanent: [answered],
    folded,
  };
}

/**
 * THE SOUND THE SESSION MAKES — output only, browser-native only, and injected so a suite with no
 * browser can drive the refusal, the silence and the success.
 *
 * `exercise-timer.ts` decides WHAT is cued and holds both halves of every cue; this file is the
 * MECHANISM for the audible half, and it is the only file in the application that touches an audio
 * interface. `SessionTimer.tsx` draws the visible half. There was no audio in this build before this
 * action: `speechSynthesis`, `AudioContext` and `Audio(` matched nothing in `src` or `core`.
 *
 * ## OUTPUT ONLY. THE APPLICATION HAS NO MICROPHONE AND ASKS FOR NONE
 *
 * A recorded decision, and the reasoning is in it: browser speech RECOGNITION in Chrome streams audio
 * to a remote server, which breaks the offline-first requirement outright; Safari's support is
 * unreliable; and the offline alternative is shipping an on-device speech model of tens of megabytes
 * with mediocre accuracy in a noisy gym. So voice input is not deferred, it is REJECTED. Nothing here
 * names `getUserMedia`, `mediaDevices`, `MediaRecorder` or `SpeechRecognition`, no permission is
 * requested, and the suite scans this file's own code for every one of those names with the scan
 * pointed at a known positive — because an absent feature and a forgotten one look identical to the
 * next editor, and a microphone prompt in front of a client is not a thing to discover in the field.
 *
 * ## TWO MECHANISMS, BOTH ALREADY IN EVERY BROWSER
 *
 * The countdown beep and the end-of-phase chime are SYNTHESISED by `AudioContext` — an oscillator and
 * a gain ramp, a dozen lines — and the exercise name is spoken by `speechSynthesis`. Neither is a
 * third-party library, neither is an audio file to ship, and neither makes a network call, so both
 * work on a phone with no signal in a basement gym. A beep as an `.mp3` would have been simpler to
 * write and would have added an asset to precache, a decode path, and a file that can 404 on the one
 * device that matters.
 *
 * ## ONE TAP, OFFERED HONESTLY
 *
 * A mobile browser will not make a sound before a user gesture — that is the platform, not a
 * limitation to work around — so the first tap unlocks audio for the session. It is a LABELLED OFFER
 * and never a hidden requirement or a modal in the way: {@link UNLOCK_LABEL} says what it does and
 * {@link UNLOCK_WORDS} says what happens if he never presses it, which is nothing. The application is
 * completely usable by a coach who never taps it, and that is asserted rather than asserted-about.
 *
 * ## IT DEGRADES. IT DOES NOT THROW
 *
 * Speech synthesis is genuinely absent on some browsers and silently VOICELESS on others — a
 * `speechSynthesis` that exists and has no installed voice is an ordinary condition on a fresh Linux
 * profile and on some locked-down Android builds. So a missing voice is a STATE and not an error: it
 * is reported as one, it is shown in words, and nothing retries it in a loop. Every call into a
 * browser interface here is wrapped, and what comes back out is a boolean saying whether it happened.
 * The screen never learns to fear a cue.
 *
 * ## THE POINT OF THE PORT BEING A PORT
 *
 * These suites do not run a browser. {@link AudioPort} is an ordinary object with three methods, so
 * the suite drives a device that works, a device that refuses, a device with no voice and a device
 * that was never asked — and, crucially, it can RECORD what it was asked for. That is what lets the
 * proof that audio is never the only signal be a real proof: {@link recordingAudio} shows the port was
 * genuinely asked and genuinely produced nothing, so a visible transcript that is still complete is
 * evidence rather than a coincidence.
 */

import type { ToneKind } from './exercise-timer';

// ═══════════════════════════════════════════════════════════════════════════════
// The port
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE WHOLE OF WHAT THE SCREEN MAY ASK OF A SPEAKER. Three methods, output only.
 *
 * Every one hands back what HAPPENED rather than nothing, because a cue that silently did not sound is
 * exactly the state the visible counterpart exists for and the screen has to be able to say so.
 */
export interface AudioPort {
  /**
   * Offer the browser the gesture it wants. Called from a real tap and nowhere else.
   *
   * @returns what the device can actually do now, which may be less than was asked for.
   */
  unlock(): Promise<Unlocked>;
  /** Make one of the two sounds. False when the device did not. */
  tone(kind: ToneKind): boolean;
  /** Say some words. False when the device did not — no voice, no interface, or refused. */
  speak(words: string): boolean;
}

/** What a device turned out to be able to do, once actually asked. */
export interface Unlocked {
  /** True when tones can be made. */
  readonly tones: boolean;
  /** True when words can be said. A device can do one and not the other, and often does. */
  readonly speech: boolean;
}

/** Nothing works, said as a value. */
export const NOTHING_UNLOCKED: Unlocked = Object.freeze({ tones: false, speech: false });

// ═══════════════════════════════════════════════════════════════════════════════
// Where the coach stands with the sound
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE FOUR HONEST STATES, and each one is shown in words rather than inferred by him from silence.
 *
 * `not-offered` is the state the session STARTS in and it is not a fault — see the header. `partial` is
 * the one it would be tempting to collapse into `live`, and collapsing it is how a coach ends up
 * waiting for a spoken name on a device that only beeps.
 */
export type AudioStanding = 'not-offered' | 'live' | 'partial' | 'unavailable';

/** What the offer to turn sound on says. It says what it does. */
export const UNLOCK_LABEL = 'Turn the sounds on';

/**
 * WHAT THE OFFER SAYS ABOUT ITSELF, including that declining costs nothing.
 *
 * A hidden requirement would be a coach standing in a gym wondering why a timer he can see is silent.
 * Saying what he loses — nothing — is what makes it an offer.
 */
export const UNLOCK_WORDS =
  'Phones only allow sound after a tap, and leaving this off loses nothing — everything it would '
  + 'say is also written on the screen.';

/** What each state reads as, on the screen, in the coach's words. */
export const STANDING_WORDS: Readonly<Record<AudioStanding, string>> = Object.freeze({
  'not-offered': 'Sounds are off. Everything is written on the screen either way.',
  live: 'Sounds are on: a beep for the last seconds, a chime at the end, and the exercise named.',
  partial: 'Beeps and chimes are on. This browser has no voice installed, so nothing is spoken — the '
    + 'exercise name is written on the screen instead.',
  unavailable: 'This browser will not make a sound for the page. Everything a sound would tell you is '
    + 'written on the screen.',
});

/** Where he stands, from what the device turned out to do. */
export function standingOf(unlocked: Unlocked | null): AudioStanding {
  if (unlocked === null) return 'not-offered';
  if (unlocked.tones && unlocked.speech) return 'live';
  if (unlocked.tones || unlocked.speech) return 'partial';
  return 'unavailable';
}

/** True when there is any point drawing the offer. Once it is live, the offer is done. */
export function offerUnlock(unlocked: Unlocked | null): boolean {
  return unlocked === null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The browser's own two mechanisms
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE MINIMUM OF A BROWSER THIS FILE TOUCHES, declared so it can be handed one that is not a browser.
 *
 * Every member is optional, because the whole point is that a real device may be missing any of them.
 * `webkitAudioContext` is named because iOS Safari carried only the prefixed constructor for years and
 * the coach's own device is an iPhone by a recorded decision.
 */
export interface AudioHost {
  readonly AudioContext?: AudioContextLike;
  readonly webkitAudioContext?: AudioContextLike;
  readonly speechSynthesis?: SpeechLike;
  readonly SpeechSynthesisUtterance?: UtteranceLike;
}

/** As much of `AudioContext` as a beep needs. */
export interface AudioContextLike {
  new (): {
    readonly state?: string;
    readonly destination: unknown;
    readonly currentTime: number;
    resume?: () => Promise<void>;
    createOscillator: () => OscillatorLike;
    createGain: () => GainLike;
  };
}

/** As much of an oscillator as a beep needs. */
export interface OscillatorLike {
  type: string;
  readonly frequency: { value: number };
  connect: (to: unknown) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

/** As much of a gain node as a beep needs: a ramp, so the beep does not click. */
export interface GainLike {
  readonly gain: {
    value: number;
    setValueAtTime: (value: number, when: number) => void;
    exponentialRampToValueAtTime: (value: number, when: number) => void;
  };
  connect: (to: unknown) => void;
}

/** As much of `speechSynthesis` as a spoken name needs. */
export interface SpeechLike {
  getVoices: () => readonly unknown[];
  speak: (utterance: unknown) => void;
  cancel?: () => void;
  /** How a browser says the voice list has arrived. Optional: not every implementation has one. */
  addEventListener?: (kind: string, listener: () => void) => void;
  removeEventListener?: (kind: string, listener: () => void) => void;
}

/**
 * HOW LONG THE VOICE LIST IS GIVEN TO TURN UP, ONCE.
 *
 * MEASURED IN CHROME during the hand walk of this action: `getVoices()` returned an EMPTY LIST at page
 * load and three voices a few seconds later — the list is populated ASYNCHRONOUSLY and the browser
 * announces it with `voiceschanged`. Asking once, at the moment he taps, therefore reports "this
 * browser has no voice installed" on a device that has three, and nothing ever revises it: the coach
 * is told for the rest of the session that his phone cannot speak.
 *
 * A quarter of a second, waited ONCE and bounded, is not the retry loop this file refuses elsewhere —
 * it is asking after the answer can exist. A device that genuinely has no voices simply times out and
 * is reported as `partial`, which is the true answer for it.
 */
const VOICE_WAIT_MS = 250;

/** As much of `SpeechSynthesisUtterance` as a spoken name needs. */
export interface UtteranceLike {
  new (words: string): { rate?: number; volume?: number };
}

/**
 * WHAT EACH SOUND IS, and both are shaped rather than raw.
 *
 * A bare oscillator switched on and off CLICKS at both ends, which on a phone speaker is a worse
 * artefact than the beep is a signal, so each tone ramps its gain down to silence. The countdown is
 * short and higher; the ending is longer, lower and unmistakably a different sound, because a coach
 * who cannot tell the third beep from the end has not been told the exercise finished.
 */
const TONES: Readonly<Record<ToneKind, { hz: number; seconds: number; gain: number }>> = Object.freeze({
  countdown: { hz: 880, seconds: 0.09, gain: 0.2 },
  ended: { hz: 523.25, seconds: 0.55, gain: 0.28 },
});

/**
 * THE REAL PORT, built over whatever the host turns out to have.
 *
 * NOTHING IS CONSTRUCTED UNTIL {@link AudioPort.unlock} IS CALLED, and that is deliberate rather than
 * lazy: constructing an `AudioContext` before a gesture leaves a suspended context on iOS that never
 * resumes, and constructing one at module load would mean every screen in the application carried an
 * audio context whether or not a session was open.
 *
 * EVERY CALL IS WRAPPED. A browser interface that exists is not a browser interface that works — a
 * locked-down profile throws from `createOscillator`, a voiceless install accepts `speak` and says
 * nothing — so the failure of a cue is a `false` and never an exception reaching the screen. There is
 * no retry anywhere in this file: a cue that did not sound is over, its visible half is already drawn,
 * and a loop retrying a voiceless `speak` would be a loop that never ends on the affected devices.
 */
export function browserAudio(host: AudioHost | null): AudioPort {
  if (host === null) return silentAudio();

  let context: InstanceType<AudioContextLike> | null = null;
  let speech: SpeechLike | null = null;
  let utterance: UtteranceLike | null = null;

  return {
    async unlock(): Promise<Unlocked> {
      const Ctor = host.AudioContext ?? host.webkitAudioContext ?? null;
      if (Ctor !== null && context === null) {
        try {
          context = new Ctor();
          // A context created inside a gesture may still arrive suspended on iOS; resuming is what the
          // gesture is for. A rejection here is an ordinary "this device will not", not a failure.
          if (context.state === 'suspended' && typeof context.resume === 'function') {
            await context.resume();
          }
        } catch {
          context = null;
        }
      }

      const voice = host.speechSynthesis ?? null;
      const Utterance = host.SpeechSynthesisUtterance ?? null;
      if (voice !== null && Utterance !== null) {
        try {
          // A `speechSynthesis` WITH NO VOICES accepts everything and says nothing, which is the
          // silent-failure shape this whole file is shaped around. Asking for the voice list is the
          // only way to tell the two apart before a client is waiting for a name nobody says — and
          // waiting once for the list to arrive is what stops that question being asked too early.
          // eslint-disable-next-line no-await-in-loop
          const hasVoice = await voicesArrived(voice);
          speech = hasVoice ? voice : null;
          utterance = speech === null ? null : Utterance;
        } catch {
          speech = null;
          utterance = null;
        }
      }

      return { tones: context !== null, speech: speech !== null && utterance !== null };
    },

    tone(kind: ToneKind): boolean {
      if (context === null) return false;
      const shape = TONES[kind];
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = shape.hz;
        const at = context.currentTime;
        gain.gain.setValueAtTime(shape.gain, at);
        // Down to near-silence rather than to nought: an exponential ramp cannot reach zero, and
        // asking it to is what makes a browser throw here.
        gain.gain.exponentialRampToValueAtTime(0.0001, at + shape.seconds);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + shape.seconds);
        return true;
      } catch {
        return false;
      }
    },

    speak(words: string): boolean {
      if (speech === null || utterance === null || words.trim().length === 0) return false;
      try {
        const said = new utterance(words);
        // Slightly under the default: a name said at the browser's own rate is clipped short by a
        // coach who is already moving, and the whole value of hearing it is not having to look.
        said.rate = 0.95;
        speech.speak(said);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * HAS THE VOICE LIST TURNED UP? Asked once, waited for once, and bounded.
 *
 * Returns immediately when the list is already there, which is every browser that populates it
 * synchronously. Otherwise it waits for the browser's own `voiceschanged` announcement, or for
 * {@link VOICE_WAIT_MS}, whichever comes first — so a device that genuinely has no voices costs a
 * quarter of a second once and is then reported honestly, and a device whose list was simply not
 * ready yet is not libelled for the rest of the session.
 *
 * An implementation with no `addEventListener` gets the plain answer rather than a wait for an event
 * that will never come.
 */
async function voicesArrived(voice: SpeechLike): Promise<boolean> {
  if (voice.getVoices().length > 0) return true;
  // Held in a local, because the narrowing above does not survive into the callback below.
  const listen = voice.addEventListener;
  if (typeof listen !== 'function') return false;

  await new Promise<void>((settle) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      voice.removeEventListener?.('voiceschanged', finish);
      settle();
    };
    listen.call(voice, 'voiceschanged', finish);
    setTimeout(finish, VOICE_WAIT_MS);
  });

  return voice.getVoices().length > 0;
}

/**
 * PLAY THE AUDIBLE HALF OF ONE CUE — the ONE seam between what was cued and what makes a noise.
 *
 * One place, so no control can grow its own quieter handling: a cue arrives with both halves already
 * decided by `exercise-timer.ts`, the visible half is drawn by the screen whatever happens here, and
 * this returns whether the audible half actually came out. The screen does not branch on the answer to
 * decide what to draw — it draws the visible half either way, which is the property that makes a muted
 * phone lose nothing — and uses it only to say honestly where he stands with the sound.
 */
export function soundCue(port: AudioPort, cue: {
  readonly heard: { readonly tone: ToneKind | null; readonly words: string | null };
}): boolean {
  const tone = cue.heard.tone === null ? false : port.tone(cue.heard.tone);
  const spoken = cue.heard.words === null ? false : port.speak(cue.heard.words);
  return tone || spoken;
}

/**
 * THE PORT FOR A DEVICE THAT MAKES NO SOUND — and it is not only the fallback.
 *
 * It is what a coach who never taps the offer has, and it is what the suite uses to prove the session
 * is fully runnable with the audio path disabled outright. Everything it is asked for it declines,
 * honestly, and nothing anywhere handles that as an error.
 */
export function silentAudio(): AudioPort {
  return {
    async unlock(): Promise<Unlocked> {
      return NOTHING_UNLOCKED;
    },
    tone(): boolean {
      return false;
    },
    speak(): boolean {
      return false;
    },
  };
}

/**
 * A PORT THAT WRITES DOWN WHAT IT WAS ASKED FOR, wrapped round any other.
 *
 * This exists so that "the session is still complete with no sound" is EVIDENCE rather than an
 * assumption. A test that simply passes {@link silentAudio} and finds the screen readable has proved
 * nothing about whether the audio path was ever reached: a guard that was never exercised and a guard
 * that held look identical. Wrapping records both halves — `asked` says the cues really did travel to
 * the mechanism, and `did` says the mechanism really produced nothing — so the disabling is confirmed
 * to have applied before anything is concluded from it.
 *
 * It is a testing seam and the screen never builds one. Kept beside the port it wraps rather than in
 * the suite, because it is part of what the port PROMISES.
 */
export function recordingAudio(inner: AudioPort): AudioPort & {
  readonly asked: readonly string[];
  readonly did: readonly string[];
} {
  const asked: string[] = [];
  const did: string[] = [];
  return {
    asked,
    did,
    async unlock(): Promise<Unlocked> {
      asked.push('unlock');
      const out = await inner.unlock();
      if (out.tones || out.speech) did.push('unlock');
      return out;
    },
    tone(kind: ToneKind): boolean {
      asked.push(`tone:${kind}`);
      const out = inner.tone(kind);
      if (out) did.push(`tone:${kind}`);
      return out;
    },
    speak(words: string): boolean {
      asked.push(`speak:${words}`);
      const out = inner.speak(words);
      if (out) did.push(`speak:${words}`);
      return out;
    },
  };
}

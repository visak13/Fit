/**
 * THE SOUND THE SESSION MAKES — asserted with no browser, which is the whole reason the port is a port.
 *
 * These suites do not run a browser, and audio is the part of an interface most tempting to leave
 * unasserted for exactly that reason: a beep cannot be heard by a test runner. So `session-audio.ts`
 * takes the browser as an ORDINARY ARGUMENT, and every device this file drives is a plain object —
 * a device that works, one with no audio interface at all, one whose speech synthesis exists and has
 * NO VOICE INSTALLED, and one that throws from inside. All four are real conditions on real phones.
 *
 * ## THE TWO ABSENCES THAT MATTER MOST HERE
 *
 * **No microphone, ever.** Voice input is not deferred, it is REJECTED by a recorded decision. The scan
 * for it reads this module's own code and is pointed at a known positive, because an absent feature and
 * a forgotten one look identical to the next editor — and the failure mode is a permission prompt in
 * front of a client.
 *
 * **Nothing is a file and nothing is a network call.** Both mechanisms are the browser's own, so the
 * cues work on a phone with no signal in a basement gym. Asserted on the code, pointed at positives.
 *
 * ## AND SPEECH DEGRADES RATHER THAN THROWING
 *
 * A voiceless `speechSynthesis` ACCEPTS everything and says nothing, which is the silent-failure shape
 * this file is built around. It is driven here as its own device and required to be reported as a state
 * — `partial` — with words for the coach, and required not to be retried.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { openingCue, targetCue } from './exercise-timer';
import {
  NOTHING_UNLOCKED, STANDING_WORDS, UNLOCK_LABEL, UNLOCK_WORDS, browserAudio, offerUnlock,
  recordingAudio, silentAudio, soundCue, standingOf,
} from './session-audio';
import type { AudioHost, AudioStanding } from './session-audio';

const here = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Four devices, none of them a browser
// ═══════════════════════════════════════════════════════════════════════════════

/** What a fake device wrote down about being used. */
interface Watched {
  readonly oscillators: { type: string; hz: number; started: number; stopped: number }[];
  readonly said: string[];
  readonly resumed: number[];
}

/**
 * A DEVICE THAT WORKS, and it records enough to prove a beep was actually SHAPED rather than merely
 * requested — the frequency, the start and the stop. A test that only checked `tone()` returned true
 * would pass against a method that did nothing.
 */
function aWorkingDevice(options: {
  voices?: number; throwsFromOscillator?: boolean; throwsFromSpeak?: boolean;
  suspended?: boolean; throwsFromContext?: boolean;
} = {}): { host: AudioHost; watched: Watched } {
  const watched: Watched = { oscillators: [], said: [], resumed: [] };
  const voices = options.voices ?? 2;

  class FakeContext {
    state = options.suspended === true ? 'suspended' : 'running';

    destination = { it: 'is the speaker' };

    currentTime = 0;

    constructor() {
      if (options.throwsFromContext === true) throw new Error('this profile forbids audio');
    }

    async resume(): Promise<void> {
      watched.resumed.push(1);
      this.state = 'running';
    }

    createOscillator() {
      if (options.throwsFromOscillator === true) throw new Error('no oscillator for you');
      const made = { type: '', hz: 0, started: -1, stopped: -1 };
      watched.oscillators.push(made);
      return {
        set type(value: string) { made.type = value; },
        get type() { return made.type; },
        frequency: { set value(hz: number) { made.hz = hz; }, get value() { return made.hz; } },
        connect() { /* the graph is not what this suite is about */ },
        start(when = 0) { made.started = when; },
        stop(when = 0) { made.stopped = when; },
      };
    }

    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() { /* recorded by the oscillator above */ },
          exponentialRampToValueAtTime() { /* the ramp is why a beep does not click */ },
        },
        connect() { /* as above */ },
      };
    }
  }

  /**
   * A parameter PROPERTY (`constructor(public words: string)`) is deliberately not used here: Node
   * strips types rather than compiling them, so a parameter property is a syntax error at load and the
   * whole suite fails to parse. Written out longhand, it runs everywhere this gate does.
   */
  class FakeUtterance {
    rate = 1;

    volume = 1;

    words: string;

    constructor(words: string) {
      this.words = words;
    }
  }

  const host: AudioHost = {
    AudioContext: FakeContext as never,
    speechSynthesis: {
      getVoices: () => Array.from({ length: voices }, (_, at) => ({ name: `voice ${at}` })),
      speak: (utterance: unknown) => {
        if (options.throwsFromSpeak === true) throw new Error('speech is not available');
        watched.said.push((utterance as FakeUtterance).words);
      },
    },
    SpeechSynthesisUtterance: FakeUtterance as never,
  };

  return { host, watched };
}

/** A device with no audio interface at all. A locked-down browser, or a very old one. */
const NOTHING_AT_ALL: AudioHost = Object.freeze({});

// ═══════════════════════════════════════════════════════════════════════════════

describe('the one tap, offered honestly', () => {
  it('is drawn only while the device has not been asked, and never again after', () => {
    assert.equal(offerUnlock(null), true);
    assert.equal(offerUnlock({ tones: true, speech: true }), false);
    assert.equal(offerUnlock(NOTHING_UNLOCKED), false,
      'the offer is drawn again on a device that has already said it will not make a sound');
  });

  it('says what it does, and that declining it costs nothing', () => {
    assert.match(UNLOCK_LABEL, /sound/iu);
    // A HIDDEN REQUIREMENT would be a coach in a gym wondering why a timer he can see is silent.
    assert.match(UNLOCK_WORDS, /tap/iu);
    assert.match(UNLOCK_WORDS, /written on the screen/iu);
    assert.match(UNLOCK_WORDS, /loses nothing/iu);
  });

  it('has honest words for all four states, and none of them reads as a fault', () => {
    const every: AudioStanding[] = ['not-offered', 'live', 'partial', 'unavailable'];
    for (const standing of every) {
      const words = STANDING_WORDS[standing];
      assert.equal(words.trim().length > 0, true, `${standing} has no words`);
      for (const blaming of ['error', 'failed', 'unsupported', 'sorry', 'problem']) {
        assert.equal(words.toLowerCase().includes(blaming), false,
          `"${standing}" reads as a fault: it says "${blaming}"`);
      }
    }
    // The three that make no sound all say where to read what he cannot hear.
    for (const standing of ['not-offered', 'partial', 'unavailable'] as AudioStanding[]) {
      assert.match(STANDING_WORDS[standing], /screen/iu,
        `${standing} does not tell him the same thing is written down`);
    }
    // The same reading, pointed at words that genuinely blame the device.
    assert.equal('audio failed'.includes('failed'), true);
  });

  it('reads the standing off what the device turned out to do, and keeps PARTIAL separate', () => {
    assert.equal(standingOf(null), 'not-offered');
    assert.equal(standingOf({ tones: true, speech: true }), 'live');
    // COLLAPSING THIS INTO `live` is how a coach ends up waiting for a spoken name on a device that
    // only beeps.
    assert.equal(standingOf({ tones: true, speech: false }), 'partial');
    assert.equal(standingOf({ tones: false, speech: true }), 'partial');
    assert.equal(standingOf(NOTHING_UNLOCKED), 'unavailable');
  });
});

describe('the browser\'s own two mechanisms, driven with no browser', () => {
  it('makes no sound before it is unlocked, and constructs nothing either', async () => {
    const { host, watched } = aWorkingDevice();
    const port = browserAudio(host);

    // NOTHING IS CONSTRUCTED UNTIL HE TAPS. An `AudioContext` built before a gesture is a suspended
    // context that never resumes on iOS.
    assert.equal(port.tone('countdown'), false, 'it made a sound with no gesture behind it');
    assert.equal(port.speak('Plank hold'), false);
    assert.deepEqual(watched.oscillators, []);
    assert.deepEqual(watched.said, []);

    // AND AFTER THE TAP it works — the known positive without which the three lines above are a test
    // of a broken port.
    const unlocked = await port.unlock();
    assert.deepEqual(unlocked, { tones: true, speech: true });
    assert.equal(port.tone('countdown'), true);
  });

  it('SHAPES each tone rather than merely claiming one, and the two are plainly different', async () => {
    const { host, watched } = aWorkingDevice();
    const port = browserAudio(host);
    await port.unlock();

    assert.equal(port.tone('countdown'), true);
    assert.equal(port.tone('ended'), true);
    assert.equal(watched.oscillators.length, 2, 'a tone was reported without an oscillator behind it');

    const [beep, chime] = watched.oscillators;
    assert.equal(beep.type, 'sine');
    assert.equal(beep.hz > 0, true);
    assert.equal(beep.stopped > beep.started, true, 'the beep never stops');
    // A COACH WHO CANNOT TELL THE THIRD BEEP FROM THE END has not been told the exercise finished.
    assert.notEqual(beep.hz, chime.hz);
    assert.equal(chime.stopped - chime.started > beep.stopped - beep.started, true,
      'the ending is no longer than a countdown beep, so the two sound like each other');
  });

  it('resumes a context that arrives suspended, which is what the gesture is for', async () => {
    const { host, watched } = aWorkingDevice({ suspended: true });
    const port = browserAudio(host);
    const unlocked = await port.unlock();

    assert.deepEqual(watched.resumed, [1], 'a suspended context was never resumed');
    assert.equal(unlocked.tones, true);
  });

  it('says the words, and says them once', async () => {
    const { host, watched } = aWorkingDevice();
    const port = browserAudio(host);
    await port.unlock();

    assert.equal(port.speak('Plank hold'), true);
    assert.deepEqual(watched.said, ['Plank hold']);
  });

  it('says nothing for empty words rather than queueing an empty utterance', async () => {
    const { host, watched } = aWorkingDevice();
    const port = browserAudio(host);
    await port.unlock();

    assert.equal(port.speak('   '), false);
    assert.deepEqual(watched.said, []);
  });
});

describe('IT DEGRADES. IT DOES NOT THROW', () => {
  it('reports a browser with no audio interface at all, and makes no sound', async () => {
    const port = browserAudio(NOTHING_AT_ALL);
    const unlocked = await port.unlock();

    assert.deepEqual(unlocked, NOTHING_UNLOCKED);
    assert.equal(standingOf(unlocked), 'unavailable');
    assert.equal(port.tone('ended'), false);
    assert.equal(port.speak('Plank hold'), false);
  });

  it('reports a speechSynthesis WITH NO VOICE INSTALLED as silent, not as working', async () => {
    // THE SILENT-FAILURE SHAPE THIS WHOLE FILE IS BUILT AROUND: it accepts `speak` and says nothing.
    // A fresh Linux profile and some locked-down Android builds are genuinely like this.
    const { host, watched } = aWorkingDevice({ voices: 0 });
    const port = browserAudio(host);
    const unlocked = await port.unlock();

    assert.deepEqual(unlocked, { tones: true, speech: false });
    assert.equal(standingOf(unlocked), 'partial');
    assert.equal(port.speak('Plank hold'), false,
      'a voiceless device reported that it said something');
    assert.deepEqual(watched.said, [], 'words were handed to a synthesiser with no voice to say them');
    // AND THE COACH IS TOLD, in words that name the consequence.
    assert.match(STANDING_WORDS.partial, /no voice/iu);
    assert.match(STANDING_WORDS.partial, /written on the screen/iu);
    // The beeps still work, which is what `partial` means and why it is not `unavailable`.
    assert.equal(port.tone('countdown'), true);
  });

  /**
   * THE VOICE LIST ARRIVES LATE, and asking once at the moment he taps gets the wrong answer.
   *
   * MEASURED IN CHROME during this action's hand walk: `getVoices()` returned an EMPTY LIST at page
   * load and three voices a few seconds later. A device with three installed voices was therefore
   * about to be reported to the coach as having none, for the rest of the session, with no revision.
   * No suite could have found this — a synchronous fake always answers immediately.
   */
  it('waits ONCE for a voice list that arrives late, rather than libelling the device', async () => {
    const { host, watched } = aWorkingDevice({ voices: 0 });
    let announce: (() => void) | null = null;
    let voices = 0;
    const speech = host.speechSynthesis as never as {
      getVoices: () => readonly unknown[];
      addEventListener: (kind: string, listener: () => void) => void;
      removeEventListener: (kind: string, listener: () => void) => void;
    };
    speech.getVoices = () => Array.from({ length: voices }, () => ({ name: 'a voice' }));
    speech.addEventListener = (kind, listener) => {
      if (kind === 'voiceschanged') announce = listener;
    };
    speech.removeEventListener = () => { announce = null; };

    const port = browserAudio(host);
    const unlocking = port.unlock();
    // THE BROWSER ANNOUNCES THE LIST, a moment after the tap — which is exactly what Chrome does.
    await new Promise((settle) => { setTimeout(settle, 20); });
    voices = 3;
    (announce as never as () => void)();

    const unlocked = await unlocking;
    assert.equal(unlocked.speech, true,
      'a device whose voice list arrived a moment late was reported as having no voice at all');
    assert.equal(standingOf(unlocked), 'live');
    assert.equal(port.speak('Dead Hang'), true);
    assert.deepEqual(watched.said, ['Dead Hang']);
  });

  it('gives up on the voice list rather than hanging, when it never arrives', async () => {
    // A device that genuinely has none. It must cost a bounded wait ONCE and then be reported
    // honestly, not wait forever for an event that is not coming.
    const { host } = aWorkingDevice({ voices: 0 });
    const speech = host.speechSynthesis as never as {
      addEventListener: (kind: string, listener: () => void) => void;
    };
    speech.addEventListener = () => { /* announced never */ };

    const port = browserAudio(host);
    const unlocked = await port.unlock();

    assert.equal(unlocked.speech, false);
    assert.equal(unlocked.tones, true);
    assert.equal(standingOf(unlocked), 'partial');
  });

  it('does not wait at all for an implementation with no way to announce', async () => {
    // No `addEventListener` at all: the plain answer, with no wait for an event that cannot come.
    const { host } = aWorkingDevice({ voices: 0 });
    const port = browserAudio(host);
    assert.equal((await port.unlock()).speech, false);
  });

  it('does not throw when the device throws, in any of the three places it can', async () => {
    const thrower = browserAudio(aWorkingDevice({ throwsFromContext: true }).host);
    const unlocked = await thrower.unlock();
    assert.equal(unlocked.tones, false, 'a context that threw was reported as usable');
    assert.equal(thrower.tone('ended'), false);

    const oscillator = browserAudio(aWorkingDevice({ throwsFromOscillator: true }).host);
    await oscillator.unlock();
    assert.equal(oscillator.tone('countdown'), false);

    const speaker = browserAudio(aWorkingDevice({ throwsFromSpeak: true }).host);
    await speaker.unlock();
    assert.equal(speaker.speak('Plank hold'), false);
  });

  it('does not RETRY a cue that did not come out', async () => {
    // A loop retrying a voiceless `speak` is a loop that never ends on the affected devices, and a
    // missing voice is an ordinary condition rather than a transient one.
    const { host, watched } = aWorkingDevice({ voices: 0 });
    const port = browserAudio(host);
    await port.unlock();

    for (let asked = 0; asked < 5; asked += 1) port.speak('Plank hold');
    assert.deepEqual(watched.said, [], 'a voiceless synthesiser was spoken to at all');

    // AND THE SAME, POINTED AT A DEVICE THAT WORKS: five asks are five utterances and never more,
    // which is what says the count above is a count of retries rather than of nothing.
    const working = aWorkingDevice();
    const good = browserAudio(working.host);
    await good.unlock();
    for (let asked = 0; asked < 5; asked += 1) good.speak('Plank hold');
    assert.equal(working.watched.said.length, 5);
  });

  it('handles a host of null, which is what a page rendered without a window is', async () => {
    const port = browserAudio(null);
    assert.deepEqual(await port.unlock(), NOTHING_UNLOCKED);
    assert.equal(port.tone('ended'), false);
  });
});

describe('the one seam between a cue and a noise', () => {
  it('asks for the tone a cue names, and the words a cue names', async () => {
    const { host, watched } = aWorkingDevice();
    const port = browserAudio(host);
    await port.unlock();

    assert.equal(soundCue(port, openingCue('work', 'Plank hold', 45)), true);
    assert.deepEqual(watched.said, ['Plank hold'], 'the opening cue said the wrong thing');
    assert.deepEqual(watched.oscillators, [], 'the opening cue made a beep it never asked for');

    assert.equal(soundCue(port, targetCue(12)), true);
    assert.equal(watched.oscillators.length, 1, 'the count cue made no sound');
  });

  it('reports honestly that nothing came out, without that being an error anywhere', () => {
    const port = silentAudio();
    assert.equal(soundCue(port, openingCue('work', 'Plank hold', 45)), false);
    assert.equal(soundCue(port, targetCue(12)), false);
  });
});

describe('the recording wrapper, which is what makes a silent run into evidence', () => {
  it('writes down what it was asked for AND what actually happened, and they can differ', async () => {
    const refusing = recordingAudio(silentAudio());
    await refusing.unlock();
    refusing.tone('countdown');
    refusing.speak('Plank hold');

    assert.deepEqual(refusing.asked, ['unlock', 'tone:countdown', 'speak:Plank hold']);
    assert.deepEqual(refusing.did, [], 'a silent port was recorded as having done something');

    // THE SAME WRAPPER OVER A DEVICE THAT WORKS, which is what says `did` being empty above means
    // the mechanism refused rather than that the wrapper never fills it.
    const working = recordingAudio(browserAudio(aWorkingDevice().host));
    await working.unlock();
    working.tone('countdown');
    working.speak('Plank hold');
    assert.deepEqual(working.asked, working.did as string[]);
    assert.equal(working.did.length, 3);
  });
});

describe('OUTPUT ONLY — the absences, each pointed at a known positive', () => {
  /** The module's own CODE LINES, with prose stripped — the house style documents prohibitions in prose. */
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

  const MINE = ['session-audio.ts', 'exercise-timer.ts', 'SessionTimer.tsx'];

  /**
   * THE APPLICATION HAS NO MICROPHONE AND ASKS FOR NONE.
   *
   * A recorded decision: browser speech RECOGNITION in Chrome streams audio to a remote server, which
   * breaks offline-first outright. Voice input is rejected, not deferred. A permission prompt in front
   * of a client is not a thing to discover in the field.
   */
  it('names no way of listening, anywhere in the audio path', async () => {
    const LISTENING = ['getusermedia', 'mediadevices', 'mediarecorder', 'speechrecognition',
      'webkitspeechrecognition', 'audioworklet', 'createmediastreamsource', 'permissions.query',
      'microphone'];

    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const listening of LISTENING) {
        assert.ok(!code.includes(listening),
          `${file} names ${listening}. This application records no audio and requests no microphone — `
            + 'voice input was REJECTED by a recorded decision, not deferred');
      }
    }

    // THE SAME SWEEP, POINTED AT A STRING THAT GENUINELY CARRIES EVERY NAME. Without this the loop
    // above passes on an empty read, a renamed file or a typo in all nine needles.
    const listening = LISTENING.join(' ');
    for (const needle of LISTENING) {
      assert.ok(listening.includes(needle), `the sweep cannot see ${needle} even when it is there`);
    }
    // And pointed at the audio module's real content, so it is reading code rather than nothing.
    const audio = await codeOf('session-audio.ts');
    assert.ok(audio.includes('createoscillator'), 'the sweep read no code at all out of the mechanism');
  });

  it('ships no audio file and makes no network call, so a basement gym is no different', async () => {
    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const reaching of ['fetch(', 'xmlhttprequest', 'new audio(', '.mp3', '.wav', '.ogg',
        'https://', 'http://']) {
        assert.ok(!code.includes(reaching),
          `${file} names ${reaching}. Both mechanisms are the browser's own precisely so the cues `
            + 'work on a phone with no signal');
      }
    }
    // The same sweep, pointed at strings that genuinely carry each shape.
    assert.ok('await fetch(url)'.includes('fetch('));
    assert.ok('new Audio("beep.mp3")'.toLowerCase().includes('new audio('));
    assert.ok('beep.mp3'.includes('.mp3'));
  });

  it('depends on no third-party package for either mechanism', async () => {
    const audio = await readFile(path.join(here, 'session-audio.ts'), 'utf8');
    const imports = [...audio.matchAll(/^import[^;]*from\s+'([^']+)';/gmu)].map((hit) => hit[1]);

    assert.equal(imports.length > 0, true, 'the reading found no imports at all, so its silence '
      + 'about third-party ones means nothing');
    for (const from of imports) {
      assert.ok(from.startsWith('.') || from.startsWith('node:'),
        `the audio mechanism imports "${from}", which is a package rather than the browser's own`);
    }
    // The same reading, pointed at what a third-party import looks like.
    const third = [...'import howler from \'howler\';'.matchAll(/^import[^;]*from\s+'([^']+)';/gmu)];
    assert.equal(third[0][1].startsWith('.'), false);
  });

  /**
   * THE TAP IS A TAP, and this is the one thing only the DRAWING can be wrong about.
   *
   * A platform that will not make a sound before a gesture is not worked around by unlocking from an
   * effect — it is worked around by asking, which is what the offer is. An `unlock` in a `useEffect`
   * would also be a page that constructs an audio context on arrival, on every device, whether or not
   * a session is being run.
   */
  it('unlocks from a real press and from nowhere else', async () => {
    const drawing = await codeOf('SessionTimer.tsx');
    assert.ok(drawing.includes('unlock()'), 'the drawing never unlocks audio at all, so this scan is '
      + 'looking at the wrong file');
    // ONE unlock, in the callback the button fires.
    assert.equal(drawing.split('unlock()').length - 1, 1, 'audio is unlocked from more than one place');
    assert.match(drawing, /onclick=\{turnon\}/u);

    /*
     * NO EFFECT MAY MENTION IT, and the bodies are extracted by BALANCING BRACKETS rather than matched
     * with a pattern.
     *
     * The first version of this assertion was `/useeffect\([^)]*unlock/s`. Broken on purpose by putting
     * a real `useEffect(() => { void port.unlock(); }, [port])` into the drawing, IT STAYED GREEN: the
     * `)` in `() =>` ends the `[^)]*` class two characters into every effect in the file, so the pattern
     * could not reach any effect's body at all. That was the GUARD being too weak rather than the break
     * being inadequate — the pair a green break cannot tell apart — so it is written out here.
     */
    const bodies: string[] = [];
    for (let at = drawing.indexOf('useeffect('); at !== -1; at = drawing.indexOf('useeffect(', at + 1)) {
      let depth = 0;
      let end = at + 'useeffect'.length;
      for (; end < drawing.length; end += 1) {
        if (drawing[end] === '(') depth += 1;
        else if (drawing[end] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      bodies.push(drawing.slice(at, end + 1));
    }

    for (const body of bodies) {
      assert.ok(!body.includes('unlock'),
        'audio is unlocked from an effect, so a coach who never tapped had an audio context built for '
          + 'him on arrival — and on iOS a context built outside a gesture never resumes');
    }
    // THE EXTRACTION POINTED AT A KNOWN POSITIVE: it really did read effect bodies, and one of them
    // really does contain the tick. Without this, an extraction that produced nothing passes the loop.
    assert.ok(bodies.length > 0, 'the extraction found no effect at all in the drawing');
    assert.ok(bodies.some((body) => body.includes('setinterval')),
      'the extraction read no effect BODY — it found the calls and not what is inside them, so the '
        + 'loop above proves nothing');
  });

  /** The application is completely usable by a coach who never taps the offer. */
  it('disables no control on account of the sound, and hides none either', async () => {
    const drawing = await readFile(path.join(here, 'SessionTimer.tsx'), 'utf8');
    const disabled = [...drawing.matchAll(/disabled=\{([^}]*)\}/gu)].map((hit) => hit[1]);

    assert.equal(disabled.length > 0, true, 'the reading found no disabled control at all, so its '
      + 'silence below means nothing');
    for (const condition of disabled) {
      for (const audio of ['unlocked', 'standing', 'port', 'audio', 'sound']) {
        assert.ok(!condition.toLowerCase().includes(audio),
          `a control is disabled by "${condition}", so a coach who never turned the sounds on cannot `
            + 'use the session');
      }
    }
    // The same reading, pointed at what an audio-gated control would look like.
    const gated = [...'disabled={unlocked === null}'.matchAll(/disabled=\{([^}]*)\}/gu)];
    assert.equal(gated[0][1].includes('unlocked'), true);
  });

  it('carries no emoji in any of its words', () => {
    const words = [UNLOCK_LABEL, UNLOCK_WORDS, ...Object.values(STANDING_WORDS)].join(' ');
    const emoji = /\p{Extended_Pictographic}/u;
    assert.doesNotMatch(words, emoji);
    assert.match('sounds on 🔊', emoji, 'this reading cannot see an emoji at all');
  });
});

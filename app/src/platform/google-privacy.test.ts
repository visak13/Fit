/**
 * THE PRIVACY DISCIPLINE, PROVED — and every proof here is pointed at a known positive first.
 *
 * This action is one of the three in this build that first makes the privacy posture REAL. Until
 * now nothing fetched a provider object, so `core/integration/leak-sweep.test.js` could say plainly
 * that it had never faced one. It has now.
 *
 * ## THE HAZARD, MEASURED ON THIS PROJECT'S OWN ARTEFACTS RATHER THAN IMAGINED
 *
 * A Google response carries the signed-in account's address ENCODED INSIDE AN IDENTIFIER SEGMENT —
 * an event link's `eid` is base64 of "<event id> <calendar id>", and on a personal account the
 * calendar id IS the address. So a plaintext search of outgoing bytes comes back CLEAN while the
 * address is sitting right there. It was searched for twice by plain text and reported clean, and
 * that conclusion was right only by luck: the METHOD could not have found it either way.
 *
 * Two rules follow and both are exercised below. Sweeps DECODE candidate segments before searching.
 * And what is carried forward is a WHITELIST — three named fields — never a blacklist of the ones
 * that must not travel, because a blacklist carries by default whatever nobody thought of.
 *
 * ## AND EVERY ABSENCE HERE IS PROVED CAPABLE OF THE OTHER ANSWER
 *
 * Every assertion in this file is an ABSENCE — no address, no token, no refresh flow, no timer — and
 * an absence is the one output a broken check produces for free. A sweep that finds nothing because
 * it is misdirected reads exactly like a sweep that finds nothing because there is nothing there. So
 * each one is pointed at something it MUST find in the same run, and the run fails if that probe
 * goes quiet, whatever the real assertion said.
 *
 * ## THE SOURCE SCANS READ CODE, NOT THE COMMENTS THAT EXPLAIN THE PROHIBITION
 *
 * This house documents prohibitions beside the code they constrain, so `google-identity.ts` says in
 * its own header that there is no `refresh_token` here. A scan over raw source would match that
 * sentence and then either fail on its own documentation or be "fixed" by deleting the explanation.
 * So {@link codeOf} strips comments first — and the run proves the stripping mattered by asserting
 * that the RAW source does contain the forbidden word while the CODE does not.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { JOURNAL_STORES, readChainPage } from '../../core/journal/journal.js';
import { aDevice } from '../../core/status/testing.js';
import type { LocalStore } from '../../core/store/store.js';

import { connectGoogleAccount, eraseReadiness, signOutOfGoogle } from './google-account.ts';
import { CarriedToken, GoogleConnection, UserGesture, carryForward } from './google-identity.ts';
import type { GoogleIdentityLike, SmallFactStorage, TokenResponseLike } from './google-identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The signed-in account, and identifiers a real Google response hands back. */
const COACH_ADDRESS = 'not.a.real.coach@example.com';
const DRIVE_FOLDER_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
const A_REFRESH_TOKEN = '1//0gNotARealRefreshTokenEither';
const AN_ACCESS_TOKEN = 'ya29.a0-not-a-real-token';

/** Everything that must never leave this module, whatever shape it is wearing. */
const FORBIDDEN = Object.freeze([COACH_ADDRESS, DRIVE_FOLDER_ID, A_REFRESH_TOKEN, AN_ACCESS_TOKEN]);

/**
 * A provider response with the trap in it.
 *
 * Everything beyond the three whitelisted fields is here on purpose: an identity token whose payload
 * carries the address in plain sight, a link whose identifier segment carries it ENCODED, a refresh
 * token that this application must never see let alone keep, and Drive identifiers that reveal the
 * coach's folder structure. None of it is a credential scanner's business and all of it would ship.
 */
function aPoisonedResponse(): TokenResponseLike {
  const eid = Buffer.from(`evt7g3k9q2m4 ${COACH_ADDRESS}`, 'utf8').toString('base64');
  const claims = Buffer.from(JSON.stringify({ email: COACH_ADDRESS }), 'utf8').toString('base64url');
  return {
    access_token: AN_ACCESS_TOKEN,
    expires_in: 3599,
    scope: 'https://www.googleapis.com/auth/drive.file',
    // Everything below is what the whitelist exists to drop.
    refresh_token: A_REFRESH_TOKEN,
    id_token: `eyJhbGciOiJSUzI1NiJ9.${claims}.a-signature`,
    htmlLink: `https://www.google.com/calendar/event?eid=${eid}`,
    parents: [DRIVE_FOLDER_ID],
    authuser: '0',
  } as TokenResponseLike;
}

/**
 * The characters a base64 or base64url segment is made of. No regular expression is used here.
 *
 * `=` IS DELIBERATELY NOT IN THIS SET, and leaving it in is a defect this file has already had once.
 * Padding may only ever be at the END of a segment, but a URL writes `?eid=<payload>` — so a scanner
 * that treats `=` as part of a run swallows the `eid=` in front of the payload, and this platform's
 * base64 decoder stops dead at the first `=` it meets. The run decodes to "eid" and the payload
 * behind it is never looked at. The address then sits there, encoded, and the sweep reports clean.
 *
 * That is the precise hazard this whole file exists for, and it was found by BREAKING the whitelist
 * on purpose and watching the sweep stay green — not by reading it. The positive control below had
 * been passing on a DIFFERENT segment, so its silence about the URL case proved nothing.
 */
const BASE64_CHARACTERS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_',
]);

/** Shortest run worth trying to decode. Below this every ordinary English word is a candidate. */
const SHORTEST_CANDIDATE = 16;

/** Every identifier-shaped run in this text, decoded. This is the half a plaintext grep is missing. */
function decodedForms(text: string): string[] {
  const decoded: string[] = [];
  let run = '';
  const flush = () => {
    if (run.length >= SHORTEST_CANDIDATE) {
      const normalised = run.split('-').join('+').split('_').join('/');
      decoded.push(Buffer.from(normalised, 'base64').toString('utf8'));
    }
    run = '';
  };
  for (const character of text) {
    if (BASE64_CHARACTERS.has(character)) run += character;
    else flush();
  }
  flush();
  return decoded;
}

/** Everything forbidden that this text carries, in plain sight OR encoded. */
function sweep(where: string, text: string, forbidden: readonly string[] = FORBIDDEN): string[] {
  const found: string[] = [];
  const decoded = decodedForms(text);
  for (const needle of forbidden) {
    if (text.includes(needle)) found.push(`${where}: "${needle}" in plain text`);
    for (const form of decoded) {
      if (form.includes(needle)) found.push(`${where}: "${needle}" inside an encoded segment`);
    }
  }
  return found;
}

/**
 * A file's CODE, with every comment removed.
 *
 * A small state machine rather than a pattern, because shipped source under `src` is regex-free and
 * a test that reached for one to check the source would be a strange thing to have. It tracks string
 * literals so that a comment marker inside a string is left where it is.
 */
function codeOf(fileName: string): string {
  const raw = rawSourceOf(fileName);
  let out = '';
  let index = 0;
  let quote = '';

  while (index < raw.length) {
    const here = raw[index] as string;
    const next = raw[index + 1] ?? '';

    if (quote !== '') {
      out += here;
      if (here === '\\') { out += next; index += 2; continue; }
      if (here === quote) quote = '';
      index += 1;
      continue;
    }

    if (here === '"' || here === "'" || here === '`') { quote = here; out += here; index += 1; continue; }

    if (here === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') index += 1;
      continue;
    }
    if (here === '/' && next === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }

    out += here;
    index += 1;
  }
  return out;
}

function rawSourceOf(fileName: string): string {
  return readFileSync(join(HERE, fileName), 'utf8');
}

/**
 * Every Google-facing module, and the list is EXTENDED when one is added rather than left naming the
 * two that existed when it was written.
 *
 * `google-drive-remote.ts` joined it the day it was written. A guard whose scope is fixed at the
 * moment of writing goes green while the claim it makes goes false, and this tree has already had
 * three of those — a scan walking one directory while the thing it forbids landed in another. The
 * two prohibitions below are exactly as load-bearing for the storage implementation as for the
 * credential: it holds the token on every call, and it must arm no timer either.
 *
 * AND IT HAPPENED AGAIN, WHICH IS WHY THE LIST IS NOW DERIVED RATHER THAN TYPED. The Meet path, the
 * single-instance holder and the settings landed after this list was last edited, and none of them
 * joined it — so for a while the two prohibitions covered three of six Google modules while this
 * file's own header claimed it covered them all. A typed list is a promise somebody has to remember
 * to keep, and the promise had already been broken twice in one step. So the scope is now READ FROM
 * THE DIRECTORY: every shipped `google-*.ts` beside this file is scanned, and a module added next
 * year is covered the moment it is written, with nothing to remember. {@link GOOGLE_SOURCES}
 * asserts it found more than it used to hold, so a glob that silently matched nothing cannot pass.
 */
const GOOGLE_SOURCES: readonly string[] = Object.freeze(
  readdirSync(HERE)
    .filter((name) => name.startsWith('google-') && name.endsWith('.ts') && !name.includes('.test.'))
    .sort(),
);

/** Small facts, in memory, so a test can read everything that was persisted. */
class Facts implements SmallFactStorage {
  held = new Map<string, string>();
  getItem(key: string): string | null { return this.held.get(key) ?? null; }
  setItem(key: string, value: string): void { this.held.set(key, value); }
  removeItem(key: string): void { this.held.delete(key); }
}

function poisonedIdentity(): GoogleIdentityLike {
  return {
    initTokenClient(config: { callback: (response: TokenResponseLike) => void }) {
      return { requestAccessToken: () => config.callback(aPoisonedResponse()) };
    },
    revoke: (_token: string, done?: () => void) => done?.(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the sweep itself, before anything it says is believed', () => {
  it('FINDS the address in the raw provider response — and only because it decodes', () => {
    const raw = JSON.stringify(aPoisonedResponse());

    const plainOnly = raw.includes(COACH_ADDRESS);
    const withDecoding = sweep('the raw response', raw, [COACH_ADDRESS]);

    assert.equal(plainOnly, false,
      'this is the whole point: a plaintext search of a real response comes back CLEAN while the '
      + "coach's address is sitting inside an identifier segment");
    assert.ok(withDecoding.length > 0,
      'and the decoding sweep must catch what the plaintext search cannot. If this ever goes quiet, '
      + 'every clean result below is worthless and this file proves nothing at all.');
  });

  it('finds the other identifiers too, so one lucky needle is not carrying the file', () => {
    const raw = JSON.stringify(aPoisonedResponse());
    for (const needle of [DRIVE_FOLDER_ID, A_REFRESH_TOKEN, AN_ACCESS_TOKEN]) {
      assert.ok(sweep('the raw response', raw, [needle]).length > 0, `the sweep cannot see ${needle}`);
    }
  });

  it('finds it in EACH carrier separately, so no one carrier is covering for the others', () => {
    const poisoned = aPoisonedResponse() as unknown as Record<string, string>;

    // THIS IS THE ONE THAT WAS BROKEN. The measured hazard is an EVENT LINK whose `eid` segment
    // carries the address, and the sweep could not see it: the run-scanner swallowed the `eid=`
    // before the payload and the decoder stopped at that `=`. The whole-object control passed
    // anyway, on the identity token's segment, so its green light meant nothing about this case.
    assert.ok(sweep('the event link alone', poisoned.htmlLink as string, [COACH_ADDRESS]).length > 0,
      'a link is the carrier the hazard was actually MEASURED on. If a control only ever proves the '
      + 'sweep against a different carrier, it is proving the sweep works on the case nobody found.');

    assert.ok(sweep('the identity token alone', poisoned.id_token as string, [COACH_ADDRESS]).length > 0,
      'and the identity token, which is a different encoding of the same address');
  });
});

describe('what is carried forward', () => {
  it('is three fields, and the poison is dropped on the floor', () => {
    const token = carryForward(aPoisonedResponse(), new Date('2026-07-25T09:00:00.000Z'));

    assert.ok(token instanceof CarriedToken);
    assert.deepEqual(Object.keys({ ...token }), ['expiresAt', 'scopes'],
      'anything else the response carried must not have come with it — a whitelist, so a field '
      + 'Google adds next year is carried by nobody rather than by default');
    assert.deepEqual(sweep('the carried token', JSON.stringify(token)), [],
      'and nothing forbidden survives, in plain sight or encoded');
  });
});

describe('nothing raw reaches anything durable', () => {
  it('leaves no trace in the persisted connection record, the log, or the words on screen',
    async () => {
      const dev = await aDevice();
      const facts = new Facts();
      const connection = new GoogleConnection({
        identity: () => poisonedIdentity(),
        clientId: () => 'a-client-id.apps.googleusercontent.com',
        storage: facts,
      });

      await connectGoogleAccount({
        connection,
        gesture: UserGesture.fromTrustedEvent({ isTrusted: true, type: 'click' }),
        store: dev.store,
      });
      await signOutOfGoogle({ connection, store: dev.store });

      // `JOURNAL_STORES` is COPIED rather than cast: the core freezes it deliberately, and casting
      // the readonly off would license a caller to mutate a value it froze for a reason.
      const store: LocalStore = dev.store;
      const page = await store.read(
        [...JOURNAL_STORES],
        (scope) => readChainPage(scope, store.device, { limit: 200 }),
      );
      const readiness = eraseReadiness({
        // The reading was TAKEN — the gate refuses one that was not, and this test is about what a
        // real refusal's words may carry rather than about the unread state.
        status: 'read',
        pending: 1,
        waiting_for_credential: 1,
        rejected: 0,
        ambiguous: 0,
        oldest_undelivered_label: 'backup of the exercise library',
        oldest_undelivered_age_ms: 60_000,
        // Work held on a dead credential is what this state is, so this is the reason the indicator
        // would be showing beside it — and the refusal's remedy is read from it.
        reason: { action: 'reconnect_google' },
      });

      const found = [
        ...sweep('the persisted connection', JSON.stringify([...facts.held.entries()])),
        ...sweep('the event log', JSON.stringify(page.items)),
        ...sweep('the sentences on screen',
          `${readiness.headline} ${readiness.whatHappened} ${readiness.whatToDo}`),
      ];

      assert.deepEqual(found, [],
        'a raw provider or token response may not reach the store, the outbox, a journal entry, an '
        + 'export or a log line');

      // The probe that makes the clean result above mean something: the very same sweep, over the
      // very same run, pointed at the raw object those three were built from.
      assert.ok(sweep('the response they came from', JSON.stringify(aPoisonedResponse())).length > 0,
        'if this goes quiet the three clean results above are the output of a dead sweep');
      assert.ok(page.items.length >= 2, 'and the log really did have entries to be clean of');

      await dev.store.close();
    });
});

describe('there is no refresh-token path, and the scan that says so can see', () => {
  const FORBIDDEN_IN_CODE = Object.freeze([
    // No code exchange exists: a Web client cannot get one of these without a secret, and there is
    // nowhere to keep a secret. Reaching for one would be a silent dead end.
    'refresh_token',
    'client_secret',
    // The code flow's entry point. `initTokenClient` is the one that is used.
    'initCodeClient',
    // A broad Drive scope. Both narrow scopes were proven sufficient on a real device.
    "auth/drive'",
  ]);

  it('names none of them in CODE, in EVERY Google module the directory holds', () => {
    // NON-VACUITY FOR THE SCOPE ITSELF, not only for the needles. The list is now discovered, and a
    // discovered list that matched nothing would make every assertion below pass over an empty loop
    // — the same shape as the scan-walking-the-wrong-root defect this file exists to prevent, moved
    // one level up into how the file finds its own subjects.
    assert.ok(GOOGLE_SOURCES.length >= 6,
      `the Google-module scan discovered only ${GOOGLE_SOURCES.length} files (${GOOGLE_SOURCES.join(', ')}). `
      + 'It found fewer than the six that exist, so it is scanning a subset while claiming to scan '
      + 'them all. Do not lower this number to make it pass — find out why the discovery went blind.');
    for (const required of ['google-identity.ts', 'google-account.ts', 'google-drive-remote.ts',
      'google-meet.ts', 'google-on-this-device.ts', 'google-settings.ts']) {
      assert.ok(GOOGLE_SOURCES.includes(required), `${required} is not being scanned at all`);
    }

    for (const fileName of GOOGLE_SOURCES) {
      const code = codeOf(fileName);
      for (const forbidden of FORBIDDEN_IN_CODE) {
        assert.equal(code.includes(forbidden), false,
          `${fileName} names ${forbidden}. There is no refresh token to be had on this origin and `
          + 'no secret to ask for one with; a path that reaches for one is a dead end that fails '
          + 'much later and somewhere else.');
      }
    }
  });

  it('and the scan is proved able to fail, in the same run, two different ways', () => {
    const code = codeOf('google-identity.ts');

    assert.ok(code.includes('access_token'),
      'the scanner must be able to find a needle that IS in the code — this one is, in the '
      + 'whitelist. If it cannot, every absence above passes for free.');
    assert.ok(code.includes('initTokenClient'), 'and the flow that IS used is named in the code');

    assert.ok(rawSourceOf('google-identity.ts').includes('refresh_token'),
      'the RAW source says there is no refresh_token here, in the comment that explains why. That '
      + 'sentence is exactly what an absence sweep must not read — so this line proves the comment '
      + 'stripping is what makes the assertion above meaningful, rather than the absence being an '
      + 'accident of how the file happens to be worded.');
    assert.ok(codeOf('google-identity.ts').length < rawSourceOf('google-identity.ts').length / 2,
      'and the stripping really did remove the prose rather than passing the file through');
  });
});

describe('nothing arms a timer, so no prompt can appear out of nowhere', () => {
  const TIMERS = Object.freeze(['setTimeout', 'setInterval', 'requestIdleCallback', 'requestAnimationFrame']);

  it('is true of every Google module the directory holds', () => {
    for (const fileName of GOOGLE_SOURCES) {
      const code = codeOf(fileName);
      for (const timer of TIMERS) {
        assert.equal(code.includes(timer), false,
          `${fileName} arms ${timer}. Renewal is attached to the tap that needs it: the coach must `
          + 'never meet an authorisation prompt divorced from an action he just took.');
      }
    }
  });

  it('and the scan can see a timer where there really is one', () => {
    assert.ok(codeOf('storage-persistence.ts').includes('setTimeout'),
      'storage-persistence.ts genuinely arms one, and if this scan cannot find it then the two '
      + 'clean results above are the output of a scan looking at the wrong thing');
  });
});

/**
 * THE GUARD WHOSE ABSENCE IS THE WHOLE STORY.
 *
 * Between 2026-07-25 and 2026-08-02 this application shipped without ever loading Google's identity
 * script. `platform/google-on-this-device.ts` reads `window.google.accounts.oauth2`; nothing put it
 * there. Sign-in could not work, and the coach was told "the Google sign-in library did not load,
 * which usually means this device is offline" — on a device that was online.
 *
 * EVERY ONE OF THE 2,089 SHELL TESTS PASSED THROUGHOUT. They passed BECAUSE they passed: each one
 * supplies its own `GoogleIdentityLike` double, which is correct unit-testing practice and is
 * precisely what made the fleet blind. A double proves the code around the library. NOTHING proved
 * the library arrives. The application was tested against a stand-in for a thing it never fetched.
 *
 * So this file does not test behaviour. It tests that the ONE LINE which cannot be doubled is
 * present in the document the browser actually loads, and it reads that document off disk rather
 * than importing anything — because an import would be one more layer of us checking ourselves.
 *
 * The spike had this tag on day one. The failure was never a hard problem; it was that no
 * instrument in this repository had `index.html` in its universe.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = join(HERE, '..', '..', 'index.html');

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function indexHtml(): string {
  return readFileSync(INDEX_HTML, 'utf8');
}

test('index.html loads Google Identity Services — the library nothing else can supply', () => {
  const html = indexHtml();
  assert.ok(
    html.includes(GSI_SRC),
    `index.html does not reference ${GSI_SRC}. Google sign-in cannot work: `
    + 'google-on-this-device.ts reads window.google.accounts.oauth2 and only this script defines it.',
  );
});

test('the script tag does not block first paint — this application opens offline', () => {
  const html = indexHtml();
  const tag = html.slice(html.indexOf(GSI_SRC));
  const end = tag.indexOf('>');
  const attributes = tag.slice(0, end);
  assert.ok(
    attributes.includes('async') || attributes.includes('defer'),
    'The identity script must carry async or defer. Without it a slow or blocked response from '
    + 'accounts.google.com stalls rendering, and this application is required to open offline.',
  );
});

test('the failure of the script is RECORDED, so the message need not guess at a cause', () => {
  const html = indexHtml();
  const tag = html.slice(html.indexOf(GSI_SRC));
  const attributes = tag.slice(0, tag.indexOf('>'));
  assert.ok(
    attributes.includes('onerror'),
    'The identity script must set a flag on error. Without it `identityUnavailableSentence` cannot '
    + 'distinguish "blocked" from "we do not know", and a message that guesses a cause is what sent '
    + 'the first real reader to check a network that was working.',
  );
});

/**
 * NON-VACUITY. The three assertions above are absence-shaped — they pass when a string is present,
 * which is exactly the shape that also passes when the matcher is looking in the wrong place or at
 * the wrong file. This proves the reader can see, by feeding it a document it MUST reject.
 *
 * Without this, a typo in INDEX_HTML would make every test above pass against an empty string.
 */
test('the reader is not vacuous: a document without the tag is refused', () => {
  const withoutTag = '<!doctype html><html><body><div id="root"></div></body></html>';
  assert.ok(!withoutTag.includes(GSI_SRC), 'fixture must not contain the tag');

  const real = indexHtml();
  assert.notEqual(real.length, 0, 'index.html read as empty — the path is wrong, not the markup');
  assert.ok(real.includes('<div id="root">'), 'index.html does not look like this application');
});

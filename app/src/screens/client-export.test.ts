/**
 * SENDING A CLIENT THEIR PROGRESS REPORT.
 *
 * Two things are proved here that are proved nowhere else.
 *
 * **THE EMPTY GATE IS THIS MODULE'S, NOT THE SEAM'S.** The export seam accepts an empty table and is
 * right to; it cannot tell "nothing recorded yet" from "a short report". So the refusal is asserted
 * here, where the meaning is known.
 *
 * **THE CANVAS IS BOUND AT A REAL DEVICE PIXEL RATIO.** A progress report is a much taller table
 * than a diet week, and the browser allocates the plan MULTIPLIED by the ratio — so a picture
 * comfortably inside the limit in layout pixels can be three times outside it on a phone, and an
 * over-limit canvas does not throw: the blob callback simply hands back nothing. Tested at ratio 3,
 * because at ratio 1 this failure is invisible.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { projectProgressReport } from '../../core/report/report.js';
import { aHistory, anEmptyHistory, HER, THE_OTHER_CLIENT } from '../../core/report/testing.js';
import type { PictureCanvas, PictureSurface } from '../platform/table-picture';
import type { DownloadSurface, ShareRequest, SharingSurface } from '../platform/share-delivery';
import {
  COULD_NOT_MAKE_THE_REPORT, NOTHING_TO_REPORT, REPORT_EXPORT_WORDS, reportExportOffer, SEND_REPORT_AS_IMAGE,
  SEND_REPORT_AS_SPREADSHEET, sendClientReport,
} from './client-export';
import type { ClientExportSurfaces } from './client-export';
import type { ExportAudit, ExportEntryFields } from './export-audit';

/**
 * THE REQUIRED SINK, in a suite that is not about the log.
 *
 * It KEEPS what was written rather than discarding it — a sink that threw its argument away would be
 * a no-op wearing the shape of a recorder, and the next person to copy it into production source
 * would have reinvented the optional sink the argument exists to forbid. What the entries actually
 * say, on a real store, driven through these same entry points, is proven in `export-audit.test.ts`.
 */
function anAudit(): { audit: ExportAudit; written: ExportEntryFields[] } {
  const written: ExportEntryFields[] = [];
  return { audit: { journal: async (fields) => { written.push(fields); } }, written };
}


/** The bitmap the canvas was actually asked for, which is the number that matters. */
interface Sized { width: number; height: number }

/**
 * A canvas that answers with a real blob and REMEMBERS the bitmap it was sized to.
 *
 * `toBlob` deliberately refuses above the platform limit, the way a real browser does: it hands back
 * nothing rather than throwing. Without that the test would pass on a canvas no phone could allocate.
 */
function aPictureSurface(pixelRatio: number, limit = 4096): { surface: PictureSurface; sized: Sized } {
  const sized: Sized = { width: 0, height: 0 };
  const context = {
    font: '',
    fillStyle: '' as string,
    textBaseline: 'alphabetic' as const,
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: () => {},
    fillRect: () => {},
    scale: () => {},
  };
  const canvas: PictureCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback, type) => {
      sized.width = canvas.width;
      sized.height = canvas.height;
      if (canvas.width > limit || canvas.height > limit) { callback(null); return; }
      callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type }));
    },
  };
  return { surface: { pixelRatio, createCanvas: () => canvas }, sized };
}

function aBrowser(pixelRatio = 2) {
  const shared: ShareRequest[] = [];
  const downloaded: File[] = [];
  const picture = aPictureSurface(pixelRatio);

  const sharing: SharingSurface = {
    canShare: () => true,
    share: async (request) => { shared.push(request); },
  };
  const download: DownloadSurface = { download: (file: File) => { downloaded.push(file); } };

  return {
    surfaces: { picture: picture.surface, sharing, download } as ClientExportSurfaces,
    sized: picture.sized,
    shared,
    downloaded,
  };
}

const herReport = () => projectProgressReport(aHistory());

test('THE EMPTY GATE IS HERE, because the seam accepts an empty table and cannot know better', () => {
  const offer = reportExportOffer(projectProgressReport(anEmptyHistory()));

  assert.equal(offer.offered, false);
  assert.equal(offer.instead, NOTHING_TO_REPORT);
  assert.ok(
    !NOTHING_TO_REPORT.toLowerCase().includes('error'),
    'a client with no sessions yet is an ordinary Tuesday, not a fault',
  );
});

test('a client with a history is offered both artefacts', () => {
  const offer = reportExportOffer(herReport());
  assert.equal(offer.offered, true);
  assert.equal(offer.instead, null);
});

test('nothing read yet offers nothing and says nothing', () => {
  assert.deepEqual(reportExportOffer(null), { offered: false, instead: null });
});

test('THE SPREADSHEET IS A REAL FILE, named after the client', async () => {
  const browser = aBrowser();
  const report = await sendClientReport(anAudit().audit, 'spreadsheet', herReport(), browser.surfaces);

  assert.equal(report.tone, 'delivered');
  const file = browser.shared[0].files[0];
  assert.ok(file.name.startsWith(HER.name), file.name);
  assert.ok(file.name.endsWith('.xlsx'));
  assert.ok(file.size > 0);
});

test('THE PICTURE IS BOUND BY THE BITMAP, NOT THE DRAWING — tested at ratio 3', async () => {
  const browser = aBrowser(3);
  const report = await sendClientReport(anAudit().audit, 'picture', herReport(), browser.surfaces);

  assert.equal(report.tone, 'delivered', 'an over-limit canvas returns no blob and no picture');
  assert.ok(browser.sized.width > 0 && browser.sized.height > 0, 'the canvas really was sized');
  assert.ok(
    browser.sized.width <= 4096 && browser.sized.height <= 4096,
    `the bitmap was ${browser.sized.width}x${browser.sized.height}; the limit is on the BITMAP, and `
    + 'the plan is multiplied by the device pixel ratio before it is allocated',
  );
});

/**
 * A report of a given size, synthesised rather than grown from a fixture.
 *
 * The fixture history produces about twenty rows, at which the ratio clamp NEVER ENGAGES — so a
 * bound tested only against it is a bound that has never been seen to do anything. This builds a
 * report big enough to make the clamp fire.
 */
const aReportOf = (readings: number) => ({
  client_id: HER.id,
  client_name: HER.name,
  headline: 'Progress',
  summary: { headline: 'Progress', paragraphs: ['You have been training steadily.'] },
  sessions: [],
  trends: [{
    kind: 'resting_heart_rate',
    label: 'Resting heart rate',
    unit_words: 'beats per minute',
    points: Array.from({ length: readings }, (_, index) => ({
      at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
      value: 70 + (index % 10),
    })),
  }],
  is_empty: false,
  // A deliberately MINIMAL report: this fixture exercises the LAYOUT and the canvas bound, which
  // read only the fields above. The full projection is exercised against the real fixture history in
  // every other test here, so a partial shape is honest rather than a shortcut.
} as unknown as Parameters<typeof sendClientReport>[2]);

test('...AND THE CLAMP ACTUALLY ENGAGES: at ratio 3 a long report is SOFTENED, not blown past the limit', async () => {
  const browser = aBrowser(3);
  const report = await sendClientReport(anAudit().audit, 'picture', aReportOf(60), browser.surfaces);

  assert.equal(report.tone, 'delivered', 'softness is given up, never the picture');
  assert.ok(
    browser.sized.height > 3000,
    `the bitmap was only ${browser.sized.height} tall, so this report was never near the limit and `
    + 'the clamp was not exercised at all',
  );
  assert.ok(
    browser.sized.height <= 4096,
    `the bitmap was ${browser.sized.height}; a ratio of 3 applied without clamping would have asked `
    + 'for three times the plan, which is the allocation the browser silently refuses',
  );
});

test('A HISTORY TOO LONG TO DRAW IS A CHOICE, NOT A DEAD END — and the limit is never predicted here', async () => {
  const browser = aBrowser(3);
  // Long enough that the PLAN exceeds the limit before any ratio is applied, which is the case where
  // there is no softness left to give up because the content itself does not fit.
  const report = await sendClientReport(anAudit().audit, 'picture', aReportOf(400), browser.surfaces);

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.startsWith(COULD_NOT_MAKE_THE_REPORT));
  assert.ok(
    report.words.toLowerCase().includes('spreadsheet'),
    `he must be told what DOES work: ${report.words}`,
  );

  assert.equal(browser.shared.length, 0, 'and nothing was reported as sent');
});

test('...AND THE SAME CLIENT\'S REPORT STILL GOES AS A SPREADSHEET, which is the point of saying so', async () => {
  const browser = aBrowser(3);
  const report = await sendClientReport(anAudit().audit, 'spreadsheet', aReportOf(400), browser.surfaces);

  assert.equal(report.tone, 'delivered', 'the sentence above would be a lie if this did not work');
  assert.ok(browser.shared[0].files[0].size > 0);
});

test('a blind canvas is NOT reported as a history that is too long', async () => {
  const blind: PictureSurface = { pixelRatio: 2, createCanvas: () => ({
    width: 0, height: 0, getContext: () => null, toBlob: (callback) => callback(null),
  }) };
  const browser = aBrowser();

  const report = await sendClientReport(anAudit().audit, 'picture', aReportOf(5), { ...browser.surfaces, picture: blind });

  assert.equal(report.tone, 'warning');
  assert.ok(
    report.words.includes('context'),
    `the layer's own reason must survive, not be replaced by a guess: ${report.words}`,
  );
  assert.ok(!report.words.toLowerCase().includes('too large'), 'and it must not claim the wrong cause');
});

test('NO CO-ATTENDEE IN THE FILE THAT ACTUALLY LEAVES THE DEVICE', async () => {
  const browser = aBrowser();
  await sendClientReport(anAudit().audit, 'spreadsheet', herReport(), browser.surfaces);

  const file = browser.shared[0].files[0];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  assert.ok(!raw.includes(THE_OTHER_CLIENT.name), 'the other client\'s name is in the delivered file');
  assert.ok(!raw.includes(THE_OTHER_CLIENT.id));
  assert.ok(!raw.includes(THE_OTHER_CLIENT.routine_id));
  assert.ok(raw.includes(HER.name), 'and her own name is, or this scan reads nothing');
});

test('THIS EXPORT REACHES NO CRYPTOGRAPHY: there is no gate and nothing to unlock', async () => {
  const browser = aBrowser();
  const report = await sendClientReport(anAudit().audit, 'spreadsheet', herReport(), browser.surfaces);

  assert.equal(report.tone, 'delivered');
  assert.ok(
    !report.words.toLowerCase().includes('passphrase'),
    'an always-openable export must not so much as mention one',
  );
});

test('no emoji in anything the coach reads on this surface', () => {
  for (const line of [REPORT_EXPORT_WORDS, SEND_REPORT_AS_IMAGE, SEND_REPORT_AS_SPREADSHEET, NOTHING_TO_REPORT]) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), `an emoji in "${line}"`);
  }
});

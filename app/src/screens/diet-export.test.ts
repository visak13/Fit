/**
 * THE WEEK LEAVING THE APPLICATION — the flattening, and the sentence the coach is told afterwards.
 *
 * Two things are asserted here and neither is "it rendered".
 *
 * **The chart reaches the seam as the seam's own table, with nothing in between.** The projection is
 * driven through `chartTable` and handed to the exporter's real writers — the actual `.xlsx` bytes
 * and the actual picture path — so a field renamed on either side of the seam goes red HERE rather
 * than in whichever caller notices first. The day columns are compared against the frozen `WEEKDAYS`
 * table rather than against day names typed into this file, because a second list of day names is
 * exactly the defect the direction's guard exists to forbid.
 *
 * **A share that did not happen is never reported as one.** The three paths that decide whether the
 * coach is told the truth — the sheet accepted it, the browser has no sheet, he dismissed the sheet —
 * are each driven with a substituted platform, and each is asserted on the WORDS he ends up reading.
 * The failure being prevented is specific and was named when the delivery layer was built: he taps
 * Send, the app says Sent, and a client never receives the week's chart.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { WEEKDAYS, projectWeekChart } from '../../core/diet/diet.js';
import { readTable } from '../../core/export/export.js';
import {
  REPEATING_WEEK_WORDS, browserExportSurfaces, dietExportTable, dietExportTitle, exportOffer,
  sendDietExport, toneOf,
} from './diet-export.ts';
import type { DietExportSurfaces } from './diet-export.ts';
import type { PictureCanvas, PictureSurface } from '../platform/table-picture.ts';
import type { Delivery, DownloadSurface, ShareRequest, SharingSurface } from '../platform/share-delivery.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// A plan, and a browser that can be told what to do
// ═══════════════════════════════════════════════════════════════════════════════

/** A plan on two days, deliberately not adjacent, so a padded week would be visible. */
function aPlan(): Record<string, unknown> {
  return {
    record_id: 'plan-1',
    content: {
      client_id: 'client-1',
      name: 'Winter block',
      status: 'current',
      days: [
        { day: 1, entries: [{ time: '08:00', label: 'Breakfast', items: ['Oats', 'Banana'], notes: null }] },
        {
          day: 3,
          entries: [
            { time: '08:00', label: 'Breakfast', items: ['Eggs'], notes: null },
            { time: '13:00', label: 'Lunch', items: ['Chicken', 'Rice'], notes: 'Weigh it' },
          ],
        },
      ],
    },
  };
}

/** A canvas that answers with a real blob, so the picture path completes rather than being skipped. */
function aPictureSurface(): PictureSurface {
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
    toBlob: (callback, type) => callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type })),
  };
  return { pixelRatio: 2, createCanvas: () => canvas };
}

/** What the substituted browser was asked to do, so a test can assert the file as well as the words. */
interface Watched {
  readonly surfaces: DietExportSurfaces;
  readonly shared: ShareRequest[];
  readonly downloaded: File[];
}

/**
 * A browser, told in advance how its share sheet behaves.
 *
 * `null` means the browser has no share sheet at all — the desktop case, and the one where a coach
 * must still end up holding his file.
 */
function aBrowser(sheet: 'accepts' | 'dismissed' | 'refuses-files' | null): Watched {
  const shared: ShareRequest[] = [];
  const downloaded: File[] = [];

  const sharing: SharingSurface | undefined = sheet === null ? undefined : {
    canShare: () => sheet !== 'refuses-files',
    share: async (request: ShareRequest) => {
      if (sheet === 'dismissed') {
        const dismissal = new Error('Share canceled');
        dismissal.name = 'AbortError';
        throw dismissal;
      }
      shared.push(request);
    },
  };

  const download: DownloadSurface = { download: (file: File) => { downloaded.push(file); } };

  return { surfaces: { picture: aPictureSurface(), sharing, download }, shared, downloaded };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The flattening
// ═══════════════════════════════════════════════════════════════════════════════

test('THE CHART GOES TO THE SEAM AS THE SEAM’S OWN TABLE, passed through rather than adapted', () => {
  const chart = projectWeekChart(aPlan());
  const table = dietExportTable(chart, 'Priya');

  // Read by the EXPORTER'S OWN reader, whole. If either side renames a field this is where it goes
  // red — not in a caller that quietly wrote an adapter to bridge them.
  const read = readTable(table);

  assert.deepEqual([...read.headings], ['Time', 'Monday', 'Wednesday']);
  assert.deepEqual(read.rows.map((row) => [...row]), [
    ['08:00 Breakfast', 'Oats, Banana', 'Eggs'],
    ['13:00 Lunch', '', 'Chicken, Rice (Weigh it)'],
  ]);
});

test('the day columns come off the frozen week table, so the export cannot disagree with the screen', () => {
  const chart = projectWeekChart(aPlan());
  const table = dietExportTable(chart, 'Priya');

  // Derived from the shared table rather than typed here — this file must not become the second list
  // of day names the direction's guard exists to forbid.
  const expected = chart.days.map((day) => {
    const weekday = WEEKDAYS.find((known) => known.day === day.day);
    assert.ok(weekday !== undefined, `day ${String(day.day)} is not in the frozen week table`);
    return weekday.name;
  });

  assert.ok(expected.length > 0, 'the plan under test has no days, so this asserts nothing');
  assert.deepEqual(table.headings?.slice(1), expected);
});

test('a SHORT plan keeps short columns: nothing is padded out into a week the plan does not hold', () => {
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  assert.equal(table.headings?.length, 3, 'a two-day plan exports the time column and two days');
  for (const row of table.rows) assert.equal(row.length, 3, 'the exported grid is rectangular');
});

test('THE ARTEFACT SAYS WHAT IT IS A MONTH LATER: the client, the plan, and that the week repeats', () => {
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  assert.ok(table.title.includes('Priya'), 'a client receiving this cannot tell it from the last three');
  assert.ok(table.title.includes('Winter block'), 'the coach cannot tell which plan he sent');
  assert.ok(table.title.includes(REPEATING_WEEK_WORDS), 'nothing says the week repeats once it has left');
});

test('NO DATE reaches the exported artefact, because the week repeats and the record holds none', () => {
  const plan = aPlan();
  (plan.content as Record<string, unknown>).effective_from = '2026-06-01';

  const table = dietExportTable(projectWeekChart(plan), 'Priya');
  const whole = JSON.stringify(table);

  // Non-vacuity: the date really is on the record this table was built from.
  assert.equal((plan.content as Record<string, string>).effective_from, '2026-06-01');
  assert.ok(!whole.includes('2026-06-01'), 'a dated row would be read as a diary of one week');
  assert.ok(!/\d{4}-\d{2}-\d{2}/u.test(whole), 'something in the export resolved itself against a calendar');
});

test('an unnamed plan and an unknown client still make a title, because the seam refuses an empty one', () => {
  assert.doesNotThrow(() => readTable({ title: dietExportTitle('', null), headings: ['Time'], rows: [] }));
  assert.ok(dietExportTitle('', null).trim().length > 0);
  assert.ok(dietExportTitle('Winter block', null).includes('Winter block'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Whether it is offered at all
// ═══════════════════════════════════════════════════════════════════════════════

test('AN EMPTY PLAN IS NOT OFFERED FOR SENDING, because the seam would accept it and write nothing', async () => {
  const chart = projectWeekChart({ content: { name: 'Nothing yet', days: [] } });
  const offer = exportOffer(chart);

  assert.equal(offer.offered, false);
  assert.ok(offer.instead !== null && offer.instead.length > 0, 'the coach is shown a blank where the controls were');

  // NON-VACUITY, and it is the reason the gate is here rather than in the seam: the seam ACCEPTS this
  // table. One heading and no rows is a valid table; only a caller knows it means "not written yet".
  const table = dietExportTable(chart, 'Priya');
  assert.deepEqual(table.rows, []);
  const anyway = await sendDietExport('spreadsheet', table, aBrowser('accepts').surfaces);
  assert.equal(anyway.tone, 'delivered', 'the seam refused it after all, so this gate guards nothing');
});

test('a plan with meals in it IS offered, and nothing is said in place of the controls', () => {
  const offer = exportOffer(projectWeekChart(aPlan()));

  assert.equal(offer.offered, true);
  assert.equal(offer.instead, null);
});

test('nothing on screen is nothing to offer, and nothing to explain either', () => {
  assert.deepEqual(exportOffer(null), { offered: false, instead: null });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The delivery, and the words
// ═══════════════════════════════════════════════════════════════════════════════

test('THE SPREADSHEET IS A REAL WORKBOOK and it reaches the share sheet, named from the title', async () => {
  const browser = aBrowser('accepts');
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  const report = await sendDietExport('spreadsheet', table, browser.surfaces);

  assert.equal(browser.shared.length, 1, 'the file never reached the share sheet');
  assert.equal(browser.downloaded.length, 0, 'it was downloaded as well as shared');

  const [file] = browser.shared[0].files;
  assert.equal(file.name, `${table.title}.xlsx`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], 'the bytes begin PK — an archive, not text');

  assert.equal(report.tone, 'delivered');
});

test('THE IMAGE IS A REAL IMAGE and it reaches the share sheet too', async () => {
  const browser = aBrowser('accepts');
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  const report = await sendDietExport('picture', table, browser.surfaces);

  assert.equal(browser.shared.length, 1);
  const [file] = browser.shared[0].files;
  assert.equal(file.name, `${table.title}.png`);
  assert.equal(file.type, 'image/png');
  assert.ok(file.size > 0);

  assert.equal(report.tone, 'delivered');
});

test('A BROWSER WITH NO SHARE SHEET DOWNLOADS, and it is NOT worded as sent', async () => {
  const browser = aBrowser(null);
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  const report = await sendDietExport('spreadsheet', table, browser.surfaces);

  assert.equal(browser.downloaded.length, 1, 'the coach ended up holding nothing');
  assert.equal(browser.shared.length, 0);

  assert.equal(report.tone, 'kept');
  assert.notEqual(report.tone, 'delivered', 'a fallback download wears the voice that means it went');
  assert.ok(/saved to this device/iu.test(report.words), report.words);
  assert.ok(!/\bsent\b/iu.test(report.words), `a download is worded as a delivery: ${report.words}`);
});

test('a sheet that refuses this KIND of file downloads instead, and says which', async () => {
  const browser = aBrowser('refuses-files');
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  const report = await sendDietExport('spreadsheet', table, browser.surfaces);

  assert.equal(browser.downloaded.length, 1);
  assert.equal(report.tone, 'kept');
  assert.ok(/saved to this device/iu.test(report.words), report.words);
});

test('DISMISSING THE SHEET IS A CANCELLATION, never an error and never a download he did not ask for', async () => {
  const browser = aBrowser('dismissed');
  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');

  const report = await sendDietExport('picture', table, browser.surfaces);

  assert.equal(report.tone, 'stopped');
  assert.notEqual(report.tone, 'warning', 'the coach is shown an error for changing his own mind');
  assert.equal(browser.downloaded.length, 0, 'he closed the sheet and got a download anyway');
  assert.equal(browser.shared.length, 0);
  // It says nothing WENT, in as many words. The wording is the delivery layer's own and is asserted
  // rather than reworded here: this file must not become a second set of sentences about the same
  // four outcomes.
  assert.ok(/nothing was sent/iu.test(report.words), report.words);
});

test('the four outcomes get four voices, and only ONE of them means the client has it', () => {
  const outcomes: Delivery[] = [
    { outcome: 'shared' },
    { outcome: 'downloaded', because: 'no sheet' },
    { outcome: 'cancelled' },
    { outcome: 'failed', because: 'nothing worked' },
  ];

  const tones = outcomes.map(toneOf);
  assert.deepEqual(tones, ['delivered', 'kept', 'stopped', 'warning']);
  assert.equal(tones.filter((tone) => tone === 'delivered').length, 1);
});

test('A TABLE THE SEAM WILL NOT WRITE comes back as its own sentence, not as a thrown error', async () => {
  const browser = aBrowser('accepts');

  const report = await sendDietExport(
    'spreadsheet',
    // A title the seam refuses. The refusal is the seam's and must reach the coach unreworded.
    { title: '   ', headings: ['Time'], rows: [['08:00']] },
    browser.surfaces,
  );

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.includes('An export needs a title'), report.words);
  assert.equal(browser.shared.length, 0);
  assert.equal(browser.downloaded.length, 0);
});

test('a canvas that gives no image back is SAID, rather than becoming an empty file', async () => {
  const browser = aBrowser('accepts');
  const blind: PictureSurface = {
    pixelRatio: 1,
    createCanvas: () => ({
      width: 0, height: 0, getContext: () => null, toBlob: (callback) => callback(null),
    }),
  };

  const report = await sendDietExport(
    'picture',
    dietExportTable(projectWeekChart(aPlan()), 'Priya'),
    { ...browser.surfaces, picture: blind },
  );

  assert.equal(report.tone, 'warning');
  assert.ok(report.words.length > 0);
  assert.equal(browser.shared.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// The edge where the real browser is named
// ═══════════════════════════════════════════════════════════════════════════════

test('the browser edge names the platform’s own pieces and reaches for no global of its own', () => {
  const anchors: { href: string; download: string; clicked: number }[] = [];
  const created: File[] = [];
  const revoked: string[] = [];

  const ownerDocument = {
    createElement: (tag: string) => {
      assert.equal(tag, 'a');
      const anchor = { href: '', download: '', clicked: 0, click() { this.clicked += 1; } };
      anchors.push(anchor);
      return anchor;
    },
  } as unknown as Document;

  const surfaces = browserExportSurfaces(
    ownerDocument,
    { devicePixelRatio: 3 },
    {
      create: (file: File) => { created.push(file); return 'blob:one'; },
      revoke: (url: string) => { revoked.push(url); },
    },
  );

  assert.equal(surfaces.picture.pixelRatio, 3, 'a canvas at the wrong ratio is a blurred chart on a phone');
  assert.equal(typeof surfaces.sharing?.share, 'undefined',
    'a browser with no share half must not be handed over as having one');
  assert.equal(typeof surfaces.sharing?.canShare, 'undefined');

  const file = new File(['x'], 'Week.xlsx');
  surfaces.download.download(file);

  assert.deepEqual(created, [file]);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].download, 'Week.xlsx', 'the download would be named by the address, not the title');
  assert.equal(anchors[0].clicked, 1);
});

test('THE REAL BROWSER’S SHARE SHEET IS PASSED THROUGH, and a file list copy is the only change', async () => {
  const asked: { files: File[]; title?: string }[] = [];
  const ownerDocument = {
    createElement: () => ({ href: '', download: '', click() {} }),
  } as unknown as Document;

  // Shaped like the real `navigator`: a MUTABLE file list, which is the whole reason this edge is
  // not a plain hand-over. Nothing else about the request may differ.
  const navigator = {
    canShare: (data: { files: File[] }) => Array.isArray(data.files),
    share: async (data: { files: File[]; title?: string }) => { asked.push(data); },
  };

  const surfaces = browserExportSurfaces(
    ownerDocument, { devicePixelRatio: 1, navigator }, { create: () => 'blob:x', revoke: () => {} },
  );

  const table = dietExportTable(projectWeekChart(aPlan()), 'Priya');
  const report = await sendDietExport('spreadsheet', table, surfaces);

  assert.equal(report.tone, 'delivered');
  assert.equal(asked.length, 1, 'the real share sheet was never reached');
  assert.equal(asked[0].files.length, 1);
  assert.equal(asked[0].files[0].name, `${table.title}.xlsx`);
  assert.equal(asked[0].title, table.title, 'the sheet shows a different name from the file');
});

test('a device that reports no pixel ratio still draws, at one rather than at nothing', () => {
  const ownerDocument = {
    createElement: () => ({ href: '', download: '', click() {} }),
  } as unknown as Document;

  const surfaces = browserExportSurfaces(ownerDocument, {}, { create: () => 'blob:x', revoke: () => {} });

  assert.equal(surfaces.picture.pixelRatio, 1);
});

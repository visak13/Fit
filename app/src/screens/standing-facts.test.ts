/**
 * A STANDING, UNCLEANABLE FACT IS SAID — after the surface that used to say it has gone quiet.
 *
 * ## The gap, exactly
 *
 * `core/outbox/scrub.js` leaves ONE kind of entry alone: an opaque payload naming a departed client
 * and a staying one. `core/INTEGRATION.md` §4 says that conservative choice is CORRECT. The removals
 * screen surfaces it — **only while its deletion manifest is pending**. Once the core confirms the
 * removal propagated the manifest leaves `pendingDeletions`, and the entry, untouched by any of that,
 * survives indefinitely and stops being mentioned anywhere.
 *
 * So the FIRST test below is the whole deliverable: a REAL entry, really swept, whose removal has
 * really been confirmed by a real synchronisation, and the new card still names it. Every assertion
 * in it is ordered so the LOAD-BEARING one reds first — a tally above it would shadow the failure and
 * the break probe would prove the wrong rule.
 *
 * ## The five ways this could be green and worthless
 *
 * **One. The post-window state is fictional.** So nothing here is hand-built: the client is real, the
 * queued entry is really enqueued, `purgeClient` really sweeps it, and the removal is confirmed by a
 * REAL pass. It is asserted, in the same test, that the removals surface has genuinely gone quiet —
 * otherwise the card is only repeating what another screen already says.
 *
 * **Two. It escalates.** The obvious fix is a needs-attention entry, and `core/status/levels.js`
 * floors the ladder at `overdue` while one exists — for ever, on a condition he can never clear. So
 * the whole accountability status is COMPARED before and after this surface reads, and the comparison
 * itself is proved capable of catching an escalation with a rejected entry that really does move it.
 *
 * **Three. The reader is permanently empty and that looks like good news.** So the derived scope is
 * asserted NON-EMPTY in the same run as the planted entry, and the reader is driven over a store with
 * a removal that left nothing behind, so its silence is known to be a finding rather than a habit.
 *
 * **Four. It is a scar rather than a statement.** A manifest records what WAS unresolved. The card
 * must speak for as long as the ENTRY exists and then stop, so the entry is deleted underneath it and
 * the card is asserted to go quiet.
 *
 * **Five. The words never reach the coach.** So the real card is rendered and the sentences are read
 * out of the HTML, including that no warning tone and no emoji reach it in any state.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { aClient } from '../../core/model/fixtures.js';
import { keyedName } from '../../core/outbox/entry.js';
import {
  countByStatus, enqueue, getEntry, recordDelivered, recordRejected,
} from '../../core/outbox/queue.js';
import { STATUS } from '../../core/outbox/entry.js';
import { UNRESOLVED } from '../../core/outbox/scrub.js';
import { accountabilityStatus } from '../../core/status/status.js';
import { deletionForClient, pendingDeletions, purgeClient } from '../../core/store/purge.js';
import { SYNC_TRIGGERS, syncNow } from '../../core/sync/engine.js';
import { T0, aWorld } from '../../core/sync/testing.js';
import { StandingFactsCard } from './AdminScreen.tsx';
import { NO_PASS_HAS_REPORTED, WILL_NOT_CLEAR_ON_ITS_OWN, describeRemovals } from './removals.ts';
import {
  NOT_READ_YET, STANDING_FACTS_TITLE, STILL_HERE_AFTER_THE_REMOVAL_IS_DONE, WHAT_THIS_CARD_IS,
  describeStandingFacts,
} from './standing-facts.ts';
import { publishStandingFacts, readStandingFacts } from './standing-facts-source.ts';
import type { StandingFactsReading } from './standing-facts-source.ts';

/** The departed client's name. Known HERE and deliberately unknown to everything the surface reads. */
const DEPARTED = 'Rekha Iyer';
/** The staying client's name. The reason the entry may not be cleaned, and equally never displayed. */
const STAYING = 'Staying Example';

/** Worlds opened by this file, closed once at the end whatever happened. */
const worlds: ReturnType<typeof aWorld>[] = [];

after(async () => {
  for (const world of worlds) {
    // eslint-disable-next-line no-await-in-loop
    await world.close();
  }
});

/**
 * A REAL uncleanable residual whose removal has been CONFIRMED — the post-window state itself.
 *
 * Nothing is hand-built and no manifest is edited. A genuinely opaque payload naming both clients is
 * enqueued, `purgeClient` really sweeps it and really reports it unresolved, and then an ordinary
 * synchronisation pass — with nothing broken — carries the removal outward and reads the area back,
 * which is what moves the manifest out of the pending set.
 *
 * It is asserted here that the manifest genuinely left the pending set, because that is the induction:
 * if it were still pending, every assertion about this card would be passing in the state the removals
 * screen already covers, and would prove nothing about the gap.
 */
async function aConfirmedRemovalThatLeftSomethingBehind() {
  const world = aWorld();
  worlds.push(world);
  const laptop = await world.device('coach-laptop');

  const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
  const staying = await laptop.store.create('client', aClient({ name: STAYING }), { now: T0 });
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

  const idempotencyKey = 'standing-facts-opaque-shared-1';
  const { entry } = await enqueue(laptop.store, {
    operation: 'create',
    // A SPACE THE REMOTE ACTUALLY HAS. Measured, not assumed: the first version of this fixture used
    // a made-up space name, the double rejected the delivery with `Unknown space "fit"`, and the
    // rejection floored the ladder at overdue — which would have made every claim in this file about
    // escalation a claim about a broken fixture rather than about this surface.
    space: 'visible',
    name: keyedName('progress-report-Q3.xlsx', idempotencyKey),
    idempotency_key: idempotencyKey,
    payload: 'UEsDBBQAAAAI-not-one-of-our-documents-opaque-bytes',
    label: 'Progress reports for two clients',
    refs: [departing.record_id, staying.record_id],
    now: T0,
  });

  world.advance(60_000);
  const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });
  const reported = manifest.outbox.unresolved.filter(
    (held: { entry_id: string }) => held.entry_id === entry.entry_id,
  );
  assert.equal(reported.length, 1, 'the real sweep really did leave it and really did report it');
  assert.equal(reported[0].why, UNRESOLVED.OPAQUE_SHARED);

  // THE ORDINARY PATH, nothing broken. This is what closes the window the removals screen shows in.
  world.advance(60_000);
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

  const settled = await deletionForClient(laptop.store, departing.record_id);
  assert.equal(
    settled?.status,
    'propagated',
    'the removal must be CONFIRMED for this to be the post-window state at all. If the core ever '
      + 'stops confirming it here, this file is testing the state the removals screen already covers '
      + 'and must fail rather than go on passing against the easy case.',
  );

  return { world, laptop, departing, staying, entry, manifest: settled };
}

/**
 * The card, rendered as the admin screen renders it: the real component, the real reading.
 *
 * The markup is decoded back into the words a person reads, because React escapes an apostrophe as
 * `&#x27;` — so a sentence asserted against raw markup would report ABSENT for a sentence that is on
 * the screen, and the fix somebody reaches for is to drop the apostrophe from the copy.
 */
function paint(reading: StandingFactsReading | null): string {
  return renderToStaticMarkup(createElement(StandingFactsCard, { reading }))
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

describe('the fact still stands after the removal is confirmed — the whole gap', () => {
  it('NAMES the surviving entry once the manifest has left the pending set', async () => {
    const { laptop, entry, departing } = await aConfirmedRemovalThatLeftSomethingBehind();

    const reading = await readStandingFacts(laptop.store);

    // THE LOAD-BEARING ASSERTION, FIRST. Anything counted above it would shadow this and a break
    // probe would red on the tally instead of on the rule being probed.
    assert.deepEqual(
      reading.standing.map((fact) => fact.entryId),
      [entry.entry_id],
      'the surviving queued entry is not named by the standing-facts surface. This is the entire gap '
        + 'this card exists to close: the removal is confirmed, the manifest has left the pending '
        + 'set, and a departed client\'s data is still on this device.',
    );

    const fact = reading.standing[0];
    assert.equal(fact.why, UNRESOLVED.OPAQUE_SHARED, 'worded from the declared code, never a message');
    assert.equal(fact.subjectClientId, departing.record_id, 'it says WHICH client departed');
    assert.deepEqual(fact.recordIds, [departing.record_id]);
    assert.equal(fact.removalStatus, 'propagated', 'and it is saying it about a FINISHED removal');

    // THE WINDOW IS GENUINELY SHUT. Without this the card could merely be repeating what the
    // removals screen already says, and the gap would be untested.
    const removals = describeRemovals({
      pending: await pendingDeletions(laptop.store, { limit: 25 }),
      remote: NO_PASS_HAS_REPORTED,
    });
    assert.equal(
      removals.count,
      0,
      'the removals screen has gone quiet, which is what makes this card the only thing saying it',
    );
    assert.equal(removals.leftBehind, 0);
  });

  it('says it in words that reach the coach, and says it is still here after the removal finished', async () => {
    const { laptop, entry } = await aConfirmedRemovalThatLeftSomethingBehind();
    const reading = await readStandingFacts(laptop.store);
    const html = paint(reading);

    assert.ok(
      html.includes(STILL_HERE_AFTER_THE_REMOVAL_IS_DONE),
      'the one sentence said NOWHERE ELSE in this application — that finishing the removal did not '
        + 'take this with it — must reach the screen',
    );
    assert.ok(html.includes(WILL_NOT_CLEAR_ON_ITS_OWN), 'and that it will not clear on its own');
    assert.ok(html.includes(WHAT_THIS_CARD_IS), 'and what this card is, so it does not read as a fault');
    assert.ok(html.includes(entry.entry_id), 'the reference somebody helping him will ask for');
    assert.ok(html.includes(STANDING_FACTS_TITLE));

    // WHERE THAT FILE IS, from the queue's own word for it. The pass delivered it, and a delivered
    // entry is KEPT — so both halves have to be said, and saying only "waiting to go" would be a
    // sentence about a file that has already gone.
    const item = describeStandingFacts(reading).items[0];
    assert.equal(reading.standing[0].entryStatus, 'delivered', 'the real pass really did deliver it');
    assert.ok(
      item.whereItIs.includes('has already gone to your Google Drive'),
      'a delivered residual must not be described as still waiting to go',
    );
    assert.ok(html.includes(item.whereItIs), 'and that reaches the screen');

    // ONE PLACE SAYS WHERE THE FILE IS, and it is the one reading the queue. Found by WALKING the
    // rendered card rather than by asserting: the first version of `stillHere` ended "still waiting
    // to go to your Google Drive", read off the code, and it printed directly above a sentence
    // saying the file had already gone. Two sentences that contradict each other pass every
    // property check ever written about either one of them.
    assert.ok(
      !item.stillHere.includes('waiting to go'),
      'the standing sentence has started claiming where the file is again. That is the queue\'s '
        + 'answer, not this sentence\'s, and hard-coding it contradicts the delivered case.',
    );

    assert.ok(
      !html.includes(DEPARTED) && !html.includes(STAYING),
      'and STILL no name. The manifest keeps identities only, deliberately, so that removing '
        + 'somebody does not leave their name in the record proving they were removed.',
    );
    assert.ok(
      !html.includes('progress-report-Q3.xlsx') && !html.includes('Progress reports for two clients'),
      'the queued file\'s own name and label are content, are not in the manifest, and must not be '
        + 'reconstructed onto a screen that carries identities only',
    );
  });
});

describe('it also speaks while the removal is still being confirmed', () => {
  /**
   * THE CARD IS PERMANENT, so it does not wait for the removals screen to go quiet before it starts.
   * This also drives the OTHER branch of the where-is-it sentence — an entry no pass has delivered —
   * which the confirmed case above can never reach.
   */
  it('names an entry that is still waiting to go, and says so in those words', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('coach-laptop');

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
    const staying = await laptop.store.create('client', aClient({ name: STAYING }), { now: T0 });
    const key = 'standing-facts-still-waiting';
    const { entry } = await enqueue(laptop.store, {
      operation: 'create',
      space: 'visible',
      name: keyedName('progress-report-Q4.xlsx', key),
      idempotency_key: key,
      payload: 'UEsDBBQAAAAI-not-one-of-our-documents-opaque-bytes',
      label: 'Progress reports for two clients',
      refs: [departing.record_id, staying.record_id],
      now: T0,
    });
    world.advance(60_000);
    const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });

    const reading = await readStandingFacts(laptop.store);

    assert.deepEqual(
      reading.standing.map((fact) => fact.entryId),
      [entry.entry_id],
      'the card is permanent, so it says this from the moment the purge reports it — not only once '
        + 'the removals screen has stopped',
    );
    assert.equal(manifest.status, 'pending', 'and this really is the other, earlier state');
    assert.equal(reading.standing[0].entryStatus, 'pending', 'nothing has delivered it');
    assert.ok(
      describeStandingFacts(reading).items[0].whereItIs.includes('waiting to go'),
      'an undelivered residual must be described as still waiting, not as already gone',
    );
  });
});

describe('it does not escalate, and the proof is a comparison rather than an intention', () => {
  it('leaves the WHOLE accountability status identical, and needs-attention at nought', async () => {
    const { laptop } = await aConfirmedRemovalThatLeftSomethingBehind();
    const at = '2026-01-01T00:00:00.000Z';

    const before = await accountabilityStatus(laptop.store, { now: at });
    const reading = await readStandingFacts(laptop.store);
    const afterwards = await accountabilityStatus(laptop.store, { now: at });

    // LOAD-BEARING, FIRST: the ladder is untouched by this surface existing and reading.
    assert.deepEqual(
      { ...afterwards },
      { ...before },
      'reading the standing facts changed the accountability status. This surface may only STATE; '
        + 'the moment it moves the ladder it is an alarm the coach can never clear.',
    );
    assert.equal(
      afterwards.needs_attention,
      0,
      'the uncleanable entry was counted as needing attention. `core/status/levels.js` floors the '
        + 'ladder at overdue while that count is above nought, and this condition can NEVER be '
        + 'cleared — so it would pin the one indicator he is meant to trust at overdue for ever.',
    );
    assert.ok(reading.standing.length > 0, 'and it was saying something while all of that stayed put');
  });

  /**
   * THE NON-VACUITY PROBE ON THE COMPARISON ITSELF.
   *
   * "The status did not change" passes just as happily when the status could not change — a figure
   * this test could not move is a guard that proves nothing. So a REAL rejected entry is recorded on
   * the same store and the same comparison is made: it must move.
   */
  it('and that comparison can genuinely see an escalation — proved by causing one', async () => {
    const { laptop } = await aConfirmedRemovalThatLeftSomethingBehind();
    const at = '2026-01-01T00:00:00.000Z';

    const calm = await accountabilityStatus(laptop.store, { now: at });
    assert.equal(calm.needs_attention, 0, 'the standing fact alone leaves it at nought');

    // A SEPARATE, ORDINARY entry that really does stop. The standing entry itself is not touched:
    // the point is that the ladder CAN move on this store, so its not moving above is a finding.
    const key = 'standing-facts-escalation-probe';
    const { entry: probe } = await enqueue(laptop.store, {
      operation: 'create',
      space: 'visible',
      name: keyedName('anything.json', key),
      idempotency_key: key,
      payload: '{"document_version":1,"records":[]}',
      label: 'An ordinary change',
      refs: [],
      now: at,
    });
    await recordRejected(laptop.store, probe.entry_id, new Error('the service refused it'), { now: at });
    const escalated = await accountabilityStatus(laptop.store, { now: at });

    assert.ok(
      escalated.needs_attention > 0,
      'the escalation detector cannot fire at all, so the assertion above proves nothing',
    );
    assert.notEqual(
      escalated.level,
      calm.level,
      'and the LEVEL moves with it — which is exactly what routing an uncleanable fact here would '
        + 'do permanently, and is why this card does not',
    );
  });
});

describe('the scope is discovered, and it is not empty', () => {
  it('measures what it read, in the same run that it finds the planted entry', async () => {
    const { laptop, entry } = await aConfirmedRemovalThatLeftSomethingBehind();
    const reading = await readStandingFacts(laptop.store);

    assert.equal(reading.standing[0]?.entryId, entry.entry_id, 'the planted entry is found');
    assert.ok(
      reading.manifestsRead > 0,
      'the manifest walk read NOTHING, so a reader that can never find anything would pass every '
        + 'other assertion in this file by returning an empty list',
    );
    assert.ok(reading.reportedUnresolved > 0, 'and the purges really did report something to look up');
    assert.equal(reading.complete, true, 'the walk reached the end rather than stopping short');
  });

  it('is silent about a removal that left nothing behind, which is almost every one', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('coach-laptop');

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    world.advance(60_000);
    await purgeClient(laptop.store, departing.record_id, { now: world.now() });

    const reading = await readStandingFacts(laptop.store);

    assert.deepEqual(reading.standing, [], 'nothing was left behind, so nothing is said');
    assert.ok(
      reading.manifestsRead > 0,
      'and it read a real removal while saying so — the silence is a finding, not a habit',
    );
    assert.equal(describeStandingFacts(reading).state, 'settled');
  });
});

describe('it speaks for as long as the entry exists, and then stops', () => {
  it('goes quiet when the queued entry is finally gone', async () => {
    const { laptop, entry } = await aConfirmedRemovalThatLeftSomethingBehind();

    const whileItExists = await readStandingFacts(laptop.store);
    assert.equal(whileItExists.standing.length, 1, 'the control: it is being said while it is true');

    // THE REAL ROUTE OUT OF THE QUEUE, AND IT IS NOW THE ONLY ONE THERE IS: the entry is delivered,
    // and LATER DELIVERIES push it past the bound `core/outbox` applies inside the delivery itself.
    // There is deliberately no prune to call — that export was removed precisely so that nothing
    // could decline to call it — so this drives the real growth path instead. The card must follow
    // the QUEUE and not the manifest, which keeps its record of what was unresolved for ever.
    await recordDelivered(laptop.store, entry.entry_id, { now: T0 });

    const tight = { max: 2, batch: 1, ceiling: 2 };
    for (const key of ['a-later-delivery', 'a-later-delivery-still']) {
      // eslint-disable-next-line no-await-in-loop
      const { entry: filler } = await enqueue(laptop.store, {
        operation: 'create',
        space: 'visible',
        name: keyedName('anything.json', key),
        idempotency_key: key,
        payload: '{"document_version":1,"records":[]}',
        label: 'An ordinary change that landed later',
        refs: [],
        now: T0,
      });
      // eslint-disable-next-line no-await-in-loop
      await recordDelivered(laptop.store, filler.entry_id, { now: T0, retention: tight });
    }

    assert.equal(
      await getEntry(laptop.store, entry.entry_id), undefined,
      'the entry was not actually removed, so the silence below would be a fluke',
    );
    assert.ok(
      await countByStatus(laptop.store, STATUS.DELIVERED) > 0,
      'and the bound did not empty the queue, which would make the silence below mean nothing',
    );

    const afterwards = await readStandingFacts(laptop.store);

    assert.deepEqual(
      afterwards.standing,
      [],
      'the card is still naming an entry the queue no longer holds. It would be reciting history: '
        + 'the manifest remembers what was unresolved for ever, and this surface is about now.',
    );
    assert.ok(
      afterwards.reportedUnresolved > 0,
      'and the manifest still reports it, which is what makes the silence above a real lookup rather '
        + 'than an empty scan',
    );
    assert.equal(await getEntry(laptop.store, entry.entry_id), undefined);
  });
});

describe('every state of this card is calm, and it says when it has not looked', () => {
  it('never takes a warning tone, in any state it can produce', async () => {
    const { laptop } = await aConfirmedRemovalThatLeftSomethingBehind();
    const standing = describeStandingFacts(await readStandingFacts(laptop.store));
    const settled = describeStandingFacts({
      manifestsRead: 1, reportedUnresolved: 0, standing: [], complete: true,
    });
    const notKnown = describeStandingFacts(null);

    for (const report of [standing, settled, notKnown]) {
      assert.ok(
        report.tone === 'neutral' || report.tone === 'success',
        `the ${report.state} state took a fault tone. A condition that can never be cleared may not `
          + 'be drawn as a fault, or the card becomes a permanent alarm — which is the whole reason '
          + 'it exists instead of a needs-attention entry.',
      );
    }

    const html = paint(await readStandingFacts(laptop.store));
    assert.ok(
      !html.includes('chip-warning') && !html.includes('chip-danger')
        && !html.includes('note-warning') && !html.includes('note-danger'),
      'a warning was drawn on the one card that may never raise its voice',
    );
    // NON-VACUITY on that scan: the same rendering really does carry the classes it is allowed.
    assert.ok(html.includes('chip'), 'the render carries no chip at all, so the scan above proved nothing');
  });

  it('never says the reassuring sentence about a device it has not read', () => {
    const notKnown = describeStandingFacts(null);
    const settled = describeStandingFacts({
      manifestsRead: 3, reportedUnresolved: 0, standing: [], complete: true,
    });

    assert.equal(notKnown.state, 'not-known');
    assert.equal(notKnown.intro, NOT_READ_YET);
    assert.notEqual(
      notKnown.intro,
      settled.intro,
      '"nothing was left behind" and "this app has not looked" are different facts, and only one of '
        + 'them is reassuring. A card that cannot tell them apart says the good news having never looked.',
    );
    assert.ok(paint(null).includes(NOT_READ_YET), 'and the unread state reaches the screen as itself');
  });

  it('carries no emoji anywhere in what it renders', async () => {
    const { laptop } = await aConfirmedRemovalThatLeftSomethingBehind();
    const html = paint(await readStandingFacts(laptop.store));

    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, 'an emoji reached a user-facing string');
    assert.ok(html.length > 0);
  });
});

describe('the card is really wired into the admin screen', () => {
  /**
   * A CALLER WIRED TO A SEAM THAT NEVER FIRES PASSES EVERY OTHER TEST IN THIS FILE.
   *
   * The reading is produced by an effect, and `renderToStaticMarkup` never runs one — so the words
   * cannot be read out of a full admin render, and the wire has to be checked where it is written.
   * The scan is paired with a KNOWN POSITIVE so it cannot pass by failing to find the file.
   */
  it('reads the store and draws the card, checked in the screen itself', () => {
    const screen = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');

    assert.match(
      screen,
      /publishStandingFacts\(store, setStandingFacts\)/u,
      'the admin screen no longer reads the standing facts from the store, so the card would sit in '
        + 'its "not known yet" state for ever',
    );
    assert.match(screen, /<StandingFactsCard reading=\{standingFacts\}/u, 'the card is not drawn');
    // NON-VACUITY: the file really was read and really is the admin screen.
    assert.match(screen, /export function AdminScreen/u, 'the scan did not read the admin screen at all');
  });

  it('publishes a real reading through the exact call the screen makes', async () => {
    const { laptop, entry } = await aConfirmedRemovalThatLeftSomethingBehind();

    const published = await new Promise<StandingFactsReading>((resolve) => {
      publishStandingFacts(laptop.store, resolve);
    });

    assert.deepEqual(published.standing.map((fact) => fact.entryId), [entry.entry_id]);
  });
});

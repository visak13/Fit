/**
 * THE HONEST STATEMENT — what this application can actually promise about the coach's data.
 *
 * Promise nothing the platform cannot do. There is NO background synchronisation, there is no
 * synchronisation while the application is closed, and the local data does not survive removing the
 * installed icon. None of those is a defect to be fixed later: the first two are structural — a
 * browser-only application on a static origin obtains a roughly one-hour foreground-only access token
 * and no refresh token, and iOS provides no background sync — and the third is how the platform stores
 * data for an installed web application.
 *
 * The wording is the user's own restatement, kept here as data so that the interface, the setup guide
 * and the tests all quote ONE copy. Three copies of a promise drift, and the copy that drifts is the
 * one that ends up promising something.
 *
 * ## Why the promises and the limits are separate fields
 *
 * A single paragraph mixing "it backs up when you open it" with "it cannot back up in the background"
 * is one editor away from losing its second half. Split, the promises can be asserted to contain no
 * claim about background or automatic behaviour, and the limits can be asserted to be present at all.
 * A test does exactly that, over the fields, which is the only form of this rule that survives someone
 * rewording it.
 */

/**
 * What the application genuinely does. Every sentence here is a claim it can keep.
 * @type {Readonly<Record<string, string>>}
 */
export const PROMISES = Object.freeze({
  saves: 'Everything you enter is saved on this device the moment you enter it, with or without a connection.',
  backs_up: 'It backs up to your Google Drive when you open the app, when you leave it, and whenever you tap Sync.',
  never_lost: 'If a backup cannot go through, your work waits in a queue on this device until it can. It is a delay, never a loss.',
  always_visible: 'The last backup time and the number of changes waiting are shown at all times.',
});

/**
 * What it cannot do. Each of these is here because the alternative is the coach discovering it the
 * hard way, on a day when it matters.
 * @type {Readonly<Record<string, string>>}
 */
export const LIMITS = Object.freeze({
  no_background_sync: 'It cannot back up in the background. Backing up only happens while the app is open in front of you.',
  no_sync_while_closed: 'It cannot back up while the app is closed.',
  icon_deletion_destroys_data: 'Do not delete the app icon from your phone. Removing it deletes everything this app has stored on the device.',
  reconnect_hourly: 'Google access lasts about an hour of active use, so you will be asked to reconnect from time to time. It takes one tap.',
});

/**
 * The five moments a backup is attempted, in plain words. There is no sixth, and none of them happens
 * without the coach being there — which is precisely why they are worth listing.
 * @type {readonly string[]}
 */
export const BACKUP_OPPORTUNITIES = Object.freeze([
  'when you open the app',
  'when you come back to it',
  'when you leave it',
  'every so often while it is open',
  'whenever you tap Sync',
]);

/**
 * Words that may not appear in a PROMISE, because each of them claims something this application
 * cannot do. They are perfectly allowed in {@link LIMITS}, where they appear as denials.
 * @type {readonly string[]}
 */
export const FORBIDDEN_IN_PROMISES = Object.freeze([
  'background',
  'automatic',
  'automatically',
  'while the app is closed',
  'even when closed',
  'continuously',
]);

/**
 * The whole statement, ready to be read out on a setup page or a status panel.
 * @type {Readonly<{promises: Readonly<Record<string, string>>, limits: Readonly<Record<string, string>>, opportunities: readonly string[]}>}
 */
export const PLATFORM_STATEMENT = Object.freeze({
  promises: PROMISES,
  limits: LIMITS,
  opportunities: BACKUP_OPPORTUNITIES,
});

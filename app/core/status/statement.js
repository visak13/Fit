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
  // THIS NAMES NO CONTROL, ON PURPOSE. It used to say "whenever you tap Sync", and NO CONTROL IN
  // THIS APPLICATION IS CALLED SYNC — the act was real, the referent was invented. The obvious
  // repair is to name the real one, "Back up now" (`src/shell/action-destinations.ts`), and this
  // deliberately does not: a promise that names a button is only true while that button is on
  // screen, and whether this one is displayed at rest on a wide window is an OPEN QUESTION at the
  // time of writing (`console.css` hides `.sync-act` above 840px until the rail is hovered or
  // focused — read off the stylesheet, not yet confirmed in a browser). "whenever you ask it to"
  // is true on every window at every width, and it is the right register for a PROMISE about what
  // the application can do rather than an instruction about where to press.
  backs_up: 'It backs up to your Google Drive when you open the app, when you leave it, and whenever you ask it to.',
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
 * The moments a backup is attempted, in plain words — one for each opportunity `SYNC_TRIGGER_VALUES`
 * declares, and none of them happens without the coach being there, which is precisely why they are
 * worth listing. `statement.test.js` cross-checks the two lists rather than restating either.
 *
 * "when the connection comes back" is the `reconnect` opportunity, and it belongs here for the reason
 * the whole list does: the trigger of a completed backup is persisted and read back to him, so a
 * moment the application really acts on and never names reads, to him, as a backup that happened for
 * no reason he was given. It says nothing about the app being closed, because it cannot happen then.
 *
 * LIKE {@link PROMISES.backs_up}, THE LAST ONE NAMES NO CONTROL. It read "whenever you tap Sync"
 * until this edit — the same invented referent, in the same file, one field away from the one that
 * was corrected first. The act is really called "Back up now"
 * (`src/shell/action-destinations.ts`), and naming it here would still be wrong: the control is
 * `display:none` at rest at >=840px until the rail is hovered or focused (MEASURED live), so a
 * sentence naming it would name a conditionally-present control. "whenever you ask it to" is true
 * at every width.
 * @type {readonly string[]}
 */
export const BACKUP_OPPORTUNITIES = Object.freeze([
  'when you open the app',
  'when you come back to it',
  'when the connection comes back while you are using it',
  'when you leave it',
  'every so often while it is open',
  'whenever you ask it to',
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

/**
 * GETTING THE ARTEFACT TO THE CLIENT, AND SAYING HONESTLY WHICH WAY IT WENT.
 *
 * The share sheet is the path the coach wants: he taps, the phone offers his messaging
 * applications, the file goes. It was proven on the installed iOS app in the s1 platform spike, and
 * it is the reason the exports here are files rather than links.
 *
 * **It is not universally available, and that is the whole difficulty.** On a desktop browser, on a
 * browser without file sharing, and on a platform that declines this particular type, the coach must
 * still end up holding his artefact. So the capability is DETECTED — including `canShare` for the
 * actual file, because a browser can have a share sheet that refuses spreadsheets — and where it is
 * not there the file downloads instead.
 *
 * ## THE TWO SENTENCES THIS FILE EXISTS TO GET RIGHT
 *
 * **A share that did not happen is never reported as delivered.** A fallback download is a
 * DIFFERENT outcome with a different name, and the caller is told which one it got. The failure
 * being prevented is specific: the coach taps Share, nothing appears, the app says "Sent", and he
 * finds out days later that a client never received the week's chart.
 *
 * **A cancellation is not a failure.** Dismissing the share sheet is a decision, and every browser
 * reports it as a thrown `AbortError` — the same shape as a genuine error. Telling a coach that
 * something went wrong because he changed his mind teaches him to distrust the message that matters.
 * He gets no download he did not ask for either: he closed the sheet.
 *
 * ## The platform is an argument
 *
 * Nothing here reaches for `navigator` or `document`. They arrive through {@link SharingSurface} and
 * {@link DownloadSurface}, which is what lets the capability-present, capability-absent and
 * cancelled paths all be driven in a test — the three paths that decide whether the coach is told
 * the truth.
 */

/** The share payload, reduced to what this application sends: files, with a name for the sheet. */
export interface ShareRequest {
  readonly files: readonly File[];
  readonly title?: string;
  readonly text?: string;
}

/**
 * The share half of `navigator`, as this application uses it.
 *
 * Both members are optional because both are genuinely absent on browsers this must work on, and
 * treating either as present is how a desktop tap becomes a thrown error instead of a download.
 */
export interface SharingSurface {
  share?(request: ShareRequest): Promise<void>;
  canShare?(request: ShareRequest): boolean;
}

/** Where a file goes when it cannot be shared. */
export interface DownloadSurface {
  download(file: File): void;
}

/**
 * What actually happened. Four outcomes, each meaning exactly one thing.
 *
 * - `shared` — the platform accepted the file. The ONLY outcome that may be worded as sent.
 * - `downloaded` — it did not, so the file is on the device instead; `because` says why, in words
 *   the coach can read.
 * - `cancelled` — he dismissed the sheet. Not an error, and nothing was delivered.
 * - `failed` — neither path worked. Says why.
 */
export type Delivery =
  | { readonly outcome: 'shared' }
  | { readonly outcome: 'downloaded'; readonly because: string }
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'failed'; readonly because: string };

export interface DeliveryDependencies {
  /** Absent when the browser has no share sheet at all. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
  /** Shown by the share sheet beside the file. The table's own title. */
  readonly title?: string;
}

/** Why the file downloaded instead, when the platform never offered to share it. */
const CANNOT_SHARE_FILES = 'This browser cannot share files, so the file was saved to this device instead.';

/** Why it downloaded instead, when the platform refused this particular file. */
const WILL_NOT_SHARE_THIS = 'This device would not share this kind of file, so it was saved to this device instead.';

/**
 * Hand a file to the share sheet, or to a download, and report which.
 *
 * Never throws. Every path ends in a {@link Delivery} the caller can word for the coach, because an
 * exception escaping here is an exception a screen turns into "something went wrong", which is the
 * one thing this file exists to prevent.
 */
export async function deliverFile(file: File, dependencies: DeliveryDependencies): Promise<Delivery> {
  const { sharing, download, title } = dependencies;
  const request: ShareRequest = title === undefined ? { files: [file] } : { files: [file], title };

  if (!sharing || typeof sharing.share !== 'function') {
    return downloadInstead(file, download, CANNOT_SHARE_FILES);
  }

  // `canShare` is asked about THIS FILE, not about sharing in general: a browser may have a share
  // sheet, offer text through it, and decline a workbook. A missing `canShare` beside a present
  // `share` is treated as unable to share files — the file-sharing capability arrived in the same
  // revision as `canShare`, so its absence means files were never supported here.
  if (typeof sharing.canShare !== 'function') {
    return downloadInstead(file, download, CANNOT_SHARE_FILES);
  }

  let permitted: boolean;
  try {
    permitted = sharing.canShare(request);
  } catch {
    // A `canShare` that throws has told us it cannot, in the least helpful way available.
    permitted = false;
  }
  if (!permitted) return downloadInstead(file, download, WILL_NOT_SHARE_THIS);

  try {
    await sharing.share(request);
    return { outcome: 'shared' };
  } catch (error) {
    if (wasCancelled(error)) return { outcome: 'cancelled' };

    // The sheet was offered and something went wrong inside it. He still needs the file, so the
    // download runs — and the outcome still says it was NOT shared.
    const because = error instanceof Error ? error.message : String(error);
    return downloadInstead(file, download, `The share sheet could not send it (${because}), so the file was saved to this device instead.`);
  }
}

/**
 * Whether a thrown value is the coach closing the sheet.
 *
 * `AbortError` is what every implementation of the share sheet throws on dismissal. The message is
 * checked as well because it is what a browser that predates the name reports, and reading a
 * cancellation as a failure is the more expensive mistake of the two.
 */
export function wasCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const named = error as { name?: unknown; message?: unknown };
  if (named.name === 'AbortError') return true;

  const message = typeof named.message === 'string' ? named.message.toLowerCase() : '';
  return message.includes('abort') || message.includes('cancel');
}

/** The download path, with its own failure handled rather than thrown. */
function downloadInstead(file: File, download: DownloadSurface, because: string): Delivery {
  try {
    download.download(file);
    return { outcome: 'downloaded', because };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { outcome: 'failed', because: `${because} That did not work either (${reason}).` };
  }
}

/**
 * One sentence for the coach, written here so no screen has to invent one — and so no screen can
 * word a fallback or a cancellation as a delivery.
 */
export function describeDelivery(delivery: Delivery, fileName: string): string {
  switch (delivery.outcome) {
    case 'shared':
      return `${fileName} was handed to the share sheet.`;
    case 'downloaded':
      return `${fileName} was saved to this device. ${delivery.because}`;
    case 'cancelled':
      return 'Nothing was sent — you closed the share sheet.';
    case 'failed':
      return `${fileName} could not be sent. ${delivery.because}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// The real browser, wired at the edge
// ═══════════════════════════════════════════════════════════════════════════════

/** The anchor a download is performed through, reduced to what is used. */
export interface AnchorLike {
  href: string;
  download: string;
  click(): void;
}

/** Where an anchor comes from. `document` in the application. */
export interface AnchorHost {
  createAnchor(): AnchorLike;
}

/**
 * The share half of the REAL `navigator`, as the browser's own types declare it.
 *
 * It is nearly {@link SharingSurface} and not quite: this layer takes `readonly File[]`, because a
 * request it has been handed is not a thing it should be able to alter, and the browser declares
 * `File[]`. A readonly array is not assignable to a mutable one, so the real `navigator` does not
 * structurally satisfy the interface written for it — a fact about the two type DECLARATIONS and
 * about nothing else, since both mean the same thing at runtime.
 */
export interface BrowserSharing {
  share?(data: { files: File[]; title?: string; text?: string }): Promise<void>;
  canShare?(data: { files: File[]; title?: string; text?: string }): boolean;
}

/**
 * THE REAL `navigator` AS A {@link SharingSurface} — the bridge across that mismatch, ONCE.
 *
 * It lives HERE, beside the interface it adapts to, rather than in whichever screen first needed a
 * share sheet. The reason is the one this whole seam exists for: the diet export met this mismatch
 * first and `s9` will meet the identical one for the progress report and the full data export. A
 * bridge kept in the first caller is a bridge the second caller cannot find, so the second caller
 * writes its own — and the two agree until the day they do not.
 *
 * There is NO CAST and no `as unknown as` anywhere on this path, deliberately: the honest way across
 * is to declare the browser's actual shape and COPY the array, which is a real conversion rather
 * than a lie told to the type checker. The method is bound so `this` survives being pulled off
 * `navigator` — an unbound `share` throws `Illegal invocation` in every browser, and it would throw
 * at the moment the coach taps Send rather than anywhere a check would see it.
 *
 * Whichever members the browser actually has are carried across as they are, and a browser with
 * neither yields a surface with neither — which {@link deliverFile} already reads as "cannot share
 * files" and answers with a download. The two capability questions are NOT re-asked here.
 */
export function browserSharing(browser: BrowserSharing | undefined): SharingSurface {
  const surface: SharingSurface = {};
  if (browser === undefined) return surface;

  if (typeof browser.share === 'function') {
    const share = browser.share.bind(browser);
    surface.share = (request) => share({ ...request, files: [...request.files] });
  }
  if (typeof browser.canShare === 'function') {
    const canShare = browser.canShare.bind(browser);
    surface.canShare = (request) => canShare({ ...request, files: [...request.files] });
  }

  return surface;
}

/** Object URLs, named so a test can count the revocations. */
export interface ObjectUrls {
  create(file: File): string;
  revoke(url: string): void;
}

/**
 * A download through a temporary anchor and an object URL.
 *
 * Two decisions, both of which are the difference between a file arriving and not:
 *
 * **The URL is always revoked**, on the failure path as well as the success path. An object URL that
 * is never revoked pins the entire file in memory, and a coach exporting a week at a time on a phone
 * is exactly who pays for that.
 *
 * **It is revoked LATER, not in the same turn as the click.** Revoking immediately after `click()`
 * has been observed to cancel the download outright on some browsers, because the navigation the
 * click started has not read the URL yet. So the revoke is deferred by default, and the deferral is
 * an argument so a test can run it and prove the revoke really happens.
 */
export function anchorDownload(
  host: AnchorHost,
  urls: ObjectUrls,
  defer: (release: () => void) => void = (release) => { setTimeout(release, 0); },
): DownloadSurface {
  return {
    download(file: File): void {
      const url = urls.create(file);
      try {
        const anchor = host.createAnchor();
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
      } finally {
        defer(() => { urls.revoke(url); });
      }
    },
  };
}

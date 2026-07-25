/**
 * THE BROWSER'S OWN CHROME, COLOURED FROM THE TOKEN LAYER RATHER THAN FROM A COPY OF IT.
 *
 * `<meta name="theme-color">` tints the surround the browser draws around the page — the address
 * bar, and on an installed application the status bar area the coach sees all evening. It accepts
 * only a literal colour; `var(--surface-page)` in it does nothing.
 *
 * Writing the value into `index.html` would therefore put a palette colour outside the token layer,
 * in the one file nobody thinks to grep, where the contrast harness cannot see it and a theme change
 * cannot reach it. So the value is READ BACK from the page's own computed style instead: whatever
 * `--surface-page` resolves to right now, for the palette and theme currently bound, is what the
 * browser is told. There is one source of truth and it follows the theme by construction.
 *
 * The tag is watched rather than pushed to. Anything that changes `data-theme` — the pre-paint
 * bootstrap, the controller in `theme.ts`, a device switching to dark in the evening — is followed
 * without having to know this module exists.
 */

/** The meta tag being coloured. */
export interface ChromeMeta {
  setAttribute(name: string, value: string): void;
}

/** The token whose value the browser's surround is painted with: the floor of the interface. */
export const CHROME_COLOUR_TOKEN = '--surface-page';

/** The attribute observed, so the colour follows a theme change from any source. */
export const THEME_ATTRIBUTE = 'data-theme';

/**
 * Writes the current surface colour onto the tag, and answers what it wrote.
 *
 * An empty answer means the stylesheet has not resolved yet — during a cold start, or where the
 * token layer failed to load at all. The tag is left ALONE in that case rather than being set to
 * something invented: an uncoloured surround is the browser's own default and looks deliberate,
 * whereas a guessed colour is a wrong one that no theme change will ever correct.
 */
export function applyBrowserChromeColour(dependencies: {
  meta: ChromeMeta;
  readSurfaceColour: () => string;
}): string | null {
  const colour = dependencies.readSurfaceColour().trim();
  if (colour === '') return null;
  dependencies.meta.setAttribute('content', colour);
  return colour;
}

/**
 * Follows the theme for the lifetime of the application, and returns the way to stop.
 *
 * Everything real arrives from the browser here; the decision this module actually makes is in
 * `applyBrowserChromeColour`, which is where the test is. Returns a no-op stop when the page has no
 * such tag, so a document that chooses not to carry one is not an error.
 */
export function startBrowserChromeColour(target: Document = document): () => void {
  const root = target.documentElement;
  const meta = target.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) return () => {};

  const readSurfaceColour = () =>
    target.defaultView?.getComputedStyle(root).getPropertyValue(CHROME_COLOUR_TOKEN) ?? '';

  const sync = () => {
    applyBrowserChromeColour({ meta, readSurfaceColour });
  };

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });

  return () => observer.disconnect();
}

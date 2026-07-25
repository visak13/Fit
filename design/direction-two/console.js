/*
 * DIRECTION TWO — CONSOLE — the sheet's own controls.
 *
 * Plain browser JavaScript, no dependency and no build step, and deliberately small: this
 * file exists so the sheet can be SWITCHED, not so the mockups can behave like the real
 * application. Four jobs and nothing else.
 *
 *   1. Read `theme`, `width`, `frames` and `only` from the query string, so another document
 *      can open this one already in a chosen state rather than having to press a control here.
 *      Theme, width and only are a shared contract across all three directions:
 *          index.html?theme=dark
 *          index.html?width=phone
 *          index.html?only=session-runner
 *          index.html?theme=dark&width=laptop&frames=unrolled
 *      Theme lands on the root element as `data-theme`, which is exactly how the shared
 *      token layer switches light and dark. Width lands as `data-width`, which shows or
 *      hides the laptop and phone frames. Frames is Console's own and chooses whether a
 *      frame scrolls inside its own height or unrolls to its full length. Only shows one
 *      named screen and hides the rest of the sheet around it.
 *   2. Wire the theme, width, frame and rail controls in the sheet bar, and keep the query
 *      string in step with them so any state on screen can be linked to.
 *   3. Let the rail be HELD open, so the expanded state can be read without a pointer
 *      hovering it. The hover and keyboard-focus expansion is CSS and needs nothing here;
 *      this only pins it.
 *   4. Let a tooltip that is shown open be closed, so a reviewer can see the target
 *      underneath it. Nothing here opens one — the three that are open are open in the
 *      markup, because a tooltip that must be hovered to be found is a tooltip nobody reads
 *      over a video call.
 *
 * Every state this file can produce is also reachable without it: the document's default is
 * the light theme with both widths visible, the rail expands on hover and on focus in CSS
 * alone, and the tooltips are open in the markup. With scripting off the sheet is still
 * readable, which is the bar a design sheet should meet.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEMES = ['light', 'dark'];
  var WIDTHS = ['both', 'laptop', 'phone'];
  /* device: each frame scrolls inside its own height, so the sticky content header and the
   * always-visible status bar can be seen doing their job. unrolled: the height comes off
   * and a whole screen can be read in one go. */
  var FRAMES = ['device', 'unrolled'];

  function oneOf(allowed, value, fallback) {
    return allowed.indexOf(value) === -1 ? fallback : value;
  }

  /* ── 1. the query string is the outside world's way in ─────────────────────────────── */
  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      theme: oneOf(THEMES, params.get('theme'), root.getAttribute('data-theme') || 'light'),
      width: oneOf(WIDTHS, params.get('width'), 'both'),
      frames: oneOf(FRAMES, params.get('frames'), 'device'),
      only: params.get('only') || '',
    };
  }

  /*
   * ONE SCREEN ALONE, and it is what makes a three-way comparison possible: the comparison
   * page embeds this document alongside its two siblings, each opened at the SAME screen, so
   * the user compares one screen three ways rather than three whole sheets. All three
   * directions answer to the same parameter and the same screen names.
   *
   * The sheet's own bar and its introduction go too. They are this document's furniture, not
   * Console's design, and leaving them in a comparison frame would put three different
   * headings around three screens that are supposed to differ only by direction.
   *
   * Hidden rather than removed: nothing about the rendering of the surviving section changes,
   * and an unknown name leaves the whole sheet visible rather than producing a blank page.
   *
   * The explicit `display` alongside `hidden` is NOT belt-and-braces. `.sheet-bar` carries an
   * author rule of `display: flex`, and an author rule beats the user-agent's own
   * `[hidden] { display: none }` on specificity, so the bar would stay on screen with the
   * attribute set and everything reading as if it had worked. That failure was measured in
   * this build rather than guessed at.
   */
  function applyOnly(only) {
    if (!only) return;
    var wanted = document.getElementById(only);
    if (!wanted) return;

    root.setAttribute('data-only', only);
    each('.sheet-section, .sheet-bar', function (part) {
      if (part === wanted) return;
      part.hidden = true;
      part.style.display = 'none';
    });
  }

  /* Reflected back into the address bar so any state on screen can be linked to directly.
   * replaceState rather than pushState: pressing a control on a review sheet should not
   * fill the back button with theme changes. */
  function writeQuery(state) {
    if (!window.history || !window.history.replaceState) return;
    var params = new URLSearchParams(window.location.search);
    params.set('theme', state.theme);
    params.set('width', state.width);
    params.set('frames', state.frames);
    window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
  }

  /* ── 2. applying state ────────────────────────────────────────────────────────────── */
  function apply(state) {
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-width', state.width);
    root.setAttribute('data-frames', state.frames);

    setPressed('[data-set-theme]', 'data-set-theme', state.theme);
    setPressed('[data-set-width]', 'data-set-width', state.width);
    setPressed('[data-set-frames]', 'data-set-frames', state.frames);

    /* Hiding rather than restyling: a frame declares its own width, and the width control
     * chooses which of them is on screen. Nothing about either layout changes. */
    each('[data-width-role]', function (frame) {
      var role = frame.getAttribute('data-width-role');
      frame.hidden = state.width !== 'both' && state.width !== role;
    });
  }

  function setPressed(selector, attribute, value) {
    each(selector, function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === value));
    });
  }

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  var state = readQuery();
  apply(state);
  applyOnly(state.only);

  each('[data-set-theme]', function (button) {
    button.addEventListener('click', function () {
      state.theme = button.getAttribute('data-set-theme');
      apply(state);
      writeQuery(state);
    });
  });

  each('[data-set-width]', function (button) {
    button.addEventListener('click', function () {
      state.width = button.getAttribute('data-set-width');
      apply(state);
      writeQuery(state);
    });
  });

  each('[data-set-frames]', function (button) {
    button.addEventListener('click', function () {
      state.frames = button.getAttribute('data-set-frames');
      apply(state);
      writeQuery(state);
    });
  });

  /* ── 3. pinning the rail open ─────────────────────────────────────────────────────── */
  each('[data-toggle-rails]', function (button) {
    button.addEventListener('click', function () {
      var held = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(held));
      /* The two rails in the navigation section are shown deliberately at rest and
       * deliberately expanded, side by side; this control must not collapse the one whose
       * whole job is to be expanded, so it leaves any rail that was authored open alone. */
      each('.rail', function (rail) {
        if (rail.getAttribute('data-expanded') === 'true' && !held) {
          if (rail.hasAttribute('data-expanded-by-author')) return;
        }
        if (held) {
          if (rail.getAttribute('data-expanded') === 'true') rail.setAttribute('data-expanded-by-author', '');
          rail.setAttribute('data-expanded', 'true');
        } else if (!rail.hasAttribute('data-expanded-by-author')) {
          rail.removeAttribute('data-expanded');
        }
      });
    });
  });

  /* ── 4. closing a tooltip that was shown open ─────────────────────────────────────── */
  each('.tip-bubble.is-open', function (bubble) {
    bubble.addEventListener('click', function () { bubble.classList.remove('is-open'); });
  });
}());

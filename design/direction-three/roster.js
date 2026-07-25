/*
 * DIRECTION THREE — ROSTER. The sheet's only script.
 *
 * Plain browser script, no module system, no dependency, no build step. It exists for three
 * reasons and does nothing else:
 *
 *   1. THE THEME SWITCH. A direction that ships one theme and promises the other has not
 *      been built, so both are present in the shared token layer and this flips between
 *      them. It is a switch rather than a preference because the point of the sheet is to
 *      be able to see both.
 *   2. THE WIDTH SWITCH, and the phone push. Selecting an item on a phone pushes the detail
 *      over the list and the labelled control returns — that is a claim about the
 *      information architecture, and a claim about behaviour has to be demonstrable rather
 *      than described.
 *   3. THE SHARED ADDRESSING CONTRACT. A later step builds the page the user actually
 *      chooses from, and its whole job is showing THE SAME SCREEN in all three directions at
 *      once. So this document can be opened directly at one screen, in a chosen theme, at a
 *      chosen width, from outside — ?only=session-runner&theme=dark&width=phone — rather
 *      than requiring anyone to find and click a switch first.
 *
 * Nothing here is application logic. There is no state to persist, nothing syncs, and no
 * record is written: this is a set of screens to judge the feel of, not a prototype of the
 * application.
 */

(function () {
  'use strict';

  var ROOT = document.documentElement;

  /* The query parameters this document honours, and the only ones. */
  var PARAM_THEME = 'theme';
  var PARAM_WIDTH = 'width';
  var PARAM_ONLY = 'only';
  var PARAM_STAGE = 'stage';

  var THEME_DARK = 'dark';
  var THEME_LIGHT = 'light';
  var WIDTH_PHONE = 'phone';
  var WIDTH_LAPTOP = 'laptop';

  var params = new URLSearchParams(window.location.search);

  /* ── Theme ─────────────────────────────────────────────────────────────────────────────
   *
   * The shared token layer switches theme on one attribute on the root element: the same
   * token NAMES with different values, never a second stylesheet. So there is exactly one
   * thing to set here.
   */
  function applyTheme(theme) {
    if (theme === THEME_DARK) {
      ROOT.setAttribute('data-theme', THEME_DARK);
    } else {
      ROOT.removeAttribute('data-theme');
    }
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      var isDark = theme === THEME_DARK;
      toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      /*
       * The label says which theme the press will GIVE you, not which one you are in. A
       * toggle labelled with its current state reads as a claim about now and gets pressed
       * by mistake.
       */
      toggle.querySelector('[data-role="theme-label"]').textContent =
        isDark ? 'Switch to light' : 'Switch to dark';
    }
  }

  function currentTheme() {
    return ROOT.getAttribute('data-theme') === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  }

  /* ── Width ─────────────────────────────────────────────────────────────────────────────
   *
   * Forces every laptop frame to the phone width. It changes the width available to the
   * frame, which is what the layout rules are written against, so the reduction happens
   * down the same single path a real narrow window would take. There is no second design to
   * switch to.
   */
  function applyWidth(width) {
    if (width === WIDTH_PHONE) {
      ROOT.setAttribute('data-width', WIDTH_PHONE);
    } else {
      ROOT.removeAttribute('data-width');
    }
    showOnlyTheFramesFor(width);
    var toggle = document.getElementById('width-toggle');
    if (toggle) {
      var isPhone = width === WIDTH_PHONE;
      toggle.setAttribute('aria-pressed', isPhone ? 'true' : 'false');
      toggle.querySelector('[data-role="width-label"]').textContent =
        isPhone ? 'Show at laptop width' : 'Show everything at phone width';
    }
  }

  function currentWidth() {
    return ROOT.getAttribute('data-width') === WIDTH_PHONE ? WIDTH_PHONE : WIDTH_LAPTOP;
  }

  /*
   * ── The other half of the width contract, and it is the half the comparison page needs ──
   *
   * The squeeze above is this document's own good idea and it stays: forcing a laptop frame
   * down to the phone width sends the reduction through the same rules a real narrow window
   * would take, so a section that only ever drew a laptop frame still shows something honest
   * at phone width rather than going blank.
   *
   * But the two sibling directions read `width` as "show me that width AND NOT THE OTHER",
   * and they hide the frame that does not match. The comparison page opens all three at once
   * at one width and expects one answer from each. Squeezing while the siblings hide meant
   * this direction alone answered a phone request with a squeezed laptop frame FIRST and its
   * real phone frame below it, so the user would have been comparing Roster's laptop layout
   * against the other two directions' phone layouts without anything on screen saying so.
   *
   * So the frames are now filtered as well as squeezed — BUT ONLY WHERE THERE IS SOMETHING TO
   * FALL BACK TO. A frame is hidden only when its own section also carries a frame of the
   * requested width. A section that draws one width alone keeps drawing it, squeezed, which
   * is exactly the case the squeeze was built for. The two behaviours are complementary
   * rather than in competition, and neither is dropped.
   */
  function showOnlyTheFramesFor(width) {
    var wantedClass = width === WIDTH_PHONE ? 'frame--phone' : 'frame--laptop';
    var otherClass = width === WIDTH_PHONE ? 'frame--laptop' : 'frame--phone';

    Array.prototype.forEach.call(document.querySelectorAll('[data-sheet-part]'), function (section) {
      var hasWanted = section.querySelector('.' + wantedClass);
      Array.prototype.forEach.call(section.querySelectorAll('.' + otherClass), function (frame) {
        /* Hidden, never removed: the width control is a toggle and a removed frame does not
         * come back. And set on the style as well as the attribute, because `.frame` is an
         * author rule and an author rule outranks the user agent's own [hidden] handling. */
        frame.hidden = Boolean(hasWanted);
        frame.style.display = hasWanted ? 'none' : '';
      });
    });
  }

  /* Keep the address bar honest, so any state reached by clicking is also a link. */
  function rememberInUrl(key, value, fallback) {
    var next = new URLSearchParams(window.location.search);
    if (value === fallback) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    var query = next.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash
    );
  }

  /* ── ?only=<section id> ────────────────────────────────────────────────────────────────
   *
   * Show one screen and nothing else. This is what makes a three-way comparison possible:
   * a sibling page embeds this document three times, once per direction, each opened at the
   * same section, and the user sees the same screen three ways rather than three links.
   */
  function applyOnly(only) {
    if (!only) return;
    var wanted = document.getElementById(only);
    if (!wanted) return;

    ROOT.setAttribute('data-only', only);
    Array.prototype.forEach.call(document.querySelectorAll('[data-sheet-part]'), function (el) {
      if (el !== wanted && !el.contains(wanted)) {
        el.hidden = true;
        /*
         * MEASURED, NOT PRECAUTIONARY. The attribute alone did not hide this document's own
         * head and screen-chip navigation, because both carry an author `display` rule and an
         * author rule outranks the user agent's `[hidden] { display: none }`. Everything read
         * as correct - the attribute was set, the sections below really did disappear - and
         * the two furniture elements stayed on screen anyway, so this direction answered the
         * comparison page with two hundred pixels of chrome its two siblings did not have.
         * Found by looking at the rendered comparison, which is the only way it could be.
         */
        el.style.display = 'none';
      }
    });
    /*
     * The both-themes block embeds this same document in two frames. When the document is
     * already being embedded, those frames are removed rather than hidden — a hidden iframe
     * still loads, and a document that embeds itself once per level is a document that
     * embeds itself forever.
     */
    Array.prototype.forEach.call(document.querySelectorAll('.theme-pair iframe'), function (el) {
      el.remove();
    });
  }

  /* ── The phone push ───────────────────────────────────────────────────────────────────
   *
   * Below the expanded width one of the two panes is on screen at a time. Selecting an item
   * pushes the detail over the list; the labelled back control returns. Above that width
   * both panes are always present and the stage attribute means nothing, which is the point:
   * one architecture, two widths.
   */
  function setStage(app, stage) {
    app.setAttribute('data-stage', stage);
  }

  function wireStages() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-push-detail]'), function (el) {
      el.addEventListener('click', function (event) {
        var app = el.closest('.app');
        if (!app) return;
        event.preventDefault();
        setStage(app, 'detail');
        var heading = app.querySelector('.detail [data-detail-heading]');
        if (heading) heading.focus();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-push-list]'), function (el) {
      el.addEventListener('click', function (event) {
        var app = el.closest('.app');
        if (!app) return;
        event.preventDefault();
        setStage(app, 'list');
        var selected = app.querySelector('.list-item[aria-current="true"]');
        if (selected) selected.focus();
      });
    });
  }

  /* ── The diet day selection, which is the same motion one level down ──────────────────── */
  function wireDietDays() {
    var days = document.querySelectorAll('[data-diet-day]');
    if (!days.length) return;

    Array.prototype.forEach.call(days, function (el) {
      el.addEventListener('click', function () {
        var app = el.closest('.app');
        if (!app) return;
        var wanted = el.getAttribute('data-diet-day');

        Array.prototype.forEach.call(app.querySelectorAll('[data-diet-day]'), function (other) {
          other.setAttribute('aria-current', other === el ? 'true' : 'false');
        });
        Array.prototype.forEach.call(app.querySelectorAll('[data-diet-panel]'), function (panel) {
          panel.hidden = panel.getAttribute('data-diet-panel') !== wanted;
        });
        setStage(app, 'detail');
      });
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────────────────────────── */

  applyTheme(params.get(PARAM_THEME) === THEME_DARK ? THEME_DARK : THEME_LIGHT);
  applyWidth(params.get(PARAM_WIDTH) === WIDTH_PHONE ? WIDTH_PHONE : WIDTH_LAPTOP);

  var stageParam = params.get(PARAM_STAGE);
  if (stageParam === 'detail' || stageParam === 'list') {
    Array.prototype.forEach.call(document.querySelectorAll('.app[data-stage]'), function (app) {
      setStage(app, stageParam);
    });
  }

  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = currentTheme() === THEME_DARK ? THEME_LIGHT : THEME_DARK;
      applyTheme(next);
      rememberInUrl(PARAM_THEME, next, THEME_LIGHT);
    });
  }

  var widthToggle = document.getElementById('width-toggle');
  if (widthToggle) {
    widthToggle.addEventListener('click', function () {
      var next = currentWidth() === WIDTH_PHONE ? WIDTH_LAPTOP : WIDTH_PHONE;
      applyWidth(next);
      rememberInUrl(PARAM_WIDTH, next, WIDTH_LAPTOP);
    });
  }

  wireStages();
  wireDietDays();
  applyOnly(params.get(PARAM_ONLY));
}());

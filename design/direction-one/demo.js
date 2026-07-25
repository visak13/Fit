/*
 * THE PRESENTATION SHEET'S BEHAVIOUR - and deliberately no more than that.
 *
 * This file belongs to the sheet, not to the application. Its whole job is to let someone
 * look at Ledger: switch the theme, switch the width, move between the days of the diet
 * week on the phone frame, and open a tooltip. It does not run a session, it does not
 * compute an intensity curve and it does not persist anything, because what is being
 * judged here is a look and a shape, and effort spent making state genuinely work is
 * effort not spent on the thing being chosen.
 *
 * EVERYTHING IT SETS IS ALSO SETTABLE FROM THE URL, so a sibling document can open this
 * page directly in a chosen theme, at a chosen width, or showing one screen alone,
 * without having to reach in and click a switch:
 *
 *   ?theme=light | dark
 *   ?width=both | laptop | phone
 *   ?frame=device | full   device keeps the real device height and lets a long screen
 *                          scroll inside it; full lets the frame grow to its content
 *   ?only=<section id>     one of: session-runner, client-list, client-record, diet-week,
 *                          navigation-laptop, navigation-phone, sync-states, tooltips, mark
 *
 * The switches write the same values back into the address bar, so any view a person
 * reaches by clicking is a view they can also link to.
 */

(function () {
  'use strict';

  var root = document.documentElement;

  var THEMES = ['light', 'dark'];
  var WIDTHS = ['both', 'laptop', 'phone'];
  var FRAMES = ['device', 'full'];

  /* ---------------------------------------------------------------- state */

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      theme: THEMES.indexOf(params.get('theme')) >= 0 ? params.get('theme') : 'light',
      width: WIDTHS.indexOf(params.get('width')) >= 0 ? params.get('width') : 'both',
      frame: FRAMES.indexOf(params.get('frame')) >= 0 ? params.get('frame') : 'device',
      only: params.get('only') || '',
    };
  }

  /*
   * Frames are the height of a real device by default, so a long screen scrolls inside them
   * as it will in use. frame=full lets them grow to their content instead, which is what a
   * reviewer needs when half of a dense screen would otherwise sit below a fold.
   */
  function applyFrame(frame) {
    state.frame = frame;
    if (frame === 'full') {
      root.setAttribute('data-frame', 'full');
    } else {
      root.removeAttribute('data-frame');
    }
    writeUrl();
  }

  var state = readParams();

  function applyTheme(theme) {
    state.theme = theme;
    root.setAttribute('data-theme', theme);
    syncPressed('theme', theme);
    writeUrl();
  }

  function applyWidth(width) {
    state.width = width;
    if (width === 'both') {
      root.removeAttribute('data-width');
    } else {
      root.setAttribute('data-width', width);
    }
    syncPressed('width', width);
    writeUrl();
  }

  /*
   * ONE SCREEN ALONE. The later comparison page shows the same screen from all three
   * directions at once; this is how it asks for one without having to reverse-engineer
   * the sheet. Everything else is hidden rather than removed, so nothing about the
   * rendering of the surviving section changes.
   */
  function applyOnly(only) {
    state.only = only;
    var sections = document.querySelectorAll('[data-sheet-part]');
    var wanted = only ? document.getElementById(only) : null;
    for (var i = 0; i < sections.length; i += 1) {
      var section = sections[i];
      section.hidden = Boolean(wanted) && section !== wanted;
    }
    if (only && !wanted) {
      /* An unknown name shows everything rather than an empty page. */
      state.only = '';
    }
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (state.theme !== 'light') params.set('theme', state.theme);
    if (state.width !== 'both') params.set('width', state.width);
    if (state.frame !== 'device') params.set('frame', state.frame);
    if (state.only) params.set('only', state.only);
    var query = params.toString();
    var url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    try {
      window.history.replaceState(null, '', url);
    } catch (error) {
      /*
       * Keeping the address bar in step is a convenience, not the feature. Some browsers
       * refuse a history write on a page opened straight off the filesystem, which is
       * exactly how this sheet is meant to be opened - so the refusal is expected here and
       * must not take the switch down with it. Logged rather than swallowed.
       */
      if (window.console) window.console.info('Address bar not updated: ' + error.message);
    }
  }

  function syncPressed(group, value) {
    var buttons = document.querySelectorAll('[data-switch="' + group + '"]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute(
        'aria-pressed',
        buttons[i].getAttribute('data-value') === value ? 'true' : 'false'
      );
    }
  }

  /* ------------------------------------------------------------- wiring */

  document.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;

    var group = button.getAttribute('data-switch');
    if (group === 'theme') {
      applyTheme(button.getAttribute('data-value'));
      return;
    }
    if (group === 'width') {
      applyWidth(button.getAttribute('data-value'));
      return;
    }

    /* The diet week on a phone: pick a day, or open the whole grid. */
    var day = button.getAttribute('data-day');
    if (day) {
      selectDay(button, day);
      return;
    }
    if (button.hasAttribute('data-week-toggle')) {
      toggleWeekGrid(button);
      return;
    }

    /*
     * The presentational controls - the intensity patterns, the session transport, the
     * exercise jump list. They show which one is chosen and nothing more. A pressed state
     * that lies about what it did would be worse than one that plainly does not act.
     */
    if (button.hasAttribute('data-choice')) {
      var choiceGroup = button.getAttribute('data-choice');
      var peers = button.closest('[data-choice-group]');
      if (peers) {
        var all = peers.querySelectorAll('[data-choice="' + choiceGroup + '"]');
        for (var j = 0; j < all.length; j += 1) {
          all[j].setAttribute('aria-pressed', all[j] === button ? 'true' : 'false');
        }
      }
    }
  });

  function selectDay(button, day) {
    var frame = button.closest('.app');
    if (!frame) return;
    var buttons = frame.querySelectorAll('[data-day]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute(
        'aria-pressed',
        buttons[i].getAttribute('data-day') === day ? 'true' : 'false'
      );
    }
    var plans = frame.querySelectorAll('[data-day-plan]');
    for (var k = 0; k < plans.length; k += 1) {
      plans[k].hidden = plans[k].getAttribute('data-day-plan') !== day;
    }
  }

  function toggleWeekGrid(button) {
    var frame = button.closest('.app');
    if (!frame) return;
    var grid = frame.querySelector('.week-card');
    if (!grid) return;
    var open = grid.getAttribute('data-phone-open') === 'true';
    grid.setAttribute('data-phone-open', open ? 'false' : 'true');
    button.setAttribute('aria-expanded', open ? 'false' : 'true');
    button.querySelector('[data-week-toggle-label]').textContent = open
      ? 'Show the whole week as a grid'
      : 'Hide the whole week grid';
  }

  /* ------------------------------------------------------ one design, two widths */

  /*
   * THE PHONE FRAMES ARE CLONES OF THE LAPTOP FRAMES, and that is the point rather than a
   * shortcut. The requirement is the same information architecture at a narrower width and
   * never a second, different design, so the two frames are literally the same markup: the
   * layout rules key off the width of the .app element, not the width of the window, and
   * the narrow rendering is therefore the real one rather than a picture of it.
   *
   * If the two ever disagree it will be because the CSS disagrees, which is a defect worth
   * seeing. Two hand-written copies would let them drift apart quietly instead.
   */
  function buildPhoneFrames() {
    var targets = document.querySelectorAll('[data-clone-of]');
    for (var i = 0; i < targets.length; i += 1) {
      var target = targets[i];
      var source = document.querySelector('[data-app="' + target.getAttribute('data-clone-of') + '"]');
      if (!source) continue;
      var copy = source.cloneNode(true);
      /* Identifiers belong to one element in one document; the copy carries none. */
      copy.removeAttribute('data-app');
      var identified = copy.querySelectorAll('[id]');
      for (var j = 0; j < identified.length; j += 1) identified[j].removeAttribute('id');
      if (copy.hasAttribute('id')) copy.removeAttribute('id');
      target.appendChild(copy);
    }
  }

  /* ------------------------------------------ room for the held-open tooltips */

  /*
   * A tooltip in use opens over whatever is beneath it and closes again, which is right. The
   * three held open on this sheet never close, so each one needs the room it actually
   * occupies reserved beneath it - otherwise it sits on top of the next thing and reads as a
   * layout fault rather than as the thing being demonstrated.
   *
   * MEASURED RATHER THAN GUESSED, because a guess is wrong somewhere by construction: the
   * same sentence is three lines wide on a laptop and seven on a phone, so one fixed reserve
   * cannot serve both frames. The stylesheet carries a generous floor for the case where
   * this never runs.
   */
  function reserveRoomForOpenTooltips() {
    var tips = document.querySelectorAll('.tip-room[data-open="true"]');
    for (var i = 0; i < tips.length; i += 1) {
      var bubble = tips[i].querySelector('.tip__bubble');
      if (!bubble) continue;
      tips[i].style.marginBlockEnd = Math.ceil(bubble.getBoundingClientRect().height) + 'px';
    }
  }

  window.addEventListener('resize', reserveRoomForOpenTooltips);

  /* --------------------------------------------------------------- start */

  buildPhoneFrames();
  applyTheme(state.theme);
  applyWidth(state.width);
  applyFrame(state.frame);
  applyOnly(state.only);
  /* Last, so it measures the bubbles at the width and in the sections that survived. */
  reserveRoomForOpenTooltips();
})();

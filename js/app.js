/* app.js - router, flikar och uppstart. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI, Views = global.Views;

  var main, tabs, titleEl, actionsEl;
  var current = null;

  function viewName() {
    var v = global.location.hash.replace(/^#\/?/, '');
    return Views[v] ? v : 'time';
  }

  var closeSheetSilently = null; // satts av hookBackButton

  function go(view) {
    if (U.isSheetOpen()) {
      /* Stang formularet utan history.back(). Bakatsteget ar asynkront och
         hinner annars ifatt hash-bytet och kastar tillbaka oss till samma vy.
         Formularets historikpost skrivs i stallet over med malvyn. */
      closeSheetSilently();
      try {
        global.history.replaceState(null, '', '#/' + view);
      } catch (e) {
        global.location.hash = '#/' + view;
        return;
      }
      route(true);
      return;
    }
    global.location.hash = '#/' + view;
  }

  function route(force) {
    var v = viewName();
    if (v === current && !force) return;
    current = v;
    var view = Views[v];

    titleEl.textContent = view.title;
    actionsEl.innerHTML = view.actions || '';

    Array.prototype.forEach.call(tabs.querySelectorAll('.tab'), function (b) {
      var active = b.getAttribute('data-view') === v;
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    // Varje vy far en egen behallare som lever kvar, sa att dess delegerade
    // lyssnare kan kopplas in en enda gang (se wire() i respektive vy).
    Object.keys(Views).forEach(function (name) {
      var host = Views[name].host;
      if (host) host.hidden = name !== v;
    });

    if (!view.host) {
      view.host = document.createElement('div');
      main.appendChild(view.host);
    }
    view.host.hidden = false;
    view.render(view.host);
    global.scrollTo(0, 0);
  }

  /* Mobilens bakåtknapp stänger ett öppet formulär i stället för att lämna appen. */
  function hookBackButton() {
    var openBase = U.openSheet, closeBase = U.closeSheet;
    var pushed = false;

    U.openSheet = function (title, html, onMount) {
      if (!pushed) {
        try { global.history.pushState({ sheet: 1 }, ''); } catch (e) { /* file:// kan neka */ }
        pushed = true;
      }
      openBase(title, html, onMount);
    };

    U.closeSheet = function () {
      closeBase();
      if (pushed) {
        pushed = false;
        if (global.history.state && global.history.state.sheet) global.history.back();
      }
    };

    closeSheetSilently = function () {
      closeBase();
      pushed = false;
    };

    global.addEventListener('popstate', function () {
      if (U.isSheetOpen()) {
        pushed = false;
        closeBase();
      } else {
        route();
      }
    });
  }

  /* Sma tumstockar som svavar i bakgrunden. Handplacerade i stallet for
     slumpade, sa att de ligger utspridda och inte klumpar ihop sig.
     x/y i procent, rot i grader, w i px, dur i sekunder. */
  var BACKDROP = [
    { x: 6, y: 8, w: 96, rot: -14, dur: 26, delay: 0 },
    { x: 63, y: 17, w: 66, rot: 22, dur: 34, delay: -6 },
    { x: 28, y: 33, w: 122, rot: 6, dur: 30, delay: -14 },
    { x: 74, y: 46, w: 84, rot: -28, dur: 38, delay: -3 },
    { x: 4, y: 58, w: 72, rot: 34, dur: 28, delay: -19 },
    { x: 46, y: 70, w: 108, rot: -8, dur: 36, delay: -9 },
    { x: 79, y: 84, w: 62, rot: 16, dur: 24, delay: -22 },
    { x: 14, y: 90, w: 90, rot: -20, dur: 32, delay: -12 }
  ];

  function drawBackdrop() {
    var el = document.getElementById('backdrop');
    el.innerHTML = BACKDROP.map(function (t) {
      return '<svg viewBox="0 0 120 60" style="'
        + '--x:' + t.x + '%;--y:' + t.y + '%;--w:' + t.w + 'px;'
        + '--rot:' + t.rot + 'deg;--dur:' + t.dur + 's;--delay:' + t.delay + 's">'
        + '<path d="M8 46 32 14 56 46 80 14 104 46" fill="none" stroke="currentColor"'
        + ' stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }).join('');
  }

  function init() {
    main = document.getElementById('main');
    tabs = document.getElementById('tabs');
    titleEl = document.getElementById('topbar-title');
    actionsEl = document.getElementById('topbar-actions');

    S.load();
    U.initSheet();
    hookBackButton();
    drawBackdrop();

    tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('.tab');
      if (b) go(b.getAttribute('data-view'));
    });

    actionsEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var view = Views[current];
      if (view && view.onAction) view.onAction(b.getAttribute('data-act'));
    });

    global.addEventListener('hashchange', function () { route(); });

    global.App = { go: go, refresh: function () { route(true); } };

    route(true);
    registerServiceWorker();
  }

  /* Offlinestöd fungerar bara när sidan serveras över https eller localhost. */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var ok = global.location.protocol === 'https:' || global.location.hostname === 'localhost';
    if (!ok) return;
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker kunde inte registreras:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

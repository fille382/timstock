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
    { x: 3, y: 9, w: 126, rot: -12, segs: 4, spread: 16, reach: 106, dur: 28, delay: 0 },
    { x: 64, y: 23, w: 104, rot: 21, segs: 3, spread: 27, reach: 98, dur: 36, delay: -8 },
    { x: 19, y: 41, w: 142, rot: 5, segs: 5, spread: 14, reach: 114, dur: 31, delay: -17 },
    { x: 71, y: 59, w: 104, rot: -25, segs: 4, spread: 21, reach: 96, dur: 39, delay: -4 },
    { x: 5, y: 73, w: 96, rot: 28, segs: 3, spread: 31, reach: 110, dur: 27, delay: -21 },
    { x: 51, y: 88, w: 122, rot: -7, segs: 5, spread: 18, reach: 102, dur: 34, delay: -11 }
  ];

  var PAD = 18;
  var BOX_H = 112;

  /* Bygger en hopvikt tumstock. spread ar avstandet mellan skanklarna - litet
     varde ger en hart hopvikt stock, stort en nastan utfalld. Skanklarna maste
     ligga flackt; spetsiga vinklar och runda andar ger faglar i stallet. */
  function fold(t) {
    var y = (BOX_H - t.segs * t.spread) / 2;
    var pts = [[PAD, y]];

    for (var i = 1; i <= t.segs; i++) {
      y += t.spread;
      pts.push([(i % 2) ? PAD + t.reach : PAD, y]);
    }

    return pts;
  }

  /* Kort bit av strackan a -> b, anvands for metallskydden i andarna. */
  function stub(a, b, len) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var m = Math.sqrt(dx * dx + dy * dy) || 1;
    return 'M' + a[0] + ' ' + a[1]
      + ' L' + (a[0] + dx / m * len) + ' ' + (a[1] + dy / m * len);
  }

  var HALF = 6.5;   // halva skankelns bredd
  var MM_STEP = 3;  // avstand mellan de korta strecken
  var PER_CM = 5;   // antal korta streck per langt

  function r1(n) { return Math.round(n * 10) / 10; }

  /* Mattstrecken langs en skankel: langa for cm, korta for mm. De utgar fran
     ena kanten precis som pa en riktig tumstock. Strecken hoppas over narmast
     andarna och lederna, dar metallskydd och nitar sitter. */
  function marks(a, b) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var m = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / m, uy = dy / m;
    var px = -uy, py = ux;
    var out = { cm: '', mm: '' };
    var n = 0;

    for (var s = 12; s <= m - 12; s += MM_STEP) {
      var long = n % PER_CM === 0;
      var len = long ? 7 : 3.5;
      var cx = a[0] + ux * s;
      var cy = a[1] + uy * s;

      var seg = 'M' + r1(cx + px * HALF) + ' ' + r1(cy + py * HALF)
        + 'L' + r1(cx + px * (HALF - len)) + ' ' + r1(cy + py * (HALF - len));

      if (long) out.cm += seg; else out.mm += seg;
      n++;
    }

    return out;
  }

  function rulerSVG(t) {
    var pts = fold(t);
    var last = pts.length - 1;

    var d = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0] + ' ' + p[1];
    }).join(' ');

    /* Nitar i lederna, men inte i andarna - dar sitter metallskydden.
       Nitarna stansas ur i sidans bakgrundsfarg. */
    var rivets = pts.slice(1, last).map(function (p) {
      return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.4"/>';
    }).join('');

    /* Metallskydden ar nagot bredare an traet och sitter kant i kant med den
       raka anden - darfor butt-kapade skanklar och inte rundade. */
    var caps = '<path d="' + stub(pts[0], pts[1], 11) + '"/>'
      + '<path d="' + stub(pts[last], pts[last - 1], 11) + '"/>';

    var cm = '', mm = '';
    for (var i = 0; i < last; i++) {
      var mk = marks(pts[i], pts[i + 1]);
      cm += mk.cm;
      mm += mk.mm;
    }

    return '<svg viewBox="0 0 ' + (t.reach + PAD * 2) + ' ' + BOX_H + '" style="'
      + '--x:' + t.x + '%;--y:' + t.y + '%;--w:' + t.w + 'px;'
      + '--rot:' + t.rot + 'deg;--dur:' + t.dur + 's;--delay:' + t.delay + 's">'
      + '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="13"'
      + ' stroke-linecap="butt" stroke-linejoin="round"/>'
      + '<g fill="none" stroke="currentColor" stroke-linecap="butt">'
      + '<path d="' + mm + '" stroke-width="1.1"/>'
      + '<path d="' + cm + '" stroke-width="1.6"/>'
      + '<g stroke-width="16">' + caps + '</g>'
      + '</g>'
      + '<g fill="var(--bg)">' + rivets + '</g></svg>';
  }

  function drawBackdrop() {
    document.getElementById('backdrop').innerHTML = BACKDROP.map(rulerSVG).join('');
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

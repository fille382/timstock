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

  function go(view) {
    if (U.isSheetOpen()) U.closeSheet();
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

    global.addEventListener('popstate', function () {
      if (U.isSheetOpen()) {
        pushed = false;
        closeBase();
      } else {
        route();
      }
    });
  }

  function init() {
    main = document.getElementById('main');
    tabs = document.getElementById('tabs');
    titleEl = document.getElementById('topbar-title');
    actionsEl = document.getElementById('topbar-actions');

    S.load();
    U.initSheet();
    hookBackButton();

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

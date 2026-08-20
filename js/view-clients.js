/* view-clients.js - kunder och deras projekt. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;
  var showArchived = false;

  function unbilledFor(clientId) {
    var list = S.entries({ clientId: clientId, status: 'unbilled' });
    var mats = S.materials({ clientId: clientId, status: 'unbilled' });
    return {
      hours: list.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0),
      amount: list.reduce(function (s, e) {
        return s + Number(e.hours || 0) * S.rateFor(e.clientId, e.projectId);
      }, 0) + mats.reduce(function (s, m) { return s + S.materialAmount(m); }, 0),
      materialCount: mats.length
    };
  }

  function render(el) {
    container = el;
    var clients = S.clients(showArchived);

    var html = '<button class="btn btn-primary btn-block" data-new-client style="margin-bottom:16px">'
      + '+ Ny kund</button>';

    if (!clients.length) {
      html += '<div class="empty">Inga kunder ännu.<br>Lägg till din första kund för att komma igång.</div>';
    } else {
      html += '<div class="list">' + clients.map(clientItem).join('') + '</div>';
    }

    var archivedCount = S.clients(true).filter(function (c) { return c.archived; }).length;
    if (archivedCount) {
      html += '<button class="btn btn-ghost btn-block small" data-toggle-archived style="margin-top:14px">'
        + (showArchived ? 'Dölj arkiverade' : 'Visa arkiverade (' + archivedCount + ')') + '</button>';
    }

    el.innerHTML = html;
    wire(el);
  }

  function clientItem(c) {
    var u = unbilledFor(c.id);
    var projs = S.projects(c.id);
    return '<button class="item" type="button" data-client="' + U.esc(c.id) + '">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(c.name) + (c.archived ? ' <span class="badge badge-muted">Arkiverad</span>' : '') + '</span>'
      + '<span class="item-amount">' + U.money0(S.rateFor(c.id, null)) + '/h</span>'
      + '</div>'
      + '<div class="item-sub">'
      + (c.phone ? '<span>' + U.esc(c.phone) + '</span><span class="dot">•</span>' : '')
      + (projs.length ? '<span>' + projs.length + ' projekt</span><span class="dot">•</span>' : '')
      + (u.amount > 0
        ? '<span class="badge badge-accent">Ofakturerat ' + U.money0(u.amount)
          + (u.hours > 0 ? ' · ' + U.hours(u.hours) : '')
          + (u.materialCount ? ' · ' + u.materialCount + ' material' : '') + '</span>'
        : '<span>Inget ofakturerat</span>')
      + '</div>'
      + '</button>';
  }

  /* ---------- Kundformulär ---------- */

  function openClient(id) {
    var c = id ? S.client(id) : null;
    var s = S.settings();
    var projs = id ? S.projects(id, true) : [];

    var html = '';

    html += '<div class="field"><label for="c-name">Kundnamn *</label>'
      + '<input type="text" id="c-name" value="' + U.esc(c ? c.name : '') + '" placeholder="Företagets namn"></div>';

    if (c && c.phone) {
      html += '<a class="btn btn-block" href="tel:' + U.esc(String(c.phone).replace(/\s/g, ''))
        + '" style="margin-bottom:14px">Ring ' + U.esc(c.contact || c.name) + '</a>';
    }

    html += '<div class="field"><label for="c-contact">Kontaktperson</label>'
      + '<input type="text" id="c-contact" value="' + U.esc(c ? c.contact : '') + '"></div>';

    html += '<div class="field"><label for="c-phone">Telefon</label>'
      + '<input type="tel" id="c-phone" inputmode="tel" autocomplete="tel" value="'
      + U.esc(c ? c.phone : '') + '"></div>';

    html += '<div class="row"><div class="field"><label for="c-rate">Timpris (kr)</label>'
      + '<input type="number" id="c-rate" inputmode="decimal" step="1" min="0" value="'
      + U.esc(c && c.rate !== '' && c.rate !== null && c.rate !== undefined ? c.rate : '')
      + '" placeholder="' + U.esc(s.defaultRate) + '"></div>'
      + '<div class="field"><label for="c-vat">Moms (%)</label>'
      + '<input type="number" id="c-vat" inputmode="decimal" step="1" min="0" max="100" value="'
      + U.esc(c && c.vatRate !== '' && c.vatRate !== null && c.vatRate !== undefined ? c.vatRate : '')
      + '" placeholder="' + U.esc(s.vatRate) + '"></div></div>';

    html += '<div class="field"><label for="c-orgnr">Organisationsnummer</label>'
      + '<input type="text" id="c-orgnr" value="' + U.esc(c ? c.orgnr : '') + '"></div>';

    html += '<div class="field"><label for="c-address">Adress</label>'
      + '<input type="text" id="c-address" value="' + U.esc(c ? c.address : '') + '"></div>';

    html += '<div class="row"><div class="field" style="flex:0 0 38%"><label for="c-zip">Postnr</label>'
      + '<input type="text" id="c-zip" inputmode="numeric" value="' + U.esc(c ? c.zip : '') + '"></div>'
      + '<div class="field"><label for="c-city">Ort</label>'
      + '<input type="text" id="c-city" value="' + U.esc(c ? c.city : '') + '"></div></div>';

    html += '<div class="field"><label for="c-email">E-post (fakturamottagare)</label>'
      + '<input type="email" id="c-email" autocapitalize="off" value="' + U.esc(c ? c.email : '') + '"></div>';

    html += '<button class="btn btn-primary btn-block" data-save-client>'
      + (c ? 'Spara kund' : 'Lägg till kund') + '</button>';

    if (c) {
      html += '<div class="section-title">Projekt</div>';
      html += projs.length
        ? '<div class="list">' + projs.map(function (p) { return projectItem(p, s); }).join('') + '</div>'
        : '<div class="empty small">Inga projekt. Projekt är valfritt — du kan rapportera tid direkt på kunden.</div>';
      html += '<button class="btn btn-block" data-new-project style="margin-top:10px">+ Nytt projekt</button>';

      html += '<div class="section-title">Hantera</div>';
      html += '<button class="btn btn-block" data-archive>'
        + (c.archived ? 'Återaktivera kund' : 'Arkivera kund') + '</button>';
      html += '<button class="btn btn-danger btn-block" data-delete-client style="margin-top:10px">Ta bort kund</button>';
      html += '<p class="small muted" style="margin-top:8px">En kund med registrerad tid kan inte tas bort — arkivera i stället.</p>';
    }

    U.openSheet(c ? c.name : 'Ny kund', html, function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-save-client]')) { saveClient(body, c); return; }
        if (ev.target.closest('[data-new-project]')) { openProject(null, c.id); return; }
        var pEl = ev.target.closest('[data-project]');
        if (pEl) { openProject(pEl.getAttribute('data-project'), c.id); return; }
        if (ev.target.closest('[data-archive]')) {
          S.archiveClient(c.id, !c.archived);
          U.closeSheet();
          U.toast(c.archived ? 'Kunden är aktiv igen' : 'Kunden arkiverad');
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-client]')) {
          if (!confirm('Ta bort ' + c.name + ' och kundens projekt?')) return;
          if (S.deleteClient(c.id)) {
            U.closeSheet();
            U.toast('Kund borttagen');
            render(container);
          } else {
            U.toast('Kunden har registrerad tid — arkivera i stället', true);
          }
        }
      });
    });
  }

  function projectItem(p, s) {
    var rate = (p.rate === '' || p.rate === null || p.rate === undefined)
      ? null : Number(p.rate);
    return '<button class="item" type="button" data-project="' + U.esc(p.id) + '">'
      + '<div class="item-top"><span class="item-title">' + U.esc(p.name)
      + (p.archived ? ' <span class="badge badge-muted">Arkiverad</span>' : '') + '</span>'
      + '<span class="item-amount small">' + (rate === null ? 'Kundens pris' : U.money0(rate) + '/h') + '</span>'
      + '</div></button>';
  }

  function saveClient(body, existing) {
    var name = body.querySelector('#c-name').value.trim();
    if (!name) { U.toast('Kundnamn krävs', true); return; }

    S.saveClient({
      id: existing ? existing.id : null,
      name: name,
      contact: body.querySelector('#c-contact').value.trim(),
      phone: body.querySelector('#c-phone').value.trim(),
      rate: body.querySelector('#c-rate').value.trim(),
      vatRate: body.querySelector('#c-vat').value.trim(),
      orgnr: body.querySelector('#c-orgnr').value.trim(),
      address: body.querySelector('#c-address').value.trim(),
      zip: body.querySelector('#c-zip').value.trim(),
      city: body.querySelector('#c-city').value.trim(),
      email: body.querySelector('#c-email').value.trim()
    });

    U.closeSheet();
    U.toast(existing ? 'Kund sparad' : 'Kund tillagd');
    render(container);
  }

  /* ---------- Projektformulär ---------- */

  function openProject(id, clientId) {
    var p = id ? S.project(id) : null;
    var c = S.client(clientId);

    var html = '<div class="field"><label for="p-name">Projektnamn *</label>'
      + '<input type="text" id="p-name" value="' + U.esc(p ? p.name : '') + '"></div>';

    html += '<div class="field"><label for="p-rate">Timpris (kr)</label>'
      + '<input type="number" id="p-rate" inputmode="decimal" step="1" min="0" value="'
      + U.esc(p && p.rate !== '' && p.rate !== null && p.rate !== undefined ? p.rate : '')
      + '" placeholder="' + U.esc(S.rateFor(clientId, null)) + ' (kundens pris)">'
      + '<p class="small muted" style="margin:6px 0 0">Lämna tomt för att använda kundens timpris.</p></div>';

    html += '<button class="btn btn-primary btn-block" data-save-project>'
      + (p ? 'Spara projekt' : 'Lägg till projekt') + '</button>';

    if (p) {
      html += '<button class="btn btn-block" data-archive-project style="margin-top:10px">'
        + (p.archived ? 'Återaktivera projekt' : 'Arkivera projekt') + '</button>';
      html += '<button class="btn btn-danger btn-block" data-delete-project style="margin-top:10px">Ta bort projekt</button>';
    }

    html += '<button class="btn btn-ghost btn-block" data-back style="margin-top:14px">← Tillbaka till kunden</button>';

    U.openSheet(p ? p.name : 'Nytt projekt hos ' + (c ? c.name : ''), html, function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-back]')) { openClient(clientId); return; }
        if (ev.target.closest('[data-save-project]')) {
          var name = body.querySelector('#p-name').value.trim();
          if (!name) { U.toast('Projektnamn krävs', true); return; }
          S.saveProject({
            id: p ? p.id : null,
            clientId: clientId,
            name: name,
            rate: body.querySelector('#p-rate').value.trim()
          });
          U.toast(p ? 'Projekt sparat' : 'Projekt tillagt');
          openClient(clientId);
          render(container);
          return;
        }
        if (ev.target.closest('[data-archive-project]')) {
          S.archiveProject(p.id, !p.archived);
          U.toast(p.archived ? 'Projektet är aktivt igen' : 'Projekt arkiverat');
          openClient(clientId);
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-project]')) {
          if (!confirm('Ta bort projektet ' + p.name + '?')) return;
          if (S.deleteProject(p.id)) {
            U.toast('Projekt borttaget');
            openClient(clientId);
            render(container);
          } else {
            U.toast('Projektet har registrerad tid — arkivera i stället', true);
          }
        }
      });
    });
  }

  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-new-client]')) { openClient(null); return; }
      var c = ev.target.closest('[data-client]');
      if (c) { openClient(c.getAttribute('data-client')); return; }
      if (ev.target.closest('[data-toggle-archived]')) {
        showArchived = !showArchived;
        render(el);
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.clients = {
    title: 'Kunder & projekt',
    actions: '<button class="icon-btn" data-act="new" aria-label="Ny kund">+</button>',
    onAction: function (act) { if (act === 'new') openClient(null); },
    render: render
  };
})(window);

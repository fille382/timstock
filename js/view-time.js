/* view-time.js - tidrapporten: registrera timmar + kommentar, se och redigera. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;

  var filter = { period: 'month', status: 'all', clientId: '' };
  var container = null;

  function range() {
    if (filter.period === 'month') return U.monthRange(0);
    if (filter.period === 'prev') return U.monthRange(-1);
    return { from: '', to: '' };
  }

  function currentEntries() {
    var r = range();
    return S.entries({
      from: r.from, to: r.to,
      status: filter.status === 'all' ? null : filter.status,
      clientId: filter.clientId || null
    });
  }

  function amountOf(e) {
    return U.round2(Number(e.hours || 0) * S.rateFor(e.clientId, e.projectId));
  }

  function label(e) {
    var c = S.client(e.clientId);
    var p = e.projectId ? S.project(e.projectId) : null;
    var name = c ? c.name : 'Okänd kund';
    return p ? name + ' · ' + p.name : name;
  }

  /* ---------- Rendering ---------- */

  function render(el) {
    container = el;
    var list = currentEntries();
    var totalHours = list.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
    var totalAmount = list.reduce(function (s, e) { return s + amountOf(e); }, 0);
    var unbilled = list.filter(function (e) { return !e.invoiceId; });
    var unbilledAmount = unbilled.reduce(function (s, e) { return s + amountOf(e); }, 0);

    var clients = S.clients();

    var html = '';

    html += '<button class="btn btn-primary btn-block" data-new style="margin-bottom:16px">'
      + '+ Registrera tid</button>';

    if (!clients.length) {
      html += '<div class="card"><div class="card-title">Kom igång</div>'
        + '<p class="small muted" style="margin:0 0 12px">Lägg upp din första kund så kan du börja registrera timmar och fakturera.</p>'
        + '<button class="btn btn-block" data-goto="clients">Lägg till kund</button></div>';
    }

    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-value">' + U.hours(totalHours) + '</div>'
      + '<div class="stat-label">Timmar</div></div>'
      + '<div class="stat"><div class="stat-value">' + U.money0(unbilledAmount) + '</div>'
      + '<div class="stat-label">Ofakturerat</div></div>'
      + '</div>';

    html += '<div class="seg" style="margin-bottom:10px">'
      + segBtn('period', 'month', 'Denna månad')
      + segBtn('period', 'prev', 'Förra')
      + segBtn('period', 'all', 'Allt')
      + '</div>';

    html += '<div class="seg" style="margin-bottom:10px">'
      + segBtn('status', 'all', 'Alla')
      + segBtn('status', 'unbilled', 'Ofakturerade')
      + segBtn('status', 'billed', 'Fakturerade')
      + '</div>';

    if (clients.length > 1) {
      html += '<div class="field"><select data-filter-client>'
        + '<option value="">Alla kunder</option>'
        + U.options(clients, filter.clientId) + '</select></div>';
    }

    if (!list.length) {
      html += '<div class="empty">Inga tidsposter i den här vyn.</div>';
    } else {
      html += renderGroups(list);
      html += '<div class="totals" style="margin-top:16px">'
        + '<div class="totals-row"><span>Timmar</span><span>' + U.hours(totalHours) + '</span></div>'
        + '<div class="totals-row"><span>Belopp exkl. moms</span><span>' + U.money(totalAmount) + '</span></div>'
        + '<div class="totals-row grand"><span>Varav ofakturerat</span><span>' + U.money(unbilledAmount) + '</span></div>'
        + '</div>';
    }

    el.innerHTML = html;
    wire(el);
  }

  function segBtn(group, value, text) {
    return '<button type="button" data-seg="' + group + '" data-value="' + value + '" aria-pressed="'
      + (filter[group] === value) + '">' + U.esc(text) + '</button>';
  }

  /* Grupperar posterna per datum med dagssumma i rubriken. */
  function renderGroups(list) {
    var html = '';
    var currentDate = null;
    var buffer = [];

    function flush() {
      if (!buffer.length) return;
      var dayHours = buffer.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
      html += '<div class="section-title" style="display:flex;justify-content:space-between">'
        + '<span>' + U.esc(U.dateShort(currentDate)) + '</span>'
        + '<span>' + U.hours(dayHours) + '</span></div>';
      html += '<div class="list">' + buffer.map(itemHTML).join('') + '</div>';
      buffer = [];
    }

    list.forEach(function (e) {
      if (e.date !== currentDate) { flush(); currentDate = e.date; }
      buffer.push(e);
    });
    flush();
    return html;
  }

  function itemHTML(e) {
    var billed = !!e.invoiceId;
    var inv = billed ? S.invoice(e.invoiceId) : null;
    return '<button class="item" data-edit="' + U.esc(e.id) + '" type="button">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(label(e)) + '</span>'
      + '<span class="item-amount">' + U.hours(e.hours) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + '<span>' + U.money(amountOf(e)) + '</span>'
      + '<span class="dot">•</span>'
      + '<span>' + U.money0(S.rateFor(e.clientId, e.projectId)) + '/h</span>'
      + (billed
        ? '<span class="badge badge-muted">Faktura ' + U.esc(inv ? inv.number : '?') + '</span>'
        : '<span class="badge badge-accent">Ofakturerad</span>')
      + '</div>'
      + (e.comment ? '<div class="item-comment">' + U.esc(e.comment) + '</div>' : '')
      + '</button>';
  }

  /* ---------- Formulär ---------- */

  function openForm(id) {
    var e = id ? S.entry(id) : null;
    var clients = S.clients();

    if (!clients.length) {
      U.toast('Lägg till en kund först', true);
      global.App.go('clients');
      return;
    }

    var clientId = e ? e.clientId : (filter.clientId || lastUsedClientId() || clients[0].id);
    var projs = S.projects(clientId);
    var billed = e && e.invoiceId;

    var html = '';

    if (billed) {
      var inv = S.invoice(e.invoiceId);
      html += '<div class="card" style="background:var(--warn-soft);border-color:var(--warn)">'
        + '<div class="small">Posten ligger på faktura <b>' + U.esc(inv ? inv.number : '?')
        + '</b> och kan inte ändras. Ta bort fakturan först om något blev fel.</div></div>';
    }

    var dis = billed ? ' disabled' : '';

    html += '<div class="field"><label for="f-date">Datum</label>'
      + '<input type="date" id="f-date" value="' + U.esc(e ? e.date : S.todayISO()) + '"' + dis + '></div>';

    html += '<div class="field"><label for="f-client">Kund</label>'
      + '<select id="f-client"' + dis + '>' + U.options(clients, clientId) + '</select></div>';

    html += '<div class="field" id="f-project-wrap"' + (projs.length ? '' : ' hidden') + '>'
      + '<label for="f-project">Projekt</label>'
      + '<select id="f-project"' + dis + '>'
      + U.options(projs, e ? e.projectId : '', 'Inget projekt') + '</select></div>';

    html += '<div class="field"><label for="f-hours">Timmar</label>'
      + '<input type="text" id="f-hours" inputmode="decimal" autocomplete="off" placeholder="t.ex. 7,5"'
      + ' value="' + U.esc(e ? String(e.hours).replace('.', ',') : '') + '"' + dis + '>'
      + (billed ? '' : '<div class="quick">'
        + quickBtn(0.5) + quickBtn(1) + quickBtn(2) + quickBtn(4) + quickBtn(8)
        + '<button type="button" data-clear title="Nollställ">C</button></div>')
      + '</div>';

    html += '<div class="field"><label for="f-comment">Kommentar</label>'
      + '<textarea id="f-comment" placeholder="Vad gjorde du?"' + dis + '>'
      + U.esc(e ? e.comment : '') + '</textarea></div>';

    html += '<div id="f-preview" class="totals small" style="margin-bottom:14px"></div>';

    if (!billed) {
      html += '<button class="btn btn-primary btn-block" data-save>'
        + (e ? 'Spara ändringar' : 'Lägg till') + '</button>';
    }
    if (e && !billed) {
      html += '<button class="btn btn-danger btn-block" data-delete style="margin-top:10px">Ta bort</button>';
    }

    U.openSheet(e ? 'Redigera tidspost' : 'Ny tidspost', html, function (body) {
      var $ = function (sel) { return body.querySelector(sel); };
      var hoursInput = $('#f-hours');

      function updatePreview() {
        var h = U.parseHours(hoursInput.value);
        var cid = $('#f-client').value;
        var pid = $('#f-project') ? $('#f-project').value : '';
        var rate = S.rateFor(cid, pid);
        var amount = isFinite(h) ? h * rate : 0;
        $('#f-preview').innerHTML =
          '<div class="totals-row"><span class="muted">Timpris</span><span>' + U.money0(rate) + '/h</span></div>'
          + '<div class="totals-row"><span class="muted">Belopp exkl. moms</span><span><b>'
          + U.money(amount) + '</b></span></div>';
      }

      $('#f-client').addEventListener('change', function () {
        var ps = S.projects(this.value);
        var wrap = $('#f-project-wrap');
        $('#f-project').innerHTML = U.options(ps, '', 'Inget projekt');
        wrap.hidden = !ps.length;
        updatePreview();
      });

      if ($('#f-project')) $('#f-project').addEventListener('change', updatePreview);
      hoursInput.addEventListener('input', updatePreview);

      body.addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-quick]');
        if (q) {
          var cur = U.parseHours(hoursInput.value);
          if (!isFinite(cur)) cur = 0;
          var next = U.round2(cur + Number(q.getAttribute('data-quick')));
          hoursInput.value = String(next).replace('.', ',');
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-clear]')) {
          hoursInput.value = '';
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-save]')) { submit(body, e); return; }
        if (ev.target.closest('[data-delete]')) {
          if (!confirm('Ta bort tidsposten?')) return;
          if (S.deleteEntry(e.id)) {
            U.closeSheet();
            U.toast('Tidspost borttagen');
            render(container);
          } else {
            U.toast('Posten är fakturerad och kan inte tas bort', true);
          }
        }
      });

      updatePreview();
    });
  }

  function quickBtn(n) {
    return '<button type="button" data-quick="' + n + '">+' + String(n).replace('.', ',') + '</button>';
  }

  function submit(body, existing) {
    var date = body.querySelector('#f-date').value;
    var clientId = body.querySelector('#f-client').value;
    var projectEl = body.querySelector('#f-project');
    var projectId = projectEl && !body.querySelector('#f-project-wrap').hidden ? projectEl.value : '';
    var hours = U.parseHours(body.querySelector('#f-hours').value);
    var comment = body.querySelector('#f-comment').value.trim();

    if (!date) { U.toast('Välj datum', true); return; }
    if (!clientId) { U.toast('Välj kund', true); return; }
    if (!isFinite(hours) || hours <= 0) { U.toast('Ange antal timmar', true); return; }
    if (hours > 24) { U.toast('Mer än 24 timmar på en dag?', true); return; }

    S.saveEntry({
      id: existing ? existing.id : null,
      date: date,
      clientId: clientId,
      projectId: projectId || null,
      hours: U.round2(hours),
      comment: comment
    });

    U.closeSheet();
    U.toast(existing ? 'Sparad' : U.hours(hours) + ' registrerad');
    render(container);
  }

  /* Förifyller senast använda kunden så nästa post går snabbare att registrera. */
  function lastUsedClientId() {
    var recent = S.entries()[0];
    return recent ? recent.clientId : '';
  }

  /* ---------- Händelser ---------- */

  /* Lyssnarna kopplas in en enda gang pa vyns behallare - innehallet ritas om,
     men elementet lever kvar, sa delegeringen fortsatter fungera. */
  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    el.addEventListener('change', function (ev) {
      var cf = ev.target.closest('[data-filter-client]');
      if (cf) {
        filter.clientId = cf.value;
        render(el);
      }
    });

    el.addEventListener('click', function (ev) {
      var seg = ev.target.closest('[data-seg]');
      if (seg) {
        filter[seg.getAttribute('data-seg')] = seg.getAttribute('data-value');
        render(el);
        return;
      }
      if (ev.target.closest('[data-new]')) { openForm(null); return; }
      var edit = ev.target.closest('[data-edit]');
      if (edit) { openForm(edit.getAttribute('data-edit')); return; }
      var goto = ev.target.closest('[data-goto]');
      if (goto) { global.App.go(goto.getAttribute('data-goto')); }
    });
  }

  global.Views = global.Views || {};
  global.Views.time = {
    title: 'Tidrapport',
    actions: '<button class="icon-btn" data-act="new" aria-label="Ny tidspost">+</button>',
    onAction: function (act) { if (act === 'new') openForm(null); },
    render: render
  };
})(window);

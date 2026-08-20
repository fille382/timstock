/* view-time.js - dagboken: registrera timmar och material, se och redigera. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;

  var UNITS = ['st', 'm', 'm²', 'm³', 'kg', 'l', 'rulle', 'paket', 'säck', 'kartong', 'timme'];

  var filter = { period: 'month', status: 'all', clientId: '' };
  var container = null;

  function range() {
    if (filter.period === 'month') return U.monthRange(0);
    if (filter.period === 'prev') return U.monthRange(-1);
    return { from: '', to: '' };
  }

  function query() {
    var r = range();
    return {
      from: r.from, to: r.to,
      status: filter.status === 'all' ? null : filter.status,
      clientId: filter.clientId || null
    };
  }

  function amountOf(e) {
    return S.round2(Number(e.hours || 0) * S.rateFor(e.clientId, e.projectId));
  }

  function label(clientId, projectId) {
    var c = S.client(clientId);
    var p = projectId ? S.project(projectId) : null;
    var name = c ? c.name : 'Okänd kund';
    return p ? name + ' · ' + p.name : name;
  }

  /* Slår ihop tid och material till en gemensam, datumsorterad lista. */
  function combined() {
    var q = query();
    var items = S.entries(q).map(function (e) {
      return { type: 'time', date: e.date, createdAt: e.createdAt || '', obj: e };
    }).concat(S.materials(q).map(function (m) {
      return { type: 'material', date: m.date, createdAt: m.createdAt || '', obj: m };
    }));

    return items.sort(function (a, b) {
      if (a.date !== b.date) return b.date < a.date ? -1 : 1;
      return b.createdAt < a.createdAt ? -1 : 1;
    });
  }

  function itemAmount(it) {
    return it.type === 'time' ? amountOf(it.obj) : S.materialAmount(it.obj);
  }

  /* ---------- Rendering ---------- */

  function render(el) {
    container = el;
    var items = combined();

    var totalHours = items.reduce(function (s, it) {
      return s + (it.type === 'time' ? Number(it.obj.hours || 0) : 0);
    }, 0);
    var totalAmount = items.reduce(function (s, it) { return s + itemAmount(it); }, 0);
    var unbilledAmount = items.reduce(function (s, it) {
      return s + (it.obj.invoiceId ? 0 : itemAmount(it));
    }, 0);
    var materialAmount = items.reduce(function (s, it) {
      return s + (it.type === 'material' ? itemAmount(it) : 0);
    }, 0);

    var clients = S.clients();
    var html = '';

    html += '<div class="btn-row" style="margin-bottom:16px">'
      + '<button class="btn btn-primary" data-new>+ Tid</button>'
      + '<button class="btn" data-new-material>+ Material</button>'
      + '</div>';

    if (!clients.length) {
      html += '<div class="card"><div class="card-title">Kom igång</div>'
        + '<p class="small muted" style="margin:0 0 12px">Lägg upp din första kund så kan du börja '
        + 'registrera timmar och material och fakturera.</p>'
        + '<button class="btn btn-block" data-goto="clients">Lägg till kund</button></div>';
    }

    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-value">' + U.hours(totalHours) + '</div>'
      + '<div class="stat-label">Timmar</div></div>'
      + '<div class="stat"><div class="stat-value">' + U.money0(materialAmount) + '</div>'
      + '<div class="stat-label">Material</div></div>'
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

    if (!items.length) {
      html += '<div class="empty">Inget registrerat i den här vyn.</div>';
    } else {
      html += renderGroups(items);
      html += '<div class="totals" style="margin-top:16px">'
        + '<div class="totals-row"><span>Timmar</span><span>' + U.hours(totalHours) + '</span></div>'
        + (materialAmount
          ? '<div class="totals-row"><span>Material</span><span>' + U.money(materialAmount) + '</span></div>'
          : '')
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
  function renderGroups(items) {
    var html = '';
    var currentDate = null;
    var buffer = [];

    function flush() {
      if (!buffer.length) return;
      var dayHours = buffer.reduce(function (s, it) {
        return s + (it.type === 'time' ? Number(it.obj.hours || 0) : 0);
      }, 0);
      var dayMaterial = buffer.reduce(function (s, it) {
        return s + (it.type === 'material' ? itemAmount(it) : 0);
      }, 0);

      var summary = [];
      if (dayHours) summary.push(U.hours(dayHours));
      if (dayMaterial) summary.push(U.money0(dayMaterial));

      html += '<div class="section-title" style="display:flex;justify-content:space-between">'
        + '<span>' + U.esc(U.dateShort(currentDate)) + '</span>'
        + '<span>' + summary.join(' · ') + '</span></div>';
      html += '<div class="list">' + buffer.map(itemHTML).join('') + '</div>';
      buffer = [];
    }

    items.forEach(function (it) {
      if (it.date !== currentDate) { flush(); currentDate = it.date; }
      buffer.push(it);
    });
    flush();
    return html;
  }

  function itemHTML(it) {
    return it.type === 'time' ? entryHTML(it.obj) : materialHTML(it.obj);
  }

  function billedBadge(obj) {
    if (!obj.invoiceId) return '<span class="badge badge-accent">Ofakturerad</span>';
    var inv = S.invoice(obj.invoiceId);
    return '<span class="badge badge-muted">Faktura ' + U.esc(inv ? inv.number : '?') + '</span>';
  }

  function entryHTML(e) {
    return '<button class="item" data-edit="' + U.esc(e.id) + '" type="button">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(label(e.clientId, e.projectId)) + '</span>'
      + '<span class="item-amount">' + U.hours(e.hours) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + '<span>' + U.money(amountOf(e)) + '</span>'
      + '<span class="dot">•</span>'
      + '<span>' + U.money0(S.rateFor(e.clientId, e.projectId)) + '/h</span>'
      + billedBadge(e)
      + '</div>'
      + (e.comment ? '<div class="item-comment">' + U.esc(e.comment) + '</div>' : '')
      + '</button>';
  }

  function materialHTML(m) {
    var qty = String(m.qty).replace('.', ',') + ' ' + (m.unit || 'st');
    return '<button class="item" data-edit-material="' + U.esc(m.id) + '" type="button">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(label(m.clientId, m.projectId)) + '</span>'
      + '<span class="item-amount">' + U.esc(qty) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + '<span>' + U.money(S.materialAmount(m)) + '</span>'
      + '<span class="dot">•</span>'
      + '<span>' + U.money(m.unitPrice) + '/' + U.esc(m.unit || 'st') + '</span>'
      + '<span class="badge badge-material">Material</span>'
      + billedBadge(m)
      + '</div>'
      + '<div class="item-comment">' + U.esc(m.description) + '</div>'
      + '</button>';
  }

  /* ---------- Gemensamt för båda formulären ---------- */

  function requireClient() {
    if (S.clients().length) return true;
    U.toast('Lägg till en kund först', true);
    global.App.go('clients');
    return false;
  }

  function defaultClientId() {
    if (filter.clientId) return filter.clientId;
    var recentTime = S.entries()[0];
    var recentMat = S.materials()[0];
    if (recentTime && recentMat) {
      return (recentTime.createdAt || '') >= (recentMat.createdAt || '')
        ? recentTime.clientId : recentMat.clientId;
    }
    if (recentTime) return recentTime.clientId;
    if (recentMat) return recentMat.clientId;
    return S.clients()[0].id;
  }

  function clientFields(clientId, selectedProjectId, disabled) {
    var projs = S.projects(clientId);
    return '<div class="field"><label for="f-client">Kund</label>'
      + '<select id="f-client"' + disabled + '>' + U.options(S.clients(), clientId) + '</select></div>'
      + '<div class="field" id="f-project-wrap"' + (projs.length ? '' : ' hidden') + '>'
      + '<label for="f-project">Projekt</label>'
      + '<select id="f-project"' + disabled + '>'
      + U.options(projs, selectedProjectId || '', 'Inget projekt') + '</select></div>';
  }

  function lockedNotice(obj) {
    var inv = S.invoice(obj.invoiceId);
    return '<div class="card" style="background:var(--warn-soft);border-color:var(--warn)">'
      + '<div class="small">Posten ligger på faktura <b>' + U.esc(inv ? inv.number : '?')
      + '</b> och kan inte ändras. Ta bort fakturan först om något blev fel.</div></div>';
  }

  /* Kopplar om projektlistan när kunden byts. */
  function wireClientChange(body, onChange) {
    body.querySelector('#f-client').addEventListener('change', function () {
      var ps = S.projects(this.value);
      body.querySelector('#f-project').innerHTML = U.options(ps, '', 'Inget projekt');
      body.querySelector('#f-project-wrap').hidden = !ps.length;
      onChange();
    });
    body.querySelector('#f-project').addEventListener('change', onChange);
  }

  function selectedProjectId(body) {
    var wrap = body.querySelector('#f-project-wrap');
    if (!wrap || wrap.hidden) return '';
    return body.querySelector('#f-project').value;
  }

  /* ---------- Tidsformulär ---------- */

  function openForm(id) {
    var e = id ? S.entry(id) : null;
    if (!e && !requireClient()) return;

    var clientId = e ? e.clientId : defaultClientId();
    var billed = e && e.invoiceId;
    var dis = billed ? ' disabled' : '';
    var html = '';

    if (billed) html += lockedNotice(e);

    html += '<div class="field"><label for="f-date">Datum</label>'
      + '<input type="date" id="f-date" value="' + U.esc(e ? e.date : S.todayISO()) + '"' + dis + '></div>';

    html += clientFields(clientId, e ? e.projectId : '', dis);

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
      if (e) html += '<button class="btn btn-danger btn-block" data-delete style="margin-top:10px">Ta bort</button>';
    }

    U.openSheet(e ? 'Redigera tidspost' : 'Ny tidspost', html, function (body) {
      var hoursInput = body.querySelector('#f-hours');

      function updatePreview() {
        var h = U.parseHours(hoursInput.value);
        var rate = S.rateFor(body.querySelector('#f-client').value, selectedProjectId(body));
        body.querySelector('#f-preview').innerHTML =
          '<div class="totals-row"><span class="muted">Timpris</span><span>' + U.money0(rate) + '/h</span></div>'
          + '<div class="totals-row"><span class="muted">Belopp exkl. moms</span><span><b>'
          + U.money(isFinite(h) ? h * rate : 0) + '</b></span></div>';
      }

      wireClientChange(body, updatePreview);
      hoursInput.addEventListener('input', updatePreview);

      body.addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-quick]');
        if (q) {
          var cur = U.parseHours(hoursInput.value);
          if (!isFinite(cur)) cur = 0;
          hoursInput.value = String(S.round2(cur + Number(q.getAttribute('data-quick')))).replace('.', ',');
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-clear]')) {
          hoursInput.value = '';
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-save]')) { submitTime(body, e); return; }
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

  function submitTime(body, existing) {
    var date = body.querySelector('#f-date').value;
    var clientId = body.querySelector('#f-client').value;
    var hours = U.parseHours(body.querySelector('#f-hours').value);

    if (!date) { U.toast('Välj datum', true); return; }
    if (!clientId) { U.toast('Välj kund', true); return; }
    if (!isFinite(hours) || hours <= 0) { U.toast('Ange antal timmar', true); return; }
    if (hours > 24) { U.toast('Mer än 24 timmar på en dag?', true); return; }

    S.saveEntry({
      id: existing ? existing.id : null,
      date: date,
      clientId: clientId,
      projectId: selectedProjectId(body) || null,
      hours: S.round2(hours),
      comment: body.querySelector('#f-comment').value.trim()
    });

    U.closeSheet();
    U.toast(existing ? 'Sparad' : U.hours(hours) + ' registrerad');
    render(container);
  }

  /* ---------- Materialformulär ---------- */

  function openMaterialForm(id) {
    var m = id ? S.material(id) : null;
    if (!m && !requireClient()) return;

    var clientId = m ? m.clientId : defaultClientId();
    var billed = m && m.invoiceId;
    var dis = billed ? ' disabled' : '';
    var markup = m ? m.markup : S.settings().materialMarkup;
    var html = '';

    if (billed) html += lockedNotice(m);

    html += '<div class="field"><label for="f-date">Datum</label>'
      + '<input type="date" id="f-date" value="' + U.esc(m ? m.date : S.todayISO()) + '"' + dis + '></div>';

    html += clientFields(clientId, m ? m.projectId : '', dis);

    html += '<div class="field"><label for="m-description">Vad köpte du? *</label>'
      + '<input type="text" id="m-description" placeholder="t.ex. Underlagspapp"'
      + ' value="' + U.esc(m ? m.description : '') + '"' + dis + '></div>';

    html += '<div class="row">'
      + '<div class="field"><label for="m-qty">Antal</label>'
      + '<input type="text" id="m-qty" inputmode="decimal" autocomplete="off" placeholder="1"'
      + ' value="' + U.esc(m ? String(m.qty).replace('.', ',') : '') + '"' + dis + '></div>'
      + '<div class="field"><label for="m-unit">Enhet</label>'
      + '<input type="text" id="m-unit" list="m-units" autocomplete="off"'
      + ' value="' + U.esc(m ? m.unit : 'st') + '"' + dis + '>'
      + '<datalist id="m-units">'
      + UNITS.map(function (u) { return '<option value="' + U.esc(u) + '">'; }).join('')
      + '</datalist></div>'
      + '</div>';

    html += '<div class="field"><label for="m-price">Á-pris till kund (kr)</label>'
      + '<input type="text" id="m-price" inputmode="decimal" autocomplete="off" placeholder="0"'
      + ' value="' + U.esc(m && m.unitPrice !== '' ? String(m.unitPrice).replace('.', ',') : '') + '"' + dis + '></div>';

    if (!billed) {
      html += '<details class="calc"' + (m && m.cost ? ' open' : '') + '>'
        + '<summary>Räkna fram á-priset från inköpspris</summary>'
        + '<div class="row" style="margin-top:12px">'
        + '<div class="field"><label for="m-cost">Inköpspris/enhet</label>'
        + '<input type="text" id="m-cost" inputmode="decimal" autocomplete="off" placeholder="0"'
        + ' value="' + U.esc(m && m.cost ? String(m.cost).replace('.', ',') : '') + '"></div>'
        + '<div class="field"><label for="m-markup">Påslag (%)</label>'
        + '<input type="text" id="m-markup" inputmode="decimal" autocomplete="off" placeholder="0"'
        + ' value="' + U.esc(markup || '') + '"></div>'
        + '</div>'
        + '<p class="small muted" style="margin:-4px 0 4px">Fyll i båda så räknas á-priset ut åt dig. '
        + 'Inköpspriset sparas men syns aldrig på fakturan.</p>'
        + '</details>';
    }

    html += '<div id="m-preview" class="totals small" style="margin:14px 0"></div>';

    if (!billed) {
      html += '<button class="btn btn-primary btn-block" data-save-material>'
        + (m ? 'Spara ändringar' : 'Lägg till material') + '</button>';
      if (m) {
        html += '<button class="btn btn-danger btn-block" data-delete-material style="margin-top:10px">'
          + 'Ta bort</button>';
      }
    }

    U.openSheet(m ? 'Redigera material' : 'Nytt material', html, function (body) {
      var qtyEl = body.querySelector('#m-qty');
      var priceEl = body.querySelector('#m-price');
      var costEl = body.querySelector('#m-cost');
      var markupEl = body.querySelector('#m-markup');

      function updatePreview() {
        var qty = U.parseHours(qtyEl.value);
        var price = U.parseHours(priceEl.value);
        var amount = (isFinite(qty) ? qty : 0) * (isFinite(price) ? price : 0);
        var vat = S.vatRateFor(body.querySelector('#f-client').value);
        var margin = null;

        if (costEl) {
          var cost = U.parseHours(costEl.value);
          if (isFinite(cost) && cost > 0 && isFinite(price)) {
            margin = (price - cost) * (isFinite(qty) ? qty : 0);
          }
        }

        body.querySelector('#m-preview').innerHTML =
          '<div class="totals-row"><span class="muted">Belopp exkl. moms</span><span><b>'
          + U.money(amount) + '</b></span></div>'
          + '<div class="totals-row"><span class="muted">Moms ' + vat + '%</span><span>'
          + U.money(amount * vat / 100) + '</span></div>'
          + (margin !== null
            ? '<div class="totals-row"><span class="muted">Din marginal</span><span>'
              + U.money(margin) + '</span></div>'
            : '');
      }

      /* Inköpspris + påslag fyller á-priset åt användaren. */
      function recalcPrice() {
        var cost = U.parseHours(costEl.value);
        var mk = U.parseHours(markupEl.value);
        if (!isFinite(cost) || cost <= 0) return;
        if (!isFinite(mk)) mk = 0;
        priceEl.value = String(S.round2(cost * (1 + mk / 100))).replace('.', ',');
        updatePreview();
      }

      wireClientChange(body, updatePreview);
      qtyEl.addEventListener('input', updatePreview);
      priceEl.addEventListener('input', updatePreview);
      if (costEl) {
        costEl.addEventListener('input', recalcPrice);
        markupEl.addEventListener('input', recalcPrice);
      }

      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-save-material]')) { submitMaterial(body, m); return; }
        if (ev.target.closest('[data-delete-material]')) {
          if (!confirm('Ta bort materialposten?')) return;
          if (S.deleteMaterial(m.id)) {
            U.closeSheet();
            U.toast('Material borttaget');
            render(container);
          } else {
            U.toast('Posten är fakturerad och kan inte tas bort', true);
          }
        }
      });

      updatePreview();
    });
  }

  function submitMaterial(body, existing) {
    var date = body.querySelector('#f-date').value;
    var clientId = body.querySelector('#f-client').value;
    var description = body.querySelector('#m-description').value.trim();
    var qty = U.parseHours(body.querySelector('#m-qty').value);
    var price = U.parseHours(body.querySelector('#m-price').value);
    var costEl = body.querySelector('#m-cost');
    var markupEl = body.querySelector('#m-markup');

    if (!date) { U.toast('Välj datum', true); return; }
    if (!clientId) { U.toast('Välj kund', true); return; }
    if (!description) { U.toast('Skriv vad du köpte', true); return; }
    if (!isFinite(qty) || qty <= 0) { U.toast('Ange antal', true); return; }
    if (!isFinite(price) || price < 0) { U.toast('Ange á-pris', true); return; }

    var cost = costEl ? U.parseHours(costEl.value) : NaN;
    var markup = markupEl ? U.parseHours(markupEl.value) : NaN;

    S.saveMaterial({
      id: existing ? existing.id : null,
      date: date,
      clientId: clientId,
      projectId: selectedProjectId(body) || null,
      description: description,
      qty: S.round2(qty),
      unit: body.querySelector('#m-unit').value.trim() || 'st',
      unitPrice: S.round2(price),
      cost: isFinite(cost) ? S.round2(cost) : '',
      markup: isFinite(markup) ? markup : ''
    });

    U.closeSheet();
    U.toast(existing ? 'Sparad' : 'Material tillagt');
    render(container);
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
      if (ev.target.closest('[data-new-material]')) { openMaterialForm(null); return; }

      var edit = ev.target.closest('[data-edit]');
      if (edit) { openForm(edit.getAttribute('data-edit')); return; }

      var editM = ev.target.closest('[data-edit-material]');
      if (editM) { openMaterialForm(editM.getAttribute('data-edit-material')); return; }

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

/* view-time.js - dagboken: registrera tid, material och korningar. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;

  var UNITS = ['st', 'm', 'm²', 'm³', 'kg', 'l', 'rulle', 'paket', 'säck', 'kartong', 'timme'];

  var NO_PROJECT = '__utan__'; // valet "Utan projekt" i projektfiltret

  var filter = { period: 'month', status: 'all', clientId: '', projectId: '' };
  var container = null;

  /* Vilken kund projektfiltret ska utga fran. Har man bara en enda kund
     behovs inget kundfilter - da ar den kunden underforstadd. */
  function filterClientId() {
    if (filter.clientId) return filter.clientId;
    var cs = S.clients();
    return cs.length === 1 ? cs[0].id : '';
  }

  function matchesProject(obj) {
    if (!filter.projectId) return true;
    if (filter.projectId === NO_PROJECT) return !obj.projectId;
    return obj.projectId === filter.projectId;
  }

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

  /* Slår ihop tid, material och körningar till en gemensam, datumsorterad lista. */
  function combined() {
    var q = query();
    var items = S.entries(q).map(function (e) {
      return { type: 'time', date: e.date, createdAt: e.createdAt || '', obj: e };
    }).concat(S.materials(q).map(function (m) {
      return { type: 'material', date: m.date, createdAt: m.createdAt || '', obj: m };
    })).concat(S.trips(q).map(function (t) {
      return { type: 'trip', date: t.date, createdAt: t.createdAt || '', obj: t };
    }));

    items = items.filter(function (it) { return matchesProject(it.obj); });

    return items.sort(function (a, b) {
      if (a.date !== b.date) return b.date < a.date ? -1 : 1;
      return b.createdAt < a.createdAt ? -1 : 1;
    });
  }

  /* Vad posten far faktureras for. Noll pa ett fastprisjobb - dar ar beloppet
     redan inbakat i projektets avtalade pris. */
  function itemAmount(it) {
    if (it.type === 'time') return S.billableEntry(it.obj);
    if (it.type === 'trip') return S.billableTrip(it.obj);
    return S.billableMaterial(it.obj);
  }

  function inFixedPrice(it) {
    if (it.type === 'time') return S.isFixed(it.obj.projectId);
    return S.fixedCoversExtras(it.obj.projectId);
  }

  /* Fastprisjobb som syns i urvalet och annu inte fakturerats. */
  function openFixedJobs(items) {
    var seen = {};
    var out = [];
    items.forEach(function (it) {
      var p = it.obj.projectId ? S.project(it.obj.projectId) : null;
      if (!p || seen[p.id] || p.invoiceId || !S.isFixedProject(p)) return;
      seen[p.id] = true;
      out.push(p);
    });
    return out;
  }

  function sumBy(items, fn) {
    return items.reduce(function (s, it) { return s + fn(it); }, 0);
  }

  /* ---------- Rendering ---------- */

  function render(el) {
    container = el;
    var items = combined();

    var totalHours = sumBy(items, function (it) {
      return it.type === 'time' ? Number(it.obj.hours || 0) : 0;
    });
    var totalDistance = sumBy(items, function (it) {
      return it.type === 'trip' ? Number(it.obj.distance || 0) : 0;
    });
    var totalAmount = sumBy(items, itemAmount);
    var unbilledAmount = sumBy(items, function (it) {
      return it.obj.invoiceId ? 0 : itemAmount(it);
    });
    var materialAmount = sumBy(items, function (it) {
      return it.type === 'material' ? itemAmount(it) : 0;
    });
    var tripAmount = sumBy(items, function (it) {
      return it.type === 'trip' ? itemAmount(it) : 0;
    });

    var fixedJobs = openFixedJobs(items);
    var fixedTotal = fixedJobs.reduce(function (s, p) { return s + S.fixedPriceOf(p); }, 0);
    totalAmount += fixedTotal;
    unbilledAmount += fixedTotal;

    var clients = S.clients();
    var html = '';

    html += '<button class="btn btn-primary btn-block" data-new>+ Registrera tid</button>'
      + '<div class="btn-row" style="margin:10px 0 16px">'
      + '<button class="btn" data-new-material>+ Material</button>'
      + '<button class="btn" data-new-trip>+ Körning</button>'
      + '</div>';

    if (!clients.length) {
      html += '<div class="card"><div class="card-title">Kom igång</div>'
        + '<p class="small muted" style="margin:0 0 12px">Lägg upp din första kund så kan du börja '
        + 'registrera timmar, material och körningar och fakturera.</p>'
        + '<button class="btn btn-block" data-goto="clients">Lägg till kund</button></div>';
    }

    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-value">' + U.hours(totalHours) + '</div>'
      + '<div class="stat-label">Timmar</div></div>'
      + '<div class="stat"><div class="stat-value">' + U.distance(totalDistance) + '</div>'
      + '<div class="stat-label">Mil</div></div>'
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

    html += projectFilterHTML();

    if (!items.length) {
      html += '<div class="empty">Inget registrerat i den här vyn.</div>';
    } else {
      html += renderGroups(items);
      html += '<div class="totals" style="margin-top:16px">'
        + '<div class="totals-row"><span>Timmar</span><span>' + U.hours(totalHours) + '</span></div>'
        + (materialAmount
          ? '<div class="totals-row"><span>Material</span><span>' + U.money(materialAmount) + '</span></div>'
          : '')
        + (tripAmount
          ? '<div class="totals-row"><span>Körning (' + U.distance(totalDistance) + ')</span><span>'
            + U.money(tripAmount) + '</span></div>'
          : '')
        + (fixedTotal
          ? '<div class="totals-row"><span>Fastprisjobb (' + fixedJobs.length + ')</span><span>'
            + U.money(fixedTotal) + '</span></div>'
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

  /* Projektfiltret visas bara nar det finns en kund att gora urvalet inom. */
  function projectFilterHTML() {
    var cid = filterClientId();
    if (!cid) return '';

    var projs = S.projects(cid, true).filter(function (p) {
      return !p.archived || p.id === filter.projectId;
    });
    if (!projs.length) return '';

    return '<div class="field"><select data-filter-project>'
      + '<option value="">Alla projekt</option>'
      + U.options(projs, filter.projectId)
      + '<option value="' + NO_PROJECT + '"'
      + (filter.projectId === NO_PROJECT ? ' selected' : '') + '>Utan projekt</option>'
      + '</select></div>';
  }

  /* Grupperar posterna per datum med dagssumma i rubriken. */
  function renderGroups(items) {
    var html = '';
    var currentDate = null;
    var buffer = [];

    function flush() {
      if (!buffer.length) return;
      var dayHours = sumBy(buffer, function (it) {
        return it.type === 'time' ? Number(it.obj.hours || 0) : 0;
      });
      var dayDistance = sumBy(buffer, function (it) {
        return it.type === 'trip' ? Number(it.obj.distance || 0) : 0;
      });
      var dayExtra = sumBy(buffer, function (it) {
        return it.type === 'time' ? 0 : itemAmount(it);
      });

      var summary = [];
      if (dayHours) summary.push(U.hours(dayHours));
      if (dayDistance) summary.push(U.distance(dayDistance));
      if (dayExtra) summary.push(U.money0(dayExtra));

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
    if (it.type === 'time') return entryHTML(it.obj);
    if (it.type === 'trip') return tripHTML(it.obj);
    return materialHTML(it.obj);
  }

  function ataBadge(obj) {
    return S.isAta(obj) ? '<span class="badge badge-ata">ÄTA</span>' : '';
  }

  /* Poster pa ett fastprisjobb ar betalda i och med att jobbet fakturerats,
     aven om posten registrerades efterat. */
  function billedBadge(obj) {
    var p = obj.projectId ? S.project(obj.projectId) : null;
    /* ÄTA ligger utanför det avtalade priset och blir alltså inte betald bara
       för att fastprisjobbet fakturerats - den behöver en egen rad. */
    var invId = obj.invoiceId || (S.isFixedProject(p) && !obj.ata ? p.invoiceId : null);
    if (!invId) return '<span class="badge badge-accent">Ofakturerad</span>';
    var inv = S.invoice(invId);
    return '<span class="badge badge-muted">Faktura ' + U.esc(inv ? inv.number : '?') + '</span>';
  }

  function entryHTML(e) {
    return '<button class="item" data-edit="' + U.esc(e.id) + '" type="button">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(label(e.clientId, e.projectId)) + '</span>'
      + '<span class="item-amount">' + U.hours(e.hours) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + (S.isFixed(e.projectId) && !e.ata
        ? '<span class="badge badge-fixed">Ingår i fastpris</span>'
        : '<span>' + U.money(amountOf(e)) + '</span>'
          + '<span class="dot">•</span>'
          + '<span>' + U.money0(S.rateFor(e.clientId, e.projectId)) + '/h</span>')
      + ataBadge(e)
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
      + (S.fixedCoversExtras(m.projectId) && !m.ata
        ? '<span class="badge badge-fixed">Ingår i fastpris</span>'
        : '<span>' + U.money(S.materialAmount(m)) + '</span>'
          + '<span class="dot">•</span>'
          + '<span>' + U.money(m.unitPrice) + '/' + U.esc(m.unit || 'st') + '</span>')
      + '<span class="badge badge-material">Material</span>'
      + ataBadge(m)
      + billedBadge(m)
      + '</div>'
      + '<div class="item-comment">' + U.esc(m.description) + '</div>'
      + '</button>';
  }

  /* Rutten "Fältgatan 12 → Hisingsleden 40", eller det som är ifyllt av dem. */
  function route(t) {
    if (t.from && t.to) return t.from + ' → ' + t.to;
    return t.from || t.to || '';
  }

  function tripHTML(t) {
    var parts = [];
    if (S.fixedCoversExtras(t.projectId) && !t.ata) {
      parts.push('<span class="badge badge-fixed">Ingår i fastpris</span>');
    } else {
      if (t.distance) {
        parts.push('<span>' + U.distance(t.distance) + ' × ' + U.money0(t.rate) + '</span>');
      }
      if (t.fee) {
        parts.push('<span>Framkörning ' + U.money0(t.fee) + '</span>');
      }
    }

    var text = [route(t), t.purpose].filter(function (x) { return x; }).join(' · ');

    return '<button class="item" data-edit-trip="' + U.esc(t.id) + '" type="button">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(label(t.clientId, t.projectId)) + '</span>'
      + '<span class="item-amount">' + U.money(S.tripAmount(t)) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + parts.join('<span class="dot">•</span>')
      + '<span class="badge badge-trip">Körning</span>'
      + ataBadge(t)
      + billedBadge(t)
      + '</div>'
      + (text ? '<div class="item-comment">' + U.esc(text) + '</div>' : '')
      + '</button>';
  }

  /* ---------- Gemensamt för formulären ---------- */

  function requireClient() {
    if (S.clients().length) return true;
    U.toast('Lägg till en kund först', true);
    global.App.go('clients');
    return false;
  }

  /* Senast använda kunden, oavsett posttyp — sparar en knapptryckning. */
  function defaultClientId() {
    if (filter.clientId) return filter.clientId;

    var newest = [S.entries()[0], S.materials()[0], S.trips()[0]]
      .filter(Boolean)
      .sort(function (a, b) { return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1; })[0];

    return newest ? newest.clientId : S.clients()[0].id;
  }

  /* Filtrerar du på ett projekt är det rimligen det du håller på med. */
  function defaultProjectId(clientId) {
    if (!filter.projectId || filter.projectId === NO_PROJECT) return '';
    var p = S.project(filter.projectId);
    return p && p.clientId === clientId ? p.id : '';
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

  /* ÄTA-rutan har bara mening på ett fastprisjobb. Den ritas alltid men döljs
     tills ett sådant projekt är valt. */
  function ataFieldHTML(obj, disabled) {
    return '<div id="f-ata-wrap" hidden>'
      + '<label class="check"><input type="checkbox" id="f-ata"'
      + (obj && obj.ata ? ' checked' : '') + disabled + '>'
      + '<span>ÄTA — ingår inte i fastpriset</span></label>'
      + '<p class="small muted" style="margin:-4px 0 12px">Ändrings- eller tilläggsarbete '
      + 'utöver det avtalade. Debiteras som egen rad på fakturan.</p></div>';
  }

  function toggleAtaField(body) {
    var wrap = body.querySelector('#f-ata-wrap');
    if (!wrap) return;
    var show = S.isFixed(selectedProjectId(body));
    wrap.hidden = !show;
    if (!show) body.querySelector('#f-ata').checked = false;
  }

  function ataChecked(body) {
    var wrap = body.querySelector('#f-ata-wrap');
    return !!(wrap && !wrap.hidden && body.querySelector('#f-ata').checked);
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

    html += clientFields(clientId, e ? e.projectId : defaultProjectId(clientId), dis);

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

    html += ataFieldHTML(e, dis);

    html += '<div id="f-preview" class="totals small" style="margin-bottom:14px"></div>';

    if (!billed) {
      html += '<button class="btn btn-primary btn-block" data-save>'
        + (e ? 'Spara ändringar' : 'Lägg till') + '</button>';
      if (e) html += '<button class="btn btn-danger btn-block" data-delete style="margin-top:10px">Ta bort</button>';
    }

    U.openSheet(e ? 'Redigera tidspost' : 'Ny tidspost', html, function (body) {
      var hoursInput = body.querySelector('#f-hours');

      function updatePreview() {
        toggleAtaField(body);
        var h = U.parseHours(hoursInput.value);
        var pid = selectedProjectId(body);
        var rate = S.rateFor(body.querySelector('#f-client').value, pid);
        var amount = isFinite(h) ? h * rate : 0;
        var covered = S.isFixed(pid) && !ataChecked(body);

        body.querySelector('#f-preview').innerHTML =
          '<div class="totals-row"><span class="muted">Timpris</span><span>' + U.money0(rate) + '/h</span></div>'
          + (covered
            ? '<div class="totals-row"><span class="muted">Fastpris</span><span>'
              + 'ingen extra debitering</span></div>'
            : '<div class="totals-row"><span class="muted">Belopp exkl. moms</span><span><b>'
              + U.money(amount) + '</b></span></div>');
      }

      wireClientChange(body, updatePreview);
      hoursInput.addEventListener('input', updatePreview);
      if (body.querySelector('#f-ata')) {
        body.querySelector('#f-ata').addEventListener('change', updatePreview);
      }

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
      comment: body.querySelector('#f-comment').value.trim(),
      ata: ataChecked(body)
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

    html += clientFields(clientId, m ? m.projectId : defaultProjectId(clientId), dis);

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
        + '<div class="field"><label for="m-pvat">Moms på inköpet (kr)</label>'
        + '<input type="text" id="m-pvat" inputmode="decimal" autocomplete="off"'
        + ' value="' + U.esc(m && m.purchaseVat !== '' && m.purchaseVat !== undefined
          && m.purchaseVat !== null ? String(m.purchaseVat).replace('.', ',') : '') + '"></div>'
        + '<p class="small muted" style="margin:-4px 0 4px">Fyll i båda så räknas á-priset ut åt dig. '
        + 'Inköpspris och moms syns aldrig på fakturan — momsen hamnar i momsunderlaget som '
        + 'ingående moms. Lämnas momsfältet tomt räknas 25 % av inköpspriset; står det något '
        + 'annat på kvittot, skriv av kvittot.</p>'
        + '</details>';
    }

    html += ataFieldHTML(m, dis);

    html += U.photoFieldHTML('Kvitto på inköpet');

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
      var pvatEl = body.querySelector('#m-pvat');

      /* Kontrollern behovs i submitMaterial, som bara far body. */
      body.__photo = U.initPhotoField(body, m ? m.photoId : '');

      function updatePreview() {
        toggleAtaField(body);
        var qty = U.parseHours(qtyEl.value);
        var price = U.parseHours(priceEl.value);
        var amount = (isFinite(qty) ? qty : 0) * (isFinite(price) ? price : 0);
        var vat = S.vatRateFor(body.querySelector('#f-client').value);
        var covered = S.fixedCoversExtras(selectedProjectId(body)) && !ataChecked(body);
        var margin = null;

        if (costEl) {
          var cost = U.parseHours(costEl.value);
          if (isFinite(cost) && cost > 0 && isFinite(price)) {
            margin = (price - cost) * (isFinite(qty) ? qty : 0);
          }
          /* Forslaget pa inkopsmomsen foljer med i platshallaren - det som
             faktiskt sparas ar det man skriver, eller 25 % om faltet ar tomt. */
          if (pvatEl && isFinite(cost) && cost > 0) {
            var q = isFinite(qty) && qty > 0 ? qty : 1;
            pvatEl.placeholder = String(S.round2(q * cost * 0.25)).replace('.', ',')
              + ' (25 %)';
          } else if (pvatEl) {
            pvatEl.placeholder = '';
          }
        }

        body.querySelector('#m-preview').innerHTML =
          (covered
            ? '<div class="totals-row"><span class="muted">Fastpris</span><span>'
              + 'ingår i priset</span></div>'
            : '<div class="totals-row"><span class="muted">Belopp exkl. moms</span><span><b>'
              + U.money(amount) + '</b></span></div>'
              + '<div class="totals-row"><span class="muted">Moms ' + vat + '%</span><span>'
              + U.money(amount * vat / 100) + '</span></div>')
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
      if (body.querySelector('#f-ata')) {
        body.querySelector('#f-ata').addEventListener('change', updatePreview);
      }
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
    var pvatEl = body.querySelector('#m-pvat');
    var pvat = pvatEl ? U.parseHours(pvatEl.value) : NaN;

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
      markup: isFinite(markup) ? markup : '',
      purchaseVat: isFinite(pvat) && pvat >= 0 ? S.round2(pvat) : '',
      photoId: body.__photo ? body.__photo.commit(existing ? existing.photoId : '')
        : (existing ? existing.photoId : ''),
      ata: ataChecked(body)
    });

    U.closeSheet();
    U.toast(existing ? 'Sparad' : 'Material tillagt');
    render(container);
  }

  /* ---------- Körningsformulär ---------- */

  function openTripForm(id) {
    var t = id ? S.trip(id) : null;
    if (!t && !requireClient()) return;

    var s = S.settings();
    var clientId = t ? t.clientId : defaultClientId();
    var billed = t && t.invoiceId;
    var dis = billed ? ' disabled' : '';
    var rate = t ? t.rate : s.mileageRate;
    var fee = t ? t.fee : s.calloutFee;
    var html = '';

    if (billed) html += lockedNotice(t);

    html += '<div class="field"><label for="f-date">Datum</label>'
      + '<input type="date" id="f-date" value="' + U.esc(t ? t.date : S.todayISO()) + '"' + dis + '></div>';

    html += clientFields(clientId, t ? t.projectId : defaultProjectId(clientId), dis);

    html += '<div class="field"><label for="t-distance">Antal mil</label>'
      + '<input type="text" id="t-distance" inputmode="decimal" autocomplete="off" placeholder="t.ex. 4,5"'
      + ' value="' + U.esc(t && t.distance ? String(t.distance).replace('.', ',') : '') + '"' + dis + '>'
      + (billed ? '' : '<div class="quick quick-periods">'
        + '<button type="button" data-double>× 2 (tur &amp; retur)</button>'
        + '<button type="button" data-clear title="Nollställ">C</button></div>')
      + '</div>';

    html += '<div class="row">'
      + '<div class="field"><label for="t-rate">Milersättning (kr/mil)</label>'
      + '<input type="text" id="t-rate" inputmode="decimal" autocomplete="off"'
      + ' value="' + U.esc(String(rate || 0).replace('.', ',')) + '"' + dis + '></div>'
      + '<div class="field"><label for="t-fee">Framkörning (kr)</label>'
      + '<input type="text" id="t-fee" inputmode="decimal" autocomplete="off" placeholder="0"'
      + ' value="' + U.esc(fee ? String(fee).replace('.', ',') : '') + '"' + dis + '></div>'
      + '</div>';

    html += '<div class="section-title" style="margin-left:0">Körjournal</div>';

    html += '<div class="field"><label for="t-from">Från</label>'
      + '<input type="text" id="t-from" placeholder="Startadress"'
      + ' value="' + U.esc(t ? t.from : (S.company().address || '')) + '"' + dis + '></div>';

    html += '<div class="field"><label for="t-to">Till</label>'
      + '<input type="text" id="t-to" placeholder="Måladress"'
      + ' value="' + U.esc(t ? t.to : '') + '"' + dis + '></div>';

    html += '<div class="field"><label for="t-purpose">Ärende</label>'
      + '<input type="text" id="t-purpose" placeholder="t.ex. Takarbete"'
      + ' value="' + U.esc(t ? t.purpose : '') + '"' + dis + '></div>';

    html += ataFieldHTML(t, dis);

    html += '<div id="t-preview" class="totals small" style="margin-bottom:14px"></div>';

    if (!billed) {
      html += '<button class="btn btn-primary btn-block" data-save-trip>'
        + (t ? 'Spara ändringar' : 'Lägg till körning') + '</button>';
      if (t) {
        html += '<button class="btn btn-danger btn-block" data-delete-trip style="margin-top:10px">'
          + 'Ta bort</button>';
      }
    }

    U.openSheet(t ? 'Redigera körning' : 'Ny körning', html, function (body) {
      var distEl = body.querySelector('#t-distance');
      var rateEl = body.querySelector('#t-rate');
      var feeEl = body.querySelector('#t-fee');

      function values() {
        var d = U.parseHours(distEl.value);
        var r = U.parseHours(rateEl.value);
        var f = U.parseHours(feeEl.value);
        return {
          distance: isFinite(d) ? d : 0,
          rate: isFinite(r) ? r : 0,
          fee: isFinite(f) ? f : 0
        };
      }

      function updatePreview() {
        toggleAtaField(body);
        var v = values();
        var mil = S.round2(v.distance * v.rate);
        var vat = S.vatRateFor(body.querySelector('#f-client').value);
        var sum = S.round2(mil + v.fee);

        if (S.fixedCoversExtras(selectedProjectId(body)) && !ataChecked(body)) {
          body.querySelector('#t-preview').innerHTML =
            '<div class="totals-row"><span class="muted">' + U.distance(v.distance)
            + '</span><span>ingår i fastpriset</span></div>';
          return;
        }

        body.querySelector('#t-preview').innerHTML =
          '<div class="totals-row"><span class="muted">' + U.distance(v.distance) + ' × '
          + U.money0(v.rate) + '</span><span>' + U.money(mil) + '</span></div>'
          + (v.fee
            ? '<div class="totals-row"><span class="muted">Framkörning</span><span>'
              + U.money(v.fee) + '</span></div>'
            : '')
          + '<div class="totals-row"><span class="muted">Moms ' + vat + '%</span><span>'
          + U.money(sum * vat / 100) + '</span></div>'
          + '<div class="totals-row grand"><span>Att fakturera</span><span>' + U.money(sum) + '</span></div>';
      }

      wireClientChange(body, updatePreview);
      distEl.addEventListener('input', updatePreview);
      rateEl.addEventListener('input', updatePreview);
      feeEl.addEventListener('input', updatePreview);
      if (body.querySelector('#f-ata')) {
        body.querySelector('#f-ata').addEventListener('change', updatePreview);
      }

      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-double]')) {
          var d = U.parseHours(distEl.value);
          if (isFinite(d) && d > 0) {
            distEl.value = String(S.round2(d * 2)).replace('.', ',');
            updatePreview();
          } else {
            U.toast('Fyll i sträckan enkel väg först', true);
          }
          return;
        }
        if (ev.target.closest('[data-clear]')) {
          distEl.value = '';
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-save-trip]')) { submitTrip(body, t); return; }
        if (ev.target.closest('[data-delete-trip]')) {
          if (!confirm('Ta bort körningen?')) return;
          if (S.deleteTrip(t.id)) {
            U.closeSheet();
            U.toast('Körning borttagen');
            render(container);
          } else {
            U.toast('Posten är fakturerad och kan inte tas bort', true);
          }
        }
      });

      updatePreview();
    });
  }

  function submitTrip(body, existing) {
    var date = body.querySelector('#f-date').value;
    var clientId = body.querySelector('#f-client').value;
    var distance = U.parseHours(body.querySelector('#t-distance').value);
    var rate = U.parseHours(body.querySelector('#t-rate').value);
    var fee = U.parseHours(body.querySelector('#t-fee').value);

    if (!isFinite(distance)) distance = 0;
    if (!isFinite(rate)) rate = 0;
    if (!isFinite(fee)) fee = 0;

    if (!date) { U.toast('Välj datum', true); return; }
    if (!clientId) { U.toast('Välj kund', true); return; }
    if (distance < 0 || rate < 0 || fee < 0) { U.toast('Negativa belopp går inte', true); return; }
    if (distance * rate + fee <= 0) {
      U.toast('Fyll i antal mil eller en framkörningsavgift', true);
      return;
    }

    S.saveTrip({
      id: existing ? existing.id : null,
      date: date,
      clientId: clientId,
      projectId: selectedProjectId(body) || null,
      distance: S.round2(distance),
      rate: S.round2(rate),
      fee: S.round2(fee),
      from: body.querySelector('#t-from').value.trim(),
      to: body.querySelector('#t-to').value.trim(),
      purpose: body.querySelector('#t-purpose').value.trim(),
      ata: ataChecked(body)
    });

    U.closeSheet();
    U.toast(existing ? 'Sparad' : 'Körning tillagd');
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
        filter.projectId = ''; // projekten hor till kunden som just byttes
        render(el);
        return;
      }
      var pf = ev.target.closest('[data-filter-project]');
      if (pf) {
        filter.projectId = pf.value;
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
      if (ev.target.closest('[data-new-trip]')) { openTripForm(null); return; }

      var edit = ev.target.closest('[data-edit]');
      if (edit) { openForm(edit.getAttribute('data-edit')); return; }

      var editM = ev.target.closest('[data-edit-material]');
      if (editM) { openMaterialForm(editM.getAttribute('data-edit-material')); return; }

      var editT = ev.target.closest('[data-edit-trip]');
      if (editT) { openTripForm(editT.getAttribute('data-edit-trip')); return; }

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

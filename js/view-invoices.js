/* view-invoices.js - skapa, visa och skriva ut fakturor. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;

  var STATUS = {
    utkast: { label: 'Utkast', cls: 'badge-muted' },
    skickad: { label: 'Skickad', cls: 'badge-warn' },
    betald: { label: 'Betald', cls: 'badge-ok' }
  };

  /* ---------- Lista ---------- */

  function render(el) {
    container = el;
    var list = S.invoices();
    var unbilled = S.entries({ status: 'unbilled' });
    var unbilledAmount = unbilled.reduce(function (s, e) {
      return s + Number(e.hours || 0) * S.rateFor(e.clientId, e.projectId);
    }, 0);
    var outstanding = list
      .filter(function (i) { return i.status !== 'betald'; })
      .reduce(function (s, i) { return s + Number(i.total || 0); }, 0);

    var html = '<button class="btn btn-primary btn-block" data-new-invoice style="margin-bottom:16px">'
      + '+ Ny faktura</button>';

    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-value">' + U.money0(unbilledAmount) + '</div>'
      + '<div class="stat-label">Ofakturerat</div></div>'
      + '<div class="stat"><div class="stat-value">' + U.money0(outstanding) + '</div>'
      + '<div class="stat-label">Obetalt</div></div>'
      + '</div>';

    if (!list.length) {
      html += '<div class="empty">Inga fakturor ännu.<br>'
        + (unbilled.length
          ? 'Du har ' + unbilled.length + ' ofakturerade tidsposter att fakturera.'
          : 'Registrera tid först, så kan du skapa en faktura.') + '</div>';
    } else {
      html += '<div class="list">' + list.map(invoiceItem).join('') + '</div>';
    }

    el.innerHTML = html;
    wire(el);
  }

  function invoiceItem(inv) {
    var st = STATUS[inv.status] || STATUS.utkast;
    var overdue = inv.status !== 'betald' && inv.dueDate && inv.dueDate < S.todayISO();
    return '<button class="item" type="button" data-invoice="' + U.esc(inv.id) + '">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(inv.number) + ' · ' + U.esc(inv.clientSnapshot ? inv.clientSnapshot.name : '') + '</span>'
      + '<span class="item-amount">' + U.money0(inv.total) + '</span>'
      + '</div>'
      + '<div class="item-sub">'
      + '<span>' + U.esc(U.dateShort(inv.issueDate)) + '</span>'
      + '<span class="dot">•</span>'
      + '<span class="badge ' + st.cls + '">' + st.label + '</span>'
      + (overdue ? '<span class="badge badge-danger">Förfallen</span>' : '')
      + '<span class="dot">•</span><span>' + (inv.lines ? inv.lines.length : 0) + ' rader</span>'
      + '</div></button>';
  }

  /* ---------- Ny faktura ---------- */

  function openNew() {
    var clients = S.clients(true).filter(function (c) {
      return S.entries({ clientId: c.id, status: 'unbilled' }).length > 0;
    });

    if (!clients.length) {
      U.toast('Ingen ofakturerad tid att fakturera', true);
      return;
    }

    var s = S.settings();
    var today = S.todayISO();

    var html = '<div class="field"><label for="i-client">Kund</label>'
      + '<select id="i-client">' + U.options(clients, clients[0].id) + '</select></div>';

    html += '<div class="field"><label>Period (ofakturerad tid t.o.m.)</label>'
      + '<div class="row">'
      + '<input type="date" id="i-from" value="" aria-label="Från">'
      + '<input type="date" id="i-to" value="' + U.esc(today) + '" aria-label="Till">'
      + '</div>'
      + '<div class="quick quick-periods">'
      + '<button type="button" data-period="month">Denna månad</button>'
      + '<button type="button" data-period="prev">Förra</button>'
      + '<button type="button" data-period="all">Allt</button>'
      + '</div></div>';

    html += '<div class="row"><div class="field"><label for="i-issue">Fakturadatum</label>'
      + '<input type="date" id="i-issue" value="' + U.esc(today) + '"></div>'
      + '<div class="field"><label for="i-due">Förfallodatum</label>'
      + '<input type="date" id="i-due" value="' + U.esc(U.addDays(today, Number(s.paymentTermsDays) || 30)) + '"></div></div>';

    html += '<div class="field"><label>Specifikation</label>'
      + '<div class="seg"><button type="button" data-mode="detailed" aria-pressed="true">Varje tidspost</button>'
      + '<button type="button" data-mode="grouped" aria-pressed="false">Summera per projekt</button></div></div>';

    html += '<div class="field"><label for="i-notes">Meddelande på fakturan</label>'
      + '<textarea id="i-notes" placeholder="T.ex. Tack för förtroendet!"></textarea></div>';

    html += '<div id="i-preview"></div>';

    html += '<button class="btn btn-primary btn-block" data-create style="margin-top:14px">Skapa faktura</button>';

    U.openSheet('Ny faktura ' + S.peekInvoiceNumber(), html, function (body) {
      var mode = 'detailed';

      function selected() {
        var clientId = body.querySelector('#i-client').value;
        var from = body.querySelector('#i-from').value;
        var to = body.querySelector('#i-to').value;
        return S.entries({ clientId: clientId, from: from || null, to: to || null, status: 'unbilled' });
      }

      function updatePreview() {
        var list = selected();
        var clientId = body.querySelector('#i-client').value;
        var vatRate = S.vatRateFor(clientId);
        var lines = buildLines(list, mode);
        var sums = totals(lines, vatRate);
        var box = body.querySelector('#i-preview');

        if (!list.length) {
          box.innerHTML = '<div class="empty small">Ingen ofakturerad tid i vald period.</div>';
          body.querySelector('[data-create]').disabled = true;
          return;
        }
        body.querySelector('[data-create]').disabled = false;

        box.innerHTML = '<div class="totals">'
          + '<div class="totals-row"><span class="muted">' + list.length + ' tidsposter · '
          + lines.length + ' fakturarader</span><span>' + U.hours(sums.hours) + '</span></div>'
          + '<div class="totals-row"><span class="muted">Summa exkl. moms</span><span>' + U.money(sums.subtotal) + '</span></div>'
          + '<div class="totals-row"><span class="muted">Moms ' + vatRate + '%</span><span>' + U.money(sums.vat) + '</span></div>'
          + '<div class="totals-row grand"><span>Att betala</span><span>' + U.money(sums.total) + '</span></div>'
          + '</div>';
      }

      body.addEventListener('change', updatePreview);
      body.addEventListener('input', function (ev) {
        if (ev.target.type === 'date') updatePreview();
      });

      body.addEventListener('click', function (ev) {
        var per = ev.target.closest('[data-period]');
        if (per) {
          var p = per.getAttribute('data-period');
          var r = p === 'all' ? { from: '', to: '' } : U.monthRange(p === 'prev' ? -1 : 0);
          body.querySelector('#i-from').value = r.from;
          body.querySelector('#i-to').value = r.to;
          updatePreview();
          return;
        }
        var m = ev.target.closest('[data-mode]');
        if (m) {
          mode = m.getAttribute('data-mode');
          body.querySelectorAll('[data-mode]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b === m));
          });
          updatePreview();
          return;
        }
        if (ev.target.closest('[data-create]')) {
          create(body, selected(), mode);
        }
      });

      body.querySelector('#i-issue').addEventListener('change', function () {
        body.querySelector('#i-due').value = U.addDays(this.value, Number(S.settings().paymentTermsDays) || 30);
      });

      updatePreview();
    });
  }

  /* Bygger fakturarader ur tidsposterna. Raderna sparas på fakturan så att
     historiken inte ändras om timpriset justeras senare. */
  function buildLines(entries, mode) {
    var asc = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    if (mode === 'grouped') {
      var groups = {};
      asc.forEach(function (e) {
        var rate = S.rateFor(e.clientId, e.projectId);
        var p = e.projectId ? S.project(e.projectId) : null;
        var name = p ? p.name : 'Konsulttid';
        var key = name + '|' + rate;
        if (!groups[key]) groups[key] = { description: name, hours: 0, rate: rate, from: e.date, to: e.date };
        groups[key].hours += Number(e.hours || 0);
        if (e.date < groups[key].from) groups[key].from = e.date;
        if (e.date > groups[key].to) groups[key].to = e.date;
      });
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        return {
          date: '',
          description: g.description + ' (' + g.from + ' – ' + g.to + ')',
          hours: U.round2(g.hours),
          rate: g.rate,
          amount: U.round2(g.hours * g.rate)
        };
      });
    }

    return asc.map(function (e) {
      var rate = S.rateFor(e.clientId, e.projectId);
      var p = e.projectId ? S.project(e.projectId) : null;
      var desc = e.comment || 'Arbetad tid';
      if (p) desc = p.name + ' – ' + desc;
      return {
        date: e.date,
        description: desc,
        hours: Number(e.hours || 0),
        rate: rate,
        amount: U.round2(Number(e.hours || 0) * rate)
      };
    });
  }

  function totals(lines, vatRate) {
    var hours = lines.reduce(function (s, l) { return s + Number(l.hours || 0); }, 0);
    var subtotal = U.round2(lines.reduce(function (s, l) { return s + Number(l.amount || 0); }, 0));
    var vat = U.round2(subtotal * (Number(vatRate) || 0) / 100);
    return { hours: U.round2(hours), subtotal: subtotal, vat: vat, total: U.round2(subtotal + vat) };
  }

  function create(body, entries, mode) {
    if (!entries.length) { U.toast('Ingen tid vald', true); return; }

    var clientId = body.querySelector('#i-client').value;
    var c = S.client(clientId);
    var comp = S.company();
    var vatRate = S.vatRateFor(clientId);
    var lines = buildLines(entries, mode);
    var sums = totals(lines, vatRate);

    var inv = S.createInvoice({
      clientId: clientId,
      clientSnapshot: {
        name: c.name, contact: c.contact, orgnr: c.orgnr,
        address: c.address, zip: c.zip, city: c.city, email: c.email
      },
      companySnapshot: JSON.parse(JSON.stringify(comp)),
      issueDate: body.querySelector('#i-issue').value || S.todayISO(),
      dueDate: body.querySelector('#i-due').value || '',
      entryIds: entries.map(function (e) { return e.id; }),
      lines: lines,
      mode: mode,
      vatRate: vatRate,
      hours: sums.hours,
      subtotal: sums.subtotal,
      vat: sums.vat,
      total: sums.total,
      notes: body.querySelector('#i-notes').value.trim()
    });

    U.toast('Faktura ' + inv.number + ' skapad');
    render(container);
    openInvoice(inv.id);
  }

  /* ---------- Visa faktura ---------- */

  function openInvoice(id) {
    var inv = S.invoice(id);
    if (!inv) return;
    var st = STATUS[inv.status] || STATUS.utkast;

    var html = '<div class="btn-row" style="margin-bottom:14px">'
      + '<button class="btn btn-primary" data-print>Skriv ut / PDF</button>'
      + (inv.clientSnapshot && inv.clientSnapshot.email
        ? '<button class="btn" data-mail>E-post</button>' : '')
      + '</div>';

    html += '<div class="seg" style="margin-bottom:14px">'
      + statusBtn(inv, 'utkast', 'Utkast')
      + statusBtn(inv, 'skickad', 'Skickad')
      + statusBtn(inv, 'betald', 'Betald')
      + '</div>';

    html += '<div class="totals">'
      + '<div class="totals-row"><span class="muted">Status</span><span class="badge ' + st.cls + '">' + st.label + '</span></div>'
      + '<div class="totals-row"><span class="muted">Fakturadatum</span><span>' + U.esc(inv.issueDate) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Förfallodatum</span><span>' + U.esc(inv.dueDate || '–') + '</span></div>'
      + '<div class="totals-row"><span class="muted">Timmar</span><span>' + U.hours(inv.hours) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Moms ' + U.esc(inv.vatRate) + '%</span><span>' + U.money(inv.vat) + '</span></div>'
      + '<div class="totals-row grand"><span>Att betala</span><span>' + U.money(inv.total) + '</span></div>'
      + '</div>';

    html += '<div class="section-title">Förhandsvisning</div>';
    html += invoiceHTML(inv);

    html += '<div class="section-title">Hantera</div>';
    html += '<button class="btn btn-danger btn-block" data-delete-invoice>Ta bort faktura</button>';
    html += '<p class="small muted" style="margin-top:8px">Tidsposterna blir ofakturerade igen och kan faktureras om. '
      + 'Fakturanumret återanvänds inte.</p>';

    U.openSheet('Faktura ' + inv.number, html, function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-print]')) { printInvoice(inv); return; }
        if (ev.target.closest('[data-mail]')) { mailInvoice(inv); return; }
        var st2 = ev.target.closest('[data-status]');
        if (st2) {
          S.setInvoiceStatus(inv.id, st2.getAttribute('data-status'));
          U.toast('Status uppdaterad');
          openInvoice(inv.id);
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-invoice]')) {
          if (!confirm('Ta bort faktura ' + inv.number + '? Tidsposterna blir ofakturerade igen.')) return;
          S.deleteInvoice(inv.id);
          U.closeSheet();
          U.toast('Faktura borttagen');
          render(container);
        }
      });
    });
  }

  function statusBtn(inv, value, label) {
    return '<button type="button" data-status="' + value + '" aria-pressed="'
      + (inv.status === value) + '">' + label + '</button>';
  }

  /* ---------- Fakturans utseende ---------- */

  function invoiceHTML(inv) {
    var co = inv.companySnapshot || {};
    var cl = inv.clientSnapshot || {};
    var detailed = inv.mode !== 'grouped';

    var rows = (inv.lines || []).map(function (l) {
      return '<tr>'
        + (detailed ? '<td class="nowrap">' + U.esc(l.date) + '</td>' : '')
        + '<td class="desc">' + U.esc(l.description) + '</td>'
        + '<td class="num">' + U.esc(String(l.hours).replace('.', ',')) + '</td>'
        + '<td class="num">' + U.money(l.rate) + '</td>'
        + '<td class="num">' + U.money(l.amount) + '</td>'
        + '</tr>';
    }).join('');

    var html = '<div class="invoice">';

    html += '<div class="inv-head">'
      + '<div><h2>Faktura</h2>'
      + '<div class="inv-from"><b>' + U.esc(co.name || 'Ditt företag') + '</b><br>'
      + line(co.address) + line(joinNonEmpty([co.zip, co.city], ' '))
      + line(co.email) + line(co.phone)
      + (co.orgnr ? 'Org.nr ' + U.esc(co.orgnr) + '<br>' : '')
      + (co.vatnr ? 'Momsreg.nr ' + U.esc(co.vatnr) : '')
      + '</div></div>'
      + '<div class="inv-meta">'
      + '<div><b>Fakturanummer</b> ' + U.esc(inv.number) + '</div>'
      + '<div><b>Fakturadatum</b> ' + U.esc(inv.issueDate) + '</div>'
      + '<div><b>Förfallodatum</b> ' + U.esc(inv.dueDate || '–') + '</div>'
      + '<div><b>Att betala</b> ' + U.money(inv.total) + '</div>'
      + '</div></div>';

    html += '<div class="inv-parties"><div class="inv-party">'
      + '<div class="lbl">Faktureras till</div>'
      + '<b>' + U.esc(cl.name || '') + '</b><br>'
      + line(cl.contact) + line(cl.address) + line(joinNonEmpty([cl.zip, cl.city], ' '))
      + (cl.orgnr ? 'Org.nr ' + U.esc(cl.orgnr) : '')
      + '</div></div>';

    html += '<div class="inv-table-wrap"><table class="inv-table"><thead><tr>'
      + (detailed ? '<th>Datum</th>' : '')
      + '<th>Beskrivning</th><th class="num">Tim</th><th class="num">á pris</th><th class="num">Belopp</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    html += '<div class="inv-sum">'
      + '<div class="inv-sum-row"><span>Summa exkl. moms</span><span>' + U.money(inv.subtotal) + '</span></div>'
      + '<div class="inv-sum-row"><span>Moms ' + U.esc(inv.vatRate) + '%</span><span>' + U.money(inv.vat) + '</span></div>'
      + '<div class="inv-sum-row total"><span>Att betala</span><span>' + U.money(inv.total) + '</span></div>'
      + '</div>';

    if (inv.notes) html += '<div class="inv-note">' + U.esc(inv.notes) + '</div>';

    html += '<div class="inv-foot">'
      + '<div><b>Betalning</b><br>'
      + (co.bankgiro ? 'Bankgiro ' + U.esc(co.bankgiro) + '<br>' : '')
      + (co.iban ? 'IBAN ' + U.esc(co.iban) + '<br>' : '')
      + (co.bic ? 'BIC ' + U.esc(co.bic) + '<br>' : '')
      + 'Ange fakturanummer ' + U.esc(inv.number) + ' som referens.</div>'
      + '<div><b>Villkor</b><br>'
      + 'Betalningsvillkor: ' + daysBetween(inv.issueDate, inv.dueDate) + ' dagar<br>'
      + 'Dröjsmålsränta enligt räntelagen.'
      + (co.fskatt ? '<br>Innehar F-skattsedel.' : '')
      + '</div>'
      + '</div>';

    html += '</div>';
    return html;
  }

  function line(v) { return v ? U.esc(v) + '<br>' : ''; }

  function joinNonEmpty(arr, sep) {
    return arr.filter(function (x) { return x; }).join(sep);
  }

  function daysBetween(a, b) {
    var da = U.parseISO(a), db = U.parseISO(b);
    if (!da || !db) return '–';
    return Math.round((db - da) / 86400000);
  }

  function printInvoice(inv) {
    var area = document.getElementById('print-area');
    area.innerHTML = invoiceHTML(inv);
    setTimeout(function () { global.print(); }, 60);
  }

  /* Öppnar ett mejlutkast i användarens mejlapp — inget skickas automatiskt. */
  function mailInvoice(inv) {
    var cl = inv.clientSnapshot || {};
    var co = inv.companySnapshot || {};
    var subject = 'Faktura ' + inv.number + ' från ' + (co.name || '');
    var bodyText = 'Hej' + (cl.contact ? ' ' + cl.contact : '') + ',\n\n'
      + 'Här kommer faktura ' + inv.number + '.\n\n'
      + 'Fakturadatum: ' + inv.issueDate + '\n'
      + 'Förfallodatum: ' + (inv.dueDate || '-') + '\n'
      + 'Att betala: ' + U.money(inv.total) + '\n\n'
      + (co.bankgiro ? 'Bankgiro: ' + co.bankgiro + '\n' : '')
      + '\nMed vänlig hälsning\n' + (co.name || '');
    global.location.href = 'mailto:' + encodeURIComponent(cl.email || '')
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(bodyText);
  }

  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-new-invoice]')) { openNew(); return; }
      var i = ev.target.closest('[data-invoice]');
      if (i) openInvoice(i.getAttribute('data-invoice'));
    });
  }

  global.Views = global.Views || {};
  global.Views.invoices = {
    title: 'Fakturor',
    actions: '<button class="icon-btn" data-act="new" aria-label="Ny faktura">+</button>',
    onAction: function (act) { if (act === 'new') openNew(); },
    render: render
  };
})(window);

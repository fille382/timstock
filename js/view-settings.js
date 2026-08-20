/* view-settings.js - foretagsuppgifter, standardvarden och backup. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;

  function render(el) {
    container = el;
    var co = S.company();
    var s = S.settings();
    var d = S.raw();

    var html = '';

    html += '<div class="card"><div class="card-title">Ditt företag</div>'
      + '<p class="small muted" style="margin:-4px 0 14px">Visas som avsändare på fakturorna.</p>'
      + field('co-name', 'Företagsnamn', co.name)
      + field('co-orgnr', 'Organisationsnummer', co.orgnr)
      + field('co-vatnr', 'Momsregistreringsnummer', co.vatnr)
      + field('co-address', 'Adress', co.address)
      + '<div class="row"><div class="field" style="flex:0 0 38%"><label for="co-zip">Postnr</label>'
      + '<input type="text" id="co-zip" inputmode="numeric" value="' + U.esc(co.zip) + '"></div>'
      + '<div class="field"><label for="co-city">Ort</label>'
      + '<input type="text" id="co-city" value="' + U.esc(co.city) + '"></div></div>'
      + field('co-email', 'E-post', co.email, 'email')
      + field('co-phone', 'Telefon', co.phone, 'tel')
      + field('co-bankgiro', 'Bankgiro', co.bankgiro)
      + field('co-iban', 'IBAN', co.iban)
      + field('co-bic', 'BIC/Swift', co.bic)
      + '<label class="check"><input type="checkbox" id="co-fskatt"' + (co.fskatt ? ' checked' : '') + '>'
      + '<span>Innehar F-skattsedel (visas på fakturan)</span></label>'
      + '<button class="btn btn-primary btn-block" data-save-company style="margin-top:12px">Spara företagsuppgifter</button>'
      + '</div>';

    html += '<div class="card"><div class="card-title">Standardvärden</div>'
      + '<div class="row">'
      + '<div class="field"><label for="s-rate">Timpris (kr)</label>'
      + '<input type="number" id="s-rate" inputmode="decimal" step="1" min="0" value="' + U.esc(s.defaultRate) + '"></div>'
      + '<div class="field"><label for="s-vat">Moms (%)</label>'
      + '<input type="number" id="s-vat" inputmode="decimal" step="1" min="0" max="100" value="' + U.esc(s.vatRate) + '"></div>'
      + '</div>'
      + '<div class="field"><label for="s-terms">Betalningsvillkor (dagar)</label>'
      + '<input type="number" id="s-terms" inputmode="numeric" step="1" min="0" value="' + U.esc(s.paymentTermsDays) + '"></div>'
      + '<div class="row">'
      + '<div class="field"><label for="s-prefix">Fakturanr-prefix</label>'
      + '<input type="text" id="s-prefix" value="' + U.esc(s.invoicePrefix) + '" placeholder="t.ex. 2026-"></div>'
      + '<div class="field"><label for="s-next">Nästa nummer</label>'
      + '<input type="number" id="s-next" inputmode="numeric" step="1" min="1" value="' + U.esc(s.nextInvoiceNumber) + '"></div>'
      + '</div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Nästa faktura blir <b>' + U.esc(S.peekInvoiceNumber()) + '</b>.</p>'
      + '<button class="btn btn-primary btn-block" data-save-settings>Spara standardvärden</button>'
      + '</div>';

    html += '<div class="card"><div class="card-title">Säkerhetskopiering</div>'
      + '<p class="small muted" style="margin:-4px 0 12px">Datan ligger bara i den här webbläsaren. '
      + 'Exportera regelbundet — särskilt innan du rensar webbläsardata eller byter telefon.</p>'
      + '<div class="totals" style="margin-bottom:12px">'
      + '<div class="totals-row"><span class="muted">Kunder</span><span>' + d.clients.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Projekt</span><span>' + d.projects.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Tidsposter</span><span>' + d.entries.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Fakturor</span><span>' + d.invoices.length + '</span></div>'
      + '</div>'
      + '<button class="btn btn-block" data-export>Exportera säkerhetskopia (JSON)</button>'
      + '<button class="btn btn-block" data-export-csv style="margin-top:10px">Exportera tidsposter (CSV)</button>'
      + '<label class="btn btn-block" style="margin-top:10px">Importera säkerhetskopia'
      + '<input type="file" id="s-import" accept="application/json,.json" hidden></label>'
      + '</div>';

    html += '<div class="card"><div class="card-title">Farlig zon</div>'
      + '<button class="btn btn-danger btn-block" data-reset>Radera all data</button></div>';

    html += '<p class="small muted" style="text-align:center;margin:20px 0">Fakturering · lokal data, ingen server</p>';

    el.innerHTML = html;
    wire(el);
  }

  function field(id, label, value, type) {
    return '<div class="field"><label for="' + id + '">' + U.esc(label) + '</label>'
      + '<input type="' + (type || 'text') + '" id="' + id + '" value="' + U.esc(value || '') + '"'
      + (type === 'email' ? ' autocapitalize="off"' : '') + '></div>';
  }

  function csv() {
    var rows = [['Datum', 'Kund', 'Projekt', 'Timmar', 'Timpris', 'Belopp', 'Kommentar', 'Faktura']];
    S.entries().slice().reverse().forEach(function (e) {
      var c = S.client(e.clientId);
      var p = e.projectId ? S.project(e.projectId) : null;
      var rate = S.rateFor(e.clientId, e.projectId);
      var inv = e.invoiceId ? S.invoice(e.invoiceId) : null;
      rows.push([
        e.date,
        c ? c.name : '',
        p ? p.name : '',
        String(e.hours).replace('.', ','),
        String(rate).replace('.', ','),
        String(U.round2(e.hours * rate)).replace('.', ','),
        e.comment || '',
        inv ? inv.number : ''
      ]);
    });
    return '﻿' + rows.map(function (r) {
      return r.map(function (cell) {
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(';');
    }).join('\r\n');
  }

  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-save-company]')) {
        S.saveCompany({
          name: val(el, '#co-name'), orgnr: val(el, '#co-orgnr'), vatnr: val(el, '#co-vatnr'),
          address: val(el, '#co-address'), zip: val(el, '#co-zip'), city: val(el, '#co-city'),
          email: val(el, '#co-email'), phone: val(el, '#co-phone'),
          bankgiro: val(el, '#co-bankgiro'), iban: val(el, '#co-iban'), bic: val(el, '#co-bic'),
          fskatt: el.querySelector('#co-fskatt').checked
        });
        U.toast('Företagsuppgifter sparade');
        return;
      }

      if (ev.target.closest('[data-save-settings]')) {
        S.saveSettings({
          defaultRate: Number(val(el, '#s-rate')) || 0,
          vatRate: Number(val(el, '#s-vat')) || 0,
          paymentTermsDays: Number(val(el, '#s-terms')) || 0,
          invoicePrefix: val(el, '#s-prefix'),
          nextInvoiceNumber: Math.max(1, Number(val(el, '#s-next')) || 1)
        });
        U.toast('Standardvärden sparade');
        render(el);
        return;
      }

      if (ev.target.closest('[data-export]')) {
        U.download('fakturering-backup-' + S.todayISO() + '.json', S.exportJSON());
        U.toast('Säkerhetskopia exporterad');
        return;
      }

      if (ev.target.closest('[data-export-csv]')) {
        U.download('tidsposter-' + S.todayISO() + '.csv', csv(), 'text/csv;charset=utf-8');
        U.toast('CSV exporterad');
        return;
      }

      if (ev.target.closest('[data-reset]')) {
        if (!confirm('Radera ALLA kunder, tidsposter och fakturor? Detta går inte att ångra.')) return;
        if (!confirm('Är du helt säker? Exportera en säkerhetskopia först om du är osäker.')) return;
        S.resetAll();
        U.toast('All data raderad');
        render(el);
      }
    });

    el.addEventListener('change', function (ev) {
      var input = ev.target.closest('#s-import');
      if (!input) return;
      var file = input.files && input.files[0];
      if (!file) return;
      if (!confirm('Importen ersätter all nuvarande data. Fortsätt?')) { input.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          S.importJSON(String(reader.result));
          U.toast('Säkerhetskopia importerad');
          render(el);
        } catch (err) {
          console.error(err);
          U.toast('Kunde inte läsa filen', true);
        }
      };
      reader.readAsText(file);
      input.value = '';
    });
  }

  function val(el, sel) {
    var n = el.querySelector(sel);
    return n ? n.value.trim() : '';
  }

  global.Views = global.Views || {};
  global.Views.settings = { title: 'Inställningar', actions: '', render: render };
})(window);

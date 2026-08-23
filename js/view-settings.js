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
      + field('co-swish', 'Swish-nummer', co.swish, 'tel')
      + field('co-iban', 'IBAN', co.iban)
      + field('co-bic', 'BIC/Swift', co.bic)
      + '<label class="check"><input type="checkbox" id="co-fskatt"' + (co.fskatt ? ' checked' : '') + '>'
      + '<span>Innehar F-skattsedel (visas på fakturan)</span></label>'
      + '<label class="check"><input type="checkbox" id="co-vatexempt"' + (co.vatExempt ? ' checked' : '') + '>'
      + '<span>Momsbefriad — omsättning under 120 000 kr/år</span></label>'
      + '<p class="small muted" style="margin:2px 0 0 34px">Ingen moms på fakturorna (en '
      + 'befrielserad skrivs ut i stället), inget momsunderlag, ingen deklarationspåminnelse. '
      + 'Passerar du 120 000 kr i omsättning måste du momsregistrera dig — bocka då ur.</p>'
      + '<button class="btn btn-primary btn-block" data-save-company style="margin-top:12px">Spara företagsuppgifter</button>'
      + '</div>';

    html += '<div class="card"><div class="card-title">Standardvärden</div>'
      + '<div class="row">'
      + '<div class="field"><label for="s-rate">Timpris (kr)</label>'
      + '<input type="number" id="s-rate" inputmode="decimal" step="1" min="0" value="' + U.esc(s.defaultRate) + '"></div>'
      + '<div class="field"><label for="s-vat">Moms (%)</label>'
      + '<input type="number" id="s-vat" inputmode="decimal" step="1" min="0" max="100" value="' + U.esc(s.vatRate) + '"></div>'
      + '</div>'
      + '<div class="row">'
      + '<div class="field"><label for="s-terms">Betalningsvillkor (dagar)</label>'
      + '<input type="number" id="s-terms" inputmode="numeric" step="1" min="0" value="' + U.esc(s.paymentTermsDays) + '"></div>'
      + '<div class="field"><label for="s-markup">Påslag material (%)</label>'
      + '<input type="number" id="s-markup" inputmode="decimal" step="1" min="0" value="' + U.esc(s.materialMarkup) + '"></div>'
      + '</div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Påslaget förifylls när du räknar fram '
      + 'á-priset från ett inköpspris.</p>'
      + '<div class="row">'
      + '<div class="field"><label for="s-mileage">Milersättning (kr/mil)</label>'
      + '<input type="number" id="s-mileage" inputmode="decimal" step="0.5" min="0" value="'
      + U.esc(s.mileageRate) + '"></div>'
      + '<div class="field"><label for="s-callout">Framkörning (kr)</label>'
      + '<input type="number" id="s-callout" inputmode="decimal" step="1" min="0" value="'
      + U.esc(s.calloutFee) + '"></div>'
      + '</div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Båda förifylls på nya körningar och går '
      + 'att ändra per resa. Kolla aktuell skattefri milersättning hos Skatteverket — beloppet '
      + 'ändras med jämna mellanrum.</p>'
      + '<div class="field"><label for="s-vat-period">Momsdeklaration</label>'
      + '<select id="s-vat-period">'
      + '<option value="manad"' + (s.vatPeriod === 'manad' ? ' selected' : '') + '>Varje månad</option>'
      + '<option value="kvartal"' + (s.vatPeriod !== 'manad' && s.vatPeriod !== 'helar' ? ' selected' : '') + '>Varje kvartal</option>'
      + '<option value="helar"' + (s.vatPeriod === 'helar' ? ' selected' : '') + '>En gång om året (helår)</option>'
      + '</select>'
      + '<p class="small muted" style="margin:6px 0 12px">Vilken period du har står i '
      + 'momsregistreringen från Skatteverket. Styr perioderna och deadline-påminnelsen '
      + 'i momsunderlaget under Fakturor.</p></div>'
      + '<div class="row">'
      + '<div class="field"><label for="s-rot-percent">ROT-avdrag (%)</label>'
      + '<input type="number" id="s-rot-percent" inputmode="decimal" step="1" min="0" max="100" value="'
      + U.esc(s.rotPercent) + '"></div>'
      + '<div class="field"><label for="s-rot-max">ROT-tak per år (kr)</label>'
      + '<input type="number" id="s-rot-max" inputmode="numeric" step="1000" min="0" value="'
      + U.esc(s.rotMaxPerYear) + '"></div>'
      + '</div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Gäller kunder du fakturerar med '
      + 'ROT-avdrag. Procentsatsen räknas på arbetskostnaden inklusive moms, och taket gäller '
      + 'per person och år. <b>Kolla aktuella siffror hos Skatteverket</b> — riksdagen har '
      + 'ändrat både procent och tak flera gånger de senaste åren.</p>'
      + '<div class="row">'
      + '<div class="field"><label for="s-prefix">Fakturanr-prefix</label>'
      + '<input type="text" id="s-prefix" value="' + U.esc(s.invoicePrefix) + '" placeholder="t.ex. 2026-"></div>'
      + '<div class="field"><label for="s-next">Nästa nummer</label>'
      + '<input type="number" id="s-next" inputmode="numeric" step="1" min="1" value="' + U.esc(s.nextInvoiceNumber) + '"></div>'
      + '</div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Nästa faktura blir <b>' + U.esc(S.peekInvoiceNumber()) + '</b>.</p>'
      + '<button class="btn btn-primary btn-block" data-save-settings>Spara standardvärden</button>'
      + '</div>';

    var b = S.backupStatus();

    html += '<div class="card"><div class="card-title">Säkerhetskopiering</div>'
      + '<p class="small muted" style="margin:-4px 0 12px">Datan ligger bara i den här webbläsaren. '
      + 'Dela en kopia till mejlen eller molnet med jämna mellanrum — det är enda skyddet om '
      + 'telefonen tappas, går sönder eller webbläsardatan rensas.</p>'
      + '<div class="totals" style="margin-bottom:12px">'
      + '<div class="totals-row"><span class="muted">Senaste säkerhetskopia</span>'
      + '<span id="s-lastbackup">' + U.esc(b.last || 'aldrig')
      + (b.days >= 30 ? ' ⚠' : '') + '</span></div>'
      + '<div class="totals-row"><span class="muted">Lagring</span><span id="s-persist">–</span></div>'
      + '<div class="totals-row"><span class="muted">Kunder</span><span>' + d.clients.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Projekt</span><span>' + d.projects.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Tidsposter</span><span>' + d.entries.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Materialposter</span><span>' + d.materials.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Körningar</span><span>' + d.trips.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Utgifter</span><span>' + d.expenses.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Fakturor</span><span>' + d.invoices.length + '</span></div>'
      + '</div>'
      + '<button class="btn btn-primary btn-block" data-backup-share>Dela säkerhetskopia (mejl/moln)</button>'
      + '<button class="btn btn-block" data-export style="margin-top:10px">Ladda ner säkerhetskopia (JSON, inkl. kvittofoton)</button>'
      + '<button class="btn btn-block" data-export-csv style="margin-top:10px">Exportera tid, material &amp; körjournal (CSV)</button>'
      + '<label class="btn btn-block" style="margin-top:10px">Importera säkerhetskopia'
      + '<input type="file" id="s-import" accept="application/json,.json" hidden></label>'
      + '</div>';

    html += '<div class="card"><div class="card-title">Farlig zon</div>'
      + '<button class="btn btn-danger btn-block" data-reset>Radera all data</button></div>';

    html += '<p class="small muted" style="text-align:center;margin:20px 0">Timstock · lokal data, ingen server</p>';

    el.innerHTML = html;
    wire(el);

    /* Bestandig lagring begars vid uppstart (app.js) - har visas bara svaret. */
    if (global.navigator.storage && global.navigator.storage.persisted) {
      global.navigator.storage.persisted().then(function (p) {
        var n = el.querySelector('#s-persist');
        if (n) n.textContent = p ? 'skyddad mot rensning' : 'kan rensas av webbläsaren';
      }).catch(function () {});
    }
  }

  function field(id, label, value, type) {
    return '<div class="field"><label for="' + id + '">' + U.esc(label) + '</label>'
      + '<input type="' + (type || 'text') + '" id="' + id + '" value="' + U.esc(value || '') + '"'
      + (type === 'email' ? ' autocapitalize="off"' : '') + '></div>';
  }

  function dec(v) {
    return v === '' || v === null || v === undefined ? '' : String(v).replace('.', ',');
  }

  /* Tid, material och körningar i samma fil, åtskilda av kolumnen Typ.
     Filtrera på Typ = Körning så har du en körjournal. En körning med
     framkörningsavgift ger en extra rad, så att Antal × Á-pris = Belopp
     stämmer på varje enskild rad. */
  function csv() {
    var rows = [['Datum', 'Typ', 'ÄTA', 'Kund', 'Projekt', 'Antal', 'Enhet', 'Á-pris',
      'Belopp', 'Beskrivning', 'Från', 'Till', 'Inköpspris', 'Ingående moms', 'Faktura']];

    function row(o, typ, qty, unit, rate, amount, text, from, to, cost, inVat) {
      var c = S.client(o.clientId);
      var p = o.projectId ? S.project(o.projectId) : null;
      var inv = o.invoiceId ? S.invoice(o.invoiceId) : null;
      rows.push([
        o.date, typ, S.isAta(o) ? 'Ja' : '', c ? c.name : '', p ? p.name : '',
        dec(qty), unit, dec(rate), dec(U.round2(amount)),
        text || '', from || '', to || '', dec(cost), dec(inVat), inv ? inv.number : ''
      ]);
    }

    var all = S.entries().map(function (e) { return { type: 'Tid', o: e }; })
      .concat(S.materials().map(function (m) { return { type: 'Material', o: m }; }))
      .concat(S.trips().map(function (t) { return { type: 'Körning', o: t }; }))
      .concat(S.expenses().map(function (x) { return { type: 'Utgift', o: x }; }))
      .sort(function (a, b) { return a.o.date < b.o.date ? -1 : (a.o.date > b.o.date ? 1 : 0); });

    all.forEach(function (it) {
      var o = it.o;

      if (it.type === 'Tid') {
        var rate = S.rateFor(o.clientId, o.projectId);
        row(o, 'Tid', o.hours, 'h', rate, Number(o.hours || 0) * rate, o.comment);
        return;
      }

      if (it.type === 'Material') {
        var pv = S.materialPurchaseVat(o);
        row(o, 'Material', o.qty, o.unit || 'st', o.unitPrice,
          S.materialAmount(o), o.description, '', '', o.cost, pv || '');
        return;
      }

      /* Utgifter: belopp inkl. moms i beloppskolumnen, momsen for sig.
         Kund, projekt och faktura ar alltid tomma - de hor inte till nagot
         uppdrag. */
      if (it.type === 'Utgift') {
        row(o, 'Utgift', 1, 'st', '', o.gross, o.description, '', '', '', o.vat);
        return;
      }

      if (Number(o.distance) > 0) {
        row(o, 'Körning', o.distance, 'mil', o.rate,
          S.tripDistanceAmount(o), o.purpose, o.from, o.to);
      }
      if (Number(o.fee) > 0) {
        row(o, 'Framkörning', 1, 'st', o.fee, Number(o.fee), o.purpose, o.from, o.to);
      }
    });

    return '﻿' + rows.map(function (r) {
      return r.map(function (cell) {
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(';');
    }).join('\r\n');
  }

  /* ---------- Sakerhetskopia ---------- */

  /* Hela datan som JSON. Gick kvittofotona inte att lasa ar en kopia utan
     dem battre an ingen alls - men det ska synas att de saknas. */
  function backupText() {
    return S.exportBackup().catch(function (err) {
      console.error(err);
      U.toast('Kvittofotona kunde inte läsas — kopian görs utan dem', true);
      return S.exportJSON();
    });
  }

  function backupFileName() {
    return 'timstock-backup-' + S.todayISO() + '.json';
  }

  /* Kopian raknas som gjord. Raden uppdateras pa plats i stallet for en
     omrendering, sa att osparade falt i formularen ovanfor inte nollstalls. */
  function backupDone(el) {
    S.markBackupDone();
    var n = el.querySelector('#s-lastbackup');
    if (n) n.textContent = S.todayISO();
  }

  /* Delar kopian som fil via delningsmenyn - mejla dig sjalv eller lagg den
     i molnet, sa finns den utanfor telefonen om nagot hander med den.
     Utan stod for fildelning laddas den ner som vanligt. */
  function shareBackup(el, text) {
    var name = backupFileName();
    var file = null;
    try {
      file = new File([text], name, { type: 'application/json' });
    } catch (e) { /* gammal webblasare utan File-konstruktor */ }

    var nav = global.navigator;
    if (file && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      nav.share({ files: [file], title: name }).then(function () {
        backupDone(el);
        U.toast('Säkerhetskopia delad');
      }).catch(function (err) {
        /* Stangd delningsmeny ar inget fel - allt annat far nedladdningen. */
        if (err && err.name === 'AbortError') return;
        console.error(err);
        downloadBackup(el, text);
      });
      return;
    }
    downloadBackup(el, text);
  }

  function downloadBackup(el, text) {
    U.download(backupFileName(), text);
    backupDone(el);
    U.toast('Säkerhetskopia sparad bland nedladdade filer');
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
          bankgiro: val(el, '#co-bankgiro'), swish: val(el, '#co-swish'),
          iban: val(el, '#co-iban'), bic: val(el, '#co-bic'),
          fskatt: el.querySelector('#co-fskatt').checked,
          vatExempt: el.querySelector('#co-vatexempt').checked
        });
        U.toast('Företagsuppgifter sparade');
        return;
      }

      if (ev.target.closest('[data-save-settings]')) {
        S.saveSettings({
          defaultRate: Number(val(el, '#s-rate')) || 0,
          vatRate: Number(val(el, '#s-vat')) || 0,
          paymentTermsDays: Number(val(el, '#s-terms')) || 0,
          materialMarkup: Number(val(el, '#s-markup')) || 0,
          mileageRate: Number(val(el, '#s-mileage')) || 0,
          calloutFee: Number(val(el, '#s-callout')) || 0,
          vatPeriod: val(el, '#s-vat-period') || 'kvartal',
          rotPercent: Number(val(el, '#s-rot-percent')) || 0,
          rotMaxPerYear: Number(val(el, '#s-rot-max')) || 0,
          invoicePrefix: val(el, '#s-prefix'),
          nextInvoiceNumber: Math.max(1, Number(val(el, '#s-next')) || 1)
        });
        U.toast('Standardvärden sparade');
        render(el);
        return;
      }

      if (ev.target.closest('[data-backup-share]')) {
        backupText().then(function (text) { shareBackup(el, text); });
        return;
      }

      if (ev.target.closest('[data-export]')) {
        backupText().then(function (text) {
          downloadBackup(el, text);
        });
        return;
      }

      if (ev.target.closest('[data-export-csv]')) {
        U.download('timstock-poster-' + S.todayISO() + '.csv', csv(), 'text/csv;charset=utf-8');
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

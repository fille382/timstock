/* view-settings.js - foretagsuppgifter, standardvarden och backup. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;
  var editClient = false; // visar klient-ID-faltet aven nar ett redan finns

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

    html += '<div class="card"><div class="card-title">Säkerhetskopiering</div>'
      + '<p class="small muted" style="margin:-4px 0 12px">Datan ligger bara i den här webbläsaren. '
      + 'Exportera regelbundet — särskilt innan du rensar webbläsardata eller byter telefon.</p>'
      + '<div class="totals" style="margin-bottom:12px">'
      + '<div class="totals-row"><span class="muted">Kunder</span><span>' + d.clients.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Projekt</span><span>' + d.projects.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Tidsposter</span><span>' + d.entries.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Materialposter</span><span>' + d.materials.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Körningar</span><span>' + d.trips.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Utgifter</span><span>' + d.expenses.length + '</span></div>'
      + '<div class="totals-row"><span class="muted">Fakturor</span><span>' + d.invoices.length + '</span></div>'
      + '</div>'
      + '<button class="btn btn-block" data-export>Exportera säkerhetskopia (JSON, inkl. kvittofoton)</button>'
      + '<button class="btn btn-block" data-export-csv style="margin-top:10px">Exportera tid, material &amp; körjournal (CSV)</button>'
      + '<label class="btn btn-block" style="margin-top:10px">Importera säkerhetskopia'
      + '<input type="file" id="s-import" accept="application/json,.json" hidden></label>'
      + '</div>';

    html += driveCard();

    html += '<div class="card"><div class="card-title">Farlig zon</div>'
      + '<button class="btn btn-danger btn-block" data-reset>Radera all data</button></div>';

    html += '<p class="small muted" style="text-align:center;margin:20px 0">Timstock · lokal data, ingen server</p>';

    el.innerHTML = html;
    wire(el);
  }

  function field(id, label, value, type) {
    return '<div class="field"><label for="' + id + '">' + U.esc(label) + '</label>'
      + '<input type="' + (type || 'text') + '" id="' + id + '" value="' + U.esc(value || '') + '"'
      + (type === 'email' ? ' autocapitalize="off"' : '') + '></div>';
  }

  /* ---------- Google Drive ---------- */

  /* "2026-08-23T14:32:05.000Z" -> "2026-08-23 15:32" (lokal tid) */
  function syncTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return U.toISO(d) + ' ' + String(d.getHours()).padStart(2, '0')
      + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function driveStatusRows(st) {
    var status;
    if (st.syncing) status = 'Synkar …';
    else if (st.connected) status = 'Ansluten' + (st.email ? ' som ' + st.email : '');
    else if (st.email) status = 'Utloggad (' + st.email + ')';
    else status = 'Inte ansluten';

    var html = '<div class="totals" style="margin-bottom:12px">'
      + '<div class="totals-row"><span class="muted">Status</span><span>' + U.esc(status) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Senast synkad</span><span>'
      + U.esc(st.lastSync ? syncTime(st.lastSync) : 'Aldrig') + '</span></div>';
    if (st.dirty && st.lastSync) {
      html += '<div class="totals-row"><span class="muted">Sedan dess</span>'
        + '<span>Osynkade ändringar</span></div>';
    }
    html += '</div>';
    if (st.lastError) {
      html += '<p class="small warn-text" style="margin:-4px 0 12px">' + U.esc(st.lastError) + '</p>';
    }
    return html;
  }

  function driveCard() {
    var D = global.Drive;
    if (!D) return '';
    var st = D.state();

    var html = '<div class="card" id="drive-card"><div class="card-title">Google Drive — synk mellan enheter</div>'
      + '<p class="small muted" style="margin:-4px 0 12px">Logga in med ditt Google-konto (Gmail) '
      + 'så sparas säkerhetskopian — inklusive kvittofoton — automatiskt i din Drive och följer '
      + 'med mellan mobil och dator. Appen ser bara sin egen fil, inget annat i din Drive.</p>';

    if (!st.configured || editClient) {
      html += '<div class="field"><label for="drv-client">Klient-ID (OAuth) från Google Cloud</label>'
        + '<input type="text" id="drv-client" autocapitalize="off" spellcheck="false" '
        + 'placeholder="….apps.googleusercontent.com" value="' + U.esc(st.clientId) + '"></div>'
        + '<p class="small muted" style="margin:-6px 0 12px">Skapas gratis i Google Cloud Console — '
        + 'steg för steg i README-filen, avsnittet <b>Google Drive</b>. Använd samma klient-ID på '
        + 'alla dina enheter.</p>'
        + '<button class="btn btn-primary btn-block" data-drive-save-client>Spara klient-ID</button>';
      if (st.configured) {
        html += '<button class="btn btn-block" data-drive-cancel-client style="margin-top:10px">Avbryt</button>';
      }
      return html + '</div>';
    }

    if (st.conflict) {
      html += '<div class="notice notice-warn"><b>Versionerna stämmer inte överens.</b> '
        + 'Säkerhetskopian i Drive (ändrad ' + U.esc(syncTime(st.conflictTime)) + ') och datan på '
        + 'den här enheten har ändrats var för sig. Välj vilken som ska gälla — den andra skrivs '
        + 'över.</div>'
        + '<button class="btn btn-block" data-drive-use-remote style="margin-top:12px">'
        + 'Använd Drive-versionen här</button>'
        + '<button class="btn btn-block" data-drive-use-local style="margin-top:10px">'
        + 'Skriv över Drive med den här enhetens data</button>'
        + '<p class="small muted" style="margin:10px 0 0">Drive sparar äldre versioner av filen i '
        + '30 dagar: högerklicka på <b>timstock-backup.json</b> i Drive och välj Hantera versioner.</p>';
      return html + '</div>';
    }

    html += driveStatusRows(st)
      + '<label class="check"><input type="checkbox" id="drv-autosync"'
      + (st.autoSync ? ' checked' : '') + '>'
      + '<span>Synka automatiskt när något ändras</span></label>';

    if (st.connected) {
      html += '<button class="btn btn-block" data-drive-push style="margin-top:12px">Spara till Drive nu</button>'
        + '<button class="btn btn-block" data-drive-pull style="margin-top:10px">Hämta från Drive</button>'
        + '<button class="btn btn-block" data-drive-disconnect style="margin-top:10px">Koppla bort kontot</button>';
    } else {
      html += '<button class="btn btn-primary btn-block" data-drive-connect style="margin-top:12px">'
        + (st.email ? 'Logga in igen' : 'Anslut Google-konto') + '</button>'
        + '<button class="btn btn-block" data-drive-edit-client style="margin-top:10px">Ändra klient-ID</button>';
      if (st.email) {
        html += '<button class="btn btn-block" data-drive-disconnect style="margin-top:10px">Koppla bort kontot</button>';
      }
    }
    return html + '</div>';
  }

  function driveErr(err) {
    /* En konflikt har redan sitt eget vagval i kortet - inget felmeddelande. */
    if (err && err.conflict) return;
    U.toast(err && err.message ? err.message : 'Något gick fel mot Google Drive', true);
  }

  /* Ritar bara om Drive-kortet - en hel omritning av vyn skulle kasta bort
     osparade faltandringar i de andra korten. */
  function refreshDriveCard(force) {
    if (!container || container.hidden || !document.contains(container)) return;
    var host = container.querySelector('#drive-card');
    if (!host) return;
    /* Skriv inte over faltet mitt i en inklistring av klient-ID:t. */
    if (!force && document.activeElement && document.activeElement.id === 'drv-client') return;
    host.outerHTML = driveCard();
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

      if (ev.target.closest('[data-export]')) {
        S.exportBackup().then(function (text) {
          U.download('timstock-backup-' + S.todayISO() + '.json', text);
          U.toast('Säkerhetskopia exporterad');
        }).catch(function (err) {
          /* Kvittofotona gick inte att lasa - exportera hellre datan utan
             dem an ingenting alls. */
          console.error(err);
          U.download('timstock-backup-' + S.todayISO() + '.json', S.exportJSON());
          U.toast('Exporterad utan kvittofoton');
        });
        return;
      }

      if (ev.target.closest('[data-export-csv]')) {
        U.download('timstock-poster-' + S.todayISO() + '.csv', csv(), 'text/csv;charset=utf-8');
        U.toast('CSV exporterad');
        return;
      }

      if (ev.target.closest('[data-drive-save-client]')) {
        var cid = val(el, '#drv-client');
        if (!cid) { U.toast('Klistra in klient-ID:t först', true); return; }
        editClient = false;
        global.Drive.setClientId(cid);
        U.toast('Klient-ID sparat');
        refreshDriveCard(true);
        return;
      }

      if (ev.target.closest('[data-drive-cancel-client]')) {
        editClient = false;
        refreshDriveCard();
        return;
      }

      if (ev.target.closest('[data-drive-edit-client]')) {
        editClient = true;
        refreshDriveCard();
        return;
      }

      if (ev.target.closest('[data-drive-connect]')) {
        global.Drive.connect().then(function () {
          U.toast('Ansluten till Google Drive');
        }).catch(driveErr);
        return;
      }

      if (ev.target.closest('[data-drive-push]')) {
        global.Drive.push().then(function () {
          U.toast('Sparad i Google Drive');
        }).catch(driveErr);
        return;
      }

      if (ev.target.closest('[data-drive-pull]') || ev.target.closest('[data-drive-use-remote]')) {
        if (!confirm('Ersätter all data på den här enheten med säkerhetskopian i Google Drive. Fortsätt?')) return;
        global.Drive.pull().then(function () {
          U.toast('Säkerhetskopia hämtad från Drive');
          global.App.refresh();
        }).catch(driveErr);
        return;
      }

      if (ev.target.closest('[data-drive-use-local]')) {
        if (!confirm('Skriver över säkerhetskopian i Google Drive med datan på den här enheten. Fortsätt?')) return;
        global.Drive.forcePush().then(function () {
          U.toast('Drive uppdaterad');
        }).catch(driveErr);
        return;
      }

      if (ev.target.closest('[data-drive-disconnect]')) {
        global.Drive.disconnect();
        U.toast('Google-kontot bortkopplat');
        return;
      }

      if (ev.target.closest('[data-reset]')) {
        if (!confirm('Radera ALLA kunder, tidsposter och fakturor? Detta går inte att ångra.')) return;
        if (!confirm('Är du helt säker? Exportera en säkerhetskopia först om du är osäker.')) return;
        S.resetAll();
        /* Autosynken stangs av sa att den tomma appen inte skriver over
           kopian i Drive - den ligger kvar som livlina. */
        if (global.Drive) global.Drive.afterReset();
        U.toast('All data raderad');
        render(el);
      }
    });

    /* Rita om kortet nar synken byter tillstand i bakgrunden (uppladdning
       klar, inloggning gick ut, konflikt upptacktes ...). */
    if (global.Drive) global.Drive.onChange(refreshDriveCard);

    el.addEventListener('change', function (ev) {
      var auto = ev.target.closest('#drv-autosync');
      if (auto) {
        global.Drive.setAutoSync(auto.checked);
        return;
      }

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

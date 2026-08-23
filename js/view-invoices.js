/* view-invoices.js - skapa, visa, skriva ut och skicka fakturor. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;

  var STATUS = {
    utkast: { label: 'Utkast', cls: 'badge-muted' },
    skickad: { label: 'Skickad', cls: 'badge-warn' },
    betald: { label: 'Betald', cls: 'badge-ok' }
  };

  /* Momsunderlagets urval. Kvartal ar den vanligaste redovisningsperioden;
     basis avgor om en faktura hor till fakturadatumet eller betaldatumet -
     det ska folja metoden i foretagets momsregistrering. */
  var vatQuarter = 0;        // 0 = innevarande kvartal, -1 = forra
  var vatBasis = 'faktura';  // 'faktura' | 'betald'

  /* ---------- Lista ---------- */

  function render(el) {
    container = el;
    var list = S.invoices();
    var unbilledEntries = S.entries({ status: 'unbilled' });
    var unbilledMaterials = S.materials({ status: 'unbilled' });
    var unbilledTrips = S.trips({ status: 'unbilled' });

    var openFixed = S.openFixedProjects(null);

    var unbilledAmount = unbilledEntries.reduce(function (s, e) { return s + S.billableEntry(e); }, 0)
      + unbilledMaterials.reduce(function (s, m) { return s + S.billableMaterial(m); }, 0)
      + unbilledTrips.reduce(function (s, t) { return s + S.billableTrip(t); }, 0)
      + openFixed.reduce(function (s, p) { return s + S.fixedPriceOf(p); }, 0);

    var outstanding = list
      .filter(function (i) { return i.status !== 'betald'; })
      .reduce(function (s, i) { return s + Number(i.total || 0); }, 0);

    var html = '<button class="btn btn-primary btn-block" data-new-invoice style="margin-bottom:16px">'
      + '+ Ny faktura</button>';

    /* ROT som dragits pa fakturor men annu inte begarts fran Skatteverket -
       pengar du har tjanat men inte bett om. */
    var rotPending = list.reduce(function (s, i) {
      return s + (i.rotClaimedDate ? 0 : Number(i.rotDeduction || 0));
    }, 0);

    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-value">' + U.money0(unbilledAmount) + '</div>'
      + '<div class="stat-label">Ofakturerat</div></div>'
      + '<div class="stat"><div class="stat-value">' + U.money0(outstanding) + '</div>'
      + '<div class="stat-label">Obetalt</div></div>'
      + (rotPending
        ? '<div class="stat"><div class="stat-value">' + U.money0(rotPending) + '</div>'
          + '<div class="stat-label">ROT att söka</div></div>'
        : '')
      + '</div>';

    html += vatExemptWarning();

    if (!list.length) {
      var pending = unbilledEntries.length + unbilledMaterials.length
        + unbilledTrips.length + openFixed.length;
      html += '<div class="empty">Inga fakturor ännu.<br>'
        + (pending
          ? 'Du har ' + pending + ' ofakturerade poster att fakturera.'
          : 'Registrera tid, material eller körning först, så kan du skapa en faktura.') + '</div>';
    } else {
      html += '<div class="list">' + list.map(invoiceItem).join('') + '</div>';
    }

    html += vatCardHTML();
    html += yearCardHTML();

    el.innerHTML = html;
    wire(el);
  }

  /* ---------- Arssammanstallning ----------

     Siffrorna NE-bilagan fragar efter: arets intakter, kostnader och
     resultat. "Las av, skriv in, klart" - och en utskrift att lagga i
     deklarationsmappen. */

  var yearOffset = 0; // 0 = i ar, -1 = forra aret

  function summaryYear(offset) {
    return new Date().getFullYear() + offset;
  }

  function yearCardHTML() {
    var ys = S.yearSummary(summaryYear(yearOffset));

    var html = '<div class="section-title">Årssammanställning</div>';

    html += '<div class="seg" style="margin-bottom:14px">'
      + '<button type="button" data-ys-year="0" aria-pressed="' + (yearOffset === 0) + '">'
      + summaryYear(0) + '</button>'
      + '<button type="button" data-ys-year="-1" aria-pressed="' + (yearOffset === -1) + '">'
      + summaryYear(-1) + '</button>'
      + '</div>';

    html += '<div class="totals">'
      + '<div class="totals-row"><span class="muted">Intäkter · fakturerat ('
      + ys.invoiceCount + ' fakturor)</span><span>' + U.money(ys.income) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Materialinköp (' + ys.materialCount
      + ')</span><span>−' + U.money(ys.materialCost) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Utgifter (' + ys.expenseCount
      + ')</span><span>−' + U.money(ys.expenseCost) + '</span></div>'
      + (ys.distance
        ? '<div class="totals-row"><span class="muted">Milersättning egen bil ('
          + U.distance(ys.distance) + ' × ' + U.money0(ys.mileageRate) + ')</span><span>−'
          + U.money(ys.mileageCost) + '</span></div>'
        : '')
      + '<div class="totals-row grand"><span>Resultat (överskott)</span><span>'
      + U.money(ys.result) + '</span></div>'
      + (ys.result > 0
        ? '<div class="totals-row"><span class="small muted">Grovt riktmärke att lägga undan '
          + 'till skatt och egenavgifter (~45 %)</span><span class="small muted">'
          + U.money0(ys.result * 0.45) + '</span></div>'
        : '')
      + '</div>';

    html += '<p class="small muted" style="margin:8px 0 12px">Underlag för NE-bilagan i '
      + 'inkomstdeklarationen. Överskottet förs in där — schablonavdraget för egenavgifter '
      + '(25 %) och skatten räknar Skatteverkets e-tjänst ut. Milersättningen räknas med '
      + 'ditt värde från Inställningar; kolla att det följer Skatteverkets skattefria '
      + 'schablon. Skatteriktmärket är en grov schablon och beror på lön och kommun.</p>';

    html += '<button class="btn btn-block" data-print-year>Skriv ut / PDF</button>';

    return html;
  }

  function yearPrintHTML(ys) {
    var co = S.company();

    var html = '<div class="invoice">';

    html += '<div class="inv-head">'
      + '<div><h2>Årssammanställning ' + U.esc(ys.year) + '</h2>'
      + '<div class="inv-from"><b>' + U.esc(co.name || '') + '</b><br>'
      + (co.orgnr ? 'Org.nr ' + U.esc(co.orgnr) : '') + '</div></div>'
      + '<div class="inv-meta">'
      + '<div><b>Period</b> ' + U.esc(ys.year) + '-01-01 – ' + U.esc(ys.year) + '-12-31</div>'
      + '<div><b>Utskriven</b> ' + U.esc(S.todayISO()) + '</div>'
      + '</div></div>';

    html += '<div class="inv-sum" style="margin-left:0;width:100%;max-width:420px">'
      + '<div class="inv-sum-row"><span>Intäkter (' + ys.invoiceCount + ' fakturor)</span><span>'
      + U.money(ys.income) + '</span></div>'
      + '<div class="inv-sum-row"><span>Materialinköp (' + ys.materialCount + ')</span><span>−'
      + U.money(ys.materialCost) + '</span></div>'
      + '<div class="inv-sum-row"><span>Utgifter (' + ys.expenseCount + ')</span><span>−'
      + U.money(ys.expenseCost) + '</span></div>'
      + (ys.distance
        ? '<div class="inv-sum-row"><span>Milersättning egen bil (' + U.distance(ys.distance)
          + ' × ' + U.money0(ys.mileageRate) + ')</span><span>−'
          + U.money(ys.mileageCost) + '</span></div>'
        : '')
      + '<div class="inv-sum-row total"><span>Resultat (överskott)</span><span>'
      + U.money(ys.result) + '</span></div>'
      + '</div>';

    html += '<div class="inv-note" style="margin-top:18px">Underlag ur Timstock för NE-bilagan. '
      + 'Intäkter räknas på fakturadatum, kostnader på inköpsdatum. Omfattar det som '
      + 'registrerats i appen — verifikationerna (fakturor och kvitton) sparas i 7 år.</div>';

    return html + '</div>';
  }

  function printYearSummary() {
    var area = document.getElementById('print-area');
    area.innerHTML = yearPrintHTML(S.yearSummary(summaryYear(yearOffset)));
    setTimeout(function () { global.print(); }, 60);
  }

  /* ---------- Momsunderlag ----------

     Siffrorna momsdeklarationen fragar efter, sa langt appen ser dem:
     utgaende moms fran fakturorna, ingaende fran materialinkop (momsen foljer
     med inkopspriset) och fran utgifter (verktyg, drivmedel - sant som inte
     hor till nagot uppdrag). Ersatter inte bokforingen - men bespar
     hopraknandet. */

  /* Redovisningsperioden - manad, kvartal eller helar - kommer fran
     installningarna och ska spegla foretagets momsregistrering. */
  function vatPeriod() {
    var p = S.settings().vatPeriod;
    return (p === 'manad' || p === 'helar') ? p : 'kvartal';
  }

  function periodRange(offset) {
    var per = vatPeriod();
    var now = new Date();

    if (per === 'manad') {
      var f = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
      var l = new Date(f.getFullYear(), f.getMonth() + 1, 0);
      return { from: U.toISO(f), to: U.toISO(l), label: U.monthLabel(U.toISO(f)) };
    }

    if (per === 'helar') {
      var y = now.getFullYear() + (offset || 0);
      return { from: y + '-01-01', to: y + '-12-31', label: String(y) };
    }

    var first = new Date(now.getFullYear(), (Math.floor(now.getMonth() / 3) + (offset || 0)) * 3, 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 3, 0);
    return {
      from: U.toISO(first), to: U.toISO(last),
      label: 'Q' + (Math.floor(first.getMonth() / 3) + 1) + ' ' + first.getFullYear()
    };
  }

  /* Deadline for manads- och kvartalsmoms: den 12:e i andra manaden efter
     periodens slut, utom i augusti och januari da den 17:e. For helar (utan
     EU-handel varierar datumen) antas kalenderar och 26 februari - med en
     brasklapp i texten. */
  function vatDeadline(offset) {
    var end = U.parseISO(periodRange(offset).to);
    if (vatPeriod() === 'helar') {
      return U.toISO(new Date(end.getFullYear() + 1, 1, 26));
    }
    var d = new Date(end.getFullYear(), end.getMonth() + 2, 1);
    var day = (d.getMonth() === 7 || d.getMonth() === 0) ? 17 : 12;
    return U.toISO(new Date(d.getFullYear(), d.getMonth(), day));
  }

  var PERIOD_NAMES = { manad: 'månadsmoms', kvartal: 'kvartalsmoms', helar: 'helårsmoms' };

  /* Paminnelsen overst i momsunderlaget. Fram till forra periodens deadline
     ar det den som galler - darefter visas nasta i lugnare ton. */
  function vatDeadlineNotice() {
    var today = S.todayISO();
    var prev = vatDeadline(-1);
    var perName = PERIOD_NAMES[vatPeriod()];
    var caveat = 'Hamnar datumet på en helg gäller nästa vardag. Perioden ('
      + perName + ') ställs in under Inställningar'
      + (vatPeriod() === 'helar'
        ? ' — och helårsmomsens datum varierar med EU-handel och bolagsform, kolla ditt registerutdrag'
        : '') + '.';

    if (today <= prev) {
      var days = daysBetween(today, prev);
      return note(days <= 14 ? 'warn' : 'ok',
        'Momsdeklaration ' + periodRange(-1).label,
        'Ska vara inlämnad — och momsen betald — senast <b>' + U.esc(prev) + '</b>'
        + (days === 0 ? ' (i dag!)' : ' (' + days + ' dagar kvar)') + '. ' + caveat);
    }

    return '<p class="small muted" style="margin:0 0 10px">Nästa momsdeklaration: '
      + U.esc(periodRange(0).label) + ' lämnas senast <b>' + U.esc(vatDeadline(0))
      + '</b> (' + perName + ').</p>';
  }

  function vatCardHTML() {
    /* Momsbefriad: ingen deklaration, inget underlag, inga deadlines. Kvar
       blir utgifterna - de behovs for bokforingen och uppfoljningen anda. */
    if (S.vatExempt()) {
      var all = S.expenses();
      var st = S.vatExemptStatus();
      return '<div class="section-title">Utgifter</div>'
        + '<p class="small muted" style="margin:0 0 10px">Momsbefriad — ingen momsdeklaration '
        + 'behövs. Årets fakturering: <b>' + U.money0(st.used) + '</b> av ' + U.money0(st.limit)
        + ' (momsbefrielsens tak). Utgifterna sparas för bokföringen och kvittona. '
        + 'Momsregistrerar du dig ändras det under Inställningar.</p>'
        + '<button class="btn btn-block" data-new-expense>+ Ny utgift</button>'
        + (all.length
          ? '<div class="list" style="margin-top:10px">' + all.map(expenseItem).join('') + '</div>'
          : '');
    }

    var range = periodRange(vatQuarter);
    var r = S.vatReport(range.from, range.to, vatBasis);
    var xs = S.expenses({ from: range.from, to: range.to });

    var html = '<div class="section-title">Momsunderlag</div>';

    html += vatDeadlineNotice();

    html += '<div class="seg" style="margin-bottom:8px">'
      + '<button type="button" data-vat-quarter="0" aria-pressed="' + (vatQuarter === 0) + '">'
      + periodRange(0).label + '</button>'
      + '<button type="button" data-vat-quarter="-1" aria-pressed="' + (vatQuarter === -1) + '">'
      + periodRange(-1).label + '</button>'
      + '</div>';

    html += '<div class="seg" style="margin-bottom:14px">'
      + '<button type="button" data-vat-basis="faktura" aria-pressed="' + (vatBasis === 'faktura') + '">'
      + 'Fakturadatum</button>'
      + '<button type="button" data-vat-basis="betald" aria-pressed="' + (vatBasis === 'betald') + '">'
      + 'Betaldatum</button>'
      + '</div>';

    html += '<div class="totals">'
      + '<div class="totals-row"><span class="muted">Försäljning exkl. moms</span><span>'
      + U.money(r.salesNormal) + '</span></div>'
      + (r.salesReverse
        ? '<div class="totals-row"><span class="muted">Försäljning omvänd byggmoms</span><span>'
          + U.money(r.salesReverse) + '</span></div>'
        : '')
      + '<div class="totals-row"><span class="muted">Utgående moms</span><span>'
      + U.money(r.vatOut) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Ingående moms · material ('
      + r.materialCount + ' köp)</span><span>−' + U.money(r.vatInMaterials) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Ingående moms · utgifter ('
      + r.expenseCount + ' st)</span><span>−' + U.money(r.vatInExpenses) + '</span></div>'
      + '<div class="totals-row grand"><span>' + (r.net >= 0 ? 'Moms att betala' : 'Moms att få tillbaka')
      + '</span><span>' + U.money(Math.abs(r.net)) + '</span></div>'
      + '</div>';

    html += '<p class="small muted" style="margin:8px 0 12px">'
      + (vatBasis === 'betald'
        ? 'Räknat på betaldatum (bokslutsmetoden/kontantmetoden).'
        : 'Räknat på fakturadatum (faktureringsmetoden).')
      + ' Vilken metod som gäller dig står i momsregistreringen hos Skatteverket. Underlaget '
      + 'ersätter inte bokföringen — det räknar bara det du lagt in i appen, och kvittona '
      + 'ska sparas i 7 år. Omvänd byggmoms-försäljning redovisas i sin egen ruta, utan moms.</p>';

    html += '<div class="btn-row" style="margin-bottom:10px">'
      + '<button class="btn btn-primary" data-print-vat>Skriv ut / PDF</button>'
      + '<button class="btn" data-new-expense>+ Ny utgift</button>'
      + '</div>';

    if (xs.length) {
      html += '<div class="list" style="margin-top:10px">' + xs.map(expenseItem).join('') + '</div>';
    }

    return html;
  }

  function expenseItem(x) {
    return '<button class="item" type="button" data-expense="' + U.esc(x.id) + '">'
      + '<div class="item-top"><span class="item-title">' + U.esc(x.description) + '</span>'
      + '<span class="item-amount">' + U.money0(x.gross) + '</span></div>'
      + '<div class="item-sub"><span>' + U.esc(U.dateShort(x.date)) + '</span>'
      + (S.vatExempt() ? '' : '<span class="dot">•</span><span>moms ' + U.money(x.vat) + '</span>')
      + (x.photoId ? '<span class="dot">•</span><span>📷 kvitto</span>' : '')
      + '</div></button>';
  }

  /* ---------- Utskrift av momsunderlaget ----------

     En sida att ha framfor sig nar deklarationen fylls i (eller ge till
     redovisningskonsulten): summorna overst, darefter specifikationen av
     varje faktura, materialinkop och utgift som ligger bakom dem. Ateranvander
     fakturans utskriftsstil sa att print-CSS:en galler rakt av. */

  function vatPrintHTML(range, basis) {
    var co = S.company();
    var r = S.vatReport(range.from, range.to, basis);

    var invs = S.invoices().filter(function (inv) {
      var d = basis === 'betald' ? inv.paidDate : inv.issueDate;
      return d && d >= range.from && d <= range.to;
    });
    var mats = S.materials({ from: range.from, to: range.to })
      .filter(function (m) { return S.materialPurchaseVat(m) > 0; });
    var xs = S.expenses({ from: range.from, to: range.to });

    var html = '<div class="invoice">';

    html += '<div class="inv-head">'
      + '<div><h2>Momsunderlag ' + U.esc(range.label) + '</h2>'
      + '<div class="inv-from"><b>' + U.esc(co.name || '') + '</b><br>'
      + (co.orgnr ? 'Org.nr ' + U.esc(co.orgnr) + '<br>' : '')
      + (co.vatnr ? 'Momsreg.nr ' + U.esc(co.vatnr) : '')
      + '</div></div>'
      + '<div class="inv-meta">'
      + '<div><b>Period</b> ' + U.esc(range.from) + ' – ' + U.esc(range.to) + '</div>'
      + '<div><b>Metod</b> ' + (basis === 'betald' ? 'Betaldatum (bokslutsmetoden)'
        : 'Fakturadatum (faktureringsmetoden)') + '</div>'
      + '<div><b>Utskriven</b> ' + U.esc(S.todayISO()) + '</div>'
      + '</div></div>';

    html += '<div class="inv-sum" style="margin-left:0;width:100%;max-width:420px">'
      + '<div class="inv-sum-row"><span>Försäljning exkl. moms</span><span>'
      + U.money(r.salesNormal) + '</span></div>'
      + (r.salesReverse
        ? '<div class="inv-sum-row"><span>Försäljning omvänd byggmoms</span><span>'
          + U.money(r.salesReverse) + '</span></div>'
        : '')
      + '<div class="inv-sum-row"><span>Utgående moms</span><span>' + U.money(r.vatOut) + '</span></div>'
      + '<div class="inv-sum-row"><span>Ingående moms, material</span><span>−'
      + U.money(r.vatInMaterials) + '</span></div>'
      + '<div class="inv-sum-row"><span>Ingående moms, utgifter</span><span>−'
      + U.money(r.vatInExpenses) + '</span></div>'
      + '<div class="inv-sum-row total"><span>' + (r.net >= 0 ? 'Moms att betala' : 'Moms att få tillbaka')
      + '</span><span>' + U.money(Math.abs(r.net)) + '</span></div>'
      + '</div>';

    function table(title, head, rows) {
      if (!rows.length) return '';
      return '<h3 style="margin:18px 0 6px;font-size:.95rem">' + title + '</h3>'
        + '<div class="inv-table-wrap"><table class="inv-table"><thead><tr>' + head
        + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }

    html += table('Fakturor i perioden (utgående moms)',
      '<th>Nr</th><th>Datum</th><th>Kund</th><th class="num">Exkl. moms</th><th class="num">Moms</th>',
      invs.map(function (inv) {
        var d = basis === 'betald' ? inv.paidDate : inv.issueDate;
        return '<tr><td>' + U.esc(inv.number) + '</td>'
          + '<td class="nowrap">' + U.esc(d) + '</td>'
          + '<td class="desc">' + U.esc(inv.clientSnapshot ? inv.clientSnapshot.name : '')
          + (inv.billingMode === 'reverse' ? ' (omvänd byggmoms)' : '') + '</td>'
          + '<td class="num">' + U.money(inv.subtotal) + '</td>'
          + '<td class="num">' + U.money(inv.billingMode === 'reverse' ? 0 : inv.vat) + '</td></tr>';
      }));

    html += table('Materialinköp (ingående moms)',
      '<th>Datum</th><th>Inköp</th><th class="num">Moms</th>',
      mats.map(function (m) {
        return '<tr><td class="nowrap">' + U.esc(m.date) + '</td>'
          + '<td class="desc">' + U.esc(m.description) + '</td>'
          + '<td class="num">' + U.money(S.materialPurchaseVat(m)) + '</td></tr>';
      }));

    html += table('Utgifter (ingående moms)',
      '<th>Datum</th><th>Inköp</th><th class="num">Belopp inkl. moms</th><th class="num">Moms</th>',
      xs.map(function (x) {
        return '<tr><td class="nowrap">' + U.esc(x.date) + '</td>'
          + '<td class="desc">' + U.esc(x.description) + '</td>'
          + '<td class="num">' + U.money(x.gross) + '</td>'
          + '<td class="num">' + U.money(x.vat) + '</td></tr>';
      }));

    html += '<div class="inv-note" style="margin-top:18px">Underlag ur Timstock — omfattar det '
      + 'som registrerats i appen och ersätter inte bokföringen. Varje rad ska ha kvitto '
      + 'eller faktura som verifikation, sparad i 7 år.</div>';

    return html + '</div>';
  }

  function printVatReport() {
    var area = document.getElementById('print-area');
    area.innerHTML = vatPrintHTML(periodRange(vatQuarter), vatBasis);
    setTimeout(function () { global.print(); }, 60);
  }

  /* Utgiftsformularet: tre falt rakt av kvittot. Momsen skrivs av i kronor i
     stallet for att raknas fram - da spelar det ingen roll om kvittot blandar
     momssatser. */
  function openExpense(id) {
    var x = id ? S.expense(id) : null;

    var html = '<div class="field"><label for="x-date">Datum</label>'
      + '<input type="date" id="x-date" value="' + U.esc(x ? x.date : S.todayISO()) + '"></div>';

    html += '<div class="field"><label for="x-desc">Vad köpte du? *</label>'
      + '<input type="text" id="x-desc" placeholder="t.ex. Såg, olja, klinga (Bauhaus)"'
      + ' value="' + U.esc(x ? x.description : '') + '"></div>';

    /* Momsbefriad: ingen ingaende moms att redovisa, sa momsfaltet doljs -
       kvar ar bara vad kopet kostade. */
    var exempt = S.vatExempt();

    html += '<div class="row">'
      + '<div class="field"><label for="x-gross">' + (exempt ? 'Belopp (kr)' : 'Belopp inkl. moms (kr)')
      + '</label>'
      + '<input type="text" id="x-gross" inputmode="decimal" autocomplete="off" placeholder="0"'
      + ' value="' + U.esc(x ? String(x.gross).replace('.', ',') : '') + '"></div>'
      + (exempt ? ''
        : '<div class="field"><label for="x-vat">Varav moms (kr)</label>'
          + '<input type="text" id="x-vat" inputmode="decimal" autocomplete="off" placeholder="0"'
          + ' value="' + U.esc(x ? String(x.vat).replace('.', ',') : '') + '"></div>')
      + '</div>';

    /* Star momsen inte utlast pa kvittot raknar knapparna fram den ur
       totalbeloppet - moms 25 % ar 20 % AV totalen (25/125), inte 25 %.
       Den frallan slipper man har. */
    if (!exempt) {
      html += '<div class="quick" style="margin:-6px 0 12px">'
        + '<button type="button" data-vat-rate="25">moms 25 %</button>'
        + '<button type="button" data-vat-rate="12">moms 12 %</button>'
        + '<button type="button" data-vat-rate="6">moms 6 %</button>'
        + '</div>';
    }

    html += '<p class="small muted" style="margin:-4px 0 12px">Ett kvitto = en utgift. '
      + 'Köpte du flera saker: lista dem i beskrivningen och skriv kvittots totalsumma '
      + 'och totalmoms — fotot visar ändå detaljerna. Utgiften hamnar aldrig på någon '
      + 'faktura, den finns bara för momsunderlaget och din uppföljning.</p>';

    html += U.photoFieldHTML('Kvitto');

    html += '<button class="btn btn-primary btn-block" data-save-expense>'
      + (x ? 'Spara utgift' : 'Lägg till utgift') + '</button>';

    if (x) {
      html += '<button class="btn btn-danger btn-block" data-delete-expense style="margin-top:10px">'
        + 'Ta bort</button>';
    }

    U.openSheet(x ? 'Redigera utgift' : 'Ny utgift', html, function (body) {
      var photo = U.initPhotoField(body, x ? x.photoId : '');

      body.addEventListener('click', function (ev) {
        var vr = ev.target.closest('[data-vat-rate]');
        if (vr) {
          var g = U.parseHours(body.querySelector('#x-gross').value);
          if (!isFinite(g) || g <= 0) {
            U.toast('Fyll i beloppet först', true);
            return;
          }
          var rate = Number(vr.getAttribute('data-vat-rate'));
          body.querySelector('#x-vat').value =
            String(S.round2(g * rate / (100 + rate))).replace('.', ',');
          return;
        }
        if (ev.target.closest('[data-save-expense]')) {
          var date = body.querySelector('#x-date').value;
          var desc = body.querySelector('#x-desc').value.trim();
          var gross = U.parseHours(body.querySelector('#x-gross').value);
          var vatEl = body.querySelector('#x-vat');
          var vat = vatEl ? U.parseHours(vatEl.value) : 0;

          if (!date) { U.toast('Välj datum', true); return; }
          if (!desc) { U.toast('Skriv vad du köpte', true); return; }
          if (!isFinite(gross) || gross <= 0) { U.toast('Ange beloppet', true); return; }
          if (!isFinite(vat) || vat < 0) vat = 0;
          if (vat > gross) { U.toast('Momsen kan inte vara större än beloppet', true); return; }

          S.saveExpense({
            id: x ? x.id : null,
            date: date,
            description: desc,
            gross: S.round2(gross),
            vat: S.round2(vat),
            photoId: photo.commit(x ? x.photoId : '')
          });
          U.closeSheet();
          U.toast(x ? 'Utgift sparad' : 'Utgift tillagd');
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-expense]')) {
          if (!confirm('Ta bort utgiften?')) return;
          S.deleteExpense(x.id);
          U.closeSheet();
          U.toast('Utgift borttagen');
          render(container);
        }
      });
    });
  }

  function invoiceItem(inv) {
    var st = STATUS[inv.status] || STATUS.utkast;
    var overdue = inv.status !== 'betald' && inv.dueDate && inv.dueDate < S.todayISO();
    return '<button class="item" type="button" data-invoice="' + U.esc(inv.id) + '">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(inv.number) + ' · '
      + U.esc(inv.clientSnapshot ? inv.clientSnapshot.name : '') + '</span>'
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

  /* Varnar en momsbefriad firma nar arets fakturering narmar sig taket.
     Tyst under 75 % - da finns inget att saga - och skarpt over 100 %. */
  function vatExemptWarning() {
    if (!S.vatExempt()) return '';
    var st = S.vatExemptStatus();

    if (st.used >= st.limit) {
      return note('warn', 'Momsgränsen passerad',
        'Årets fakturering är <b>' + U.money0(st.used) + '</b> — över momsbefrielsens tak på '
        + U.money0(st.limit) + '. Du måste momsregistrera dig hos Skatteverket (verksamt.se) '
        + 'och lägga moms på försäljningen över taket. Bocka ur <i>Momsbefriad</i> under '
        + 'Inställningar när registreringen är klar.');
    }

    if (st.share >= 0.75) {
      return note('warn', 'Närmar dig momsgränsen',
        'Årets fakturering: <b>' + U.money0(st.used) + '</b> av ' + U.money0(st.limit)
        + ' — ' + U.money0(st.left) + ' kvar innan momsbefrielsen tar slut. Ser du att taket '
        + 'kommer att passeras: momsregistrera dig i förväg, det går inte att lägga moms '
        + 'retroaktivt på redan skickade fakturor utan att kontakta kunden.');
    }

    return '';
  }

  /* ---------- Ny faktura ---------- */

  function hasUnbilled(clientId) {
    return S.entries({ clientId: clientId, status: 'unbilled' }).length > 0
      || S.materials({ clientId: clientId, status: 'unbilled' }).length > 0
      || S.trips({ clientId: clientId, status: 'unbilled' }).length > 0
      || S.openFixedProjects(clientId).length > 0;
  }

  var NO_PROJECT = '__utan__'; // valet "Utan projekt" i projekturvalet

  /* Projekt hos kunden som faktiskt har nagot ofakturerat kvar. */
  function projectOptions(clientId, selectedId) {
    var q = { clientId: clientId, status: 'unbilled' };
    var used = {};
    var loose = false;

    S.entries(q).concat(S.materials(q)).concat(S.trips(q)).forEach(function (o) {
      if (o.projectId) used[o.projectId] = true;
      else loose = true;
    });

    /* Ett ofakturerat fastprisjobb ska ga att valja aven om ingen tid loggats. */
    S.openFixedProjects(clientId).forEach(function (p) { used[p.id] = true; });

    var projs = S.projects(clientId, true).filter(function (p) { return used[p.id]; });

    return '<option value="">Allt ofakturerat</option>'
      + U.options(projs, selectedId)
      + (loose
        ? '<option value="' + NO_PROJECT + '"'
          + (selectedId === NO_PROJECT ? ' selected' : '') + '>Utan projekt</option>'
        : '');
  }

  function matchesProject(obj, projectId) {
    if (!projectId) return true;
    if (projectId === NO_PROJECT) return !obj.projectId;
    return obj.projectId === projectId;
  }

  function openNew() {
    var clients = S.clients(true).filter(function (c) { return hasUnbilled(c.id); });

    if (!clients.length) {
      U.toast('Inget ofakturerat att fakturera', true);
      return;
    }

    var s = S.settings();
    var today = S.todayISO();

    var html = '<div class="field"><label for="i-client">Kund</label>'
      + '<select id="i-client">' + U.options(clients, clients[0].id) + '</select></div>';

    html += '<div class="field" id="i-project-wrap"><label for="i-project">Projekt</label>'
      + '<select id="i-project">' + projectOptions(clients[0].id, '') + '</select>'
      + '<p class="small muted" style="margin:6px 0 0">Fakturera ett enskilt projekt, eller allt '
      + 'ofakturerat hos kunden.</p></div>';

    html += '<div class="field"><label>Period (ofakturerat t.o.m.)</label>'
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
      + '<input type="date" id="i-due" value="'
      + U.esc(U.addDays(today, Number(s.paymentTermsDays) || 30)) + '"></div></div>';

    html += '<div class="field"><label>Specifikation av tiden</label>'
      + '<div class="seg"><button type="button" data-mode="detailed" aria-pressed="true">Varje tidspost</button>'
      + '<button type="button" data-mode="grouped" aria-pressed="false">Summera per projekt</button></div>'
      + '<p class="small muted" style="margin:8px 0 0">Material och körningar specificeras alltid '
      + 'rad för rad.</p></div>';

    html += '<div class="field"><label for="i-notes">Meddelande på fakturan</label>'
      + '<textarea id="i-notes" placeholder="T.ex. Tack för förtroendet!"></textarea></div>';

    html += '<div id="i-preview"></div>';

    html += '<button class="btn btn-primary btn-block" data-create style="margin-top:14px">Skapa faktura</button>';

    U.openSheet('Ny faktura ' + S.peekInvoiceNumber(), html, function (body) {
      var mode = 'detailed';

      function selected() {
        var q = {
          clientId: body.querySelector('#i-client').value,
          from: body.querySelector('#i-from').value || null,
          to: body.querySelector('#i-to').value || null,
          status: 'unbilled'
        };
        var pid = body.querySelector('#i-project').value;
        var keep = function (o) { return matchesProject(o, pid); };

        var entries = S.entries(q).filter(keep);
        var materials = S.materials(q).filter(keep);
        var trips = S.trips(q).filter(keep);

        /* Fastprisjobb kommer med nar de valts uttryckligen, eller - vid "allt
           ofakturerat" - nar de har nagon oppen post i perioden. */
        var touched = {};
        entries.concat(materials).concat(trips).forEach(function (o) {
          if (o.projectId) touched[o.projectId] = true;
        });

        var fixed = S.openFixedProjects(q.clientId).filter(function (p) {
          if (pid === NO_PROJECT) return false;
          if (pid) return p.id === pid;
          return !!touched[p.id];
        });

        return { entries: entries, materials: materials, trips: trips, fixed: fixed };
      }

      function updatePreview() {
        var sel = selected();
        var clientId = body.querySelector('#i-client').value;
        var issueDate = body.querySelector('#i-issue').value || S.todayISO();
        var lines = buildLines(sel.entries, sel.materials, sel.trips, sel.fixed, mode);
        var sums = summarize(lines, clientId, issueDate, null);
        var box = body.querySelector('#i-preview');
        var count = sel.entries.length + sel.materials.length + sel.trips.length + sel.fixed.length;

        if (!count) {
          box.innerHTML = '<div class="empty small">Inget ofakturerat i det här urvalet.</div>';
          body.querySelector('[data-create]').disabled = true;
          return;
        }
        body.querySelector('[data-create]').disabled = false;

        box.innerHTML = '<div class="totals">'
          + sel.fixed.map(function (p) {
            return '<div class="totals-row"><span class="muted">' + U.esc(p.name)
              + ' <span class="badge badge-fixed">Fast pris</span></span><span>'
              + U.money(S.fixedPriceOf(p)) + '</span></div>';
          }).join('')
          + billableRows(sel)
          + '<div class="totals-row"><span class="muted">Summa ('
          + lines.length + ' rader)</span><span>' + U.money(sums.subtotal) + '</span></div>'
          + (S.vatExempt()
            ? '<div class="totals-row"><span class="muted">Momsbefriad</span><span>ingen moms</span></div>'
            : '<div class="totals-row"><span class="muted">Moms ' + sums.vatRate + '%</span><span>'
              + U.money(sums.vat) + '</span></div>')
          + rotPreviewRows(sums)
          + '<div class="totals-row grand"><span>Att betala</span><span>' + U.money(sums.total) + '</span></div>'
          + '</div>'
          + modeNotice(sums, clientId);
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
          var sel = selected();
          create(body, sel, mode);
        }
      });

      /* Byter man kund maste projektlistan byggas om innan urvalet räknas ut.
         Den har lyssnaren ligger pa elementet sjalvt och hinner fore body:ns. */
      body.querySelector('#i-client').addEventListener('change', function () {
        body.querySelector('#i-project').innerHTML = projectOptions(this.value, '');
      });

      body.querySelector('#i-issue').addEventListener('change', function () {
        body.querySelector('#i-due').value =
          U.addDays(this.value, Number(S.settings().paymentTermsDays) || 30);
      });

      updatePreview();
    });
  }

  /* Forhandsvisningens mellanrader. Bara det som faktiskt laggs till fakturan
     far ett belopp - poster som tacks av ett fastpris redovisas separat, sa
     att raderna alltid summerar till totalen. */
  function billableRows(sel) {
    var time = sel.entries.reduce(function (s, e) { return s + S.billableEntry(e); }, 0);
    var hours = sel.entries.reduce(function (s, e) {
      return s + ((S.isFixed(e.projectId) && !e.ata) ? 0 : Number(e.hours || 0));
    }, 0);
    var mat = sel.materials.reduce(function (s, m) { return s + S.billableMaterial(m); }, 0);
    var trip = sel.trips.reduce(function (s, t) { return s + S.billableTrip(t); }, 0);

    var covered = sel.entries.filter(function (e) { return S.isFixed(e.projectId) && !e.ata; }).length
      + sel.materials.filter(function (m) { return S.fixedCoversExtras(m.projectId) && !m.ata; }).length
      + sel.trips.filter(function (t) { return S.fixedCoversExtras(t.projectId) && !t.ata; }).length;

    var ata = sel.entries.concat(sel.materials).concat(sel.trips)
      .filter(S.isAta).length;

    var html = '';

    if (time) {
      html += '<div class="totals-row"><span class="muted">Arbetad tid · ' + U.hours(hours)
        + '</span><span>' + U.money(time) + '</span></div>';
    }
    if (mat) {
      html += '<div class="totals-row"><span class="muted">Material</span><span>'
        + U.money(mat) + '</span></div>';
    }
    if (trip) {
      var km = sel.trips.reduce(function (s, t) {
        return s + ((S.fixedCoversExtras(t.projectId) && !t.ata) ? 0 : Number(t.distance || 0));
      }, 0);
      html += '<div class="totals-row"><span class="muted">Körning · ' + U.distance(km)
        + '</span><span>' + U.money(trip) + '</span></div>';
    }
    if (ata) {
      html += '<div class="totals-row"><span class="muted small">varav ' + ata
        + ' ÄTA</span><span class="small muted">utöver fastpriset</span></div>';
    }
    if (covered) {
      html += '<div class="totals-row"><span class="muted small">' + covered
        + ' poster ingår i fastpriset</span><span class="small muted">ingen extra debitering</span></div>';
    }

    return html;
  }

  /* Mellanraderna som visar sjalva ROT-avdraget i forhandsvisningen. */
  function rotPreviewRows(sums) {
    if (sums.mode !== 'rot' || !sums.rotDeduction) return '';
    var r = sums.rot;
    return '<div class="totals-row"><span class="muted">Arbetskostnad'
      + (S.vatExempt() ? '' : ' inkl. moms') + '</span><span>'
      + U.money(sums.rotBaseInclVat) + '</span></div>'
      + '<div class="totals-row"><span class="muted">ROT-avdrag ' + r.percent + ' %</span><span>−'
      + U.money(sums.rotDeduction) + '</span></div>';
  }

  /* Varningar och forklaringar som hor ihop med kundens fakturerningssatt. */
  function modeNotice(sums, clientId) {
    var c = S.client(clientId) || {};

    if (sums.mode === 'reverse') {
      return note('ok', 'Omvänd byggmoms', 'Fakturan går utan moms. '
        + (c.vatnr
          ? 'Kundens momsreg.nr ' + U.esc(c.vatnr) + ' skrivs ut på fakturan.'
          : '<b>Kundens momsreg.nr saknas</b> — fyll i det på kunden, det måste stå på fakturan.'));
    }

    if (sums.mode !== 'rot') return '';

    var r = sums.rot;
    var html = '';

    if (sums.unsplitFixed) {
      html += note('warn', 'Fastpris utan uppdelning',
        sums.unsplitFixed + ' fastprisjobb har material och körning inbakat i priset, så appen '
        + 'vet inte hur mycket som är arbete — och ROT ges bara på arbetet. Öppna projektet och '
        + 'fyll i <i>Varav arbetskostnad</i>; där finns ett färdigt förslag att trycka på.');
    }

    if (!sums.rotBase) {
      /* Ar det fastpriset som saknar uppdelning ar det redan sagt ovan. */
      if (!sums.unsplitFixed) {
        html += note('warn', 'Inget ROT-underlag',
          'Fakturan innehåller ingen arbetskostnad — bara material, körning eller avgifter. '
          + 'ROT ges bara på arbete.');
      }
      return html;
    }

    if (r.capped) {
      html += note('warn', 'Kundens utrymme tar slut',
        'Avdraget skulle bli ' + U.money(r.raw) + ' men kunden har bara ' + U.money(r.available)
        + ' kvar av ' + U.money(r.ceiling) + ' i år. Mellanskillnaden hamnar på kundens faktura.');
    }

    html += note('ok', 'ROT-avdrag',
      'Kunden betalar ' + U.money(sums.total) + ' och du begär ' + U.money(sums.rotDeduction)
      + ' från Skatteverket när fakturan är betald.'
      + (r.used ? ' Dina fakturor har dragit ' + U.money(r.used) + ' på kunden hittills i år.' : ''));

    return html;
  }

  function note(kind, title, text) {
    return '<div class="notice notice-' + kind + '"><b>' + U.esc(title) + '</b><br>' + text + '</div>';
  }

  function sumHours(entries) {
    return S.round2(entries.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0));
  }

  /* Bygger fakturarader ur tid, material och körningar. Raderna sparas på
     fakturan så att historiken inte ändras om timpriset justeras senare.

     Varje rad bär med sig kind och labour. labour är radens arbetskostnad
     exklusive moms — underlaget för ROT — och är noll på allt som inte är
     arbete: material, mil och framkörning ger aldrig ROT. */
  function buildLines(entries, materials, trips, fixed, mode) {
    var lines = [];

    /* Fastprisjobben forst - de ar rubriken pa fakturan. */
    (fixed || []).forEach(function (p) {
      lines.push({
        date: '',
        description: p.name + ' – fast pris enligt överenskommelse'
          + (p.fixedIncludes ? ', inklusive material och resor' : ''),
        qty: 1,
        unit: 'st',
        rate: S.fixedPriceOf(p),
        amount: S.fixedPriceOf(p),
        kind: 'fixed',
        labour: S.fixedLabourOf(p),
        /* Priset tacker utlaggen och ingen uppdelning ar gjord - da vet vi
           inte vad som ar arbete, och fakturan ska sagas till om det. */
        labourUnset: !!(p.fixedIncludes
          && (p.fixedLabour === '' || p.fixedLabour === null || p.fixedLabour === undefined))
      });
    });

    /* Aldst forst, sa fakturan lases uppifran och ner i kronologisk ordning. */
    var byDate = function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    };

    /* Det som redan tacks av ett fastpris far ingen egen rad - annars
       dubbeldebiteras kunden. ATA ligger utanfor priset och foljer med. */
    entries = entries.filter(function (e) { return e.ata || !S.isFixed(e.projectId); });
    materials = materials.filter(function (m) { return m.ata || !S.fixedCoversExtras(m.projectId); });
    trips = trips.filter(function (t) { return t.ata || !S.fixedCoversExtras(t.projectId); });

    if (mode === 'grouped') {
      var groups = {};
      entries.slice().sort(byDate).forEach(function (e) {
        var rate = S.rateFor(e.clientId, e.projectId);
        var p = e.projectId ? S.project(e.projectId) : null;
        var name = p ? p.name : 'Konsulttid';
        if (S.isAta(e)) name = 'ÄTA – ' + name;
        var key = name + '|' + rate;
        if (!groups[key]) groups[key] = { description: name, qty: 0, rate: rate, from: e.date, to: e.date };
        groups[key].qty += Number(e.hours || 0);
        if (e.date < groups[key].from) groups[key].from = e.date;
        if (e.date > groups[key].to) groups[key].to = e.date;
      });
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        lines.push({
          date: '',
          description: g.description + ' (' + g.from + ' – ' + g.to + ')',
          qty: S.round2(g.qty),
          unit: 'h',
          rate: g.rate,
          amount: S.round2(g.qty * g.rate),
          kind: 'time',
          labour: S.round2(g.qty * g.rate)
        });
      });
    } else {
      entries.slice().sort(byDate).forEach(function (e) {
        var rate = S.rateFor(e.clientId, e.projectId);
        var p = e.projectId ? S.project(e.projectId) : null;
        var desc = e.comment || 'Arbetad tid';
        if (p) desc = p.name + ' – ' + desc;
        if (S.isAta(e)) desc = 'ÄTA – ' + desc;
        lines.push({
          date: e.date,
          description: desc,
          qty: Number(e.hours || 0),
          unit: 'h',
          rate: rate,
          amount: S.round2(Number(e.hours || 0) * rate),
          kind: 'time',
          labour: S.round2(Number(e.hours || 0) * rate)
        });
      });
    }

    /* Material listas alltid rad för rad — varje inköp är sin egen post.
       I grupperat läge saknas datumkolumnen, så datumet skrivs in i texten. */
    materials.slice().sort(byDate).forEach(function (m) {
      var p = m.projectId ? S.project(m.projectId) : null;
      var desc = m.description;
      if (p) desc = p.name + ' – ' + desc;
      if (S.isAta(m)) desc = 'ÄTA – ' + desc;
      if (mode === 'grouped') desc = desc + ' (' + m.date + ')';
      lines.push({
        date: m.date,
        description: desc,
        qty: Number(m.qty || 0),
        unit: m.unit || 'st',
        rate: Number(m.unitPrice || 0),
        amount: S.materialAmount(m),
        kind: 'material',
        labour: 0
      });
    });

    /* Körningar: milen och framkörningsavgiften blir skilda rader, så att
       kunden ser vad som är sträcka och vad som är fast avgift. */
    trips.slice().sort(byDate).forEach(function (t) {
      var p = t.projectId ? S.project(t.projectId) : null;
      /* Bara en halv rutt sager inte kunden nagot - visa den nar bada finns. */
      var where = t.from && t.to ? t.from + ' – ' + t.to : '';
      var base = t.purpose ? 'Körning, ' + t.purpose : 'Körning';
      if (where) base += ' (' + where + ')';
      if (mode === 'grouped') base += ' ' + t.date;
      if (p) base = p.name + ' – ' + base;
      if (S.isAta(t)) base = 'ÄTA – ' + base;

      if (Number(t.distance) > 0 && Number(t.rate) > 0) {
        lines.push({
          date: t.date,
          description: base,
          qty: Number(t.distance),
          unit: 'mil',
          rate: Number(t.rate),
          amount: S.tripDistanceAmount(t),
          kind: 'trip',
          labour: 0
        });
      }

      if (Number(t.fee) > 0) {
        lines.push({
          date: t.date,
          description: 'Framkörningsavgift'
            + (t.purpose ? ', ' + t.purpose : '')
            + (where ? ' (' + where + ')' : ''),
          qty: 1,
          unit: 'st',
          rate: Number(t.fee),
          amount: S.round2(Number(t.fee)),
          kind: 'fee',
          labour: 0
        });
      }
    });

    return lines;
  }

  function totals(lines, vatRate) {
    var subtotal = S.round2(lines.reduce(function (s, l) { return s + Number(l.amount || 0); }, 0));
    var vat = S.round2(subtotal * (Number(vatRate) || 0) / 100);
    return { subtotal: subtotal, vat: vat, gross: S.round2(subtotal + vat) };
  }

  function labourTotal(lines) {
    return S.round2((lines || []).reduce(function (s, l) { return s + Number(l.labour || 0); }, 0));
  }

  /* Hela summeringen for ett urval rader: moms enligt kundens momslage, ROT
     pa arbetskostnaden och till sist vad kunden ska betala.

     excludeId later en befintlig fakturas eget ROT-avdrag raknas bort ur arets
     forbrukade utrymme - annars skulle en faktura konkurrera med sig sjalv. */
  function summarize(lines, clientId, issueDate, excludeId) {
    var mode = S.billingModeFor(clientId);
    var vatRate = S.vatRateFor(clientId);
    var t = totals(lines, vatRate);

    var out = {
      mode: mode, vatRate: vatRate,
      subtotal: t.subtotal, vat: t.vat, gross: t.gross,
      rot: null, rotBase: 0, rotBaseInclVat: 0, rotDeduction: 0,
      unsplitFixed: 0, total: t.gross
    };

    if (mode !== 'rot') return out;

    out.rotBase = labourTotal(lines);
    out.unsplitFixed = lines.filter(function (l) {
      return l.kind === 'fixed' && l.labourUnset;
    }).length;
    out.rot = S.rotFor(clientId, out.rotBase, vatRate, issueDate, excludeId);
    out.rotBaseInclVat = out.rot.baseInclVat;
    out.rotDeduction = out.rot.deduction;
    out.total = S.round2(t.gross - out.rotDeduction);
    return out;
  }

  function create(body, sel, mode) {
    var entries = sel.entries, materials = sel.materials, trips = sel.trips, fixed = sel.fixed;

    if (!entries.length && !materials.length && !trips.length && !fixed.length) {
      U.toast('Inget valt', true);
      return;
    }

    var clientId = body.querySelector('#i-client').value;
    var c = S.client(clientId);
    var comp = S.company();
    var issueDate = body.querySelector('#i-issue').value || S.todayISO();
    var lines = buildLines(entries, materials, trips, fixed, mode);
    var sums = summarize(lines, clientId, issueDate, null);

    if (sums.mode === 'reverse' && !c.vatnr) {
      U.toast('Kundens momsreg.nr krävs vid omvänd byggmoms', true);
      return;
    }

    var inv = S.createInvoice({
      clientId: clientId,
      clientSnapshot: {
        name: c.name, contact: c.contact, orgnr: c.orgnr, phone: c.phone,
        address: c.address, zip: c.zip, city: c.city, email: c.email,
        vatnr: c.vatnr, rotPersonnr: c.rotPersonnr,
        rotProperty: c.rotProperty, rotApartment: c.rotApartment
      },
      companySnapshot: JSON.parse(JSON.stringify(comp)),
      issueDate: issueDate,
      dueDate: body.querySelector('#i-due').value || '',
      entryIds: entries.map(function (e) { return e.id; }),
      materialIds: materials.map(function (m) { return m.id; }),
      tripIds: trips.map(function (t) { return t.id; }),
      projectIds: fixed.map(function (p) { return p.id; }),
      lines: lines,
      mode: mode,
      vatRate: sums.vatRate,
      billingMode: sums.mode,
      hours: sumHours(entries),
      fixedTotal: S.round2(fixed.reduce(function (s, p) { return s + S.fixedPriceOf(p); }, 0)),
      ataTotal: S.round2(
        entries.filter(S.isAta).reduce(function (s, e) { return s + S.billableEntry(e); }, 0)
        + materials.filter(S.isAta).reduce(function (s, m) { return s + S.billableMaterial(m); }, 0)
        + trips.filter(S.isAta).reduce(function (s, t) { return s + S.billableTrip(t); }, 0)
      ),
      materialTotal: S.round2(materials.reduce(function (s, m) { return s + S.billableMaterial(m); }, 0)),
      distance: S.round2(trips.reduce(function (s, t) { return s + Number(t.distance || 0); }, 0)),
      tripTotal: S.round2(trips.reduce(function (s, t) { return s + S.billableTrip(t); }, 0)),
      subtotal: sums.subtotal,
      vat: sums.vat,
      gross: sums.gross,
      rotBase: sums.rotBase,
      rotBaseInclVat: sums.rotBaseInclVat,
      rotPercent: sums.rot ? sums.rot.percent : 0,
      rotDeduction: sums.rotDeduction,
      rotClaimedDate: null,
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
      + '<button class="btn btn-primary" data-share>Skicka (sms/mejl)</button>'
      + '<button class="btn" data-print>Skriv ut / PDF</button>'
      + '</div>';

    html += '<div class="seg" style="margin-bottom:14px">'
      + statusBtn(inv, 'utkast', 'Utkast')
      + statusBtn(inv, 'skickad', 'Skickad')
      + statusBtn(inv, 'betald', 'Betald')
      + '</div>';

    html += '<div class="totals">'
      + '<div class="totals-row"><span class="muted">Status</span><span class="badge ' + st.cls + '">'
      + st.label + '</span></div>'
      + '<div class="totals-row"><span class="muted">Fakturadatum</span><span>'
      + U.esc(inv.issueDate) + '</span></div>'
      + '<div class="totals-row"><span class="muted">Förfallodatum</span><span>'
      + U.esc(inv.dueDate || '–') + '</span></div>'
      + (inv.fixedTotal
        ? '<div class="totals-row"><span class="muted">Fast pris</span><span>'
          + U.money(inv.fixedTotal) + '</span></div>'
        : '')
      + (inv.ataTotal
        ? '<div class="totals-row"><span class="muted">ÄTA</span><span>'
          + U.money(inv.ataTotal) + '</span></div>'
        : '')
      + '<div class="totals-row"><span class="muted">Timmar</span><span>' + U.hours(inv.hours) + '</span></div>'
      + (inv.materialTotal
        ? '<div class="totals-row"><span class="muted">Material</span><span>'
          + U.money(inv.materialTotal) + '</span></div>'
        : '')
      + (inv.tripTotal
        ? '<div class="totals-row"><span class="muted">Körning (' + U.distance(inv.distance)
          + ')</span><span>' + U.money(inv.tripTotal) + '</span></div>'
        : '')
      + '<div class="totals-row"><span class="muted">Moms ' + U.esc(inv.vatRate) + '%'
      + (inv.billingMode === 'reverse' ? ' <span class="badge badge-reverse">Omvänd</span>' : '')
      + '</span><span>' + U.money(inv.vat) + '</span></div>'
      + (Number(inv.rotDeduction || 0)
        ? '<div class="totals-row"><span class="muted">ROT-avdrag ' + U.esc(inv.rotPercent)
          + ' %</span><span>−' + U.money(inv.rotDeduction) + '</span></div>'
        : '')
      + '<div class="totals-row grand"><span>Att betala</span><span>' + U.money(inv.total) + '</span></div>'
      + '</div>';

    html += rotClaimHTML(inv);

    html += '<div class="section-title">Förhandsvisning</div>';
    html += invoiceHTML(inv);

    html += '<div class="section-title">Hantera</div>';
    html += '<button class="btn btn-danger btn-block" data-delete-invoice>Ta bort faktura</button>';
    html += '<p class="small muted" style="margin-top:8px">Tid, material och körningar blir '
      + 'ofakturerade igen och kan faktureras om. Fakturanumret återanvänds inte.</p>';

    U.openSheet('Faktura ' + inv.number, html, function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-print]')) { printInvoice(inv); return; }
        if (ev.target.closest('[data-share]')) { shareInvoice(inv); return; }
        if (ev.target.closest('[data-rot-claim]')) {
          var wasClaimed = !!inv.rotClaimedDate;
          S.setInvoiceRotClaimed(inv.id, !wasClaimed);
          U.toast(wasClaimed ? 'ROT markerad som obegärd' : 'ROT markerad som begärd');
          openInvoice(inv.id);
          render(container);
          return;
        }
        var st2 = ev.target.closest('[data-status]');
        if (st2) {
          S.setInvoiceStatus(inv.id, st2.getAttribute('data-status'));
          U.toast('Status uppdaterad');
          openInvoice(inv.id);
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-invoice]')) {
          if (!confirm('Ta bort faktura ' + inv.number + '? Posterna blir ofakturerade igen.')) return;
          S.deleteInvoice(inv.id);
          U.closeSheet();
          U.toast('Faktura borttagen');
          render(container);
        }
      });
    });
  }

  /* Allt du behover skriva in i Skatteverkets "Begaran om utbetalning", samlat
     pa ett stalle sa att du slipper leta i fakturan. Begaran gors forst nar
     kunden betalat sin del - annars far du inte pengarna. */
  function rotClaimHTML(inv) {
    var rot = Number(inv.rotDeduction || 0);
    if (!rot) return '';

    var cl = inv.clientSnapshot || {};
    var claimed = !!inv.rotClaimedDate;
    var paid = inv.status === 'betald';

    var html = '<div class="section-title">ROT-underlag</div>';

    html += '<div class="totals">'
      + row('Köpare', U.esc(cl.name || '–'))
      + row('Personnummer', U.esc(cl.rotPersonnr || '– saknas'))
      + (cl.rotProperty ? row('Fastighetsbeteckning', U.esc(cl.rotProperty)) : '')
      + (cl.rotApartment ? row('Lägenhetsnummer', U.esc(cl.rotApartment)) : '')
      + row('Fakturanummer', U.esc(inv.number))
      + row('Arbetskostnad inkl. moms', U.money(inv.rotBaseInclVat))
      + row('Betaldatum', U.esc(inv.paidDate || '– inte betald'))
      + '<div class="totals-row grand"><span>Begärt belopp</span><span>' + U.money(rot) + '</span></div>'
      + '</div>';

    if (!cl.rotPersonnr) {
      html += note('warn', 'Personnummer saknas',
        'Skatteverket kan inte behandla begäran utan köparens personnummer. Fyll i det på '
        + 'kunden — fakturan påverkas inte.');
    }

    if (claimed) {
      html += note('ok', 'Begärd ' + U.esc(inv.rotClaimedDate),
        'Utbetalningen är begärd hos Skatteverket.');
    } else if (!paid) {
      html += note('warn', 'Vänta med begäran',
        'Begär utbetalningen först när kunden betalat sin del av fakturan.');
    }

    html += '<button class="btn btn-block" data-rot-claim style="margin-top:10px">'
      + (claimed ? 'Ångra — inte begärd än' : 'Markera som begärd hos Skatteverket') + '</button>';

    return html;
  }

  function row(label, value) {
    return '<div class="totals-row"><span class="muted">' + label + '</span><span>'
      + value + '</span></div>';
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
      // Aldre fakturor sparade bara "hours" utan enhet
      var qty = l.qty !== undefined ? l.qty : l.hours;
      var unit = l.unit || 'h';
      return '<tr>'
        + (detailed ? '<td class="nowrap">' + U.esc(l.date) + '</td>' : '')
        + '<td class="desc">' + U.esc(l.description) + '</td>'
        + '<td class="num">' + U.esc(String(qty).replace('.', ',') + ' ' + unit) + '</td>'
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
      + (cl.orgnr ? 'Org.nr ' + U.esc(cl.orgnr) + '<br>' : '')
      /* Vid omvand byggmoms ar kopatans momsreg.nr ett formkrav pa fakturan. */
      + (inv.billingMode === 'reverse' && cl.vatnr ? 'Momsreg.nr ' + U.esc(cl.vatnr) : '')
      + '</div></div>';

    html += '<div class="inv-table-wrap"><table class="inv-table"><thead><tr>'
      + (detailed ? '<th>Datum</th>' : '')
      + '<th>Beskrivning</th><th class="num">Antal</th><th class="num">á pris</th><th class="num">Belopp</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    /* Aldre fakturor sparade varken gross eller ROT. */
    var gross = inv.gross === undefined || inv.gross === null
      ? U.round2(Number(inv.subtotal || 0) + Number(inv.vat || 0))
      : Number(inv.gross);
    var rot = Number(inv.rotDeduction || 0);
    var exempt = !!co.vatExempt;

    html += '<div class="inv-sum">'
      + '<div class="inv-sum-row"><span>' + (exempt ? 'Summa' : 'Summa exkl. moms')
      + '</span><span>' + U.money(inv.subtotal) + '</span></div>'
      + (exempt ? ''
        : '<div class="inv-sum-row"><span>Moms ' + U.esc(inv.vatRate) + '%</span><span>'
          + U.money(inv.vat) + '</span></div>')
      + (rot
        ? (exempt ? '' : '<div class="inv-sum-row"><span>Summa inkl. moms</span><span>'
            + U.money(gross) + '</span></div>')
          + '<div class="inv-sum-row"><span>Arbetskostnad'
          + (exempt ? '' : ' inkl. moms') + '</span><span>'
          + U.money(inv.rotBaseInclVat) + '</span></div>'
          + '<div class="inv-sum-row"><span>ROT-avdrag ' + U.esc(inv.rotPercent) + ' %</span><span>−'
          + U.money(rot) + '</span></div>'
        : '')
      + '<div class="inv-sum-row total"><span>Att betala</span><span>' + U.money(inv.total) + '</span></div>'
      + '</div>';

    if (exempt) {
      html += '<div class="inv-flag"><b>Ingen moms debiteras.</b><br>'
        + 'Säljaren omfattas av undantag från skatteplikt för beskattningsbara personer '
        + 'med liten årsomsättning (18 kap. mervärdesskattelagen).</div>';
    }

    if (inv.billingMode === 'reverse') {
      html += '<div class="inv-flag"><b>Omvänd betalningsskyldighet för mervärdesskatt gäller.</b><br>'
        + 'Köparen är betalningsskyldig för mervärdesskatten på den här fakturan.</div>';
    }

    if (rot) {
      html += '<div class="inv-flag"><b>Rotavdrag enligt fakturamodellen.</b><br>'
        + 'Arbetskostnad' + (exempt ? '' : ' inklusive moms') + ': '
        + U.money(inv.rotBaseInclVat) + '. Avdraget är '
        + 'preliminärt — Skatteverket beslutar slutligt utifrån ditt utrymme för skattereduktion. '
        + 'Räcker inte utrymmet faktureras mellanskillnaden i efterhand.</div>';
    }

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

  /* Foljetexten till fakturan - blir sms:ets eller mejlets innehall. */
  function invoiceMessage(inv) {
    var cl = inv.clientSnapshot || {};
    var co = inv.companySnapshot || {};
    return 'Hej' + (cl.contact ? ' ' + cl.contact : '') + ',\n\n'
      + 'Här kommer faktura ' + inv.number + '.\n\n'
      + 'Fakturadatum: ' + inv.issueDate + '\n'
      + 'Förfallodatum: ' + (inv.dueDate || '-') + '\n'
      + (Number(inv.rotDeduction || 0)
        ? 'ROT-avdrag: -' + U.money(inv.rotDeduction) + ' (redan avdraget nedan)\n' : '')
      + (inv.billingMode === 'reverse'
        ? 'Omvänd betalningsskyldighet för mervärdesskatt gäller.\n' : '')
      + 'Att betala: ' + U.money(inv.total) + '\n\n'
      + (co.bankgiro ? 'Bankgiro: ' + co.bankgiro + '\n' : '')
      + '\nMed vänlig hälsning\n' + (co.name || '');
  }

  /* Skickar fakturan som PDF via telefonens delningsmeny - dar valjer man
     Meddelanden (sms), mejlappen eller vad man vill; filen och foljetexten
     hanger med. Inget skickas fran appen sjalv - det sker i appen man valjer. */
  function shareInvoice(inv) {
    var blob;
    try {
      blob = global.PDF.invoiceBlob(inv);
    } catch (err) {
      console.error(err);
      U.toast('Kunde inte skapa PDF:en', true);
      return;
    }

    var name = global.PDF.invoiceFilename(inv);
    var file = null;
    try {
      file = new File([blob], name, { type: 'application/pdf' });
    } catch (err) { /* gammal webblasare utan File-konstruktor */ }

    var nav = global.navigator;
    if (file && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      nav.share({
        files: [file],
        title: 'Faktura ' + inv.number,
        text: invoiceMessage(inv)
      }).catch(function (err) {
        /* Stangd delningsmeny ar inget fel - allt annat far reservvagen. */
        if (err && err.name === 'AbortError') return;
        console.error(err);
        sharePdfFallback(inv, blob, name);
      });
      return;
    }

    sharePdfFallback(inv, blob, name);
  }

  /* Utan stod for fildelning (t.ex. aldre webblasare pa datorn): ladda ner
     PDF:en och oppna ett mejlutkast, sa att filen bara ar att bifoga. */
  function sharePdfFallback(inv, blob, name) {
    U.download(name, blob, 'application/pdf');
    U.toast('PDF:en laddades ner — bifoga den i mejlet eller sms:et');
    var cl = inv.clientSnapshot || {};
    var co = inv.companySnapshot || {};
    if (!cl.email) return;
    global.location.href = 'mailto:' + encodeURIComponent(cl.email)
      + '?subject=' + encodeURIComponent('Faktura ' + inv.number + ' från ' + (co.name || ''))
      + '&body=' + encodeURIComponent(invoiceMessage(inv));
  }

  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-new-invoice]')) { openNew(); return; }
      var i = ev.target.closest('[data-invoice]');
      if (i) { openInvoice(i.getAttribute('data-invoice')); return; }

      var q = ev.target.closest('[data-vat-quarter]');
      if (q) { vatQuarter = Number(q.getAttribute('data-vat-quarter')); render(el); return; }
      var b = ev.target.closest('[data-vat-basis]');
      if (b) { vatBasis = b.getAttribute('data-vat-basis'); render(el); return; }
      if (ev.target.closest('[data-print-vat]')) { printVatReport(); return; }
      var yb = ev.target.closest('[data-ys-year]');
      if (yb) { yearOffset = Number(yb.getAttribute('data-ys-year')); render(el); return; }
      if (ev.target.closest('[data-print-year]')) { printYearSummary(); return; }
      if (ev.target.closest('[data-new-expense]')) { openExpense(null); return; }
      var x = ev.target.closest('[data-expense]');
      if (x) openExpense(x.getAttribute('data-expense'));
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

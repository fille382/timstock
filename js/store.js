/* store.js - datalager. All data ligger i localStorage under en enda nyckel. */
(function (global) {
  'use strict';

  var KEY = 'timstock.v1';
  var LEGACY_KEY = 'fakturering.v1'; // appen het Fakturering innan den fick namn

  function defaults() {
    return {
      version: 1,
      company: {
        name: '', orgnr: '', vatnr: '', address: '', zip: '', city: '',
        email: '', phone: '', bankgiro: '', iban: '', bic: '', fskatt: true
      },
      settings: {
        defaultRate: 750,
        vatRate: 25,
        paymentTermsDays: 30,
        materialMarkup: 0,
        mileageRate: 25,
        calloutFee: 0,
        invoicePrefix: '',
        nextInvoiceNumber: 1,
        rotPercent: 30,
        rotMaxPerYear: 50000
      },
      clients: [],
      projects: [],
      entries: [],
      materials: [],
      trips: [],
      invoices: [],
      expenses: []
    };
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  var data = defaults();
  var listeners = [];

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* Fyller pa saknade falt om datan sparats av en aldre version. */
  function migrate(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    d.company = Object.assign(d.company, raw.company || {});
    d.settings = Object.assign(d.settings, raw.settings || {});
    d.clients = Array.isArray(raw.clients) ? raw.clients : [];
    d.projects = Array.isArray(raw.projects) ? raw.projects : [];
    d.entries = Array.isArray(raw.entries) ? raw.entries : [];
    d.materials = Array.isArray(raw.materials) ? raw.materials : [];
    d.trips = Array.isArray(raw.trips) ? raw.trips : [];
    d.invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
    d.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
    return d;
  }

  function load() {
    try {
      var stored = global.localStorage.getItem(KEY);
      if (stored === null) stored = global.localStorage.getItem(LEGACY_KEY);
      data = migrate(stored ? JSON.parse(stored) : null);
    } catch (err) {
      console.error('Kunde inte lasa sparad data:', err);
      data = defaults();
    }
    return data;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Kunde inte spara:', err);
      alert('Kunde inte spara data. Ar webblasarens lagring full eller blockerad?');
      return false;
    }
    listeners.forEach(function (fn) { fn(data); });
    return true;
  }

  function onChange(fn) { listeners.push(fn); }

  /* ---------- Kunder ---------- */

  function clients(includeArchived) {
    return data.clients
      .filter(function (c) { return includeArchived || !c.archived; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'sv'); });
  }

  function client(id) {
    return data.clients.find(function (c) { return c.id === id; }) || null;
  }

  function saveClient(c) {
    if (c.id) {
      var i = data.clients.findIndex(function (x) { return x.id === c.id; });
      if (i >= 0) data.clients[i] = Object.assign({}, data.clients[i], c);
    } else {
      c.id = uid();
      c.archived = false;
      data.clients.push(c);
    }
    save();
    return c.id;
  }

  function archiveClient(id, archived) {
    var c = client(id);
    if (!c) return;
    c.archived = !!archived;
    save();
  }

  function deleteClient(id) {
    if (data.entries.some(function (e) { return e.clientId === id; })) return false;
    if (data.materials.some(function (m) { return m.clientId === id; })) return false;
    if (data.trips.some(function (t) { return t.clientId === id; })) return false;
    data.clients = data.clients.filter(function (c) { return c.id !== id; });
    data.projects = data.projects.filter(function (p) { return p.clientId !== id; });
    save();
    return true;
  }

  /* ---------- Projekt ---------- */

  function projects(clientId, includeArchived) {
    return data.projects
      .filter(function (p) {
        if (clientId && p.clientId !== clientId) return false;
        return includeArchived || !p.archived;
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'sv'); });
  }

  function project(id) {
    return data.projects.find(function (p) { return p.id === id; }) || null;
  }

  function saveProject(p) {
    if (p.id) {
      var i = data.projects.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) data.projects[i] = Object.assign({}, data.projects[i], p);
    } else {
      p.id = uid();
      p.archived = false;
      p.invoiceId = null;
      data.projects.push(p);
    }
    save();
    return p.id;
  }

  function archiveProject(id, archived) {
    var p = project(id);
    if (!p) return;
    p.archived = !!archived;
    save();
  }

  function deleteProject(id) {
    if (data.entries.some(function (e) { return e.projectId === id; })) return false;
    if (data.materials.some(function (m) { return m.projectId === id; })) return false;
    if (data.trips.some(function (t) { return t.projectId === id; })) return false;
    data.projects = data.projects.filter(function (p) { return p.id !== id; });
    save();
    return true;
  }

  /* ---------- Fastpris ----------

     Ett fastprisjobb ar ett projekt med ett avtalat pris. Timmarna registreras
     som vanligt men styr inte fakturan - de finns for att man i efterhand ska
     kunna se om jobbet gick ihop. Projektet faktureras en gang, och da foljer
     alla dess oppna poster med som betalda. */

  function isFixedProject(p) {
    return !!p && p.fixedPrice !== '' && p.fixedPrice !== null
      && p.fixedPrice !== undefined && Number(p.fixedPrice) > 0;
  }

  function isFixed(projectId) {
    return isFixedProject(project(projectId));
  }

  /* Sant nar jobbet offererats inklusive material och resor. */
  function fixedCoversExtras(projectId) {
    var p = project(projectId);
    return isFixedProject(p) && !!p.fixedIncludes;
  }

  /* Ofakturerade fastprisjobb hos en kund. */
  function openFixedProjects(clientId) {
    return projects(clientId, true).filter(function (p) {
      return isFixedProject(p) && !p.invoiceId;
    });
  }

  function fixedPriceOf(p) {
    return isFixedProject(p) ? round2(Number(p.fixedPrice)) : 0;
  }

  /* ROT raknas bara pa arbetskostnaden, sa ett fastpris maste delas upp i
     arbete och ovrigt. Har du skrivit in delen sjalv galler den. Annars:

       Ingar inte utlaggen i priset  ->  hela priset ar arbete.
       Ingar de                      ->  vad som helst kan ligga i klumpen,
                                         och da behovs en siffra fran dig. */
  function fixedLabourOf(p) {
    if (!isFixedProject(p)) return 0;
    var v = p.fixedLabour;
    if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) {
      return Math.min(round2(Number(v)), fixedPriceOf(p));
    }
    return p.fixedIncludes ? 0 : fixedPriceOf(p);
  }

  /* Forslag pa uppdelningen: fastpriset minus de utlagg som faktiskt bokforts
     pa jobbet. Bygger pa dina egna siffror, sa den gar att forsvara for
     Skatteverket - men den forutsatter att materialet ar inregistrerat. */
  function suggestedFixedLabour(projectId) {
    var p = project(projectId);
    if (!isFixedProject(p)) return null;
    if (!p.fixedIncludes) return fixedPriceOf(p);

    var notAta = function (o) { return !isAta(o); };
    var extras = materials({ projectId: projectId }).filter(notAta)
      .reduce(function (s, m) { return s + materialAmount(m); }, 0)
      + trips({ projectId: projectId }).filter(notAta)
        .reduce(function (s, t) { return s + tripAmount(t); }, 0);

    return Math.max(0, round2(fixedPriceOf(p) - extras));
  }

  /* ---------- Tidsposter ---------- */

  function entries(filter) {
    filter = filter || {};
    return data.entries
      .filter(function (e) {
        if (filter.clientId && e.clientId !== filter.clientId) return false;
        if (filter.projectId && e.projectId !== filter.projectId) return false;
        if (filter.from && e.date < filter.from) return false;
        if (filter.to && e.date > filter.to) return false;
        if (filter.status === 'unbilled' && e.invoiceId) return false;
        if (filter.status === 'billed' && !e.invoiceId) return false;
        if (filter.invoiceId && e.invoiceId !== filter.invoiceId) return false;
        if (filter.text) {
          var needle = filter.text.toLowerCase();
          if ((e.comment || '').toLowerCase().indexOf(needle) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return b.date < a.date ? -1 : 1;
        return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
      });
  }

  function entry(id) {
    return data.entries.find(function (e) { return e.id === id; }) || null;
  }

  function saveEntry(e) {
    if (e.id) {
      var i = data.entries.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0) data.entries[i] = Object.assign({}, data.entries[i], e);
    } else {
      e.id = uid();
      e.invoiceId = null;
      e.createdAt = new Date().toISOString();
      data.entries.push(e);
    }
    save();
    return e.id;
  }

  function deleteEntry(id) {
    var e = entry(id);
    if (e && e.invoiceId) return false; // fakturerad tid far inte forsvinna tyst
    data.entries = data.entries.filter(function (x) { return x.id !== id; });
    save();
    return true;
  }

  /* ---------- Material ---------- */

  /* En materialpost ar ett utlagg som ska vidarefaktureras: antal, enhet och
     a-pris. description ar texten som hamnar pa fakturaraden. */
  function materials(filter) {
    filter = filter || {};
    return data.materials
      .filter(function (m) {
        if (filter.clientId && m.clientId !== filter.clientId) return false;
        if (filter.projectId && m.projectId !== filter.projectId) return false;
        if (filter.from && m.date < filter.from) return false;
        if (filter.to && m.date > filter.to) return false;
        if (filter.status === 'unbilled' && m.invoiceId) return false;
        if (filter.status === 'billed' && !m.invoiceId) return false;
        if (filter.invoiceId && m.invoiceId !== filter.invoiceId) return false;
        if (filter.text) {
          var needle = filter.text.toLowerCase();
          if ((m.description || '').toLowerCase().indexOf(needle) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return b.date < a.date ? -1 : 1;
        return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
      });
  }

  function material(id) {
    return data.materials.find(function (m) { return m.id === id; }) || null;
  }

  function saveMaterial(m) {
    if (m.id) {
      var i = data.materials.findIndex(function (x) { return x.id === m.id; });
      if (i >= 0) data.materials[i] = Object.assign({}, data.materials[i], m);
    } else {
      m.id = uid();
      m.invoiceId = null;
      m.createdAt = new Date().toISOString();
      data.materials.push(m);
    }
    save();
    return m.id;
  }

  function deleteMaterial(id) {
    var m = material(id);
    if (m && m.invoiceId) return false; // fakturerat material far inte forsvinna tyst
    data.materials = data.materials.filter(function (x) { return x.id !== id; });
    save();
    return true;
  }

  function materialAmount(m) {
    return round2(Number(m.qty || 0) * Number(m.unitPrice || 0));
  }

  /* ---------- Korningar ---------- */

  /* En korning ar antal mil ganger milersattning, plus en valfri fast
     framkorningsavgift. from/to/purpose ar korjournalsuppgifter. */
  function trips(filter) {
    filter = filter || {};
    return data.trips
      .filter(function (t) {
        if (filter.clientId && t.clientId !== filter.clientId) return false;
        if (filter.projectId && t.projectId !== filter.projectId) return false;
        if (filter.from && t.date < filter.from) return false;
        if (filter.to && t.date > filter.to) return false;
        if (filter.status === 'unbilled' && t.invoiceId) return false;
        if (filter.status === 'billed' && !t.invoiceId) return false;
        if (filter.invoiceId && t.invoiceId !== filter.invoiceId) return false;
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return b.date < a.date ? -1 : 1;
        return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
      });
  }

  function trip(id) {
    return data.trips.find(function (t) { return t.id === id; }) || null;
  }

  function saveTrip(t) {
    if (t.id) {
      var i = data.trips.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) data.trips[i] = Object.assign({}, data.trips[i], t);
    } else {
      t.id = uid();
      t.invoiceId = null;
      t.createdAt = new Date().toISOString();
      data.trips.push(t);
    }
    save();
    return t.id;
  }

  function deleteTrip(id) {
    var t = trip(id);
    if (t && t.invoiceId) return false; // fakturerad korning far inte forsvinna tyst
    data.trips = data.trips.filter(function (x) { return x.id !== id; });
    save();
    return true;
  }

  /* Bara milen, utan framkorningsavgiften. */
  function tripDistanceAmount(t) {
    return round2(Number(t.distance || 0) * Number(t.rate || 0));
  }

  function tripAmount(t) {
    return round2(tripDistanceAmount(t) + Number(t.fee || 0));
  }

  /* ---------- Belopp ----------

     amount* = vad posten ar vard raknemassigt (anvands for uppfoljning).
     billable* = vad den faktiskt far faktureras for. Pa ett fastprisjobb ar
     arbetet inbakat i det avtalade priset och ger darfor noll. */

  /* ATA = andrings- och tillaggsarbete. En post markt som ATA ligger utanfor
     det avtalade priset och faktureras darfor alltid, aven pa ett fastprisjobb.
     Markningen betyder inget pa lopande rakning. */
  function isAta(obj) {
    return !!(obj && obj.ata) && isFixed(obj.projectId);
  }

  function entryAmount(e) {
    return round2(Number(e.hours || 0) * rateFor(e.clientId, e.projectId));
  }

  function billableEntry(e) {
    return (isFixed(e.projectId) && !e.ata) ? 0 : entryAmount(e);
  }

  function billableMaterial(m) {
    return (fixedCoversExtras(m.projectId) && !m.ata) ? 0 : materialAmount(m);
  }

  function billableTrip(t) {
    return (fixedCoversExtras(t.projectId) && !t.ata) ? 0 : tripAmount(t);
  }

  /* Timpris for en tidspost: projektets pris, annars kundens, annars standard. */
  function rateFor(clientId, projectId) {
    var p = projectId ? project(projectId) : null;
    if (p && p.rate !== null && p.rate !== undefined && p.rate !== '') return Number(p.rate);
    var c = client(clientId);
    if (c && c.rate !== null && c.rate !== undefined && c.rate !== '') return Number(c.rate);
    return Number(data.settings.defaultRate) || 0;
  }

  /* ---------- Momslage och ROT ----------

     En kund faktureras pa ett av tre satt:

       normal   Vanlig moms.
       reverse  Omvand byggmoms. Saljaren satter ingen moms alls, kopatan
                redovisar den sjalv. Galler byggtjanster till en kopare som
                sjalv saljer byggtjanster.
       rot      Privatperson med ROT-avdrag. Kundens del av arbetskostnaden
                dras direkt pa fakturan och resten begars fran Skatteverket.

     Procentsats och tak ligger i installningarna och inte i koden - riksdagen
     andrar dem med jamna mellanrum. */

  function billingModeFor(clientId) {
    var c = client(clientId);
    var m = c && c.billingMode;
    return (m === 'reverse' || m === 'rot') ? m : 'normal';
  }

  function isReverseVat(clientId) { return billingModeFor(clientId) === 'reverse'; }
  function isRotClient(clientId) { return billingModeFor(clientId) === 'rot'; }

  function vatRateFor(clientId) {
    if (isReverseVat(clientId)) return 0; // kopatan redovisar momsen
    var c = client(clientId);
    if (c && c.vatRate !== null && c.vatRate !== undefined && c.vatRate !== '') return Number(c.vatRate);
    return Number(data.settings.vatRate) || 0;
  }

  /* Har kunden ett eget angivet utrymme som galler for det har aret?

     Utrymmet ar en ogonblicksbild fran Skatteverkets Mina sidor och stamplas
     med ar och datum nar det skrivs in. Vid arsskiftet borjar kunden om pa
     hela taket, sa en siffra fran forra aret sager inget - da faller appen
     tillbaka pa taket fran installningarna. */
  function customCeiling(c, year) {
    if (!c) return null;
    var own = c.rotCeiling;
    if (own === '' || own === null || own === undefined || !(Number(own) > 0)) return null;
    if (String(c.rotCeilingYear || '') !== String(year)) return null;
    return Number(own);
  }

  function rotCeilingFor(clientId, year) {
    var own = customCeiling(client(clientId), year || yearOf(todayISO()));
    if (own !== null) return own;
    return Number(data.settings.rotMaxPerYear) || 0;
  }

  function yearOf(iso) { return String(iso || '').slice(0, 4); }

  /* Vad kunden redan fatt i ROT pa vara fakturor samma ar. Ingen full koll -
     kunden kan ha anlitat andra hantverkare - men den fangar det vanligaste
     felet: att sitt eget tak spricker mitt i ett langt jobb.

     Avdraget hor till det ar da kunden BETALADE, inte da fakturan skrevs. En
     faktura fran december som betalas i januari belastar alltsa nya aret. For
     en obetald faktura ar fakturadatumet basta gissningen. */
  function rotYearOf(inv) {
    return yearOf(inv.paidDate || inv.issueDate);
  }

  /* skipClaimedThrough: hoppa over fakturor som redan var begarda hos
     Skatteverket det datumet. Anvands nar kunden lamnat en siffra fran Mina
     sidor - dar ar de begarda fakturorna redan borttraknade, och att dra av
     dem en gang till skulle strypa avdraget i onodan. */
  function rotUsedInYear(clientId, year, excludeInvoiceId, skipClaimedThrough) {
    return round2(data.invoices.reduce(function (s, i) {
      if (i.clientId !== clientId) return s;
      if (excludeInvoiceId && i.id === excludeInvoiceId) return s;
      if (rotYearOf(i) !== String(year)) return s;
      if (skipClaimedThrough && i.rotClaimedDate && i.rotClaimedDate <= skipClaimedThrough) return s;
      return s + Number(i.rotDeduction || 0);
    }, 0));
  }

  /* Avdraget pa en faktura: procent av arbetskostnaden INKLUSIVE moms,
     nedrundat till hela kronor och begransat av arets aterstaende utrymme. */
  function rotFor(clientId, labourExVat, vatRate, issueDate, excludeInvoiceId) {
    var percent = Number(data.settings.rotPercent) || 0;
    var base = round2(Number(labourExVat) || 0);
    var baseInclVat = round2(base * (1 + (Number(vatRate) || 0) / 100));

    var year = yearOf(issueDate || todayISO());
    var c = client(clientId);
    var own = customCeiling(c, year);
    var ceiling = own !== null ? own : (Number(data.settings.rotMaxPerYear) || 0);
    var used = rotUsedInYear(clientId, year, excludeInvoiceId,
      own !== null ? (c.rotCeilingDate || null) : null);

    var available = Math.max(0, round2(ceiling - used));
    var raw = Math.max(0, Math.floor(baseInclVat * percent / 100));
    var deduction = Math.min(raw, available);
    return {
      percent: percent, base: base, baseInclVat: baseInclVat,
      year: year, customCeiling: own !== null,
      ceiling: ceiling, used: used, available: available,
      raw: raw, deduction: deduction, capped: raw > available
    };
  }

  /* ---------- Utgifter ----------

     Utgifter ar inkop som INTE hor till nagot uppdrag - verktyg, drivmedel,
     telefon. De hamnar aldrig pa nagon faktura; de finns bara for att momsen
     pa dem ska komma med i momsunderlaget. Belopp och moms skrivs av rakt
     fran kvittot, sa inga antaganden om momssats behovs. */

  function expenses(filter) {
    filter = filter || {};
    return data.expenses
      .filter(function (x) {
        if (filter.from && x.date < filter.from) return false;
        if (filter.to && x.date > filter.to) return false;
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return b.date < a.date ? -1 : 1;
        return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
      });
  }

  function expense(id) {
    return data.expenses.find(function (x) { return x.id === id; }) || null;
  }

  function saveExpense(x) {
    if (x.id) {
      var i = data.expenses.findIndex(function (e) { return e.id === x.id; });
      if (i >= 0) data.expenses[i] = Object.assign({}, data.expenses[i], x);
    } else {
      x.id = uid();
      x.createdAt = new Date().toISOString();
      data.expenses.push(x);
    }
    save();
    return x.id;
  }

  function deleteExpense(id) {
    data.expenses = data.expenses.filter(function (x) { return x.id !== id; });
    save();
  }

  /* Momsen pa ett materialinkop. Angiven siffra galler; saknas den raknas
     25 % pa inkopspriset - byggmaterial ar 25 % sa nar som alltid. Star det
     nagot annat pa kvittot ar det bara att skriva in det pa posten. */
  function materialPurchaseVat(m) {
    var v = m.purchaseVat;
    if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) {
      return round2(Number(v));
    }
    var cost = Number(m.cost);
    if (!isFinite(cost) || cost <= 0) return 0;
    return round2(Number(m.qty || 0) * cost * 0.25);
  }

  /* ---------- Momsunderlag ----------

     Summorna som momsdeklarationen fragar efter, sa langt appen kan se dem:
     utgaende moms fran fakturorna, ingaende fran materialinkop och utgifter.

     basis 'faktura' = momsen hor till fakturadatumet (faktureringsmetoden),
     basis 'betald'  = till betaldatumet (kontantmetoden). Vilken som galler
     star i foretagets registrering hos Skatteverket. */

  function vatReport(from, to, basis) {
    var inRange = function (d) { return d && (!from || d >= from) && (!to || d <= to); };

    var out = {
      salesNormal: 0, vatOut: 0, salesReverse: 0, invoiceCount: 0,
      vatInMaterials: 0, materialCount: 0,
      vatInExpenses: 0, expenseCount: 0
    };

    data.invoices.forEach(function (inv) {
      var d = basis === 'betald' ? inv.paidDate : inv.issueDate;
      if (!inRange(d)) return;
      out.invoiceCount++;
      if (inv.billingMode === 'reverse') {
        out.salesReverse += Number(inv.subtotal || 0);
      } else {
        out.salesNormal += Number(inv.subtotal || 0);
        out.vatOut += Number(inv.vat || 0);
      }
    });

    data.materials.forEach(function (m) {
      if (!inRange(m.date)) return;
      var v = materialPurchaseVat(m);
      if (!v) return;
      out.vatInMaterials += v;
      out.materialCount++;
    });

    data.expenses.forEach(function (x) {
      if (!inRange(x.date)) return;
      out.vatInExpenses += Number(x.vat || 0);
      out.expenseCount++;
    });

    ['salesNormal', 'vatOut', 'salesReverse', 'vatInMaterials', 'vatInExpenses']
      .forEach(function (k) { out[k] = round2(out[k]); });
    out.vatIn = round2(out.vatInMaterials + out.vatInExpenses);
    out.net = round2(out.vatOut - out.vatIn);
    return out;
  }

  /* ---------- Fakturor ---------- */

  function invoices() {
    return data.invoices.slice().sort(function (a, b) {
      if (a.issueDate !== b.issueDate) return b.issueDate < a.issueDate ? -1 : 1;
      return b.number < a.number ? -1 : 1;
    });
  }

  function invoice(id) {
    return data.invoices.find(function (i) { return i.id === id; }) || null;
  }

  function peekInvoiceNumber() {
    var s = data.settings;
    return (s.invoicePrefix || '') + String(s.nextInvoiceNumber);
  }

  function createInvoice(inv) {
    inv.id = uid();
    inv.number = peekInvoiceNumber();
    inv.status = 'utkast';
    inv.createdAt = new Date().toISOString();
    data.invoices.push(inv);
    data.settings.nextInvoiceNumber = Number(data.settings.nextInvoiceNumber) + 1;
    // Mark tidsposter och material som fakturerade
    (inv.entryIds || []).forEach(function (eid) {
      var e = entry(eid);
      if (e) e.invoiceId = inv.id;
    });
    (inv.materialIds || []).forEach(function (mid) {
      var m = material(mid);
      if (m) m.invoiceId = inv.id;
    });
    (inv.tripIds || []).forEach(function (tid) {
      var t = trip(tid);
      if (t) t.invoiceId = inv.id;
    });
    (inv.projectIds || []).forEach(function (pid) {
      var p = project(pid);
      if (p) p.invoiceId = inv.id;
    });
    save();
    return inv;
  }

  /* Har vi begart utbetalningen av ROT-delen fran Skatteverket an? */
  function setInvoiceRotClaimed(id, claimed) {
    var inv = invoice(id);
    if (!inv) return;
    inv.rotClaimedDate = claimed ? (inv.rotClaimedDate || todayISO()) : null;
    save();
  }

  function setInvoiceStatus(id, status) {
    var inv = invoice(id);
    if (!inv) return;
    inv.status = status;
    inv.paidDate = status === 'betald' ? (inv.paidDate || todayISO()) : null;
    save();
  }

  /* Tar bort fakturan och frigor tidsposter och material sa de kan faktureras igen. */
  function deleteInvoice(id) {
    data.entries.forEach(function (e) {
      if (e.invoiceId === id) e.invoiceId = null;
    });
    data.materials.forEach(function (m) {
      if (m.invoiceId === id) m.invoiceId = null;
    });
    data.trips.forEach(function (t) {
      if (t.invoiceId === id) t.invoiceId = null;
    });
    data.projects.forEach(function (p) {
      if (p.invoiceId === id) p.invoiceId = null;
    });
    data.invoices = data.invoices.filter(function (i) { return i.id !== id; });
    save();
  }

  /* ---------- Foretag & installningar ---------- */

  function company() { return data.company; }
  function settings() { return data.settings; }

  function saveCompany(c) {
    data.company = Object.assign({}, data.company, c);
    save();
  }

  function saveSettings(s) {
    data.settings = Object.assign({}, data.settings, s);
    save();
  }

  /* ---------- Backup ---------- */

  function exportJSON() {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Filen innehaller ingen giltig data.');
    data = migrate(parsed);
    save();
  }

  function resetAll() {
    data = defaults();
    save();
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function raw() { return data; }

  global.Store = {
    load: load, save: save, onChange: onChange, uid: uid, raw: raw, todayISO: todayISO,
    clients: clients, client: client, saveClient: saveClient, archiveClient: archiveClient, deleteClient: deleteClient,
    projects: projects, project: project, saveProject: saveProject, archiveProject: archiveProject, deleteProject: deleteProject,
    entries: entries, entry: entry, saveEntry: saveEntry, deleteEntry: deleteEntry,
    materials: materials, material: material, saveMaterial: saveMaterial,
    trips: trips, trip: trip, saveTrip: saveTrip, deleteTrip: deleteTrip,
    tripAmount: tripAmount, tripDistanceAmount: tripDistanceAmount,
    deleteMaterial: deleteMaterial, materialAmount: materialAmount,
    materialPurchaseVat: materialPurchaseVat,
    expenses: expenses, expense: expense, saveExpense: saveExpense, deleteExpense: deleteExpense,
    vatReport: vatReport,
    isFixed: isFixed, isFixedProject: isFixedProject, fixedCoversExtras: fixedCoversExtras,
    openFixedProjects: openFixedProjects, fixedPriceOf: fixedPriceOf, fixedLabourOf: fixedLabourOf,
    suggestedFixedLabour: suggestedFixedLabour,
    billingModeFor: billingModeFor, isReverseVat: isReverseVat, isRotClient: isRotClient,
    rotCeilingFor: rotCeilingFor, rotUsedInYear: rotUsedInYear, rotFor: rotFor,
    isAta: isAta, entryAmount: entryAmount, billableEntry: billableEntry,
    billableMaterial: billableMaterial, billableTrip: billableTrip,
    rateFor: rateFor, vatRateFor: vatRateFor, round2: round2,
    invoices: invoices, invoice: invoice, createInvoice: createInvoice, peekInvoiceNumber: peekInvoiceNumber,
    setInvoiceStatus: setInvoiceStatus, setInvoiceRotClaimed: setInvoiceRotClaimed,
    deleteInvoice: deleteInvoice,
    company: company, settings: settings, saveCompany: saveCompany, saveSettings: saveSettings,
    exportJSON: exportJSON, importJSON: importJSON, resetAll: resetAll
  };
})(window);

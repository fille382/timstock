/* demo.js - demoläget: låtsasdata i minnet, ingenting sparas.

   Aktiveras med ?demo i adressen. Marknadssidan bäddar in appen så
   (marknad/index.html), och vem som helst kan testa via länken utan att
   riktig data i webbläsaren rörs: store.js läser aldrig localStorage i
   demoläge och skriver aldrig dit, kvittofoton stannar i minnet, och
   drive.js kopplar bort sig helt så att ingen riktig säkerhetskopia i
   Drive kan skrivas över av låtsasdata. Ladda om sidan så börjar demon om.

   Datumen räknas ut från dagens datum så att demon alltid ser färsk ut. */
(function (global) {
  'use strict';

  var active = /(?:\?|&)demo(?:=|&|$)/.test(global.location.search);

  function iso(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function stamp(daysAgo) { return iso(daysAgo) + 'T12:00:00.000Z'; }

  function data() {
    var year = String(new Date().getFullYear());

    var company = {
      name: 'Söderlunds Bygg & Montage', orgnr: '559214-7736', vatnr: 'SE559214773601',
      address: 'Snickarvägen 8', zip: '722 31', city: 'Västerås',
      email: 'info@soderlundsbygg.example', phone: '070-123 45 67',
      bankgiro: '5678-9012', swish: '123 456 78 90', iban: '', bic: '',
      fskatt: true, vatExempt: false
    };

    return {
      version: 1,
      company: company,
      settings: {
        defaultRate: 750, vatRate: 25, paymentTermsDays: 30, materialMarkup: 12,
        mileageRate: 25, calloutFee: 350, invoicePrefix: year + '-', nextInvoiceNumber: 15,
        rotPercent: 30, rotMaxPerYear: 50000, vatPeriod: 'kvartal'
      },
      clients: [
        { id: 'c1', name: 'Familjen Åström', contact: 'Anna Åström', phone: '070-987 65 43',
          rate: '', vatRate: '', billingMode: 'rot', vatnr: '',
          rotPersonnr: '', rotProperty: 'Ekbacken 2:14', rotApartment: '',
          rotCeiling: '', rotCeilingYear: '', rotCeilingDate: '',
          orgnr: '', address: 'Hagvägen 12', zip: '722 44', city: 'Västerås',
          email: 'anna@example.se', archived: false },
        { id: 'c2', name: 'Nybergs Entreprenad AB', contact: 'Jonas Nyberg', phone: '070-555 12 34',
          rate: '820', vatRate: '', billingMode: 'reverse', vatnr: 'SE556812345601',
          rotPersonnr: '', rotProperty: '', rotApartment: '',
          rotCeiling: '', rotCeilingYear: '', rotCeilingDate: '',
          orgnr: '556812-3456', address: 'Verkstadsgatan 3', zip: '632 20', city: 'Eskilstuna',
          email: 'jonas@example.se', archived: false },
        { id: 'c3', name: 'Café Linnéa', contact: 'Sara Lind', phone: '',
          rate: '695', vatRate: '', billingMode: 'standard', vatnr: '',
          rotPersonnr: '', rotProperty: '', rotApartment: '',
          rotCeiling: '', rotCeilingYear: '', rotCeilingDate: '',
          orgnr: '', address: 'Stora gatan 21', zip: '722 12', city: 'Västerås',
          email: 'hej@example.se', archived: false }
      ],
      projects: [
        { id: 'p1', clientId: 'c1', name: 'Altan & trädäck', rate: '', fixedPrice: '',
          fixedLabour: '', fixedIncludes: false, archived: false },
        { id: 'p2', clientId: 'c2', name: 'Kv. Loket – stomkomplettering', rate: '', fixedPrice: '',
          fixedLabour: '', fixedIncludes: false, archived: false }
      ],
      entries: [
        { id: 'e10', date: iso(26), clientId: 'c1', projectId: null, hours: 6,
          comment: 'Rivning av gammalt staket', ata: false, invoiceId: 'i1', createdAt: stamp(26) },
        { id: 'e11', date: iso(25), clientId: 'c1', projectId: null, hours: 8,
          comment: 'Montering staket och grind', ata: false, invoiceId: 'i1', createdAt: stamp(25) },
        { id: 'e1', date: iso(6), clientId: 'c1', projectId: 'p1', hours: 8,
          comment: 'Rivning av gammal altan, bortforsling', ata: false, invoiceId: null, createdAt: stamp(6) },
        { id: 'e2', date: iso(5), clientId: 'c1', projectId: 'p1', hours: 7.5,
          comment: 'Grävde och satte plintar', ata: false, invoiceId: null, createdAt: stamp(5) },
        { id: 'e3', date: iso(4), clientId: 'c2', projectId: 'p2', hours: 8,
          comment: 'Reglar och gips, plan 2', ata: false, invoiceId: null, createdAt: stamp(4) },
        { id: 'e4', date: iso(3), clientId: 'c2', projectId: 'p2', hours: 8,
          comment: 'Gips och fönstersmygar', ata: false, invoiceId: null, createdAt: stamp(3) },
        { id: 'e5', date: iso(2), clientId: 'c1', projectId: 'p1', hours: 6.5,
          comment: 'Lade trall, började på räcket', ata: false, invoiceId: null, createdAt: stamp(2) }
      ],
      materials: [
        { id: 'm10', date: iso(26), clientId: 'c1', projectId: null,
          description: 'Staketvirke och beslag', qty: 1, unit: 'st', unitPrice: 4200,
          cost: 3500, markup: '', purchaseVat: 875, photoId: '', ata: false, invoiceId: 'i1',
          createdAt: stamp(26) },
        { id: 'm1', date: iso(5), clientId: 'c1', projectId: 'p1',
          description: 'Trallvirke 28×120 impregnerad', qty: 84, unit: 'm', unitPrice: 32,
          cost: 25.6, markup: '', purchaseVat: 537.6, photoId: '', ata: false, invoiceId: null,
          createdAt: stamp(5) },
        { id: 'm2', date: iso(5), clientId: 'c1', projectId: 'p1',
          description: 'Plintar och stolpskor', qty: 9, unit: 'st', unitPrice: 129,
          cost: 103, markup: '', purchaseVat: 231.75, photoId: '', ata: false, invoiceId: null,
          createdAt: stamp(5) }
      ],
      trips: [
        { id: 't1', date: iso(6), clientId: 'c1', projectId: 'p1',
          distance: 3.4, rate: 25, fee: 350, from: 'Snickarvägen 8', to: 'Hagvägen 12, Västerås',
          purpose: 'Rivning och materialleverans', ata: false, invoiceId: null, createdAt: stamp(6) },
        { id: 't2', date: iso(2), clientId: 'c1', projectId: 'p1',
          distance: 3.4, rate: 25, fee: 0, from: 'Snickarvägen 8', to: 'Hagvägen 12, Västerås',
          purpose: 'Trall och räcke', ata: false, invoiceId: null, createdAt: stamp(2) }
      ],
      invoices: [
        { id: 'i2', number: year + '-13', status: 'betald', paidDate: iso(24),
          createdAt: stamp(29),
          clientId: 'c2',
          clientSnapshot: { name: 'Nybergs Entreprenad AB', contact: 'Jonas Nyberg',
            orgnr: '556812-3456', phone: '070-555 12 34', address: 'Verkstadsgatan 3',
            zip: '632 20', city: 'Eskilstuna', email: 'jonas@example.se',
            vatnr: 'SE556812345601', rotPersonnr: '', rotProperty: '', rotApartment: '' },
          companySnapshot: company,
          issueDate: iso(29), dueDate: iso(-1),
          entryIds: [], materialIds: [], tripIds: [], projectIds: [],
          lines: [
            { date: '', description: 'Kv. Loket – stomkomplettering, arbetad tid',
              qty: 96, unit: 'h', rate: 820, amount: 78720, kind: 'time', labour: 78720 }
          ],
          mode: 'grouped', vatRate: 0, billingMode: 'reverse',
          hours: 96, fixedTotal: 0, ataTotal: 0, materialTotal: 0, distance: 0, tripTotal: 0,
          subtotal: 78720, vat: 0, gross: 78720,
          rotBase: 0, rotBaseInclVat: 0, rotPercent: 0, rotDeduction: 0, rotClaimedDate: null,
          total: 78720, notes: '' },
        { id: 'i1', number: year + '-14', status: 'skickad', paidDate: null,
          createdAt: stamp(22),
          clientId: 'c1',
          clientSnapshot: { name: 'Familjen Åström', contact: 'Anna Åström', orgnr: '',
            phone: '070-987 65 43', address: 'Hagvägen 12', zip: '722 44', city: 'Västerås',
            email: 'anna@example.se', vatnr: '', rotPersonnr: '',
            rotProperty: 'Ekbacken 2:14', rotApartment: '' },
          companySnapshot: company,
          issueDate: iso(22), dueDate: iso(-8),
          entryIds: ['e10', 'e11'], materialIds: ['m10'], tripIds: [], projectIds: [],
          lines: [
            { date: iso(26), description: 'Rivning av gammalt staket',
              qty: 6, unit: 'h', rate: 750, amount: 4500, kind: 'time', labour: 4500 },
            { date: iso(26), description: 'Staketvirke och beslag',
              qty: 1, unit: 'st', rate: 4200, amount: 4200, kind: 'material', labour: 0 },
            { date: iso(25), description: 'Montering staket och grind',
              qty: 8, unit: 'h', rate: 750, amount: 6000, kind: 'time', labour: 6000 }
          ],
          mode: 'detailed', vatRate: 25, billingMode: 'rot',
          hours: 14, fixedTotal: 0, ataTotal: 0, materialTotal: 4200, distance: 0, tripTotal: 0,
          subtotal: 14700, vat: 3675, gross: 18375,
          rotBase: 10500, rotBaseInclVat: 13125, rotPercent: 30, rotDeduction: 3937.5,
          rotClaimedDate: null, total: 14437.5, notes: '' }
      ],
      expenses: [
        { id: 'x1', date: iso(18), description: 'Drivmedel', gross: 920, vat: 184,
          photoId: '', createdAt: stamp(18) },
        { id: 'x2', date: iso(11), description: 'Sågklingor och bits', gross: 645, vat: 129,
          photoId: '', createdAt: stamp(11) }
      ]
    };
  }

  global.TimstockDemo = { active: active, data: data };
})(window);

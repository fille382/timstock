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
        invoicePrefix: '',
        nextInvoiceNumber: 1
      },
      clients: [],
      projects: [],
      entries: [],
      invoices: []
    };
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
    d.invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
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
    data.projects = data.projects.filter(function (p) { return p.id !== id; });
    save();
    return true;
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

  /* Timpris for en tidspost: projektets pris, annars kundens, annars standard. */
  function rateFor(clientId, projectId) {
    var p = projectId ? project(projectId) : null;
    if (p && p.rate !== null && p.rate !== undefined && p.rate !== '') return Number(p.rate);
    var c = client(clientId);
    if (c && c.rate !== null && c.rate !== undefined && c.rate !== '') return Number(c.rate);
    return Number(data.settings.defaultRate) || 0;
  }

  function vatRateFor(clientId) {
    var c = client(clientId);
    if (c && c.vatRate !== null && c.vatRate !== undefined && c.vatRate !== '') return Number(c.vatRate);
    return Number(data.settings.vatRate) || 0;
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
    // Mark tidsposterna som fakturerade
    (inv.entryIds || []).forEach(function (eid) {
      var e = entry(eid);
      if (e) e.invoiceId = inv.id;
    });
    save();
    return inv;
  }

  function setInvoiceStatus(id, status) {
    var inv = invoice(id);
    if (!inv) return;
    inv.status = status;
    inv.paidDate = status === 'betald' ? (inv.paidDate || todayISO()) : null;
    save();
  }

  /* Tar bort fakturan och frigor tidsposterna sa de kan faktureras igen. */
  function deleteInvoice(id) {
    data.entries.forEach(function (e) {
      if (e.invoiceId === id) e.invoiceId = null;
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
    rateFor: rateFor, vatRateFor: vatRateFor,
    invoices: invoices, invoice: invoice, createInvoice: createInvoice, peekInvoiceNumber: peekInvoiceNumber,
    setInvoiceStatus: setInvoiceStatus, deleteInvoice: deleteInvoice,
    company: company, settings: settings, saveCompany: saveCompany, saveSettings: saveSettings,
    exportJSON: exportJSON, importJSON: importJSON, resetAll: resetAll
  };
})(window);

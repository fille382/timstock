/* share.js - delade jobb: lat en kollega registrera tid, material och
   korningar pa ett av dina projekt fran sin egen telefon.

   Fortfarande ingen egen server. Jobbet blir en egen fil i agarens Google
   Drive som delas med kollegans Gmail-adress (skrivbehorighet). Bada
   parterna anvander samma inloggning som sakerhetskopian (drive.js).

   Behorigheten ar drive.file, sa appen ser bara filer den sjalv skapat
   eller som anvandaren uttryckligen valt at den. Kollegan maste darfor
   valja jobbfilen i Googles filvaljare (Picker) en gang nar hen gar med -
   det ar sa Google later en fil som nagon annan delat bli synlig for
   appen. Valjaren oppnas redan filtrerad till ratt fil.

   Filen ar en brevlada, inte en databas:

     job       Agarens uppgifter om jobbet (namn, kund, fastpris ja/nej).
               Skrivs bara av agaren.
     members   Inbjudna adresser. Skrivs bara av agaren.
     items     Kollegornas poster. Varje post har en forfattare och skrivs
               bara av den. En borttagen post blir en gravsten.

   Varje part laser filen, lagger in sina egna andringar och skriver
   tillbaka. Drive har ingen villkorad skrivning, sa tva som skriver
   samtidigt kan skriva over varandra - men alla har sin egen del kvar
   lokalt och lagger tillbaka den vid nasta synk. Filen lakar sig sjalv.

   Hos agaren blir kollegornas poster vanliga poster pa projektet (med
   o.shared satt) och faktureras som vanligt. Hos kollegan ligger jobbet
   under en egen kund och hals utanfor kollegans egna fakturor. */
(function (global) {
  'use strict';

  /* Utan Drive (demolaget) finns inga delade jobb. */
  if (!global.Drive) return;

  var S = global.Store, D = global.Drive;

  var API = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  var APP_TAG = 'timstock-delat-jobb';
  var STATE_KEY = 'timstock.share.v1';
  var PULL_EVERY = 5 * 60 * 1000;

  /* ---------- Synkstatus per enhet ----------

     Ligger utanfor sjalva datan, precis som Drive-synkens installningar:
     en tidsstampel som andras vid varje hamtning far inte trigga en ny
     sakerhetskopia varje gang. */

  function loadState() {
    try {
      var raw = JSON.parse(global.localStorage.getItem(STATE_KEY));
      if (raw && typeof raw === 'object') return raw;
    } catch (e) {}
    return {};
  }

  var st = loadState();

  function saveState() {
    try { global.localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  function jobSt(fileId) {
    if (!st[fileId]) st[fileId] = {};
    return st[fileId];
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* ---------- Vem ar jag ---------- */

  function identity() {
    var email = D.state().email || '';
    var name = String(S.settings().shareName || '').trim()
      || String(S.company().name || '').trim()
      || email.split('@')[0];
    return { email: email, name: name };
  }

  /* ---------- Drive-filen ---------- */

  function goneError() {
    var e = new Error('Kommer inte åt jobbfilen — ägaren kan ha slutat dela den');
    e.gone = true;
    return e;
  }

  /* 404 = filen finns inte (eller appen har inte fatt den). 403 ar oftast
     att behorigheten tagits bort - men kan ocksa vara Googles hastighets-
     sparr, och da ska vi bara forsoka igen senare. */
  function checkGone(res) {
    if (res.status === 404) throw goneError();
    if (res.status !== 403) return res;
    return res.json().catch(function () { return {}; }).then(function (j) {
      var errs = (j && j.error && j.error.errors) || [];
      var limited = errs.some(function (x) { return /RateLimit/i.test(x.reason || ''); });
      if (limited) throw new Error('Google Drive är upptaget — försöker igen senare');
      throw goneError();
    });
  }

  function readMeta(fileId) {
    return D.authFetch(API + '/' + fileId + '?fields=id,modifiedTime,trashed')
      .then(checkGone)
      .then(D.jsonOrThrow)
      .then(function (m) {
        if (m.trashed) throw goneError();
        return m;
      });
  }

  function normalizeDoc(doc) {
    if (!doc || typeof doc !== 'object' || doc.app !== APP_TAG) {
      throw new Error('Filen är inget delat Timstock-jobb');
    }
    doc.job = doc.job && typeof doc.job === 'object' ? doc.job : {};
    doc.members = Array.isArray(doc.members) ? doc.members : [];
    doc.items = Array.isArray(doc.items) ? doc.items : [];
    return doc;
  }

  function readDoc(fileId) {
    return D.authFetch(API + '/' + fileId + '?alt=media')
      .then(checkGone)
      .then(function (res) {
        if (!res.ok) return D.jsonOrThrow(res);
        return res.text();
      })
      .then(function (text) {
        var doc;
        try { doc = JSON.parse(text); } catch (e) {
          throw new Error('Jobbfilen i Drive går inte att läsa');
        }
        return normalizeDoc(doc);
      });
  }

  /* Skapar filen (utan fileId) eller skriver over den. */
  function upload(fileId, doc, name) {
    var boundary = 'timstock' + S.uid();
    var meta = fileId ? {} : { name: name, mimeType: 'application/json' };
    var body = '--' + boundary
      + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(meta)
      + '\r\n--' + boundary
      + '\r\nContent-Type: application/json\r\n\r\n'
      + JSON.stringify(doc)
      + '\r\n--' + boundary + '--';
    return D.authFetch((fileId ? UPLOAD_API + '/' + fileId : UPLOAD_API)
      + '?uploadType=multipart&fields=id,modifiedTime', {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    }).then(checkGone).then(D.jsonOrThrow);
  }

  /* ---------- Kvittofoton ----------

     Foljer med i filen som base64, precis som i sakerhetskopian. Ett
     nedskalat kvitto ar ett par hundra KB. */

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function storePhoto(id, dataURL) {
    return global.fetch(dataURL)
      .then(function (r) { return r.blob(); })
      .then(function (b) { return S.savePhoto(id, b); });
  }

  /* ---------- Poster <-> fil ---------- */

  var KINDS = [
    { kind: 'time', list: function (q) { return S.entries(q); } },
    { kind: 'material', list: function (q) { return S.materials(q); } },
    { kind: 'trip', list: function (q) { return S.trips(q); } }
  ];

  function stamp(o) { return o.updatedAt || o.createdAt || ''; }

  /* Det som skickas: bara det kollegan sjalv registrerat. Priset mot kunden
     ar agarens sak och finns inte i filen. */
  function toShared(kind, o, me) {
    var x = {
      id: o.id, kind: kind, author: me.email, authorName: me.name,
      createdAt: o.createdAt || '', updatedAt: stamp(o),
      date: o.date, ata: !!o.ata
    };
    if (kind === 'time') {
      x.hours = Number(o.hours) || 0;
      x.comment = o.comment || '';
    } else if (kind === 'material') {
      x.description = o.description || '';
      x.qty = Number(o.qty) || 0;
      x.unit = o.unit || 'st';
      x.cost = o.cost === '' || o.cost === null || o.cost === undefined ? '' : Number(o.cost);
      x.purchaseVat = o.purchaseVat === undefined ? '' : o.purchaseVat;
      x.photoId = o.photoId || '';
    } else {
      x.distance = Number(o.distance) || 0;
      x.from = o.from || '';
      x.to = o.to || '';
      x.purpose = o.purpose || '';
    }
    return x;
  }

  function mineOf(p, me) {
    var out = [];
    KINDS.forEach(function (k) {
      k.list({ projectId: p.id }).forEach(function (o) { out.push(toShared(k.kind, o, me)); });
    });
    return out;
  }

  /* Fingeravtryck av det kollegan har lokalt - skiljer det sig fran det
     som senast skickades finns det nagot osynkat. */
  function sigOf(p, me) {
    var ids = mineOf(p, me).map(function (x) { return x.id + '@' + x.updatedAt; }).sort();
    var gone = ((p.memberOf && p.memberOf.deleted) || []).slice().sort();
    return JSON.stringify([me.email, me.name, ids, gone]);
  }

  /* Kollegans egen post tillbaka fran filen - ny telefon, eller andrad pa
     en annan enhet. */
  function memberLocal(x, p, existing) {
    var o = { id: x.id, date: x.date, ata: !!x.ata, updatedAt: x.updatedAt };
    if (!existing) {
      o.clientId = p.clientId;
      o.projectId = p.id;
      o.invoiceId = null;
      o.createdAt = x.createdAt || x.updatedAt;
    }
    if (x.kind === 'time') {
      o.hours = Number(x.hours) || 0;
      o.comment = x.comment || '';
    } else if (x.kind === 'material') {
      o.description = x.description || '';
      o.qty = Number(x.qty) || 0;
      o.unit = x.unit || 'st';
      o.cost = x.cost;
      o.unitPrice = Number(x.cost) || 0;
      o.markup = '';
      o.purchaseVat = x.purchaseVat;
      o.photoId = x.photoId || '';
    } else {
      o.distance = Number(x.distance) || 0;
      o.from = x.from || '';
      o.to = x.to || '';
      o.purpose = x.purpose || '';
      if (!existing) {
        o.rate = Number(S.settings().mileageRate) || 0;
        o.fee = 0;
      }
    }
    return o;
  }

  /* Kollegans post hos agaren. Agaren satter priset: á-priset raknas fram
     ur inkopspriset med agarens paslag, milersattningen ar agarens. Det
     agaren sjalv andrat (á-pris, ersattning, flyttat projekt) ligger kvar
     nar kollegan andrar posten. */
  function ownerLocal(x, p, existing) {
    var s = S.settings();
    var o = {
      id: x.id, date: x.date, ata: !!x.ata,
      shared: {
        fileId: p.share.fileId, author: x.author || '', authorName: x.authorName || '',
        updatedAt: x.updatedAt || '', photoId: x.photoId || ''
      }
    };
    if (!existing) {
      o.clientId = p.clientId;
      o.projectId = p.id;
      o.invoiceId = null;
      o.createdAt = x.createdAt || x.updatedAt || new Date().toISOString();
      o.updatedAt = o.createdAt;
    }
    if (x.kind === 'time') {
      o.hours = Number(x.hours) || 0;
      o.comment = x.comment || '';
    } else if (x.kind === 'material') {
      o.description = x.description || '';
      o.qty = Number(x.qty) || 0;
      o.unit = x.unit || 'st';
      o.cost = x.cost;
      o.purchaseVat = x.purchaseVat;
      var markup = existing ? existing.markup : s.materialMarkup;
      if (!existing) o.markup = markup;
      if (!existing || Number(existing.cost) !== Number(x.cost)) {
        o.unitPrice = S.round2((Number(x.cost) || 0) * (1 + (Number(markup) || 0) / 100));
      }
    } else {
      o.distance = Number(x.distance) || 0;
      o.from = x.from || '';
      o.to = x.to || '';
      o.purpose = x.purpose || '';
      if (!existing) {
        o.rate = Number(s.mileageRate) || 0;
        o.fee = 0;
      }
    }
    return o;
  }

  var suspend = false; // sant medan vi sjalva sparar hamtade poster

  function apply(ops) {
    if (!ops.length) return false;
    suspend = true;
    try { return S.applyShared(ops); } finally { suspend = false; }
  }

  /* ---------- Agaren: hamta kollegornas poster ---------- */

  function client(p) { return S.client(p.clientId) || {}; }

  function jobMeta(p) {
    var me = identity();
    return {
      name: p.name, client: client(p).name || '', fixed: S.isFixedProject(p),
      owner: me.email, ownerName: S.company().name || me.name
    };
  }

  function memberEmails(p) {
    return ((p.share && p.share.members) || []).map(function (m) { return m.email; }).sort();
  }

  function metaSig(p) {
    return JSON.stringify([jobMeta(p), memberEmails(p)]);
  }

  function importForOwner(p, doc) {
    var dismissed = p.share.dismissed || [];
    var ops = [];
    var photos = [];

    doc.items.forEach(function (x) {
      if (!x || !x.id || !x.kind) return;
      if (dismissed.indexOf(x.id) !== -1) return;
      var existing = S.sharedItem(x.kind, x.id);
      if (existing && !existing.shared) return; // en egen post med samma id - rors inte
      if (x.deleted) {
        if (existing) ops.push({ kind: x.kind, op: 'remove', id: x.id });
        return;
      }
      if (existing && existing.invoiceId) return; // fakturerad - last
      if (existing && existing.shared.updatedAt === x.updatedAt
        && existing.shared.authorName === (x.authorName || '')) return;

      var o = ownerLocal(x, p, existing);
      if (x.kind === 'material') {
        var prev = existing ? existing.shared.photoId || '' : '';
        if ((x.photoId || '') !== prev) {
          /* Kollegan har bytt eller tagit bort kvittot. Ett foto agaren
             sjalv lagt pa posten ror vi inte. */
          var ownPhoto = existing && existing.photoId && existing.photoId !== prev;
          if (existing && prev && existing.photoId === prev) {
            S.deletePhoto(prev).catch(function () {});
          }
          if (!ownPhoto) o.photoId = x.photoId && x.photo ? x.photoId : '';
          if (!ownPhoto && x.photoId && x.photo) photos.push(storePhoto(x.photoId, x.photo));
        }
      }
      ops.push({ kind: x.kind, op: 'put', obj: o });
    });

    return Promise.all(photos).catch(function (err) {
      console.error('Kunde inte spara kvittofoto från delat jobb:', err);
    }).then(function () {
      apply(ops);
      return ops.length;
    });
  }

  function pullOwner(p, force) {
    var fileId = p.share.fileId;
    var js = jobSt(fileId);
    var wantMeta = metaSig(p);

    return readMeta(fileId).then(function (meta) {
      if (!force && meta.modifiedTime === js.remoteModified && js.metaSig === wantMeta) return 0;
      return readDoc(fileId).then(function (doc) {
        return importForOwner(p, doc).then(function (count) {
          var fresh = S.project(p.id) || p;
          var m = jobMeta(fresh);
          var emails = memberEmails(fresh);
          var same = JSON.stringify(doc.job) === JSON.stringify(m)
            && JSON.stringify(doc.members.slice().sort()) === JSON.stringify(emails);
          if (same) {
            js.remoteModified = meta.modifiedTime;
            js.metaSig = metaSig(fresh);
            return count;
          }
          doc.job = m;
          doc.members = emails;
          return upload(fileId, doc).then(function (r) {
            js.remoteModified = r.modifiedTime;
            js.metaSig = metaSig(fresh);
            return count;
          });
        });
      });
    });
  }

  /* ---------- Kollegan: skicka egna poster ---------- */

  function updateMemberMeta(p, doc) {
    var mj = p.memberOf;
    var j = doc.job;
    var name = j.name || p.name;
    if (name === p.name && !!j.fixed === !!mj.fixed
      && (j.ownerName || mj.ownerName) === mj.ownerName) return;
    S.setProjectShare(p.id, 'memberOf', Object.assign({}, mj, {
      fixed: !!j.fixed, ownerName: j.ownerName || mj.ownerName
    }));
    if (name !== p.name) {
      suspend = true;
      try { S.saveProject({ id: p.id, name: name }); } finally { suspend = false; }
    }
  }

  /* Egna poster som finns i filen men inte har, eller ar nyare dar. */
  function adoptOwn(p, doc, me) {
    var local = {};
    KINDS.forEach(function (k) {
      k.list({ projectId: p.id }).forEach(function (o) { local[o.id] = o; });
    });
    var deleted = p.memberOf.deleted || [];
    var ops = [];
    var photos = [];

    doc.items.forEach(function (x) {
      if (!x || x.author !== me.email || x.deleted || !x.kind) return;
      if (deleted.indexOf(x.id) !== -1) return;
      var o = local[x.id];
      if (!o && S.sharedItem(x.kind, x.id)) return; // flyttad till annat projekt
      if (o && stamp(o) >= (x.updatedAt || '')) return;
      if (x.kind === 'material' && x.photoId && x.photo && (!o || o.photoId !== x.photoId)) {
        photos.push(storePhoto(x.photoId, x.photo));
      }
      ops.push({ kind: x.kind, op: 'put', obj: memberLocal(x, p, o) });
    });

    return Promise.all(photos).catch(function () {}).then(function () { apply(ops); });
  }

  /* Lagger in kollegans poster och gravstenar i filen. Sant om nagot andrades. */
  function mergeMine(doc, p, me) {
    var at = {};
    doc.items.forEach(function (x, i) { if (x && x.id) at[x.id] = i; });
    var work = [];
    var changed = false;

    mineOf(p, me).forEach(function (m) {
      var i = at[m.id];
      var cur = i === undefined ? null : doc.items[i];
      if (cur && cur.author !== me.email) return; // nagon annans post
      if (cur && !cur.deleted && cur.updatedAt === m.updatedAt
        && cur.authorName === m.authorName) return;
      changed = true;

      var ready = Promise.resolve(m);
      if (m.kind === 'material' && m.photoId) {
        if (cur && cur.photoId === m.photoId && cur.photo) {
          m.photo = cur.photo;
        } else {
          ready = S.getPhoto(m.photoId).then(function (b) {
            return b ? blobToDataURL(b) : '';
          }).catch(function () { return ''; }).then(function (durl) {
            if (durl) m.photo = durl; else m.photoId = '';
            return m;
          });
        }
      }
      work.push(ready.then(function (full) {
        if (i === undefined) doc.items.push(full); else doc.items[i] = full;
      }));
    });

    /* Gravstenar bara for poster agaren kan ha sett. */
    (p.memberOf.deleted || []).forEach(function (id) {
      var i = at[id];
      if (i === undefined) return;
      var cur = doc.items[i];
      if (cur.author !== me.email || cur.deleted) return;
      changed = true;
      doc.items[i] = {
        id: id, kind: cur.kind, author: me.email, authorName: me.name,
        deleted: true, updatedAt: new Date().toISOString()
      };
    });

    return Promise.all(work).then(function () { return changed; });
  }

  function syncMember(p, force) {
    var fileId = p.memberOf.fileId;
    var js = jobSt(fileId);
    var me = identity();
    if (!me.email) return Promise.reject(new Error('Logga in med Google under Inställningar'));

    return readMeta(fileId).then(function (meta) {
      if (!force && meta.modifiedTime === js.remoteModified && sigOf(p, me) === js.sig) return;
      return readDoc(fileId).then(function (doc) {
        updateMemberMeta(p, doc);
        return adoptOwn(S.project(p.id), doc, me).then(function () {
          var fresh = S.project(p.id);
          return mergeMine(doc, fresh, me).then(function (changed) {
            var done = changed
              ? upload(fileId, doc).then(function (r) { js.remoteModified = r.modifiedTime; })
              : Promise.resolve().then(function () { js.remoteModified = meta.modifiedTime; });
            return done.then(function () { js.sig = sigOf(S.project(p.id), me); });
          });
        });
      });
    });
  }

  /* ---------- Korningen ---------- */

  var timer = null;
  var running = false;
  var again = false;
  var lastRun = 0;

  function jobs() {
    return S.sharedProjects().concat(S.memberProjects());
  }

  function fileOf(p) {
    if (p.share && p.share.fileId) return p.share.fileId;
    return p.memberOf ? p.memberOf.fileId : '';
  }

  function syncOne(projectId, force) {
    var p = S.project(projectId);
    if (!p) return Promise.resolve();
    var fileId = fileOf(p);
    if (!fileId) return Promise.resolve();
    var js = jobSt(fileId);
    if (js.gone && !force) return Promise.resolve();

    var work = p.share ? pullOwner(p, force) : syncMember(p, force);
    return work.then(function (count) {
      js.lastSync = new Date().toISOString();
      js.error = '';
      js.gone = false;
      saveState();
      return count || 0;
    }, function (err) {
      js.error = err && err.message ? err.message : 'Okänt fel';
      if (err && err.gone) js.gone = true;
      saveState();
      throw err;
    });
  }

  /* Synkar alla delade jobb, ett i taget. I bakgrunden bara medan
     inloggningen lever - en ny inloggningsruta ska bara oppnas av ett klick. */
  function run() {
    if (running) { again = true; return Promise.resolve(); }
    if (!jobs().length || !D.hasToken()) { emit(); return Promise.resolve(); }
    if (D.state().busy) { schedule(1500); return Promise.resolve(); }
    running = true;
    emit();
    var list = jobs().map(function (p) { return p.id; });
    return list.reduce(function (chain, id) {
      return chain.then(function () {
        return syncOne(id, false).catch(function () { /* felet visas pa jobbet */ });
      });
    }, Promise.resolve()).then(function () {
      running = false;
      lastRun = Date.now();
      emit();
      if (again) { again = false; schedule(1000); }
    });
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay === undefined ? 4000 : delay);
  }

  /* Ett klick pa "Synka nu" - far logga in och forsoker aven jobb som
     tappat kontakten. */
  function syncNow(projectId) {
    return D.ensureToken().then(function () {
      if (running) {
        return new Promise(function (resolve) { setTimeout(resolve, 1500); })
          .then(function () { return syncNow(projectId); });
      }
      running = true;
      emit();
      return syncOne(projectId, true).then(function (count) {
        running = false;
        emit();
        return count;
      }, function (err) {
        running = false;
        emit();
        throw err;
      });
    });
  }

  function pending(p) {
    if (!p || !p.memberOf) return false;
    return sigOf(p, identity()) !== jobSt(p.memberOf.fileId).sig;
  }

  function status(projectId) {
    var p = S.project(projectId);
    var fileId = p ? fileOf(p) : '';
    var js = fileId ? jobSt(fileId) : {};
    return {
      fileId: fileId,
      lastSync: js.lastSync || '',
      error: js.error || '',
      gone: !!js.gone,
      pending: pending(p),
      running: running,
      connected: D.hasToken(),
      email: D.state().email || '',
      apiKey: !!D.state().apiKey,
      configured: !!D.state().clientId
    };
  }

  /* ---------- Bjuda in (agaren) ---------- */

  function inviteLink(fileId) {
    var ds = D.state();
    var base = String(global.location.href).split(/[?#]/)[0];
    return base + '?jobb=' + encodeURIComponent(fileId)
      + '&cid=' + encodeURIComponent(ds.clientId)
      + (ds.apiKey ? '&key=' + encodeURIComponent(ds.apiKey) : '');
  }

  function fileName(p) {
    return 'Timstock-jobb · ' + (client(p).name || 'Kund') + ' · ' + p.name + '.json';
  }

  function ensureFile(projectId) {
    var p = S.project(projectId);
    if (p.share && p.share.fileId) return Promise.resolve(p.share.fileId);
    var doc = { app: APP_TAG, version: 1, job: jobMeta(p), members: [], items: [] };
    return upload(null, doc, fileName(p)).then(function (r) {
      S.setProjectShare(projectId, 'share', { fileId: r.id, members: [], dismissed: [] });
      var js = jobSt(r.id);
      js.remoteModified = r.modifiedTime;
      js.metaSig = metaSig(S.project(projectId));
      saveState();
      return r.id;
    });
  }

  function invite(projectId, email) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Promise.reject(new Error('Skriv en giltig e-postadress'));
    }
    if (email === String(D.state().email).toLowerCase()) {
      return Promise.reject(new Error('Det är ju du — bjud in en kollega'));
    }
    var p = S.project(projectId);
    if (!p) return Promise.reject(new Error('Projektet finns inte'));

    return D.ensureToken().then(function () {
      return ensureFile(projectId);
    }).then(function (fileId) {
      var msg = 'Du har bjudits in att registrera tid, material och körningar på jobbet "'
        + p.name + '" i Timstock. Öppna länken på telefonen och logga in med det här '
        + 'Google-kontot: ' + inviteLink(fileId);
      return D.authFetch(API + '/' + fileId + '/permissions?sendNotificationEmail=true'
        + '&emailMessage=' + encodeURIComponent(msg) + '&fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email })
      }).then(D.jsonOrThrow).then(function (perm) {
        var fresh = S.project(projectId);
        var share = Object.assign({}, fresh.share);
        share.members = (share.members || []).filter(function (m) { return m.email !== email; })
          .concat({ email: email, permissionId: perm.id, invitedAt: S.todayISO() });
        S.setProjectShare(projectId, 'share', share);
        schedule(500); // medlemslistan i filen
        return { fileId: fileId, link: inviteLink(fileId) };
      });
    });
  }

  function removeMember(projectId, email) {
    var p = S.project(projectId);
    var m = p && p.share ? (p.share.members || []).find(function (x) { return x.email === email; }) : null;
    if (!m) return Promise.resolve();
    return D.ensureToken().then(function () {
      if (!m.permissionId) return null;
      return D.authFetch(API + '/' + p.share.fileId + '/permissions/' + m.permissionId, {
        method: 'DELETE'
      }).then(function (res) {
        if (!res.ok && res.status !== 404) return D.jsonOrThrow(res);
        return null;
      });
    }).then(function () {
      var fresh = S.project(projectId);
      var share = Object.assign({}, fresh.share);
      share.members = (share.members || []).filter(function (x) { return x.email !== email; });
      S.setProjectShare(projectId, 'share', share);
      schedule(500);
    });
  }

  /* Hamtar det sista och lagger filen i papperskorgen - kollegorna kommer
     inte at den langre. Posterna som redan hamtats ligger kvar. */
  function stopSharing(projectId) {
    var p = S.project(projectId);
    if (!p || !p.share) return Promise.resolve();
    var fileId = p.share.fileId;
    return D.ensureToken().then(function () {
      return pullOwner(p, true).catch(function () {});
    }).then(function () {
      return D.authFetch(API + '/' + fileId + '?fields=id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
    }).then(function (res) {
      if (!res.ok && res.status !== 404) return D.jsonOrThrow(res);
      return null;
    }).then(function () {
      S.setProjectShare(projectId, 'share', null);
      delete st[fileId];
      saveState();
      emit();
    });
  }

  /* Hur manga poster varje kollega bidragit med, for listan hos agaren. */
  function contributions(projectId) {
    var out = {};
    KINDS.forEach(function (k) {
      k.list({ projectId: projectId }).forEach(function (o) {
        if (!o.shared || !o.shared.author) return;
        var a = out[o.shared.author] || (out[o.shared.author] = {
          name: o.shared.authorName || '', count: 0, hours: 0
        });
        a.count++;
        if (k.kind === 'time') a.hours += Number(o.hours) || 0;
        if (o.shared.authorName) a.name = o.shared.authorName;
      });
    });
    return out;
  }

  /* ---------- Ga med (kollegan) ---------- */

  var pickerPromise = null;

  function loadPicker() {
    if (global.google && global.google.picker) return Promise.resolve();
    if (pickerPromise) return pickerPromise;
    pickerPromise = new Promise(function (resolve, reject) {
      function fail() {
        pickerPromise = null;
        reject(new Error('Kunde inte ladda Googles filväljare — ingen anslutning?'));
      }
      function ready() {
        global.gapi.load('picker', { callback: resolve, onerror: fail });
      }
      if (global.gapi) { ready(); return; }
      var s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.onload = ready;
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return pickerPromise;
  }

  /* Googles filvaljare, filtrerad till jobbfilen. Nar den valts far appen
     se och skriva filen med drive.file-behorigheten. Projektnumret som
     valjaren vill ha ar forsta delen av klient-ID:t. */
  function pick(fileId) {
    var ds = D.state();
    return loadPicker().then(function () {
      return new Promise(function (resolve, reject) {
        var g = global.google.picker;
        var view = new g.DocsView(g.ViewId.DOCS).setMode(g.DocsViewMode.LIST);
        if (typeof view.setFileIds === 'function') view.setFileIds(fileId);
        else view.setOwnedByMe(false);

        var builder = new g.PickerBuilder()
          .setAppId(String(ds.clientId).split('-')[0])
          .setOAuthToken(D.accessToken())
          .addView(view)
          .enableFeature(g.Feature.NAV_HIDDEN)
          .setLocale('sv')
          .setTitle('Markera jobbfilen och tryck Välj')
          .setCallback(function (data) {
            var action = data[g.Response.ACTION];
            if (action === g.Action.PICKED) {
              var docs = data[g.Response.DOCUMENTS] || [];
              var ok = docs.some(function (d) { return d[g.Document.ID] === fileId; });
              if (ok) resolve();
              else reject(new Error('Fel fil vald — välj jobbfilen från inbjudan'));
            } else if (action === g.Action.CANCEL) {
              reject(new Error('Ingen fil vald — jobbet öppnades inte'));
            }
          });
        if (ds.apiKey) builder.setDeveloperKey(ds.apiKey);
        builder.build().setVisible(true);
      });
    });
  }

  function createMemberJob(fileId, doc) {
    var j = doc.job;
    var owner = j.owner || '';
    var ownerName = j.ownerName || owner;
    var clientName = j.client || ownerName || 'Delat jobb';

    var c = S.clients(true).find(function (x) {
      return x.memberOf && x.memberOf.owner === owner && x.name === clientName;
    });
    suspend = true;
    try {
      var clientId = c ? c.id : S.saveClient({
        name: clientName, memberOf: { owner: owner, ownerName: ownerName }
      });
      return S.saveProject({
        clientId: clientId, name: j.name || 'Delat jobb',
        memberOf: { fileId: fileId, owner: owner, ownerName: ownerName, fixed: !!j.fixed, deleted: [] }
      });
    } finally {
      suspend = false;
    }
  }

  function memberProjectFor(fileId) {
    return S.memberProjects().find(function (p) { return p.memberOf.fileId === fileId; }) || null;
  }

  /* Anropas fran ett klick: inloggningsrutan maste oppnas i klickets
     gest-kontext. Returnerar projektets id. */
  function join(fileId, name) {
    var own = S.sharedProjects().some(function (p) { return p.share.fileId === fileId; });
    if (own) return Promise.reject(new Error('Det här är ditt eget delade jobb'));

    var ds = D.state();
    var login = ds.connected && ds.email ? Promise.resolve() : D.connect();

    return login.then(function () {
      if (!D.state().email) throw new Error('Kunde inte se vilket Google-konto du loggade in med');
      return readDoc(fileId).catch(function (err) {
        if (!err.gone) throw err;
        return pick(fileId).then(function () { return readDoc(fileId); });
      });
    }).then(function (doc) {
      if (doc.job.owner && doc.job.owner === D.state().email) {
        throw new Error('Det här är ditt eget delade jobb');
      }
      if (name && name !== S.settings().shareName) S.saveSettings({ shareName: name });

      /* Jobbet kan redan finnas - aterhamtat ur sakerhetskopian, eller sa
         oppnas lanken en gang till. */
      var p = memberProjectFor(fileId);
      var pid = p ? p.id : createMemberJob(fileId, doc);
      var js = jobSt(fileId);
      js.gone = false;
      js.error = '';
      js.remoteModified = '';
      saveState();
      return syncOne(pid, true).catch(function () {}).then(function () {
        emit();
        return pid;
      });
    });
  }

  /* Lamna ett jobb: forsok fa ivag det sista forst. */
  function leave(projectId, skipSync) {
    var p = S.project(projectId);
    if (!p || !p.memberOf) return Promise.resolve();
    var fileId = p.memberOf.fileId;
    var first = skipSync || jobSt(fileId).gone || !pending(p)
      ? Promise.resolve()
      : D.ensureToken().then(function () { return syncOne(projectId, true); });
    return first.then(function () {
      S.removeMemberJob(projectId);
      delete st[fileId];
      saveState();
      emit();
    });
  }

  /* ---------- Uppstart och lyssnare ---------- */

  /* Agarens jobb behover skrivas nar namn, kund, fastpris eller
     medlemslistan andrats - kollegornas om de har nagot osynkat. */
  function ownerStale(p) {
    return metaSig(p) !== jobSt(p.share.fileId).metaSig;
  }

  S.onChange(function () {
    if (suspend) return;
    var dirty = S.memberProjects().some(pending) || S.sharedProjects().some(ownerStale);
    if (!dirty) return;
    if (D.hasToken()) {
      schedule();
    } else {
      D.renew().then(function () { schedule(0); }).catch(function () { emit(); });
    }
    emit();
  });

  /* Nar inloggningen kommer tillbaka (eller en ny gjorts) - synka. */
  var hadToken = D.hasToken();
  D.onChange(function () {
    var has = D.hasToken();
    if (has && !hadToken && jobs().length) schedule(500);
    hadToken = has;
  });

  global.addEventListener('online', function () {
    if (jobs().length && D.hasToken()) schedule(1000);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (jobs().length && D.hasToken() && Date.now() - lastRun > 60000) schedule(500);
  });

  /* Kollegornas poster droppar in medan appen ar oppen. */
  setInterval(function () {
    if (document.visibilityState === 'visible' && jobs().length && D.hasToken()) run();
  }, PULL_EVERY);

  setTimeout(function () {
    if (jobs().length && D.hasToken()) run();
  }, 3000);

  global.Share = {
    onChange: onChange, status: status, syncNow: syncNow,
    invite: invite, inviteLink: inviteLink, removeMember: removeMember,
    stopSharing: stopSharing, contributions: contributions,
    join: join, leave: leave, pending: pending, identity: identity
  };
})(window);

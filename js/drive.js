/* drive.js - Gmail-inloggning och sakerhetskopia i Google Drive.

   Ingen egen server: appen pratar direkt fran webblasaren med Googles
   inloggning (Google Identity Services) och Drive REST API. Behorigheten
   ar drive.file - appen ser bara filer den sjalv skapat, inget annat i
   anvandarens Drive.

   Synkmodellen ar en enda fil (timstock-backup.json) dar senaste
   skrivning vinner. Innan varje uppladdning jamfors filens modifiedTime
   i Drive med den vi sag vid forra synken; har en annan enhet skrivit
   daremellan stannar synken och anvandaren far valja version under
   Installningar. Drive sparar dessutom aldre versioner av filen i 30
   dagar - en extra livlina om nagot gar snett.

   Atkomsttoken fran Google galler ungefar en timme. Medan den lever
   synkas andringar tyst i bakgrunden; darefter forsoks EN tyst
   forlangning per session (i klickets gest-kontext, annars blockeras
   Googles ruta), och racker inte det visar Installningar att det behovs
   en ny inloggning. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;

  var CFG_KEY = 'timstock.drive.v1';
  var TOKEN_KEY = 'timstock.drive.token';

  /* Klistra garna in ditt klient-ID har, sa slipper du fylla i det under
     Installningar pa varje enhet. Hur det skapas star i README. */
  var DEFAULT_CLIENT_ID = '';

  var SCOPES = 'https://www.googleapis.com/auth/drive.file'
    + ' https://www.googleapis.com/auth/userinfo.email';
  var FILE_NAME = 'timstock-backup.json';
  var API = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

  /* ---------- Konfiguration och token ---------- */

  /* Synkinstallningarna ligger i en egen localStorage-nyckel, utanfor
     sjalva datan - de ar per enhet och ska inte folja med i en backup. */
  function loadCfg() {
    var c = {
      clientId: '', email: '', autoSync: true,
      fileId: '', lastSync: '', remoteModified: '', dirty: false
    };
    try {
      var raw = JSON.parse(global.localStorage.getItem(CFG_KEY));
      if (raw && typeof raw === 'object') Object.assign(c, raw);
    } catch (e) { /* trasig config - borja om fran standard */ }
    if (!c.clientId) c.clientId = DEFAULT_CLIENT_ID;
    return c;
  }

  var cfg = loadCfg();

  function saveCfg() {
    try { global.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function loadToken() {
    try {
      var t = JSON.parse(global.localStorage.getItem(TOKEN_KEY));
      if (t && t.value && Number(t.exp) > Date.now() + 60000) return t;
    } catch (e) {}
    return null;
  }

  var token = loadToken();

  function saveToken() {
    try { global.localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch (e) {}
  }

  function clearToken() {
    token = null;
    try { global.localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function validToken() {
    return !!(token && token.value && Number(token.exp) > Date.now() + 30000);
  }

  /* ---------- Tillstand ---------- */

  var syncing = false;
  var suspend = false;       // sant medan en hamtad backup importeras
  var silentTried = false;   // en tyst tokenforlangning per session
  var conflictMeta = null;   // Drive-filens metadata nar versionerna skiljer sig
  var conflictToasted = false;
  var lastError = '';
  var changeSeq = 0;         // raknas upp vid varje datandring
  var uploadTimer = null;

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  function state() {
    return {
      configured: !!cfg.clientId,
      clientId: cfg.clientId,
      email: cfg.email,
      connected: validToken(),
      autoSync: !!cfg.autoSync,
      lastSync: cfg.lastSync,
      dirty: !!cfg.dirty,
      conflict: !!conflictMeta,
      conflictTime: conflictMeta ? conflictMeta.modifiedTime : '',
      syncing: syncing,
      lastError: lastError
    };
  }

  /* ---------- Google-inloggningen ---------- */

  var gsiPromise = null;

  function loadGsi() {
    if (global.google && global.google.accounts) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        gsiPromise = null;
        reject(new Error('Kunde inte ladda Google-inloggningen — ingen anslutning?'));
      };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }

  function requestToken() {
    return loadGsi().then(function () {
      return new Promise(function (resolve, reject) {
        var tc = global.google.accounts.oauth2.initTokenClient({
          client_id: cfg.clientId,
          scope: SCOPES,
          callback: function (resp) {
            if (!resp || resp.error) {
              reject(new Error('Inloggningen nekades eller avbröts'));
              return;
            }
            token = {
              value: resp.access_token,
              exp: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000
            };
            saveToken();
            lastError = '';
            resolve();
          },
          error_callback: function (err) {
            var t = err && err.type;
            reject(new Error(t === 'popup_failed_to_open'
              ? 'Webbläsaren blockerade inloggningsrutan'
              : 'Inloggningsrutan stängdes'));
          }
        });
        var opts = { prompt: '' };
        if (cfg.email) opts.login_hint = cfg.email;
        tc.requestAccessToken(opts);
      });
    });
  }

  function ensureToken() {
    return validToken() ? Promise.resolve() : requestToken();
  }

  /* E-posten ar bara for "Ansluten som ..." - misslyckas anropet funkar allt anda. */
  function fetchEmail() {
    return driveFetch('https://www.googleapis.com/oauth2/v3/userinfo')
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (j) {
        if (j && j.email) { cfg.email = j.email; saveCfg(); }
      })
      .catch(function () {});
  }

  /* ---------- Drive-anrop ---------- */

  function driveFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { Authorization: 'Bearer ' + (token ? token.value : '') },
      opts.headers
    );
    return global.fetch(url, opts).then(function (res) {
      if (res.status === 401) {
        clearToken();
        var e = new Error('Google-inloggningen har gått ut — logga in igen under Inställningar');
        e.auth = true;
        throw e;
      }
      return res;
    }, function () {
      throw new Error('Kunde inte nå Google Drive — ingen anslutning?');
    });
  }

  function jsonOrThrow(res) {
    if (res.ok) return res.json();
    return res.json().catch(function () { return {}; }).then(function (j) {
      var msg = j && j.error && j.error.message ? j.error.message : ('HTTP ' + res.status);
      throw new Error('Google Drive: ' + msg);
    });
  }

  function searchRemote() {
    var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    return driveFetch(API + '?q=' + q
      + '&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1')
      .then(jsonOrThrow)
      .then(function (j) { return (j.files && j.files[0]) || null; });
  }

  function remoteMeta() {
    if (!cfg.fileId) return searchRemote();
    return driveFetch(API + '/' + cfg.fileId + '?fields=id,modifiedTime').then(function (res) {
      if (res.status === 404) {
        /* Filen har tagits bort eller flyttats i Drive - leta upp den igen. */
        cfg.fileId = '';
        saveCfg();
        return searchRemote();
      }
      return jsonOrThrow(res);
    });
  }

  function putFile(text) {
    var boundary = 'timstock' + S.uid();
    var body = '--' + boundary
      + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })
      + '\r\n--' + boundary
      + '\r\nContent-Type: application/json\r\n\r\n'
      + text
      + '\r\n--' + boundary + '--';
    var url = (cfg.fileId ? UPLOAD_API + '/' + cfg.fileId : UPLOAD_API)
      + '?uploadType=multipart&fields=id,modifiedTime';
    return driveFetch(url, {
      method: cfg.fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    }).then(function (res) {
      if (res.status === 404 && cfg.fileId) {
        /* Filen forsvann mellan kollen och skrivningen - skapa en ny. */
        cfg.fileId = '';
        cfg.remoteModified = '';
        saveCfg();
        return putFile(text);
      }
      return jsonOrThrow(res);
    });
  }

  function handleErr(err) {
    if (err && err.conflict) return;
    lastError = err && err.message ? err.message : 'Okänt fel';
  }

  /* ---------- Upp och ner ---------- */

  function doUpload(force) {
    if (syncing) return Promise.resolve();
    syncing = true;
    lastError = '';
    emit();
    var seqAtStart = changeSeq;

    var guard = force ? Promise.resolve() : remoteMeta().then(function (meta) {
      /* Strikt jamforelse: aven en fil vi aldrig sett (tom remoteModified)
         raknas som konflikt - skriv aldrig over nagot osett i tysthet. */
      if (meta && meta.modifiedTime !== cfg.remoteModified) {
        conflictMeta = meta;
        var e = new Error('Drive har nyare data — välj version under Inställningar');
        e.conflict = true;
        throw e;
      }
      if (meta) cfg.fileId = meta.id;
    });

    return guard
      .then(function () { return S.exportBackup(); })
      .then(putFile)
      .then(function (j) {
        cfg.fileId = j.id;
        cfg.remoteModified = j.modifiedTime;
        cfg.lastSync = new Date().toISOString();
        /* Hann nagot andras under uppladdningen ligger det kvar som osynkat. */
        if (changeSeq === seqAtStart) cfg.dirty = false;
        conflictMeta = null;
        conflictToasted = false;
        saveCfg();
        syncing = false;
        emit();
        if (cfg.dirty) scheduleUpload(1000);
      })
      .catch(function (err) {
        syncing = false;
        handleErr(err);
        emit();
        throw err;
      });
  }

  function doPull(meta) {
    syncing = true;
    lastError = '';
    emit();
    return driveFetch(API + '/' + meta.id + '?alt=media')
      .then(function (res) {
        if (!res.ok) return jsonOrThrow(res);
        return res.text();
      })
      .then(function (text) {
        /* importJSON sparar, vilket annars skulle flagga datan som andrad
           och ladda upp den igen direkt. */
        suspend = true;
        try {
          S.importJSON(text);
        } finally {
          suspend = false;
        }
        cfg.fileId = meta.id;
        cfg.remoteModified = meta.modifiedTime;
        cfg.lastSync = new Date().toISOString();
        cfg.dirty = false;
        conflictMeta = null;
        conflictToasted = false;
        saveCfg();
        syncing = false;
        emit();
      })
      .catch(function (err) {
        syncing = false;
        handleErr(err);
        emit();
        throw err;
      });
  }

  function localDataEmpty() {
    var d = S.raw();
    return !d.clients.length && !d.projects.length && !d.entries.length
      && !d.materials.length && !d.trips.length && !d.invoices.length
      && !d.expenses.length && !d.company.name;
  }

  /* Vad ska galla efter en inloggning eller vid appstart?

       Ingen fil i Drive          ->  ladda upp.
       Filen ar den vi sag sist   ->  ladda upp osynkade andringar, annars inget.
       Filen ar nyare, har tomt   ->  hamta (ny enhet).
       Filen ar nyare, inget      ->  hamta (en annan enhet har sparat).
         osynkat har
       Bada har andrats           ->  stanna och lat anvandaren valja.        */
  function reconcile() {
    return remoteMeta().then(function (meta) {
      if (!meta) {
        return doUpload(true).then(function () {
          U.toast('Säkerhetskopia sparad i Google Drive');
        });
      }
      cfg.fileId = meta.id;
      if (meta.modifiedTime === cfg.remoteModified) {
        saveCfg();
        if (cfg.dirty) return doUpload(true);
        emit();
        return undefined;
      }
      if (localDataEmpty() || (cfg.remoteModified && !cfg.dirty)) {
        return doPull(meta).then(function () {
          U.toast('Säkerhetskopia hämtad från Google Drive');
          if (global.App) global.App.refresh();
        });
      }
      conflictMeta = meta;
      emit();
      return undefined;
    });
  }

  /* ---------- Automatisk synk ---------- */

  function scheduleUpload(delay) {
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () {
      if (!cfg.dirty || conflictMeta) return;
      if (syncing) { scheduleUpload(2000); return; }
      if (!validToken()) { emit(); return; }
      doUpload(false).catch(function (err) {
        if (err && err.conflict && !conflictToasted) {
          conflictToasted = true;
          U.toast(err.message, true);
        }
        /* Ovriga fel visas under Installningar; nytt forsok gors vid nasta
           andring eller nar natet kommer tillbaka. */
      });
    }, delay === undefined ? 4000 : delay);
  }

  function onStoreChange() {
    if (suspend) return;
    changeSeq++;
    cfg.dirty = true;
    saveCfg();
    if (!cfg.autoSync || !cfg.clientId || !cfg.email || conflictMeta) { emit(); return; }
    if (validToken()) {
      scheduleUpload();
    } else if (!silentTried) {
      /* Anropet ligger kvar i klickets gest-kontext (andringen kom fran en
         knapp), sa Googles ruta far oppnas - den blinkar bara forbi nar
         kontot redan gett sitt godkannande. */
      silentTried = true;
      requestToken()
        .then(function () { return fetchEmail(); })
        .then(function () { scheduleUpload(0); })
        .catch(function () { emit(); });
    }
    emit();
  }

  function startupSync() {
    if (syncing || conflictMeta) return;
    reconcile().then(function () {
      if (conflictMeta && !conflictToasted) {
        conflictToasted = true;
        U.toast('Drive har nyare data — välj version under Inställningar', true);
      }
    }).catch(function () { /* offline etc - nytt forsok vid nasta andring */ });
  }

  /* ---------- Publikt ---------- */

  function connect() {
    if (!cfg.clientId) return Promise.reject(new Error('Fyll i klient-ID först'));
    silentTried = false;
    return requestToken().then(fetchEmail).then(reconcile);
  }

  function disconnect() {
    if (token && global.google && global.google.accounts && global.google.accounts.oauth2) {
      try { global.google.accounts.oauth2.revoke(token.value, function () {}); } catch (e) {}
    }
    clearTimeout(uploadTimer);
    clearToken();
    cfg.email = '';
    conflictMeta = null;
    lastError = '';
    saveCfg();
    emit();
  }

  function push() {
    return ensureToken().then(function () { return doUpload(false); });
  }

  function forcePush() {
    return ensureToken().then(function () { return doUpload(true); });
  }

  function pull() {
    return ensureToken().then(remoteMeta).then(function (meta) {
      if (!meta) throw new Error('Det finns ingen säkerhetskopia i Drive ännu');
      return doPull(meta);
    });
  }

  function setClientId(id) {
    id = String(id || '').trim();
    if (id !== cfg.clientId) {
      /* Nytt klient-ID = ny app i Googles ogon: gamla filen syns inte langre. */
      cfg.clientId = id;
      cfg.email = '';
      cfg.fileId = '';
      cfg.remoteModified = '';
      conflictMeta = null;
      lastError = '';
      clearToken();
      saveCfg();
    }
    emit();
  }

  function setAutoSync(on) {
    cfg.autoSync = !!on;
    saveCfg();
    emit();
    if (cfg.autoSync && cfg.dirty && validToken()) scheduleUpload(0);
  }

  /* Efter "Radera all data": stang av autosynken sa att den tomma appen
     inte skriver over kopian i Drive - den ar kvar som livlina. */
  function afterReset() {
    clearTimeout(uploadTimer);
    cfg.dirty = false;
    conflictMeta = null;
    if (cfg.clientId) cfg.autoSync = false;
    saveCfg();
    emit();
  }

  /* ---------- Uppstart ---------- */

  S.onChange(onStoreChange);

  global.addEventListener('online', function () {
    if (cfg.dirty && cfg.autoSync && cfg.clientId && validToken()) scheduleUpload(1000);
  });

  if (cfg.clientId) {
    /* Forladda inloggningsskriptet sa att Anslut-knappen kan oppna rutan
       direkt i klicket - laddas det forst da hinner gest-kontexten ga ut
       och rutan blockeras. */
    setTimeout(function () { loadGsi().catch(function () {}); }, 1500);
  }

  if (cfg.clientId && cfg.email && cfg.autoSync && validToken()) {
    /* Token lever fortfarande (sidan laddades om inom timmen) - kolla om
       en annan enhet har sparat under tiden. */
    setTimeout(startupSync, 2500);
  }

  global.Drive = {
    state: state, onChange: onChange,
    connect: connect, disconnect: disconnect,
    push: push, forcePush: forcePush, pull: pull,
    setClientId: setClientId, setAutoSync: setAutoSync, afterReset: afterReset
  };
})(window);

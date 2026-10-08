/* view-clients.js - kunder och deras projekt. */
(function (global) {
  'use strict';

  var S = global.Store, U = global.UI;
  var container = null;
  var showArchived = false;

  function unbilledFor(clientId) {
    var q = { clientId: clientId, status: 'unbilled' };
    var list = S.entries(q);
    var mats = S.materials(q);
    var trips = S.trips(q);
    var fixedJobs = S.openFixedProjects(clientId);

    return {
      hours: list.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0),
      amount: list.reduce(function (s, e) { return s + S.billableEntry(e); }, 0)
        + mats.reduce(function (s, m) { return s + S.billableMaterial(m); }, 0)
        + trips.reduce(function (s, t) { return s + S.billableTrip(t); }, 0)
        + fixedJobs.reduce(function (s, p) { return s + S.fixedPriceOf(p); }, 0),
      materialCount: mats.length,
      fixedCount: fixedJobs.length
    };
  }

  /* Kunder som bara finns for att nagon annan delat ett jobb med dig visas
     inte bland dina egna - jobben listas for sig langre ner. */
  function ownClients(includeArchived) {
    return S.clients(includeArchived).filter(function (c) { return !c.memberOf; });
  }

  function render(el) {
    container = el;
    var clients = ownClients(showArchived);
    var memberJobs = S.memberProjects();

    var html = '<button class="btn btn-primary btn-block" data-new-client style="margin-bottom:16px">'
      + '+ Ny kund</button>';

    if (!clients.length && memberJobs.length) {
      html += '<div class="empty small">Inga egna kunder ännu.</div>';
    } else if (!clients.length) {
      html += '<div class="empty">Inga kunder ännu.<br>Lägg till din första kund för att komma igång.</div>';
    } else {
      html += '<div class="list">' + clients.map(clientItem).join('') + '</div>';
    }

    var archivedCount = ownClients(true).filter(function (c) { return c.archived; }).length;
    if (archivedCount) {
      html += '<button class="btn btn-ghost btn-block small" data-toggle-archived style="margin-top:14px">'
        + (showArchived ? 'Dölj arkiverade' : 'Visa arkiverade (' + archivedCount + ')') + '</button>';
    }

    if (memberJobs.length) {
      html += '<div class="section-title">Jobb delade med dig</div>'
        + '<div class="list">' + memberJobs.map(memberJobItem).join('') + '</div>';
    }

    if (global.Share) {
      html += '<button class="btn btn-ghost btn-block small" data-join-paste style="margin-top:14px">'
        + 'Fått en inbjudan till ett jobb? Klistra in länken</button>';
    }

    el.innerHTML = html;
    wire(el);
  }

  /* ---------- Delade jobb: kollegans sida ---------- */

  function memberJobItem(p) {
    var mj = p.memberOf;
    var c = S.client(p.clientId);
    var st = global.Share ? global.Share.status(p.id) : null;
    var badge = '';
    if (st && st.gone) badge = '<span class="badge badge-danger">Inte längre delat</span>';
    else if (st && st.error) badge = '<span class="badge badge-warn">Synkfel</span>';
    else if (st && st.pending) badge = '<span class="badge badge-warn">Osynkat</span>';
    else if (st && st.lastSync) badge = '<span class="badge badge-ok">Synkat</span>';

    var hours = S.entries({ projectId: p.id })
      .reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);

    return '<button class="item" type="button" data-member-job="' + U.esc(p.id) + '">'
      + '<div class="item-top"><span class="item-title">' + U.esc(p.name)
      + ' <span class="badge badge-shared">Delat</span></span>'
      + '<span class="item-amount small">' + U.hours(hours) + '</span></div>'
      + '<div class="item-sub">'
      + (c ? '<span>' + U.esc(c.name) + '</span><span class="dot">•</span>' : '')
      + '<span>från ' + U.esc(mj.ownerName || mj.owner) + '</span>'
      + badge
      + '</div></button>';
  }

  /* "2026-08-23T14:32:05.000Z" -> "2026-08-23 15:32" (lokal tid) */
  function syncTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return U.toISO(d) + ' ' + String(d.getHours()).padStart(2, '0')
      + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function shareErr(err) {
    U.toast(err && err.message ? err.message : 'Något gick fel mot Google Drive', true);
  }

  function memberJobBody(p) {
    var mj = p.memberOf;
    var st = global.Share.status(p.id);
    var q = { projectId: p.id };
    var hours = S.entries(q).reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
    var mats = S.materials(q).length;
    var trips = S.trips(q).length;

    var html = '<div class="notice notice-info" style="margin:0 0 14px">Delat av <b>'
      + U.esc(mj.ownerName || mj.owner) + '</b>' + (mj.ownerName && mj.owner ? ' (' + U.esc(mj.owner) + ')' : '')
      + '. Det du registrerar på jobbet skickas till ägaren och faktureras av ägaren — '
      + 'inte av dig. Välj jobbet som kund och projekt i tidrapporten.</div>';

    html += '<div class="totals" style="margin-bottom:12px">'
      + '<div class="totals-row"><span class="muted">Dina timmar</span><span>' + U.hours(hours) + '</span></div>'
      + (mats ? '<div class="totals-row"><span class="muted">Materialposter</span><span>' + mats + '</span></div>' : '')
      + (trips ? '<div class="totals-row"><span class="muted">Körningar</span><span>' + trips + '</span></div>' : '')
      + (mj.fixed ? '<div class="totals-row"><span class="muted">Fast pris</span><span>Ja — '
        + 'markera tilläggsarbeten som ÄTA</span></div>' : '')
      + '<div class="totals-row"><span class="muted">Senast synkad</span><span>'
      + U.esc(st.lastSync ? syncTime(st.lastSync) : 'Aldrig') + '</span></div>'
      + (st.pending && !st.gone
        ? '<div class="totals-row"><span class="muted">Sedan dess</span><span>Osynkade ändringar</span></div>'
        : '')
      + '</div>';

    if (st.gone) {
      html += '<p class="small warn-text" style="margin:-4px 0 12px">Appen kommer inte åt jobbfilen. '
        + 'Ägaren kan ha slutat dela jobbet eller tagit bort dig — eller så behöver filen väljas '
        + 'igen i Googles filväljare.</p>';
    } else if (st.error) {
      html += '<p class="small warn-text" style="margin:-4px 0 12px">' + U.esc(st.error) + '</p>';
    } else if (!st.connected && st.pending) {
      html += '<p class="small muted" style="margin:-4px 0 12px">Google-inloggningen har gått ut. '
        + 'Tryck Synka nu så skickas ändringarna.</p>';
    }

    html += '<div class="field"><label for="mj-name">Ditt namn (som ägaren ser)</label>'
      + '<input type="text" id="mj-name" value="' + U.esc(global.Share.identity().name) + '"></div>'
      + '<button class="btn btn-block" data-mj-name>Spara namn</button>';

    html += '<button class="btn btn-primary btn-block" data-mj-sync style="margin-top:10px">'
      + (st.gone ? 'Öppna jobbfilen igen' : 'Synka nu') + '</button>'
      + '<button class="btn btn-danger btn-block" data-mj-leave style="margin-top:10px">Lämna jobbet</button>'
      + '<p class="small muted" style="margin-top:8px">Lämnar du jobbet tas det och dina poster '
      + 'på det bort här. Det du redan synkat finns kvar hos ägaren.</p>';
    return html;
  }

  function openMemberJob(projectId) {
    var p = S.project(projectId);
    if (!p || !p.memberOf || !global.Share) return;

    U.openSheet(p.name, '<div id="mj-box" data-project="' + U.esc(p.id) + '">'
      + memberJobBody(p) + '</div>', function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-mj-name]')) {
          var name = body.querySelector('#mj-name').value.trim();
          S.saveSettings({ shareName: name });
          U.toast('Namnet sparat');
          refreshMemberBox();
          return;
        }
        if (ev.target.closest('[data-mj-sync]')) {
          var wasGone = global.Share.status(p.id).gone;
          var work = wasGone
            ? global.Share.join(p.memberOf.fileId, '')
            : global.Share.syncNow(p.id);
          work.then(function () {
            U.toast('Jobbet är synkat');
            refreshMemberBox();
            if (container) render(container);
          }).catch(function (err) {
            shareErr(err);
            refreshMemberBox();
          });
          return;
        }
        if (ev.target.closest('[data-mj-leave]')) {
          if (!confirm('Lämna jobbet ' + p.name + '? Dina poster på jobbet tas bort här '
            + '(det som redan synkats finns kvar hos ägaren).')) return;
          global.Share.leave(p.id).catch(function (err) {
            if (!confirm('Kunde inte synka det sista (' + (err && err.message ? err.message : 'okänt fel')
              + '). Lämna ändå? Osynkade poster går förlorade.')) return Promise.reject(null);
            return global.Share.leave(p.id, true);
          }).then(function () {
            U.closeSheet();
            U.toast('Du har lämnat jobbet');
            if (container) render(container);
          }).catch(function (err) { if (err) shareErr(err); });
        }
      });
    });
  }

  function refreshMemberBox() {
    var box = document.getElementById('mj-box');
    if (!box) return;
    var p = S.project(box.getAttribute('data-project'));
    if (!p || !p.memberOf) return;
    if (document.activeElement && document.activeElement.id === 'mj-name') return;
    box.innerHTML = memberJobBody(p);
  }

  /* ---------- Gå med i ett delat jobb ---------- */

  /* Inbjudningslänken öppnas oftast i webbläsaren. Har du appen på
     hemskärmen (särskilt på iPhone, där den har egen lagring) kan länken
     klistras in här i stället. */
  function openPasteInvite() {
    var html = '<div class="field"><label for="jn-link">Länken från inbjudan</label>'
      + '<input type="url" id="jn-link" autocapitalize="off" spellcheck="false" '
      + 'placeholder="https://…?jobb=…"></div>'
      + '<button class="btn btn-primary btn-block" data-join-next>Fortsätt</button>';

    U.openSheet('Gå med i delat jobb', html, function (body) {
      body.addEventListener('click', function (ev) {
        if (!ev.target.closest('[data-join-next]')) return;
        var q;
        try {
          q = new URL(body.querySelector('#jn-link').value.trim()).searchParams;
        } catch (e) { q = null; }
        if (!q || !q.get('jobb')) {
          U.toast('Det där ser inte ut som en inbjudningslänk', true);
          return;
        }
        openJoin({ fileId: q.get('jobb'), clientId: q.get('cid') || '', apiKey: q.get('key') || '' });
      });
    });
  }

  /* Öppnas av app.js när appen startas från en inbjudningslänk
     (?jobb=<fil>&cid=<klient-ID>&key=<API-nyckel>). */
  function openJoin(params) {
    var D = global.Drive;
    if (!global.Share || !D || !params.fileId) return;

    /* Inbjudan bär med sig ägarens klient-ID och API-nyckel, så att den som
       aldrig rört Google Cloud bara behöver logga in. Har du ett eget
       klient-ID gäller det. */
    var ds = D.state();
    if (!ds.clientId && params.clientId) {
      D.setClientId(params.clientId, params.apiKey || '');
    } else if (ds.clientId === params.clientId && !ds.apiKey && params.apiKey) {
      D.setClientId(ds.clientId, params.apiKey);
    }
    ds = D.state();
    if (ds.clientId) D.loadGsi().catch(function () {});

    var existing = S.memberProjects().find(function (p) {
      return p.memberOf.fileId === params.fileId;
    });
    var name = S.settings().shareName || S.company().name || '';

    var html = '<p style="margin:0 0 12px">Du har bjudits in att registrera tid, material och '
      + 'körningar på ett jobb i Timstock. Det du lägger in hamnar direkt hos den som bjöd in '
      + 'dig, som fakturerar kunden.</p>'
      + '<p class="small muted" style="margin:0 0 14px">Logga in med Google-kontot (Gmail) som '
      + 'inbjudan skickades till. Google visar sedan jobbfilen — markera den och tryck '
      + '<b>Välj</b>. Appen ser bara jobbfilen och sina egna filer, inget annat i din Drive.</p>';

    if (existing) {
      html += '<div class="notice notice-ok" style="margin:0 0 14px">Du är redan med i jobbet <b>'
        + U.esc(existing.name) + '</b>.</div>';
    }

    if (!ds.clientId) {
      html += '<div class="notice notice-warn" style="margin:0 0 14px">Länken saknar klient-ID. '
        + 'Be den som bjöd in dig att skicka länken igen från appen, eller fyll i klient-ID under '
        + 'Inställningar → Google Drive.</div>';
    }

    html += '<div class="field"><label for="jn-name">Ditt namn (som syns för den som bjöd in dig)</label>'
      + '<input type="text" id="jn-name" autocomplete="name" value="' + U.esc(name) + '"></div>'
      + '<button class="btn btn-primary btn-block" data-join' + (ds.clientId ? '' : ' disabled') + '>'
      + (existing ? 'Synka jobbet' : 'Logga in och gå med') + '</button>';

    U.openSheet('Gå med i delat jobb', html, function (body) {
      body.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-join]');
        if (!btn) return;
        btn.disabled = true;
        global.Share.join(params.fileId, body.querySelector('#jn-name').value.trim())
          .then(function (pid) {
            var p = S.project(pid);
            U.closeSheet();
            U.toast('Du är med i jobbet ' + (p ? p.name : ''));
            global.App.go('time');
            global.App.refresh();
          })
          .catch(function (err) {
            btn.disabled = false;
            shareErr(err);
          });
      });
    });
  }

  function clientItem(c) {
    var u = unbilledFor(c.id);
    var projs = S.projects(c.id);
    return '<button class="item" type="button" data-client="' + U.esc(c.id) + '">'
      + '<div class="item-top">'
      + '<span class="item-title">' + U.esc(c.name) + modeBadge(c)
      + (c.archived ? ' <span class="badge badge-muted">Arkiverad</span>' : '') + '</span>'
      + '<span class="item-amount">' + U.money0(S.rateFor(c.id, null)) + '/h</span>'
      + '</div>'
      + '<div class="item-sub">'
      + (c.phone ? '<span>' + U.esc(c.phone) + '</span><span class="dot">•</span>' : '')
      + (projs.length ? '<span>' + projs.length + ' projekt</span><span class="dot">•</span>' : '')
      + (u.amount > 0
        ? '<span class="badge badge-accent">Ofakturerat ' + U.money0(u.amount)
          + (u.hours > 0 ? ' · ' + U.hours(u.hours) : '')
          + (u.materialCount ? ' · ' + u.materialCount + ' material' : '')
          + (u.fixedCount ? ' · ' + u.fixedCount + ' fastpris' : '') + '</span>'
        : '<span>Inget ofakturerat</span>')
      + '</div>'
      + '</button>';
  }

  function modeBadge(c) {
    var mode = S.billingModeFor(c.id);
    if (mode === 'reverse') return ' <span class="badge badge-reverse">Omvänd moms</span>';
    if (mode === 'rot') return ' <span class="badge badge-rot">ROT</span>';
    return '';
  }

  /* ---------- Kundformulär ---------- */

  function openClient(id) {
    var c = id ? S.client(id) : null;
    var s = S.settings();
    var projs = id ? S.projects(id, true) : [];

    var html = '';

    html += '<div class="field"><label for="c-name">Kundnamn *</label>'
      + '<input type="text" id="c-name" value="' + U.esc(c ? c.name : '') + '" placeholder="Företagets namn"></div>';

    if (c && c.phone) {
      html += '<a class="btn btn-block" href="tel:' + U.esc(String(c.phone).replace(/\s/g, ''))
        + '" style="margin-bottom:14px">Ring ' + U.esc(c.contact || c.name) + '</a>';
    }

    html += '<div class="field"><label for="c-contact">Kontaktperson</label>'
      + '<input type="text" id="c-contact" value="' + U.esc(c ? c.contact : '') + '"></div>';

    html += '<div class="field"><label for="c-phone">Telefon</label>'
      + '<input type="tel" id="c-phone" inputmode="tel" autocomplete="tel" value="'
      + U.esc(c ? c.phone : '') + '"></div>';

    html += '<div class="row"><div class="field"><label for="c-rate">Timpris (kr)</label>'
      + '<input type="number" id="c-rate" inputmode="decimal" step="1" min="0" value="'
      + U.esc(c && c.rate !== '' && c.rate !== null && c.rate !== undefined ? c.rate : '')
      + '" placeholder="' + U.esc(s.defaultRate) + '"></div>'
      + '<div class="field"><label for="c-vat">Moms (%)</label>'
      + '<input type="number" id="c-vat" inputmode="decimal" step="1" min="0" max="100" value="'
      + U.esc(c && c.vatRate !== '' && c.vatRate !== null && c.vatRate !== undefined ? c.vatRate : '')
      + '" placeholder="' + U.esc(s.vatRate) + '"></div></div>';

    var mode = S.billingModeFor(c ? c.id : null);

    html += '<div class="field"><label for="c-mode">Fakturering</label>'
      + '<select id="c-mode">'
      + '<option value="normal"' + (mode === 'normal' ? ' selected' : '') + '>Företag – vanlig moms</option>'
      + '<option value="reverse"' + (mode === 'reverse' ? ' selected' : '') + '>Byggföretag – omvänd byggmoms</option>'
      + '<option value="rot"' + (mode === 'rot' ? ' selected' : '') + '>Privatperson – ROT-avdrag</option>'
      + '</select>'
      + '<p class="small muted" id="c-mode-help" style="margin:6px 0 0">' + modeHelp(mode) + '</p></div>';

    html += '<div class="field"><label for="c-orgnr">Organisationsnummer</label>'
      + '<input type="text" id="c-orgnr" value="' + U.esc(c ? c.orgnr : '') + '"></div>';

    html += '<div id="c-reverse-fields"' + (mode === 'reverse' ? '' : ' hidden') + '>'
      + '<div class="field"><label for="c-vatnr">Kundens momsregistreringsnummer</label>'
      + '<input type="text" id="c-vatnr" autocapitalize="characters" value="'
      + U.esc(c ? c.vatnr : '') + '" placeholder="SE556677889901">'
      + '<p class="small muted" style="margin:6px 0 0">Måste stå på fakturan vid omvänd '
      + 'byggmoms. Kontrollera att kunden verkligen säljer byggtjänster — annars ska du '
      + 'fakturera med moms som vanligt.</p></div></div>';

    html += '<div id="c-rot-fields"' + (mode === 'rot' ? '' : ' hidden') + '>'
      + '<div class="field"><label for="c-rot-personnr">Personnummer</label>'
      + '<input type="text" id="c-rot-personnr" inputmode="numeric" value="'
      + U.esc(c ? c.rotPersonnr : '') + '" placeholder="ÅÅÅÅMMDD-XXXX">'
      + '<p class="small muted" style="margin:6px 0 0">Behövs när du begär utbetalningen '
      + 'från Skatteverket. Skrivs inte ut på fakturan.</p></div>'
      + '<div class="row">'
      + '<div class="field"><label for="c-rot-property">Fastighetsbeteckning</label>'
      + '<input type="text" id="c-rot-property" value="' + U.esc(c ? c.rotProperty : '') + '"></div>'
      + '<div class="field" style="flex:0 0 38%"><label for="c-rot-apartment">Lägenhetsnr</label>'
      + '<input type="text" id="c-rot-apartment" inputmode="numeric" value="'
      + U.esc(c ? c.rotApartment : '') + '"></div></div>'
      + '<p class="small muted" style="margin:-6px 0 12px">Fastighetsbeteckning för villa, '
      + 'lägenhetsnummer och föreningens org.nr för bostadsrätt.</p>'
      + rotCeilingField(c, s) + '</div>';

    html += '<div class="field"><label for="c-address">Adress</label>'
      + '<input type="text" id="c-address" value="' + U.esc(c ? c.address : '') + '"></div>';

    html += '<div class="row"><div class="field" style="flex:0 0 38%"><label for="c-zip">Postnr</label>'
      + '<input type="text" id="c-zip" inputmode="numeric" value="' + U.esc(c ? c.zip : '') + '"></div>'
      + '<div class="field"><label for="c-city">Ort</label>'
      + '<input type="text" id="c-city" value="' + U.esc(c ? c.city : '') + '"></div></div>';

    html += '<div class="field"><label for="c-email">E-post (fakturamottagare)</label>'
      + '<input type="email" id="c-email" autocapitalize="off" value="' + U.esc(c ? c.email : '') + '"></div>';

    html += '<button class="btn btn-primary btn-block" data-save-client>'
      + (c ? 'Spara kund' : 'Lägg till kund') + '</button>';

    if (c) {
      html += '<div class="section-title">Projekt</div>';
      html += projs.length
        ? '<div class="list">' + projs.map(projectItem).join('') + '</div>'
        : '<div class="empty small">Inga projekt. Projekt är valfritt — du kan rapportera tid direkt på kunden.</div>';
      html += '<button class="btn btn-block" data-new-project style="margin-top:10px">+ Nytt projekt</button>';

      html += '<div class="section-title">Hantera</div>';
      html += '<button class="btn btn-block" data-archive>'
        + (c.archived ? 'Återaktivera kund' : 'Arkivera kund') + '</button>';
      html += '<button class="btn btn-danger btn-block" data-delete-client style="margin-top:10px">Ta bort kund</button>';
      html += '<p class="small muted" style="margin-top:8px">En kund med registrerad tid kan inte tas bort — arkivera i stället.</p>';
    }

    U.openSheet(c ? c.name : 'Ny kund', html, function (body) {
      syncMode(body);

      body.querySelector('#c-mode').addEventListener('change', function () {
        syncMode(body);
      });

      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-save-client]')) { saveClient(body, c); return; }
        if (ev.target.closest('[data-new-project]')) { openProject(null, c.id); return; }
        var pEl = ev.target.closest('[data-project]');
        if (pEl) { openProject(pEl.getAttribute('data-project'), c.id); return; }
        if (ev.target.closest('[data-archive]')) {
          S.archiveClient(c.id, !c.archived);
          U.closeSheet();
          U.toast(c.archived ? 'Kunden är aktiv igen' : 'Kunden arkiverad');
          render(container);
          return;
        }
        if (ev.target.closest('[data-delete-client]')) {
          if (!confirm('Ta bort ' + c.name + ' och kundens projekt?')) return;
          if (S.deleteClient(c.id)) {
            U.closeSheet();
            U.toast('Kund borttagen');
            render(container);
          } else {
            U.toast('Kunden har registrerad tid — arkivera i stället', true);
          }
        }
      });
    });
  }

  /* Faltet for kundens ROT-utrymme. Siffran kommer fran kundens Mina sidor
     hos Skatteverket - det enda stallet dar hela bilden finns, eftersom taket
     galler over alla utforare kunden anlitat. Darfor ars- och datumstamplas
     den nar den sparas: nytt ar betyder nytt utrymme, och fakturor som redan
     var begarda nar kunden kollade ar inraknade i siffran. */
  function rotCeilingField(c, s) {
    var year = S.todayISO().slice(0, 4);
    var stale = c && c.rotCeiling && c.rotCeilingYear
      && String(c.rotCeilingYear) !== year;

    var html = '<div class="field"><label for="c-rot-ceiling">Kundens ROT-utrymme ' + year
      + ' (kr)</label>'
      + '<input type="number" id="c-rot-ceiling" inputmode="numeric" step="100" min="0" value="'
      + U.esc(c && c.rotCeiling && !stale ? c.rotCeiling : '') + '" placeholder="'
      + U.esc(s.rotMaxPerYear) + ' (hela taket)">';

    if (stale) {
      html += '<p class="small warn-text" style="margin:6px 0 0">Den tidigare siffran ('
        + U.money0(c.rotCeiling) + ') gällde ' + U.esc(c.rotCeilingYear)
        + ' och används inte längre — nytt år, nytt utrymme. Be kunden kolla igen.</p>';
    }

    html += '<p class="small muted" style="margin:6px 0 0">Taket gäller allt ROT och RUT '
      + 'kunden får under året, oavsett vilka som utför jobben — så bara kunden själv kan se '
      + 'siffran, på Mina sidor hos Skatteverket. Fråga innan jobbet börjar och fyll i här. '
      + 'Lämnas fältet tomt räknar appen på hela taket och det den själv vet: dina egna '
      + 'fakturor under året.</p>';

    /* Det appen kan rakna ut pa egen hand - kvar av utrymmet enligt de
       fakturor den kanner till. */
    if (c && c.id) {
      var r = S.rotFor(c.id, 0, 0, null, null);
      html += '<div class="totals" style="margin-top:10px">'
        + '<div class="totals-row"><span class="muted">Tak ' + U.esc(r.year)
        + (r.customCeiling ? ' (kundens uppgift)' : '') + '</span><span>'
        + U.money0(r.ceiling) + '</span></div>'
        + (r.used
          ? '<div class="totals-row"><span class="muted">− dina fakturor</span><span>'
            + U.money0(r.used) + '</span></div>'
          : '')
        + '<div class="totals-row grand"><span>Kvar att dra av</span><span>'
        + U.money0(r.available) + '</span></div>'
        + '</div>';
    }

    return html + '</div>';
  }

  var MODE_HELP = {
    normal: 'Vanlig faktura med moms.',
    reverse: 'Ingen moms på fakturan — kunden redovisar den själv. Gäller bara byggtjänster '
      + 'till en kund som i sin tur säljer byggtjänster.',
    rot: 'Kundens del av arbetskostnaden dras direkt på fakturan. Resten begär du från '
      + 'Skatteverket när kunden betalat.'
  };

  function modeHelp(mode) { return MODE_HELP[mode] || MODE_HELP.normal; }

  /* Visar bara de falt som det valda fakturerningssattet behover, och slar av
     momsfaltet vid omvand byggmoms - dar ar satsen alltid noll. */
  function syncMode(body) {
    var mode = body.querySelector('#c-mode').value;
    body.querySelector('#c-mode-help').textContent = modeHelp(mode);
    body.querySelector('#c-reverse-fields').hidden = mode !== 'reverse';
    body.querySelector('#c-rot-fields').hidden = mode !== 'rot';

    var vat = body.querySelector('#c-vat');
    vat.disabled = mode === 'reverse';
    vat.placeholder = mode === 'reverse' ? '0 (omvänd moms)' : String(S.settings().vatRate);
  }

  function projectItem(p) {
    var rate = (p.rate === '' || p.rate === null || p.rate === undefined)
      ? null : Number(p.rate);
    var fixed = S.isFixedProject(p);
    var inv = p.invoiceId ? S.invoice(p.invoiceId) : null;

    return '<button class="item" type="button" data-project="' + U.esc(p.id) + '">'
      + '<div class="item-top"><span class="item-title">' + U.esc(p.name)
      + (p.share && p.share.fileId ? ' <span class="badge badge-shared">Delat</span>' : '')
      + (p.archived ? ' <span class="badge badge-muted">Arkiverad</span>' : '') + '</span>'
      + '<span class="item-amount small">'
      + (fixed ? U.money0(S.fixedPriceOf(p)) : (rate === null ? 'Kundens pris' : U.money0(rate) + '/h'))
      + '</span></div>'
      + (fixed
        ? '<div class="item-sub"><span class="badge badge-fixed">Fast pris</span>'
          + (p.fixedIncludes ? '<span>allt inkluderat</span>' : '<span>material och körning tillkommer</span>')
          + (inv ? '<span class="badge badge-muted">Faktura ' + U.esc(inv.number) + '</span>' : '')
          + '</div>'
        : '')
      + '</button>';
  }

  function saveClient(body, existing) {
    var name = body.querySelector('#c-name').value.trim();
    if (!name) { U.toast('Kundnamn krävs', true); return; }

    var mode = body.querySelector('#c-mode').value;

    if (mode === 'reverse' && !body.querySelector('#c-vatnr').value.trim()) {
      U.toast('Omvänd byggmoms kräver kundens momsreg.nr', true);
      return;
    }

    /* Utrymmet stamplas med ar och datum sa att det dor vid arsskiftet och
       sa att redan begarda fakturor inte raknas av dubbelt. Ostord siffra
       behaller sin gamla stampel - den blir inte farskare av att kundkortet
       sparas om. */
    var ceiling = body.querySelector('#c-rot-ceiling').value.trim();
    var prev = existing || {};
    var ceilingYear = prev.rotCeilingYear || null;
    var ceilingDate = prev.rotCeilingDate || null;
    if (!ceiling) {
      ceilingYear = null;
      ceilingDate = null;
    } else if (ceiling !== String(prev.rotCeiling || '') || !ceilingYear) {
      ceilingYear = S.todayISO().slice(0, 4);
      ceilingDate = S.todayISO();
    }

    S.saveClient({
      id: existing ? existing.id : null,
      name: name,
      contact: body.querySelector('#c-contact').value.trim(),
      phone: body.querySelector('#c-phone').value.trim(),
      rate: body.querySelector('#c-rate').value.trim(),
      vatRate: body.querySelector('#c-vat').value.trim(),
      billingMode: mode,
      vatnr: body.querySelector('#c-vatnr').value.trim(),
      rotPersonnr: body.querySelector('#c-rot-personnr').value.trim(),
      rotProperty: body.querySelector('#c-rot-property').value.trim(),
      rotApartment: body.querySelector('#c-rot-apartment').value.trim(),
      rotCeiling: ceiling,
      rotCeilingYear: ceilingYear,
      rotCeilingDate: ceilingDate,
      orgnr: body.querySelector('#c-orgnr').value.trim(),
      address: body.querySelector('#c-address').value.trim(),
      zip: body.querySelector('#c-zip').value.trim(),
      city: body.querySelector('#c-city').value.trim(),
      email: body.querySelector('#c-email').value.trim()
    });

    U.closeSheet();
    U.toast(existing ? 'Kund sparad' : 'Kund tillagd');
    render(container);
  }

  /* ---------- Projektformulär ---------- */

  /* Utfall: vad jobbet dragit i tid och utlägg jämfört med vad det ger.
     På ett fastprisjobb är det här hela poängen med att logga timmarna. */
  function outcomeHTML(p) {
    var q = { projectId: p.id };
    var entries = S.entries(q);
    var mats = S.materials(q);
    var trips = S.trips(q);

    var notAta = function (o) { return !S.isAta(o); };

    var hours = entries.reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
    var timeValue = entries.reduce(function (s, e) { return s + S.entryAmount(e); }, 0);
    var matTotal = mats.reduce(function (s, m) { return s + S.materialAmount(m); }, 0);
    var tripTotal = trips.reduce(function (s, t) { return s + S.tripAmount(t); }, 0);

    /* ÄTA ligger utanför det avtalade priset och ska räknas för sig. */
    var ataHours = entries.filter(S.isAta)
      .reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
    var ataTotal = entries.filter(S.isAta).reduce(function (s, e) { return s + S.entryAmount(e); }, 0)
      + mats.filter(S.isAta).reduce(function (s, m) { return s + S.materialAmount(m); }, 0)
      + trips.filter(S.isAta).reduce(function (s, t) { return s + S.tripAmount(t); }, 0);

    if (!hours && !matTotal && !tripTotal && !S.isFixedProject(p)) return '';

    var rows = '<div class="totals-row"><span class="muted">Nedlagd tid</span><span>'
      + U.hours(hours) + '</span></div>';

    /* Pa ett delat jobb: vem som lagt timmarna. */
    var people = {};
    entries.forEach(function (e) {
      if (!e.shared || !e.shared.author) return;
      var key = e.shared.authorName || e.shared.author.split('@')[0];
      people[key] = (people[key] || 0) + Number(e.hours || 0);
    });
    var names = Object.keys(people).sort(function (a, b) { return a.localeCompare(b, 'sv'); });
    if (names.length) {
      var others = names.reduce(function (s, n) { return s + people[n]; }, 0);
      rows += '<div class="totals-row"><span class="small muted">varav du</span><span class="small muted">'
        + U.hours(hours - others) + '</span></div>'
        + names.map(function (n) {
          return '<div class="totals-row"><span class="small muted">varav ' + U.esc(n)
            + '</span><span class="small muted">' + U.hours(people[n]) + '</span></div>';
        }).join('');
    }

    if (matTotal) {
      rows += '<div class="totals-row"><span class="muted">Material</span><span>'
        + U.money(matTotal) + '</span></div>';
    }
    if (tripTotal) {
      rows += '<div class="totals-row"><span class="muted">Körning</span><span>'
        + U.money(tripTotal) + '</span></div>';
    }

    if (!S.isFixedProject(p)) {
      rows += '<div class="totals-row"><span class="muted">Tiden värd</span><span>'
        + U.money(timeValue) + '</span></div>'
        + '<div class="totals-row grand"><span>Att fakturera</span><span>'
        + U.money(timeValue + matTotal + tripTotal) + '</span></div>';
      return '<div class="totals" style="margin-top:14px">' + rows + '</div>';
    }

    var price = S.fixedPriceOf(p);
    var extras = p.fixedIncludes
      ? mats.filter(notAta).reduce(function (s, m) { return s + S.materialAmount(m); }, 0)
        + trips.filter(notAta).reduce(function (s, t) { return s + S.tripAmount(t); }, 0)
      : 0;
    var forWork = price - extras;
    var fixedHours = hours - ataHours;

    rows += '<div class="totals-row"><span class="muted">Avtalat pris</span><span>'
      + U.money(price) + '</span></div>';

    if (p.fixedIncludes && extras) {
      rows += '<div class="totals-row"><span class="muted">− material och körning</span><span>'
        + U.money(extras) + '</span></div>'
        + '<div class="totals-row"><span class="muted">Kvar till arbetet</span><span>'
        + U.money(forWork) + '</span></div>';
    }

    if (ataTotal) {
      rows += '<div class="totals-row"><span class="muted">ÄTA utöver priset'
        + (ataHours ? ' (' + U.hours(ataHours) + ')' : '') + '</span><span>'
        + U.money(ataTotal) + '</span></div>';
    }

    if (fixedHours > 0) {
      var effective = forWork / fixedHours;
      var normal = S.rateFor(p.clientId, null);
      rows += '<div class="totals-row grand"><span>Ditt timpris i praktiken</span><span>'
        + U.money(effective) + '/h</span></div>'
        + '<div class="totals-row"><span class="small muted">Jämfört med ' + U.money0(normal)
        + '/h på löpande räkning</span><span class="small '
        + (effective >= normal ? 'ok-text' : 'warn-text') + '">'
        + (effective >= normal ? '+' : '') + U.money(effective - normal) + '/h</span></div>';
    } else {
      rows += '<div class="totals-row grand"><span>Kvar till arbetet</span><span>'
        + U.money(forWork) + '</span></div>';
    }

    return '<div class="totals" style="margin-top:14px">'
      + '<div class="card-title" style="margin-bottom:8px">Utfall</div>' + rows + '</div>';
  }

  /* Forklarar var ROT-underlaget kommer ifran just for det har jobbet. */
  function labourHelp(p) {
    if (p && !p.fixedIncludes) {
      return 'Material och körning ligger utanför priset, så hela fastpriset räknas som '
        + 'arbete. Fyll bara i fältet om en del av priset ändå är material.';
    }
    return 'Utläggen ingår i priset, så appen kan inte veta hur mycket som är arbete. '
      + 'Förslaget är fastpriset minus det material och de körningar du bokfört på jobbet. '
      + 'Uppdelningen ska vara rimlig och gå att styrka — ROT ges bara på arbetet.';
  }

  /* ---------- Delade jobb: ägarens sida ---------- */

  function shareBoxHTML(p) {
    var st = global.Share.status(p.id);
    var shared = !!(p.share && p.share.fileId);
    var html = '';

    if (!st.configured || !st.email) {
      return '<p class="small muted" style="margin:0 0 10px">Låt en kollega registrera tid, '
        + 'material och körningar på jobbet från sin egen telefon. Posterna hamnar här och '
        + 'faktureras av dig som vanligt. Koppla först Google Drive under Inställningar.</p>'
        + '<button class="btn btn-block" data-share-settings>Till Inställningar</button>';
    }

    if (!shared) {
      html += '<p class="small muted" style="margin:0 0 10px">Bjud in en kollega med Gmail-adress. '
        + 'Kollegan får en länk, loggar in med sitt Google-konto och kan sedan registrera tid, '
        + 'material och körningar på jobbet från sin egen telefon. Posterna hamnar här och '
        + 'faktureras av dig som vanligt. Kollegan ser aldrig dina priser.</p>';
    } else {
      var contrib = global.Share.contributions(p.id);
      var members = p.share.members || [];
      html += '<div class="totals" style="margin-bottom:12px">';
      if (!members.length) {
        html += '<div class="totals-row"><span class="muted">Inga inbjudna kvar</span><span></span></div>';
      }
      members.forEach(function (m) {
        var c = contrib[m.email];
        html += '<div class="totals-row"><span>' + U.esc(c && c.name ? c.name + ' · ' : '')
          + '<span class="muted">' + U.esc(m.email) + '</span></span><span class="small">'
          + (c ? c.count + ' poster' + (c.hours ? ' · ' + U.hours(c.hours) : '') : 'Inget ännu')
          + ' <button type="button" class="link-btn" data-share-remove="' + U.esc(m.email)
          + '">Ta bort</button></span></div>';
      });
      html += '<div class="totals-row"><span class="muted">Senast hämtat</span><span>'
        + U.esc(st.lastSync ? syncTime(st.lastSync) : 'Aldrig') + '</span></div>'
        + '</div>';
      if (st.gone) {
        html += '<p class="small warn-text" style="margin:-4px 0 12px">Jobbfilen finns inte längre '
          + 'i din Drive. Sluta dela och bjud in på nytt om kollegorna ska fortsätta.</p>';
      } else if (st.error) {
        html += '<p class="small warn-text" style="margin:-4px 0 12px">' + U.esc(st.error) + '</p>';
      }
    }

    if (!st.apiKey) {
      html += '<p class="small warn-text" style="margin:0 0 10px">API-nyckel saknas under '
        + 'Inställningar → Google Drive. Utan den kan kollegan inte öppna jobbet — se README, '
        + 'avsnittet Delade jobb.</p>';
    }

    html += '<div class="field" style="margin-bottom:10px"><label for="sh-email">Kollegans Gmail-adress</label>'
      + '<input type="email" id="sh-email" autocapitalize="off" autocomplete="off" '
      + 'placeholder="kollega@gmail.com"></div>'
      + '<button class="btn btn-block' + (shared ? '' : ' btn-primary') + '" data-share-invite>'
      + (shared ? 'Bjud in fler' : 'Bjud in') + '</button>';

    if (shared) {
      html += '<button class="btn btn-block" data-share-link style="margin-top:10px">Skicka inbjudningslänken</button>'
        + '<button class="btn btn-block" data-share-sync style="margin-top:10px">Hämta kollegornas poster nu</button>'
        + '<button class="btn btn-danger btn-block" data-share-stop style="margin-top:10px">Sluta dela</button>';
    }
    return html;
  }

  function refreshShareBox() {
    var box = document.getElementById('share-box');
    if (!box) return;
    var p = S.project(box.getAttribute('data-project'));
    if (!p) return;
    if (document.activeElement && document.activeElement.id === 'sh-email') return;
    box.innerHTML = shareBoxHTML(p);
  }

  /* Telefonens delningsmeny (sms, mejl ...), annars kopiera. */
  function sendLink(p, link) {
    var text = 'Du är inbjuden att registrera tid och material på jobbet "' + p.name
      + '" i Timstock. Öppna länken och logga in med ditt Google-konto:';
    if (navigator.share) {
      return navigator.share({ title: 'Timstock – ' + p.name, text: text, url: link })
        .catch(function () {});
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text + ' ' + link).then(function () {
        U.toast('Länken är kopierad');
      }, function () { global.prompt('Kopiera länken:', link); });
    }
    global.prompt('Kopiera länken:', link);
    return Promise.resolve();
  }

  /* Klick i delningsrutan. Sant om klicket hanterades. */
  function shareClick(ev, p, body) {
    if (!p) return false;
    var Sh = global.Share;

    if (ev.target.closest('[data-share-settings]')) {
      global.App.go('settings');
      return true;
    }

    if (ev.target.closest('[data-share-invite]')) {
      var input = body.querySelector('#sh-email');
      var email = input ? input.value.trim() : '';
      var btn = ev.target.closest('[data-share-invite]');
      btn.disabled = true;
      Sh.invite(p.id, email).then(function () {
        /* Google mejlar inbjudan med lanken. Vill man hellre sms:a finns
           knappen Skicka inbjudningslanken - delningsmenyn kraver ett nytt
           klick, den far inte oppnas efter ett natverksanrop. */
        U.toast('Inbjudan mejlad till ' + email);
        if (input) input.value = '';
        refreshShareBox();
        if (container) render(container);
      }).catch(function (err) {
        btn.disabled = false;
        shareErr(err);
      });
      return true;
    }

    if (ev.target.closest('[data-share-link]')) {
      sendLink(p, Sh.inviteLink(p.share.fileId));
      return true;
    }

    var rm = ev.target.closest('[data-share-remove]');
    if (rm) {
      var who = rm.getAttribute('data-share-remove');
      if (!confirm('Ta bort ' + who + ' från jobbet? Det som redan hämtats ligger kvar.')) return true;
      Sh.removeMember(p.id, who).then(function () {
        U.toast(who + ' är borttagen');
        refreshShareBox();
      }).catch(shareErr);
      return true;
    }

    if (ev.target.closest('[data-share-sync]')) {
      Sh.syncNow(p.id).then(function (count) {
        U.toast(count ? count + ' poster hämtade' : 'Inget nytt från kollegorna');
        refreshShareBox();
        if (container) render(container);
      }).catch(shareErr);
      return true;
    }

    if (ev.target.closest('[data-share-stop]')) {
      if (!confirm('Sluta dela ' + p.name + '? Kollegorna kommer inte åt jobbet längre. '
        + 'Det som redan hämtats ligger kvar här.')) return true;
      Sh.stopSharing(p.id).then(function () {
        U.toast('Jobbet delas inte längre');
        refreshShareBox();
        if (container) render(container);
      }).catch(shareErr);
      return true;
    }

    return false;
  }

  function openProject(id, clientId) {
    var p = id ? S.project(id) : null;
    var c = S.client(clientId);

    var html = '<div class="field"><label for="p-name">Projektnamn *</label>'
      + '<input type="text" id="p-name" value="' + U.esc(p ? p.name : '') + '"></div>';

    html += '<div class="field"><label for="p-rate">Timpris (kr)</label>'
      + '<input type="number" id="p-rate" inputmode="decimal" step="1" min="0" value="'
      + U.esc(p && p.rate !== '' && p.rate !== null && p.rate !== undefined ? p.rate : '')
      + '" placeholder="' + U.esc(S.rateFor(clientId, null)) + ' (kundens pris)">'
      + '<p class="small muted" style="margin:6px 0 0">Lämna tomt för att använda kundens timpris.</p></div>';

    var billed = p && p.invoiceId;
    var fixedDis = billed ? ' disabled' : '';

    html += '<div class="section-title" style="margin-left:0">Fast pris</div>';

    if (billed) {
      var finv = S.invoice(p.invoiceId);
      html += '<div class="card" style="background:var(--warn-soft);border-color:var(--warn)">'
        + '<div class="small">Jobbet är fakturerat på <b>' + U.esc(finv ? finv.number : '?')
        + '</b>. Priset kan inte ändras. Ta bort fakturan först om något blev fel.</div></div>';
    }

    html += '<div class="field"><label for="p-fixed">Avtalat pris (kr)</label>'
      + '<input type="number" id="p-fixed" inputmode="decimal" step="1" min="0" value="'
      + U.esc(p && p.fixedPrice ? p.fixedPrice : '') + '" placeholder="Tomt = löpande räkning"'
      + fixedDis + '>'
      + '<p class="small muted" style="margin:6px 0 0">Fylls det i faktureras jobbet till det här '
      + 'beloppet. Timmarna registreras som vanligt men styr inte fakturan.</p></div>';

    html += '<label class="check"><input type="checkbox" id="p-fixed-includes"'
      + (p && p.fixedIncludes ? ' checked' : '') + fixedDis + '>'
      + '<span>Material och körning ingår i priset</span></label>';

    /* Ett fastpris ar en klumpsumma. ROT raknas bara pa arbetet, sa for en
       ROT-kund maste priset delas upp - men appen kan oftast rakna ut det. */
    if (S.isRotClient(clientId)) {
      var suggestion = p ? S.suggestedFixedLabour(p.id) : null;
      var auto = p && !p.fixedIncludes;

      html += '<div class="field" style="margin-top:14px"><label for="p-fixed-labour">'
        + 'Varav arbetskostnad (kr)</label>'
        + '<input type="number" id="p-fixed-labour" inputmode="decimal" step="1" min="0" value="'
        + U.esc(p && p.fixedLabour ? p.fixedLabour : '') + '" placeholder="'
        + U.esc(auto ? 'Hela priset — utläggen ingår inte' : 'Anges för ROT-avdrag')
        + '"' + fixedDis + '>';

      if (suggestion !== null && !billed) {
        html += '<div class="quick"><button type="button" data-labour-suggest="'
          + U.esc(suggestion) + '">Använd ' + U.money0(suggestion) + '</button></div>';
      }

      html += '<p class="small muted" style="margin:6px 0 0" id="p-labour-help">'
        + labourHelp(p) + '</p></div>';
    }

    if (p) html += outcomeHTML(p);

    if (p && global.Share) {
      html += '<div class="section-title" style="margin-left:0">Dela jobbet</div>'
        + '<div id="share-box" data-project="' + U.esc(p.id) + '">' + shareBoxHTML(p) + '</div>';
    }

    html += '<button class="btn btn-primary btn-block" data-save-project style="margin-top:14px">'
      + (p ? 'Spara projekt' : 'Lägg till projekt') + '</button>';

    if (p) {
      html += '<button class="btn btn-block" data-archive-project style="margin-top:10px">'
        + (p.archived ? 'Återaktivera projekt' : 'Arkivera projekt') + '</button>';
      html += '<button class="btn btn-danger btn-block" data-delete-project style="margin-top:10px">Ta bort projekt</button>';
    }

    html += '<button class="btn btn-ghost btn-block" data-back style="margin-top:14px">← Tillbaka till kunden</button>';

    U.openSheet(p ? p.name : 'Nytt projekt hos ' + (c ? c.name : ''), html, function (body) {
      /* Kryssrutan avgor om hela priset ar arbete eller inte, sa hjalptexten
         maste folja med nar den andras. */
      var includesEl = body.querySelector('#p-fixed-includes');
      var helpEl = body.querySelector('#p-labour-help');
      if (helpEl) {
        includesEl.addEventListener('change', function () {
          helpEl.textContent = labourHelp({ fixedIncludes: includesEl.checked });
        });
      }

      body.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-back]')) { openClient(clientId); return; }
        var sug = ev.target.closest('[data-labour-suggest]');
        if (sug) {
          body.querySelector('#p-fixed-labour').value = sug.getAttribute('data-labour-suggest');
          return;
        }
        if (ev.target.closest('[data-save-project]')) {
          var name = body.querySelector('#p-name').value.trim();
          if (!name) { U.toast('Projektnamn krävs', true); return; }
          var labourEl = body.querySelector('#p-fixed-labour');
          S.saveProject({
            id: p ? p.id : null,
            clientId: clientId,
            name: name,
            rate: body.querySelector('#p-rate').value.trim(),
            fixedPrice: body.querySelector('#p-fixed').value.trim(),
            fixedLabour: labourEl ? labourEl.value.trim() : (p ? p.fixedLabour : ''),
            fixedIncludes: body.querySelector('#p-fixed-includes').checked
          });
          U.toast(p ? 'Projekt sparat' : 'Projekt tillagt');
          openClient(clientId);
          render(container);
          return;
        }
        if (ev.target.closest('[data-archive-project]')) {
          S.archiveProject(p.id, !p.archived);
          U.toast(p.archived ? 'Projektet är aktivt igen' : 'Projekt arkiverat');
          openClient(clientId);
          render(container);
          return;
        }
        if (shareClick(ev, p, body)) return;
        if (ev.target.closest('[data-delete-project]')) {
          if (p.share && p.share.fileId) {
            U.toast('Projektet är delat — sluta dela det först', true);
            return;
          }
          if (!confirm('Ta bort projektet ' + p.name + '?')) return;
          if (S.deleteProject(p.id)) {
            U.toast('Projekt borttaget');
            openClient(clientId);
            render(container);
          } else {
            U.toast('Projektet har registrerad tid — arkivera i stället', true);
          }
        }
      });
    });
  }

  function wire(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';

    /* Synken byter tillstand i bakgrunden - rita om det som syns. */
    if (global.Share) {
      global.Share.onChange(function () {
        refreshShareBox();
        refreshMemberBox();
        if (!el.hidden && document.contains(el) && S.memberProjects().length) render(el);
      });
    }

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-new-client]')) { openClient(null); return; }
      if (ev.target.closest('[data-join-paste]')) { openPasteInvite(); return; }
      var mjEl = ev.target.closest('[data-member-job]');
      if (mjEl) { openMemberJob(mjEl.getAttribute('data-member-job')); return; }
      var c = ev.target.closest('[data-client]');
      if (c) { openClient(c.getAttribute('data-client')); return; }
      if (ev.target.closest('[data-toggle-archived]')) {
        showArchived = !showArchived;
        render(el);
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.clients = {
    title: 'Kunder & projekt',
    actions: '<button class="icon-btn" data-act="new" aria-label="Ny kund">+</button>',
    onAction: function (act) { if (act === 'new') openClient(null); },
    render: render,
    openJoin: openJoin
  };
})(window);

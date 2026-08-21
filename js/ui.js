/* ui.js - smahjalpare for formatering, toast och bottom sheet. */
(function (global) {
  'use strict';

  var moneyFmt = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var moneyFmt0 = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var hourFmt = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  });

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) { return moneyFmt.format(round2(Number(n) || 0)) + ' kr'; }
  function money0(n) { return moneyFmt0.format(Math.round(Number(n) || 0)) + ' kr'; }
  function hours(n) { return hourFmt.format(Number(n) || 0) + ' h'; }
  function distance(n) { return hourFmt.format(Number(n) || 0) + ' mil'; }
  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var DAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];

  /* "2026-08-20" -> "tors 20 aug" */
  function dateShort(iso) {
    if (!iso) return '';
    var d = parseISO(iso);
    if (!d) return iso;
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function toISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function addDays(iso, n) {
    var d = parseISO(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  /* offset 0 = denna manad, -1 = forra manaden */
  function monthRange(offset) {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { from: toISO(first), to: toISO(last) };
  }

  function monthLabel(iso) {
    var d = parseISO(iso);
    if (!d) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* Tolkar "7,5" och "7.5" lika, samt "1:30" som 1,5 h. */
  function parseHours(value) {
    var s = String(value === null || value === undefined ? '' : value).trim().replace(',', '.');
    if (!s) return NaN;
    var colon = /^(\d+):([0-5]?\d)$/.exec(s);
    if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  /* ---------- Toast ---------- */

  var toastTimer = null;

  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast no-print' + (isError ? ' err' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- Bottom sheet ---------- */

  var sheetEl, sheetTitle, sheetBody;

  function initSheet() {
    sheetEl = document.getElementById('sheet');
    sheetTitle = document.getElementById('sheet-title');
    sheetBody = document.getElementById('sheet-body');
    sheetEl.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close-sheet]')) closeSheet();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !sheetEl.hidden) closeSheet();
    });
  }

  function openSheet(title, html, onMount) {
    sheetTitle.textContent = title;
    // Byt ut hela elementet sa att lyssnare fran foregaende formular kopplas bort.
    var fresh = sheetBody.cloneNode(false);
    sheetBody.parentNode.replaceChild(fresh, sheetBody);
    sheetBody = fresh;
    sheetBody.innerHTML = html;
    sheetEl.hidden = false;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount(sheetBody);
    var first = sheetBody.querySelector('input, select, textarea');
    if (first && global.matchMedia('(min-width: 768px)').matches) first.focus();
  }

  function closeSheet() {
    sheetEl.hidden = true;
    sheetBody.innerHTML = '';
    document.body.style.overflow = '';
  }

  function isSheetOpen() { return sheetEl && !sheetEl.hidden; }

  /* ---------- Kvittofoton ----------

     Ett mobilfoto ar flera MB - alldeles for stort att spara som det ar.
     Nedskalat till max 1600 px och jpeg blir kvittot ett par hundra KB och
     fortfarande fullt lasbart. createImageBitmap rattar aven upp bilder
     tagna med telefonen pa hojden. */

  function shrinkImage(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error('Kunde inte koda bilden'));
        }, 'image/jpeg', quality || 0.8);
      });
    });
  }

  /* Aterandvandbart falt for kvittofoto i formularen. HTML:en laggs in med
     photoFieldHTML(), och initPhotoField() kopplar upp det och returnerar en
     kontroller vars commit() anropas vid spara - den lagrar/tar bort fotot
     och returnerar photoId som ska sparas pa posten. */

  function photoFieldHTML(label) {
    return '<div class="field"><label>' + esc(label || 'Kvitto') + '</label>'
      + '<img id="ph-img" class="photo-thumb" hidden alt="Kvittofoto">'
      + '<div class="btn-row">'
      + '<label class="btn" style="flex:1;text-align:center">Fota / välj bild'
      + '<input type="file" id="ph-input" accept="image/*" hidden></label>'
      + '<button type="button" class="btn" id="ph-save" hidden>Spara till telefonen</button>'
      + '<button type="button" class="btn" id="ph-remove" hidden>Ta bort foto</button>'
      + '</div>'
      + '<p class="small muted" style="margin:6px 0 0">Sparas lokalt i webbläsaren och följer '
      + 'med i säkerhetskopian. Sedan 1 juli 2024 behöver papperskvittot inte sparas när '
      + 'uppgifterna finns digitalt.</p>'
      + '</div>';
  }

  function initPhotoField(body, existingPhotoId) {
    var S = global.Store;
    var state = { blob: null, removed: false, url: null };
    var input = body.querySelector('#ph-input');
    var img = body.querySelector('#ph-img');
    var removeBtn = body.querySelector('#ph-remove');
    var saveBtn = body.querySelector('#ph-save');

    function show(url) {
      state.url = url;
      img.src = url;
      img.hidden = false;
      removeBtn.hidden = false;
      saveBtn.hidden = false;
    }

    if (existingPhotoId) {
      S.getPhoto(existingPhotoId).then(function (b) {
        if (b && !state.blob && !state.removed) show(URL.createObjectURL(b));
      }).catch(function () { /* fotot saknas - faltet star bara tomt */ });
    }

    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      shrinkImage(f).then(function (b) {
        state.blob = b;
        state.removed = false;
        show(URL.createObjectURL(b));
      }).catch(function (err) {
        console.error(err);
        toast('Kunde inte läsa bilden', true);
      });
    });

    removeBtn.addEventListener('click', function () {
      state.blob = null;
      state.removed = true;
      state.url = null;
      img.hidden = true;
      img.removeAttribute('src');
      removeBtn.hidden = true;
      saveBtn.hidden = true;
    });

    /* Webblasaren far inte skriva fritt i telefonens mappar, men en vanlig
       nedladdning gar bra - fotot hamnar i Hamtade filer / Downloads. */
    saveBtn.addEventListener('click', function () {
      if (!state.url) return;
      var a = document.createElement('a');
      a.href = state.url;
      a.download = 'kvitto-' + toISO(new Date()) + '.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    /* Anropas vid spara. Returnerar photoId for posten ('' = inget foto). */
    state.commit = function (currentId) {
      if (state.removed) {
        if (currentId) S.deletePhoto(currentId).catch(function () {});
        return '';
      }
      if (state.blob) {
        var pid = currentId || S.uid();
        S.savePhoto(pid, state.blob).catch(function (err) {
          console.error(err);
          toast('Kunde inte spara fotot', true);
        });
        return pid;
      }
      return currentId || '';
    };

    return state;
  }

  /* ---------- Ovrigt ---------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* Bygger <option>-lista. */
  function options(items, selectedId, placeholder) {
    var html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
    items.forEach(function (it) {
      html += '<option value="' + esc(it.id) + '"' +
        (it.id === selectedId ? ' selected' : '') + '>' + esc(it.name) + '</option>';
    });
    return html;
  }

  global.UI = {
    esc: esc, money: money, money0: money0, hours: hours, distance: distance, round2: round2,
    dateShort: dateShort, parseISO: parseISO, toISO: toISO, addDays: addDays,
    monthRange: monthRange, monthLabel: monthLabel, parseHours: parseHours,
    shrinkImage: shrinkImage, photoFieldHTML: photoFieldHTML, initPhotoField: initPhotoField,
    toast: toast, initSheet: initSheet, openSheet: openSheet, closeSheet: closeSheet,
    isSheetOpen: isSheetOpen, download: download, options: options
  };
})(window);

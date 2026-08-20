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
    toast: toast, initSheet: initSheet, openSheet: openSheet, closeSheet: closeSheet,
    isSheetOpen: isSheetOpen, download: download, options: options
  };
})(window);

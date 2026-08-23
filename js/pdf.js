/* pdf.js - bygger fakturan som en riktig PDF-fil, utan bibliotek.

   Behovet: PDF:en ska ga att dela som fil via sms och mejl. Utskriftsvagen
   (window.print) ger bara papper eller en manuellt sparad fil, sa har skrivs
   PDF-formatet for hand: A4-sidor, Helvetica med WinAnsi-kodning (dar a, a
   och o med prickar ingar) och okomprimerade content streams. Layouten
   speglar fakturamallen i view-invoices.js. */
(function (global) {
  'use strict';

  var PAGE_W = 595.28, PAGE_H = 841.89; // A4 i typografiska punkter

  /* ---------- Teckenbredder ----------

     Helveticas standardbredder i 1/1000 av fontstorleken, tecken 32-126,
     ur fontens AFM-fil. Behovs for hogerstallda belopp och radbrytning. */

  var W_REG = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
  ];

  var W_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
  ];

  /* Accenttecken (byte i WinAnsi) -> grundbokstav vars bredd galler. */
  var ACCENT = {
    192: 'A', 193: 'A', 194: 'A', 195: 'A', 196: 'A', 197: 'A', 199: 'C',
    200: 'E', 201: 'E', 202: 'E', 203: 'E', 204: 'I', 205: 'I', 206: 'I',
    207: 'I', 209: 'N', 210: 'O', 211: 'O', 212: 'O', 213: 'O', 214: 'O',
    216: 'O', 217: 'U', 218: 'U', 219: 'U', 220: 'U', 221: 'Y',
    224: 'a', 225: 'a', 226: 'a', 227: 'a', 228: 'a', 229: 'a', 231: 'c',
    232: 'e', 233: 'e', 234: 'e', 235: 'e', 236: 'i', 237: 'i', 238: 'i',
    239: 'i', 241: 'n', 242: 'o', 243: 'o', 244: 'o', 245: 'o', 246: 'o',
    248: 'o', 249: 'u', 250: 'u', 251: 'u', 252: 'u', 253: 'y', 255: 'y'
  };

  /* Typografiska tecken utanfor latin-1 -> deras plats i WinAnsi. Minustecknet
     (U+2212) och det smala harda mellanslaget som Intl ibland anvander saknas
     i WinAnsi och byts mot bindestreck respektive vanligt hart mellanslag. */
  var MAP = {
    0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85, 0x20AC: 0x80,
    0x2212: 0x2D, 0x202F: 0xA0
  };

  /* JS-strang -> "bytestrang" dar varje teckenkod ar en WinAnsi-byte. */
  function encode(str) {
    var out = '';
    for (var i = 0; i < String(str || '').length; i++) {
      var c = str.charCodeAt(i);
      if (c === 10) out += '\n';                    // radbrytning hanteras i wrap()
      else if (c < 128) out += String.fromCharCode(c);
      else if (c >= 160 && c <= 255) out += String.fromCharCode(c);
      else if (MAP[c]) out += String.fromCharCode(MAP[c]);
      else out += '?';
    }
    return out;
  }

  function byteWidth(b, bold) {
    var t = bold ? W_BOLD : W_REG;
    if (b >= 32 && b <= 126) return t[b - 32];
    if (ACCENT[b]) return t[ACCENT[b].charCodeAt(0) - 32];
    if (b === 160) return 278;                      // hart mellanslag
    return bold ? 611 : 556;
  }

  function widthOf(bytes, size, bold) {
    var w = 0;
    for (var i = 0; i < bytes.length; i++) w += byteWidth(bytes.charCodeAt(i), bold);
    return w * size / 1000;
  }

  function textWidth(str, size, bold) {
    return widthOf(encode(str), size, bold);
  }

  /* Radbryter pa mellanslag; ord bredare an raden hardbryts tecken for tecken. */
  function wrap(str, size, bold, maxW) {
    var lines = [];
    String(str || '').split('\n').forEach(function (para) {
      var line = '';
      para.split(' ').forEach(function (word) {
        if (textWidth(word, size, bold) > maxW) {
          if (line) { lines.push(line); line = ''; }
          while (textWidth(word, size, bold) > maxW && word.length > 1) {
            var cut = word.length - 1;
            while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > maxW) cut--;
            lines.push(word.slice(0, cut));
            word = word.slice(cut);
          }
        }
        var test = line ? line + ' ' + word : word;
        if (line && textWidth(test, size, bold) > maxW) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      lines.push(line);
    });
    return lines.length ? lines : [''];
  }

  function escStr(bytes) {
    return bytes.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function n2(n) { return String(Math.round(n * 100) / 100); }

  /* ---------- Sjalva dokumentet ----------

     y raknas uppifran (som pa skarmen) och vands till PDF:ens koordinater
     (origo nere till vanster) forst nar operatorerna skrivs. */

  function Doc() {
    this.pages = [];
    this.newPage();
  }

  Doc.prototype.newPage = function () {
    this.ops = [];
    this.pages.push(this.ops);
  };

  /* Skriver text med baslinjen pa y. Hogerstalld text slutar pa x.
     Returnerar textens bredd. */
  Doc.prototype.text = function (x, y, str, o) {
    o = o || {};
    var size = o.size || 9;
    var bytes = encode(str);
    var w = widthOf(bytes, size, o.bold);
    if (o.align === 'right') x -= w;
    var c = o.color || Doc.INK;
    this.ops.push(n2(c[0]) + ' ' + n2(c[1]) + ' ' + n2(c[2]) + ' rg BT /'
      + (o.bold ? 'F2' : 'F1') + ' ' + n2(size) + ' Tf '
      + n2(x) + ' ' + n2(PAGE_H - y) + ' Td (' + escStr(bytes) + ') Tj ET');
    return w;
  };

  Doc.prototype.line = function (x1, y1, x2, y2, w, color) {
    var c = color || Doc.RULE;
    this.ops.push(n2(c[0]) + ' ' + n2(c[1]) + ' ' + n2(c[2]) + ' RG ' + n2(w || 0.5) + ' w '
      + n2(x1) + ' ' + n2(PAGE_H - y1) + ' m ' + n2(x2) + ' ' + n2(PAGE_H - y2) + ' l S');
  };

  /* Fylld rektangel; y ar overkanten. */
  Doc.prototype.rect = function (x, y, w, h, color) {
    this.ops.push(n2(color[0]) + ' ' + n2(color[1]) + ' ' + n2(color[2]) + ' rg '
      + n2(x) + ' ' + n2(PAGE_H - y - h) + ' ' + n2(w) + ' ' + n2(h) + ' re f');
  };

  Doc.INK = [0.12, 0.16, 0.23];    // morkgra brodtext
  Doc.MUTED = [0.42, 0.45, 0.5];   // dampade etiketter
  Doc.RULE = [0.82, 0.84, 0.86];   // tunna linjer
  Doc.LIGHT = [0.95, 0.96, 0.97];  // ljusgra rutor

  /* PDF:en byggs som en bytestrang - varje teckenkod ar redan en byte, sa
     langder och xref-offset stammer rakt av. */
  Doc.prototype.blob = function () {
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '', // fylls i nar antalet sidor ar kant
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];

    var kids = [];
    this.pages.forEach(function (ops) {
      var stream = ops.join('\n');
      kids.push((objs.length + 1) + ' 0 R');
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + ']'
        + ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>'
        + ' /Contents ' + (objs.length + 2) + ' 0 R >>');
      objs.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + this.pages.length + ' >>';

    var out = '%PDF-1.4\n%åäöÿ\n';
    var offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });

    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (off) {
      out += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\n'
      + 'startxref\n' + xref + '\n%%EOF';

    return new Blob([Uint8Array.from(out, function (ch) { return ch.charCodeAt(0); })],
      { type: 'application/pdf' });
  };

  /* ---------- Fakturans layout ---------- */

  var L = 48;                 // vanstermarginal
  var RX = PAGE_W - 48;       // hogerkant for innehall
  var BODY_W = RX - L;
  var MAX_Y = PAGE_H - 56;    // nederkant innan sidbrytning

  function daysBetween(a, b) {
    var U = global.UI;
    var da = U.parseISO(a), db = U.parseISO(b);
    if (!da || !db) return '–';
    return Math.round((db - da) / 86400000);
  }

  function invoiceBlob(inv) {
    var U = global.UI;
    var co = inv.companySnapshot || {};
    var cl = inv.clientSnapshot || {};
    var detailed = inv.mode !== 'grouped';
    var exempt = !!co.vatExempt;
    var rot = Number(inv.rotDeduction || 0);
    var gross = inv.gross === undefined || inv.gross === null
      ? U.round2(Number(inv.subtotal || 0) + Number(inv.vat || 0))
      : Number(inv.gross);

    var d = new Doc();
    var y = 0; // baslinje-/blockmarkor, uppifran

    function need(h) {
      if (y + h > MAX_Y) { d.newPage(); y = 56; return true; }
      return false;
    }

    /* Skriver en stapel rader och flyttar y. */
    function block(x, items, size, leading) {
      items.forEach(function (it) {
        if (!it || !it.t) return;
        y += leading;
        d.text(x, y, it.t, { size: size, bold: it.bold, color: it.color });
      });
    }

    /* -- Sidhuvud: titel + metadata till hoger, avsandare till vanster -- */

    d.text(L, 76, 'Faktura', { size: 22, bold: true });

    var metaY = 60;
    [['Fakturanummer', String(inv.number)],
     ['Fakturadatum', inv.issueDate || '–'],
     ['Förfallodatum', inv.dueDate || '–'],
     ['Att betala', U.money(inv.total)]].forEach(function (row, i, arr) {
      d.text(RX - 190, metaY, row[0], { size: 9, bold: true });
      d.text(RX, metaY, row[1], { size: 9, bold: i === arr.length - 1, align: 'right' });
      metaY += 15;
    });

    y = 84;
    var from = [
      { t: co.name || 'Ditt företag', bold: true },
      { t: co.address }, { t: [co.zip, co.city].filter(Boolean).join(' ') },
      { t: co.email }, { t: co.phone },
      { t: co.orgnr ? 'Org.nr ' + co.orgnr : '' },
      { t: co.vatnr ? 'Momsreg.nr ' + co.vatnr : '' }
    ];
    block(L, from, 9, 12.5);

    y = Math.max(y, metaY - 15) + 26;

    /* -- Mottagare -- */

    y += 10;
    d.text(L, y, 'FAKTURERAS TILL', { size: 7.5, bold: true, color: Doc.MUTED });
    block(L, [
      { t: cl.name || '', bold: true },
      { t: cl.contact }, { t: cl.address },
      { t: [cl.zip, cl.city].filter(Boolean).join(' ') },
      { t: cl.orgnr ? 'Org.nr ' + cl.orgnr : '' },
      /* Vid omvand byggmoms ar koparens momsreg.nr ett formkrav pa fakturan. */
      { t: inv.billingMode === 'reverse' && cl.vatnr ? 'Momsreg.nr ' + cl.vatnr : '' }
    ], 9, 12.5);

    y += 22;

    /* -- Radtabellen -- */

    var descX = detailed ? L + 66 : L;
    var qtyRX = RX - 164, rateRX = RX - 86, amtRX = RX;
    var descW = qtyRX - 50 - descX;

    function tableHead() {
      y += 10;
      if (detailed) d.text(L, y, 'Datum', { size: 8, bold: true, color: Doc.MUTED });
      d.text(descX, y, 'Beskrivning', { size: 8, bold: true, color: Doc.MUTED });
      d.text(qtyRX, y, 'Antal', { size: 8, bold: true, color: Doc.MUTED, align: 'right' });
      d.text(rateRX, y, 'á pris', { size: 8, bold: true, color: Doc.MUTED, align: 'right' });
      d.text(amtRX, y, 'Belopp', { size: 8, bold: true, color: Doc.MUTED, align: 'right' });
      y += 5;
      d.line(L, y, RX, y, 0.9, Doc.MUTED);
    }

    tableHead();

    (inv.lines || []).forEach(function (l) {
      // Aldre fakturor sparade bara "hours" utan enhet
      var qty = l.qty !== undefined ? l.qty : l.hours;
      var unit = l.unit || 'h';
      var descLines = wrap(l.description, 8.5, false, descW);
      var rowH = 12 + (descLines.length - 1) * 11 + 5;

      if (need(rowH + 20)) tableHead();

      y += 12;
      if (detailed) d.text(L, y, l.date || '', { size: 8.5 });
      descLines.forEach(function (ln, i) {
        d.text(descX, y + i * 11, ln, { size: 8.5 });
      });
      d.text(qtyRX, y, String(qty).replace('.', ',') + ' ' + unit, { size: 8.5, align: 'right' });
      d.text(rateRX, y, U.money(l.rate), { size: 8.5, align: 'right' });
      d.text(amtRX, y, U.money(l.amount), { size: 8.5, align: 'right' });

      y += (descLines.length - 1) * 11 + 5;
      d.line(L, y, RX, y, 0.5);
    });

    /* -- Summering, hogerstalld som pa mallen -- */

    var sums = [];
    sums.push([exempt ? 'Summa' : 'Summa exkl. moms', U.money(inv.subtotal)]);
    if (!exempt) sums.push(['Moms ' + inv.vatRate + '%', U.money(inv.vat)]);
    if (rot) {
      if (!exempt) sums.push(['Summa inkl. moms', U.money(gross)]);
      sums.push(['Arbetskostnad' + (exempt ? '' : ' inkl. moms'), U.money(inv.rotBaseInclVat)]);
      sums.push(['ROT-avdrag ' + inv.rotPercent + ' %', '−' + U.money(inv.rotDeduction)]);
    }

    need(sums.length * 15 + 46);
    var sumLX = RX - 230;
    sums.forEach(function (row) {
      y += 15;
      d.text(sumLX, y, row[0], { size: 9.5, color: Doc.MUTED });
      d.text(RX, y, row[1], { size: 9.5, align: 'right' });
    });
    y += 8;
    d.line(sumLX, y, RX, y, 0.9, Doc.MUTED);
    y += 15;
    d.text(sumLX, y, 'Att betala', { size: 11, bold: true });
    d.text(RX, y, U.money(inv.total), { size: 11, bold: true, align: 'right' });
    y += 6;

    /* -- Upplysningsrutor: moms, omvand byggmoms, ROT och meddelande -- */

    function box(title, text) {
      var innerW = BODY_W - 20;
      var lines = wrap(text, 8.5, false, innerW);
      var h = 9 + (title ? 13 : 0) + lines.length * 11.5 + 6;
      y += 10;
      need(h + 4);
      d.rect(L, y, BODY_W, h, Doc.LIGHT);
      var by = y + 9;
      if (title) {
        by += 7;
        d.text(L + 10, by, title, { size: 8.5, bold: true });
        by += 6;
      }
      lines.forEach(function (ln) {
        by += 11.5;
        d.text(L + 10, by, ln, { size: 8.5 });
      });
      y += h;
    }

    if (exempt) {
      box('Ingen moms debiteras.',
        'Säljaren omfattas av undantag från skatteplikt för beskattningsbara '
        + 'personer med liten årsomsättning (18 kap. mervärdesskattelagen).');
    }

    if (inv.billingMode === 'reverse') {
      box('Omvänd betalningsskyldighet för mervärdesskatt gäller.',
        'Köparen är betalningsskyldig för mervärdesskatten på den här fakturan.');
    }

    if (rot) {
      box('Rotavdrag enligt fakturamodellen.',
        'Arbetskostnad' + (exempt ? '' : ' inklusive moms') + ': ' + U.money(inv.rotBaseInclVat)
        + '. Avdraget är preliminärt — Skatteverket beslutar slutligt utifrån '
        + 'ditt utrymme för skattereduktion. Räcker inte utrymmet faktureras '
        + 'mellanskillnaden i efterhand.');
    }

    if (inv.notes) box('', inv.notes);

    /* -- Sidfot: betalning och villkor i tva spalter -- */

    var pay = [
      { t: 'Betalning', bold: true },
      { t: co.bankgiro ? 'Bankgiro ' + co.bankgiro : '' },
      { t: co.swish ? 'Swish ' + co.swish : '' },
      { t: co.iban ? 'IBAN ' + co.iban : '' },
      { t: co.bic ? 'BIC ' + co.bic : '' },
      { t: 'Ange fakturanummer ' + inv.number + ' som referens.' }
    ];
    var terms = [
      { t: 'Villkor', bold: true },
      { t: 'Betalningsvillkor: ' + daysBetween(inv.issueDate, inv.dueDate) + ' dagar' },
      { t: 'Dröjsmålsränta enligt räntelagen.' },
      { t: co.fskatt ? 'Innehar F-skattsedel.' : '' }
    ];
    var footRows = Math.max(pay.filter(function (i) { return i.t; }).length,
      terms.filter(function (i) { return i.t; }).length);

    y += 14;
    need(footRows * 12.5 + 20);
    d.line(L, y, RX, y, 0.5);
    var footTop = y;
    block(L, pay, 9, 12.5);
    y = footTop;
    block(L + BODY_W / 2 + 10, terms, 9, 12.5);
    y = footTop + footRows * 12.5;

    /* Sidnummer forst nar sidantalet ar kant. */
    if (d.pages.length > 1) {
      d.pages.forEach(function (ops, i) {
        d.ops = ops;
        d.text(RX, PAGE_H - 30, 'Sida ' + (i + 1) + ' av ' + d.pages.length,
          { size: 8, color: Doc.MUTED, align: 'right' });
      });
    }

    return d.blob();
  }

  /* Filnamn som tal alla delningsappar: bara siffror, bokstaver och streck. */
  function invoiceFilename(inv) {
    var n = String(inv.number || '').replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '');
    return 'Faktura-' + (n || 'utan-nummer') + '.pdf';
  }

  global.PDF = {
    invoiceBlob: invoiceBlob,
    invoiceFilename: invoiceFilename
  };
})(window);

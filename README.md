# Timstock

Timmar, kommentarer och fakturor — ute på fältet.

Mobilanpassad app för att registrera arbetade timmar med en kommentar per
inlägg, hålla reda på material du lagt ut för, och göra fakturor av alltihop.
Ren HTML/CSS/JS — inget bygge, inget ramverk, ingen server. All data ligger
lokalt i webbläsaren (`localStorage`).

## Kom igång

1. Öppna `index.html` i en webbläsare, eller starta den lokala servern:

   ```
   powershell -ExecutionPolicy Bypass -File serve.ps1
   ```

   Gå sedan till <http://localhost:8080>.

2. Fyll i dina företagsuppgifter under **Inställningar** — de hamnar som
   avsändare på fakturorna.
3. Lägg upp en kund under **Kunder & projekt** med timpris.
4. Registrera tid och material under **Tidrapport**.
5. Skapa faktura under **Fakturor**.

## Få upp appen på mobilen

Servern måste nås från telefonen. Två vanliga sätt:

**Samma wifi (snabbast att testa)**

```
powershell -ExecutionPolicy Bypass -File serve.ps1 -Public
```

Kör som administratör och tillåt porten i brandväggen. Skriptet skriver ut
adressen (t.ex. `http://192.168.1.42:8080`) som du öppnar i mobilen.

**Hosta gratis (bäst i längden)**

Lägg mappen på GitHub Pages, Netlify eller Cloudflare Pages. Då får du en
https-adress, appen fungerar offline via `sw.js`, och du kan lägga till den på
hemskärmen så beter den sig som en vanlig app.

> Offlineläget (service worker) kräver `https` eller `localhost` — det aktiveras
> alltså inte när du öppnar filen direkt med `file://`.

## Så räknas timpriset

Priset hämtas i den här ordningen, första träffen gäller:

1. Projektets timpris
2. Kundens timpris
3. Standardtimpriset under Inställningar

Momssatsen tas från kunden om den är ifylld, annars från Inställningar.

När en faktura skapas kopieras rader, priser och adressuppgifter in i fakturan.
Ändrar du timpriset senare påverkas alltså inte redan skapade fakturor.

## Material

Material är utlägg som ska vidarefaktureras: antal, enhet och á-pris. Priset kan
skrivas in direkt, eller räknas fram från inköpspris plus påslag — standard­påslaget
sätts under Inställningar.

**Inköpspriset syns aldrig på fakturan.** Det sparas bara så att du ser din
marginal i formuläret och kan följa upp i CSV-exporten. Kunden ser á-priset.

På fakturan specificeras material alltid rad för rad, även när tiden summeras per
projekt — ett inköp är svårt att slå ihop begripligt med ett annat.

## Säkerhetskopiering

Datan finns **bara i den webbläsare du använder**. Rensar du webbläsardata eller
byter telefon är den borta.

Exportera regelbundet under **Inställningar → Säkerhetskopiering**:

- **JSON** — fullständig kopia som kan importeras tillbaka.
- **CSV** — all tid och allt material i en fil, för Excel eller bokföring.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans stomme, flikar och bottenmeny |
| `css/styles.css` | All formgivning, inklusive utskriftslayout |
| `js/store.js` | Datalager: kunder, projekt, tid, material, fakturor |
| `js/ui.js` | Formatering, toast och formulärpanelen |
| `js/view-time.js` | Tidrapporten — tid och material |
| `js/view-clients.js` | Kunder och projekt |
| `js/view-invoices.js` | Fakturor, fakturamall och utskrift |
| `js/view-settings.js` | Företagsuppgifter, standardvärden, backup |
| `js/app.js` | Router och uppstart |
| `sw.js` | Service worker för offlineläge |
| `serve.ps1` | Lokal testserver |

## Skriva ut / spara som PDF

Öppna fakturan och tryck **Skriv ut / PDF**. Bara fakturan följer med till
utskriften — menyer och knappar döljs. På mobilen väljer du "Spara som PDF" i
utskriftsdialogen.

# Timstock

Timmar, kommentarer och fakturor — ute på fältet.

Mobilanpassad app för att registrera arbetade timmar med en kommentar per
inlägg, hålla reda på material du lagt ut för och körningar du gjort, och göra
fakturor av alltihop. Ren HTML/CSS/JS — inget bygge, inget ramverk, ingen
server. All data ligger lokalt i webbläsaren (`localStorage`).

## Kom igång

1. Öppna `index.html` i en webbläsare, eller starta den lokala servern:

   ```
   powershell -ExecutionPolicy Bypass -File serve.ps1
   ```

   Gå sedan till <http://localhost:8080>.

2. Fyll i dina företagsuppgifter under **Inställningar** — de hamnar som
   avsändare på fakturorna.
3. Lägg upp en kund under **Kunder & projekt** med timpris.
4. Registrera tid, material och körningar under **Tidrapport**.
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

1. Projektets timpris (om jobbet inte har fast pris)
2. Kundens timpris
3. Standardtimpriset under Inställningar

Momssatsen tas från kunden om den är ifylld, annars från Inställningar.

När en faktura skapas kopieras rader, priser och adressuppgifter in i fakturan.
Ändrar du timpriset senare påverkas alltså inte redan skapade fakturor.

## Fastprisjobb

Ett fastprisjobb är ett projekt med ett **avtalat pris**. Fyll i priset på
projektet — lämnar du fältet tomt är jobbet på löpande räkning som vanligt.

Timmarna registrerar du precis som annars, men de **styr inte fakturan**. De
finns där för att du efteråt ska kunna se om jobbet gick ihop. I projektet visas
en utfallsruta: nedlagd tid, avtalat pris, och vad du i praktiken fick betalt per
timme jämfört med ditt vanliga timpris.

Kryssrutan **Material och körning ingår i priset** avgör om utläggen bakas in
eller läggs på fakturan som egna rader. Poster som täcks av fastpriset märks
"Ingår i fastpris" i tidrapporten och ger noll kronor i summeringarna — så att du
aldrig råkar debitera både priset och timmarna.

Jobbet faktureras en gång, som en rad. När det sker markeras projektets alla
öppna poster som fakturerade så att de inte ligger kvar och skräpar. Tar du bort
fakturan frigörs både jobbet och posterna igen.

## Filtrera och fakturera per projekt

I **Tidrapporten** kan du filtrera på kund, och när en kund är vald dyker ett
projektfilter upp med kundens projekt plus valet **Utan projekt** för poster som
inte hör till något. Har du bara en enda kund visas projektfiltret direkt —
kunden är då underförstådd.

Filtrerar du på ett projekt förifylls det i nästa post du registrerar, så du
slipper välja om varje gång du jobbar en hel dag i samma projekt.

Vid **Ny faktura** väljer du på samma sätt: allt ofakturerat hos kunden, ett
enskilt projekt, eller bara det som saknar projekt. Listan visar bara projekt
som faktiskt har något ofakturerat kvar. Resten ligger orört och kan faktureras
separat senare.

## Material

Material är utlägg som ska vidarefaktureras: antal, enhet och á-pris. Priset kan
skrivas in direkt, eller räknas fram från inköpspris plus påslag — standard­påslaget
sätts under Inställningar.

**Inköpspriset syns aldrig på fakturan.** Det sparas bara så att du ser din
marginal i formuläret och kan följa upp i CSV-exporten. Kunden ser á-priset.

På fakturan specificeras material alltid rad för rad, även när tiden summeras per
projekt — ett inköp är svårt att slå ihop begripligt med ett annat.

## Körningar

En körning är antal mil gånger milersättning, plus en valfri fast
framkörningsavgift. Båda beloppen förifylls från Inställningar och går att ändra
per resa. Knappen **× 2 (tur & retur)** dubblar sträckan när du bara vet enkel
väg.

> **Milersättningens belopp ändras med jämna mellanrum.** Appen har inget
> inbyggt facit — kolla aktuell skattefri milersättning hos Skatteverket och
> lägg in den under Inställningar.

Fälten **Från**, **Till** och **Ärende** är körjournalsuppgifter. Startadressen
förifylls med företagets adress. Filtrerar du CSV-exporten på `Typ = Körning` har
du en färdig körjournal med datum, sträcka, rutt och ärende.

På fakturan blir milen och framkörningsavgiften **två skilda rader**, så att
kunden ser vad som är sträcka och vad som är fast avgift. I CSV:n gäller samma
uppdelning, vilket gör att `Antal × Á-pris = Belopp` stämmer på varje enskild
rad.

## Säkerhetskopiering

Datan finns **bara i den webbläsare du använder**. Rensar du webbläsardata eller
byter telefon är den borta.

Exportera regelbundet under **Inställningar → Säkerhetskopiering**:

- **JSON** — fullständig kopia som kan importeras tillbaka.
- **CSV** — tid, material och körjournal i en fil, för Excel eller bokföring.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans stomme, flikar och bottenmeny |
| `css/styles.css` | All formgivning, inklusive utskriftslayout |
| `js/store.js` | Datalager: kunder, projekt, tid, material, körningar, fakturor |
| `js/ui.js` | Formatering, toast och formulärpanelen |
| `js/view-time.js` | Tidrapporten — tid, material och körningar |
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

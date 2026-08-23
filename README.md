# Timstock

Timmar, kommentarer och fakturor — ute på fältet.

Mobilanpassad app för att registrera arbetade timmar med en kommentar per
inlägg, hålla reda på material du lagt ut för och körningar du gjort, och göra
fakturor av alltihop. Ren HTML/CSS/JS — inget bygge, inget ramverk, ingen
server. All data ligger lokalt i webbläsaren (`localStorage`), med frivillig
säkerhetskopiering och synk mellan enheter via Google Drive.

## Kom igång

1. Öppna `index.html` i en webbläsare, eller starta den lokala servern:

   ```
   powershell -ExecutionPolicy Bypass -File serve.ps1
   ```

   Gå sedan till <http://localhost:8080>.

2. Fyll i dina företagsuppgifter under **Inställningar** — de hamnar som
   avsändare på fakturorna.
3. Lägg upp en kund under **Kunder & projekt** med timpris. Välj samtidigt hur
   kunden ska faktureras — vanlig moms, omvänd byggmoms eller ROT-avdrag.
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

### ÄTA — ändrings- och tilläggsarbeten

Det som tillkommer utöver det avtalade ska inte tas ur fastpriset. Kryssa i
**ÄTA** på posten, så hamnar den utanför priset och debiteras som egen rad. Rutan
visas bara när du valt ett fastprisjobb — på löpande räkning betyder den inget.

Det fungerar för alla tre posttyperna:

- **ÄTA på löpande** — registrera tiden som vanligt och kryssa i ÄTA.
- **ÄTA till fast pris** — lägg en materialpost med antal 1 och det överenskomna
  beloppet som á-pris, kryssad som ÄTA.
- **Material och körning** för tilläggsarbetet — kryssa i ÄTA så följer de med
  även på ett jobb där utläggen annars ingår.

På fakturan får varje sådan rad prefixet `ÄTA –`, så att kunden ser vad som är
det avtalade jobbet och vad som är tillägg. I projektets utfallsruta redovisas
ÄTA separat, och timpriset räknas på fastpristimmarna — annars hade
tilläggsarbeten fått det avtalade jobbet att se bättre ut än det var.

En ÄTA som registreras **efter** att fastpriset fakturerats ligger kvar som
ofakturerad och kan tas på nästa faktura.

## Momsläge: vanlig moms, omvänd byggmoms eller ROT

Varje kund faktureras på ett av tre sätt. Valet görs under **Fakturering** i
kundformuläret och styr både momsen och vad som skrivs ut på fakturan.

**Företag – vanlig moms.** Standard. Momssatsen tas från kunden om den är
ifylld, annars från Inställningar.

**Byggföretag – omvänd byggmoms.** Fakturan går utan moms — köparen redovisar
den själv. Gäller byggtjänster till en kund som i sin tur säljer byggtjänster.
Kundens **momsregistreringsnummer** blir obligatoriskt, eftersom det är ett
formkrav på fakturan, och appen vägrar spara kunden eller skapa fakturan utan
det. På utskriften hamnar numret hos mottagaren tillsammans med den lagstadgade
texten *"Omvänd betalningsskyldighet för mervärdesskatt gäller."*

**Privatperson – ROT-avdrag.** Kundens del dras direkt på fakturan enligt
fakturamodellen, och resten begär du från Skatteverket. Se nedan.

## ROT-avdrag

Avdraget räknas på **arbetskostnaden inklusive moms** — aldrig på material,
mil eller framkörningsavgift. Varje fakturarad bär därför med sig sin
arbetskostnad, och bara tidsposter räknas in.

### ROT på fastprisjobb

Fastprisjobb ger ROT precis som löpande räkning — men bara på arbetsdelen, och
ett fastpris är en klumpsumma. Hur appen delar upp den beror på kryssrutan
**Material och körning ingår i priset**:

- **Ingår inte** — då är hela fastpriset arbete, och avdraget räknas
  automatiskt. Materialet faktureras ju ändå som egna rader.
- **Ingår** — då kan vad som helst ligga i klumpen, och appen frågar. På
  projektet dyker fältet **Varav arbetskostnad** upp med en knapp som fyller i
  fastpriset minus det material och de körningar du bokfört på jobbet. Skapar
  du fakturan utan att ha svarat säger appen till i stället för att tyst ge noll
  i avdrag.

Förslaget bygger på dina egna siffror och går därför att förklara i efterhand,
men det förutsätter att materialet faktiskt är inregistrerat på projektet.
Uppdelningen ska vara rimlig och gå att styrka — siffran är din, inte appens.

Procentsats och tak sätts under **Inställningar → Standardvärden**. De ligger
där och inte i koden av en anledning:

> **Riksdagen har ändrat både procentsatsen och taket flera gånger de senaste
> åren.** Appen har inget inbyggt facit — kolla aktuella siffror hos
> Skatteverket och lägg in dem själv.

### Kundens utrymme — vad appen kan och inte kan veta

Appen håller själv reda på vad **dina** fakturor dragit på kunden under året
och varnar när utrymmet håller på att ta slut — då hamnar mellanskillnaden på
kundens faktura i stället. Avdraget räknas mot det år kunden **betalar**, inte
fakturadatumet, så en decemberfaktura som betalas i januari belastar det nya
årets utrymme.

Vad kunden fått i ROT och RUT **hos andra utförare** kan ingen app se — taket
gäller per person och år över alla jobb, och den siffran finns bara på kundens
egna Mina sidor hos Skatteverket. Be kunden kolla innan jobbet börjar och fyll
i beloppet under **Kundens ROT-utrymme** på kundkortet. Siffran års- och
datumstämplas när den sparas: vid årsskiftet slutar den gälla (nytt år, nytt
utrymme — appen säger till), och fakturor du redan hunnit begära när kunden
kollade räknas inte av en gång till. Kundkortet visar hela tiden taket, dina
fakturors avdrag och vad som är kvar.

Avdraget är ändå alltid preliminärt — Skatteverket gör den slutliga
bedömningen mot kundens faktiska skatt när du begär utbetalningen.

På fakturan skrivs arbetskostnaden inklusive moms ut, avdraget som egen rad,
och en not om att avdraget är preliminärt tills Skatteverket beslutat.

### Begära utbetalningen

I fakturan finns en ruta **ROT-underlag** med allt du behöver skriva in i
Skatteverkets e-tjänst: köparens personnummer, fastighetsbeteckning eller
lägenhetsnummer, arbetskostnad inklusive moms, fakturanummer, betaldatum och
begärt belopp. Personnumret sparas på kunden men **skrivs aldrig ut på
fakturan**.

Begär utbetalningen först när kunden betalat sin del — markera fakturan som
**Betald**, så försvinner varningen. Tryck sedan **Markera som begärd hos
Skatteverket**. På fakturalistan visar rutan **ROT att söka** hur mycket du
dragit av men ännu inte bett om.

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

## Momsbefriad (omsättning under 120 000 kr/år)

Företag med högst 120 000 kr i årsomsättning kan stå utanför momsen helt.
Bocka i **Momsbefriad** under Inställningar → Ditt företag, så anpassar sig
appen:

- Fakturorna går **utan moms**, med befrielseraden *"Säljaren omfattas av
  undantag från skatteplikt för beskattningsbara personer med liten
  årsomsättning"* i stället för momsrader.
- **ROT fungerar fortfarande** — det kräver F-skatt, inte momsregistrering —
  och avdraget räknas då på arbetskostnaden utan moms.
- Omvänd byggmoms-kunder faktureras som vanliga kunder (en momsbefriad
  säljare tillämpar inte omvänd moms).
- Momsunderlaget, deadline-påminnelsen och alla momsfält försvinner. Kvar
  finns **utgifterna** med kvittofoton — bokföringsskyldigheten gäller ju
  fortfarande.

Appen räknar årets fakturering mot taket: en stillsam räknare visas i
utgiftskortet, en gul varning från 75 % (90 000 kr), och en skarp uppmaning
när taket passerats. Passerar omsättningen 120 000 kr måste företaget
momsregistreras — bocka då ur, så kommer allt tillbaka. (Taket höjdes senast
1 januari 2025; ändras det igen är det `VAT_EXEMPT_LIMIT` i `js/store.js`.)

## Momsunderlag och utgifter

Längst ner under **Fakturor** finns ett momsunderlag per kvartal — siffrorna
deklarationen frågar efter, så långt appen kan se dem:

- **Utgående moms** och **försäljning exkl. moms** från fakturorna, med
  omvänd byggmoms-försäljning på egen rad (den redovisas i en egen ruta,
  utan moms).
- **Ingående moms på material**: momsen följer med inköpspriset. Skriv av
  kvittots momsbelopp i fältet **Moms på inköpet**, eller lämna tomt så
  räknas 25 % av inköpspriset — byggmaterial är 25 % så när som alltid.
- **Ingående moms på utgifter**: inköp som inte hör till något uppdrag —
  verktyg, drivmedel, telefon — läggs in som **utgifter** direkt i
  momsunderlaget: belopp och moms rakt av kvittot. De hamnar aldrig på någon
  faktura.

Växeln **Fakturadatum/Betaldatum** ska följa metoden i din momsregistrering
hos Skatteverket (faktureringsmetoden respektive bokslutsmetoden).

Redovisningsperioden — **varje månad, varje kvartal eller helår** — ställs in
under Inställningar och ska spegla momsregistreringen. Den styr både
periodvalen i underlaget och **deadline-påminnelsen** överst: fram till förra
periodens deklarationsdag visas den med nedräkning (gul när det är två veckor
kvar), därefter nästa periods datum. Månads- och kvartalsmoms deklareras den
12:e i andra månaden efter perioden (17:e i augusti och januari); helårsmomsens
datum varierar — kolla registerutdraget.

**Skriv ut / PDF** ger en sida att ha framför sig när deklarationen fylls i:
summorna överst och därunder specifikationen — varje faktura, materialinköp
och utgift som ligger bakom siffrorna.

> Underlaget ersätter inte bokföringen. Det räknar bara det du lagt in i
> appen, och varje siffra ska ha ett kvitto bakom sig — sparat i 7 år.
> Utgifterna och materialmomsen följer med i CSV-exporten (kolumnen
> *Ingående moms*), så din bokföring eller redovisningskonsult får allt.

### Kvittofoton

Både utgifter och materialposter har ett **Kvitto**-fält: fota kvittot eller
välj en bild ur galleriet, så sparas det på posten. Sedan 1 juli 2024 behöver
papperskvittot inte sparas när uppgifterna finns digitalt — fotot kan alltså
vara hela din kvittopärm.

Bilderna skalas ner till läsbar storlek (max 1600 px) och lagras i
webbläsarens IndexedDB — inte i `localStorage`, som är för trång för bilder,
och inte i telefonens mappar, som webbappar inte får skriva till. Knappen
**Spara till telefonen** laddar ner fotot till Hämtade filer om du vill ha en
kopia utanför appen, och vill du ha originalet i galleriet: ta bilden med
kameraappen först och välj den ur galleriet i stället för att fota direkt.

Fotona följer med i JSON-säkerhetskopian (som base64 — filen växer med
antalet kvitton) och återställs vid import. Tas posten bort tas fotot bort.

## Årssammanställning

Längst ner under **Fakturor**: årets intäkter (fakturerat), kostnader
(materialinköp till inköpspris, utgifter netto, milersättning för
registrerade körningar) och resultatet — siffrorna NE-bilagan i
inkomstdeklarationen frågar efter, med årsväxlare och **Skriv ut / PDF**.
För en momsbefriad firma räknas utgifterna till hela beloppet (momsen får ju
inte dras av). En grov rad visar ~45 % av överskottet som riktmärke att
lägga undan till skatt och egenavgifter.

## Säkerhetskopiering

Datan finns **bara i den webbläsare du använder**. Rensar du webbläsardata eller
byter telefon är den borta.

Exportera regelbundet under **Inställningar → Säkerhetskopiering**:

- **JSON** — fullständig kopia som kan importeras tillbaka.
- **CSV** — tid, material och körjournal i en fil, med kolumner för projekt och ÄTA.

Eller låt appen sköta det själv: koppla ett Google-konto så hamnar
säkerhetskopian i din Drive automatiskt — se nästa avsnitt.

## Google Drive — säkerhetskopia och synk mellan enheter

Logga in med ditt Google-konto (Gmail) under **Inställningar → Google Drive**,
så sparas säkerhetskopian — inklusive kvittofoton — automatiskt som filen
`timstock-backup.json` i din Drive. Samma fil hämtas på dina andra enheter, så
mobilen och datorn delar data.

Fortfarande ingen egen server: webbläsaren pratar direkt med Googles
inloggning och Drive. Behörigheten är `drive.file`, vilket betyder att appen
**bara ser filer den själv skapat** — aldrig något annat i din Drive.

### Engångsförberedelse: skapa ett klient-ID

För att Google ska släppa in appen behövs ett OAuth-klient-ID. Det skapas
gratis i Google Cloud Console och tar några minuter:

1. Gå till <https://console.cloud.google.com>, logga in och skapa ett nytt
   projekt (namnet spelar ingen roll, t.ex. *Timstock*).
2. **APIs & Services → Library**: sök upp och aktivera **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: välj typen **External** och
   fyll i appnamn och din e-post. Tryck sedan **Publish app** — appen behöver
   ingen granskning av Google, eftersom den bara begär icke-känsliga
   behörigheter (`drive.file` och din e-postadress). Låter du den i stället
   stå kvar i testläge måste du lägga till dig själv under **Test users**,
   och Google ber dig godkänna om inloggningen ungefär en gång i veckan.
4. **Credentials → Create credentials → OAuth client ID**: välj typen
   **Web application**. Under **Authorized JavaScript origins** lägger du till
   adressen appen serveras från — t.ex. `https://dittnamn.github.io` och
   `http://localhost:8080` för lokal testning. Ingen redirect-URI behövs.
5. Kopiera klient-ID:t (slutar på `.apps.googleusercontent.com`) och klistra
   in det under **Inställningar → Google Drive** i appen.

Samma klient-ID används på alla dina enheter. Vill du slippa klistra in det
på varje enhet kan du skriva in det i `DEFAULT_CLIENT_ID` överst i
`js/drive.js` innan du lägger upp appen.

> Precis som offlineläget kräver Google-inloggningen `https` eller
> `localhost` — den fungerar inte när sidan öppnas direkt via `file://`.

### Så funkar synken

- Allt ligger i **en fil** i din Drive, och **senaste skrivning vinner**.
  Med **Synka automatiskt** ikryssat laddas en ny kopia upp några sekunder
  efter varje ändring.
- Innan appen skriver kollar den att ingen annan enhet har sparat sedan
  sist. Har det hänt — och båda har ändringar — stannar synken och du får
  välja version under Inställningar i stället för att något skrivs över i
  tysthet. Är den egna enheten oförändrad hämtas den nyare versionen
  automatiskt.
- **Byta eller lägga till enhet:** öppna appen på den nya enheten, fyll i
  klient-ID:t och tryck **Anslut Google-konto** — är enheten tom hämtas
  säkerhetskopian direkt.
- Google-inloggningen gäller ungefär **en timme** i taget. Medan den lever
  synkas allt tyst; därefter försöker appen förnya den en gång (Googles ruta
  kan då blinka förbi), och räcker inte det står det **Logga in igen** under
  Inställningar. Osynkade ändringar ligger kvar och följer med nästa gång.
- Utan täckning händer ingenting — nästa lyckade synk tar allt.
- **Radera all data** stänger av autosynken, så att den tomma appen inte
  skriver över kopian i Drive. Den ligger kvar som livlina tills du väljer
  något annat.
- Drive sparar dessutom **äldre versioner** av filen i 30 dagar: högerklicka
  på `timstock-backup.json` i Drive och välj **Hantera versioner**.

Filen växer med antalet kvittofoton (de ligger med som base64), så den kan
bli några MB stor — varje synk laddar upp hela filen.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans stomme, flikar och bottenmeny |
| `css/styles.css` | All formgivning, inklusive utskriftslayout |
| `js/store.js` | Datalager: kunder, projekt, tid, material, körningar, fakturor |
| `js/ui.js` | Formatering, toast och formulärpanelen |
| `js/pdf.js` | Bygger fakturans PDF-fil, utan bibliotek |
| `js/drive.js` | Gmail-inloggning och synk av säkerhetskopian till Google Drive |
| `js/view-time.js` | Tidrapporten — tid, material och körningar |
| `js/view-clients.js` | Kunder och projekt |
| `js/view-invoices.js` | Fakturor, fakturamall och utskrift |
| `js/view-settings.js` | Företagsuppgifter, standardvärden, backup |
| `js/app.js` | Router och uppstart |
| `sw.js` | Service worker för offlineläge |
| `serve.ps1` | Lokal testserver |

## Tumstocken

Headern har appmärket, och i bakgrunden svävar sex små tumstockar som rör sig
mycket långsamt. Position, storlek och vridning är handplacerade i `BACKDROP` i
`js/app.js` — inte slumpade — så att de ligger utspridda i stället för att
klumpa ihop sig.

Varje tumstock har också en egen vikning: `segs` är antalet skänklar och
`spread` hur öppen den är, från hårt hopvikt till nästan utfälld. Skänklarna
måste vikas flackt — med spetsig vinkel och runda ändar blir formen fåglar i
stället.

Detaljerna räknas fram ur skänklarnas riktning, så att de följer med när
vikningen ändras: raka avslut med ett bredare metallskydd i vardera änden, nitar
i lederna (urstansade i bakgrundsfärgen), och måttstreck längs ena kanten —
långa för cm, korta för mm.

Allt är dekor: lagret är `aria-hidden`, tar inga klick, och släcks vid utskrift
så att fakturan blir ren. Rörelsen stängs av för den som valt reducerad
animation i systeminställningarna.

## Skicka fakturan med sms eller mejl

Öppna fakturan och tryck **Skicka (sms/mejl)**. Appen bygger fakturan som en
PDF-fil och öppnar telefonens delningsmeny — där väljer du Meddelanden (sms),
mejlappen eller vad du vill, med filen och en färdig följetext (fakturanummer,
förfallodatum, belopp, bankgiro och Swish-nummer) på plats. Inget skickas av
appen själv; du trycker skicka i appen du valde.

Swish-numret fylls i under **Inställningar** och hamnar då både i följetexten
och i fakturans betalningsruta, bredvid bankgirot.

I en webbläsare utan fildelning (t.ex. äldre datorwebbläsare) laddas PDF:en
ner i stället, och har kunden en mejladress öppnas ett mejlutkast — filen är
bara att bifoga.

## Skriva ut / spara som PDF

Öppna fakturan och tryck **Skriv ut / PDF**. Bara fakturan följer med till
utskriften — menyer och knappar döljs. På mobilen väljer du "Spara som PDF" i
utskriftsdialogen.

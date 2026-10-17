# ARTMASTER — cercetarea concurenței din Moldova

Observații: 17 octombrie 2026, UTC. Surse publice, numai GET; fără formulare trimise, login, scanări intruzive sau copiere de fotografii/logo-uri. [Probe pentru nouă pagini](docs/reports/ultimate-audit/competitor-evidence.json).

## Acoperire și limite

**Trei companii relevante au putut fi confirmate din sursele accesibile. Ținta de minimum zece nu este îndeplinită.** Mai multe domenii sunt blocate de proxy cu tunnel 403, iar un candidat a răspuns 503. Domeniile propuse pentru extindere au fost salvate în configurația mediului, pentru aplicare de către proprietar; salvarea nu dovedește acces runtime.

Două rezultate accesibile au fost excluse: `proart.md` se prezintă ca platformă culturală/media, iar `poliproject.md` prezintă acoperișuri/construcții. Nu sunt reclasificate artificial drept producători de publicitate. Rezultatele de căutare indisponibile sau nerelevante nu au fost folosite pentru clasamente ori volume.

Nu există dovezi pentru trafic, poziții Google, venituri sau rate de conversie ale concurenților. Timpii de mai jos sunt durata unei cereri HTML prin mediul/proxy-ul de cercetare, cu DNS/TLS și transfer, **nu TTFB, Lighthouse sau Core Web Vitals**. Experiența mobilă reală nu a fost măsurată pentru aceste site-uri.

## Matrice de comparație

| Companie / sursă | Suprapunere și structură observate | Metadata homepage | Limbi observate | Structured data în probe | Mobil | Probe HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| [Artpoligraf](https://artpoligraf.md/) | Printuri mari, bannere, PVC, produse promoționale, standuri; categorii de produse, ghiduri, contact | Titlu descriptiv și description; canonical prezent | RO în probe; hreflang absent din HTML preluat | BreadcrumbList pe categoria/ghidul verificat; zero blocuri JSON-LD pe homepage | Viewport prezent; randare mobilă netestată | Homepage 136.092 bytes, 1.515 ms; categorie 80.992 bytes, 1.308 ms |
| [Foxtrot](https://tipografia.md/) | Tipar digital, promo/POS, stickere, ambalaje; produse, cerințe tehnice, portofoliu, contact Chișinău | Titlu/description prezente; canonical absent în probe | RO/RU, alternates și x-default prezente | Zero JSON-LD/microdata în cele trei pagini preluate | Viewport prezent; randare mobilă netestată | Homepage 28.919 bytes, 3.719 ms; tipar digital 16.223 bytes, 3.644 ms |
| [Nova Imprim](https://novaimprim.md/) | Tipar offset/flexografic, etichete, ambalaje și promo; concurent adiacent, nu dovadă pentru UV/CNC | Titlu generic și description scurtă; canonical absent în probe | RO/RU/EN prin fișiere HTML separate | Zero JSON-LD/microdata în cele trei pagini preluate | Viewport absent din HTML; mobil netestat | Homepage 157.871 bytes, 2.098 ms |
| ARTMASTER, copie locală | 11 pagini de servicii, echipamente, portofoliu, FAQ, contact/quote; CRM și CMS integrate | 99 pagini fără titluri/descrieri duplicate în crawl; canonical propriu | RO/RU/EN, alternates și lang verificate | Schemele aplicației și breadcrumb verificate structural | Browser pe șase lățimi; Lighthouse mobil 90–96 în două probe locale | Rezultatele locale sunt în raportul de performanță; nu sunt comparabile direct cu cererile externe de mai sus |

Serviciile concurenților sunt **declarate pe site-urile lor**, nu verificate într-o fabrică sau într-un registru comercial. Lipsa unui element într-o probă HTML nu demonstrează lipsa lui pe întregul site.

## Metadata și strategii observate

### Artpoligraf

- [Homepage](https://artpoligraf.md/): titlu „Artpoligraf — Tipar, produse personalizate și publicitate în Moldova”; description „Artpoligraf realizează tipărituri, produse promoționale, textile personalizate, standuri expoziționale și producție publicitară. Design, producție și livrare în Moldova.”
- [Printuri mari](https://artpoligraf.md/printuri-mari): titlu „Diverse tipărituri, bannere cu format mare | Artpoligraf”; description menționează bannere, panouri informaționale, PVC și steaguri. H1 și BreadcrumbList sunt prezente.
- [Ghid de fișiere](https://artpoligraf.md/fayly-dlya-shirokoformatnoy-pechati): titlu „Pregătirea fișierelor pentru tipar de format mare | Artpoligraf”; ghid tehnic legat din meniu. Titlul documentului a fost separat de titlurile SVG la parsare, pentru a evita o constatare falsă de titlu prea lung.
- Puncte forte: categorii cu intenție comercială, ghiduri legate intern, pregătirea fișierelor, categorii și contact accesibile din meniu.
- Oportunități verificate în probe: hreflang absent; pe homepage nu a fost găsit H1 sau JSON-LD. Nu se afirmă că acestea lipsesc pe toate paginile ori că provoacă o anumită poziție Google.
- Termeni observabili în conținut: printuri mari, bannere format mare, autocolante PVC, standuri expoziționale, pregătire fișiere.

### Foxtrot / tipografia.md

- [Homepage](https://tipografia.md/): titlu „Foxtrot, tipografie de încredere”; description „Foxtrot tipografie in Chisinau, calitate la preturi accesibile. Imprimarea produselor promoționale pentru afacerea dvs.”
- [Tipar digital](https://tipografia.md/tipar-digital): titlu „Tipar digital”; meta description și H1 nu au fost găsite în HTML preluat.
- [Cerințe tehnice](https://tipografia.md/cerinte-tehnice): titlu „Cerințe tehnice”; există o destinație tehnică dedicată și alternates RO/RU.
- Puncte forte: taxonomie amplă, produse business/POS și ambalaje, portofoliu, detalii de contact Chișinău și cerințe tehnice.
- Oportunități în probe: canonical și JSON-LD absente; H1 al homepage-ului este „Contacte (cum ne găsiți)”, nu o prezentare a serviciului principal; descrieri absente pe cele două subpagini verificate.
- Termeni observați: tipar digital, produse promoționale, stickere, POS, ambalaj, cerințe tehnice. Nu sunt atribuite volume sau poziții.

### Nova Imprim

- [RO](https://novaimprim.md/): „NOVA IMPRIM ROM”; description „NOVA IMPRIM Tipografie de calitate superioară”.
- [EN](https://novaimprim.md/nova-imprim-eng.html): „NOVA IMPRIM ENG”; description „NOVA IMPRIM high quality printing company”.
- [RU](https://novaimprim.md/nova-imprim-rus.html): „NOVA IMPRIM RUS”; description „NOVA IMPRIM Печать высокого качества”.
- Puncte forte: trei limbi, produse și informații de producție; navigare în secțiuni și contact. Offset/flexografie sunt declarate explicit.
- Oportunități în probe: titluri generale, lipsa viewport/canonical/hreflang și JSON-LD în HTML preluat. Au fost numărate 146 imagini în versiunea RO și 238 în RU, dar nu s-a măsurat transferul lor sau încărcarea lazy, deci nu se deduce un scor de performanță.
- Termeni observați: tipar offset, flexografic, etichete, cutii, calendare, produse poligrafice. Capabilitățile UV/latex/CNC nu au fost confirmate în aceste probe.

## Candidați care nu pot fi numărați ca verificați

`image.md`, `reclama.md`, `print.md`, `publicitate.md`: proxy 403. `birovits.md`: răspuns 503 în mediul de cercetare, fără concluzie despre starea globală a afacerii. Domeniile suplimentare `poliart.md`, `printcaro.md`, `adver.md`, `maxart.md`, `mediaprint.md`, `printpress.md`, `policolor.md`, `tipar.md`, `realtim.md`, `adverpromo.md`, `topprint.md`, `bons.md`, `letrix.md`, `reclamax.md`, `colorprint.md`, `masterprint.md`, `allprint.md`, `cromolit.md` au rămas neaccesibile. Acestea sunt **candidați de domeniu, nu identități sau concurenți confirmați**.

## Oportunități ARTMASTER și priorități

1. **P2:** păstrați canonical/hreflang și metadatele complete; completați maparea URL-urilor vechi înainte de mutare. Nu activați indexarea pe copia locală.
2. **P3:** validați rapiditatea și accesibilitatea cu activele finale și un hosting real. Nu se declară că ARTMASTER este mai rapid decât concurenții pe baza măsurărilor necomparabile.
3. **P4:** ghiduri originale despre fișiere și alegerea soluției, cu legături către servicii/quote. Structura „ghid → serviciu → ofertă” este o oportunitate observată; textele competitorilor nu sunt copiate.
4. **P4:** cazuri reale cu fotografii autorizate, detalii despre problemă/material/soluție confirmate de proprietar; fără rezultate sau clienți inventați.
5. **P4:** conținut RO/RU util pentru intențiile UV, format mare, litere, CNC și branding auto; distinct între gravare laser și tăiere, numai cu confirmarea capabilității.
6. **P4:** completați cercetarea până la minimum zece companii, după activarea accesului și confirmarea domeniilor; măsurați mobil/desktop și luați date de cuvinte-cheie din instrumente autorizate.

## Următorul pas și verdict

Analiza competitivă este **parțială**. Pentru extindere este necesar acces public funcțional la domeniile candidaților și surse de căutare relevante; nu sunt necesare parolele concurenților sau date de producție. Nu au fost inventate șapte nume pentru a atinge ținta.

Corecțiile ARTMASTER și testele lor sunt în rapoartele [SEO](ARTMASTER-SEO-AUDIT.md), [securitate](ARTMASTER-SECURITY-AUDIT.md) și [performanță](ARTMASTER-PERFORMANCE-REPORT.md). Verdictul de produs rămâne [Not ready for production](ARTMASTER-PRODUCTION-READINESS.md), cu pași concreți de staging.

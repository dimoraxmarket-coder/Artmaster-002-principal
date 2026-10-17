# ARTMASTER — audit SEO

17 octombrie 2026, UTC. Proiectul Next.js existent, RO/RU/EN; bază PR #10 `1293224`. [Dovezi după](docs/reports/ultimate-audit/seo-crawl-after.json), [aceeași formulă înainte](docs/reports/ultimate-audit/seo-crawl-before-v2.json).

## Constatări verificate

Crawl local de **99 pagini**, incluzând pagini descoperite din linkuri: toate răspund cu 200. Zero titluri duplicate, zero descrieri duplicate, zero linkuri interne rupte în inventarul verificat. Sunt 90 de rute eligibile pentru inventarul SEO și nouă proiecte de concept intenționat noindex, absente corect din sitemap. Nu au fost publicate proiecte fictive.

| Zonă | Dovadă / rezultat |
| --- | --- |
| Canonical | URL absolut propriu fiecărei pagini; fără canonical comun RO pentru traduceri |
| Hreflang | RO/RU/EN și x-default spre echivalente; HTML lang potrivit rutei |
| Sitemap | Rute publicate eligibile, alternates; ciornele/admin/preview nu sunt incluse |
| Robots | Local/staging Disallow / și noindex sunt intenționate; producția nu a fost activată |
| JSON-LD | Organization/LocalBusiness, WebSite, Service, BreadcrumbList, Article după conținutul existent; fără ratinguri sau recenzii inventate |
| Distribuire | OG/Twitter, imagini locale și URL-uri canonical; păstrate |
| Imagini | 21 surse distincte img/picture verificate HTTP 200 în conținutul repository-ului |
| Redirecturi | Root `/` → `/ro` este verificat de browser. **Lista legacy este goală**; nu există un test reușit al unor redirecturi inexistente |

Slugurile serviciilor rămân stabile sub prefixele de limbă, pentru compatibilitate. Traducerea slugurilor ar necesita un proiect separat de migrare și redirecturi; nu este impusă pentru hreflang corect.

## Corecții implementate

- Nouă cazuri cu nivel de titlu sărit în listele de servicii/echipamente/portofoliu: se adaugă H2 accesibil, fără schimbare vizuală.
- Șase descrieri prea scurte conform euristicii locale: metadatele folosesc descrierea tradusă deja existentă; textele vizibile și datele de business nu sunt rescrise.
- Titlul SEO al homepage-ului menționează Chișinău/Moldova, conform pieței declarate de proprietar, în toate trei limbile.
- JSON-LD primește validări structurale suplimentare: graph nevid, tipuri, câmpuri pentru schemele aplicației, ordinea breadcrumb și URL-uri.
- SEO Center are istoric persistent, comparații, filtrarea rezultatelor și auditul întregului inventar, cu progres și anulare.
- Rezultatele vechi nu sunt prezentate ca acoperire curentă după alt conținut publicat/build/politică de indexare. Ciornele nu schimbă acoperirea publicată.

După corecții, în crawl nu mai sunt eșecuri de heading sau descriere. Cele 99 eșecuri robots/indexing sunt păstrate pentru mediul local. Cele nouă absențe din sitemap aparțin conceptelor noindex și sunt așteptate.

## Formula transparentă v2

Scorul paginii este suma ponderilor verificărilor trecute. Eșecul sau lipsa dovezii acordă zero. Suma ponderilor este 100.

| Verificare | Puncte |
| --- | ---: |
| Titlu: unul, 15–70 caractere | 10 |
| Descriere: una, 50–180 caractere | 8 |
| Canonical propriu | 10 |
| Hreflang RO/RU/EN/x-default | 10 |
| Prezență în sitemap | 6 |
| Reguli robots ale aplicației | 6 |
| JSON-LD structural | 10 |
| Atribut alt pe imagini | 6 |
| Linkuri interne în inventar/assets | 8 |
| HTTPS/configurație și lipsa noindex | 8 |
| H1 și ierarhie heading | 6 |
| HTML lang | 4 |
| OG/Twitter | 6 |
| Viewport mobil | 2 |

Scorul general este media aritmetică numai când toate paginile eligibile au rezultate pentru versiunea curentă. Paginile neverificate nu primesc scor extrapolat. În fixture-ul local verificat, rezultatul general este **86/100**: cele 14 puncte de robots/indexare rămân intenționat neacordate. Formula anterioară era 10×10; comparațiile înainte/după din acest raport folosesc aceeași formulă v2.

Limite: lungimea textului este o euristică; alt gol poate fi decorativ; calitatea traducerilor și a descrierilor necesită review uman. Unicitatea între pagini este verificată de crawlerul de release, separat de controlul de lungime per pagină. Linkurile externe și fragmentele nu sunt certificate de audit. Validatorul JSON-LD local nu înlocuiește Rich Results Test și nu confirmă adevărul informațiilor comerciale. Scorul nu prezice poziția în Google.

## Analytics, PageSpeed și confidențialitate

- Cererile CRM sunt totaluri persistente, independente de paginare; nu sunt vizitatori.
- GA4: utilizatori, sesiuni, key events, rata sesiunilor cu eveniment cheie, zile, top zece canale și pagini, numai după răspuns valid.
- Search Console: clickuri, afișări, CTR și poziție medie ponderată cu afișările. Nu sunt cerute interogări sau identități de vizitator.
- PageSpeed: mobil/desktop, patru categorii de laborator, separat de CrUX p75 LCP/INP/CLS. Lipsa datelor rămâne null.
- Providerii neconectați nu primesc valori demo. Filtrele au maximum 93 zile; CRM folosește UTC, GA4 fusul proprietății și Search Console zile Pacific Time.
- Gtag pornește numai cu opt-in, fără datele formularului; query/fragment și calea referrer sunt eliminate. Navigarea SPA este urmărită o dată pe pathname. Retragerea elimină numai cookie-urile GA.

**Google real: NOT TESTED.** Testul separat cu ID sintetic și script interceptat probează comportamentul aplicației, fără conectare Google. Lighthouse local are SEO 69 deoarece mediul este blocat corect la indexare. Acesta este alt indicator față de scorul intern 86 sau valorile Search Console.

## Priorități și oportunități de conținut

| Prioritate | Acțiune |
| --- | --- |
| P1 | Validare staging, preview privat/media și hosting înainte de indexare |
| P2 | Inventar real al URL-urilor vechi și mapare 301 revizuită; `legacy-redirects.json` este gol |
| P2 | Rich Results Test, inspecția URL și sitemap în Search Console pentru originea aprobată |
| P3 | LCP mobil cu activele finale și condiții reale; date de teren indisponibile |
| P4 | Ghiduri originale despre fișiere, alegerea materialelor și cereri complete, legate de cele 11 servicii existente |
| P4 | Studii de caz reale cu fotografii autorizate și informații aprobate; fără rezultate/clienți inventați |
| P4 | Pagini pentru casete luminoase/print latex/tăiere laser doar după confirmarea diferențelor și capabilităților |
| P5 | Editor dedicat de override SEO și controale globale de unicitate în UI; istoric PageSpeed persistent și automatizare programată |

Grupuri RO/RU recomandate, fără volum sau poziții pretinse:

| Intenție | RO | RU | Destinație actuală |
| --- | --- | --- | --- |
| UV | imprimare UV Moldova; print UV Chișinău | УФ-печать Кишинёв; УФ-печать Молдова | servicii/print-uv |
| Format mare | print de format mare; imprimare banner Chișinău | широкоформатная печать Кишинёв; печать баннеров | imprimare-mari-dimensiuni; print-bannere |
| Firme/litere | litere volumetrice Chișinău | объёмные буквы Кишинёв; изготовление вывесок | litere-volumetrice |
| CNC | frezare CNC Moldova | фрезеровка ЧПУ Молдова | frezare-cnc |
| Laser | gravură laser Chișinău | лазерная гравировка Кишинёв | gravura-laser |
| Auto | colantare auto Chișinău | оклейка автомобилей Кишинёв; брендирование автопарка | colantare-auto |

Prioritizarea folosește capabilitățile din proiect și cererea declarată de proprietar; nu există date Keyword Planner/GSC care să demonstreze volume. Evitați pagini aproape identice pentru fiecare sinonim. [Propuneri editabile, nepublicate](docs/content-opportunities-drafts.md).

Conectarea Google, drepturile minime și pașii exacți: [documentația integrărilor](docs/seo-analytics-hero-equipment.md). Referințe: [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data). Sursele concurenților și limitele cercetării sunt în [raportul separat](ARTMASTER-COMPETITOR-ANALYSIS.md).

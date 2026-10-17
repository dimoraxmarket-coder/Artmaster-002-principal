# ARTMASTER — verificare tehnică SEO și integrare

17 octombrie 2026, Europe/Chișinău. Bază verificată: PR #11, commit `6603bc6ae611383072985582ddcad88ab56c6976`; toate schimbările anterioare sunt păstrate. Branch nou: `feature/artmaster-moldova-organic-growth`, PR separat către `feature/artmaster-ultimate-seo-security`. Niciun deploy, merge, DNS sau acces la datele vechiului site live.

## Constatări și acțiuni bazate pe probe

| Prioritate | Constatare verificată | Schimbare / stare |
| --- | --- | --- |
| P2 | Metadatele publice erau generate corect, dar nu aveau câmpuri SEO independente editabile prin CMS | Implementat `seo?: PageSeo[]`, titlu/description RO/RU/EN pe rutele existente; ciornă, preview privat, publicare explicită și restaurare în ciornă nouă |
| P2 | Sitemap, canonical, hreflang, lang și JSON-LD existau; nu era necesară înlocuirea arhitecturii | Păstrate. Inventarul de rute este centralizat între CMS/SEO/sitemap pentru a evita diferențe de vizibilitate |
| P2 | Inventarul redirecționărilor vechi este gol | Rămâne poartă de lansare; nu am inventat URL-uri istorice sau redirecturi. Obțineți lista de la proprietar/GSC și testați fiecare mapare |
| P3 | Lighthouse pe pagina UV: CTA cu contrast 3,68:1 și imagine equipment fill deformată | Culoare lizibilă din designul existent; `object-fit: cover`, SVG contain. Test WCAG ≥4,5:1 pe RO/RU/EN, axe și verificare vizuală |
| P4 | Serviciile aveau FAQ/echipamente/servicii conexe și CTA, dar nu legături inverse către ghidurile/proiectele asociate | Legături server-rendered în layout-ul existent; proiecte numai reale și publicate, ghiduri numai publicate; secțiunile goale sunt omise |
| P5 | Auditul HTML/istoricul și Google readonly erau deja implementate | Adăugat inventar editorial real, filtrat pe limbă, cu recomandări și link către Content Studio. Google rămâne Neconectat fără credențiale |
| P1, prevenție | Preview autentificat înaintea citirii asincrone putea continua fără a reverifica sesiunea după citire | Revalidare înainte de returnarea ciornei și regresie pentru revocare în timpul citirii. Nu pretindem o exploatare dovedită în producție |

Nu am constatat un defect de rutare pentru `/servicii/slug/extra`: resolverul refuză deja segmentele suplimentare. Nu am publicat servicii noi, program de lucru, specificații sau cazuri comerciale neverificate. Partners, siglele publicate, bannerul panoramic, fișierele și baza utilizatorului nu sunt rescrise.

## Arhitectură multilingvă păstrată

- Next.js App Router, conținut public randat pe server; interacțiunile existente rămân client components unde este necesar. Un singur proiect integrează website, admin și API; fără backend PHP.
- `/ro`, `/ru`, `/en`, HTML lang corespunzător, canonical absolut către propria limbă, alternates reciproce ro/ru/en/x-default. Variantele sunt descoperibile prin linkuri și sitemap.
- Segmentele de serviciu rămân comune și stabile; nu este necesară o migrare SEO riscantă pentru traducerea slug-urilor. Un query de preselectare în formular nu creează altă pagină canonică.
- Root `/` redirecționează permanent spre `/ro`. Rute inexistente returnează 404. Publicarea și disponibilitatea media controlează ce poate fi accesat, nu robots singur.
- Draft/admin/API și preview privat: autentificare, no-store/noindex și excludere din sitemap. Portfolio concept intenționat noindex; nu este prezentat ca lucrare client.
- În local/staging indexarea rămâne oprită. Scorul de audit scade corect pentru robots/noindex; nu activăm indexarea pentru o notă mai mare.

## Utilizarea metadatelor în CMS

1. `/admin` → **Content Studio** → **Metadate SEO**. Selectați pagina și RO/RU/EN.
2. Editați titlul complet și descrierea. Preview-ul de fragment este ilustrativ, nu rezultatul real Google. Google poate modifica ambele texte în rezultate.
3. Salvați ciorna. Deschideți preview-ul salvat: afișează layout-ul public și metadatele ciornei, numai autentificat, no-store/noindex. Linkul deschide pagina selectată și limba curentă.
4. Adminul confirmă publicarea. Editorul poate salva/preview, viewerul doar citi; autorizarea rămâne pe server. Publicarea este a **întregii versiuni CMS**, nu doar a câmpului SEO; revizuiți toate schimbările din document.
5. Restaurarea unei versiuni creează o ciornă nouă cu conflict protection. Publicul rămâne pe versiunea publicată până la o altă publicare explicită.

Validare server: maximum 500 intrări; path unic și existent în document, fără host, query, admin/API sau rute inventate. Fiecare limbă: title 15–70 și description 50–180 caractere, text simplu fără HTML/control chars. Intervalele sunt reguli editoriale ale aplicației, **nu limite sau factori de clasare Google**. Canonical/robots/script nu pot fi introduse ca proprietăți noi. React/Next escapează valorile. Ștergerea/reden­umirea unei entități actualizează numai referințele SEO ale documentului editat, cu avertizarea existentă pentru redirecționări.

## SEO Center: patru măsurători diferite

1. **Audit tehnic intern:** formula v2, 14 verificări = 100 puncte. Greutăți: title 10, description 8, canonical 10, hreflang 10, sitemap 6, robots 6, JSON-LD 10, alt 6, linkuri 8, indexing 8, headings 6, lang 4, social 6, viewport 2. Suma verificărilor trecute; indisponibil/eșec = 0. Global numai cu acoperire curentă completă. Nu este scor Google.
2. **Inventar editorial nou:** date din CMS publicat pentru cele 11 servicii × 3 limbi; fără scor agregat. Numără câmpurile text/FAQ/utilizări/brief și legăturile către dovezi publicate; detectează metadate identice în aceeași limbă. Sub 180 cuvinte cere revizie, fără a recomanda umplutură. Nu certifică toate paginile HTML, licențe sau calitatea traducerii.
3. **PageSpeed/Lighthouse:** laborator mobil/desktop și CrUX p75 LCP/INP/CLS separat. Lipsa datelor rămâne null. TBT din laborator nu este INP real. Testele locale nu folosesc API Google și nu certifică hostingul public.
4. **Search Console/GA4/CRM:** surse distincte, date reale numai conectate. CRM numără cereri salvate și nu vizitatori. Nu împărțim toate cererile CRM la sesiunile GA4 care au consimțământ.

API nou `/api/admin/seo/content`: sesiune live/AAL2 conform modului Supabase, rate limit 60/oră/actor, no-store și revalidare după citire. Returnează numai inventar publicat și recomandări, fără contacte CRM, tokenuri sau ciorne. Fără queryuri care să activeze drafturi. Viewer/editor/admin pot citi același conținut publicat; scrierea continuă prin API CMS existent.

## Structured data și recomandări Google actuale

Păstrate Organization/LocalBusiness (NAP din CMS), WebSite, Service, BreadcrumbList și Article, unde există conținut. JSON-LD este serializat sigur, fără review/rating, prețuri, certificări sau program inventat. Adresa implicită necesită reconfirmarea proprietarului; nu este verificare GBP. Nu adăugăm Product/Offer pentru un serviciu fără date reale și nu pretindem rich-result eligibility pentru simpla prezență a Service.

Pe 17 octombrie 2026 am putut citi documentația oficială despre [hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions), [titluri](https://developers.google.com/search/docs/appearance/title-link), [snippets](https://developers.google.com/search/docs/appearance/snippet), [LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business) și [update-urile Search Central](https://developers.google.com/search/updates#removing-faq-rich-result). Ultima sursă confirmă retragerea FAQ rich results din 7 mai 2026 și eliminarea documentației. Păstrăm FAQ utile utilizatorilor; nu construim o promisiune de rich result depășită. Probele de acces sunt în [guidance-sources.json](docs/reports/moldova-growth/guidance-sources.json). Regulile GBP sunt [referință oficială](https://support.google.com/business/answer/3038177), dar accesul la acel articol a fost blocat; nu pretindem lectură live a lui.

Validarea JSON-LD implementată verifică structură/tipuri/câmpuri suportate, nu este validatorul complet Schema.org sau Google Rich Results. Testul extern Google Rich Results și indexarea reală sunt **NOT TESTED**; trebuie executate după aprobarea unui staging accesibil adecvat, fără trimiterea ciornelor/private media.

## Conectarea Google — pași exacți pentru proprietar

Nicio cheie Google, proprietate GA4 sau Search Console nu este configurată în mediul curent. Adaptoarele testate cu răspunsuri sintetice nu certifică integrarea găzduită. Configurarea externă nu a fost executată.

1. Folosiți un proiect Google Cloud aprobat și, pentru validare, o proprietate **GA4 de staging separată**. Nu conectați vechiul website live în timpul testelor locale.
2. Activați **Google Analytics Data API** (`analyticsdata.googleapis.com`), **Search Console API** (`searchconsole.googleapis.com`), opțional **PageSpeed Insights API** (`pagespeedonline.googleapis.com`). Revizuiți cote/costuri.
3. Creați un service account dedicat, fără rol de administrator de proiect. Acordați **Viewer** pe proprietatea GA4 și cel mai mic acces Search Console care permite citirea Performance. Verificați proprietatea Search Console prin metoda Google autorizată de proprietar; nu am schimbat DNS.
4. Păstrați cheia privată în secret manager/runtime server. Configurați exclusiv server-side: `ARTMASTER_GOOGLE_REPORTING_ENABLED=true`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` PEM, `GA4_PROPERTY_ID` numeric, `GSC_SITE_URL`. Aceasta din urmă trebuie să fie exact `https://<SITE_URL host>/` sau `sc-domain:<SITE_URL hostname>`. Nu folosim prefix `NEXT_PUBLIC_`, chei în browser sau formular de introducere a secretelor.
5. Egress: `oauth2.googleapis.com`, `analyticsdata.googleapis.com`, `searchconsole.googleapis.com`. Biblioteca întreținută google-auth-library solicită doar `analytics.readonly` / `webmasters.readonly`. Rotiți/revocați cheia potrivit politicii proprietarului.
6. Pentru colectare publică setați separat `GA_MEASUREMENT_ID=G-...` numai în mediul aprobat. ID-ul numeric al proprietății este diferit de measurement ID. `GSC_VERIFICATION` este dovadă publică opțională a verificării, nu autentificare API.
7. Configurați `generate_lead` ca eveniment-cheie dacă aceasta este conversia dorită. Dezactivați colectările automate Enhanced Measurement care ar dubla evenimentele sau ar trimite queryuri/date formular (history page views, form interactions, site search, outbound links), și colectarea datelor furnizate de utilizator. Verificați consent accept/refuse/withdraw, DebugView și payloadurile reale fără PII. Refuzul analytics nu împiedică CRM.
8. Opțional: `ARTMASTER_PAGESPEED_ENABLED=true`, `PAGESPEED_API_KEY` server-only, key restricționată/cotă. Numai rute publice aprobate HTTPS, fără localhost/IP/private preview. Acțiunea din UI cere confirmare; viewerul nu o poate executa. Datele CrUX insuficiente rămân indisponibile.
9. Reporniți doar mediul aprobat; comparați rezultatele date-filtered cu interfețele Google, ținând cont de UTC pentru CRM, fusul proprietății GA4 și Pacific Time pentru Search Console. Rapoartele sunt cached 15 minute, fără tokenuri persistate. Nu împărțiți metrici din calendare diferite fără explicație.
10. Notați rezultatul real, permisiunile, cotele și persoana responsabilă; testați indisponibilitatea, revocarea cheii și bundle-urile fără secrete. Revizuiți obligațiile Moldova privind confidențialitatea, cookie-urile și retenția cu persoana responsabilă; acest cod nu este aviz juridic.

Referințe oficiale accesibile în această cercetare: [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1), [Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [PageSpeed](https://developers.google.com/speed/docs/insights/v5/get-started), [Web Vitals](https://web.dev/articles/vitals). Nu confundăm accesul la documentație cu o conexiune API autorizată.

## Date, migrare, compatibilitate și limite

Extensia SEO este un câmp JSON opțional în documentul CMS deja versionat. Nu necesită tabele sau migrare SQL nouă; vechile documente rămân valide, inclusiv variantele fără seo. Immutable snapshots/CAS/audit/validarea media și RLS sunt reutilizate. Nu se scrie automat metadata peste conținutul publicat. Un rollback la un binar vechi cu schema strictă poate refuza câmpul nou; folosiți binar compatibil, nu ștergeți câmpuri sau istoric pentru a forța rollback-ul.

START.bat, CREATE-ADMIN.bat și bootstrap local rămân neschimbate. Allowlist-ul de packaging include cele cinci rapoarte noi; arhiva se generează numai din commit curat, fără runtime/DB/atașamente/secrete. Node 24 este cerut de proiect. Autentificarea SQLite cu parolă este numai pentru teste izolate, nu echivalentul MFA Supabase. Windows nativ nu este disponibil aici.

Riscuri rămase: NAP/program și servicii noi de confirmat; fotografii/cazuri reale; redirecturi vechi; backup/restaurare și hosting real; integrare Google/Supabase staging. `getContent` are fallback existent la conținutul din repository dacă providerul nu răspunde: trebuie decis/monitorizat în staging pentru a evita afișarea unui baseline diferit în timpul unei avarii. Nu am schimbat această politică de disponibilitate într-o fază SEO.

## Checklist de lansare — nicio acțiune executată automat

- [ ] Revizie și integrare ordonată a stack-ului PR-urilor, fără pierderea ramurilor. Rerulare pe candidatul combinat; niciun PR nu este merged aici.
- [ ] Supabase staging separat cu date sintetice; toate migrările în ordine; TOTP real/AAL2 pentru toate rolurile, revocare, expirare, suspendare, RLS și Storage direct validate.
- [ ] Backup separat criptat și restaurare pe copie; confirmați retenția, răspunsul la avarie și comportamentul fallback CMS.
- [ ] Hosting compatibil Next/Node 24, reverse proxy de încredere, HTTPS/cookies/headers, rate limits și notificări reale testate; fără a afecta Host.md.
- [ ] NAP, program și servicii confirmate; traduceri și fotografii autorizate; conceptele rămân etichetate.
- [ ] Inventar URL vechi → URL nou, redirecturi verificate, canonical/alternates/sitemap și statusuri testate pe originea aprobată.
- [ ] Lighthouse mobil/desktop și CrUX când există date; axe/manual tastatură și formulare→CRM pe mediul final. Fără scoruri locale declarate drept performanță de producție.
- [ ] Google readonly și consent validate dacă vor fi activate; fără PII, date sintetice de staging, teste pe ambele stări conectat/indisponibil.
- [ ] Staging protejat/noindex; indexare activată numai pe originea publică finală după aprobare și fără blocarea accidentală a paginilor importante. Drafturile rămân autentificate.
- [ ] Aprobare separată de deploy/DNS, plan de rollback și monitorizare post-lansare. **Acest PR nu autorizează și nu execută lansarea.**

Rezultatele efectiv rulate și măsurătorile sunt în [raportul de implementare](ARTMASTER-SEO-IMPLEMENTATION-REPORT.md). Verdict: **Not ready for production**; codul este candidat pentru validare staging după review, nu sistem găzduit deja certificat.

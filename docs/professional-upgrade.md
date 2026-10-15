# ARTMASTER — branding, ofertare, SEO și parteneri

Versiune de dezvoltare: 14 octombrie 2026. Site-ul existent este păstrat, cu RO/RU/EN și româna principală.

## Branding

Simbolul roșu a fost izolat din referința vizuală furnizată, într-un fișier transparent. Este afișat cu proporțiile păstrate în header și footer, lângă ARTMASTER și ADVERTISING GROUP. Sursa raster și variantele PNG/WebP sunt în `public/branding/`; WebP-ul folosit în navigare are 160 px lățime și aproximativ 9,5 KB, suficient pentru dimensiunea afișată inclusiv la densitate de 3×. Nu este pretins un vector original al companiei: faviconul SVG este un container pentru imaginea raster, iar faviconul ICO și iconurile PNG sunt generate din același simbol.

`node scripts/build-brand-assets.mjs` regenerează faviconurile, Apple touch icon de 180 px, iconurile 192/512 px, wordmarkul și imaginile sociale RO/RU/EN de 1200×630 px. Sursa se păstrează pentru regenerare.

## Cum funcționează formularele

Formularele din homepage, Contact și pagina de ofertă folosesc `POST /api/quotes`. API-ul verifică originea, limita corpului cererii, schema datelor, tokenul semnat, timpul minim de completare, honeypot-ul, limitele de cereri și fișierele. ID-ul de idempotență împiedică înregistrări duplicate. Fișierele rămân private.

În dezvoltare, cererile sunt salvate în SQLite și fișierele în directorul privat `.data`. În producția recomandată se folosesc PostgreSQL, Auth și Storage privat din Supabase. Datele sunt disponibile echipei autorizate în `/admin`. Nu există cont sau parolă implicită.

Confirmarea vizitatorului indică **înregistrarea în baza de date**, cu un număr de referință. O eroare de validare sau stocare nu este prezentată ca succes. Butonul se dezactivează pe durata procesării. Dacă furnizorul de e-mail respinge notificarea după salvare, cererea există în continuare, iar notificarea rămâne `pending` pentru reîncercare. `sent` înseamnă acceptarea mesajelor de către furnizor, nu dovada livrării în inbox.

Notificarea companiei include serviciul, numele, e-mailul, telefonul, mesajul, datele opționale, timpul UTC și pagina de origine. URL-ul folosește domeniul configurat și un traseu validat, fără parametri de tracking. Datele sunt escapate în HTML și trimise și ca text UTF-8. `Reply-To` este e-mailul clientului, iar expeditorul este adresa autorizată a companiei.

## Configurarea e-mailului

- `RESEND_API_KEY`: cheie privată Resend, numai pe server, introdusă securizat în mediul de găzduire.
- `RESEND_FROM_EMAIL`: adresă de expediere de pe domeniul verificat în Resend; forma permisă poate fi `ARTMASTER <adresa-verificata@domeniul-tau>`.
- `CONTACT_RECIPIENT_EMAIL`: destinația notificărilor, inițial adresa publică verificată `office@artmaster.md`. Modifică această variabilă pe hosting și repornește/republică aplicația.
- `QUOTE_NOTIFICATION_EMAIL`: numele vechi este acceptat pentru compatibilitate; noua variabilă are prioritate.
- `CONTACT_SEND_CONFIRMATION=true`: trimite și confirmarea localizată clientului după salvarea cererii și acceptarea notificării companiei. `false` dezactivează confirmarea.

Creează contul Resend, adaugă domeniul real, publică în DNS înregistrările cerute de furnizor și așteaptă verificarea lui. Apoi configurează cheia și expeditorul; nu folosi parola căsuței de e-mail. Nu sunt necesare credențiale SMTP pentru această integrare.

Test real: pe domeniul de staging/hosting corect configurat, trimite o cerere către un serviciu existent cu o adresă a ta. Verifică referința în `/admin`, jurnalul Resend, e-mailul companiei, confirmarea clientului și răspunsul prin Reply-To. Nu presupune livrarea dacă furnizorul doar a acceptat apelul API. După corectarea unei configurări, folosește acțiunea de reîncercare din admin sau `npm run notifications:retry`; programează comanda pe hosting, de exemplu la fiecare 5 minute. Reîncercările folosesc aceleași chei de idempotență, în limitele contractului furnizorului.

## Servicii și SEO

Proprietarul a confirmat colantarea auto, stickerele, bannerele, brandingul/designul și standurile/construcțiile publicitare. Au fost adăugate cinci pagini sub structura existentă, cu conținut, aplicații, informații pentru ofertare, FAQ și legături relevante în toate cele trei limbi:

- `servicii/colantare-auto`
- `servicii/stickere-personalizate`
- `servicii/print-bannere`
- `servicii/branding-design`
- `servicii/standuri-expozitionale`

Cele șase servicii existente își păstrează adresele. Nu se schimbă `imprimare-3d` în `printare-3d` și nici `frezare-cnc` în `debitare-cnc`; sinonimele sunt tratate în aceeași pagină. Ilustrațiile noi sunt identificate ca ilustrații, iar imaginile de concept existente nu sunt prezentate ca proiecte reale.

Mapa semantică inițială în `src/lib/seo-content.ts` grupează variante românești, rusești și englezești: print UV, format mare, litere volumetrice, imprimare/printare 3D, frezare/debitare CNC, gravură/gravare laser, colantare/încleiere/inscripționare auto, stickere/autocolante/etichete, bannere, branding și standuri. Termenii privesc Moldova, Chișinău și atelierul real din Durlești. Mapa este un plan calitativ, nu o cercetare cu volume de căutare măsurate. Termeni despre materiale sau iluminare cer evaluarea cerințelor și nu promit specificații ori servicii neconfirmate. Nu sunt generate pagini locale repetitive, blocuri ascunse sau liste de cuvinte în textul vizibil.

Metadatele au titluri și descrieri localizate, canonical, hreflang RO/RU/EN și x-default, Open Graph și Twitter, inclusiv imaginile sociale ale brandului. Descrierile paginilor juridice sunt distincte. Sitemap-ul include paginile canonice și proiectele reale publicate, exclude conceptele, adminul și API-urile. BreadcrumbList este unic și corespunde navigării vizibile. Un singur nod Organization/LocalBusiness folosește contactele verificate, cu logo ImageObject și WebSite, iar serviciile au scheme Service. Nu sunt adăugate coordonate, program, recenzii sau profiluri sociale inventate.

Producția refuză un `SITE_URL` nesigur sau localhost. Excepția `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true` este pentru verificări locale pe o singură mașină. Indexarea rămâne dezactivată pentru localhost și staging; configurează `SITE_INDEXABLE=true` numai după verificarea site-ului real HTTPS.

Butonul de ofertă din fiecare serviciu preselectează serviciul. Schimbarea limbii păstrează această selecție din URL. Măsurarea conversiilor rămâne condiționată de o proprietate GA reală și consimțământ: înregistrare confirmată și apel telefonic, fără date personale în evenimente.

## Parteneri

Datele sunt în `src/lib/partners.ts`. Adaugă pentru fiecare companie verificată: `name`, `logo` (fișier în `public/partners`), `website` opțional HTTPS și `alt` în RO/RU/EN. Publică doar logouri și relații pentru care ai acordul.

`PartnersMarquee` folosește CSS pentru două copii identice ale unui grup de logouri, fără gol la reluare. Copiile sunt ascunse de cititoarele de ecran. Animația se oprește la hover, la focus în listă sau cu butonul de pauză. În modul reduced motion, se afișează o listă statică. Dimensiunile sunt rezervate, iar viteza este adaptată numărului de elemente.

Proprietarul a cerut exemple până la confirmarea partenerilor reali. `PARTNERS_PREVIEW=true` afișează logouri demonstrative, marcate vizibil. Acestea sunt ascunse automat dacă site-ul este indexabil. În producție setează `PARTNERS_PREVIEW=false`; dacă nu există parteneri reali, secțiunea nu este afișată.

## Lansare și Google

1. Folosește hosting compatibil cu Next.js/Node.js 24+. Un hosting Joomla exclusiv PHP nu rulează direct această aplicație. Domeniul existent poate fi păstrat; nu modifica încă Joomla/DNS fără planul de migrare și aprobarea ta.
2. Creează Supabase și aplică migrarea din proiect. Configurează `ARTMASTER_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, secretele formularului/sesiunilor, utilizatorii și rolurile. Verifică MFA, storage privat și copiile de siguranță conform documentației existente.
3. Configurează Resend și destinatarul. Setează `SITE_URL=https://artmaster.md`, HTTPS și variabilele de analiză numai dacă există proprietăți reale. Păstrează staging-ul noindex; după verificări, activează indexarea pe domeniul public.
4. Inventariază URL-urile Joomla, traficul și backlinkurile și completează redirecturile 301 doar pe baza acestui inventar. Actualizează fotografiile, textele comerciale și legale, verifică formularul și restaurează o copie de siguranță înainte de migrare.
5. În Google Search Console adaugă proprietatea de domeniu `artmaster.md`, verifică DNS prin înregistrarea furnizată de Google. Dacă alegi proprietate URL-prefix, poți folosi `GSC_VERIFICATION` pentru eticheta meta reală.
6. Trimite `https://artmaster.md/sitemap.xml`, verifică paginile prin URL Inspection și urmărește rapoartele Pages și Core Web Vitals. Indexarea nu este instantanee și pozițiile nu sunt garantate.
7. Revendică și verifică profilul real Google Business Profile, apoi aliniază numele, adresa, telefonul și site-ul cu cele publicate. Nu sunt create profiluri sau linkuri sociale fictive.
8. Urmărește afișările, clicurile și interogările reale în GSC; folosește aceste date pentru actualizarea conținutului și validarea mapei de cuvinte cheie.

## Configurări încă externe

Supabase și furnizorul de e-mail nu au fost configurate de proprietar. Nu este verificată livrarea reală în inbox, găzduirea publică, HTTPS-ul public sau indexarea live. Fotografiile reale de producție, partenerii și auditul URL-urilor Joomla rămân necesare. O eventuală bază CMS deja publicată păstrează conținutul său: adaugă/publică noile servicii în admin dacă instanța ta folosește date personalizate, nu valorile implicite din cod.

## Performanță și verificare

Imaginea principală își păstrează aspectul și încadrarea, dar folosește variante AVIF/WebP generate înainte de deploy, cu o variantă decupată pentru telefon. Browserul le încarcă prioritar, fără a aștepta prima conversie pe server. `node scripts/optimize-hero.mjs` le regenerează din imaginea de concept existentă. Fotografiile utilajelor trimise ulterior nu sunt aceste imagini.

Fonturile rămân locale și păstrează contururile și greutățile variabile originale. Două subseturi pentru cele șase caractere românești specifice au împreună aproximativ 5,2 KB; fonturile Latin și Cyrillic existente rămân disponibile. Astfel, pagina românească nu descarcă întregul Inter Latin-ext de aproximativ 85 KB. Regenerarea opțională folosește `scripts/subset-romanian-fonts.py`, cu FontTools și Brotli; utilizatorul nu are nevoie de Python pentru instalarea sau rularea site-ului. Licențele OFL sunt în `docs/licenses`.

Configurația Next.js 16.4 folosește opțiunea experimentală `inlineCss` pentru a elimina cererile CSS care blocau prima afișare. Compromisul este includerea stilurilor în fiecare răspuns HTML, în locul unui cache separat de stylesheet. Buildul, navigarea și paginile sunt verificate cu această configurație.

Rezultatele finale, măsurarea Lighthouse și limitele verificării sunt în [upgrade-validation.md](upgrade-validation.md). Nu s-au trimis e-mailuri externe și nu este pretinsă o verificare a găzduirii publice sau a indexării Google. Funcțiile UX adăugate ulterior sunt explicate în [ux-features.md](ux-features.md).

Fișierele principale modificate: `.env.example`, `next.config.ts`, layouturile și ruta de conținut, `globals.css`, header/footer/home/icons/quote-form, valorile implicite ale conținutului, `seo.tsx`, `site.ts`, `proxy.ts`, schema/tipurile/înregistrarea/notificările cererilor. Fișiere noi: `partners-marquee.tsx` și CSS-ul său, `partners.ts`, `seo-content.ts`, `additional-services.ts`, `manifest.ts`, `build-brand-assets.mjs`, asseturile de branding și exemple/ilustrații, `notifications.test.ts`, `seo.test.ts`, `upgrade.e2e.ts` și acest ghid.

# ARTMASTER COMPLET — testare locală pe Windows

**Pachet integrat PR #2–#9:** include împreună SEO & Analytics, Echipamente, bannerul panoramic și Parteneri. Începe cu [VERSIUNEA-COMPLETA.md](VERSIUNEA-COMPLETA.md) pentru lista funcțiilor, acces și limite. Documentele din fazele vechi descriu versiunile de atunci.

Acesta este același proiect Next.js: website public RO/RU/EN + cabinetul administrativ premium + CRM + Media Studio + Content Studio + Security Center. Nu există un backend PHP separat. Codul include etapele suprapuse PR #2–#7; PR-urile nu trebuie îmbinate pentru testarea acestei copii.

**Doar pentru testare izolată pe PC.** Autentificarea locală cu parolă în SQLite nu este echivalentă cu MFA Supabase. Producția păstrează AAL2 obligatoriu. Pachetul nu configurează, nu contactează și nu validează un proiect Supabase real și nu publică website-ul.

## 1. Instalare

1. Instalează **Node.js 24 LTS sau o versiune compatibilă mai nouă**, cu npm, de la [nodejs.org](https://nodejs.org/). Închide și redeschide ferestrele după instalare. Nu este necesar PHP, XAMPP, MySQL sau un server separat.
2. Extrage **tot ZIP-ul** într-un folder nou, de exemplu `C:\ARTMASTER-COMPLETE-WINDOWS`. Nu porni fișierele direct din arhivă. Nu extrage peste un proiect sau o bază de date existentă. O cale scurtă, în afara OneDrive, simplifică depanarea.
3. Deschide `START.bat`. Prima pornire instalează pachetele fixate în `package-lock.json` și necesită internet. Instalarea include fonturile locale Inter/Manrope, Next.js și componentele native Sharp/SWC pentru platforma PC-ului; nu se încarcă fonturi de pe un CDN la vizitarea site-ului.
4. Așteaptă mesajul Next.js **Ready**. Păstrează consola deschisă.

Website: **http://localhost:3000** (redirijează la `/ro`). Cabinet: **http://localhost:3000/admin**.

Pentru oprire, apasă **Ctrl+C** în consolă. Dacă Windows întreabă dacă închide scriptul batch, confirmă cu `Y`. Datele rămân salvate pentru următoarea pornire. Nu configura port forwarding, tunel public sau acces din internet pentru această copie.

`START-WINDOWS.cmd` rămâne o scurtătură compatibilă către `START.bat`.

## 2. Cont administrativ

Deschide `CREATE-ADMIN.bat`, introdu adresa de e-mail locală, apoi rolul `admin`, `editor` sau `viewer` (implicit `admin`). Parola are **12–128 caractere**, se introduce în consola securizată a fluxului existent și nu este afișată. Nu există cont sau parolă implicită. Nu pune parola într-un fișier, în Git sau în argumentele comenzii.

Poți crea contul înainte sau după pornirea serverului. Scriptul pregătește aceeași bază SQLite izolată. Un cont cu același e-mail nu este suprascris. După creare, intră în `/admin`. Pentru prima verificare folosește rolul `admin`; creează separat `editor` și `viewer` dacă vrei să verifici permisiunile.

Lansatorul folosește `scripts/create-admin.ts`, hashing-ul și sesiunile existente; nu adaugă un mecanism de resetare MFA. Etichetele Security Center reflectă modul local. TOTP/AAL2, RLS și revocarea reală Supabase necesită staging separat, descris în documentația de securitate.

## 3. Configurație și date

- La prima pornire se creează `.env.local` din `config/windows.env.example`, fără chei sau parole. Un fișier de mediu diferit este **refuzat, nu suprascris**. Alte `.env*` de dezvoltare/producție sunt refuzate pentru a evita folosirea unei configurații străine.
- SQLite se inițializează automat prin codul existent în **`.data\windows-local\artmaster.sqlite`**. Același folder păstrează imaginile, atașamentele private, secretele locale generate automat și marcajul de izolare. Datele sunt păstrate între porniri. Nu șterge acest folder dacă ai nevoie de testele salvate.
- Nu se importă baze de date, clienți, fișiere private sau backup-uri de producție. Nu se creează automat clienți demonstrativi și nu există statistici inventate. Conținutul public inițial vine din datele statice ale repository-ului; imaginile marcate concept/exemplu rămân identificate.
- Notificările e-mail și analytics sunt dezactivate de lansator. Cererile se salvează în CRM fără a trimite mesaje externe. Harta Google se poate încărca numai dacă utilizatorul o solicită explicit, conform interfeței publice existente.
- Serverul ascultă exclusiv pe **`127.0.0.1`**. Modul local de producție nu este activat. Nu copia această configurație pe hosting.

Nu distribui ulterior folderul `.data`, `.env.local` sau un ZIP făcut manual după folosire: pot conține datele testelor și secrete locale. Arhiva livrată exclude aceste fișiere, `node_modules`, `.next`, `.git`, arhiva Joomla veche, backup-urile și urmele de test.

## 4. Teste manuale recomandate

Folosește numai nume/date sintetice, de exemplu „TEST LOCAL — nu este cerere comercială” și o adresă `test@example.invalid`.

1. În fiecare limbă RO/RU/EN, completează formularul de pe **homepage**, **Contact** și **Solicită ofertă**. Încearcă întâi câmpuri goale, apoi o solicitare validă. Poți atașa un PDF/PNG/JPEG de test în limitele afișate.
2. Confirmă referința cererii. În cabinet, deschide **Mesaje clienți**, caută e-mailul, deschide detaliile și verifică mesajul, serviciul, limba, pagina și atașamentul. Modifică starea, atribuie un responsabil, salvează o notă și reîncarcă pagina pentru a verifica persistența.
3. Verifică faptul că un browser fără sesiune nu poate descărca atașamentul. Rolul `viewer` poate consulta, dar nu poate modifica cererea; `editor` poate gestiona cereri/ciorne, iar publicarea cere `admin`.
4. În **Conținut**, editează un titlu pentru RO/RU/EN și salvează ciorna. Previzualizează privat în desktop/mobil. Website-ul public trebuie să păstreze textul publicat până când alegi explicit **Publică această versiune**.
5. În **Istoric și restaurare**, compară versiuni și restaurează o versiune într-o **ciornă nouă**. Publicarea rămâne o acțiune separată; imaginile inexistente/arhivate blochează restaurarea.
6. În **Portofoliu**, creează un proiect, completează traducerile și încarcă o fotografie de test. Salvează ciorna; URL-ul public trebuie să rămână inaccesibil. Activează afișarea după publicare și publică documentul separat. Verifică portofoliul public.
7. În **Media Studio**, verifică inventarul, selectarea imaginilor, înlocuirea în ciornă și protecția arhivării imaginilor folosite. În **Securitate/Echipă**, verifică sesiunile și permisiunile cu conturile sintetice create; nu există invitații sau recuperare MFA nesigură.

Modulele sunt în același cabinet: Dashboard, CRM, Portofoliu, Media, Conținut, Setări website, Echipă și Securitate. [Auditul CMS](docs/content-studio.md) enumeră exact câmpurile editabile și cele rămase în cod: galerii multiple, unele imagini/texte statice și linkuri sociale nu au încă management complet. Toate controalele activate au funcționalitate existentă; nu reprezintă o promisiune că fiecare secțiune a site-ului este deja editabilă.

## Banner și parteneri — extensia acestui pachet

În **Conținut → Banner Acasă**, încarcă PNG/JPEG (maximum 5 MB), bifează afișarea și salvează ciorna. Imaginea WebP este păstrată integral, fără tăiere și fără texte/butoane suprapuse. Poți selecta separat un fișier mobil. Verifică previzualizarea privată RO/RU/EN, apoi publică explicit versiunea. Fișierul original al noului banner nu a fost disponibil pentru descărcare în mediul cloud: pachetul păstrează imaginea existentă până la import; imaginea sintetică din teste NU este instalată ca banner.

În **Conținut → Parteneri**, importă candidații din captură sau adaugă unul manual. Cele 15 nume sunt neconfirmate și nepublicate inițial. Nu există logo-uri oficiale descărcate: accesul la domeniile candidate a fost blocat cu 403. Confirmă numele și relația, încarcă logo-ul PNG/JPEG autorizat, notează sursa și permisiunea, stabilește ordinea și vizibilitatea. Pentru un logo SVG oficial, exportă o versiune PNG transparentă; nu încărcăm SVG executabil în biblioteca privată. Numele poate fi publicat ca text fără logo, după confirmarea relației. Verifică o ciornă salvată, apoi publică separat. „Ascuns” și „Arhivat” nu șterg fișiere sau istoric. [Surse și limite](docs/banner-partners.md).

## 5. Probleme obișnuite

- **`node` nu este recunoscut / versiune prea veche:** instalează Node.js 24+, inclusiv npm și PATH, apoi redeschide fereastra. Verifică `node --version` și `npm --version`.
- **Portul 3000 ocupat:** oprește propria instanță veche cu Ctrl+C. Lansatorul nu închide alte programe. Alternativ, într-un Command Prompt în folderul proiectului rulează `set "ARTMASTER_LOCAL_PORT=3001"`, apoi `START.bat`; folosește adresele afișate cu portul 3001. Gazda rămâne locală.
- **Configurație/dată existentă refuzată:** folosește un folder nou extras din ZIP. Nu șterge și nu suprascrie `.env` sau SQLite din alt proiect. Directorul vechi `.data` nu este importat automat.
- **Instalare npm eșuată:** verifică internetul, spațiul liber, antivirusul și mesajul exact. Nu dezactiva TLS/integrity și nu folosi `npm audit fix --force`. Păstrează `package-lock.json`. Repornește `START.bat`; marcajul de instalare apare numai după succes.
- **Fișiere blocate / cale prea lungă:** oprește propria consolă, mută copia curată într-o cale scurtă, în afara folderelor sincronizate, și reîncearcă. Pentru Sharp/SWC verifică instalarea Node de 64 biți și dependențele opționale npm.
- **Pagina încă se compilează:** prima vizitare în modul de dezvoltare poate dura. Așteaptă mesajele consolei și reîncarcă după Ready.
- **Contul nu poate fi creat:** verifică e-mailul, rolul și lungimea parolei. Un cont existent nu este înlocuit și nu există parolă universală.
- **E-mail neconfigurat în CRM:** este comportamentul intenționat al copiei izolate. Datele sunt salvate în SQLite; nu sunt trimise e-mailuri reale.
- **SQLite, atașamente sau imagini lipsă:** confirmă că pornești aceeași copie și păstrezi `.data\windows-local`. Nu importa baze de date de producție pentru depanare.

## 6. Verificări tehnice și limite

`npm run local:prepare` pregătește dependențele/configurația/SQLite fără a porni serverul. `npm run local:admin` este echivalentul creatorului de cont. Pornirea zilnică se face prin `START.bat` pentru legarea sigură pe loopback.

Dezvoltatorii pot rula `npm run lint`, `npm run typecheck` și `npm test`. Verificările browserului folosesc Playwright, un build local și **un director de date temporar separat**. Nu le rula cu datele tale de lucru sau împotriva unui server Supabase/production. Instalarea Chromium prin `npx playwright install chromium` poate fi necesară. Testele de symlink pot necesita Windows Developer Mode; rularea nativă Windows a întregii suite nu este certificată.

Mediul de validare disponibil este Linux, fără Windows/cmd.exe. Logica Node portabilă, instalarea din arhiva extrasă, build-ul și fluxurile reale sunt verificate acolo; **dublu-clicul batch, consola/parola și modulele native pe Windows nu sunt declarate testate nativ**. Consultă raportul versiunii reunite din docs/complete-integration-validation.md. `PACKAGE-INFO.json` identifică sursa arhivei. Arhiva poate fi refăcută de un dezvoltator dintr-un checkout Git curat prin `npm run package:windows -- <director-in-afara-proiectului>`.

Înainte de orice lansare reală sunt obligatorii integrarea revizuită a PR-urilor, staging Supabase cu TOTP/RLS/storage reale, backup și restaurare verificate, verificarea hostingului Node și aprobarea proprietarului. Vezi [checklist-ul de release](docs/release-readiness-phase6.md). Acest pachet nu modifică artmaster.md/Host.md, DNS sau producția.

## SEO, banner și echipamente

Cabinetul include **SEO & Analytics** și **Echipamente**, păstrând cele opt module existente. Auditul SEO verifică paginile publicate locale; indexarea dezactivată în această copie este intenționată. Metricile Google rămân „Neconectat”; cererile CRM reprezintă datele locale salvate. Lansatorul dezactivează toate credențialele Google moștenite.

În Conținut → Acasă și Despre noi poți încărca/decupa separat bannerul desktop și mobil sau adăuga un MP4/WebM privat (maximum 20 MB), cu imagine poster. Confirmă drepturile fișierului, salvează ciorna și verifică previzualizarea. Publicarea rămâne o acțiune separată. Videoul nu este transcodificat; verifică redarea.

În Echipamente, adaugă numai fișele candidate relevante, confirmă modelul exact, completează RO/RU/EN, fotografia proprie/autorizată, specificațiile și nota drepturilor. Candidații nu sunt publicați automat. Sursele/licențele producătorilor nu au fost verificate online deoarece accesul de rețea a fost refuzat. Instrucțiuni Google, formula scorului și limite: [docs/seo-analytics-hero-equipment.md](docs/seo-analytics-hero-equipment.md).

# Securitate, acces și copii de siguranță

## Configurare

Secretele Supabase, Resend și cele folosite pentru semnarea tokenurilor/sesiunilor rămân pe server. În modul Supabase sunt necesare `ARTMASTER_FORM_SECRET` și `ARTMASTER_SESSION_SECRET`, fiecare cu cel puțin 32 de caractere aleatorii, create și păstrate în managerul de secrete. În modul local sunt generate și păstrate în baza privată. Nu le afișa în terminale publice sau în chat.

`SITE_URL` este originea exactă folosită de vizitatori; serverul respinge POST-urile din alte origini. Nu activa `ARTMASTER_TRUST_PROXY=true` decât dacă proxy-ul gazdei suprascrie antetul IP și nu permite unui client să îl falsifice. `ARTMASTER_IP_HEADER` trebuie să conțină o singură adresă IP verificabilă, implicit `x-real-ip`. Fără această configurație, limitarea folosește un bucket comun conservator; aceasta poate limita vizitatori legitimi și trebuie adaptată gazdei finale.

Antetele includ Content Security Policy cu nonce pentru scripturi, protecție de încorporare, `nosniff`, politică de referer și restricții pentru API-urile browserului. HSTS se verifică pe HTTPS, nu pe serverul local HTTP. Mecanismele și antetele nu înlocuiesc testarea permisiunilor sau actualizarea dependențelor.

## Formular și atașamente

`GET /api/quote-token` emite un token semnat și un identificator de idempotență. `POST /api/quotes` validează originea, datele, honeypotul, vârsta tokenului, serviciul ales, tipurile și dimensiunile fișierelor. Solicitările sunt salvate cu un identificator UUID; retrimiterea aceleiași cereri nu creează o copie. E-mailul neconfigurat este raportat intern ca `not_configured`; formularul nu pretinde că un mesaj a fost livrat.

Sunt acceptate maximum 3 PDF/JPG/PNG, cel mult 5 MB fiecare și 10 MB în total. Serverul verifică semnătura fișierului, extensia, tipul declarat și structura efectivă: imaginile sunt decodate cu limită de 30 milioane de pixeli, iar PDF-urile sunt parsate și respinse dacă sunt criptate sau conțin acțiuni active, JavaScript ori fișiere încorporate. Fotografiile de galerie sunt reencodate WebP fără metadatele originale. Executabilele și tipurile interzise sunt respinse. Atașamentele solicitărilor sunt păstrate privat cu nume de stocare aleatorii și descărcate numai prin acces autorizat. Aceste verificări nu sunt o scanare antivirus completă; stabilește cu furnizorul un flux antivirus/carantină înainte de a deschide fișiere necunoscute pe stațiile echipei.

Când Resend este configurat, aplicația trimite notificarea internă și confirmarea în limba solicitării. Starea `sent` confirmă acceptarea mesajelor de către furnizor, nu livrarea finală în inbox. Verifică livrarea și domeniul expeditorului separat; erorile rămân în coada de retrimitere administrativă.

## Administrare

Nu există cont demonstrativ. În dezvoltare creează un utilizator cu `npm run admin:create`, `ADMIN_EMAIL` și `ADMIN_ROLE` (`viewer`, `editor` sau `admin`). Introdu parola prin stdin conform scriptului; evită argumentele CLI, istoricul shell și fișierele versionate. Schema locală păstrează hashul parolei și sesiuni separate, cu permisiuni verificate pe server.

În producție configurează conturile Supabase Auth și atribuie rolurile autorizate. MFA este obligatorie pentru toate rolurile și toate datele administrative în modul Supabase; aplică și migrarea `202610150001_admin_mfa.sql`. Înainte de confirmarea AAL2 sunt permise numai înscrierea/verificarea MFA și ieșirea. Testează un cont din fiecare rol: `viewer` citește, `editor` poate salva drafturi și modifica starea solicitărilor, `admin` poate publica. O sesiune absentă, expirată sau un rol nepotrivit trebuie să fie respins, inclusiv la descărcarea atașamentelor.

Draftul și versiunea publicată sunt separate. Verifică textele în toate limbile înainte de publicare; controlul versiunii respinge suprascrierile concurente. Păstrează evenimentele de audit fără parole, tokenuri și copii inutile ale informațiilor clienților.

## Backup local

Datele se află în `ARTMASTER_DATA_DIR`, implicit `.data/artmaster.sqlite`, `.data/uploads` și `.data/media`. Directorul este privat și ignorat de Git. Baza SQLite folosește WAL: copierea numai a fișierului principal în timp ce aplicația scrie nu este un backup consistent. `ARTMASTER_WRITES_PAUSED=true npm run backup`, după oprirea tuturor proceselor care scriu, folosește API-ul de backup SQLite și copiază directoarele `uploads` și `media` în `backups/<data-UTC>/`. Oprește modificările aplicației pe durata copiei dacă este necesară o stare comună exactă a bazei și a fișierelor.

Backupul conține date personale, hashuri de parole și secretele locale de semnare; sesiunile active sunt excluse; tratează-l ca informație privată. Mută copiile în afara checkoutului și în afara serverului public, cu acces restricționat și criptare. Nu publica ZIP-uri ce conțin solicitări sau atașamente. Pentru restaurare folosește `npm run restore` cu `ARTMASTER_BACKUP_DIR` și un `ARTMASTER_RESTORE_DIR` nou și separat. Verifică copia într-un mediu izolat înainte de orice schimbare aprobată a directorului activ; nu suprascrie datele curente.

## Backup de producție

Supabase PostgreSQL și Storage au mecanisme diferite. Backupul bazei nu dovedește că obiectele din Storage pot fi restaurate. Configurează exporturi sau backupuri separate pentru bucketul privat `quote-files` și pentru imaginile publice `portfolio`, monitorizează execuția și testează împreună restaurarea bazei, a fișierelor și a rolurilor. Alege retenția și obiectivele de recuperare cu proprietarul, în raport cu cerințele legale și comerciale; nu șterge automat datele clienților fără o politică aprobată.

Testează o restaurare înainte de lansare și periodic ulterior. Limitele planului Supabase, disponibilitatea PITR și costurile trebuie verificate în contul real.

## Întreținere

Rulează auditul dependențelor, actualizează versiunile prin modificări revizuibile și repetă testele afectate. Nu utiliza `npm audit fix --force` fără evaluarea incompatibilităților. Monitorizează erorile, cererile respinse și notificările eșuate fără să divulgi date personale în loguri. Nu există promisiune de securitate absolută; configurația gazdei și integrările externe trebuie testate în mediul real.

Procedura verificată pentru copii cu manifest, restaurare într-un director nou și strategia MFA sunt descrise în [Phase 1 security foundation](security-foundation.md).

Phase 2 adaugă expirare după 15 minute de inactivitate și maximum 8 ore, RLS legat de sesiunea activă și confidențialitatea imaginilor noi până la publicare. Vezi [regulile actuale și limitele verificării](admin-security-validation.md). Imaginile vechi din bucketul public rămân publice; nu sunt mutate sau șterse automat.

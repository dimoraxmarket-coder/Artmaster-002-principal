# Configurare și publicare

## Dezvoltare

Folosește Node.js 24, versiunile din `package-lock.json` și `npm ci`. Nu modifica lockfile-ul pentru a ocoli erori de instalare. Copiază `.env.example` în `.env.local`; păstrează toate cheile pe server. Niciun secret nu primește prefixul `NEXT_PUBLIC_` și nu intră în Git.

Aplicația folosește Next.js App Router, TypeScript și rute `/ro`, `/ru`, `/en`. Modul local are SQLite și atașamente private, potrivit pentru dezvoltare și verificări pe o singură mașină. Fișierele date nu trebuie expuse prin `public/` sau printr-o rută HTTP neautorizată.

## Producție

Publicarea pe `artmaster.md` se face numai după testarea și aprobarea înlocuirii site-ului Joomla. Nu modifica DNS-ul și nu elimina instalarea veche în timpul dezvoltării.

1. Creează un proiect Supabase într-o regiune potrivită și configurează PostgreSQL, Auth și Storage. Aplică, în această ordine, `supabase/migrations/202610130001_artmaster.sql` și `supabase/migrations/202610150001_admin_mfa.sql` înainte de pornirea codului nou, mai întâi într-un proiect staging. Verifică politicile RLS: `quote-files` este privat; `portfolio` conține numai imagini publice aprobate, cu încărcare autorizată.
2. Creează conturile administrative și rolurile. Fiecare cont (`viewer`, `editor`, `admin`) trebuie să înscrie și să confirme TOTP prin poarta `/admin` înainte de accesul la date; verifică și respingerea accesului direct fără AAL2. Nu folosi conturi sau parole demonstrative.
3. Configurează un serviciu Resend, domeniul verificat pentru expediere și destinatarul intern `office@artmaster.md`. Verifică primirea notificării și a confirmării clientului în cutii poștale reale.
4. Introdu variabilele în managerul securizat de secrete al platformei. Nu copia fișierele de dezvoltare pe server și nu pune secrete în instrucțiuni salvate.
5. Construiește cu `npm ci` și `npm run build`; rulează `npm run start` pe o platformă Next.js sau într-un container Node.js 24. Terminarea TLS și certificatele HTTPS trebuie configurate de platformă.
6. Menține mediul de testare neindexabil. Setează `SITE_URL=https://artmaster.md` și `SITE_INDEXABLE=true` doar pentru domeniul public aprobat, după validarea redirecționărilor și a metadatelor.
7. Verifică pagina de contact, sitemapul, `robots.txt`, `hreflang`, canonical-urile și antetele pe adresa publică finală.

Supabase și furnizorul de e-mail **nu sunt configurați de proprietar în acest moment**. Implementarea locală nu dovedește funcționarea lor în producție. Nu activa modul local ca soluție permanentă pe găzduire efemeră sau pe mai multe instanțe: baza de date, uploadurile și limitarea cererilor necesită persistență comună.

## Destinații de rețea

Instalarea necesită registrul npm și CDN-ul Playwright pentru browserul de teste. Integrarea în producție necesită URL-ul HTTPS al proiectului Supabase, endpointul API Resend și, după configurare, serviciile Google alese. Dacă există o listă de domenii permise necunoscută, adaugă destinațiile necesare; nu o înlocui cu o listă inventată.

## Google și statistici

Verifică proprietatea `artmaster.md` în Google Search Console prin DNS sau metoda aprobată. Trimite sitemapul de pe domeniul final și urmărește indexarea, erorile și redirecționările. Nu este posibilă garantarea unei poziții în Google.

Google Analytics 4 se activează numai după existența unei proprietăți și a identificatorului real `GA_MEASUREMENT_ID`. Aplicația cere acceptarea analizei înainte de încărcarea scriptului; testarea proprietății reale și a evenimentelor se face după configurare. Pentru metoda meta de verificare Search Console folosește `GSC_VERIFICATION`; verificarea DNS se configurează la furnizorul domeniului. O valoare fictivă nu reprezintă configurare funcțională. Confirmă separat dacă numărul poate fi folosit pentru WhatsApp.

## Conținut

Înlocuiește imaginile de concept cu fotografii cu drepturi de utilizare, publică doar proiecte reale confirmate și revizuiește traducerile RO/RU/EN. Nu inventa volume de producție, ani de activitate, prețuri, testimoniale sau specificații ale utilajelor. Locația confirmată este Durlești; alte localități deservite necesită confirmarea companiei.

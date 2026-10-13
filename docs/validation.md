# Validare ARTMASTER

Aplicația pornește ca server Next.js. Domeniul artmaster.md și Joomla nu au fost modificate.

- **30/30 teste E2E** și **20/20 teste de server/PostgreSQL** trecute, fără teste sărite.
- Audit npm: **0 vulnerabilități raportate**, inclusiv dependențele de dezvoltare.
- TypeScript strict și build de producție trec.
- ESLint cu reguli TypeScript, React Hooks și accesibilitate trece. Configurația directă evită dependența de dezvoltare braces pentru care auditul npm semnala o vulnerabilitate fără versiune corectată disponibilă.
- Verificările SQLite acoperă autentificarea, revocarea sesiunilor, permisiunile, cererile repetate, rate limiting, validarea fișierelor, ciornele și conflictele de versiune.
- Migrarea PostgreSQL este executată în PGlite; verificările RLS și RPC nu substituie verificarea unui proiect Supabase real.
- Paginile publice au fost verificate în RO / RU / EN la 320, 375, 768, 1024, 1440 și 1920 px.
- Meniul mobil, schimbarea limbii pe pagina echivalentă, metadatele, sitemapul, robots.txt, JSON-LD, erorile 404 și antetele de securitate au fost verificate în buildul de producție.
- Formularul local a persistat o cerere reală de test cu PDF valid și identificator de referință. Fișierele executabile, conținutul mascat și fișierele prea mari sunt respinse.
- Axe verifică pagina principală și formularul pentru probleme de accesibilitate serious/critical. Aceasta nu constituie o certificare completă WCAG.

Datele introduse în teste sunt sintetice. Imaginile generate sunt etichetate ca vizualizări de concept. Site-ul rămâne neindexabil în configurația inițială.

Pentru publicare rămân necesare proiectul Supabase, expeditorul Resend verificat, fotografiile reale aprobate și auditul Joomla/URL-urilor. Google Search Console și Analytics necesită proprietățile companiei. HTTPS, păstrarea și restaurarea copiilor de siguranță se verifică pe gazda de producție.

## Lighthouse local (mobil simulat, o singură măsurare după optimizare)

- Performanță: 84/100; accesibilitate: 100/100; best practices: 100/100.
- SEO: 69/100, cu indexarea dezactivată intenționat pe versiunea de test.
- LCP: 4,0 s; FCP: 2,3 s; TBT: 80 ms; CLS: 0,001.
- Eliminarea încărcării duble a fonturilor a redus transferul paginii de la circa 653 KiB la 474 KiB.
- Ținta LCP de 2,5 s nu este încă demonstrată. Acest test de laborator local nu măsoară INP sau percentila 75 în trafic real; performanța trebuie verificată și optimizată pe gazda de producție înainte de lansare.

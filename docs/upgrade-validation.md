# Verificarea actualizării ARTMASTER

14 octombrie 2026. Verificările folosesc Node.js 24, Next.js 16.4 și Chromium, pe un build local de producție. Găzduirea pe domeniul public nu a fost verificată.

## Rezultate

| Verificare | Rezultat |
| --- | --- |
| `npm run build` | Reușit, inclusiv configurația finală `inlineCss` |
| `npm run typecheck` | Reușit |
| `npm run lint` | Reușit, fără avertismente |
| `npm test` | 30 teste trecute, 0 eșuate |
| Browser, scenarii distincte | Toate cele 58 verificate cu succes prin rularea completă și rerularea UX |
| Verificare suplimentară a inserării bannerului | 1 test trecut cu analytics dezactivat |
| `npm audit --omit=dev` | 0 vulnerabilități cunoscute raportate |

Rularea completă a trecut 57 din 58 de cazuri. Ultimul caz problematic introducea un al doilea banner de consimțământ peste cel real. Fixture-ul a fost corectat să reutilizeze bannerul existent și să verifice repoziționarea după schimbarea înălțimii. Rularea finală, secvențială, a celor 9 teste UX a trecut integral. Nu sunt ascunse cazuri eșuate sau omise în rezultatul final agregat. Rezumatul și lista scenariilor sunt în [browser-upgrade.json](reports/browser-upgrade.json).

Verificările acoperă cele trei limbi, dimensiunile 320, 375, 390, 768, 1024, 1440 și 1920 px pentru componentele modificate, navigarea și breadcrumburile, cele 90 de URL-uri canonice din sitemap, cele 15 variante localizate ale serviciilor noi, logo/iconuri, parteneri, formular, atașamente private, salvare reală locală, erori și idempotență. Administrarea este verificată cu conturi temporare admin/editor/viewer, ciorne, publicare, galerii și revocarea sesiunii. Testele de accesibilitate Axe nu au raportat încălcări serioase sau critice în scenariile testate.

Serverul de test controlat atribuie o adresă IP distinctă fiecărui scenariu prin fixture-ul din `tests/browser-fixtures.ts`. Limitele antispam rămân active. Acceptarea antetului proxy este configurată numai pentru mediul local de test; valoarea implicită de producție rămâne `ARTMASTER_TRUST_PROXY=false`. Rulează suitele Playwright secvențial sau folosește directoare de rezultate și medii complet separate.

## Performanță mobilă

Lighthouse 13.5.0, profil mobil simulat, încetinire CPU 4× și throttling de rețea standard. Rezumat: [lighthouse-mobile.json](reports/lighthouse-mobile.json).

| Indicator | Valoare |
| --- | --- |
| Performanță | 91/100 |
| Accesibilitate | 100/100 |
| Bune practici | 100/100 |
| SEO | 100/100 |
| FCP | 1,0 s |
| LCP | 2,4 s |
| TBT | 330 ms |
| CLS | 0,001 |

Aceste rezultate provin dintr-o măsurare de laborator locală. Nu confirmă scorurile gazdei finale, Core Web Vitals din trafic real sau indexarea Google. După deploy, repetă verificarea pe domeniul HTTPS și urmărește rapoartele Search Console.

## Capturi inspectate

- [Homepage desktop](screenshots/upgraded-home-desktop.png)
- [Homepage mobil](screenshots/upgraded-home-mobile.png)
- [Contact desktop](screenshots/upgraded-contact-desktop.png)
- [Contact mobil](screenshots/upgraded-contact-mobile.png)
- [Panoul de contact mobil](screenshots/upgraded-quick-contact-mobile.png)

În această verificare manuală nu au apărut erori în consola browserului și nu există overflow orizontal. Capturile arată harta înainte de alegerea vizitatorului; nu afișează un răspuns Google Maps simulat ca și cum ar fi hartă live.

## Limitele verificării

- Supabase nu este configurat. Migrarea PostgreSQL și RLS au fost verificate în PGlite cu roluri de test, nu într-un proiect Supabase live. MFA, restaurarea backupurilor și politica gazdei finale trebuie verificate după configurare.
- Resend nu este configurat. Contractele API, mesajele și gestionarea erorilor au fost testate cu furnizor simulat. Nu s-au trimis e-mailuri externe și nu este verificată livrarea în inbox.
- Testele hărții simulează răspunsul Google; verifică după deploy markerul real la Strada Tudor Vladimirescu 69, Durlești, MD-2003. Componenta folosește adresa confirmată, fără coordonate inventate sau cheie API.
- Fotografiile originale ale utilajelor din mesaj nu sunt disponibile ca fișiere. Asocierea celor șase imagini distincte este în [equipment-images.md](equipment-images.md); integrarea exactă a fotografiilor rămâne de făcut după primirea originalelor.
- Relațiile comerciale și logourile partenerilor reali nu sunt confirmate. Exemplele sunt marcate în previzualizare și ascunse automat de pe site-ul indexabil.
- URL-urile Joomla, redirecturile necesare și indexarea live nu sunt auditate. Domeniul și site-ul public nu au fost migrate.

Pașii pentru configurare și lansare sunt în [professional-upgrade.md](professional-upgrade.md), [deployment.md](deployment.md) și [migration.md](migration.md).

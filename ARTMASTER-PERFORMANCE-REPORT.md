# ARTMASTER — măsurători de performanță

17 octombrie 2026, UTC. Măsurări reale în laborator local, nu PageSpeed găzduit sau date de vizitatori. [Rezultate și condiții](docs/reports/ultimate-audit/lighthouse-summary.json).

## Protocol

Lighthouse 13.5.0, Chromium 154, Linux x86_64, Node 24.19.0, npm 11.9.0. URL: `http://127.0.0.1:3100/ro`, build Next de producție cu stocare sintetică și indexare dezactivată. Mobil: viewport 412×823, DPR 1,75, throttling simulat, RTT 150 ms, throughput 1638,4 Kbps, CPU×4. Desktop folosește presetul desktop Lighthouse.

O probă inițială mobil/desktop și o probă după modificări. LCP mobil a variat; s-a executat încă o probă mobilă de investigație și sunt păstrate **ambele** rezultate după modificări. Nu sunt alese doar valorile favorabile. Serverul și cache-urile de assets sunt locale; acestea nu sunt condiții identice unui telefon sau hosting din Moldova. O comparație cu atât de puține probe nu demonstrează cauzalitate sau distribuția de teren.

## Rezultate

| Probă | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Înainte, mobil | 93 | 100 | 100 | 69 | 2,651 s | 0,000542 | 225,5 ms |
| După, mobil 1 | 90 | 100 | 100 | 69 | 3,543 s | 0,001290 | 42,5 ms |
| După, mobil 2 | 96 | 100 | 100 | 69 | 2,647 s | 0,001290 | 40 ms |
| Înainte, desktop | 100 | 100 | 100 | 69 | 0,739 s | 0,000945 | 0 ms |
| După, desktop | 100 | 100 | 100 | 69 | 0,736 s | 0,000945 | 0 ms |

LCP mobil rămâne peste ținta de 2,5 s în probele simulate; nu se declară că această problemă este rezolvată. TBT a fost mai mic în probele după modificări. **INP de teren nu a fost măsurat** și nu este dedus din TBT. Scorul SEO 69 reflectă noindex/robots local păstrat intenționat; nu s-a activat indexarea pentru a crește scorul.

## Modificări și decizii

- `getContent` folosește memoizare React pe durata randării, pentru citirile repetate din metadata/layout/pagină. Nu există cache comun pentru autorizare sau ciorne. Nu s-a făcut un benchmark separat al numărului/latentei query-urilor Supabase.
- Simbolul public de branding este livrat prin optimizator la dimensiunea cerută; în probele mobile corpul imaginii a fost 9.638 bytes înainte și 2.520 bytes după. Fișierul original și culorile/identitatea nu au fost înlocuite.
- Spațiul dintre numele brandului și subtitlu aliniază textul accesibil cu eticheta linkului. Verificarea Lighthouse label-content-name-mismatch a trecut de la eșec la trecut, fără modificarea aspectului.
- Hero-ul păstrează picture AVIF/WebP, încărcare eager/fetchpriority high și dimensiuni rezervate; imaginile de sub primul ecran rămân lazy.
- Bannerul panoramic, dacă este configurat de proprietar, continuă redarea integrală cu asset mobil separat opțional, fără decuparea telefonului sau serviciilor. Nu a fost schimbat niciun banner/partener.
- Imaginile administrate sunt WebP deja optimizate la ingestie, dar evită cache-ul Next public pentru a permite retragerea accesului. Derivate responsive pentru media privată ar necesita autorizare înaintea fiecărui răspuns; nu au fost adăugate cache-uri publice nesigure.
- HTML cu nonce și răspunsurile private nu au primit cache partajat. Fonts sunt locale după instalarea dependențelor; nu a fost introdus un serviciu de fonturi extern.

## Verificare funcțională și accesibilitate

Crawl de 99 pagini în RO/RU/EN, toate HTTP 200. 21 surse distincte de imagini/picture au răspuns 200. Browserul verifică layouturi la 320/375/768/1024/1440/1920 px, navigare, formulare, controale de contact, reduced motion, focus și verificări automate WCAG. Un rezultat automat 100 pe homepage nu este certificare de accesibilitate a întregului produs; screen reader și dispozitive fizice rămân în checklist.

Capturi: [mobil înainte](docs/screenshots/ultimate-audit/homepage-before-mobile.jpg), [mobil după](docs/screenshots/ultimate-audit/homepage-after-mobile.jpg), [desktop înainte](docs/screenshots/ultimate-audit/homepage-before-desktop.jpg), [desktop după](docs/screenshots/ultimate-audit/homepage-after-desktop.jpg). Sunt capturi reale ale compoziției din repository, nu înlocuitori generați ai bannerului proprietarului.

## Priorități rămase

1. **P3:** profilarea LCP mobil în staging, cu bannerul și media finale autorizate; testați compoziția mobilă și limitele de bytes, păstrând informația integrală.
2. **P3:** măsurări repetate pe paginile de servicii/contact și pe toate limbile, condiții geografice/rețele reale și dispozitive fizice. Nu au fost atribuite scoruri Lighthouse acestor pagini.
3. **P3:** latență reală Supabase, volume mari sintetice CRM, concurență și limite de proces/hosting. Testele funcționale nu sunt un load test.
4. **P5:** colectare CrUX/RUM cu consimțământ, dacă proprietarul o aprobă; seriile persistente PageSpeed sunt o extensie ulterioară. Datele de teren absente rămân netestate.

Comanda de reproducere: `CHROME_PATH=/usr/bin/chromium npm exec --package=lighthouse@13.5.0 -- lighthouse http://127.0.0.1:3100/ro --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=/tmp/artmaster-lighthouse.json`. Folosiți numai serverul local izolat; `--preset=desktop` pentru desktop. Pe Windows, instalarea/rularea nativă a browserului trebuie verificată separat.

Nu s-au făcut deploy, schimbări DNS sau teste intruzive pe site-uri externe. [Verdictul de release](ARTMASTER-PRODUCTION-READINESS.md).

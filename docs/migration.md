# Migrare de la Joomla

Site-ul vechi confirmat este `https://artmaster.md`. În mediul cloud, încercarea de inspectare a site-ului a fost blocată de proxy cu `CONNECT 403`. Structura Joomla, URL-urile vechi, traficul și backlinkurile nu au fost auditate. Nu se poate declara migrarea SEO finalizată în lipsa acestor date.

## Înainte de migrare

1. Salvează o copie a bazei Joomla, a fișierelor, a imaginilor și a configurației serverului. Testează restaurarea într-un mediu separat.
2. Exportă toate URL-urile vechi din Joomla, sitemapuri, acces logs, Google Search Console și Analytics. Include URL-urile cu trafic sau backlinkuri chiar dacă nu apar în meniuri.
3. Inventariază textele și imaginile ce pot fi reutilizate și confirmă drepturile de utilizare.
4. Completează `redirect-map.csv`: un URL vechi real, un URL nou echivalent, motiv și statutul verificării. Fișierul are doar antet până la audit; nu conține redirecționări inventate.
5. Păstrează un URL vechi când este potrivit. Când se schimbă, configurează o redirecționare permanentă 301 către pagina echivalentă, cu un singur hop. Nu trimite toate paginile către homepage.

## Testare înainte de schimbarea DNS

Verifică fiecare mapare: codul 301, destinația 200, lipsa buclelor și a lanțurilor, limba și echivalența conținutului. Verifică paginile cu trafic, imaginile importante, canonical-urile separate și `hreflang` pentru RO/RU/EN. Un URL necunoscut trebuie să returneze 404.

Testează stagingul neindexabil și păstrează vechiul site online. După aprobarea versiunii noi, configurează HTTPS, domeniul și redirecționările, apoi activează indexarea. Trimite sitemapul în proprietatea Search Console existentă; păstrarea domeniului nu necesită inventarea unui domeniu nou.

## După lansare

Urmărește erorile 404, indexarea, traficul organic și solicitările de ofertă. Păstrează redirecționările și copia site-ului vechi pentru o perioadă stabilită cu proprietarul. Planul de revenire trebuie să specifice configurația DNS/server, copia verificată și modul de păstrare a solicitărilor primite după lansare.

Date necesare de la proprietar: acces de citire sau export Search Console/Analytics, export URL-uri Joomla, backupul vechi și fotografiile aprobate. Valorile secrete nu se transmit în chat.

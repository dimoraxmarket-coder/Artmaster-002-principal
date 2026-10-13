# Verificări înainte de lansare

Lista se completează cu dovezi reale. Un checkbox necompletat nu înseamnă că funcția lipsește; poate necesita verificarea serviciului extern sau aprobarea companiei.

## Aplicație

- [ ] `npm ci`, lint, TypeScript, testele automate și buildul de producție trec.
- [ ] Rutele publice, navigarea și schimbarea limbii funcționează în RO/RU/EN; `/` duce la `/ro`.
- [ ] Pagini și formulare verificate la 320, 375, 768, 1024, 1440 și 1920 px, fără overflow orizontal.
- [ ] Navigare cu tastatura, focus vizibil, etichete, contrast și animații reduse verificate.
- [ ] Lighthouse măsurat pe versiunea publicată. Core Web Vitals urmărite în teren: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 la percentila 75. Nu există încă dovezi de trafic real pentru aceste valori.

## Date și acces

- [ ] Proiectul Supabase și e-mailul tranzacțional sunt create și configurate.
- [ ] Schema și RLS sunt aplicate; o sesiune anonimă și un rol fără permisiune nu pot citi solicitări sau atașamente.
- [ ] Administratorii au conturi proprii, roluri verificate și MFA; operațiunile importante apar în audit.
- [ ] Formularul salvează o solicitare, returnează un identificator și trimite notificarea reală.
- [ ] Fișierele permise, tipurile falsificate, executabilele, limitele de dimensiune și accesul privat sunt testate.
- [ ] Limitarea cererilor este verificată inclusiv când aplicația are mai multe instanțe.
- [ ] Backupul bazei și al fișierelor este automatizat, criptat și restaurat într-un mediu separat.

## Domeniu și conținut

- [ ] Fotografii ARTMASTER aprobate; conceptele nu sunt prezentate ca lucrări realizate.
- [ ] Specificații utilaje, servicii, texte RO/RU/EN și pagini juridice aprobate de companie.
- [ ] Datele confirmate de contact sunt afișate; programul, WhatsApp și aria deservită sunt confirmate separat.
- [ ] Exportul URL-urilor Joomla și al paginilor cu trafic este disponibil; mapările 301 sunt testate.
- [ ] Search Console este verificat; GA4 și consimțământul sunt configurate dacă vor fi utilizate.
- [ ] DNS, HTTPS, antetele de securitate și auditul dependențelor sunt verificate pe gazda finală.
- [ ] Canonical-uri, `hreflang`, JSON-LD, sitemap, robots și 404 sunt verificate pe `https://artmaster.md`.
- [ ] `SITE_INDEXABLE=true` este activat numai pentru versiunea publică aprobată.
- [ ] Proprietarul a aprobat lansarea; Joomla și datele vechi au o copie verificată și un plan de revenire.

## Blocaje externe cunoscute

Nu sunt configurate Supabase și furnizorul de e-mail. Auditul site-ului Joomla este blocat de accesul de rețea. Nu sunt furnizate încă fotografii reale, exporturi de trafic, specificații complete, conturi Google și aprobarea de publicare. Acestea nu împiedică dezvoltarea și testarea locală; împiedică declararea unei migrări și integrări finale în producție.

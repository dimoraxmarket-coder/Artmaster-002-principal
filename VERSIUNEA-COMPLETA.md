# ARTMASTER — versiunea completă pentru testare locală

Acest pachet reunește codul PR-urilor #2–#9 într-un singur proiect Next.js: site public + cabinet administrativ. SEO, echipamentele, bannerul panoramic și partenerii sunt disponibile împreună. Nu trebuie să alegi între ZIP-urile anterioare.

## Pornire rapidă pe Windows

1. Instalează Node.js 24 sau mai nou, apoi extrage ZIP-ul într-un folder nou, de exemplu `C:\ARTMASTER`. Prima instalare necesită internet pentru npm.
2. Dublu-clic pe **START.bat**. Așteaptă mesajul Ready; site-ul este la **http://localhost:3000**.
3. Într-o a doua fereastră rulează **CREATE-ADMIN.bat**. Introdu e-mailul, rolul admin și propria parolă; nu există cont/parolă implicită.
4. Deschide **http://localhost:3000/admin** și autentifică-te. Pentru SEO: **http://localhost:3000/admin#seo**.
5. Ctrl+C în consola START oprește serverul. Nu expune această copie locală pe internet. Datele tale de test se păstrează în `.data\windows-local`; nu copia date de producție aici.

Instrucțiuni complete și depanare: [README-WINDOWS.md](README-WINDOWS.md).

## Ce include

| Zonă | Funcționalitate disponibilă |
| --- | --- |
| Site public | Homepage, servicii, portofoliu, echipamente, companie, contact, cerere ofertă, FAQ, articole și pagini legale; RO/RU/EN, responsive, animații, logo/navigare, back-to-top și contact rapid |
| Dashboard | Totaluri reale din stocarea locală, activitate și acces la module |
| Mesaje clienți / CRM | Cele trei formulare publice salvate în backend; detalii, atașamente private, status, atribuire, note, istoric, căutare, filtre, paginare și totaluri independente de paginare |
| Portofoliu Studio | Titlu/texte traduse, imagine, servicii asociate, ciornă, preview protejat și publicare |
| Bibliotecă media | Încărcare, inventar persistent, căutare/selectare, previzualizare autorizată, urmărirea utilizării, înlocuire în ciornă și arhivare protejată |
| Echipamente | Catalog RO/RU/EN, model/producător/categorie, specificații, imagine, surse și drepturi, ordine, ciornă/preview/publicare; candidații necesită verificare |
| SEO & Analytics | Audit local 0–100 cu formulă și verificări documentate, recomandări per pagină, titluri/meta/canonical/hreflang/sitemap/robots/date structurate/alt/linkuri/indexare; perioade, grafice și număr real de cereri CRM |
| Conținut Studio | Textele structurate implementate RO/RU/EN, Media Studio, avertizare modificări nesalvate, ciorne, preview privat în layoutul public, istoric imuabil, comparație și restaurare în ciornă nouă, conflicte de versiune |
| Hero și banner | Imagine/video desktop/mobil cu decupare pentru fundal; separat banner panoramic complet, fără decuparea telefonului/serviciilor, cu încărcare WebP fără pierderi |
| Parteneri | Nume, logo, website opțional, ordine, sursă/permisiune, confirmarea relației, ciornă, ascundere/arhivare și publicare; marquee accesibil, pauză și reduced motion |
| Setări website | Datele de companie și contact acceptate de schema CMS existentă |
| Echipă | Director, roluri viewer/editor/admin, activare/dezactivare, protecția ultimului administrator și revocarea sesiunilor la schimbarea privilegiilor |
| Security Center | Sesiuni reale, expirare/revocare, istoric audit cu filtre, prezentare MFA și protecții de autorizare; fără reset MFA nesigur |
| Securitate și date | AAL2 obligatoriu în modul Supabase, sesiuni validate pe server, RLS restrictiv, atașamente/media/ciorne private, audit, migrații, proceduri backup/restaurare și bootstrap local sigur |
| Pachet local | START.bat, CREATE-ADMIN.bat, surse, assets din repository, package-lock, migrații și șabloane de configurare; fără secrete, baze de date, clienți, atașamente, node_modules sau build |

## Care banner se afișează

**Conținut → Banner Acasă** controlează panorama integrală. Dacă este activă și versiunea este publicată, aceasta are prioritate. Dacă o dezactivezi și publici, revine imaginea/video salvată în **Conținut → Acasă și Despre noi**; fără aceasta revine hero-ul original. Ambele configurații sunt păstrate. Ciornele nu schimbă site-ul public. Media dintr-o variantă inactivă nu primește acces public numai pentru că este păstrată în configurație; alte referințe publicate ale aceluiași fișier rămân valabile.

## Ce necesită încă fișiere sau servicii externe

- **Bannerul tău exact:** este vizibil în conversație, însă fișierul descărcabil nu a fost disponibil în cloud. Nu este inclus un banner generat în locul lui. Încarcă originalul PNG/JPEG în noul editor local, verifică telefonul și cele cinci servicii în preview, apoi publică explicit. Bannerul existent rămâne până atunci.
- **Logo-urile partenerilor:** 15 nume sunt transcrise din captură și se importă explicit ca neconfirmate. Cercetarea domeniilor a fost blocată cu 403; nu există logo-uri oficiale sau licențe verificate. Confirmă compania/relația și încarcă numai logo-ul autorizat. [Registrul surselor](docs/partner-source-register.md).
- **Fotografiile/modelele aparatelor:** catalogul funcționează, dar sursele producătorilor și variantele exacte rămân de verificat. Nu sunt substituite fotografii de alte modele.
- **Google:** GA4, Search Console și PageSpeed au integrare server pregătită, dar rămân neconectate local, fără date inventate. [Pașii exacți de conectare](docs/seo-analytics-hero-equipment.md). Datele CRM locale sunt reale pentru solicitările introduse în această copie.
- **Supabase:** integrarea reală TOTP/AAL2/RLS/Storage necesită staging separat cu date sintetice. Testele locale/PGlite nu reprezintă validare găzduită. Autentificarea locală prin parolă nu este echivalentă cu MFA Supabase.
- **Windows:** mediul de verificare este Linux. Scriptul Node portabil și copia extrasă sunt testate; execuția nativă .bat și modulele native Windows trebuie verificate pe PC.
- **Limite CMS existente:** unele introduceri/texte statice, paginile legale și funcțiile neimplementate documentate în audit rămân în cod. Portofoliul actual nu promite galerii multiple complete. Invitațiile și recuperarea MFA nu primesc soluții nesigure pentru a părea complete.

Aceasta este copia integrată a tuturor funcțiilor implementate, pregătită pentru testare locală. Nu este un deploy sau o certificare de producție. PR-urile existente nu sunt fuzionate pe GitHub; DNS, Host.md și site-ul live nu sunt modificate. [Checklist de release](docs/release-readiness-phase6.md).

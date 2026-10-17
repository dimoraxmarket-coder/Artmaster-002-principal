# ARTMASTER — audit de securitate

Data: 17 octombrie 2026, UTC. Bază verificată: PR #10, `129322483e2b9d6892913c9f5c0f2c380628f705`. Actualizare: `feature/artmaster-ultimate-seo-security`.

## Verdict și domeniu

**Not ready for production.** Codul include corecții și teste locale; lipsesc validarea Supabase găzduită și aprobarea configurației de hosting. Nu a fost testat sau modificat serverul live artmaster.md/Host.md. Nu au fost folosite date de producție.

Au fost revizuite cele 28 de fișiere API, autentificarea/MFA, registrul sesiunilor, rolurile, CRM, media, CMS, istoricul, SQL/RLS, antetele, validarea fișierelor, backupul și dependențele. [Inventar](docs/reports/ultimate-audit/architecture-inventory.json). Inventarul static completează testele; simpla prezență a unui apel de autorizare nu certifică o rută.

## Constatare confirmată și corectată: cache după retragerea publicării

**P1 — confidențialitatea imaginilor administrate.** O imagine sintetică a fost încărcată privat, publicată printr-o referință CMS, accesată prin optimizatorul Next și apoi retrasă. URL-ul direct a răspuns 404, dar transformarea Next a răspuns în continuare **200, cache HIT**, deși sursa avea `private, no-store`. Testul nu demonstrează expunerea imaginilor care nu au fost niciodată publicate și nu implică date reale.

| Verificare | Înainte | După |
| --- | --- | --- |
| Imagine administrată publicată, URL direct | 200 | 200 |
| Aceeași imagine retrasă, URL direct | 404 | 404 |
| URL-ul transformării anterior memorate, după retragere | 200 HIT | 400 |
| Optimizarea unui asset public de branding | 200 | 200 |

[Dovadă înainte/după](docs/reports/ultimate-audit/image-cache-proof.json). `PublicImage` livrează imaginile administrate direct, cu reverificarea accesului la fiecare cerere. `images.localPatterns` permite optimizarea doar în directoarele publice ale repository-ului: branding, images, media și partners; API-urile sunt refuzate înainte de citirea cache-ului. Sunt testate și previzualizarea, retragerea publicării și variantele de traversare a căii.

Fișierele, URL-urile canonice `/api/media/...` și partenerii existenți sunt păstrați. Această corecție nu poate șterge copii descărcate anterior de vizitatori sau cache-uri externe. Dacă versiunea vulnerabilă a fost găzduită undeva, planul de lansare trebuie să includă invalidarea cache-urilor acelui mediu, cu aprobarea proprietarului. Nu s-a efectuat nicio invalidare/deploy aici.

## Întăriri implementate

| Prioritate | Zonă | Comportament verificat / modificare |
| --- | --- | --- |
| P1 | Stocare locală | Configurația refuză date în `public` sau `.next/static`, inclusiv prin strămoși simbolici; comparația respectă Windows. Nu sunt mutate/șterse date existente. |
| P2 | Atașamente raster noi | PNG/JPEG sunt decodate și re-encodate, fără EXIF/GPS, metadate auxiliare ori payload după imagine. PNG rămâne fără pierderi; JPEG este re-encodat la calitate 95. |
| P2 | Resurse upload | Maximum 30 MP, 10.000 px/latură, un cadru static; două procesări raster active și patru în așteptare per proces. Supraîncărcarea răspunde explicit 503. |
| P2 | Limite existente | 5 MiB/fișier, trei atașamente și 10 MiB total; cerere publică maximum 12 MiB. Media admin are corp maximum 6 MiB. Video hero: fișier 20 MiB, corp 21 MiB. |
| P2 | PDF | Validarea existentă a acțiunilor active este păstrată; se adaugă maximum 200 pagini și 20.000 obiecte. Nu este scanare antivirus. |
| P2 | Compatibilitate CRM | Identitatea cererii folosește digestul intrării originale, astfel încât sanitizarea nouă să nu invalideze retry-urile înregistrate anterior. Digestul individual este tranzitoriu pe server; originalele nu sunt păstrate pentru imaginile noi. |
| P2 | Date existente | Atașamentele vechi și mesajele nu sunt rescrise. Migrarea locală adaugă numai istoricul diagnostic SEO. |
| P2 | Analytics | Opt-in real, fără script Google înainte de acceptare; URL-urile sunt fără query/fragment, referrer doar origine; retragerea oprește urmărirea și elimină numai cookie-urile GA. |
| P2 | Diagnostic | Noua rută Security Posture cere administrator live și reverifică rolul; nu returnează secrete, cookie-uri, hash-uri de sesiune sau căi locale. |

Fișiere executabile/deghizate, extensii duble periculoase, MIME fals și SVG încărcat sunt refuzate. Fișierele acceptate au nume de stocare generate pe server și scriere fără suprascriere. Media admin continuă propria conversie WebP; nu primește o etapă JPEG cu pierderi suplimentară. Fișierele de test sunt generate sintetic, fără malware real.

## Protecții existente păstrate

- Supabase: identitate verificată de Auth înainte de citirea AAL; **AAL2 obligatoriu pentru viewer/editor/admin**; sesiune aplicație live, expirare, legare la sesiunea Auth și versiunea rolului.
- AAL1 poate doar începe/finaliza fluxul MFA, plus endpointurile publice normale. Nu autorizează CRM, CMS, media sau diagnostice.
- Cookie-uri HttpOnly/SameSite Strict, Secure în producție; sesiune Supabase criptată pe server. Verificarea locală prin parolă rămâne exclusiv pentru testare izolată.
- Inactivitate 15 minute și maximum absolut 8 ore; tokenul Auth poate impune o expirare mai devreme. Revocarea, dezactivarea contului și schimbarea privilegiilor sunt reverificate pe server.
- Schimbările de echipă și revocările sensibile cer confirmare recentă, cu verificări atomice pentru ultimul administrator și schimbarea propriului acces.
- CSRF/Same-Origin, validare strictă, limite persistente pentru login, MFA, tokenuri, formulare și operații costisitoare; SQL parametrizat.
- Atașamente private, ciorne și preview fără token public; publicație explicită, CAS, istoric CMS imuabil și audit.
- CSP cu nonce, fără unsafe-eval în producție; nosniff, frame restrictions, Referrer-Policy, Permissions-Policy și HSTS pe HTTPS. Cache-urile private rămân dezactivate.
- Nicio cheie service-role sau privată Google în client. Verificarea build-ului a găsit zero identificatori de secrete server căutați în cele 23 de fișiere JS pentru browser; nu au fost introduse chei reale pentru test.

## RLS și migrarea nouă

`202610170001_seo_audit_history.sql` creează un tabel diagnostic separat, cu RLS activ și fără granturi anon/authenticated. Scrierea se face printr-o funcție service-only, cu rol activ, validarea rezultatului și limită de retenție. Nu modifică rânduri CRM, CMS, istoric de conținut sau bucketuri. SQLite folosește CREATE TABLE/INDEX IF NOT EXISTS.

Testele PGlite verifică refuzarea accesului direct și a writerilor dezactivați. **Supabase găzduit, JWT/TOTP reale, RLS REST/Storage și revocarea reală sunt NOT TESTED.** Cheile/configurația nu sunt disponibile nici în mediul shell, nici în fișierele locale de mediu verificate prin prezență, fără afișarea valorilor.

## Riscuri și lucrări rămase

1. **P1:** validare reală în staging a tuturor migrațiilor, TOTP, rolurilor, sesiunilor revocate/expirate, bucketurilor și accesului REST direct. Urmează [procedura existentă](docs/supabase-staging-validation.md).
2. **P1:** antivirus/CDR nu este configurat. PDF are controale structurale; video are verificări MIME/semnătură, fără decodare/transcoding complet. Proiectați un worker privat de carantină și scanner întreținut înainte de aprobarea producției; nu marcați fișierele „clean” printr-un stub.
3. **P1:** validați rescrierea antetului IP la proxy, TLS/HSTS/CSP efective, limitele de corp, concurența și protecția la nivel de rețea. Limitarea raster este per proces, nu protecție DDoS globală.
4. **P1:** backup programat, criptare/acces offsite, proprietari și exercițiu de restaurare găzduit. Cele trei teste sintetice locale nu certifică backupurile reale.
5. **P2:** monitorizare, alerte fără conținut privat, rotația secretelor și procesul de revizuire a dependențelor. Captura npm audit este datată, nu monitorizare continuă.
6. **P2:** NTFS, pornire .bat, module native și browsere fizice Windows/iOS trebuie validate în mediile lor.

Recuperarea MFA rămâne controlată de proprietari, cu verificarea identității, doi aprobatori independenți, suspendare/revocare și mecanismele oficiale Supabase. Nu există resetare MFA prin parolă sau invitații fictive. [Procedură](docs/mfa-recovery.md).

## Teste, referințe și următorul pas

Rezultatele finale ale suitelor și ale pachetului sunt centralizate în [readiness](ARTMASTER-PRODUCTION-READINESS.md) și în verificarea livrată lângă ZIP. Dependențe: **zero advisories raportate** la scanarea lockfile-ului curent; scopul scanării este limitat la advisories, iar problema de cache a necesitat test funcțional separat.

Surse de control: [OWASP Top 10](https://owasp.org/www-project-top-ten/), [ASVS](https://owasp.org/www-project-application-security-verification-standard/), [API Security Top 10](https://owasp.org/API-Security/), [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Next image localPatterns](https://nextjs.org/docs/app/api-reference/components/image#localpatterns), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Acestea sunt referințe de proiectare; nu se declară certificare OWASP sau validare a unui serviciu găzduit.

Următorul pas: revizuirea PR-ului și pregătirea unui staging sintetic aprobat. Fără merge, deploy, DNS sau modificări Host.md.

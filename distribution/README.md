# ARTMASTER — proiect pentru testare locală Windows

[Descarcă ARTMASTER-COMPLETE-WINDOWS.zip](https://raw.githubusercontent.com/dimoraxmarket-coder/Artmaster-002-principal/package/artmaster-banner-partners-93c4f89f2b60/distribution/ARTMASTER-COMPLETE-WINDOWS.zip) (29.31 MB, 316 fișiere).

Sursă verificată: `93c4f89f2b60b829bb7817890935b65289dfa7ae`, branch `feature/artmaster-banner-partners`, bazat pe PR #7 (`c63ad4100bc014e440b056daf4b2a40e76e330c7`). Acest branch de distribuție nu modifică branch-ul sursă sau PR-urile existente. PR #8 rămâne separat.

**Active în așteptare:** bannerul original nu a fost disponibil ca fișier descărcabil; logo-urile nu au fost verificate/descărcate deoarece domeniile candidate au returnat 403. Pachetul păstrează bannerul existent. Nicio imagine sintetică din capturi nu este instalată ca date inițiale. Cele 15 nume din captură se importă numai printr-o acțiune explicită în ciornă și rămân neconfirmate. Acesta este un pachet funcțional pentru revizuirea CMS, nu o declarație că înlocuirea finală a imaginilor este terminată.

1. Instalează Node.js 24 sau mai nou, apoi extrage într-un folder nou, cu o cale scurtă.
2. Rulează START.bat. Lansatorul instalează dependențele, creează configurația și SQLite izolat, apoi pornește pe 127.0.0.1:3000.
3. Rulează CREATE-ADMIN.bat pentru contul propriu; nu există parolă implicită. Website: http://localhost:3000 ; cabinet: http://localhost:3000/admin . Ctrl+C oprește serverul.
4. În Conținut → Banner Acasă încarcă originalul PNG/JPEG, salvează ciorna, previzualizează RO/RU/EN și publică explicit. În Parteneri, confirmă identitățile/relațiile și drepturile logo-urilor înainte de publicare. README-WINDOWS.md conține pașii compleți.

SHA-256: `90c6a96861ff1f24c02aee9fb5f57d6eee4d6a9893e59e07a8262902fc92b1f8`. Compară folosind `Get-FileHash .\ARTMASTER-COMPLETE-WINDOWS.zip -Algorithm SHA256` în PowerShell. PACKAGE-INFO.json din ZIP identifică exact sursa.

Nu include node_modules, .next, baze de date, secrete, atașamente private, backup-uri sau cookie-uri. Necesită internet pentru prima instalare npm. Rularea nativă Windows și Supabase staging real nu sunt certificate. Nu expune serverul local pe internet, nu deploya și nu modifica DNS/Host.md.

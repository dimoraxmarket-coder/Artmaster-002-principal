# Verificare distribuție — 93c4f89f2b60

- ZIP CRC, SHA-256 și toate fișierele comparate cu blob-urile commitului sursă: trec.
- 316 fișiere; 29307354 bytes; START.bat și CREATE-ADMIN.bat sunt CRLF; șabloanele și migrarea 202610160002_homepage_visuals.sql sunt incluse.
- Allowlist verificat: fără date runtime, secrete, baze de date, atașamente, backup-uri, node_modules sau build.
- Extracție nouă în director temporar; instalare reală a 329 de pachete din lockfile prin lansatorul portabil: trece.
- Pregătire SQLite repetată fără suprascriere; înaintea testelor: zero conturi și zero cereri. Nu se creează clienți sau administratori demonstrați.
- ESLint, TypeScript, 102 teste backend/securitate și build de producție din copia finală extrasă: trec, zero teste eșuate/omise.
- Suita completă Chromium din copia finală extrasă: 106 teste trecute, zero eșuate/omise. Include cele 11 fluxuri noi banner/parteneri și toate cele 18 teste formular → CRM în RO/RU/EN.
- Audit dependențe runtime: zero vulnerabilități.
- Pornire reală prin scripts/windows-local.mjs start pe Linux: ascultare exclusivă pe 127.0.0.1:3000; bootstrap securizat cu parolă aleatorie introdusă prin stdin; login în browser; noile controale CMS; formular public → CRM cu PDF privat, status, atribuire, notă, istoric și reîncărcare; acces anonim respins; logout/revocare: trec.
- Ctrl+C controlat: exit 0 și port închis; niciun server de test nu rămâne publicat.
- Mediul este Linux/Node 24.19.0/npm 11.9.0/Chromium. Fără validare nativă Windows/cmd.exe, Supabase/TOTP găzduit, Google sau producție.
- Bannerul proprietarului și logo-urile oficiale nu au fost importate/verificate. Capturile documentate folosesc fixture-uri sintetice marcate explicit, care nu sunt date inițiale în ZIP. Dimensiunile optimizate ale activelor reale rămân de măsurat.
- PR-urile vechi, Host.md, DNS și producția nu sunt modificate; nu se face merge sau deploy.

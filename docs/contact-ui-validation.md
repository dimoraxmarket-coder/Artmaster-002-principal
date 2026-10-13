# Contact și breadcrumb — corectare UX/UI

Data verificării: 13 octombrie 2026.

## Corectări

- Contact: container de maximum 1280 px, coloane 40%/60% aliniate sus, un singur H1 în coloana informațiilor. Sub 768 px, informațiile preced formularul și câmpurile sunt pe un singur rând vertical.
- Carduri pentru telefon, e-mail și adresa publicată; legături tel/mailto și Google Maps. Nu este afișat un program de lucru neverificat.
- Formular: titlu separat, introducere scurtă, perechi nume/telefon și e-mail/serviciu, detalii opționale expandabile, înălțimi uniforme și buton de minimum 48 px.
- Breadcrumb comun: listă semantică fără numerotare, separatoare ascunse de cititoarele de ecran, linkuri părinte funcționale și pagina curentă cu aria-current. Un singur BreadcrumbList corespunde exact navigării vizibile în RO/RU/EN.
- Endpointurile, logica de trimitere, validarea, protecția antispam, uploadul și integrarea e-mailului nu au fost modificate.

## Verificări executate

- npm run typecheck: trecut.
- npm run lint: trecut.
- npm run build: trecut, build de producție Next.js.
- 8 teste Playwright specifice corectării: trecute. Acoperă Contact în cele trei limbi la 320, 375, 390, 768, 1024, 1440 și 1920 px; structura și linkurile breadcrumb-ului pentru servicii/echipamente/portofoliu/ghiduri; potrivirea JSON-LD; validarea formularului, detalii opționale păstrate, trimitere cu PDF și persistență locală reală; verificări Axe pentru pagina Contact cu formularul expandat, în trei limbi, fără probleme grave sau critice.
- Capturile versiunii de producție au fost inspectate vizual la 1440 px (RO), 375 px (RO) și 768 px (RU).

Testele formularului folosesc o bază SQLite locală izolată, fără furnizor de e-mail configurat. Confirmarea verificată este înregistrarea cererii; nu reprezintă o probă a livrării de e-mail în producție.

## Capturi

- [Desktop RO](screenshots/contact-desktop.png)
- [Mobil RO](screenshots/contact-mobile.png)
- [Tabletă RU](screenshots/contact-tablet.png)

## Fișiere sursă

- src/app/[locale]/[...segments]/page.tsx
- src/app/globals.css
- src/components/page-parts.tsx
- src/components/quote-form.tsx
- src/lib/i18n.ts
- tests/contact.e2e.ts

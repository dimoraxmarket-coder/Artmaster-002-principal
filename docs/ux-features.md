# ARTMASTER — contact rapid, înapoi sus și hartă

## Comportament

`BackToTop` este afișat după 400 px de scroll, în toate paginile publice și limbile site-ului. Are etichetă accesibilă, focus vizibil și derulare lină; cu reduced motion, derularea este instantanee. Logo-ul din header conduce spre homepage, iar pe homepage derulează sus.

`FloatingActions` combină butonul de contact cu butonul sus. Panoul nu se deschide automat. La deschidere, focusul ajunge pe butonul de închidere; Escape și închiderea explicită readuc focusul pe declanșator. Clickul în afara panoului îl închide. Panoul este non-modal, are dimensiuni limitate la ecran și nu blochează restul paginii. Butonul sus este ascuns cât timp panoul este deschis. Elementele se repoziționează dacă un banner de consimțământ le-ar acoperi și sunt ascunse când meniul mobil este deschis.

Telefonul, e-mailul și WhatsApp sunt preluate din contactele CMS. Telefonul verificat este `+37360010400`, afișat în panou ca `+373 60 010 400`. E-mailul verificat este `office@artmaster.md`. Linkul de ofertă păstrează limba curentă. WhatsApp apare doar când există numărul oficial în contactele publicate; Viber apare doar pentru un număr valid în `CONTACT_VIBER_NUMBER`. Niciun canal suplimentar nu este activat implicit.

## Harta

`LocationSection` apare sub formularul Contact. Cardul și harta sunt alăturate pe desktop și suprapuse vertical pe mobil. Adresa este preluată din datele centralizate, în limba curentă:

Strada Tudor Vladimirescu 69, Durlești, MD-2003, Republica Moldova.

Nu sunt folosite coordonate inventate sau un program de lucru neverificat. Google Maps primește adresa completă într-un query URL encodat și geocodează locația. Linkul „Deschide traseul” folosește aceeași adresă ca destinație. Componenta nu poate activa harta dacă adresa este goală.

Nu este necesară o cheie API pentru iframe-ul public utilizat. Nu sunt expuse credențiale. Pentru confidențialitate, iframe-ul nu este creat până când vizitatorul alege „Încarcă harta interactivă”. Înainte de încărcare este explicat transferul către Google și există un link spre politica de confidențialitate. Alegerea nu activează Google Analytics și nu este păstrată ca un consimțământ global.

Harta folosește lazy loading, un spațiu cu înălțime rezervată, titlu accesibil și colțuri de 20 px. Linkul extern rămâne vizibil ca fallback. Erorile semnalate de iframe și încărcările care nu se încheie în 18 secunde permit reîncercarea; harta poate fi ascunsă din nou. CSP permite frame-uri doar de la `https://www.google.com`.

Testele Google Maps în browser folosesc un răspuns simulat pentru a verifica solicitarea, consențământul, adresa și comportamentul interfeței. Acest lucru nu verifică disponibilitatea live a Google Maps sau poziția exactă a markerului afișat de furnizor. După deploy, încarcă harta reală, verifică pinul pe strada/adresa publicată și testează traseul.

## Fișiere

- `src/components/back-to-top.tsx`
- `src/components/floating-actions.tsx`
- `src/components/floating-actions.module.css`
- `src/components/location-section.tsx`
- `src/components/location-section.module.css`
- `src/lib/location.ts`
- Layoutul localizat, ruta Contact, headerul, CSP și `.env.example`
- `tests/ux.e2e.ts`

Prima etapă (branding/SEO/formular/servicii/parteneri) este documentată în [professional-upgrade.md](professional-upgrade.md). Imaginile de echipamente analizate și fișierele încă necesare sunt documentate în [equipment-images.md](equipment-images.md).

Rezultatele testelor, capturile actualizate și limitele verificării sunt în [upgrade-validation.md](upgrade-validation.md).

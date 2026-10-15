# ARTMASTER

Website multilingv pentru reclamă vizuală, producție publicitară și prelucrarea materialelor. Româna este limba principală (`/ro`); rusa și engleza au pagini separate (`/ru`, `/en`). Ruta `/` redirecționează către `/ro`.

Date confirmate: [artmaster.md](https://artmaster.md), **+373 600 10 400**, **office@artmaster.md**, Durlești, MD-2003, str. Tudor Vladimirescu 69, Republica Moldova.

## Pornire locală

Necesită Node.js 24 și npm. Folosește checkoutul existent; fiecare sarcină cloud are deja un mediu izolat. Nu crea un Git worktree suplimentar pentru configurarea obișnuită.

```bash
npm ci
test -f .env.local || cp .env.example .env.local
npm run dev
```

Pe Windows, după dezarhivare și instalarea Node.js 24, deschide `START-WINDOWS.cmd`. Pe Linux/macOS poți utiliza `bash scripts/start-local.sh`. Aceste comenzi pornesc aplicația pe calculatorul tău.

În cloud, cache-ul npm poate fi păstrat în `/workspace/.npm-cache`.

`.env.local` conține configurarea locală și nu se publică în Git. Modul local permite stocarea reală a solicitărilor și atașamentelor în SQLite și într-un director privat. Nu configurează implicit e-mailul, Supabase sau un administrator.

## Verificări

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Testele E2E pornesc un server de producție local pe portul 3100 când nu există unul, cu date în `.data/e2e` și e-mail dezactivat. Construiește aplicația înainte. Mediul cloud are Chromium în `/usr/bin/chromium`. Pentru un server existent, setează `PLAYWRIGHT_BASE_URL` și folosește un mediu separat de producție; pentru un Chromium instalat separat, setează `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Pe altă mașină poți instala browserul prin `npx playwright install chromium`. Rezultatele testelor se raportează numai după rulare, nu rezultă din existența acestor comenzi.

## Documentație

- [Actualizarea brandingului, serviciilor, formularelor și SEO](docs/professional-upgrade.md)
- [Contact rapid, buton sus și hartă](docs/ux-features.md)
- [Fotografiile utilajelor: asociere și originale necesare](docs/equipment-images.md)
- [Verificarea finală a actualizării](docs/upgrade-validation.md)
- [Configurare, publicare și servicii externe](docs/deployment.md)
- [Securitate, administrare și copii de siguranță](docs/security-and-backups.md)
- [Phase 1: protejarea datelor, restaurare verificată și MFA obligatorie](docs/security-foundation.md)
- [Migrarea Joomla și păstrarea traficului organic](docs/migration.md)
- [Lista de verificare înainte de lansare](docs/production-readiness.md)
- [Rezultatele verificărilor browserului](docs/validation.md)

Fotografiile de concept trebuie înlocuite cu fotografii ARTMASTER aprobate înainte de lansare. Nu sunt dovezi de lucrări executate. Datele tehnice, textele în trei limbi și paginile juridice necesită verificarea companiei.

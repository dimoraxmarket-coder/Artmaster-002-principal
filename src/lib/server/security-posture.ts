import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import evidence from "../../../config/security-evidence.json";
import { dataDirectory, storageMode } from "./config";
import type { Actor } from "./types";
export type SecurityCheck = {
  id: string;
  label: string;
  state: "verified" | "warning" | "not_configured" | "not_tested";
  detail: string;
};
export async function securityPosture(actor: Actor) {
  const mode = storageMode();
  const checks: SecurityCheck[] = [
    {
      id: "authentication",
      label: "Autentificare și sesiune live",
      state:
        mode === "supabase" && actor.aal === "aal2" ? "verified" : "warning",
      detail:
        mode === "local"
          ? "Parolă locală, exclusiv testare izolată. Nu este MFA Supabase."
          : "Identitatea, AAL2, rolul și registrul sesiunii au fost verificate pentru această cerere.",
    },
    {
      id: "supabase",
      label: "Conexiune Supabase",
      state: mode === "supabase" ? "verified" : "not_configured",
      detail:
        mode === "supabase"
          ? "Cererea curentă a trecut prin verificarea Auth și registrul sesiunii. Nu certifică toate integrările găzduite."
          : "Copia locală folosește SQLite; nu a fost contactat un proiect Supabase.",
    },
    {
      id: "rls",
      label: "RLS și acces direct la date",
      state: "not_tested",
      detail:
        "Validarea reală necesită staging separat: anon, AAL1, AAL2, revocare și roluri. Testele locale/PGlite nu constituie validare Supabase găzduită.",
    },
    {
      id: "storage",
      label: "Stocare privată",
      state: mode === "local" ? "verified" : "not_tested",
      detail:
        mode === "local"
          ? "Directorul local de date este în afara public și .next/static, inclusiv după rezolvarea legăturilor. Permisiunile NTFS necesită verificare pe Windows."
          : "Accesul direct la bucketuri trebuie probat în staging; existența unei variabile nu dovedește confidențialitatea.",
    },
    {
      id: "uploads",
      label: "Politica de upload raster",
      state: "verified",
      detail:
        "PNG/JPEG cu extensie, MIME, semnătură și decodare; maximum 5 MiB/fișier, 30 MP și 10000 px/latură. Re-encodare fără metadate. Maximum două procesări raster simultane și patru în așteptare per proces. Aceasta descrie politica activă, nu o scanare antivirus.",
    },
    {
      id: "malware",
      label: "Antivirus și analiză video/PDF",
      state: "not_configured",
      detail:
        "Nu există serviciu antivirus/CDR conectat. PDF are verificări structurale; video are verificări MIME/semnătură, fără decodare completă sau transcoding. Necesită validare și infrastructură înainte de producție.",
    },
    {
      id: "sessions",
      label: "Expirare și revocare",
      state: "verified",
      detail:
        "Politica activă: 15 minute inactivitate, maximum 8 ore, revocare și schimbarea privilegiilor controlate pe server. Sesiunea Supabase poate expira mai devreme odată cu tokenul Auth.",
    },
    {
      id: "rate",
      label: "Limitarea cererilor",
      state:
        process.env.ARTMASTER_TRUST_PROXY === "true" ? "warning" : "verified",
      detail:
        process.env.ARTMASTER_TRUST_PROXY === "true"
          ? "Proxy de încredere configurat. Verifică în infrastructură că antetul IP este rescris; aplicația nu poate certifica proxy-ul."
          : "Limitare persistentă activă, cu identitate comună dacă nu există un proxy validat. Nu reprezintă protecție DDoS la nivel de rețea.",
    },
    {
      id: "headers",
      label: "Antete de securitate",
      state: "verified",
      detail:
        "Politica aplicației include CSP cu nonce, nosniff, restricții frame, Referrer-Policy și HSTS doar pe HTTPS. Antetele efective de la hosting/CDN trebuie testate separat.",
    },
    {
      id: "backup",
      label: "Backup și restaurare găzduită",
      state: "not_tested",
      detail:
        "Există proceduri și teste sintetice locale cu verificare checksum și revocarea sesiunilor restaurate. Nu există dovadă de backup programat sau restaurare reușită pentru acest mediu găzduit.",
    },
    {
      id: "restore",
      label: "Ultimul test de restaurare locală",
      state: "not_tested",
      detail:
        "Rulează suita backup.test.ts în mediul de validare și consultă raportul de release datat. Cabinetul nu inventează ora unui test executat pe altă mașină.",
    },
    {
      id: "readiness",
      label: "Pregătire de producție",
      state: "warning",
      detail:
        "Necesită staging Supabase real, backup/restaurare, politici hosting/proxy, fișiere autorizate și validarea Google/consimțământului. Nu este o certificare de producție.",
    },
  ];
  if (mode === "local") dataDirectory();
  let matching = false;
  try {
    matching =
      createHash("sha256")
        .update(await readFile(join(process.cwd(), "package-lock.json")))
        .digest("hex") === evidence.lockSha256;
  } catch {
    /* No lockfile evidence in this deployment. */
  }
  const recent =
    Date.now() - Date.parse(evidence.checkedAt) >= 0 &&
    Date.now() - Date.parse(evidence.checkedAt) < 7 * 86400000;
  try {
    const hash = createHash("sha256");
    const paths = [
      "src/lib/server/backup.ts",
      "src/lib/server/config.ts",
      "src/lib/server/local.ts",
    ];
    // Keep file tracing restricted to these three source files, never the project root.
    const sources = await Promise.all([
      readFile(join(process.cwd(), "src/lib/server/backup.ts")),
      readFile(join(process.cwd(), "src/lib/server/config.ts")),
      readFile(join(process.cwd(), "src/lib/server/local.ts")),
    ]);
    for (const [index, path] of paths.entries()) {
      hash.update(path + "\0");
      hash.update(sources[index]);
    }
    if (
      matching &&
      recent &&
      hash.digest("hex") === evidence.restoration.sourceSha256 &&
      evidence.restoration.passed >= 3
    ) {
      const restore = checks.find((c) => c.id === "restore")!;
      restore.state = "verified";
      restore.detail = `${evidence.restoration.passed} teste sintetice locale reușite la ${evidence.restoration.checkedAt}, cu codul backup/config/stocare și lockfile identice dovezii. Nu reprezintă restaurare pe serverul curent, date de producție sau Supabase găzduit.`;
    }
  } catch {
    /* Missing source files/evidence never imply successful restoration. */
  }
  checks.push({
    id: "dependencies",
    label: "Vulnerabilități dependențe",
    state:
      matching && recent && evidence.total === 0
        ? "verified"
        : matching
          ? "warning"
          : "not_tested",
    detail: matching
      ? `Captură npm audit din ${evidence.checkedAt}: ${evidence.total} vulnerabilități raportate pentru lockfile-ul actual, inclusiv dezvoltare. Nu este monitorizare continuă; repetă scanarea înainte de release.`
      : "Lockfile-ul disponibil nu corespunde dovezii de scanare; nu se declară un rezultat.",
  });
  return {
    checkedAt: new Date().toISOString(),
    mode,
    checks,
    scope:
      "Politici active, verificarea cererii curente și dovezi datate. Fără scor de securitate și fără certificare automată a serviciilor externe.",
  };
}

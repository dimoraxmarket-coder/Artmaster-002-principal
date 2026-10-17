export class AdminApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
export async function adminApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.code || data?.error || "";
    const messages: Record<string, string> = {
      unauthorized:
        "Sesiunea a expirat. Autentifică-te din nou pentru a continua.",
      mfa_required: "Confirmă autentificarea în doi pași pentru a continua.",
      reauth_required:
        "Confirmarea recentă a expirat. Încheie sesiunea și autentifică-te din nou, apoi reîncarcă datele.",
      last_admin:
        "Ultimul administrator activ trebuie păstrat. Adaugă sau activează alt administrator înainte de această modificare.",
      self_change: "Un alt administrator trebuie să îți modifice accesul.",
      current_session:
        "Pentru această sesiune folosește acțiunea de ieșire din cont.",
      forbidden: "Rolul contului tău nu permite această acțiune.",
      rate_limited: "Prea multe încercări. Așteaptă puțin și încearcă din nou.",
      version_conflict:
        "Datele au fost modificate între timp. Încarcă versiunea actuală.",
      asset_in_use:
        "Imaginea este folosită în conținut salvat sau a fost arhivată. Actualizează biblioteca înainte de a continua.",
      not_found: "Înregistrarea nu mai este disponibilă. Actualizează datele.",
      invalid_input: "Verifică datele introduse și încearcă din nou.",
      upload_busy:
        "Procesarea imaginilor este ocupată. Așteaptă puțin și încearcă din nou.",
    };
    throw new AdminApiError(
      messages[code] || "Nu am putut finaliza acțiunea. Încearcă din nou.",
      code,
    );
  }
  return data as T;
}
export const jsonBody = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

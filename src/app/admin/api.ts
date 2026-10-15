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
      forbidden: "Rolul contului tău nu permite această acțiune.",
      rate_limited: "Prea multe încercări. Așteaptă puțin și încearcă din nou.",
      version_conflict:
        "Conținutul a fost modificat între timp. Încarcă versiunea actuală.",
      invalid_input: "Verifică datele introduse și încearcă din nou.",
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

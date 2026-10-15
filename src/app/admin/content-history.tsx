"use client";
import { useEffect, useId, useState } from "react";
import type { SiteContent } from "@/lib/content/types";
import type {
  ContentHistoryPage,
  ContentSnapshot,
} from "@/lib/content/history-types";
import { compareContent } from "@/lib/content/compare";
import styles from "./content-studio.module.css";
const actionNames: Record<string, string> = {
  "baseline-published": "Publicat la migrare",
  "baseline-draft": "Ciornă la migrare",
  draft: "Ciornă salvată",
  publish: "Publicare",
  restore: "Restaurare în ciornă",
};
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
    }),
    body = await response.json();
  if (!response.ok)
    throw new Error(
      (
        {
          version_conflict:
            "Versiunea serverului s-a schimbat. Încarcă versiunea actuală înainte de restaurare.",
          asset_unavailable:
            "O imagine nu mai este disponibilă. Restaurarea a fost oprită; conținutul actual este păstrat.",
          asset_in_use:
            "Versiunea folosește imagini arhivate. Restaurarea este oprită.",
          history_limit:
            "Limita istoricului a fost atinsă. Contactează proprietarul pentru extinderea capacității.",
          unauthorized: "Sesiunea a expirat. Autentifică-te din nou.",
          forbidden: "Rolul tău nu permite această operație.",
        } as Record<string, string>
      )[body.code] || "Istoricul nu este disponibil. Reîncearcă.",
    );
  return body;
}
export function ContentHistory({
  content,
  version,
  disabled,
  canRestore,
  onRestored,
  onRestoring,
}: {
  content: SiteContent;
  version: number;
  disabled: boolean;
  canRestore: boolean;
  onRestored: (content: SiteContent, version: number) => void;
  onRestoring: (busy: boolean) => void;
}) {
  const [page, setPage] = useState(1),
    [loaded, setLoaded] = useState<{
      key: string;
      data: ContentHistoryPage;
    } | null>(null),
    [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const id = useId();
  const loadKey = `${page}-${version}-${revision}`;
  const data = loaded?.key === loadKey ? loaded.data : null;
  useEffect(() => {
    const controller = new AbortController();
    api<ContentHistoryPage>(
      `/api/admin/content/history?page=${page}&pageSize=5`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setLoaded({ key: loadKey, data: value });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, version, revision, loadKey]);
  async function inspect(key: number) {
    setBusy(true);
    setError("");
    try {
      setSnapshot(
        await api<ContentSnapshot>(`/api/admin/content/history/${key}`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (
      !snapshot ||
      disabled ||
      !canRestore ||
      !window.confirm(
        `Restaurezi versiunea ${snapshot.version} într-o ciornă NOUĂ? Site-ul publicat rămâne neschimbat. Revizuiește ciorna înainte de publicare.`,
      )
    )
      return;
    onRestoring(true);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ version: number }>(
        `/api/admin/content/history/${snapshot.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version, confirm: true }),
        },
      );
      onRestored(snapshot.content, result.version);
      setSnapshot(null);
      setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onRestoring(false);
    }
  }
  const diff = snapshot ? compareContent(snapshot.content, content) : null;
  return (
    <details className={styles.history}>
      <summary>
        Istoric și restaurare{" "}
        <span>Versiuni protejate · publicare separată</span>
      </summary>
      <div className={styles.historyBody} aria-busy={busy || !data}>
        <p className={styles.muted}>
          Compară o versiune cu editorul actual. Restaurarea cere o ciornă
          salvată, fără modificări locale, și creează o versiune nouă. Imaginile
          indisponibile blochează restaurarea.
        </p>
        {error && (
          <div role="alert" className="form-status form-status-error">
            {error}
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setRevision((x) => x + 1);
              }}
            >
              Reîncearcă istoricul
            </button>
          </div>
        )}
        {!data && !error && <p role="status">Se încarcă istoricul…</p>}
        {data && (
          <>
            <div className={styles.historyList}>
              {data.versions.length ? (
                data.versions.map((item) => (
                  <article key={item.id} className={styles.version}>
                    <div>
                      <strong>
                        v{item.version} · {actionNames[item.action]}
                      </strong>
                      <p>
                        <time dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString("ro-RO")}
                        </time>{" "}
                        ·{" "}
                        <span title={item.actor || "Conținut existent"}>
                          {item.actor
                            ? `Cont ${item.actor.slice(0, 8)}`
                            : "Conținut existent · actor necunoscut"}
                        </span>
                        {item.sourceId ? ` · sursa #${item.sourceId}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void inspect(item.id)}
                    >
                      Compară #{item.id}
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-state">
                  Nicio versiune salvată încă. Prima salvare creează istoricul.
                </p>
              )}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="button"
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Versiuni mai noi
              </button>
              <span>
                Pagina {page} · {data.total} versiuni ·{" "}
                {(data.bytes / 1024 / 1024).toFixed(1)} /{" "}
                {data.limitBytes / 1024 / 1024} MB
              </span>
              <button
                type="button"
                className="button"
                disabled={busy || page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Versiuni mai vechi
              </button>
            </div>
            <p className={styles.muted}>
              Păstrare fără ștergere automată · maximum{" "}
              {data.limitVersions.toLocaleString("ro-RO")} versiuni. La limită,
              salvarea se oprește fără pierdere de date.
            </p>
          </>
        )}
        {snapshot && diff && (
          <section className={styles.comparison} aria-labelledby={id}>
            <h4 id={id}>Versiunea {snapshot.version} → editorul actual</h4>
            <p>
              {diff.total} câmpuri diferite
              {diff.total > 80 ? " · primele 80 sunt afișate" : ""}.
            </p>
            {diff.changes.map((change) => (
              <div key={change.path} className={styles.change}>
                <code>{change.path}</code>
                <div>
                  <p>
                    <strong>Versiune salvată</strong>
                    <br />
                    {change.before}
                  </p>
                  <p>
                    <strong>Editor actual</strong>
                    <br />
                    {change.after}
                  </p>
                </div>
              </div>
            ))}
            <div className={styles.actions}>
              {canRestore && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={disabled || busy}
                  onClick={() => void restore()}
                >
                  Restaurează într-o ciornă nouă
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setSnapshot(null)}
              >
                Închide comparația
              </button>
            </div>
            {disabled && (
              <p role="note">
                Salvează sau încarcă versiunea serverului înainte de restaurare.
              </p>
            )}
          </section>
        )}
      </div>
    </details>
  );
}

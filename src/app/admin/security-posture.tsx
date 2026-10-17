"use client";
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import type { securityPosture } from "@/lib/server/security-posture";
import { Action, Notice } from "./components";
import styles from "./admin.module.css";
type Posture = Awaited<ReturnType<typeof securityPosture>>;
const labels = {
  verified: "Verificat",
  warning: "Atenție",
  not_configured: "Neconfigurat",
  not_tested: "Netestat",
};
export function SecurityPosture() {
  const [data, setData] = useState<Posture | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<Posture>("/api/admin/security/posture", {
      signal: controller.signal,
    })
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [refresh]);
  return (
    <section
      className={styles.panel}
      aria-label="Starea verificabilă a protecțiilor"
      aria-busy={busy}
    >
      <div className={`${styles.panelHeading} ${styles.postureHeading}`}>
        <div>
          <h2>Verificări și pregătire de lansare</h2>
          <p>Separăm politica aplicației de validarea infrastructurii reale.</p>
        </div>
        <Action
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setRefresh((v) => v + 1);
          }}
        >
          Actualizează starea
        </Action>
      </div>
      {error && <Notice error>{error}</Notice>}
      {!data && !error && (
        <p className={styles.padded} role="status">
          Se verifică starea…
        </p>
      )}
      {data && (
        <div className={styles.padded}>
          <dl className={`${styles.securityList} ${styles.postureList}`}>
            {data.checks.map((c) => (
              <div key={c.id}>
                <dt>
                  {c.label}
                  <br />
                  <strong>{labels[c.state]}</strong>
                </dt>
                <dd>{c.detail}</dd>
              </div>
            ))}
          </dl>
          <p>{data.scope}</p>
          <p>Actualizat: {new Date(data.checkedAt).toLocaleString("ro")}.</p>
        </div>
      )}
    </section>
  );
}

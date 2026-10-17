"use client";
import { useEffect, useState, useRef } from "react";
import { adminApi, jsonBody } from "./api";
import type { PageAudit } from "@/lib/seo-audit";
import type { seoHistory } from "@/lib/server/seo-history";
import styles from "./growth.module.css";
type History = Awaited<ReturnType<typeof seoHistory>>;
export function SeoHistoryPanel({
  pages,
  selected,
  onAudit,
  refreshKey,
  busy,
  onBusy,
}: {
  pages: string[];
  selected: string;
  onAudit: (report: PageAudit) => void;
  refreshKey: number;
  busy: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [data, setData] = useState<History | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState<"all" | "issues" | "passed">("all");
  const runController = useRef<AbortController | null>(null);
  useEffect(() => () => runController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<History>(
      `/api/admin/seo/history?path=${encodeURIComponent(selected)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [selected, refresh, refreshKey]);
  async function run() {
    setRunning(true);
    onBusy(true);
    setProgress(0);
    setError("");
    const controller = new AbortController();
    runController.current = controller;
    try {
      for (const path of pages) {
        if (controller.signal.aborted) break;
        const report = await adminApi<PageAudit>("/api/admin/seo/audit", {
          method: "POST",
          signal: controller.signal,
          ...jsonBody({ path }),
        });
        onAudit(report);
        setProgress((p) => p + 1);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      runController.current = null;
      setRunning(false);
      onBusy(false);
      setRefresh((r) => r + 1);
    }
  }
  const displayed =
    data?.pages.filter(
      (p) =>
        filter === "all" ||
        (filter === "issues" ? p.failed > 0 : p.failed === 0),
    ) || [];
  const history = data?.path === selected ? data.history : [];
  return (
    <section
      className={styles.panel}
      aria-label="Acoperire și istoric SEO"
      aria-busy={running}
    >
      <h3>Scor tehnic general și istoric</h3>
      <p>
        <strong>
          {data?.overallScore === null || data?.overallScore === undefined
            ? "Scor general necalculat"
            : `${data.overallScore}/100`}
        </strong>{" "}
        · {data?.checkedPages ?? 0}/{data?.totalPages ?? pages.length} pagini
        verificate pentru conținutul publicat și build-ul actual.
      </p>
      <p>
        Scorul general este media aritmetică a tuturor paginilor din inventar,
        cu aceeași formulă v2. Nu extrapolăm paginile neverificate. Publicarea
        unui conținut diferit, un build nou sau schimbarea politicii de indexare
        invalidează acoperirea veche; ciornele nu o modifică. În dezvoltare,
        repornește serverul după schimbări în cod.
      </p>
      <button
        className={styles.button}
        type="button"
        disabled={busy || !pages.length}
        onClick={() => void run()}
      >
        Verifică toate paginile publice
      </button>
      {running && (
        <button className={styles.button} type="button" onClick={() => runController.current?.abort()}>
          Oprește verificarea
        </button>
      )}
      {running && (
        <p role="status">
          Verificare {progress}/{pages.length}. Păstrează această pagină
          deschisă.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        Rezultate{" "}
        <select
          aria-label="Filtru rezultate SEO"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">Toate</option>
          <option value="issues">Cu probleme</option>
          <option value="passed">Toate verificările trecute</option>
        </select>
      </label>
      {displayed.length ? (
        <div className={`${styles.tableWrap} ${styles.historyPages}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pagină</th>
                <th>Scor</th>
                <th>Trecute / Probleme</th>
                <th>Verificat</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((p) => (
                <tr key={p.path}>
                  <td>{p.path}</td>
                  <td>{p.score}/100</td>
                  <td>
                    {p.passed} / {p.failed}
                  </td>
                  <td>{new Date(p.checkedAt).toLocaleString("ro")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nu există rezultate salvate pentru acest filtru.</p>
      )}
      <h4>Ultimele verificări · {selected}</h4>
      {history.length ? (
        <>
          <svg
            className={styles.chart}
            viewBox="0 0 800 160"
            role="img"
            aria-label="Istoricul scorurilor tehnice. Datele și valorile exacte sunt în tabel."
          >
            <path
              d="M0 145H800M0 80H800M0 15H800"
              stroke="#42464e"
              fill="none"
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points={[...history]
                .reverse()
                .map(
                  (v, i) =>
                    `${history.length > 1 ? (i / (history.length - 1)) * 800 : 400},${145 - v.report.score * 1.3}`,
                )
                .join(" ")}
            />
          </svg>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Scor</th>
                  <th>Conținut</th>
                  <th>Comparație</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={entry.id}>
                    <td>
                      {new Date(entry.report.checkedAt).toLocaleString("ro")}
                    </td>
                    <td>{entry.report.score}/100</td>
                    <td>
                      {entry.currentContent
                        ? "Publicat actual"
                        : "Versiune publicată anterioară"}
                    </td>
                    <td>
                      {history[i + 1]
                        ? `${entry.report.score - history[i + 1].report.score} puncte față de verificarea precedentă`
                        : "Fără verificare precedentă"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Vezi ultima verificare salvată</summary>
            <ul>
              {history[0].report.checks.map((c) => (
                <li key={c.id}>
                  {c.label}: {c.status === "pass" ? "Trecut" : "De verificat"} ·{" "}
                  {c.detail} {c.status !== "pass" && c.recommendation}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p>Nicio verificare salvată pentru această pagină.</p>
      )}
      <p>
        {data?.retention ||
          "Istoricul este păstrat pe server, separat de versiunile CMS."}
      </p>
    </section>
  );
}

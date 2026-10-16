"use client";
import { useEffect, useState } from "react";
import { adminApi, jsonBody } from "./api";
import type { PageAudit } from "@/lib/seo-audit";
import type { GoogleReports } from "@/lib/server/google-reporting";
import styles from "./growth.module.css";
type Data = {
  range: { start: string; end: string };
  timezone: string;
  days: { day: string; count: number }[];
  submissions: number;
  pages: string[];
  google: GoogleReports;
  pagespeedConfigured: boolean;
  cacheMinutes: number;
};
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note: string;
}) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>
        {value === null ? "—" : new Intl.NumberFormat("ro").format(value)}
      </strong>
      <small>{note}</small>
    </article>
  );
}
function Trend({
  title,
  days,
}: {
  title: string;
  days: { day: string; value: number }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div>
      <h3>{title}</h3>
      {days.length ? (
        <>
          <svg
            className={styles.chart}
            viewBox="0 0 800 160"
            role="img"
            aria-label={`${title}, ${days.length} zile. Valorile exacte sunt în tabel.`}
          >
            <path
              d="M0 145H800M0 80H800M0 15H800"
              stroke="#42464e"
              strokeWidth="1"
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points={days
                .map(
                  (d, i) =>
                    `${days.length > 1 ? (i / (days.length - 1)) * 800 : 400},${145 - (d.value / max) * 130}`,
                )
                .join(" ")}
            />
          </svg>
          <details>
            <summary>Valorile zilnice · {title}</summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p>Nu există date conectate pentru acest grafic.</p>
      )}
    </div>
  );
}
export function SeoCenter({ canManage = true }: { canManage?: boolean }) {
  const [data, setData] = useState<Data | null>(null),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [path, setPath] = useState("/ro"),
    [audits, setAudits] = useState<Record<string, PageAudit>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [speed, setSpeed] = useState<{
      checkedAt: string;
      labScore: number | null;
      field: { lcp: number | null; inp: number | null; cls: number | null };
      note: string;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<Data>("/api/admin/seo", { signal: controller.signal })
      .then((v) => {
        setData(v);
        setStart(v.range.start);
        setEnd(v.range.end);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(
        await adminApi<Data>(
          `/api/admin/seo?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function audit() {
    setBusy(true);
    setError("");
    try {
      const v = await adminApi<PageAudit>("/api/admin/seo/audit", {
        method: "POST",
        ...jsonBody({ path }),
      });
      setAudits((previous) => ({ ...previous, [path]: v }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = audits[path],
    ga = data?.google.ga4,
    search = data?.google.search;
  const state = (s: string | undefined) =>
    s === "connected"
      ? "Conectat · date reale"
      : s === "unavailable"
        ? "Indisponibil · verifică permisiunile și conexiunea"
        : "Neconectat · fără date analytics";
  return (
    <section aria-label="Centrul SEO și Analytics" aria-busy={busy}>
      {error && (
        <div className={styles.panel} role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p role="status">Se încarcă datele reale…</p>}
      <div className={styles.panel}>
        <h2>SEO & Analytics Center</h2>
        <p>
          O perspectivă transparentă asupra paginilor și cererilor ARTMASTER.
          Datele lipsă nu sunt înlocuite cu valori demonstrative.
        </p>
        <div className={styles.toolbar}>
          <label>
            De la · dată
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              max={end}
            />
          </label>
          <label>
            Până la · dată
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              min={start}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !start || !end}
            onClick={() => void load()}
          >
            Aplică perioada
          </button>
        </div>
        <p>
          Maximum 93 de zile. CRM folosește UTC; GA4 folosește fusul orar al
          proprietății, iar Search Console ziua Pacific Time. Rapoartele Google
          sunt memorate pe server 15 minute; datele recente pot avea întârziere
          sau praguri de confidențialitate.
        </p>
      </div>
      <div className={styles.grid}>
        <Metric
          label="Cereri salvate în CRM"
          value={data?.submissions ?? null}
          note="Numără cererile persistate, inclusiv fără consimțământ analytics. Nu reprezintă vizitatori."
        />
        <Metric
          label="Vizitatori · GA4"
          value={ga?.users ?? null}
          note={state(ga?.state)}
        />
        <Metric
          label="Sesiuni · GA4"
          value={ga?.sessions ?? null}
          note={state(ga?.state)}
        />
        <Metric
          label="Afișări în căutare"
          value={search?.impressions ?? null}
          note={state(search?.state)}
        />
        <Metric
          label="Clickuri din căutare"
          value={search?.clicks ?? null}
          note={state(search?.state)}
        />
        <Metric
          label="Evenimente cheie · GA4"
          value={ga?.keyEvents ?? null}
          note="Doar evenimente configurate în proprietatea GA4; nu sunt echivalente automat cu toate cererile CRM."
        />
      </div>
      {data && (
        <div className={styles.panel}>
          <Trend
            title="Cereri primite · CRM"
            days={data.days.map((d) => ({ day: d.day, value: d.count }))}
          />
          {ga?.state === "connected" && (
            <>
              <Trend
                title="Sesiuni · GA4"
                days={ga.days.map((d) => ({ day: d.day, value: d.sessions }))}
              />
              <p>
                Rata sesiunilor cu eveniment cheie raportată de GA4:{" "}
                {((ga.sessionKeyEventRate || 0) * 100).toFixed(2)}%. Nu împărțim
                cererile CRM la sesiunile cu consimțământ.
              </p>
            </>
          )}
          {search?.state === "connected" && (
            <Trend
              title="Clickuri din căutare"
              days={search.days.map((d) => ({ day: d.day, value: d.clicks }))}
            />
          )}
        </div>
      )}
      <div className={styles.panel}>
        <h3>Audit pe pagina publicată</h3>
        <p>
          Scor = suma punctelor verificărilor trecute:{" "}
          <strong>10 verificări × 10 puncte = 100</strong>. Eșecul sau lipsa
          dovezii acordă 0 puncte. Nu măsoară poziția în Google. Fiecare audit
          folosește HTML-ul public randat; ciornele sunt excluse.
        </p>
        <div className={styles.toolbar}>
          <label>
            Pagina
            <select
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setSpeed(null);
              }}
            >
              {(data?.pages || ["/ro"]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !data}
            onClick={() => void audit()}
          >
            Verifică pagina
          </button>
        </div>
        {current ? (
          <>
            <div className={styles.score}>
              <strong>
                {current.score}
                <small>din 100</small>
              </strong>
              <div>
                <h4>{current.path}</h4>
                <p>
                  {new Date(current.checkedAt).toLocaleString("ro")} ·{" "}
                  {Object.keys(audits).length} pagini verificate în această
                  sesiune din {data?.pages.length}. Nu se afișează un scor
                  global pentru pagini neverificate.
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Verificare</th>
                    <th>Puncte</th>
                    <th>Rezultat și recomandare</th>
                  </tr>
                </thead>
                <tbody>
                  {current.checks.map((c) => (
                    <tr key={c.id}>
                      <td>{c.label}</td>
                      <td
                        className={
                          c.status === "pass" ? styles.pass : styles.fail
                        }
                      >
                        {c.status === "pass" ? c.weight : 0}/{c.weight}
                      </td>
                      <td>
                        {c.detail}
                        <small>{c.recommendation}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {current.brokenLinks.length > 0 && (
              <p>
                Linkuri interne de corectat: {current.brokenLinks.join(", ")}
              </p>
            )}
            <p>{current.scope}</p>
          </>
        ) : (
          <p>
            Nicio verificare executată pentru pagina selectată. Alege „Verifică
            pagina” pentru rezultate reale.
          </p>
        )}
      </div>
      <div className={styles.panel}>
        <h3>Core Web Vitals & PageSpeed</h3>
        <p>
          {data?.pagespeedConfigured
            ? "Cheia PageSpeed este configurată. Testul trimite URL-ul public selectat către Google."
            : "Neconectat. Necesită activare server-side și o cheie PageSpeed. URL-urile locale/private nu sunt trimise către Google."}
        </p>
        <button
          className={styles.button}
          type="button"
          disabled={busy || !data?.pagespeedConfigured || !canManage}
          onClick={async () => {
            if (
              !confirm("Trimiți URL-ul public selectat către Google PageSpeed?")
            )
              return;
            setBusy(true);
            setError("");
            try {
              setSpeed(
                await adminApi("/api/admin/seo/pagespeed", {
                  method: "POST",
                  ...jsonBody({ path }),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Rulează PageSpeed mobil
        </button>
        {speed && (
          <>
            <p>
              Scor laborator Lighthouse: {speed.labScore ?? "Fără rezultat"} /
              100
            </p>
            <p>
              CrUX p75 · LCP:{" "}
              {speed.field.lcp === null ? "Fără date" : speed.field.lcp + " ms"}{" "}
              · INP:{" "}
              {speed.field.inp === null ? "Fără date" : speed.field.inp + " ms"}{" "}
              · CLS: {speed.field.cls ?? "Fără date"}
            </p>
            <p>{speed.note}</p>
          </>
        )}
      </div>
      <div className={styles.panel}>
        <h3>Conexiuni & confidențialitate</h3>
        <p>
          GA4: {state(ga?.state)}. Search Console: {state(search?.state)}.
        </p>
        <p>
          Conectarea se face de proprietar prin variabile server-only și un cont
          de serviciu Google cu acces doar la citire. Cheile și tokenurile nu se
          introduc aici și nu ajung în browser. GA4 public se încarcă numai după
          consimțământ; refuzul nu afectează CRM.
        </p>
        <p>
          Pașii exacți: documentația{" "}
          <code>docs/seo-analytics-hero-equipment.md</code> din proiect. Nu
          există conectare sau date Google simulate.
        </p>
      </div>
    </section>
  );
}

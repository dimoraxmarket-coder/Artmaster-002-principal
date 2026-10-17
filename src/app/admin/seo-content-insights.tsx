"use client";
import { useEffect, useState } from "react";
import type { ContentInsight } from "@/lib/content/seo-insights";
import { adminApi } from "./api";
import styles from "./growth.module.css";

type Report = { checkedAt: string; version: number; source: "published" | "repository-defaults"; rows: ContentInsight[] };
export function SeoContentInsights() {
  const [report, setReport] = useState<Report | null>(null), [locale, setLocale] = useState("ro"), [onlyIssues, setOnlyIssues] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    adminApi<Report>("/api/admin/seo/content", { signal: controller.signal }).then(setReport).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function refresh() {
    setBusy(true); setError("");
    try { setReport(await adminApi<Report>("/api/admin/seo/content")); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const rows = report?.rows.filter((row) => row.locale === locale && (!onlyIssues || row.issues.length)) || [];
  return <section className={styles.panel} aria-label="Conținut și oportunități SEO" aria-busy={busy}>
    <h3>Conținut și oportunități SEO</h3>
    <p>Inventar editorial al serviciilor publicate, în RO/RU/EN. Analizează câmpurile CMS și legăturile asociate; auditul HTML de mai sus verifică pagina randată. Numărul de cuvinte și recomandările nu reprezintă un scor Google sau o garanție de poziționare.</p>
    <div className={styles.toolbar}>
      <label>Limba raportului<select value={locale} onChange={(e) => setLocale(e.target.value)}><option value="ro">Română</option><option value="ru">Русский</option><option value="en">English</option></select></label>
      <label><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Doar cu recomandări</label>
      <button type="button" disabled={busy} onClick={() => void refresh()}>Actualizează inventarul</button>
      <a href="/admin#content" className={styles.button}>Deschide Content Studio</a>
    </div>
    {busy && <p role="status">Se verifică conținutul publicat…</p>}
    {error && <p role="alert">{error}</p>}
    {report && <>
      <p>Verificat: {new Date(report.checkedAt).toLocaleString("ro", { timeZone: "Europe/Chisinau" })} · Chișinău · versiunea documentului {report.version}. Sursă: {report.source === "published" ? "conținut publicat" : "conținut implicit din proiect; niciun document publicat în baza locală"}. Ciornele sunt excluse.</p>
      {rows.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Pagină și metadate</th><th>Conținut publicat</th><th>Recomandări</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.path}>
          <td><a href={row.path} target="_blank" rel="noopener noreferrer">{row.name} ↗</a><small>{row.path}</small><strong>{row.title}</strong><small>{row.description}</small></td>
          <td>{row.words} cuvinte<small>{row.questions} întrebări · {row.applications} utilizări · {row.quoteHints} informații pentru ofertare</small><small>{row.projects} proiecte reale · {row.guides} ghiduri asociate</small></td>
          <td>{row.issues.length ? <ul>{row.issues.map((issue) => <li key={issue.id}><strong>{issue.detail}</strong><small>{issue.recommendation}</small></li>)}</ul> : "Nicio recomandare din regulile editoriale verificate."}</td>
        </tr>)}</tbody>
      </table></div> : <p>Nicio pagină pentru selecția curentă.</p>}
      <details><summary>Metodă și limite</summary><p>O înregistrare per serviciu și limbă. Numărăm titlul, sumarul, descrierea, utilizările, informațiile pentru ofertare și FAQ. Sub 180 de cuvinte cerem doar revizuire editorială. Verificăm unicitatea titlurilor și descrierilor între serviciile aceleiași limbi și intervalele orientative 15–70 / 50–180 de caractere. Numărăm exclusiv ghidurile publicate și proiectele marcate reale și publicate. O imagine încărcată de administrator nu dovedește automat autenticitatea lucrării. Nu verificăm volume de căutare, clasamente, drepturi fotografice sau toate paginile site-ului prin acest inventar.</p></details>
    </>}
  </section>;
}

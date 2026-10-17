"use client";
import { useId } from "react";
import type { Locale, PageSeo, SiteContent } from "@/lib/content/types";
import { contentPaths } from "@/lib/content/routes";
import { seedPageSeo } from "@/lib/content/seo";
import styles from "./growth.module.css";

export function SeoContentFields({ content, locale, path, mutate, onPathChange }: {
  content: SiteContent; locale: Locale; path: string; mutate: (change: (next: SiteContent) => void) => void; onPathChange: (path: string) => void;
}) {
  const id = useId();
  const entry = content.seo?.find((v) => v.path === path);
  const seed = seedPageSeo(content, path), shown = entry || seed;
  function update(key: "title" | "description", value: string) {
    mutate((next) => {
      next.seo = next.seo || [];
      const index = next.seo.findIndex((v) => v.path === path);
      const row: PageSeo = structuredClone(index >= 0 ? next.seo[index] : seed);
      row[key][locale] = value;
      if (index >= 0) next.seo[index] = row; else next.seo.push(row);
    });
  }
  return <section className={styles.panel} aria-label="Metadate SEO editabile">
    <h3>Metadate pentru Google și distribuire</h3>
    <p>RO/RU/EN, text simplu. Canonical și hreflang rămân controlate de aplicație. Modificările folosesc aceeași ciornă, istoric, previzualizare privată și publicare explicită. Nu reprezintă o garanție de poziționare.</p>
    <label htmlFor={`${id}-path`}>Pagina SEO</label>
    <select id={`${id}-path`} value={path} onChange={(event) => onPathChange(event.target.value)}>
      {contentPaths(content, { drafts: true }).map((value) => <option key={value} value={value}>/{locale}{value ? "/" + value : ""}</option>)}
    </select>
    <p>{entry ? "Metadate personalizate în această versiune." : "Valori propuse pentru editare; pagina folosește în continuare metadatele automate până la salvare și publicare."}</p>
    <div className="field">
      <label htmlFor={`${id}-title`}>Titlu SEO · {locale.toUpperCase()}</label>
      <input id={`${id}-title`} value={shown.title[locale]} maxLength={70} onChange={(e) => update("title", e.target.value)} aria-describedby={`${id}-title-help`} />
      <small id={`${id}-title-help`}>{shown.title[locale].length}/70 caractere · minimum 15. Titlul este complet: include ARTMASTER dacă dorești; nu adăugăm automat brandul de două ori.</small>
    </div>
    <div className="field">
      <label htmlFor={`${id}-description`}>Descriere SEO · {locale.toUpperCase()}</label>
      <textarea id={`${id}-description`} rows={4} maxLength={180} value={shown.description[locale]} onChange={(e) => update("description", e.target.value)} aria-describedby={`${id}-description-help`} />
      <small id={`${id}-description-help`}>{shown.description[locale].length}/180 caractere · minimum 50. Completează natural toate trei limbile.</small>
    </div>
    <div className={styles.searchPreview} aria-label="Previzualizare orientativă rezultat căutare">
      <span>artmaster.md/{locale}{path ? "/" + path : ""}</span>
      <strong>{shown.title[locale]}</strong><p>{shown.description[locale]}</p>
    </div>
    <p>Exemplu orientativ. Google poate rescrie titlul sau descrierea; nu este un rezultat Google real.</p>
    {entry && <button type="button" className={styles.button} onClick={() => {
      if (window.confirm("Revii la metadatele automate în această ciornă, pentru toate trei limbile? Publicarea rămâne separată.")) mutate((next) => { next.seo = next.seo?.filter((v) => v.path !== path); });
    }}>Revino la metadate automate în ciornă</button>}
  </section>;
}

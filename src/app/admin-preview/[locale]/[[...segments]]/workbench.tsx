"use client";
import { useState } from "react";
import type { Locale, Localized } from "@/lib/content/types";
import styles from "./workbench.module.css";
export function PreviewWorkbench({
  locale,
  segments,
  version,
  hasDraft,
  entries,
}: {
  locale: Locale;
  segments: string[];
  version: number;
  hasDraft: boolean;
  entries: { path: string; title: Localized }[];
}) {
  const [language, setLanguage] = useState(locale),
    [mobile, setMobile] = useState(false);
  const [pagePath, setPagePath] = useState(segments.join("/"));
  const path = `/admin-preview/${language}${pagePath ? "/" + pagePath.split("/").map(encodeURIComponent).join("/") : ""}?canvas=1`;
  return (
    <div className={styles.workbench}>
      <header className={styles.toolbar}>
        <div>
          <strong>
            ARTMASTER <span>PREVIEW STUDIO</span>
          </strong>
          <p>
            {hasDraft ? "Ciornă salvată" : "Conținut publicat · nicio ciornă"} ·
            versiunea {version} · vizibil doar echipei autentificate
          </p>
        </div>
        <a href="/admin">Înapoi în cabinet ↗</a>
        <label>
          Limba
          <select
            aria-label="Limba"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Locale)}
          >
            <option value="ro">RO · Română</option>
            <option value="ru">RU · Русский</option>
            <option value="en">EN · English</option>
          </select>
        </label>
        <label>
          Pagina
          <select
            aria-label="Pagina"
            value={pagePath}
            onChange={(e) => setPagePath(e.target.value)}
          >
            <optgroup label="Pagini">
              {[
                ["", "Acasă"],
                ["servicii", "Servicii"],
                ["echipamente", "Echipamente"],
                ["portofoliu", "Portofoliu"],
                ["despre-noi", "Despre noi"],
                ["contact", "Contact"],
                ["solicita-oferta", "Ofertă"],
                ["intrebari-frecvente", "FAQ"],
                ["blog", "Articole"],
              ].map(([path, label]) => (
                <option key={path} value={path}>
                  {label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Conținut · inclusiv ciorne nepublicate">
              {entries.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.title[language]}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div role="group" aria-label="Dimensiunea previzualizării">
          <button
            type="button"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            Mobil · 390px
          </button>
        </div>
      </header>
      <p className={styles.notice}>
        Previzualizezi conținutul salvat pe server. Navigarea rămâne protejată.
        Formularele nu trimit solicitări. Publicarea se face separat în cabinet.
      </p>
      <div className={styles.stage}>
        <iframe
          key={path}
          title={`Previzualizare protejată ${language.toUpperCase()}`}
          src={path}
          className={mobile ? styles.mobile : styles.desktop}
          referrerPolicy="same-origin"
        />
      </div>
    </div>
  );
}

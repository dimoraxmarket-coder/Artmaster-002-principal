"use client";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import type { MediaPage } from "@/lib/server/workflow-types";
import styles from "./content-studio.module.css";
export function MediaSelector({
  onSelect,
  disabled,
}: {
  onSelect: (url: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [q, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [loaded, setLoaded] = useState<{ key: string; data: MediaPage } | null>(
      null,
    ),
    [error, setError] = useState("");
  const id = useId();
  const loadKey = `${q}-${page}`;
  const data = loaded?.key === loadKey ? loaded.data : null;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/admin/media?q=${encodeURIComponent(q)}&page=${page}&pageSize=6`,
        {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        },
      )
        .then(async (r) => {
          if (!r.ok)
            throw new Error(
              "Biblioteca nu este disponibilă. Verifică sesiunea și reîncearcă.",
            );
          return r.json();
        })
        .then((v) => {
          if (!controller.signal.aborted) {
            setLoaded({ key: loadKey, data: v });
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, page, loadKey]);
  return (
    <>
      <button
        type="button"
        className="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Închide biblioteca" : "Alege din Media Studio"}
      </button>
      {open && (
        <section
          id={id}
          className={styles.picker}
          aria-label="Selectează o imagine"
        >
          <label htmlFor={`${id}-q`}>Caută imagini</label>
          <input
            id={`${id}-q`}
            type="search"
            value={q}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          {error && <p role="alert">{error}</p>}
          {!data && !error && <p role="status">Se încarcă imaginile…</p>}
          {data && (
            <>
              <div className={styles.assets}>
                {data.assets.filter(asset=>! /\.(mp4|webm)$/.test(asset.url)).map((asset) => (
                  <button
                    key={asset.url}
                    type="button"
                    className={styles.asset}
                    disabled={disabled}
                    onClick={() => {
                      onSelect(asset.url);
                      setOpen(false);
                    }}
                  >
                    <Image
                      src={
                        asset.url.startsWith("/api/media/")
                          ? asset.url.replace(
                              "/api/media/",
                              "/api/admin/media/",
                            )
                          : asset.url
                      }
                      alt=""
                      width={200}
                      height={110}
                      unoptimized
                    />
                    <span>{asset.name}</span>
                    <span>
                      {asset.width} × {asset.height} · Selectează
                    </span>
                  </button>
                ))}
              </div>
              {!data.assets.length && (
                <p>
                  Nu există imagini pentru această căutare. Încarcă o fotografie
                  sau schimbă căutarea.
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Pagina precedentă
                </button>
                <span>
                  Pagina {page} · {data.total} imagini
                </span>
                <button
                  type="button"
                  className="button"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Pagina următoare
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

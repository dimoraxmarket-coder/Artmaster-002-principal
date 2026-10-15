"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Actor } from "@/lib/server/types";
import type { MediaAsset, MediaPage } from "@/lib/server/workflow-types";
import { adminApi, jsonBody } from "./api";
import { Action, AdminIcon, EmptyState, Notice, Skeleton } from "./components";
import styles from "./admin.module.css";
export function MediaLibrary({ actor }: { actor: Actor }) {
  const [data, setData] = useState<MediaPage | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const generation = useRef(0);
  const load = useCallback(
    async (isActive: () => boolean = () => true) => {
      const id = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const value = await adminApi<MediaPage>(
          `/api/admin/media?${new URLSearchParams({ q: search, page: String(page), pageSize: "12" })}`,
        );
        if (id === generation.current && isActive()) setData(value);
      } catch (failure) {
        if (id === generation.current && isActive())
          setError((failure as Error).message);
      } finally {
        if (id === generation.current && isActive()) setLoading(false);
      }
    },
    [search, page],
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => void load(() => active), 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  async function upload(file: File, replace?: MediaAsset) {
    setError("");
    setMessage("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Alege un fișier PNG sau JPEG de maximum 5 MB.");
      return;
    }
    if (
      replace &&
      !window.confirm(
        `Înlocuiești imaginea „${replace.name}” în toate asocierile ciornei salvate? Website-ul public păstrează imaginea actuală până la publicare.`,
      )
    )
      return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await adminApi<{ url: string }>("/api/admin/media", {
        method: "POST",
        body,
      });
      if (replace) {
        try {
          await adminApi("/api/admin/media/replace", {
            method: "POST",
            ...jsonBody({
              url: replace.url,
              replacementUrl: result.url,
              expectedVersion: data!.contentVersion,
            }),
          });
          setMessage(
            "Imagine înlocuită în ciorna salvată. Reîncarcă editorul pentru a verifica și publica. Originalul și website-ul public se păstrează.",
          );
        } catch (failure) {
          throw new Error(
            `${(failure as Error).message} Imaginea nouă este păstrată privat în bibliotecă.`,
          );
        }
      } else
        setMessage(
          "Imagine încărcată privat și salvată în bibliotecă. Copiază adresa pentru a o asocia conținutului.",
        );
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>Imaginile care spun povestea.</h2>
          <p>Inventar persistent. Originale protejate. Publicare controlată.</p>
        </div>
        <Action
          icon="refresh"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Actualizează
        </Action>
      </div>
      <div className={styles.mediaTools}>
        <label className={styles.search}>
          <AdminIcon name="search" />
          <input
            aria-label="Caută imagini"
            placeholder="Caută după nume sau adresă…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label
          className={`${styles.action} ${styles.primary} ${actor.role === "viewer" || busy ? styles.disabled : ""}`}
        >
          <AdminIcon name="plus" />
          {busy ? "Se încarcă…" : "Încarcă imagine"}
          <input
            className={styles.fileInput}
            type="file"
            aria-label="Încarcă imagine în bibliotecă"
            accept="image/png,image/jpeg"
            disabled={actor.role === "viewer" || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {error && (
        <div className={styles.padded}>
          <Notice error>{error}</Notice>
        </div>
      )}
      {message && (
        <div className={styles.padded}>
          <Notice>{message}</Notice>
        </div>
      )}
      {loading ? (
        <Skeleton />
      ) : error && !data ? (
        <EmptyState
          title="Biblioteca nu a putut fi încărcată"
          action={<Action onClick={() => void load()}>Reîncearcă</Action>}
        >
          Reîncearcă pentru a vedea imaginile salvate.
        </EmptyState>
      ) : !data?.assets.length ? (
        <EmptyState
          icon="media"
          action={
            page > 1 ? (
              <Action onClick={() => setPage(1)}>Prima pagină</Action>
            ) : undefined
          }
          title={
            search ? "Nicio imagine găsită" : "Un loc pentru imaginile tale."
          }
        >
          Încarcă fotografii proprii și păstrează-le private până la publicare.
        </EmptyState>
      ) : (
        <>
          <div className={styles.mediaGrid}>
            {data.assets.map((asset) => (
              <article className={styles.asset} key={asset.url}>
                <div className={styles.assetImage}>
                  <Image
                    src={
                      asset.url.startsWith("/api/media/")
                        ? asset.url.replace("/api/media/", "/api/admin/media/")
                        : asset.url
                    }
                    alt={asset.name}
                    width={400}
                    height={260}
                    unoptimized
                  />
                  <span className={styles.assetBadge}>
                    {asset.uses.some((use) => use.state === "published")
                      ? "În versiunea publicată"
                      : asset.managed
                        ? "Privat"
                        : "Resursă publică existentă"}
                  </span>
                </div>
                <div className={styles.assetBody}>
                  <h3>{asset.name}</h3>
                  <p>
                    {asset.uses.length
                      ? `${asset.uses.length} asocieri în versiunile salvate`
                      : "Neasociată · salvată în bibliotecă"}
                    {asset.bytes > 0
                      ? ` · ${Math.ceil(asset.bytes / 1024)} KB`
                      : ""}
                  </p>
                  <Action
                    variant="quiet"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(asset.url);
                        setMessage(
                          `Adresa imaginii „${asset.name}” a fost copiată.`,
                        );
                      } catch {
                        setError(
                          "Copierea nu este disponibilă. Adresa imaginii este afișată mai jos.",
                        );
                      }
                    }}
                  >
                    Copiază adresa
                  </Action>
                  <details>
                    <summary>Utilizări și adresă</summary>
                    {asset.uses.length ? (
                      <ul>
                        {asset.uses.map((use, index) => (
                          <li key={index}>
                            {use.state === "draft"
                              ? "Ciornă"
                              : "Versiune publicată"}{" "}
                            · {use.title}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Nicio asociere salvată.</p>
                    )}
                    <code>{asset.url}</code>
                  </details>
                  <label
                    className={`${styles.action} ${styles.quiet} ${actor.role === "viewer" || busy || !asset.replaceable ? styles.disabled : ""}`}
                  >
                    Înlocuiește în ciornă
                    <input
                      className={styles.fileInput}
                      type="file"
                      aria-label={`Înlocuiește ${asset.name} în ciornă`}
                      accept="image/png,image/jpeg"
                      disabled={
                        actor.role === "viewer" || busy || !asset.replaceable
                      }
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void upload(file, asset);
                      }}
                    />
                  </label>
                  <Action
                    variant="quiet"
                    disabled={
                      actor.role !== "admin" ||
                      busy ||
                      !asset.managed ||
                      asset.uses.length > 0
                    }
                    title={
                      asset.uses.length
                        ? "Elimină mai întâi toate asocierile din ciornă și versiunea publicată."
                        : !asset.managed
                          ? "Resursele publice existente se păstrează."
                          : "Arhivează înregistrarea; fișierul original se păstrează."
                    }
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Arhivezi imaginea „${asset.name}”? Fișierul original se păstrează.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        await adminApi(
                          asset.url.replace("/api/media/", "/api/admin/media/"),
                          { method: "DELETE", ...jsonBody({ confirm: true }) },
                        );
                        await load();
                        setMessage(
                          "Imagine arhivată. Fișierul original se păstrează.",
                        );
                      } catch (failure) {
                        setError((failure as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Arhivează
                  </Action>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.tableFooter}>
            <span>{data.total} imagini</span>
            <div>
              <Action
                variant="quiet"
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                Înapoi
              </Action>
              <span>
                {page} / {Math.max(1, Math.ceil(data.total / 12))}
              </span>
              <Action
                variant="quiet"
                disabled={page * 12 >= data.total || busy}
                onClick={() => setPage(page + 1)}
              >
                Înainte
              </Action>
            </div>
          </div>
        </>
      )}
      <div className={styles.moduleNote}>
        <AdminIcon name="lock" />
        <p>
          Încărcările noi rămân private până la publicare. Înlocuirea modifică
          doar ciorna salvată; reîncarcă editorul înainte de publicare.
          Arhivarea necesită rol de administrator și lipsa oricărei asocieri
          salvate. Fișierele și adresele publice existente se păstrează.
        </p>
      </div>
    </section>
  );
}

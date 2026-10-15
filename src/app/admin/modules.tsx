"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Actor } from "@/lib/server/types";
import type { SiteContent } from "@/lib/content/types";
import { adminApi } from "./api";
import { Action, AdminIcon, EmptyState, Notice, Skeleton } from "./components";
import styles from "./admin.module.css";

type Asset = { url: string; name: string; published: boolean; uses: number };
function collectAssets(content: SiteContent | null, published: boolean) {
  return content
    ? [...content.services, ...content.equipment, ...content.projects].map(
        (item) => ({
          url: item.image,
          name: item.title.ro,
          published: published && (!("published" in item) || item.published),
          uses: 1,
        }),
      )
    : [];
}
export function MediaLibrary({ actor }: { actor: Actor }) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [loadFailed, setLoadFailed] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    setLoadFailed(false);
    try {
      const data = await adminApi<{
        published: SiteContent;
        draft: SiteContent | null;
      }>("/api/admin/content");
      const map = new Map<string, Asset>();
      for (const asset of [
        ...collectAssets(data.published, true),
        ...collectAssets(data.draft, false),
      ]) {
        const previous = map.get(asset.url);
        map.set(
          asset.url,
          previous
            ? {
                ...previous,
                published: previous.published || asset.published,
                uses: previous.uses + 1,
              }
            : asset,
        );
      }
      setAssets((previous) => [
        ...map.values(),
        ...previous.filter((asset) => !map.has(asset.url) && asset.uses === 0),
      ]);
    } catch (failure) {
      setError((failure as Error).message);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    adminApi<{ published: SiteContent; draft: SiteContent | null }>(
      "/api/admin/content",
    )
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, Asset>();
        for (const asset of [
          ...collectAssets(data.published, true),
          ...collectAssets(data.draft, false),
        ]) {
          const previous = map.get(asset.url);
          map.set(
            asset.url,
            previous
              ? {
                  ...previous,
                  published: previous.published || asset.published,
                  uses: previous.uses + 1,
                }
              : asset,
          );
        }
        setAssets([...map.values()]);
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(failure.message);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const filtered = assets.filter((asset) =>
    `${asset.name} ${asset.url}`
      .toLocaleLowerCase("ro")
      .includes(search.toLocaleLowerCase("ro")),
  );
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>Imaginile care spun povestea.</h2>
          <p>Fotografii asociate proiectelor, serviciilor și echipamentelor.</p>
        </div>
        <Action icon="refresh" onClick={load} disabled={loading}>
          Actualizează
        </Action>
      </div>
      <div className={styles.mediaTools}>
        <label className={styles.search}>
          <AdminIcon name="search" />
          <input
            aria-label="Caută imagini"
            placeholder="Caută după titlu sau adresă…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError("");
              setMessage("");
              if (
                !["image/png", "image/jpeg"].includes(file.type) ||
                file.size > 5 * 1024 * 1024
              ) {
                setError("Alege un fișier PNG sau JPEG de maximum 5 MB.");
                return;
              }
              setBusy(true);
              try {
                const body = new FormData();
                body.set("file", file);
                const result = await adminApi<{ url: string }>(
                  "/api/admin/media",
                  { method: "POST", body },
                );
                setAssets((previous) => [
                  {
                    url: result.url,
                    name: file.name,
                    published: false,
                    uses: 0,
                  },
                  ...previous,
                ]);
                setMessage(
                  "Imagine încărcată privat. Copiază adresa și asociaz-o unui proiect sau unei pagini, apoi salvează ciorna.",
                );
              } catch (failure) {
                setError((failure as Error).message);
              } finally {
                setBusy(false);
              }
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
      ) : loadFailed && !assets.length ? (
        <EmptyState
          icon="media"
          title="Biblioteca nu a putut fi încărcată"
          action={<Action onClick={load}>Reîncearcă</Action>}
        >
          Reîncearcă pentru a vedea imaginile asociate conținutului.
        </EmptyState>
      ) : !filtered.length ? (
        <EmptyState
          icon="media"
          title={
            search ? "Nicio imagine găsită" : "Un loc pentru imaginile tale."
          }
        >
          {search
            ? "Încearcă alt titlu."
            : "Imaginile asociate conținutului vor apărea aici. Încarcă fotografii proprii și păstrează-le private până la publicare."}
        </EmptyState>
      ) : (
        <div className={styles.mediaGrid}>
          {filtered.map((asset) => (
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
                  {asset.published
                    ? "În conținut publicat"
                    : asset.url.startsWith("/api/media/")
                      ? "Ciornă / privat"
                      : "Resursă publică existentă"}
                </span>
              </div>
              <div className={styles.assetBody}>
                <h3>{asset.name}</h3>
                <p>
                  {asset.uses
                    ? `${asset.uses} asocieri în versiunile salvate`
                    : "Neasociată · această sesiune"}
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
                  <summary>Adresa imaginii</summary>
                  <code>{asset.url}</code>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className={styles.moduleNote}>
        <AdminIcon name="lock" />
        <p>
          Imaginile nou încărcate rămân private până la publicare. Biblioteca
          include asocierile salvate și încărcările din această sesiune; pentru
          a păstra o asociere, salvează ciorna în editor. Imaginile publice
          vechi rămân publice.
        </p>
      </div>
      <div className={styles.futureRow}>
        <span>Ștergere în siguranță și organizare în foldere</span>
        <button
          disabled
          title="Necesită verificarea utilizărilor și funcții de administrare dedicate."
        >
          Disponibil într-o etapă viitoare
        </button>
      </div>
    </section>
  );
}
export type SessionPolicy = { idleMinutes: number; absoluteHours: number };
export function SecurityCenter({
  actor,
  authMode,
  onLogout,
  sessionPolicy,
}: {
  actor: Actor;
  authMode: "local" | "supabase";
  onLogout: () => void;
  sessionPolicy: SessionPolicy;
}) {
  const verified = actor.aal === "aal2" && authMode === "supabase";
  return (
    <>
      <div className={styles.securityHero}>
        <div className={styles.securityEmblem}>
          <AdminIcon name="shield" />
        </div>
        <div>
          <span className={styles.eyebrow}>ACCES & PROTECȚIE</span>
          <h2>
            {verified
              ? "Identitate confirmată în doi pași."
              : "Autentificare locală de dezvoltare."}
          </h2>
          <p>
            {verified
              ? "Această sesiune a trecut verificarea MFA. Permisiunile se verifică pe server pentru fiecare acțiune."
              : "Acest mediu folosește autentificare locală prin parolă. Nu reprezintă validarea MFA sau a serviciilor de producție."}
          </p>
        </div>
        <span
          className={`${styles.securityTag} ${!verified ? styles.localTag : ""}`}
        >
          {verified ? "MFA confirmată" : "Mediu local"}
        </span>
      </div>
      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Contul tău</h2>
            <AdminIcon name="lock" />
          </div>
          <dl className={styles.securityList}>
            <div>
              <dt>E-mail</dt>
              <dd>{actor.email}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>
                {actor.role === "admin"
                  ? "Administrator"
                  : actor.role === "editor"
                    ? "Editor"
                    : "Vizualizare"}
              </dd>
            </div>
            <div>
              <dt>Autentificare</dt>
              <dd>{verified ? "Parolă + TOTP" : "Parolă locală"}</dd>
            </div>
          </dl>
          <div className={styles.padded}>
            <Action icon="logout" onClick={onLogout}>
              Încheie această sesiune
            </Action>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Politica sesiunii</h2>
            <AdminIcon name="clock" />
          </div>
          <div className={styles.sessionPolicy}>
            <div>
              <strong>
                {sessionPolicy.idleMinutes}
                <span>min</span>
              </strong>
              <p>Limită de inactivitate</p>
            </div>
            <div>
              <strong>
                {sessionPolicy.absoluteHours}
                <span>ore</span>
              </strong>
              <p>Durată maximă absolută</p>
            </div>
          </div>
          <p className={styles.dataScope}>
            Sesiunea poate expira mai devreme. Aceste valori descriu politica de
            acces; timpul rămas nu este disponibil.
          </p>
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Mai mult control, în curând.</h2>
            <p>Acțiunile de mai jos nu sunt disponibile în această etapă.</p>
          </div>
        </div>
        {[
          ["Sesiuni active", "Vizualizarea și revocarea altor sesiuni."],
          [
            "Activitate de securitate",
            "Jurnalul de audit și evenimentele contului.",
          ],
          [
            "Recuperare MFA",
            "Recuperarea accesului necesită verificarea identității și aprobarea proprietarilor autorizați.",
          ],
        ].map(([title, description]) => (
          <div className={styles.futureRow} key={title}>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
            <button
              disabled
              title="Funcția necesită o implementare dedicată și verificări de securitate."
            >
              În dezvoltare
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
export function TeamView({ actor }: { actor: Actor }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <h2>O echipă. Permisiuni clare.</h2>
          <p>
            Este afișat doar contul autentificat. Lista completă a echipei nu
            este disponibilă.
          </p>
        </div>
        <Action
          icon="plus"
          disabled
          title="Invitarea utilizatorilor nu este implementată în această etapă."
        >
          Invită un coleg
        </Action>
      </div>
      <div className={styles.teamIdentity}>
        <span className={styles.avatar}>
          {actor.email.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <strong>{actor.email}</strong>
          <p>Contul tău · {actor.role}</p>
        </div>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Permisiunile rolurilor administrative
          </caption>
          <thead>
            <tr>
              <th scope="col">Rol</th>
              <th scope="col">Solicitări & fișiere</th>
              <th scope="col">Conținut</th>
              <th scope="col">Publicare</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vizualizare</td>
              <td>Consultă</td>
              <td>Consultă</td>
              <td>Nu</td>
            </tr>
            <tr>
              <td>Editor</td>
              <td>Consultă și actualizează starea</td>
              <td>Editează ciorne</td>
              <td>Nu</td>
            </tr>
            <tr>
              <td>Administrator</td>
              <td>Consultă și actualizează starea</td>
              <td>Editează ciorne</td>
              <td>Da</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.moduleNote}>
        <AdminIcon name="shield" />
        <p>
          Modificarea rolurilor și gestionarea conturilor nu sunt disponibile
          aici. Sunt necesare funcții dedicate, cu autorizare și audit.
        </p>
      </div>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { Quote, Actor } from "@/lib/server/types";
import {
  Action,
  AdminIcon,
  EmptyState,
  formatDate,
  Notice,
  Skeleton,
  Status,
  statusLabels,
} from "./components";
import styles from "./admin.module.css";

type StatusFilter = "all" | Quote["status"];
export function ClientInbox({
  quotes,
  loading,
  error,
  onRefresh,
  onStatus,
  actor,
  onSelect,
  selected,
  onClose,
}: {
  quotes: Quote[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onStatus: (id: string, status: Quote["status"]) => Promise<void>;
  actor: Actor;
  onSelect: (quote: Quote) => void;
  selected: Quote | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<StatusFilter>("all"),
    [page, setPage] = useState(0);
  const filtered = quotes.filter(
    (quote) =>
      (filter === "all" || quote.status === filter) &&
      `${quote.name} ${quote.email} ${quote.company || ""} ${quote.service} ${quote.message}`
        .toLocaleLowerCase("ro")
        .includes(search.toLocaleLowerCase("ro")),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 8) - 1),
  );
  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Un început pentru fiecare proiect.</h2>
            <p>Conversații reale. Detalii clare. Următorul pas la îndemână.</p>
          </div>
          <Action icon="refresh" onClick={onRefresh} disabled={loading}>
            Actualizează
          </Action>
        </div>
        <div className={styles.inboxToolbar}>
          <label className={styles.search}>
            <AdminIcon name="search" />
            <input
              aria-label="Caută solicitări"
              placeholder="Caută un nume, e-mail sau proiect…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className={styles.selectLabel}>
            Stare
            <select
              aria-label="Filtrează solicitările după stare"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as StatusFilter);
                setPage(0);
              }}
            >
              <option value="all">Toate stările</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className={styles.padded}>
            <Notice error>{error}</Notice>
            <Action onClick={onRefresh}>Reîncearcă</Action>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              search || filter !== "all"
                ? "Nicio solicitare găsită"
                : "Următorul proiect începe aici."
            }
          >
            {search || filter !== "all"
              ? "Încearcă alt nume sau schimbă filtrul."
              : "Solicitările trimise prin website vor apărea aici, împreună cu toate detaliile și fișierele lor."}
          </EmptyState>
        ) : (
          <>
            <QuoteTable
              quotes={filtered.slice(currentPage * 8, currentPage * 8 + 8)}
              onSelect={onSelect}
            />
            <div className={styles.tableFooter}>
              <span>
                {currentPage * 8 + 1}–
                {Math.min((currentPage + 1) * 8, filtered.length)} din{" "}
                {filtered.length} solicitări
              </span>
              <div>
                <Action
                  variant="quiet"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Înapoi
                </Action>
                <span>
                  {currentPage + 1} / {Math.ceil(filtered.length / 8)}
                </span>
                <Action
                  variant="quiet"
                  disabled={(currentPage + 1) * 8 >= filtered.length}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Înainte
                </Action>
              </div>
            </div>
          </>
        )}
        <p className={styles.dataScope}>
          Sunt disponibile cele mai recente 200 de solicitări. Căutarea,
          filtrele și numărătorile se aplică acestui set.
        </p>
      </section>
      {selected && (
        <QuoteDetail
          quote={quotes.find((item) => item.id === selected.id) || selected}
          actor={actor}
          onClose={onClose}
          onStatus={onStatus}
        />
      )}
    </>
  );
}
export function QuoteTable({
  quotes,
  onSelect,
}: {
  quotes: Quote[];
  onSelect: (quote: Quote) => void;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Solicitări de la clienți</caption>
        <thead>
          <tr>
            <th scope="col">Client / companie</th>
            <th scope="col">Serviciu solicitat</th>
            <th scope="col">Stare</th>
            <th scope="col">Primită</th>
            <th scope="col">
              <span className={styles.srOnly}>Deschide</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr key={quote.id}>
              <td>
                <button
                  className={styles.clientCell}
                  onClick={() => onSelect(quote)}
                >
                  <span className={styles.avatar}>
                    {quote.name.slice(0, 2).toLocaleUpperCase("ro")}
                  </span>
                  <span>
                    <strong>{quote.name}</strong>
                    <small>{quote.company || quote.email}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className={styles.serviceName}>
                  {quote.service.replaceAll("-", " ")}
                </span>
                {quote.files.length > 0 && (
                  <small className={styles.attachmentHint}>
                    <AdminIcon name="file" />
                    {quote.files.length}{" "}
                    {quote.files.length === 1 ? "fișier" : "fișiere"}
                  </small>
                )}
              </td>
              <td>
                <Status value={quote.status} />
              </td>
              <td className={styles.dateCell}>{formatDate(quote.createdAt)}</td>
              <td>
                <button
                  className={styles.iconButton}
                  aria-label={`Deschide solicitarea de la ${quote.name}`}
                  onClick={() => onSelect(quote)}
                >
                  <AdminIcon name="arrow" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function QuoteDetail({
  quote,
  actor,
  onClose,
  onStatus,
}: {
  quote: Quote;
  actor: Actor;
  onClose: () => void;
  onStatus: (id: string, status: Quote["status"]) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current,
      focused = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.detailDialog}
      aria-labelledby="request-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <span className={styles.eyebrow}>SOLICITARE DE OFERTĂ</span>
        <button
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Închide solicitarea"
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <div className={styles.dialogBody}>
        <Status value={quote.status} />
        <h2 id="request-title">{quote.name}</h2>
        <p className={styles.muted}>
          {quote.company || "Client"} ·{" "}
          {new Intl.DateTimeFormat("ro-MD", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Chisinau",
          }).format(new Date(quote.createdAt))}
        </p>
        <div className={styles.contactActions}>
          <a href={`mailto:${quote.email}`}>
            <AdminIcon name="mail" />
            {quote.email}
          </a>
          <a href={`tel:${quote.phone.replace(/[^+0-9]/g, "")}`}>
            {quote.phone}
          </a>
        </div>
        <dl className={styles.detailGrid}>
          {[
            ["Serviciu", quote.service.replaceAll("-", " ")],
            ["Cantitate", quote.quantity || "Nespecificată"],
            ["Dimensiuni", quote.dimensions || "Nespecificate"],
            ["Termen dorit", quote.deadline || "Nespecificat"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section className={styles.messageBody}>
          <h3>Mesajul clientului</h3>
          <p>{quote.message}</p>
        </section>
        <section>
          <h3>
            Fișiere atașate{" "}
            <span className={styles.countPill}>{quote.files.length}</span>
          </h3>
          {quote.files.length ? (
            <ul className={styles.fileList}>
              {quote.files.map((file) => (
                <li key={file.id}>
                  <AdminIcon name="file" />
                  <div>
                    <strong>{file.name}</strong>
                    <small>
                      {Math.ceil(file.size / 1024)} KB · Acces privat
                    </small>
                  </div>
                  <a
                    href={`/api/admin/quotes/${quote.id}/files/${file.id}`}
                    className={styles.iconButton}
                    aria-label={`Descarcă ${file.name}`}
                  >
                    <AdminIcon name="download" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Clientul nu a adăugat fișiere.</p>
          )}
        </section>
        <div className={styles.notificationLine}>
          <AdminIcon name="mail" />
          <span>
            Notificare e-mail:{" "}
            {quote.notification === "sent"
              ? "acceptată de furnizor"
              : quote.notification === "pending"
                ? "în așteptare"
                : "serviciu neconfigurat"}
          </span>
        </div>
        {error && <Notice error>{error}</Notice>}
        <label className={styles.field}>
          Starea solicitării
          <select
            value={quote.status}
            disabled={actor.role === "viewer" || busy}
            onChange={async (event) => {
              const next = event.target.value as Quote["status"];
              if (
                next === "archived" &&
                !window.confirm(
                  "Arhivezi această solicitare? Mesajul și fișierele se păstrează.",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await onStatus(quote.id, next);
              } catch (failure) {
                setError((failure as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {actor.role === "viewer" && (
          <p className={styles.muted}>
            Contul tău poate consulta solicitările. Modificarea stării necesită
            rol de editor sau administrator.
          </p>
        )}
        <p className={styles.reference}>Referință: {quote.id}</p>
      </div>
    </dialog>
  );
}

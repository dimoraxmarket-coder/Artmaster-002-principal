"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { adminApi, jsonBody } from "./api";
import type {
  QuotePage,
  QuoteDetail as Detail,
  StaffMember,
  QuoteChange,
} from "@/lib/server/workflow-types";
type StatusFilter = "all" | Quote["status"];
export function ClientInbox({
  actor,
  selected,
  onSelect,
  onClose,
  onChanged,
}: {
  actor: Actor;
  selected: Quote | null;
  onSelect: (quote: Quote) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<StatusFilter>("all"),
    [assignee, setAssignee] = useState("all"),
    [page, setPage] = useState(1),
    [data, setData] = useState<QuotePage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [staff, setStaff] = useState<StaffMember[]>([]),
    [staffError, setStaffError] = useState("");
  const generation = useRef(0);
  const load = useCallback(
    async (isActive: () => boolean = () => true) => {
      const id = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const result = await adminApi<QuotePage>(
          `/api/admin/quotes?${new URLSearchParams({ q: search, status: filter, assignee, page: String(page), pageSize: "8" })}`,
        );
        if (id === generation.current && isActive()) setData(result);
      } catch (failure) {
        if (id === generation.current && isActive())
          setError((failure as Error).message);
      } finally {
        if (id === generation.current && isActive()) setLoading(false);
      }
    },
    [search, filter, assignee, page],
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => void load(() => active), 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    adminApi<{ staff: StaffMember[] }>("/api/admin/team")
      .then((result) => {
        if (active) setStaff(result.staff);
      })
      .catch((failure) => {
        if (active) setStaffError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Un început pentru fiecare proiect.</h2>
            <p>Conversații reale. Detalii clare. Următorul pas la îndemână.</p>
          </div>
          <Action icon="refresh" onClick={() => void load()} disabled={loading}>
            Actualizează
          </Action>
        </div>
        <div className={styles.inboxToolbar}>
          <label className={styles.search}>
            <AdminIcon name="search" />
            <input
              id="inbox-search"
              aria-label="Caută solicitări"
              placeholder="Caută un nume, e-mail sau proiect…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
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
                setPage(1);
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
          <label className={styles.selectLabel}>
            Responsabil
            <select
              aria-label="Filtrează după responsabil"
              value={assignee}
              onChange={(event) => {
                setAssignee(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Toată echipa</option>
              <option value="unassigned">Neatribuite</option>
              <option value={actor.id}>Atribuite mie</option>
              {staff
                .filter(
                  (member) =>
                    member.id !== actor.id && member.role !== "viewer",
                )
                .map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.email}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {staffError && (
          <div className={styles.padded}>
            <Notice error>
              Directorul echipei nu este disponibil. {staffError}
            </Notice>
          </div>
        )}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className={styles.padded}>
            <Notice error>{error}</Notice>
            <Action onClick={() => void load()}>Reîncearcă</Action>
          </div>
        ) : !data?.quotes.length ? (
          <EmptyState
            action={
              page > 1 ? (
                <Action onClick={() => setPage(1)}>Prima pagină</Action>
              ) : undefined
            }
            title={
              search || filter !== "all" || assignee !== "all"
                ? "Nicio solicitare găsită"
                : "Următorul proiect începe aici."
            }
          >
            {search || filter !== "all" || assignee !== "all"
              ? "Încearcă alt nume sau schimbă filtrul."
              : "Solicitările trimise prin website vor apărea aici, împreună cu toate detaliile și fișierele lor."}
          </EmptyState>
        ) : (
          <>
            <QuoteTable quotes={data.quotes} onSelect={onSelect} />
            <div className={styles.tableFooter}>
              <span>
                {(page - 1) * 8 + 1}–{Math.min(page * 8, data.total)} din{" "}
                {data.total} solicitări
              </span>
              <div>
                <Action
                  variant="quiet"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Înapoi
                </Action>
                <span>
                  {page} / {Math.max(1, Math.ceil(data.total / 8))}
                </span>
                <Action
                  variant="quiet"
                  disabled={page * 8 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Înainte
                </Action>
              </div>
            </div>
          </>
        )}
        <p className={styles.dataScope}>
          Căutarea și filtrele includ toate solicitările. Datele clienților sunt
          private.
        </p>
      </section>
      {selected && (
        <QuoteDetail
          key={selected.id}
          initial={selected}
          actor={actor}
          onClose={onClose}
          onChanged={() => {
            void load();
            onChanged();
          }}
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
                  id={`quote-client-${quote.id}`}
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
                  id={`quote-open-${quote.id}`}
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
  initial,
  actor,
  onClose,
  onChanged,
}: {
  initial: Quote;
  actor: Actor;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [staff, setStaff] = useState<StaffMember[]>([]),
    [note, setNote] = useState(""),
    [success, setSuccess] = useState("");
  const quote = detail?.quote || initial;
  const reload = useCallback(async () => {
    setError("");
    try {
      const [value, team] = await Promise.all([
        adminApi<Detail>(`/api/admin/quotes/${initial.id}`),
        adminApi<{ staff: StaffMember[] }>("/api/admin/team"),
      ]);
      setDetail(value);
      setStaff(team.staff);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [initial.id]);
  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi<Detail>(`/api/admin/quotes/${initial.id}`),
      adminApi<{ staff: StaffMember[] }>("/api/admin/team"),
    ])
      .then(([value, team]) => {
        if (active) {
          setDetail(value);
          setStaff(team.staff);
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [initial.id]);
  async function change(input: QuoteChange) {
    if (!detail) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const value = await adminApi<Detail>(`/api/admin/quotes/${quote.id}`, {
        method: "PATCH",
        ...jsonBody({ ...input, expectedVersion: detail.quote.version }),
      });
      setDetail(value);
      setSuccess("Modificările au fost salvate.");
      if (input.note) setNote("");
      onChanged();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const dialog = ref.current,
      focused = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      requestAnimationFrame(() => {
        const target = focused?.id
          ? document.getElementById(focused.id)
          : focused;
        if (target?.isConnected) target.focus({ preventScroll: true });
        else
          document
            .getElementById("inbox-search")
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  function close() {
    if (note.trim() && !window.confirm("Închizi fără a salva nota internă?"))
      return;
    onClose();
  }
  return (
    <dialog
      ref={ref}
      className={styles.detailDialog}
      aria-labelledby="request-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.dialogHeader}>
        <span className={styles.eyebrow}>SOLICITARE DE OFERTĂ</span>
        <button
          className={styles.iconButton}
          onClick={close}
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
            ["Limbă", quote.locale.toUpperCase()],
            ["Pagina de origine", quote.sourcePath || "Nespecificată"],
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
        {!detail && !error && <Skeleton />}
        {success && <Notice>{success}</Notice>}
        {error && (
          <div>
            <Notice error>{error}</Notice>
            <Action disabled={busy} onClick={() => void reload()}>
              Încarcă versiunea actuală
            </Action>
          </div>
        )}

        <label className={styles.field}>
          Starea solicitării
          <select
            value={quote.status}
            disabled={actor.role === "viewer" || busy || !detail}
            onChange={async (event) => {
              const next = event.target.value as Quote["status"];
              if (
                next === "archived" &&
                !window.confirm(
                  "Arhivezi această solicitare? Mesajul și fișierele se păstrează.",
                )
              )
                return;
              await change({ status: next });
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
        <label className={styles.field}>
          Responsabilul solicitării
          <select
            aria-label="Atribuie solicitarea"
            value={detail?.quote.assignedTo || ""}
            disabled={actor.role === "viewer" || busy || !detail}
            onChange={(event) =>
              void change({ assignedTo: event.target.value || null })
            }
          >
            <option value="">Neatribuită</option>
            {staff
              .filter((member) => member.role !== "viewer")
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email}
                </option>
              ))}
          </select>
        </label>
        <section className={styles.messageBody}>
          <h3>Note interne</h3>
          <p className={styles.muted}>
            Vizibile doar echipei autorizate. Notele salvate se păstrează în
            istoric.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (note.trim()) void change({ note: note.trim() });
            }}
          >
            <label className={styles.field}>
              Notă internă
              <textarea
                aria-label="Notă internă"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={4000}
                rows={3}
                disabled={actor.role === "viewer" || busy || !detail}
              />
            </label>
            <Action
              type="submit"
              disabled={
                actor.role === "viewer" || busy || !detail || !note.trim()
              }
            >
              Salvează nota
            </Action>
          </form>
        </section>
        <section>
          <h3>Istoricul solicitării</h3>
          {detail?.events.length ? (
            <ol className={styles.activityList}>
              {detail.events.map((event) => (
                <li key={event.id}>
                  <strong>
                    {staff.find((member) => member.id === event.actor)?.email ||
                      "Membru al echipei"}
                  </strong>
                  <small>{formatDate(event.createdAt)}</small>
                  <p>
                    {event.kind === "note"
                      ? event.body
                      : event.kind === "status"
                        ? `Stare: ${statusLabels[event.body as Quote["status"]] || event.body}`
                        : `Responsabil: ${staff.find((member) => member.id === event.body)?.email || (event.body ? "Fost membru al echipei" : "Neatribuită")}`}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>
              Nu există încă modificări înregistrate.
            </p>
          )}
          {detail?.hasMore && (
            <Action
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const older = await adminApi<Detail>(
                    `/api/admin/quotes/${quote.id}?before=${detail.events.at(-1)!.id}`,
                  );
                  setDetail({
                    ...detail,
                    events: [...detail.events, ...older.events],
                    hasMore: older.hasMore,
                  });
                } catch (failure) {
                  setError((failure as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Încarcă activitatea anterioară
            </Action>
          )}
        </section>
        <p className={styles.reference}>Referință: {quote.id}</p>
      </div>
    </dialog>
  );
}

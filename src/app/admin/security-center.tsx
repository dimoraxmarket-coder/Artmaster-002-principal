"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react";
import type { Actor } from "@/lib/server/types";
import type {
  AccountPage,
  AuditPage,
  ManagedSession,
  MfaStatus,
  SecurityAccount,
  SessionPage,
} from "@/lib/server/security-types";
import { adminApi, jsonBody } from "./api";
import { Action, AdminIcon, EmptyState, Notice, Skeleton } from "./components";
import styles from "./admin.module.css";
import { SecurityPosture } from "./security-posture";
export type SessionPolicy = { idleMinutes: number; absoluteHours: number };
const eventLabels: Record<string, string> = {
  "admin.login": "Autentificare confirmată",
  "admin.login.failed": "Autentificare refuzată",
  "admin.logout": "Sesiune încheiată",
  "admin.mfa.enroll": "Configurare MFA inițiată",
  "admin.mfa.failed": "Verificare MFA refuzată",
  "security.sessions.revoke": "Sesiuni revocate",
  "security.team.change": "Accesul unui coleg modificat",
};
const roleLabels = {
  viewer: "Vizualizare",
  editor: "Editor",
  admin: "Administrator",
};
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ro-MD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Chisinau",
  }).format(new Date(value));
function useFresh(until: string | null | undefined) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!until) return;
    const initial = setTimeout(() => setClock(Date.now()), 0),
      expires = setTimeout(
        () => setClock(Date.now()),
        Math.max(0, Date.parse(until) - Date.now()) + 50,
      );
    return () => {
      clearTimeout(initial);
      clearTimeout(expires);
    };
  }, [until]);
  return !!until && clock > 0 && Date.parse(until) > clock;
}
function Modal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
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
            .querySelector<HTMLElement>("#admin-main h1")
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.securityDialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <button
          className={styles.iconButton}
          disabled={busy}
          aria-label="Închide dialogul"
          onClick={onClose}
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  );
}
function Pager({
  page,
  pageSize,
  total,
  onPage,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.tableFooter}>
      <span>{total} înregistrări</span>
      <div>
        <Action
          variant="quiet"
          disabled={page <= 1 || disabled}
          onClick={() => onPage(page - 1)}
        >
          Înapoi
        </Action>
        <span>
          {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <Action
          variant="quiet"
          disabled={page * pageSize >= total || disabled}
          onClick={() => onPage(page + 1)}
        >
          Înainte
        </Action>
      </div>
    </div>
  );
}
function FreshNotice({
  fresh,
  onLogout,
}: {
  fresh: boolean;
  onLogout: () => void;
}) {
  return (
    <div className={styles.moduleNote}>
      <AdminIcon name="lock" />
      <div>
        <p>
          {fresh
            ? "Confirmarea recentă permite modificări de securitate. Serverul verifică din nou accesul la fiecare acțiune."
            : "Pentru modificări de securitate, încheie sesiunea și autentifică-te din nou. Confirmarea este valabilă cinci minute; în modul Supabase necesită și TOTP."}
        </p>
        {!fresh && <Action onClick={onLogout}>Reautentifică-te</Action>}
      </div>
    </div>
  );
}
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
  const [status, setStatus] = useState<MfaStatus | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    adminApi<MfaStatus>("/api/admin/security/mfa")
      .then((value) => {
        if (active) {
          setStatus(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const verified = status?.mode === "supabase" && status.aal === "aal2";
  return (
    <>
      <div className={styles.securityHero}>
        <div className={styles.securityEmblem}>
          <AdminIcon name="shield" />
        </div>
        <div>
          <span className={styles.eyebrow}>ACCES & PROTECȚIE</span>
          <h2>
            {authMode === "local"
              ? "Autentificare locală de dezvoltare."
              : verified
                ? "Identitate confirmată în doi pași."
                : "Verificarea protecției contului."}
          </h2>
          <p>
            {authMode === "local"
              ? "Mediu local de dezvoltare. Acesta nu validează MFA sau serviciile găzduite."
              : "Doar sesiuni verificate AAL2, cu permisiuni și revocare controlate pe server."}
          </p>
        </div>
        <span
          className={`${styles.securityTag} ${authMode === "local" ? styles.localTag : ""}`}
        >
          {authMode === "local"
            ? "Mediu local"
            : verified
              ? "MFA confirmată"
              : "Se verifică"}
        </span>
      </div>
      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Contul și autentificarea</h2>
            <AdminIcon name="lock" />
          </div>
          <dl className={styles.securityList}>
            <div>
              <dt>E-mail</dt>
              <dd>{actor.email}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{roleLabels[actor.role]}</dd>
            </div>
            <div>
              <dt>MFA / TOTP</dt>
              <dd>
                {status
                  ? status.verifiedTotpFactors === null
                    ? "Indisponibil în modul local"
                    : `${status.verifiedTotpFactors} factori TOTP verificați`
                  : "Stare în curs de verificare"}
              </dd>
            </div>
          </dl>
          <div className={styles.padded}>
            {error && (
              <>
                <Notice error>{error}</Notice>
                <Action onClick={() => setRefresh((v) => v + 1)}>
                  Reîncearcă verificarea
                </Action>
              </>
            )}
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
            Expirarea efectivă este afișată pentru fiecare sesiune și poate fi
            mai devreme decât limita absolută.
          </p>
        </section>
      </div>
      {actor.role === "admin" && <SecurityPosture />}
      <SessionManager actor={actor} onLogout={onLogout} />
      {actor.role === "admin" ? (
        <SecurityAudit />
      ) : (
        <section className={styles.panel}>
          <div className={styles.padded}>
            <h2>Jurnal de securitate</h2>
            <p>Accesul la istoricul echipei este rezervat administratorilor.</p>
          </div>
        </section>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Recuperarea accesului MFA</h2>
            <p>
              Procedură controlată de proprietari, fără resetare prin parolă.
            </p>
          </div>
          <AdminIcon name="shield" />
        </div>
        <div className={styles.padded}>
          <details>
            <summary>Vezi procedura de recuperare</summary>
            <ol className={styles.recoverySteps}>
              <li>
                Contactează proprietarii autorizați prin canalul independent
                stabilit. Sunt necesare verificarea identității și doi
                aprobatori independenți.
              </li>
              <li>
                Proprietarii suspendă accesul și revocă sesiunile. Datele
                clienților și fișierele se păstrează.
              </li>
              <li>
                Un operator cu MFA verificată folosește exclusiv mecanismele
                oficiale Supabase pentru factorul pierdut, după aprobarea
                proprietarilor.
              </li>
              <li>
                După aprobarea reluării accesului, contul parcurge din nou
                înrolarea și verificarea TOTP. Sesiunile vechi rămân revocate.
              </li>
            </ol>
            <p>
              Parola sau un mesaj e-mail nu sunt suficiente. Cabinetul nu oferă
              resetarea factorilor, coduri de rezervă inventate sau ocolirea
              MFA.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
function SessionManager({
  actor,
  owner,
  onLogout,
}: {
  actor: Actor;
  owner?: string;
  onLogout: () => void;
}) {
  const [data, setData] = useState<SessionPage | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState<ManagedSession | "others" | null>(
      null,
    );
  const sequence = useRef(0),
    fresh = useFresh(data?.freshUntil);
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      const id = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const value = await adminApi<SessionPage>(
          `/api/admin/security/sessions?${new URLSearchParams({ page: String(page), pageSize: "6", ...(owner ? { owner } : {}) })}`,
        );
        if (active() && id === sequence.current) setData(value);
      } catch (failure) {
        if (active() && id === sequence.current)
          setError((failure as Error).message);
      } finally {
        if (active() && id === sequence.current) setLoading(false);
      }
    },
    [owner, page],
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => void load(() => active), 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  async function revoke() {
    if (!selection || !data) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi<{ revoked: number }>(
        "/api/admin/security/sessions",
        {
          method: "DELETE",
          ...jsonBody(
            selection === "others"
              ? { owner: data.owner.id, allOthers: true, confirm: true }
              : { reference: selection.reference, confirm: true },
          ),
        },
      );
      setSelection(null);
      setMessage(
        `${result.revoked} sesiuni revocate. Accesul lor la ARTMASTER a fost încheiat.`,
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
          <span className={styles.eyebrow}>CONTROLUL ACCESULUI</span>
          <h2>
            {owner && owner !== actor.id
              ? "Sesiunile contului"
              : "Sesiunile tale active"}
          </h2>
          <p>{data?.owner.email || "Se verifică sesiunile înregistrate."}</p>
        </div>
        <Action
          icon="refresh"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Actualizează sesiunile
        </Action>
      </div>
      {message && (
        <div className={styles.padded}>
          <Notice>{message}</Notice>
        </div>
      )}
      {error && !selection && (
        <div className={styles.padded}>
          <Notice error>{error}</Notice>
          <Action onClick={() => void load()}>Reîncearcă sesiunile</Action>
        </div>
      )}
      {loading ? (
        <Skeleton />
      ) : !data?.sessions.length ? (
        <EmptyState icon="lock" title="Nicio sesiune activă">
          Contul nu are sesiuni administrative active. Sesiunile expirate și
          autentificările MFA incomplete nu sunt afișate.
        </EmptyState>
      ) : (
        <div className={styles.sessionCards}>
          {data.sessions.map((session, index) => (
            <article
              className={`${styles.sessionCard} ${session.current ? styles.currentSession : ""}`}
              key={session.reference}
            >
              <div className={styles.sessionCardHeading}>
                <span className={styles.quickIcon}>
                  <AdminIcon name={session.current ? "shield" : "lock"} />
                </span>
                <div>
                  <h3>
                    {session.current
                      ? "Sesiunea curentă"
                      : `Sesiune administrativă ${index + 1 + (page - 1) * 6}`}
                  </h3>
                  <p>
                    {session.current
                      ? "Acest cabinet"
                      : "Acces înregistrat în ARTMASTER"}
                  </p>
                </div>
              </div>
              <dl className={styles.sessionDates}>
                <div>
                  <dt>Creată</dt>
                  <dd>{dateTime(session.createdAt)}</dd>
                </div>
                <div>
                  <dt>Ultima activitate</dt>
                  <dd>{dateTime(session.lastActivityAt)}</dd>
                </div>
                <div>
                  <dt>Expiră cel târziu</dt>
                  <dd>{dateTime(session.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Limită absolută</dt>
                  <dd>{dateTime(session.absoluteExpiresAt)}</dd>
                </div>
              </dl>
              <Action
                id={`revoke-session-${session.reference}`}
                disabled={session.current || busy || !fresh}
                onClick={() => setSelection(session)}
              >
                {session.current ? "Sesiune curentă" : "Revocă sesiunea"}
              </Action>
            </article>
          ))}
        </div>
      )}
      {data && (
        <Pager
          page={page}
          pageSize={6}
          total={data.total}
          disabled={loading || busy}
          onPage={setPage}
        />
      )}
      <div className={styles.padded}>
        <Action
          disabled={
            !data ||
            data.total <= data.sessions.filter((s) => s.current).length ||
            !fresh ||
            busy
          }
          onClick={() => setSelection("others")}
        >
          {owner && owner !== actor.id
            ? "Revocă toate sesiunile contului"
            : "Revocă celelalte sesiuni"}
        </Action>
      </div>
      <FreshNotice fresh={fresh} onLogout={onLogout} />
      <p className={styles.dataScope}>
        Orele sunt afișate pentru Chișinău. Sunt sesiuni ARTMASTER reale, fără
        dispozitive presupuse. Revocarea blochează cabinetul și datele
        administrative; nu închide alte aplicații Supabase.
      </p>
      {selection && (
        <Modal
          title="Confirmă revocarea"
          busy={busy}
          onClose={() => setSelection(null)}
        >
          <p>
            {selection === "others"
              ? "Revoci celelalte sesiuni ale contului selectat, inclusiv autentificările MFA incomplete?"
              : `Revoci sesiunea creată la ${dateTime(selection.createdAt)}?`}
          </p>
          <p>
            Sesiunea ta curentă se păstrează. Mesajele și fișierele clienților
            se păstrează.
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className={styles.dialogActions}>
            <Action disabled={busy} onClick={() => setSelection(null)}>
              Renunță
            </Action>
            <Action
              variant="primary"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {busy ? "Se revocă…" : "Confirmă revocarea"}
            </Action>
          </div>
        </Modal>
      )}
    </section>
  );
}
function SecurityAudit() {
  const [data, setData] = useState<AuditPage | null>(null),
    [action, setAction] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      const id = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        if (from && to && from > to)
          throw new Error(
            "Data de început trebuie să fie înaintea datei de sfârșit.",
          );
        const query = new URLSearchParams({
          page: String(page),
          pageSize: "10",
          action,
          ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
          ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
        });
        const value = await adminApi<AuditPage>(
          `/api/admin/security/audit?${query}`,
        );
        if (active() && id === sequence.current) setData(value);
      } catch (failure) {
        if (active() && id === sequence.current)
          setError((failure as Error).message);
      } finally {
        if (active() && id === sequence.current) setLoading(false);
      }
    },
    [action, from, to, page],
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => void load(() => active), 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>ISTORIC VERIFICABIL</span>
          <h2>Jurnal de securitate</h2>
          <p>Autentificări și modificări administrative reale.</p>
        </div>
        <Action icon="refresh" onClick={() => void load()} disabled={loading}>
          Actualizează jurnalul
        </Action>
      </div>
      <div className={styles.securityFilters}>
        <label className={styles.field}>
          Eveniment
          <select
            aria-label="Filtrează evenimentele de securitate"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Toate evenimentele</option>
            {Object.entries(eventLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          De la (UTC)
          <input
            type="date"
            aria-label="Evenimente de la"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className={styles.field}>
          Până la (UTC)
          <input
            type="date"
            aria-label="Evenimente până la"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className={styles.padded}>
          <Notice error>{error}</Notice>
          <Action onClick={() => void load()}>Reîncearcă jurnalul</Action>
        </div>
      ) : !data?.events.length ? (
        <EmptyState title="Niciun eveniment în acest interval">
          Schimbă filtrele pentru a consulta alte evenimente. Nu sunt afișate
          date demonstrative.
        </EmptyState>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Evenimente de securitate
            </caption>
            <thead>
              <tr>
                <th scope="col">Când · Chișinău</th>
                <th scope="col">Cine</th>
                <th scope="col">Eveniment</th>
                <th scope="col">Context</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.id}>
                  <td>{dateTime(event.createdAt)}</td>
                  <td>
                    {event.actor === "00000000-0000-0000-0000-000000000000"
                      ? "Identitate neconfirmată"
                      : event.actorLabel}
                  </td>
                  <td>
                    {eventLabels[event.action] || "Eveniment administrativ"}
                  </td>
                  <td>
                    {event.targetLabel && <div>{event.targetLabel}</div>}
                    {event.context.role
                      ? `Rol: ${event.context.previousRole ? roleLabels[event.context.previousRole as keyof typeof roleLabels] + " → " : ""}${roleLabels[event.context.role as keyof typeof roleLabels]}`
                      : ""}
                    {typeof event.context.enabled === "boolean"
                      ? ` · ${event.context.enabled ? "Activ" : "Suspendat"}`
                      : ""}
                    {typeof event.context.revoked === "number"
                      ? ` · ${event.context.revoked} sesiuni revocate`
                      : ""}
                    {!Object.keys(event.context).length
                      ? "Acces administrativ"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <Pager
          page={page}
          pageSize={10}
          total={data.total}
          disabled={loading}
          onPage={setPage}
        />
      )}
    </section>
  );
}
export function TeamView({
  actor,
  onLogout,
}: {
  actor: Actor;
  onLogout: () => void;
}) {
  const [data, setData] = useState<AccountPage | null>(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<SecurityAccount | null>(null),
    [sessionOwner, setSessionOwner] = useState<SecurityAccount | null>(null),
    [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    let active = true;
    const id = ++sequence.current,
      timer = setTimeout(() => {
        setLoading(true);
        setError("");
        adminApi<AccountPage>(
          `/api/admin/security/accounts?${new URLSearchParams({ page: String(page), pageSize: "10", q })}`,
        )
          .then((value) => {
            if (active && id === sequence.current) setData(value);
          })
          .catch((failure) => {
            if (active) setError(failure.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, page, refresh]);
  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>OAMENI & RESPONSABILITĂȚI</span>
            <h2>O echipă. Permisiuni clare.</h2>
            <p>
              {data
                ? `${data.enabledAdmins} administratori activi`
                : "Directorul conturilor autorizate."}
            </p>
          </div>
          <Action
            disabled
            title="Invitațiile necesită configurarea și validarea fluxului oficial Supabase, după aprobarea proprietarilor."
          >
            Invită un coleg
          </Action>
        </div>
        <div className={styles.mediaTools}>
          <label className={styles.search}>
            <AdminIcon name="search" />
            <input
              aria-label="Caută în echipă"
              placeholder="Caută după e-mail…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <Action
            icon="refresh"
            disabled={loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Actualizează echipa
          </Action>
        </div>
        {message && (
          <div className={styles.padded}>
            <Notice>{message}</Notice>
          </div>
        )}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className={styles.padded}>
            <Notice error>{error}</Notice>
            <Action onClick={() => setRefresh((v) => v + 1)}>
              Reîncearcă echipa
            </Action>
          </div>
        ) : !data?.accounts.length ? (
          <EmptyState title="Niciun cont găsit">
            Încearcă alt e-mail sau revino la prima pagină.
          </EmptyState>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                Membrii echipei administrative
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cont</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Acces</th>
                  <th scope="col">Administrare</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.email}</strong>
                      {account.id === actor.id && (
                        <small className={styles.attachmentHint}>
                          Contul tău
                        </small>
                      )}
                    </td>
                    <td>{roleLabels[account.role]}</td>
                    <td>
                      <span
                        className={`${styles.status} ${account.enabled ? styles.completed : styles.archived}`}
                      >
                        {account.enabled ? "Activ" : "Suspendat"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.teamActions}>
                        <Action
                          id={`manage-account-${account.id}`}
                          disabled={
                            actor.role !== "admin" || account.id === actor.id
                          }
                          onClick={() => setSelected(account)}
                        >
                          Gestionează accesul
                        </Action>
                        <Action
                          disabled={
                            actor.role !== "admin" && account.id !== actor.id
                          }
                          onClick={() => setSessionOwner(account)}
                        >
                          Sesiuni
                        </Action>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <Pager
            page={page}
            pageSize={10}
            total={data.total}
            disabled={loading}
            onPage={setPage}
          />
        )}
        <div className={styles.moduleNote}>
          <AdminIcon name="shield" />
          <p>
            Modificările de rol sau suspendarea necesită confirmare recentă și
            revocă toate sesiunile contului. Nu îți poți modifica propriul
            acces. Ultimul administrator activ este protejat. Invitațiile și
            resetarea factorilor MFA nu sunt disponibile.
          </p>
        </div>
      </section>
      {selected && (
        <AccountDialog
          account={selected}
          onLogout={onLogout}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setMessage(
              "Acces actualizat. Sesiunile contului au fost revocate.",
            );
            setRefresh((v) => v + 1);
          }}
        />
      )}
      {sessionOwner && (
        <Modal
          title={`Sesiuni · ${sessionOwner.email}`}
          onClose={() => setSessionOwner(null)}
        >
          <SessionManager
            actor={actor}
            owner={sessionOwner.id}
            onLogout={onLogout}
          />
        </Modal>
      )}
    </>
  );
}
function AccountDialog({
  account,
  onClose,
  onSaved,
  onLogout,
}: {
  account: SecurityAccount;
  onClose: () => void;
  onSaved: () => void;
  onLogout: () => void;
}) {
  const [role, setRole] = useState(account.role),
    [enabled, setEnabled] = useState(account.enabled),
    [status, setStatus] = useState<MfaStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState(false);
  const fresh = useFresh(status?.freshUntil);
  useEffect(() => {
    let active = true;
    adminApi<MfaStatus>("/api/admin/security/mfa")
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Modal title="Gestionează accesul" busy={busy} onClose={onClose}>
      <p className={styles.managedEmail}>{account.email}</p>
      <p>
        Modificarea revocă toate sesiunile acestui cont. Administratorii nu pot
        modifica propriul acces sau elimina ultimul administrator activ.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await adminApi(`/api/admin/security/accounts/${account.id}`, {
              method: "PATCH",
              ...jsonBody({
                role,
                enabled,
                expectedVersion: account.version,
                confirm: true,
              }),
            });
            onSaved();
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className={styles.field}>
          Rol administrativ
          <select
            aria-label="Rol administrativ"
            value={role}
            disabled={busy}
            onChange={(e) => {
              setRole(e.target.value as SecurityAccount["role"]);
              setChecked(false);
            }}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.securityCheckbox}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setChecked(false);
            }}
          />
          Acces activ la cabinet
        </label>
        <label className={styles.securityCheckbox}>
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Confirm modificarea accesului și revocarea sesiunilor
        </label>
        {error && <Notice error>{error}</Notice>}
        <div className={styles.dialogActions}>
          <Action disabled={busy} onClick={onClose}>
            Renunță
          </Action>
          <Action
            type="submit"
            variant="primary"
            disabled={
              busy ||
              !fresh ||
              !checked ||
              (role === account.role && enabled === account.enabled)
            }
          >
            {busy ? "Se salvează…" : "Confirmă modificarea"}
          </Action>
        </div>
      </form>
      <FreshNotice fresh={fresh} onLogout={onLogout} />
    </Modal>
  );
}

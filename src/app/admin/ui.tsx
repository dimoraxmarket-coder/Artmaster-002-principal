"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import Image from "next/image";
import type { QuotePage } from "@/lib/server/workflow-types";
import type { Actor, Quote } from "@/lib/server/types";
import { adminApi, jsonBody, AdminApiError } from "./api";
import {
  Action,
  AdminIcon,
  EmptyState,
  Notice,
  Skeleton,
  type IconName,
} from "./components";
import { ClientInbox, QuoteTable } from "./inbox";
import {
  MediaLibrary,
  SecurityCenter,
  TeamView,
  type SessionPolicy,
} from "./modules";
import styles from "./admin.module.css";
const CmsEditor = lazy(() =>
  import("./cms-editor").then((module) => ({ default: module.CmsEditor })),
);
const navigation = [
  { id: "overview", label: "Prezentare", icon: "overview" },
  { id: "inbox", label: "Mesaje clienți", icon: "inbox" },
  { id: "portfolio", label: "Portofoliu", icon: "portfolio" },
  { id: "media", label: "Bibliotecă media", icon: "media" },
  { id: "content", label: "Conținut", icon: "content" },
  { id: "settings", label: "Setări website", icon: "settings" },
  { id: "team", label: "Echipă", icon: "team" },
  { id: "security", label: "Securitate", icon: "shield" },
] as const;
type View = (typeof navigation)[number]["id"];
const isView = (value: string): value is View =>
  navigation.some((item) => item.id === value);
const subscribeMobile = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 1099px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const mobileSnapshot = () => window.matchMedia("(max-width: 1099px)").matches;
function Brand() {
  return (
    <div className={styles.brand}>
      <Image
        src="/branding/artmaster-symbol.webp"
        width={40}
        height={40}
        alt=""
      />
      <div>
        <strong>
          ARTMASTER<span>®</span>
        </strong>
        <small>ADMINISTRATION</small>
      </div>
    </div>
  );
}
export function AdminConsole({
  actor,
  unavailable,
  pendingMfa = null,
  authMode = "local",
  sessionPolicy,
}: {
  actor: Actor | null;
  unavailable: boolean;
  pendingMfa?: "enroll" | "challenge" | null;
  authMode?: "local" | "supabase";
  sessionPolicy: SessionPolicy;
}) {
  return actor ? (
    <Workspace
      actor={actor}
      authMode={authMode}
      sessionPolicy={sessionPolicy}
    />
  ) : (
    <AuthGate unavailable={unavailable} pendingMfa={pendingMfa} />
  );
}
function AuthGate({
  unavailable,
  pendingMfa,
}: {
  unavailable: boolean;
  pendingMfa: "enroll" | "challenge" | null;
}) {
  const [stage, setStage] = useState<"password" | "enroll" | "challenge">(
      pendingMfa || "password",
    ),
    [qrCode, setQrCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/admin/logout", { method: "POST", ...jsonBody({}) });
      location.reload();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await adminApi<{
        mfaRequired?: boolean;
        enrollmentRequired?: boolean;
      }>("/api/admin/login", {
        method: "POST",
        ...jsonBody(
          stage === "password"
            ? { email: form.get("email"), password: form.get("password") }
            : { code: form.get("code") },
        ),
      });
      if (result.enrollmentRequired) setStage("enroll");
      else if (result.mfaRequired) setStage("challenge");
      else location.reload();
    } catch (failure) {
      setError(
        failure instanceof AdminApiError && failure.code === "unauthorized"
          ? stage === "password"
            ? "E-mailul sau parola nu sunt corecte."
            : "Codul nu este valid sau verificarea a expirat. Autentifică-te din nou."
          : (failure as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.authPage}>
      <section className={styles.authStory}>
        <Brand />
        <div className={styles.authEditorial}>
          <span className={styles.eyebrow}>DINCOLO DE IDEI. ÎN CONTROL.</span>
          <h2>
            Locul în care
            <br />
            proiectele prind
            <br />
            <em>direcție.</em>
          </h2>
          <p>
            Un spațiu dedicat echipei ARTMASTER.
            <br />
            Clienți, conținut și proiecte, în același loc.
          </p>
          <div className={styles.authMark} aria-hidden="true">
            A
            <span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M4 20 20 4M4 4h16v16" />
              </svg>
            </span>
          </div>
        </div>
        <small>ARTMASTER · Reclamă vizuală & producție publicitară</small>
      </section>
      <section className={styles.authSide}>
        <div className={styles.authCard}>
          <div className={styles.authLock}>
            <AdminIcon name="lock" />
          </div>
          <span className={styles.eyebrow}>ACCES ECHIPĂ</span>
          <h1>
            {unavailable
              ? "Acces indisponibil"
              : stage === "enroll"
                ? "Activează protecția contului"
                : stage === "challenge"
                  ? "Confirmă că ești tu"
                  : "Bine ai revenit."}
          </h1>
          <p className={styles.muted}>
            {unavailable
              ? "Administrarea nu poate fi accesată momentan. Reîncearcă după verificarea configurării."
              : stage === "password"
                ? "Autentifică-te pentru a intra în cabinet."
                : stage === "enroll"
                  ? "Autentificarea TOTP este obligatorie. Datele rămân inaccesibile până la confirmarea codului."
                  : "Introdu codul din aplicația de autentificare."}
          </p>
          {!unavailable && (stage !== "enroll" || qrCode) ? (
            <form onSubmit={login}>
              {stage === "password" ? (
                <>
                  <label className={styles.field}>
                    E-mail
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      placeholder="nume@companie.md"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    Parolă
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                  </label>
                </>
              ) : (
                <>
                  {qrCode && (
                    <Image
                      className={styles.qr}
                      src={qrCode}
                      alt="Cod QR pentru aplicația de autentificare"
                      width={220}
                      height={220}
                      unoptimized
                    />
                  )}
                  <label className={styles.field}>
                    Cod de autentificare
                    <input
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      placeholder="000 000"
                      required
                    />
                  </label>
                </>
              )}
              <Action
                type="submit"
                variant="primary"
                icon="arrow"
                disabled={busy}
              >
                {busy
                  ? "Se verifică…"
                  : stage === "password"
                    ? "Intră în cabinet"
                    : "Confirmă autentificarea"}
              </Action>
            </form>
          ) : (
            !unavailable && (
              <Action
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await adminApi<{ qrCode: string }>(
                      "/api/admin/mfa/enroll",
                      { method: "POST", ...jsonBody({}) },
                    );
                    setQrCode(result.qrCode);
                  } catch (failure) {
                    setError((failure as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Configurează aplicația
              </Action>
            )
          )}
          {error && <Notice error>{error}</Notice>}
          {stage !== "password" && (
            <Action variant="quiet" disabled={busy} onClick={logout}>
              Renunță și ieși
            </Action>
          )}
          <div className={styles.authFootnote}>
            <AdminIcon name="shield" />
            <span>
              Acces rezervat echipei. Conturile sunt create de administrator.
            </span>
          </div>
          <Link className={styles.backToSite} href="/ro">
            Înapoi la website <AdminIcon name="external" />
          </Link>
        </div>
        <small className={styles.authCopyright}>
          ARTMASTER · Cabinet administrativ
        </small>
      </section>
    </main>
  );
}
function Workspace({
  actor,
  authMode,
  sessionPolicy,
}: {
  actor: Actor;
  authMode: "local" | "supabase";
  sessionPolicy: SessionPolicy;
}) {
  const [view, setView] = useState<View>("overview"),
    [menuOpen, setMenuOpen] = useState(false),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [totals, setTotals] = useState<Record<string, number>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Quote | null>(null),
    [studioOpened, setStudioOpened] = useState(false),
    [mediaOpened, setMediaOpened] = useState(false),
    [studioDirty, setStudioDirty] = useState(false);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const heading = useRef<HTMLHeadingElement>(null),
    menuButton = useRef<HTMLButtonElement>(null),
    sidebar = useRef<HTMLElement>(null),
    requestId = useRef(0);
  const studio =
    view === "portfolio" || view === "content" || view === "settings";
  const navigate = useCallback((next: View) => {
    setView(next);
    setMenuOpen(false);
    if (["portfolio", "content", "settings"].includes(next))
      setStudioOpened(true);
    if (next === "media") setMediaOpened(true);
  }, []);
  useEffect(() => {
    function sync() {
      const hash = location.hash.slice(1);
      if (isView(hash)) navigate(hash);
    }
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [navigate]);
  useEffect(() => {
    if (menuOpen)
      sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen || !mobile) return;
    const element = sidebar.current;
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        requestAnimationFrame(() => menuButton.current?.focus());
      }
      if (event.key === "Tab") {
        const items = element?.querySelectorAll<HTMLElement>(
          "a,button:not([disabled])",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    element?.addEventListener("keydown", handle);
    return () => element?.removeEventListener("keydown", handle);
  }, [menuOpen, mobile]);
  async function load() {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await adminApi<QuotePage>("/api/admin/quotes?pageSize=5");
      if (id === requestId.current) {
        setQuotes(data.quotes);
        setTotals(data.totals);
      }
    } catch (failure) {
      if (id === requestId.current) setError((failure as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    adminApi<QuotePage>("/api/admin/quotes?pageSize=5")
      .then((data) => {
        if (!cancelled && id === requestId.current) {
          setQuotes(data.quotes);
          setTotals(data.totals);
        }
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function go(next: View) {
    navigate(next);
    window.history.pushState(null, "", `#${next}`);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function logout() {
    if (
      studioDirty &&
      !window.confirm(
        "Ai modificări nesalvate. Ieși din cont și renunți la ele?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/admin/logout", { method: "POST", ...jsonBody({}) });
      location.reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = navigation.find((item) => item.id === view)!;
  const newCount = totals.new || 0;
  return (
    <div className={styles.workspace}>
      <a className={styles.skipLink} href="#admin-main">
        Mergi la conținut
      </a>
      {menuOpen && (
        <button
          className={styles.menuBackdrop}
          aria-label="Închide meniul"
          onClick={() => {
            setMenuOpen(false);
            requestAnimationFrame(() => menuButton.current?.focus());
          }}
        />
      )}
      <aside
        ref={sidebar}
        inert={mobile && !menuOpen ? true : undefined}
        role={mobile && menuOpen ? "dialog" : undefined}
        aria-modal={mobile && menuOpen ? true : undefined}
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
        aria-label="Meniul cabinetului"
      >
        <div className={styles.sidebarBrand}>
          <Brand />
          <button
            className={`${styles.iconButton} ${styles.mobileMenu}`}
            aria-label="Închide meniul de navigare"
            onClick={() => {
              setMenuOpen(false);
              requestAnimationFrame(() => menuButton.current?.focus());
            }}
          >
            <AdminIcon name="close" />
          </button>
        </div>
        <div className={styles.workspaceLabel}>
          <span className={styles.workspaceIcon}>A</span>
          <div>
            <strong>ARTMASTER Studio</strong>
            <small>Cabinet administrativ</small>
          </div>
          <span className={styles.workspaceDot} />
        </div>
        <p className={styles.navLabel}>SPAȚIUL TĂU DE LUCRU</p>
        <nav aria-label="Navigare administrare">
          {navigation.map((item, index) => (
            <a
              href={`#${item.id}`}
              key={item.id}
              className={`${styles.navItem} ${view === item.id ? styles.navActive : ""} ${index === 6 ? styles.navDivider : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                go(item.id);
              }}
            >
              <AdminIcon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "inbox" && !loading && !error && newCount > 0 ? (
                <b>{newCount}</b>
              ) : null}
            </a>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <Link
            href="/ro"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.visitSite}
          >
            Vezi website-ul <AdminIcon name="external" />
          </Link>
          <button
            className={styles.protectionBadge}
            onClick={() => go("security")}
          >
            <AdminIcon name="shield" />
            <span>
              {actor.aal === "aal2"
                ? "Sesiune protejată prin MFA"
                : "Mediu local de dezvoltare"}
            </span>
          </button>
          <div className={styles.sidebarAccount}>
            <button onClick={() => go("team")}>
              <span className={styles.avatar}>
                {actor.email.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{actor.email.split("@")[0]}</strong>
                <small>
                  {actor.role === "admin"
                    ? "Administrator"
                    : actor.role === "editor"
                      ? "Editor"
                      : "Vizualizare"}
                </small>
              </span>
            </button>
            <button
              className={styles.iconButton}
              disabled={busy}
              onClick={logout}
              aria-label="Ieșire din cont"
            >
              <AdminIcon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div
        className={styles.workspaceBody}
        inert={mobile && menuOpen ? true : undefined}
      >
        <header className={styles.topbar}>
          <button
            ref={menuButton}
            className={`${styles.iconButton} ${styles.mobileMenu}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Deschide meniul"
          >
            <AdminIcon name="menu" />
          </button>
          <div className={styles.breadcrumb}>
            <span>Cabinet administrativ</span>
            <AdminIcon name="chevron" />
            <strong>{current.label}</strong>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.localeTag}>
              RO <span>· RU · EN</span>
            </span>
            <span className={styles.topbarDivider} />
            <button
              className={styles.iconButton}
              aria-label="Deschide centrul de securitate"
              onClick={() => go("security")}
            >
              <AdminIcon name="shield" />
            </button>
          </div>
        </header>
        <main id="admin-main" className={styles.main}>
          <div className={styles.pageHeading}>
            <div>
              <span className={styles.eyebrow}>
                {view === "overview"
                  ? "ARTMASTER / CONTROL ROOM"
                  : "SPAȚIUL TĂU DE LUCRU"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {view === "overview"
                  ? "O zi bună începe cu perspectivă"
                  : current.label}
                <span className={styles.headingDot}>.</span>
              </h1>
              <p>
                {view === "overview"
                  ? "Proiectele noi, conversațiile și următorii pași ai echipei."
                  : view === "inbox"
                    ? "Fiecare solicitare merită atenția potrivită."
                    : view === "security"
                      ? "Accesul potrivit. Protecție la fiecare pas."
                      : view === "media"
                        ? "O bibliotecă pentru identitatea vizuală ARTMASTER."
                        : view === "team"
                          ? "Oameni și responsabilități, într-un spațiu comun."
                          : "Creează cu grijă. Verifică. Publică atunci când e gata."}
              </p>
            </div>
            {view === "overview" && (
              <Action
                variant="primary"
                icon="inbox"
                onClick={() => go("inbox")}
              >
                Deschide mesajele
              </Action>
            )}
          </div>
          {view !== "inbox" && error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {view === "overview" && (
            <Overview
              totals={totals}
              quotes={quotes}
              loading={loading}
              error={error}
              onRefresh={load}
              onNavigate={go}
              onSelect={(quote) => {
                setSelected(quote);
                go("inbox");
              }}
              actor={actor}
            />
          )}{" "}
          {view === "inbox" && (
            <ClientInbox
              onChanged={() => void load()}
              actor={actor}
              selected={selected}
              onSelect={setSelected}
              onClose={() => setSelected(null)}
            />
          )}
          {studioOpened && (
            <div hidden={!studio} className={styles.studio}>
              <Suspense fallback={<Skeleton />}>
                <CmsEditor
                  actor={actor}
                  onDirtyChange={setStudioDirty}
                  workspaceSection={
                    view === "portfolio"
                      ? "projects"
                      : view === "settings"
                        ? "contact"
                        : "services"
                  }
                />
              </Suspense>
            </div>
          )}
          {mediaOpened && (
            <div hidden={view !== "media"}>
              <MediaLibrary actor={actor} />
            </div>
          )}
          {view === "security" && (
            <SecurityCenter
              actor={actor}
              authMode={authMode}
              onLogout={logout}
              sessionPolicy={sessionPolicy}
            />
          )}{" "}
          {view === "team" && <TeamView actor={actor} onLogout={logout} />}{" "}
          {view === "inbox" && actor.role === "admin" && (
            <div className={styles.retryBar}>
              <div>
                <AdminIcon name="mail" />
                <span>Notificări în așteptare? Poți reîncerca expedierea.</span>
              </div>
              <Action
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await adminApi<{
                      checked: number;
                      sent: number;
                    }>("/api/admin/notifications/retry", {
                      method: "POST",
                      ...jsonBody({}),
                    });
                    setMessage(
                      `Notificări verificate: ${result.checked}; acceptate de furnizor: ${result.sent}.`,
                    );
                  } catch (failure) {
                    setError((failure as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reîncearcă notificările
              </Action>
            </div>
          )}
          <footer className={styles.workspaceFooter}>
            <span>
              ARTMASTER <b>®</b> <span>·</span> Creat pentru echipa ta.
            </span>
            <span>Durlești, Republica Moldova</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Overview({
  totals,
  quotes,
  loading,
  error,
  onRefresh,
  onNavigate,
  onSelect,
  actor,
}: {
  totals: Record<string, number>;
  quotes: Quote[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onNavigate: (view: View) => void;
  onSelect: (quote: Quote) => void;
  actor: Actor;
}) {
  const stats: [string, number, string, IconName][] = [
    [
      "Total solicitări",
      totals.total || 0,
      "Toate solicitările înregistrate",
      "inbox",
    ],
    [
      "Așteaptă un răspuns",
      totals.new || 0,
      "Solicitări cu starea „Nouă”",
      "mail",
    ],
    [
      "Solicitări în lucru",
      totals.in_progress || 0,
      "Solicitări preluate de echipă",
      "portfolio",
    ],
    [
      "Finalizate",
      totals.completed || 0,
      "Solicitări marcate finalizate",
      "check",
    ],
  ];
  return (
    <>
      {loading ? (
        <Skeleton />
      ) : (
        <div className={styles.stats}>
          {stats.map(([label, value, caption, icon], index) => (
            <article
              className={`${styles.statCard} ${index === 1 ? styles.statHighlight : ""}`}
              key={label}
            >
              <div>
                <span>{label}</span>
                <AdminIcon name={icon} />
              </div>
              <strong>{error ? "—" : value.toString().padStart(2, "0")}</strong>
              <small>{error ? "Date indisponibile" : caption}</small>
            </article>
          ))}
        </div>
      )}
      <div className={styles.overviewColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>ÎN PRIM-PLAN</span>
              <h2>Ultimele solicitări</h2>
            </div>
            <Action
              variant="quiet"
              icon="arrow"
              onClick={() => onNavigate("inbox")}
            >
              Vezi toate
            </Action>
          </div>
          {loading ? (
            <Skeleton />
          ) : error ? (
            <EmptyState
              title="Datele nu au putut fi încărcate"
              action={<Action onClick={onRefresh}>Reîncearcă</Action>}
            >
              Reîncearcă pentru a vedea solicitările reale.
            </EmptyState>
          ) : quotes.length ? (
            <QuoteTable quotes={quotes.slice(0, 5)} onSelect={onSelect} />
          ) : (
            <EmptyState
              title="Pregătit pentru următorul proiect."
              action={
                <Link
                  className={styles.inlineLink}
                  href="/ro/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Vezi formularul public <AdminIcon name="external" />
                </Link>
              }
            >
              Nu există solicitări înregistrate. Mesajele trimise prin website
              vor apărea aici.
            </EmptyState>
          )}
          <p className={styles.dataScope}>
            Totalurile includ toate solicitările înregistrate, indiferent de
            pagina afișată.
          </p>
        </section>
        <aside className={styles.rightRail}>
          <section className={styles.yellowCard}>
            <span className={styles.eyebrow}>DE LA IDEE LA VIZIBILITATE</span>
            <h2>
              Următorul proiect
              <br />
              merită văzut.
            </h2>
            <p>
              Actualizează portofoliul cu lucrări reale și fotografii aprobate.
            </p>
            <Action icon="arrow" onClick={() => onNavigate("portfolio")}>
              {actor.role === "viewer"
                ? "Vezi portofoliul"
                : "Deschide Portofoliu Studio"}
            </Action>
            <span className={styles.cardArt} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth=".8"
              >
                <path d="M4 20 20 4M4 4h16v16" />
              </svg>
            </span>
          </section>
          <section className={styles.quickActions}>
            <h2>La un pas distanță</h2>
            {[
              [
                "content",
                "content",
                "Editează conținutul",
                "Texte în română, rusă și engleză",
              ],
              [
                "media",
                "media",
                "Biblioteca vizuală",
                "Imagini și fotografii pentru website",
              ],
              [
                "settings",
                "settings",
                "Datele companiei",
                "Contacte și informații publice",
              ],
            ].map(([view, icon, label, description]) => (
              <button key={view} onClick={() => onNavigate(view as View)}>
                <span className={styles.quickIcon}>
                  <AdminIcon name={icon as IconName} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <AdminIcon name="chevron" />
              </button>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

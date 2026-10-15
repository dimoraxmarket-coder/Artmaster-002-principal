"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./admin.module.css";

export type IconName =
  | "overview"
  | "inbox"
  | "portfolio"
  | "media"
  | "content"
  | "settings"
  | "team"
  | "shield"
  | "arrow"
  | "external"
  | "search"
  | "plus"
  | "close"
  | "menu"
  | "logout"
  | "refresh"
  | "file"
  | "check"
  | "clock"
  | "lock"
  | "download"
  | "chevron"
  | "mail";
const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 4h16v16H4zM4 13h5l2 3h2l2-3h5" />
      <path d="M8 8h8" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V3h8v4M3 12l9 3 9-3M12 13v4" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </>
  ),
  content: (
    <>
      <path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h5" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-3-3 1-2-3z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  external: (
    <>
      <path d="M14 3h7v7M10 14 21 3M10 3H3v18h18v-7" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logout: (
    <>
      <path d="M10 4H4v16h6M10 12h11m-4-4 4 4-4 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a9 9 0 1 0 1 7M20 3v6h-6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
};
export function AdminIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Action({
  children,
  icon,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: IconName;
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      type="button"
      className={`${styles.action} ${styles[variant]} ${className}`}
      {...props}
    >
      {icon && <AdminIcon name={icon} />}
      <span>{children}</span>
    </button>
  );
}
export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <AdminIcon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={`${styles.notice} ${error ? styles.error : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
export function Skeleton() {
  return (
    <div
      className={styles.skeleton}
      role="status"
      aria-label="Se încarcă datele"
    >
      <span />
      <span />
      <span />
    </div>
  );
}
export const statusLabels = {
  new: "Nouă",
  in_progress: "În lucru",
  completed: "Finalizată",
  archived: "Arhivată",
};
export function Status({ value }: { value: keyof typeof statusLabels }) {
  return (
    <span className={`${styles.status} ${styles[value]}`}>
      <i />
      {statusLabels[value]}
    </span>
  );
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ro-MD", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Chisinau",
  }).format(new Date(date));

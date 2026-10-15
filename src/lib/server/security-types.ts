import type { AdminRole } from "./types";
// A reference is a separate random management handle. It cannot authenticate and
// is never a cookie SID, Auth session ID, token or hash.
export type ManagedSession = {
  reference: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
};
export type SessionPage = {
  sessions: ManagedSession[];
  total: number;
  page: number;
  pageSize: number;
  owner: { id: string; email: string };
  freshUntil: string | null;
};
export type SecurityAccount = {
  id: string;
  email: string;
  role: AdminRole;
  enabled: boolean;
  version: number;
};
export type AccountPage = {
  accounts: SecurityAccount[];
  total: number;
  page: number;
  pageSize: number;
  enabledAdmins: number;
};
export type AuditEvent = {
  id: number;
  actor: string;
  actorLabel: string;
  action: string;
  target: string;
  targetLabel: string | null;
  createdAt: string;
  context: Record<string, string | number | boolean>;
};
export type AuditPage = {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
};
export type MfaStatus = {
  mode: "local" | "supabase";
  aal: "aal1" | "aal2";
  verifiedTotpFactors: number | null;
  freshUntil: string | null;
};

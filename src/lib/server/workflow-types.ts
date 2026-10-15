import type { AdminRole, Quote } from "./types";
export type StaffMember = { id: string; email: string; role: AdminRole };
export type CRMQuote = Quote & { version: number; assignedTo: string | null };
export type QuoteEvent = {
  id: number;
  actor: string;
  kind: "status" | "assignment" | "note";
  body: string;
  createdAt: string;
};
export type QuoteDetail = {
  quote: CRMQuote;
  events: QuoteEvent[];
  hasMore: boolean;
};
export type QuoteQuery = {
  q: string;
  status: string;
  assignee: string;
  page: number;
  pageSize: number;
};
export type QuotePage = {
  quotes: CRMQuote[];
  total: number;
  page: number;
  pageSize: number;
  totals: Record<string, number>;
};
export type QuoteChange = {
  status?: Quote["status"];
  assignedTo?: string | null;
  note?: string;
  expectedVersion?: number;
};
export type MediaAsset = {
  url: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: string;
  archivedAt: string | null;
  managed: boolean;
  replaceable: boolean;
  uses: {
    section: string;
    slug: string;
    title: string;
    state: "draft" | "published";
  }[];
};
export type MediaPage = {
  assets: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
  contentVersion: number;
};

import type { SiteContent } from "./types";
export type ContentVersion = {
  id: number;
  version: number;
  action:
    | "baseline-published"
    | "baseline-draft"
    | "draft"
    | "publish"
    | "restore";
  actor: string | null;
  createdAt: string;
  sourceId: number | null;
  bytes: number;
};
export type ContentHistoryPage = {
  versions: ContentVersion[];
  total: number;
  page: number;
  pageSize: number;
  bytes: number;
  limitBytes: number;
  limitVersions: number;
};
export type ContentSnapshot = ContentVersion & { content: SiteContent };
export const HISTORY_LIMIT_BYTES = 512 * 1024 * 1024;
export const HISTORY_LIMIT_VERSIONS = 10000;
export const SNAPSHOT_LIMIT_BYTES = 2 * 1024 * 1024;

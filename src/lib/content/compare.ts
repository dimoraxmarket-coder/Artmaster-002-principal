import type { SiteContent } from "./types";
export type ContentChange = { path: string; before: string; after: string };
// Plain text only, bounded rendering. Full immutable snapshots remain available server-side.
export function compareContent(before: SiteContent, after: SiteContent) {
  const changes: ContentChange[] = [];
  let total = 0;
  function walk(a: unknown, b: unknown, path: string) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      const left = a as Record<string, unknown>,
        right = b as Record<string, unknown>;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        walk(left[key], right[key], path ? `${path}.${key}` : key);
    } else {
      total++;
      if (changes.length < 80)
        changes.push({
          path,
          before: String(a ?? "∅").slice(0, 2000),
          after: String(b ?? "∅").slice(0, 2000),
        });
    }
  }
  walk(before, after, "");
  return { changes, total };
}

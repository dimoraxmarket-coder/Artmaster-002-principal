import { BackendError } from "./config";

// A per-process CPU/memory bound, in addition to endpoint and byte limits.
// Hosting must also limit request concurrency across workers/instances.
let active = 0;
const waiting: (() => void)[] = [];
export async function rasterWork<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) {
    if (waiting.length >= 4) throw new BackendError("upload_busy", 503);
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

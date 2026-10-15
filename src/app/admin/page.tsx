import { requireActor, pendingMfaState } from "@/lib/server/auth";
import { BackendError, storageMode } from "@/lib/server/config";
import { ADMIN_IDLE_MS, ADMIN_ABSOLUTE_MS } from "@/lib/server/session-policy";
import { AdminConsole } from "./ui";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  let actor = null;
  let unavailable = false;
  let pendingMfa: null | "enroll" | "challenge" = null;
  let authMode: "local" | "supabase" = "local";
  try {
    authMode = storageMode();
    pendingMfa = await pendingMfaState();
    actor = await requireActor();
  } catch (error) {
    if (
      !(
        error instanceof BackendError &&
        ["unauthorized", "mfa_required"].includes(error.code)
      )
    )
      unavailable = true;
  }
  return (
    <AdminConsole
      actor={actor}
      unavailable={unavailable}
      pendingMfa={pendingMfa}
      authMode={authMode}
      sessionPolicy={{
        idleMinutes: ADMIN_IDLE_MS / 60000,
        absoluteHours: ADMIN_ABSOLUTE_MS / 3600000,
      }}
    />
  );
}

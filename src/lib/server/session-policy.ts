// Keep in sync with 202610150002_admin_validation.sql. These are server policy,
// never client-controlled settings or a production MFA bypass.
export const ADMIN_IDLE_MS = 15 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

import { ImplementInterface } from "@antelopejs/interface-core";

const UNSET = "unset";

/** An origin a `VERIFY_MAILING_*` variable sets: `unset` answers nothing, as a DMS with no such base URL would. */
function originOf(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === UNSET ? undefined : value;
}

/**
 * Replaces the DMS answers for the dashboard and API origins when
 * `VERIFY_MAILING_CLIENT_BASE_URL` or `VERIFY_MAILING_API_BASE_URL` is set. The
 * installed DMS always has a `clientBaseUrl` (its development default, else the
 * startup refuses), so the fallbacks to `apiBaseUrl` and to the server's own
 * origin cannot be reached through the `dms` configuration. A variable set to
 * `unset`, or left unset next to the other, makes that answer `undefined`.
 */
export async function implementOrigins(): Promise<void> {
  const { VERIFY_MAILING_CLIENT_BASE_URL: client, VERIFY_MAILING_API_BASE_URL: api } = process.env;
  if (client === undefined && api === undefined) return;
  ImplementInterface(await import("@antelopejs/interface-dms/client-base-url"), {
    GetClientBaseUrl: () => Promise.resolve(originOf("VERIFY_MAILING_CLIENT_BASE_URL")),
  });
  ImplementInterface(await import("@antelopejs/interface-dms/api-base-url"), {
    GetApiBaseUrl: () => Promise.resolve(originOf("VERIFY_MAILING_API_BASE_URL")),
  });
}

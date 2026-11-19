import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { buildTenantExportArchive } from "@antelopejs/interface-dms/base/tenant-export-archive";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import { z } from "zod";
import { callInterface } from "./calls.untyped";
import type { Json } from "./json";

/** The path the verification playground served its trusted backend calls under. */
export const FIXTURE_PREFIX = "/verify-mailing";

/** What one of the trusted routes answered, as its HTTP response carried it. */
export interface FixtureAnswer {
  status: number;
  body: unknown;
}

const INVITE_LIFETIME_MS = 3_600_000;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

const memberSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
  language: z.string().default("en"),
});
const callSchema = z.object({ fn: z.string(), args: z.array(z.unknown()) });
const exportSchema = z.object({ tenantId: z.string(), localPath: z.string() });

/** The ids of the permissions a role holds, with every id its grants sit under, as the DMS roles editor stores them. */
function withAncestors(permissions: string[]): string[] {
  return [
    ...new Set(
      permissions.flatMap((id) => {
        const segments = id.split(".");
        return segments.map((_, index) =>
          segments.slice(0, index + 1).join("."),
        );
      }),
    ),
  ];
}

/** A role holding the permissions asked for and an invitation to it, which the member signs up with. */
async function member(body: Json) {
  const { name, permissions, language } = memberSchema.parse(body);
  const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `${name} ${randomUUID()}`,
    permissions: withAncestors(permissions),
  });
  const token = randomUUID();
  const email = `${name.toLowerCase()}-${randomUUID()}@verify.local`;
  await GetModel(UserInviteModel, DEFAULT_TENANT_ID).insert({
    email,
    roles_ids: roleId === undefined ? [] : [roleId],
    language,
    token,
    asTenantOwner: false,
    expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
  });
  return { email, token, roleId };
}

/** One function of `@antelopejs/interface-dms-mailing`, called with the arguments as the journey wrote them. */
function call(body: Json) {
  const { fn, args } = callSchema.parse(body);
  return callInterface(fn, args);
}

/** The tenant data export archive the DMS builds from its contributors, which has no HTTP route of its own. */
function exportArchive(body: Json) {
  const { tenantId, localPath } = exportSchema.parse(body);
  return buildTenantExportArchive({
    tenantId,
    localPath,
    signal: new AbortController().signal,
  });
}

/** Each route, answering the JSON text its HTTP response carried. */
const ROUTES = new Map<string, (body: Json) => Promise<string>>([
  [
    `${FIXTURE_PREFIX}/member`,
    async (body) => JSON.stringify(await member(body)),
  ],
  [`${FIXTURE_PREFIX}/call`, async (body) => JSON.stringify(await call(body))],
  [
    `${FIXTURE_PREFIX}/export`,
    async (body) => JSON.stringify(await exportArchive(body)),
  ],
]);

/**
 * Serves the verification playground's trusted routes in the test process,
 * answering what their HTTP response carried: the JSON of what the route
 * returned, a 500 with the message when it threw, a 404 for another path.
 */
export async function serveFixture(
  path: string,
  body: Json,
): Promise<FixtureAnswer> {
  const route = ROUTES.get(path);
  if (!route) return { status: HTTP_NOT_FOUND, body: { message: "Not found" } };
  try {
    return { status: HTTP_OK, body: JSON.parse(await route(body)) };
  } catch (error) {
    return { status: HTTP_SERVER_ERROR, body: { message: String(error) } };
  }
}

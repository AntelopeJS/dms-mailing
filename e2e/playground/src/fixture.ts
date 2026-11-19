import { randomUUID } from "node:crypto";
import { Controller, JSONBody, Post } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import { z } from "zod";
import { call } from "./calls";

const INVITE_LIFETIME_MS = 3_600_000;

const memberSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
  language: z.string().default("en"),
});

const callSchema = z.object({ fn: z.string(), args: z.array(z.unknown()) });

/** The ids of the permissions a role holds, with every id its grants sit under, as the DMS roles editor stores them. */
function withAncestors(permissions: string[]): string[] {
  return [
    ...new Set(
      permissions.flatMap((id) => {
        const segments = id.split(".");
        return segments.map((_, index) => segments.slice(0, index + 1).join("."));
      }),
    ),
  ];
}

/**
 * Trusted backend calls a journey cannot make over HTTP: members with a role,
 * and the functions of `@antelopejs/interface-dms-mailing`. Only the
 * verification playground serves them.
 */
export class VerifyFixtureController extends Controller("/verify-mailing") {
  @Post("/member")
  async member(@JSONBody() body: unknown) {
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

  @Post("/call")
  call(@JSONBody() body: unknown) {
    const { fn, args } = callSchema.parse(body);
    return call(fn, args);
  }
}

import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";

/** Prefix of what a procedure writes as its author: `automation:<procedure id>`. */
export const AUTOMATION_ACTOR_PREFIX = "automation:";

/** The author a procedure's write records. */
export const automationActor = (procedureId: string): string =>
  `${AUTOMATION_ACTOR_PREFIX}${procedureId}`;

/** The workspace an action acts in: its `tenantId` input, else the default one. */
function actionTenantId(tenantId: string | undefined): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

/**
 * Fails the step for a workspace that does not exist: a model opens on any
 * id, so a mistyped one would otherwise read or write a phantom workspace.
 */
async function requireTenant(
  actionId: string,
  tenantId: string,
): Promise<void> {
  if (!(await GetModel(TenantModel).get(tenantId)))
    throw new Error(`${actionId}: unknown tenant "${tenantId}"`);
}

/** The workspace an action acts in, checked to exist. */
export async function resolveTenant(
  actionId: string,
  tenantId: string | undefined,
): Promise<string> {
  const resolved = actionTenantId(tenantId);
  await requireTenant(actionId, resolved);
  return resolved;
}

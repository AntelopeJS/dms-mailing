import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { HTTP_FORBIDDEN, MAILING_SEND_PERMISSION } from "../constants";

const MISSING_SEND_PERMISSION = "$dms_mailing.errors.missing_send_permission";

/**
 * Refuses a caller who may read the mailing pages but was not granted
 * `mailing.send`.
 *
 * `@AuthUserWithPermission` only accepts a page, component or action as its
 * target, and derives the permission from the component tree — it cannot be
 * pointed at a standalone registered permission. The sends controller is
 * therefore gated on the page's *read* permission, and the routes that actually
 * reach recipients add this check on top. It mirrors what the DMS guard does
 * once it has resolved a permission id.
 */
export async function assertSendPermission(
  user: User,
  tenantId: string,
): Promise<void> {
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    user._id,
  );
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    member?.roleIds ?? [],
    GetModel(RoleModel, tenantId),
  );
  assert(
    await HasPermission(permissions, MAILING_SEND_PERMISSION),
    HTTP_FORBIDDEN,
    MISSING_SEND_PERMISSION,
  );
}

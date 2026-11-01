import {
  Context,
  Controller,
  Delete,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { z } from "zod";
import { API_BASE_PATH, HTTP_CONFLICT, HTTP_NOT_FOUND } from "../constants";
import { SuppressionModel } from "../db";
import { SuppressionsPageController } from "../pages/suppressions";
import { suppressAddress } from "../services/suppressions";

const INVALID_SUPPRESSION = "$dms_mailing.suppressions.errors.invalid";
const ALREADY_SUPPRESSED = "$dms_mailing.suppressions.errors.already";
const NOT_SUPPRESSED = "$dms_mailing.suppressions.errors.not_found";
const EMAIL_FIELD = "email";
const MAX_NOTE_LENGTH = 500;
/** A manual entry comes from no send. */
const NO_SEND = "";

const manualSuppressionSchema = z.object({
  email: z.string().trim().email(),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

/** A refused entry: the generic message, and each issue under its field. */
function invalidSuppression(error: unknown) {
  if (!(error instanceof z.ZodError)) return INVALID_SUPPRESSION;
  return { message: INVALID_SUPPRESSION, issues: error.issues };
}

/** An address already on the list, told under the address field. */
const alreadySuppressed = () => ({
  message: ALREADY_SUPPRESSED,
  issues: [{ path: [EMAIL_FIELD], message: ALREADY_SUPPRESSED }],
});

export class SuppressionsController extends Controller(
  `${API_BASE_PATH}/suppressions`,
) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(SuppressionsPageController)
  declare user: User;

  @TenantScopedModel(SuppressionModel)
  declare suppressions: SuppressionModel;

  /** Puts an address on the list by hand: nothing is sent to it any more. */
  @Post("")
  async add(@JSONBody() body: unknown): Promise<{ added: true }> {
    const input = assertValidation(
      body ?? {},
      (value) => manualSuppressionSchema.parse(value),
      invalidSuppression,
    );
    const isAdded = await suppressAddress(getRequestTenantId(this.ctx), {
      email: input.email,
      reason: "manual",
      sendId: NO_SEND,
      detail: input.note || undefined,
      createdBy: this.user._id,
    });
    if (!isAdded) throw new HTTPResult(HTTP_CONFLICT, alreadySuppressed());
    return { added: true };
  }

  /** Lifts an address off the list: the next send reaches it again. */
  @Delete("/:id")
  async remove(
    @Parameter("id", "param") id: string,
  ): Promise<{ removed: true }> {
    const removed = await this.suppressions.delete(id);
    assert(removed > 0, HTTP_NOT_FOUND, NOT_SUPPRESSED);
    return { removed: true };
  }
}

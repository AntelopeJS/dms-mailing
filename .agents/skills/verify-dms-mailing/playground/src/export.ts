import { Controller, JSONBody, Post } from "@antelopejs/interface-api";
import { buildTenantExportArchive } from "@antelopejs/interface-dms/base/tenant-export-archive";
import { z } from "zod";

const exportSchema = z.object({ tenantId: z.string(), localPath: z.string() });

/**
 * Builds the tenant data export archive the DMS offers modules' contributors
 * (`Hook.TENANT_DATA_EXPORT`), which has no HTTP route of its own. Only the
 * verification playground serves it.
 */
export class VerifyExportController extends Controller("/verify-mailing") {
  @Post("/export")
  async build(@JSONBody() body: unknown) {
    const { tenantId, localPath } = exportSchema.parse(body);
    return buildTenantExportArchive({
      tenantId,
      localPath,
      signal: new AbortController().signal,
    });
  }
}

import { Controller, Get } from "@antelopejs/interface-api";
import type { ProviderFeatures } from "@antelopejs/interface-email";
import { readCapabilities } from "../services/provider";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { API_BASE_PATH } from "../constants";
import { OverviewPageController } from "../pages/overview";

export interface ProviderResponse {
  name: string;
  connected: boolean;
  features: ProviderFeatures | null;
}

export class MailingProviderController extends Controller(
  `${API_BASE_PATH}/provider`,
) {
  @AuthUserWithPermission(OverviewPageController)
  declare user: User;

  @Get("")
  async describe(): Promise<ProviderResponse> {
    const capabilities = await readCapabilities();
    if (!capabilities) return { name: "", connected: false, features: null };
    return {
      name: capabilities.name,
      connected: true,
      features: capabilities.features,
    };
  }
}

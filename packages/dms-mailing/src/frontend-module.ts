import path from "node:path";
import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";
import {
  API_BASE_PATH,
  FRONTEND_MODULE_NAME,
  WEBHOOK_SECRET_HEADER,
} from "./constants";

/**
 * The provider webhook (`/events/:provider/:tenantId`), served through the
 * dashboard's public URL: the front proxy lets it through without an
 * `Origin`, never sends it a session and relays the secret header, which the
 * route checks itself.
 */
const PROVIDER_WEBHOOK_ENDPOINT = {
  path: `${API_BASE_PATH}/events/*/*`,
  methods: ["POST"],
  headers: [WEBHOOK_SECRET_HEADER],
};

/**
 * This module's frontend, from its configuration alone: the backend registers
 * it with `AddFrontendModule`, and `@antelopejs/dms-frontend` calls this same
 * function (declared as `dmsFrontend` in package.json) to build and start the
 * frontend without a backend. It reads nothing but its arguments.
 */
export function frontendModule(): AddFrontendModuleOptions {
  return {
    name: FRONTEND_MODULE_NAME,
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    options: { dmsMailing: {} },
    priority: 0,
    publicEndpoints: [PROVIDER_WEBHOOK_ENDPOINT],
  };
}

import path from "node:path";
import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";

/**
 * The playground's frontend layer: no pages, only `app/app.config.ts`, which
 * gives the DMS branding an e-mail logo on a public host. The backend
 * registers it with `AddFrontendModule`, and `@antelopejs/dms-frontend` calls
 * this same function (`dmsFrontend` in package.json) to build the dashboard.
 */
export function frontendModule(): AddFrontendModuleOptions {
  return {
    name: "playground-mailing",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    options: {},
    priority: 0,
  };
}

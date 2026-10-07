import { readFileSync } from "node:fs";
import path from "node:path";
import type { ModuleStatus } from "@antelopejs/interface-dms/page";
import { readCapabilities } from "./provider";

const PACKAGE_JSON_PATH = path.join(__dirname, "../../package.json");

interface PackageManifest {
  version?: string;
}

/** The module's published version, as the catalog tile and the sidebar show it. */
export function moduleVersion(): string | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(PACKAGE_JSON_PATH, "utf8"),
    ) as PackageManifest;
    return manifest.version;
  } catch {
    return undefined;
  }
}

/** No provider answering means no e-mail can leave: the owner must look. */
export async function catalogStatus(): Promise<ModuleStatus> {
  const capabilities = await readCapabilities();
  return capabilities ? "live" : "attention";
}

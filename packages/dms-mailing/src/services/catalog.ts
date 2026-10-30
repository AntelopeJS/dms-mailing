import { readFileSync } from "node:fs";
import path from "node:path";
import type { ModuleStatus } from "@antelopejs/interface-dms/page";
import { isText } from "../validation/guards";
import { parseJsonObject } from "../validation/json";
import { readCapabilities } from "./provider";

const PACKAGE_JSON_PATH = path.join(__dirname, "../../package.json");

/** The module's published version, as the catalog tile and the sidebar show it. */
export function moduleVersion(): string | undefined {
  try {
    const manifest = parseJsonObject(readFileSync(PACKAGE_JSON_PATH, "utf8"));
    return isText(manifest.version) ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/** No provider answering means no e-mail can leave: the owner must look. */
export async function catalogStatus(): Promise<ModuleStatus> {
  const capabilities = await readCapabilities();
  return capabilities ? "live" : "attention";
}

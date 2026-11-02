import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { frontendModule } from "./frontend-module";

export async function construct(): Promise<void> {
  await AddFrontendModule(frontendModule());
}

export function start(): void {}

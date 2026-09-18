import path from "node:path";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";

export async function construct(): Promise<void> {
  await AddFrontendModule({
    name: "playground-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 1,
  });
}

export function start(): void {}

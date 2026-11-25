import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";
import type { KnipConfig } from "knip";

const config: KnipConfig = antelopeKnipConfig({
  ignoreDependencies: ["@types/semver"],
});

export default config;

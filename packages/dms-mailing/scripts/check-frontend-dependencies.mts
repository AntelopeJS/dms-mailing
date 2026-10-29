import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The drag and drop of the frontend runs on SortableJS through VueUse, not on
 * vuedraggable, which bundled the Vue compiler into the module: the frontend's
 * manifest depends on `sortablejs` and never again on `vuedraggable`. Prints
 * the violations only; exits 1 when there are any.
 */

const MANIFEST = join(
  import.meta.dirname,
  "..",
  "frontend-vue",
  "package.json",
);
const REQUIRED = "sortablejs";
const REFUSED = "vuedraggable";

/** A manifest's own `dependencies` field holding an object. */
interface Manifest {
  dependencies: object;
}

function isManifest(value: unknown): value is Manifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "dependencies" in value &&
    Object.hasOwn(value, "dependencies") &&
    typeof value.dependencies === "object" &&
    value.dependencies !== null
  );
}

const manifest: unknown = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (!isManifest(manifest)) {
  throw new Error("frontend-vue/package.json: no dependencies object");
}
const { dependencies } = manifest;
const errors: string[] = [];
if (!Object.hasOwn(dependencies, REQUIRED)) {
  errors.push(`frontend-vue/package.json: no ${REQUIRED} dependency`);
}
if (Object.hasOwn(dependencies, REFUSED)) {
  errors.push(`frontend-vue/package.json: depends on ${REFUSED} again`);
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}

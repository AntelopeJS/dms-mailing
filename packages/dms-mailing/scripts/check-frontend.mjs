import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const dmsPackageRoot = dirname(require.resolve("@antelopejs/dms/package.json"));
const adapterPackageRoot = dirname(
  require.resolve("@antelopejs/dms-frontend/package.json"),
);

const dmsRoot = resolve(process.env.DMS_SOURCE ?? dmsPackageRoot);
const adapterRoot = resolve(
  process.env.DMS_ADAPTER_SOURCE ?? adapterPackageRoot,
);
const adapterEntry = join(adapterRoot, "dist/common.js");
assert.ok(
  existsSync(adapterEntry),
  "The installed DMS frontend package must expose dist/common.js",
);
assert.ok(
  existsSync(join(dmsRoot, "frontend-vue/dms.frontend.ts")),
  "The installed DMS package must include frontend-vue",
);
const { createFrontendModuleRegistry, writeFrontendModuleRegistry } =
  await import(pathToFileURL(adapterEntry));
const workspace = mkdtempSync(join(tmpdir(), `${basename(root)}-frontend-`));
const templateRoot = join(adapterRoot, "templates/vue");
const layers = [
  {
    path: join(dmsRoot, "frontend-vue"),
    packageName: "@fixture/dms",
    priority: -100,
    options: { dms: { homepage: "/" } },
  },
  {
    path: join(root, "frontend-vue"),
    packageName: `@fixture/${basename(root)}`,
    priority: 0,
  },
];
const excluded = new Set([
  "node_modules",
  "pnpm-lock.yaml",
  ".npmrc",
  "dist",
  ".git",
]);
const environment = { ...process.env };
delete environment.NODE_OPTIONS;
const ssrRoute = {
  displayName: "Login",
  fullId: "pages.auth",
  fullSlug: "/auth",
  publicAccess: true,
  hasAccess: true,
};
const ssrPage = {
  component: "DmsDynamicPage",
  props: {
    path: "/auth",
    page: {
      route: ssrRoute,
      shared: {
        siteLayout: { pages: { "/auth": ssrRoute }, categories: {} },
        siteLayoutTree: {
          children: {},
          childrenOrders: [],
          fullId: "",
          fullSlug: "/",
          hasAccess: true,
        },
        quickActions: { categories: {}, actions: {} },
        modules: {},
        isOwner: false,
      },
      layout: {
        layout: { componentName: "dms-empty-layout", options: {} },
        components: {
          content: { componentName: "DmsAuthLogin", children: [] },
        },
      },
    },
    errors: {},
  },
  url: "/auth",
  version: "fixture",
};

function readPackage(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function prepareWorkspace() {
  for (const file of readdirSync(templateRoot).filter(
    (name) => name !== "npmrc",
  )) {
    cpSync(join(templateRoot, file), join(workspace, file), {
      recursive: true,
    });
  }
  const registry = createFrontendModuleRegistry(workspace, layers);
  let dependencies = {};
  for (const entry of registry.modules) {
    const source = layers.find(
      (layer) => layer.packageName === entry.packageName,
    );
    cpSync(source.path, entry.root, {
      recursive: true,
      filter: (path) => !excluded.has(basename(path)),
    });
    const pkg = readPackage(entry.root);
    dependencies = { ...pkg.dependencies, ...dependencies };
    delete pkg.devDependencies;
    writeFileSync(
      join(entry.root, "package.json"),
      JSON.stringify(pkg, null, 2),
    );
  }
  const pkg = readPackage(templateRoot);
  pkg.dependencies = { ...dependencies, ...pkg.dependencies };
  writeFileSync(join(workspace, "package.json"), JSON.stringify(pkg, null, 2));
  writeFrontendModuleRegistry(workspace, layers);
  writeFileSync(
    join(workspace, "dms-main.css"),
    '@import "tailwindcss";\n@import "@nuxt/ui";\n',
  );
}

function run(args) {
  execFileSync("pnpm", args, {
    cwd: workspace,
    env: environment,
    stdio: "inherit",
  });
}

async function checkEmail() {
  const casesPath = join(root, "frontend-vue/tests/email-render-cases.json");
  if (!existsSync(casesPath)) return;
  const { renderEmail } = await import(
    pathToFileURL(join(workspace, "dist/server/email-renderer.js"))
  );
  for (const props of JSON.parse(readFileSync(casesPath, "utf8"))) {
    const html = await renderEmail("EmailMailingTemplate", props, {
      locale: props.locale,
    });
    assert.ok(html.includes(`lang="${props.locale}"`));
    assert.ok(html.includes(props.email.subject));
    assert.ok(html.includes(props.email.preheader));
    assert.ok(html.includes("Alice &amp; Bob"));
    assert.match(html, /<table[\s>]/);
    assert.match(html, /<td[\s>]/);
    assert.match(
      html,
      /<img[^>]+src="[^"]*\/images\/antelope-logo\/light\.svg"/,
    );
    assert.doesNotMatch(html, /<\/?E(?:Preview|Row|Column|Link)[\s>]/);
    const footer = props.email.blocks.find((block) => block.type === "footer");
    assert.equal(html.split(footer.text).length - 1, 1);
    assert.ok(html.includes(`href="${footer.unsubscribeUrl}"`));
    assert.ok(html.includes(`href="${footer.preferencesUrl}"`));
  }
}

async function checkSsr() {
  const rendererPath = join(workspace, "dist/ssr/ssr-renderer.js");
  const { renderDmsPage } = await import(pathToFileURL(rendererPath));
  const serverFetch = async (path) => {
    assert.equal(path, "/api/onboarding/informations");
    return { hasAdmin: true };
  };
  const result = await renderDmsPage(ssrPage, serverFetch);
  assert.equal(result.error, undefined);
  assert.equal(result.redirect, "/onboarding");
}

console.log(`Frontend check workspace: ${workspace}`);
prepareWorkspace();
run(["install", "--ignore-scripts", "--no-frozen-lockfile"]);
run(["build"]);
run(["typecheck"]);
await checkEmail();
await checkSsr();
console.log("Local DMS + Vue adapter: client, SSR, email and typecheck passed");
if (!process.env.KEEP_FRONTEND_CHECK)
  rmSync(workspace, { recursive: true, force: true });

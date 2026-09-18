import { defineConfig } from "@antelopejs/interface-core/config";
import { SHARED_MODULE_SOURCES } from "../src/antelope-modules";

export default defineConfig({
  name: "playground",
  modules: {
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
      },
    },
    "dms-mailing": {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
      },
      config: {},
    },
    dms: {
      source: SHARED_MODULE_SOURCES.dms,
      config: {
        homepage: "/modules/mailing/overview",
        meta: {
          title: "AntelopeJS Mailing",
          description: "AntelopeJS DMS mailing playground",
        },
      },
    },
    "dms-automation": {
      source: {
        type: "package",
        package: "@antelopejs/dms-automation",
        version: ">=0.0.1 <1.0.0",
      },
      config: {},
    },
    mongodb: {
      source: SHARED_MODULE_SOURCES.mongodb,
      config: {
        url: "mongodb://localhost:27017",
        database: "playground_dms_mailing",
      },
    },
    "auth-jwt": {
      source: SHARED_MODULE_SOURCES["auth-jwt"],
      config: {
        secret: "dev",
      },
    },
    "file-storage-local": {
      source: SHARED_MODULE_SOURCES["file-storage-local"],
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "http://127.0.0.1:5010",
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: SHARED_MODULE_SOURCES.nodemailer,
      config: {
        ethereal: true,
      },
    },
    api: {
      source: SHARED_MODULE_SOURCES.api,
      config: {
        servers: [
          {
            protocol: "http",
            port: "5010",
          },
        ],
      },
    },
  },
});

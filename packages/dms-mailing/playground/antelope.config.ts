import { defineConfig } from "@antelopejs/interface-core/config";
import { SHARED_MODULE_SOURCES } from "../src/antelope-modules";

const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;
// The dev frontend is a separate CLI process, not a module: it publishes no
// config variable, so its port stays written here, once.
const dmsClientPort = 3001;

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
        auth: {
          jwtSecret: "dev",
        },
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
        version: ">=0.1.5 <1.0.0",
      },
      config: {},
    },
    mongodb: {
      source: SHARED_MODULE_SOURCES.mongodb,
      config: {
        url: process.env.MONGO_URL ?? "mongodb://localhost:27017",
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
        // The origin the api actually serves, which moves off the preferred
        // port when it is taken: minted asset URLs reach the browser.
        baseUrl: "${@api.API_PUBLIC_BASE_URL}",
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
            // The preferred port: the api publishes the one it reserved.
            port: "5010",
          },
        ],
        cors: {
          allowedOrigins: [
            `http://localhost:${dmsClientPort}`,
            `http://127.0.0.1:${dmsClientPort}`,
            /^https:\/\/[^/]+\.onamp\.dev$/,
            ...(dmsClientUrl ? [dmsClientUrl] : []),
          ],
        },
      },
    },
  },
});

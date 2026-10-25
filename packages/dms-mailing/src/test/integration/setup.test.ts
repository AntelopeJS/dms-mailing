import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { MongoClient, MongoServerError } from "mongodb";
import { MAILING_TEMPLATES_TABLE_NAME } from "../../db/tables/templates.table";
import { createClient } from "../helpers/http";

const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const HTTP_OK = 200;
const NAMESPACE_NOT_FOUND = 26;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForUniqueSlugIndex(): Promise<void> {
  const mongo = await MongoClient.connect(process.env.TEST_MONGO_URL!);
  try {
    const templates = mongo
      .db(process.env.TEST_MONGO_DATABASE)
      .collection(`${TENANT_SCHEMA_NAME}__${MAILING_TEMPLATES_TABLE_NAME}`);
    await waitFor("the unique slug index of the templates", async () => {
      try {
        const indexes = await templates.indexes();
        return indexes.some((index) => index.unique && "slug" in index.key);
      } catch (error) {
        if (
          error instanceof MongoServerError &&
          error.code === NAMESPACE_NOT_FOUND
        )
          return false;
        throw error;
      }
    });
  } finally {
    await mongo.close();
  }
}

before(async function () {
  this.timeout(READY_TIMEOUT_MS + 5_000);

  const client = createClient();
  await Promise.all([
    waitFor("the DMS runtime to accept onboarding calls", async () => {
      try {
        const response = await client.get("/api/onboarding/informations");
        return response.status === HTTP_OK;
      } catch {
        return false;
      }
    }),
    waitForUniqueSlugIndex(),
  ]);
});

import type { Readable } from "node:stream";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { JsonValue } from "@antelopejs/interface-dms/base/types";
import type { TenantExportArchive } from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { z } from "zod";
import {
  contributeTenantExport,
  exportedCollections,
  jsonArrayChunks,
} from "../../hooks/tenant-export";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText } from "../helpers/checked";

const HTTP_OK = 200;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES_ENTRY = "templates.json";
const SETTINGS_ENTRY = "settings.json";
const TEMPLATE_VERSIONS_ENTRY = "template-versions.json";
const SUPPRESSIONS_ENTRY = "suppressions.json";
const EXPORTED_SLUG = "exported-template";
const SINGLE_ROW_PAGE = 1;
const LIST_ALL = 100;

const slugRowsSchema = z.array(z.object({ slug: z.string() }));

class CollectingArchive implements TenantExportArchive {
  readonly entries = new Map<string, string>();

  addJson(path: string, data: JsonValue): Promise<void> {
    this.entries.set(path, JSON.stringify(data));
    return Promise.resolve();
  }

  addFile(path: string): Promise<void> {
    return Promise.reject(new Error(`Unexpected file entry "${path}"`));
  }

  async addStream(path: string, stream: Readable): Promise<void> {
    let text = "";
    for await (const chunk of stream) text += String(chunk);
    this.entries.set(path, text);
  }
}

function slugsOf(json: string): string[] {
  return slugRowsSchema.parse(JSON.parse(json)).map((row) => row.slug);
}

describe("[integration] tenant export", () => {
  it("streams the mailing data into the archive instead of one blob", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: EXPORTED_SLUG,
      name: "Exported template",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);

    const archive = new CollectingArchive();
    const contribution = await contributeTenantExport(
      DEFAULT_TENANT_ID,
      archive,
      new AbortController().signal,
    );

    expect(contribution).to.equal(undefined);
    expect([...archive.entries.keys()]).to.have.members([
      TEMPLATES_ENTRY,
      TEMPLATE_VERSIONS_ENTRY,
      SUPPRESSIONS_ENTRY,
      SETTINGS_ENTRY,
    ]);
    expect(
      slugsOf(checkedText.parse(archive.entries.get(TEMPLATES_ENTRY))),
    ).to.include(EXPORTED_SLUG);
    expect(archive.entries.get(SETTINGS_ENTRY)).to.not.contain("webhookSecret");
  });

  it("stops contributing when the export is aborted", async () => {
    const archive = new CollectingArchive();
    const controller = new AbortController();
    controller.abort();

    let aborted = false;
    try {
      await contributeTenantExport(
        DEFAULT_TENANT_ID,
        archive,
        controller.signal,
      );
    } catch {
      aborted = true;
    }

    expect(aborted).to.equal(true);
    expect(archive.entries.size).to.equal(0);
  });

  it("pages the reads without skipping or repeating a row", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    /**
     * The list answers 10 rows unless told otherwise; the export reads them
     * all.
     */
    const list = await client.get(`${TABLE}/list?limit=${LIST_ALL}`);
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
    const slugs = slugRowsSchema
      .parse(list.data.results)
      .map((template) => template.slug);
    const [templates] = exportedCollections(DEFAULT_TENANT_ID);

    let text = "";
    for await (const chunk of jsonArrayChunks(
      templates.load,
      new AbortController().signal,
      SINGLE_ROW_PAGE,
    )) {
      text += chunk;
    }

    const paged = slugsOf(text);
    expect(paged).to.have.members(slugs);
    expect(new Set(paged).size).to.equal(paged.length);
  });
});

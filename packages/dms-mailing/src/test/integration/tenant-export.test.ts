import type { Readable } from "node:stream";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { TenantExportArchive } from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import {
  contributeTenantExport,
  type ExportedCollection,
  exportedCollections,
  jsonArrayChunks,
} from "../../hooks/tenant-export";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES_ENTRY = "templates.json";
const SETTINGS_ENTRY = "settings.json";
const EXPORTED_SLUG = "exported-template";
const SINGLE_ROW_PAGE = 1;
const LIST_ALL = 100;

interface TemplateRow {
  slug: string;
}

class CollectingArchive implements TenantExportArchive {
  readonly entries = new Map<string, string>();

  addJson(path: string, data: unknown): Promise<void> {
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

function parsed<T>(archive: CollectingArchive, entry: string): T {
  return JSON.parse(archive.entries.get(entry) as string) as T;
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
      SETTINGS_ENTRY,
    ]);
    const templates = parsed<TemplateRow[]>(archive, TEMPLATES_ENTRY);
    expect(templates.map((template) => template.slug)).to.include(
      EXPORTED_SLUG,
    );
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
    // The list answers 10 rows unless told otherwise; the export reads them all.
    const list = await client.get(`${TABLE}/list?limit=${LIST_ALL}`);
    expect(list.status, JSON.stringify(list.data)).to.equal(HTTP_OK);
    const slugs = (list.data.results as TemplateRow[]).map(
      (template) => template.slug,
    );
    const [templates] = exportedCollections(DEFAULT_TENANT_ID);

    let text = "";
    for await (const chunk of jsonArrayChunks(
      (templates as ExportedCollection).load,
      new AbortController().signal,
      SINGLE_ROW_PAGE,
    )) {
      text += chunk;
    }

    const paged = (JSON.parse(text) as TemplateRow[]).map(
      (template) => template.slug,
    );
    expect(paged).to.have.members(slugs);
    expect(new Set(paged).size).to.equal(paged.length);
  });
});

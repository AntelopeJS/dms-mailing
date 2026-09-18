import { GetRegisteredHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { MODULE_ID } from "../../constants";
import { registerTenantExport } from "../../hooks";
import {
  type ExportPageLoader,
  jsonArrayChunks,
} from "../../hooks/tenant-export";

const PAGE_SIZE = 3;
const EXTRA_ROW = 1;
const ROW_COUNT = PAGE_SIZE * 2 + EXTRA_ROW;

interface ExportedRow {
  index: number;
}

const ROWS: ExportedRow[] = Array.from(
  { length: ROW_COUNT },
  (_row, index) => ({ index }),
);

function pagedLoader(offsets: number[]): ExportPageLoader<ExportedRow> {
  return (offset, size) => {
    offsets.push(offset);
    return Promise.resolve(ROWS.slice(offset, offset + size));
  };
}

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

describe("[unit] hooks/tenant-export", () => {
  it("contributes to the tenant data export under the module id", () => {
    registerTenantExport();
    const moduleIds = GetRegisteredHooks(Hook.TENANT_DATA_EXPORT).map(
      (hook) => hook.moduleId,
    );
    expect(moduleIds).to.include(MODULE_ID);
  });

  it("streams a collection as one JSON array read page by page", async () => {
    const offsets: number[] = [];
    const signal = new AbortController().signal;

    const text = await collect(
      jsonArrayChunks(pagedLoader(offsets), signal, PAGE_SIZE),
    );

    expect(JSON.parse(text)).to.deep.equal(ROWS);
    expect(offsets).to.deep.equal([0, PAGE_SIZE, PAGE_SIZE * 2]);
  });

  it("streams an empty array when the collection has no row", async () => {
    const signal = new AbortController().signal;

    const text = await collect(
      jsonArrayChunks(() => Promise.resolve([]), signal, PAGE_SIZE),
    );

    expect(JSON.parse(text)).to.deep.equal([]);
  });

  it("stops streaming as soon as the export is aborted", async () => {
    const controller = new AbortController();
    const offsets: number[] = [];
    const chunks = jsonArrayChunks(
      pagedLoader(offsets),
      controller.signal,
      PAGE_SIZE,
    );
    await chunks.next();
    controller.abort();

    let aborted = false;
    try {
      await collect(chunks);
    } catch {
      aborted = true;
    }

    expect(aborted).to.equal(true);
    expect(offsets).to.deep.equal([]);
  });
});

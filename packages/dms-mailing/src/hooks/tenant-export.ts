import { Readable } from "node:stream";
import type { Table } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  Hook,
  type HookHandler,
  RegisterTenantDataExportContributor,
  type TenantExportArchive,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { MODULE_ID } from "../constants";
import {
  type MailingTemplate,
  SuppressionModel,
  TemplateModel,
  TemplateVersionModel,
} from "../db";
import { findSettings } from "../services/settings";
import type { MailingSettingsValues } from "../types";

export type ExportedSettings = Omit<MailingSettingsValues, "webhookSecret">;

export type ExportPageLoader<T> = (
  offset: number,
  size: number,
) => Promise<T[]>;

interface RowCodec<T> {
  fromDatabase(row: T): T | undefined;
}

export interface ExportedCollection {
  entry: string;
  load: ExportPageLoader<object>;
}

/** How many rows one archive entry reads at a time while it streams. */
export const TENANT_EXPORT_PAGE_SIZE = 200;

const TEMPLATES_ENTRY = "templates.json";
const TEMPLATE_VERSIONS_ENTRY = "template-versions.json";
const SETTINGS_ENTRY = "settings.json";
const SUPPRESSIONS_ENTRY = "suppressions.json";

const ARRAY_OPEN = "[";
const ARRAY_CLOSE = "]";
const ROW_SEPARATOR = ",";
const NO_SEPARATOR = "";
const FIRST_OFFSET = 0;

export async function* jsonArrayChunks<T>(
  load: ExportPageLoader<T>,
  signal: AbortSignal,
  pageSize: number = TENANT_EXPORT_PAGE_SIZE,
): AsyncGenerator<string> {
  yield ARRAY_OPEN;
  let offset = FIRST_OFFSET;
  let separator = NO_SEPARATOR;
  for (;;) {
    signal.throwIfAborted();
    const page = await load(offset, pageSize);
    for (const row of page) {
      yield `${separator}${JSON.stringify(row)}`;
      separator = ROW_SEPARATOR;
    }
    if (page.length < pageSize) break;
    offset += page.length;
  }
  yield ARRAY_CLOSE;
}

async function exportedSettings(
  tenantId: string,
): Promise<ExportedSettings | null> {
  const settings = await findSettings(tenantId);
  if (!settings) return null;
  return {
    fallbackLocale: settings.fallbackLocale,
    logRetentionDays: settings.logRetentionDays,
    blockOnMissingVariables: settings.blockOnMissingVariables,
    senderName: settings.senderName,
    senderEmail: settings.senderEmail,
    replyTo: settings.replyTo,
    categories: settings.categories,
  };
}

async function loadPage<T extends object>(
  table: Table<T>,
  codec: RowCodec<T>,
  offset: number,
  size: number,
): Promise<T[]> {
  const rows = await table.slice(offset, size).run();
  return rows
    .map((row) => codec.fromDatabase(row))
    .filter((row): row is T => row !== undefined);
}

/** A template as exported: its name in every language. */
const templateCodec: RowCodec<MailingTemplate> = {
  fromDatabase: (row) =>
    TemplateModel.fromDatabase(row)?.localize("*", ["name"]),
};

export function exportedCollections(tenantId: string): ExportedCollection[] {
  const templates = GetModel(TemplateModel, tenantId);
  const versions = GetModel(TemplateVersionModel, tenantId);
  const suppressions = GetModel(SuppressionModel, tenantId);
  return [
    {
      entry: TEMPLATES_ENTRY,
      load: (offset, size) =>
        loadPage(templates.table, templateCodec, offset, size),
    },
    {
      entry: TEMPLATE_VERSIONS_ENTRY,
      load: (offset, size) =>
        loadPage(versions.table, TemplateVersionModel, offset, size),
    },
    {
      entry: SUPPRESSIONS_ENTRY,
      load: (offset, size) =>
        loadPage(suppressions.table, SuppressionModel, offset, size),
    },
  ];
}

export const contributeTenantExport: HookHandler<
  Hook.TENANT_DATA_EXPORT
> = async (tenantId, archive: TenantExportArchive, signal: AbortSignal) => {
  for (const collection of exportedCollections(tenantId)) {
    signal.throwIfAborted();
    await archive.addStream(
      collection.entry,
      Readable.from(jsonArrayChunks(collection.load, signal), {
        objectMode: false,
      }),
    );
  }
  signal.throwIfAborted();
  await archive.addJson(SETTINGS_ENTRY, await exportedSettings(tenantId));
};

export function registerTenantExport(): void {
  RegisterTenantDataExportContributor(MODULE_ID, contributeTenantExport);
}

export function unregisterTenantExport(): void {
  UnregisterHook(Hook.TENANT_DATA_EXPORT, contributeTenantExport);
}

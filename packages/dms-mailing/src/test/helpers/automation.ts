import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import type {
  ExecutionCtx,
  JsonValue,
  LogLevel,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import { type MailingSend, SendModel } from "../../db";
import { declaration, mailing } from "./declarations";

export interface LoggedEntry {
  level: LogLevel;
  message: string;
  value?: JsonValue;
}

/** A step context that keeps what the action logs. */
export interface RecordingCtx extends ExecutionCtx {
  logged: LoggedEntry[];
}

export function stepCtx(
  procedureId = "procedure-1",
  dryRun = false,
): RecordingCtx {
  const logged: LoggedEntry[] = [];
  return {
    procedureId,
    runId: `run-${randomUUID()}`,
    nodeId: "node-1",
    dryRun,
    logged,
    log(level, message, value) {
      logged.push({ level, message, value });
    },
  };
}

/** What an armed trigger received, and how to disarm it. */
export interface Capture<TPayload> {
  received: TPayload[];
  stop: () => Promise<void>;
}

/** Arms `trigger` with `config` and keeps every payload it emits. */
export async function capture<TConfig, TPayload extends JsonValue>(
  trigger: TriggerType<TConfig, TPayload>,
  config: TConfig,
): Promise<Capture<TPayload>> {
  const received: TPayload[] = [];
  const handle = await trigger.activate(config, (payload) => {
    received.push(payload);
  });
  return { received, stop: () => trigger.deactivate(handle) };
}

/** A workspace row of its own, for tests that check isolation. */
export async function newTenant(): Promise<string> {
  const tenantId = randomUUID();
  await GetModel(TenantModel).insert({ _id: tenantId, name: tenantId });
  return tenantId;
}

/** A template declared live as version 1 in a workspace, as a project ships it. */
export async function declareIn(
  slug: string,
  tenantId = DEFAULT_TENANT_ID,
  name: Record<string, string> = { en: `Declared ${slug}` },
) {
  const { DeclareTemplate } = await mailing();
  return DeclareTemplate(declaration(slug, { tenantId, name }));
}

/** What a promise rejected with; absent when it resolved. */
export async function failureOf(
  run: Promise<unknown>,
): Promise<Error | undefined> {
  return run.then(
    () => undefined,
    (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  );
}

/** A send row of a workspace's log; `fields` set what a test is about. */
export async function seedSend(
  tenantId: string,
  fields: Partial<MailingSend> & { createdAt?: Date } = {},
): Promise<string> {
  const { createdAt, ...rest } = fields;
  const sends = GetModel(SendModel, tenantId);
  const [id] = await sends.insertSend({
    templateId: "template",
    templateSlug: "seeded",
    locale: "en",
    requestedLocale: "en",
    templateVersion: 1,
    recipientEmail: "seeded@example.test",
    status: "delivered",
    stage: "delivered",
    latencyMs: 10,
    json_variables: "{}",
    opens: 0,
    clicks: 0,
    isTest: false,
    ...rest,
  });
  if (createdAt) await sends.table.get(id).update({ createdAt }).run();
  return id;
}

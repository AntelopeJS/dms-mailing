import { AsyncLocalStorage } from "node:async_hooks";

/** The procedure step whose write is running. */
export interface AutomationOrigin {
  procedureId: string;
  runId: string;
}

/**
 * Origin fields of an event a procedure's write caused. Absent on an event a
 * person, a provider, a cron or another module caused.
 */
export type AutomationOriginFields = {
  originProcedureId?: string;
  originRunId?: string;
};

const automationWrites = new AsyncLocalStorage<AutomationOrigin>();

/**
 * Runs a write an action makes, so the events it fires carry the procedure
 * that made it.
 */
export function runAsAutomation<T>(
  origin: AutomationOrigin,
  write: () => Promise<T>,
): Promise<T> {
  return automationWrites.run(
    { procedureId: origin.procedureId, runId: origin.runId },
    write,
  );
}

/** The origin fields of an event fired in this call chain. */
export function automationOriginFields(): AutomationOriginFields {
  const origin = automationWrites.getStore();
  if (!origin) return {};
  return { originProcedureId: origin.procedureId, originRunId: origin.runId };
}

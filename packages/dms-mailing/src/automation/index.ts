import { addressSuppressedTrigger } from "./address-suppressed-trigger";
import { addressUnsuppressedTrigger } from "./address-unsuppressed-trigger";
import { checkSuppressionsAction } from "./check-suppressions-action";
import { emailEventTrigger } from "./email-event-trigger";
import { clearTriggerSubscriptions } from "./emitter";
import { findSuppressionAction } from "./find-suppression-action";
import { getSendAction } from "./get-send-action";
import { getTemplateAction } from "./get-template-action";
import { listAttentionAction } from "./list-attention-action";
import { providerHealthAction } from "./provider-health-action";
import { AutomationRegistrationLifecycle } from "./registration-lifecycle";
import { renderTemplateAction } from "./render-template-action";
import { retentionPurgedTrigger } from "./retention-purged-trigger";
import { sendLogLinkData } from "./send-log-link-data";
import { sendStatsAction } from "./send-stats-action";
import { sendTemplateAction } from "./send-template-action";
import { suppressAddressAction } from "./suppress-address-action";
import { templatePerformanceAction } from "./template-performance-action";
import { templatePublishedTrigger } from "./template-published-trigger";
import { templateStatusChangedTrigger } from "./template-status-changed-trigger";
import { unsuppressAddressAction } from "./unsuppress-address-action";

export * from "./email-event-trigger";
export * from "./send-template-action";

const AUTOMATION_INTERFACE_PACKAGE = "@antelopejs/interface-dms-automation";

type AutomationInterface =
  typeof import("@antelopejs/interface-dms-automation");

interface ModuleLoadError extends Error {
  code?: string;
}

const TRIGGERS = [
  emailEventTrigger,
  addressSuppressedTrigger,
  addressUnsuppressedTrigger,
  templatePublishedTrigger,
  templateStatusChangedTrigger,
  retentionPurgedTrigger,
];

const ACTIONS = [
  sendTemplateAction,
  suppressAddressAction,
  unsuppressAddressAction,
  findSuppressionAction,
  getSendAction,
  checkSuppressionsAction,
  getTemplateAction,
  renderTemplateAction,
  sendStatsAction,
  templatePerformanceAction,
  providerHealthAction,
  listAttentionAction,
];

const DATA_NODES = [sendLogLinkData];

let automationInterfacePromise: Promise<AutomationInterface | undefined>;
const automationLifecycle = new AutomationRegistrationLifecycle();

function isMissingAutomationInterface(error: ModuleLoadError): boolean {
  const firstLine = error.message.split("\n", 1)[0] ?? "";
  return (
    ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(error.code ?? "") &&
    (firstLine === `Cannot find module '${AUTOMATION_INTERFACE_PACKAGE}'` ||
      firstLine.startsWith(
        `Cannot find package '${AUTOMATION_INTERFACE_PACKAGE}' imported from `,
      ))
  );
}

async function loadAutomationInterface(): Promise<
  AutomationInterface | undefined
> {
  try {
    return await import("@antelopejs/interface-dms-automation");
  } catch (error) {
    if (error instanceof Error && isMissingAutomationInterface(error))
      return undefined;
    throw error;
  }
}

function getAutomationInterface(): Promise<AutomationInterface | undefined> {
  automationInterfacePromise ??= loadAutomationInterface();
  return automationInterfacePromise;
}

function collectErrors(operations: (() => void)[]): unknown[] {
  const errors: unknown[] = [];
  for (const operation of operations) {
    try {
      operation();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function cleanupAutomationNodes(automation: AutomationInterface): unknown[] {
  return collectErrors([
    ...TRIGGERS.map((trigger) => () => {
      automation.UnregisterTriggerType(trigger.id);
    }),
    ...ACTIONS.map((action) => () => {
      automation.UnregisterActionType(action.id);
    }),
    ...DATA_NODES.map((node) => () => {
      automation.UnregisterDataNodeType(node.id);
    }),
    clearTriggerSubscriptions,
  ]);
}

/**
 * Declares the mailing automation node types when the optional automation
 * interface package is installed. Without a module implementing it, the
 * registrations are inert.
 */
export async function registerAutomationNodes(): Promise<void> {
  const automation = await getAutomationInterface();
  if (!automation || !automationLifecycle.beginRegistration()) return;
  try {
    for (const trigger of TRIGGERS) automation.RegisterTriggerType(trigger);
    for (const action of ACTIONS) automation.RegisterActionType(action);
    for (const node of DATA_NODES) automation.RegisterDataNodeType(node);
  } catch (error) {
    automationLifecycle.cleanup(() => cleanupAutomationNodes(automation));
    throw error;
  }
}

/** Withdraws the node types and drops every trigger subscription. */
export async function unregisterAutomationNodes(): Promise<void> {
  const automation = await getAutomationInterface();
  if (!automation || !automationLifecycle.isCleanupPending) {
    clearTriggerSubscriptions();
    return;
  }
  const errors = automationLifecycle.cleanup(() =>
    cleanupAutomationNodes(automation),
  );
  if (errors.length > 0)
    throw new AggregateError(
      errors,
      "Failed to unregister mailing automation nodes",
    );
}

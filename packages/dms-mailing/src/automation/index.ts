import {
  RegisterActionType,
  RegisterTriggerType,
  UnregisterActionType,
  UnregisterTriggerType,
} from "@antelopejs/interface-dms-automation";
import {
  clearEmailEventSubscriptions,
  emailEventTrigger,
} from "./email-event-trigger";
import { sendTemplateAction } from "./send-template-action";

export * from "./email-event-trigger";
export * from "./send-template-action";

const TRIGGERS = [emailEventTrigger];
const ACTIONS = [sendTemplateAction];

/**
 * Declares the mailing automation node types. The registrations are inert
 * no-ops when no module implements `@antelopejs/interface-dms-automation`,
 * so the module works with or without the automation module in the project.
 */
export function registerAutomationNodes(): void {
  for (const trigger of TRIGGERS) RegisterTriggerType(trigger);
  for (const action of ACTIONS) RegisterActionType(action);
}

export function unregisterAutomationNodes(): void {
  for (const trigger of TRIGGERS) UnregisterTriggerType(trigger.id);
  for (const action of ACTIONS) UnregisterActionType(action.id);
  clearEmailEventSubscriptions();
}

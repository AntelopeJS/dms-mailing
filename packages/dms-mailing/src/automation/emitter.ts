import { Logging } from "@antelopejs/interface-core/logging";
import type {
  JsonObject,
  JsonSchema,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import { admitAutomationEvent } from "./loop-guard";
import { automationOriginFields } from "./origin";

/** Settings every mailing trigger reads, besides its own filters. */
export interface TriggerSettings {
  /** Fires only for this workspace; empty fires for every workspace. */
  tenantId?: string;
  /** Also fires for changes a procedure's write made. */
  includeAutomationWrites?: boolean;
}

/** What every mailing trigger hands the graph: a workspace's event. */
export type TriggerPayload = JsonObject & { tenantId: string };

type PayloadFilter<TConfig, TPayload> = (
  config: Partial<TConfig>,
  payload: TPayload,
) => boolean;

interface Subscription<TConfig, TPayload> {
  config: Partial<TConfig>;
  emit: (payload: TPayload) => void;
}

const FIRST_SUBSCRIPTION_INDEX = 1;

const channels = new Set<{ clear(): void }>();

const isOriginated = (fields: JsonObject): boolean =>
  fields.originProcedureId !== undefined;

function acceptsWorkspace(
  config: TriggerSettings,
  payload: TriggerPayload,
): boolean {
  const tenantId = config.tenantId?.trim();
  return !tenantId || payload.tenantId === tenantId;
}

function acceptsOrigin(config: TriggerSettings, payload: JsonObject): boolean {
  return !isOriginated(payload) || config.includeAutomationWrites === true;
}

/**
 * The in-process fan-out of one trigger: every armed subscription of this
 * instance receives the events its settings accept. A subscriber that throws
 * is logged and the others still receive the event. The automation runtime
 * does not deduplicate: subscribers deduplicate on the payload's `deliveryId`.
 */
export class TriggerChannel<
  TConfig extends TriggerSettings,
  TPayload extends TriggerPayload,
> {
  private readonly subscriptions = new Map<
    string,
    Subscription<TConfig, TPayload>
  >();

  private nextIndex = FIRST_SUBSCRIPTION_INDEX;

  constructor(
    readonly id: string,
    private readonly accepts: PayloadFilter<TConfig, TPayload> = () => true,
  ) {
    channels.add(this);
  }

  subscribe(
    config: Partial<TConfig> | undefined,
    emit: (payload: TPayload) => void,
  ): string {
    const handle = `${this.id}:${this.nextIndex}`;
    this.nextIndex += 1;
    this.subscriptions.set(handle, { config: config ?? {}, emit });
    return handle;
  }

  unsubscribe(handle: string): void {
    this.subscriptions.delete(handle);
  }

  emit(payload: TPayload): void {
    for (const [handle, subscription] of this.subscriptions) {
      if (this.isAccepted(subscription.config, payload))
        this.deliver(handle, subscription, payload);
    }
  }

  /**
   * Emits an event a procedure's write may have caused: it then carries the
   * procedure and its run, and passes the circuit breaker on `subject` first.
   */
  emitOriginated(subject: string, payload: TPayload): void {
    this.emitAttributed(subject, { ...payload, ...automationOriginFields() });
  }

  /**
   * Emits an event whose payload already names the procedure that caused it,
   * if any: an attributed event passes the circuit breaker on `subject` first.
   */
  emitAttributed(subject: string, payload: TPayload): void {
    if (isOriginated(payload) && !admitAutomationEvent(this.id, subject))
      return;
    this.emit(payload);
  }

  clear(): void {
    this.subscriptions.clear();
  }

  private isAccepted(config: Partial<TConfig>, payload: TPayload): boolean {
    return (
      acceptsWorkspace(config, payload) &&
      acceptsOrigin(config, payload) &&
      this.accepts(config, payload)
    );
  }

  private deliver(
    handle: string,
    subscription: Subscription<TConfig, TPayload>,
    payload: TPayload,
  ): void {
    try {
      subscription.emit(payload);
    } catch (error) {
      Logging.Warn(
        `[dms-mailing] Automation subscription "${handle}" failed on a "${this.id}" event:`,
        error,
      );
    }
  }
}

/**
 * Builds and fires an event after the change it tells of was stored: a
 * failure here is logged and never fails the change, which already applied.
 */
export function announce(event: string, fire: () => void): void {
  try {
    fire();
  } catch (error) {
    Logging.Warn(
      `[dms-mailing] Could not fire "${event}" after its change was stored:`,
      error,
    );
  }
}

/** Drops every subscription of every trigger, so a restarted module starts from nothing. */
export function clearTriggerSubscriptions(): void {
  for (const channel of channels) channel.clear();
}

/** A trigger's texts, its cluster semantics and its own settings and outputs. */
export interface TriggerSpec {
  name: string;
  description: string;
  icon: string;
  configProperties: Record<string, JsonSchema>;
  outputProperties: Record<string, JsonSchema>;
  /** The event may come from a procedure's write: `includeAutomationWrites` and origin outputs. */
  automationWrites?: boolean;
}

const TENANT_CONFIG_PROPERTY: JsonSchema = {
  type: "string",
  maxLength: 128,
  description:
    "Workspace id the trigger fires for. Leave empty to fire for every workspace.",
};

const AUTOMATION_WRITES_CONFIG = {
  includeAutomationWrites: {
    type: "boolean",
    default: false,
    description:
      "Also fire for changes a procedure made. Off by default, so a procedure does not answer its own writes.",
  },
} satisfies Record<string, JsonSchema>;

const ORIGIN_OUTPUTS = {
  originProcedureId: {
    type: "string",
    description: "Procedure whose write caused the event; absent otherwise",
  },
  originRunId: {
    type: "string",
    description: "Run of that procedure; absent otherwise",
  },
} satisfies Record<string, JsonSchema>;

/**
 * The trigger type of a channel. Every mailing trigger arms on every instance
 * (`replicated`): it fires on the instance that made the change, which is
 * not necessarily the automation leader.
 */
export function channelTrigger<
  TConfig extends TriggerSettings,
  TPayload extends TriggerPayload,
>(
  channel: TriggerChannel<TConfig, TPayload>,
  spec: TriggerSpec,
): TriggerType<TConfig, TPayload> {
  const configProperties = {
    tenantId: TENANT_CONFIG_PROPERTY,
    ...spec.configProperties,
  };
  const outputProperties = { ...spec.outputProperties };
  if (spec.automationWrites) {
    Object.assign(configProperties, AUTOMATION_WRITES_CONFIG);
    Object.assign(outputProperties, ORIGIN_OUTPUTS);
  }
  return {
    id: channel.id,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    cluster: "replicated",
    configSchema: { type: "object", properties: configProperties },
    outputSchema: { type: "object", properties: outputProperties },
    activate(config, emit) {
      return Promise.resolve(channel.subscribe(config, emit));
    },
    deactivate(handle) {
      channel.unsubscribe(String(handle));
      return Promise.resolve();
    },
  };
}

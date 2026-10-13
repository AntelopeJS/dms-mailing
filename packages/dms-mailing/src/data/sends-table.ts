import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import {
  Column,
  Exported,
  Searchable,
  Select,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type CellSubline,
  DefaultDisplays,
} from "@antelopejs/interface-dms/base/table-view";
import { TABLES_BASE_PATH } from "../constants";
import {
  MailingSend,
  normalizeAddress,
  SendModel,
  SuppressionModel,
} from "../db";
import {
  RESOLVED_STAGE,
  SEND_STAGES,
  SEND_STATUSES,
  type SendStage,
  type SendStatus,
} from "../types";
import { localeCode, localeFallbackSubline } from "./locale-fallback";
import { TemplatesTableAPI } from "./templates-table";
import { READ_ONLY_ROUTES } from "./read-only-routes";

const STATUS_ITEMS = SEND_STATUSES.map((value) => ({
  value,
  label: `$dms_mailing.sends.status.${value}`,
}));

/**
 * Column widths, in px, sized so the visible columns fit a 1440px window
 * without clipping: an address next to its "Resolved" or "Test" badge, a
 * provider error such as `connect ECONNREFUSED 127.0.0.1:2525` under the
 * status, the longest slugs. A phone scrolls the table sideways.
 */
const RECIPIENT_COLUMN_WIDTH = 278;
const STATUS_COLUMN_WIDTH = 250;
const TEMPLATE_COLUMN_WIDTH = 162;
const LOCALE_COLUMN_WIDTH = 104;
const LATENCY_COLUMN_WIDTH = 128;
const SENT_AT_COLUMN_WIDTH = 126;

const PROBLEM_STAGE: SendStage = "problem";

const STAGE_ITEMS = SEND_STAGES.map((value) => ({
  value,
  label: `$dms_mailing.sends.views.${value}`,
}));

const STATUS_TONES = {
  queued: "neutral",
  sent: "info",
  delivered: "success",
  opened: "primary",
  clicked: "primary",
  bounced: "error",
  spam: "warning",
  failed: "error",
  unsubscribed: "warning",
  suppressed: "neutral",
} as const;

const TEST_BADGE = {
  field: "isTest",
  equals: true,
  label: "$dms_mailing.sends.test_badge",
  tone: "warning" as const,
};

const RESOLVED_BADGE = {
  field: "stage",
  equals: RESOLVED_STAGE,
  label: "$dms_mailing.sends.status.resolved",
  tone: "success" as const,
};

@RegisterDataController()
export class SendsTableAPI extends DataController(
  MailingSend,
  READ_ONLY_ROUTES,
  Controller(`${TABLES_BASE_PATH}/sends`),
) {
  @ModelReference()
  @TenantScopedModel(SendModel)
  declare model: SendModel;

  @TenantScopedModel(SuppressionModel)
  declare suppressions: SuppressionModel;

  @Select()
  @Listable()
  @Exported()
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.id",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
    display: new DefaultDisplays.MonoDisplay({}),
  })
  declare _id: string;

  @Listable()
  @Exported()
  @Searchable()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.recipient",
    type: new DefaultDataTypes.EmailType({}),
    size: RECIPIENT_COLUMN_WIDTH,
    display: new DefaultDisplays.IdentityDisplay({
      subtitleField: "recipientName",
      badges: [TEST_BADGE, RESOLVED_BADGE],
    }),
  })
  declare recipientEmail: string;

  @Listable()
  @Exported()
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.recipientName",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
  })
  declare recipientName: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.status",
    type: new DefaultDataTypes.SelectType({ items: STATUS_ITEMS }),
    size: STATUS_COLUMN_WIDTH,
    filterable: true,
    display: new DefaultDisplays.StatusPillDisplay({
      tones: STATUS_TONES,
      subField: "error",
      liveValues: ["queued"],
    }),
  })
  declare status: SendStatus;

  /**
   * A relation used as a filter only: the "Template" quick filter lists the
   * templates by name, the cell keeps the slug the send was made with.
   */
  @Listable()
  @Exported()
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.templateSlug",
    type: new DefaultDataTypes.RelationType({
      dataApiController: TemplatesTableAPI,
      keyMapping: { label: "name", value: "slug" },
      filterOnly: true,
    }),
    filterable: true,
    size: TEMPLATE_COLUMN_WIDTH,
    display: new DefaultDisplays.MonoDisplay({}),
  })
  declare templateSlug: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.stage",
    type: new DefaultDataTypes.SelectType({ items: STAGE_ITEMS }),
    filterable: true,
    isVisible: false,
  })
  declare stage: SendStage;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.locale",
    type: new DefaultDataTypes.StringType({}),
    size: LOCALE_COLUMN_WIDTH,
    display: new DefaultDisplays.TwoLineDisplay({
      primaryField: "localeLabel",
      subField: "localeFallback",
      subTone: "warning",
    }),
  })
  declare locale: string;

  @Listable(["locale"])
  @Access(AccessMode.ReadOnly)
  get localeLabel(): string {
    return localeCode(this.locale);
  }

  @Listable(["locale", "requestedLocale"])
  @Access(AccessMode.ReadOnly)
  get localeFallback(): CellSubline | null {
    return localeFallbackSubline(this.locale, this.requestedLocale);
  }

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.requestedLocale",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
  })
  declare requestedLocale: string;

  /**
   * Hidden by default: the side panel shows it under "Origin", and the room
   * goes to the recipient and the provider's error.
   */
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.source",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
    display: new DefaultDisplays.MonoDisplay({}),
  })
  declare source: string;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.latencyMs",
    type: new DefaultDataTypes.NumberType({}),
    size: LATENCY_COLUMN_WIDTH,
    display: new DefaultDisplays.DurationDisplay({ unit: "ms" }),
  })
  declare latencyMs: number | null;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.createdAt",
    type: new DefaultDataTypes.DateType({}),
    size: SENT_AT_COLUMN_WIDTH,
    display: new DefaultDisplays.RelativeDateDisplay({ style: "relative" }),
  })
  declare createdAt: Date;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.templateVersion",
    type: new DefaultDataTypes.NumberType({}),
    isVisible: false,
  })
  declare templateVersion: number;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.isTest",
    type: new DefaultDataTypes.BooleanType({}),
    filterable: true,
    isVisible: false,
  })
  declare isTest: boolean;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.error",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
  })
  declare error: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare isSoftBounce: boolean;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare replayOf: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare replayedBy: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare resolvedAt: Date;

  /**
   * Whether the recipient is on the suppression list: "Send again…" would not
   * leave, so the row offers the list instead. Read for problems only, the
   * only rows either action is offered on.
   */
  @Listable(["recipientEmail", "stage"])
  @Access(AccessMode.ReadOnly)
  get isRecipientSuppressed(): Promise<boolean> | boolean {
    if (this.stage !== PROBLEM_STAGE || !this.suppressions) return false;
    return this.suppressions
      .findByEmail(this.recipientEmail)
      .then((row) => Boolean(row));
  }

  /** The address as the suppression list filters on it. */
  @Listable(["recipientEmail"])
  @Access(AccessMode.ReadOnly)
  get suppressionAddress(): string {
    return normalizeAddress(this.recipientEmail ?? "");
  }
}

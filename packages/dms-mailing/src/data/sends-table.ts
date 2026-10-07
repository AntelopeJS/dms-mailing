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
  TableViewRoutes,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultDisplays } from "@antelopejs/interface-dms/base/table-view";
import { TABLES_BASE_PATH } from "../constants";
import { MailingSend, SendModel } from "../db";
import {
  SEND_STAGES,
  SEND_STATUSES,
  type SendStage,
  type SendStatus,
} from "../types";
import { LocaleFallbackDisplay } from "./displays";

const STATUS_ITEMS = SEND_STATUSES.map((value) => ({
  value,
  label: `$dms_mailing.sends.status.${value}`,
}));

const RECIPIENT_COLUMN_WIDTH = 280;
const STATUS_COLUMN_WIDTH = 220;
const NARROW_COLUMN_WIDTH = 120;

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
} as const;

const TEST_BADGE = {
  field: "isTest",
  equals: true,
  label: "$dms_mailing.sends.test_badge",
  tone: "warning" as const,
};

const readOnlyRoutes = {
  get: TableViewRoutes.Get,
  list: TableViewRoutes.List,
  count: TableViewRoutes.Count,
  countBatch: TableViewRoutes.CountBatch,
  select: TableViewRoutes.Select,
  ...TableViewRoutes.ExportRoutes,
};

@RegisterDataController()
export class SendsTableAPI extends DataController(
  MailingSend,
  readOnlyRoutes,
  Controller(`${TABLES_BASE_PATH}/sends`),
) {
  @ModelReference()
  @TenantScopedModel(SendModel)
  declare model: SendModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
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
      badges: [TEST_BADGE],
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
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.templateSlug",
    type: new DefaultDataTypes.StringType({}),
    filterable: true,
    display: new DefaultDisplays.MonoDisplay({}),
  })
  declare templateSlug: string;

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
    size: NARROW_COLUMN_WIDTH,
    display: new LocaleFallbackDisplay({ requestedField: "requestedLocale" }),
  })
  declare locale: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.requestedLocale",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
  })
  declare requestedLocale: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.source",
    type: new DefaultDataTypes.StringType({}),
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
    size: NARROW_COLUMN_WIDTH,
    display: new DefaultDisplays.DurationDisplay({ unit: "ms" }),
  })
  declare latencyMs: number;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.createdAt",
    type: new DefaultDataTypes.DateType({}),
    display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
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
}

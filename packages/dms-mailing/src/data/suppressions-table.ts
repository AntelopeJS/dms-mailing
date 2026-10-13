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
import { DefaultDisplays } from "@antelopejs/interface-dms/base/table-view";
import { TABLES_BASE_PATH } from "../constants";
import { MailingSuppression, SuppressionModel } from "../db";
import { SUPPRESSION_REASONS, type SuppressionReason } from "../types";
import { READ_ONLY_ROUTES } from "./read-only-routes";

const REASON_ITEMS = SUPPRESSION_REASONS.map((value) => ({
  value,
  label: `$dms_mailing.suppressions.reasons.${value}`,
}));

const REASON_TONES = {
  hard_bounce: "error",
  complaint: "warning",
  unsubscribe: "warning",
  manual: "neutral",
} as const satisfies Record<SuppressionReason, string>;

const EMAIL_COLUMN_WIDTH = 280;
const REASON_COLUMN_WIDTH = 200;

/**
 * The suppression list, read-only here: an address goes on the list and comes
 * off it through `/api/mailing/suppressions`, which normalizes it and records
 * who did it.
 */
@RegisterDataController()
export class SuppressionsTableAPI extends DataController(
  MailingSuppression,
  READ_ONLY_ROUTES,
  Controller(`${TABLES_BASE_PATH}/suppressions`),
) {
  @ModelReference()
  @TenantScopedModel(SuppressionModel)
  declare model: SuppressionModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Exported()
  @Searchable()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.suppressions.cols.email",
    type: new DefaultDataTypes.EmailType({}),
    size: EMAIL_COLUMN_WIDTH,
    filterable: true,
    display: new DefaultDisplays.MonoDisplay({}),
  })
  declare email: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.suppressions.cols.reason",
    type: new DefaultDataTypes.SelectType({ items: REASON_ITEMS }),
    size: REASON_COLUMN_WIDTH,
    filterable: true,
    display: new DefaultDisplays.StatusPillDisplay({
      tones: REASON_TONES,
      subField: "detail",
    }),
  })
  declare reason: SuppressionReason;

  @Listable()
  @Exported()
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.suppressions.cols.detail",
    type: new DefaultDataTypes.StringType({}),
    isVisible: false,
  })
  declare detail: string;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.suppressions.cols.createdAt",
    type: new DefaultDataTypes.DateType({}),
    display: new DefaultDisplays.RelativeDateDisplay({ style: "relative" }),
  })
  declare createdAt: Date;

  /**
   * Hidden: a raw id says nothing on screen. The row's "See the send" opens
   * it, and the export keeps it.
   */
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.suppressions.cols.sendId",
    type: new DefaultDataTypes.StringType({}),
    display: new DefaultDisplays.MonoDisplay({}),
    isVisible: false,
  })
  declare sendId: string;
}

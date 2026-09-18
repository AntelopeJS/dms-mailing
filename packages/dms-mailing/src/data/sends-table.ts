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
import { TABLES_BASE_PATH } from "../constants";
import { MailingSend, SendModel } from "../db";
import { SEND_STATUSES, type SendStatus } from "../types";

const STATUS_ITEMS = SEND_STATUSES.map((value) => ({
  value,
  label: `$dms_mailing.sends.status.${value}`,
}));

const readOnlyRoutes = {
  get: TableViewRoutes.Get,
  list: TableViewRoutes.List,
  count: TableViewRoutes.Count,
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
    name: "$dms_mailing.sends.cols.recipientEmail",
    type: new DefaultDataTypes.EmailType({}),
  })
  declare recipientEmail: string;

  @Listable()
  @Exported()
  @Searchable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.recipientName",
    type: new DefaultDataTypes.StringType({}),
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
  })
  declare templateSlug: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.status",
    type: new DefaultDataTypes.SelectType({ items: STATUS_ITEMS }),
    filterable: true,
  })
  declare status: SendStatus;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.locale",
    type: new DefaultDataTypes.StringType({}),
  })
  declare locale: string;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.latencyMs",
    type: new DefaultDataTypes.NumberType({}),
  })
  declare latencyMs: number;

  @Listable()
  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.createdAt",
    type: new DefaultDataTypes.DateType({}),
  })
  declare createdAt: Date;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.source",
    type: new DefaultDataTypes.StringType({}),
  })
  declare source: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  @Column({
    name: "$dms_mailing.sends.cols.isTest",
    type: new DefaultDataTypes.BooleanType({}),
    filterable: true,
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

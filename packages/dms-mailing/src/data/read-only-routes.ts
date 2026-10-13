import { TableViewRoutes } from "@antelopejs/interface-dms/base";

/**
 * The routes of a table the module writes through its own routes: reading,
 * counting and exporting only.
 */
export const READ_ONLY_ROUTES = {
  get: TableViewRoutes.Get,
  list: TableViewRoutes.List,
  count: TableViewRoutes.Count,
  countBatch: TableViewRoutes.CountBatch,
  select: TableViewRoutes.Select,
  ...TableViewRoutes.ExportRoutes,
};

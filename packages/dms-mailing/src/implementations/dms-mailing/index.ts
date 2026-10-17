import { afterDatabaseReady } from "../../hooks/database-ready";
import {
  declareTemplate,
  declareTemplateCategory,
} from "../../services/declarations";
import { importSends } from "../../services/send-import";
import { declareSender } from "../../services/sender-declaration";

export { recordEmailEvent as RecordEmailEvent } from "../../services/events";
export { sendUnlessSuppressed as SendTemplate } from "../../services/checked-send";

/*
 * Projects call these from their `start()`, which runs in parallel with the
 * DMS's: they wait for the database the DMS opens there rather than fail.
 */
export const DeclareTemplate = afterDatabaseReady(declareTemplate);
export const DeclareTemplateCategory = afterDatabaseReady(
  declareTemplateCategory,
);
export const DeclareSender = afterDatabaseReady(declareSender);
export const ImportSends = afterDatabaseReady(importSends);

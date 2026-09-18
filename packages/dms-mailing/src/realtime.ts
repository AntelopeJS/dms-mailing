import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import {
  PublishMessage,
  RegisterPageTopic,
} from "@antelopejs/interface-dms/realtime";
import { MAILING_SENDS_TOPIC, TABLES_BASE_PATH } from "./constants";
import { OverviewPageController } from "./pages/overview";
import { SendsPageController } from "./pages/sends";

const SENDS_ROW_TOPIC = `tableview:row:${TABLES_BASE_PATH}/sends`;
const SEND_CREATED_TYPE = "created";
const SEND_UPDATED_TYPE = "updated";

const TOPIC_PAGES: ControllerClass[] = [
  SendsPageController,
  OverviewPageController,
];

export function realtimePageIds(): string[] {
  return TOPIC_PAGES.map(
    (page) => GetMetadata(page, PageMetadata).pageInfo?.fullId ?? "",
  ).filter((fullId) => fullId.length > 0);
}

export function registerRealtimeTopics(): void {
  for (const pageId of realtimePageIds()) {
    RegisterPageTopic(pageId, MAILING_SENDS_TOPIC);
  }
}

function publishSendChange(type: string, sendId: string): void {
  const payload = { ids: [sendId] };
  void Promise.all([
    PublishMessage(SENDS_ROW_TOPIC, type, { payload }),
    PublishMessage(MAILING_SENDS_TOPIC, type, { payload }),
  ]).catch((error: unknown) => {
    Logging.Error(
      `[dms-mailing] Failed to publish "${type}" for send "${sendId}":`,
      error,
    );
  });
}

export function publishSendCreated(sendId: string): void {
  publishSendChange(SEND_CREATED_TYPE, sendId);
}

export function publishSendUpdated(sendId: string): void {
  publishSendChange(SEND_UPDATED_TYPE, sendId);
}

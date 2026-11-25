import type { DataNodeType } from "@antelopejs/interface-dms-automation";
import {
  SEND_LOG_VIEWS,
  type SendLogView,
  sendLogLink,
} from "../services/notify";

export type SendLogLinkInput = { sendId: string; view?: string };

export type SendLogLinkOutput = { link: string };

const SEND_LOG_LINK_DATA_ID = "mailing.send-log-link";

const MAX_SEND_ID_LENGTH = 64;

const isSendLogView = (value: string): value is SendLogView =>
  SEND_LOG_VIEWS.some((view) => view === value);

function viewOf(view: string | undefined): SendLogView {
  if (!view) return "all";
  if (isSendLogView(view)) return view;
  throw new Error(`${SEND_LOG_LINK_DATA_ID}: unknown view "${view}"`);
}

export const sendLogLinkData: DataNodeType<
  SendLogLinkInput,
  SendLogLinkOutput
> = {
  id: SEND_LOG_LINK_DATA_ID,
  category: "helper",
  name: "Send log link",
  description:
    "Dashboard link that opens one send in the mailing send log, for a notification or a message",
  icon: "i-ph-link",
  inputSchema: {
    type: "object",
    properties: {
      sendId: {
        type: "string",
        maxLength: MAX_SEND_ID_LENGTH,
        description: 'Send log id, e.g. from "E-mail event"',
      },
      view: {
        type: "string",
        enum: [...SEND_LOG_VIEWS],
        default: "all",
        description: "Send log tab to open",
      },
    },
    required: ["sendId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      link: {
        type: "string",
        description:
          "Dashboard-relative path to the send, e.g. for a notification's link",
      },
    },
  },
  evaluate(input) {
    return { link: sendLogLink(input.sendId, viewOf(input.view)) };
  },
};

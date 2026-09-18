import { Form } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { API_BASE_PATH } from "../../constants";
import { TemplateCategoriesType } from "../../data-types";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const RETENTION_STEP = 1;
const SETTINGS_URL = `${API_BASE_PATH}/settings`;

const label = (id: string): string => `$dms_mailing.settings.fields.${id}`;

export const mailingSettingsForm = Form({
  fields: [
    {
      id: "fallbackLocale",
      label: label("fallbackLocale"),
      type: new DefaultDataTypes.StringType({}),
      required: true,
    },
    {
      id: "logRetentionDays",
      label: label("logRetentionDays"),
      type: new DefaultDataTypes.NumberType({
        min: MIN_RETENTION_DAYS,
        max: MAX_RETENTION_DAYS,
        step: RETENTION_STEP,
      }),
      required: true,
    },
    {
      id: "blockOnMissingVariables",
      label: label("blockOnMissingVariables"),
      type: new DefaultDataTypes.BooleanType({}),
      required: true,
    },
    {
      id: "senderName",
      label: label("senderName"),
      type: new DefaultDataTypes.StringType({}),
    },
    {
      id: "senderEmail",
      label: label("senderEmail"),
      type: new DefaultDataTypes.EmailType({}),
    },
    {
      id: "replyTo",
      label: label("replyTo"),
      type: new DefaultDataTypes.EmailType({}),
    },
    {
      id: "categories",
      label: label("categories"),
      type: new TemplateCategoriesType(),
    },
    {
      id: "webhookSecret",
      label: label("webhookSecret"),
      type: new DefaultDataTypes.StringType({}),
    },
  ],
  fetchUrl: SETTINGS_URL,
  submitUrl: SETTINGS_URL,
  submitUrlMethod: HttpMethod.post,
});

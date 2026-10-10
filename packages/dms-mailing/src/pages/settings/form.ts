import { Form, type FormSection } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { API_BASE_PATH } from "../../constants";
import { TemplateCategoriesType } from "../../data-types";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const RETENTION_STEP = 1;
const SETTINGS_URL = `${API_BASE_PATH}/settings`;

const key = (path: string): string => `$dms_mailing.settings.${path}`;

const field = (id: string) => ({
  id,
  label: key(`fields.${id}.label`),
  description: key(`fields.${id}.description`),
});

const section = (
  id: string,
  icon: string,
  fields: FormSection["fields"],
): FormSection => ({
  id,
  label: key(`sections.${id}.title`),
  description: key(`sections.${id}.description`),
  icon,
  fields,
});

const sender = section("sender", "i-ph-at", [
  { ...field("senderName"), type: new DefaultDataTypes.StringType({}) },
  {
    ...field("senderEmail"),
    type: new DefaultDataTypes.EmailType({}),
    required: true,
  },
  { ...field("replyTo"), type: new DefaultDataTypes.EmailType({}) },
]);

const guards = section("guards", "i-ph-shield-check", [
  {
    ...field("missingVariables"),
    type: new DefaultDataTypes.SelectType({
      display: "cards",
      items: [
        {
          value: "refuse",
          label: key("fields.missingVariables.refuse"),
          description: key("fields.missingVariables.refuse_hint"),
          icon: "i-ph-prohibit",
        },
        {
          value: "send",
          label: key("fields.missingVariables.send"),
          description: key("fields.missingVariables.send_hint"),
          icon: "i-ph-paper-plane-tilt",
        },
      ],
    }),
    required: true,
  },
  {
    ...field("fallbackLocale"),
    type: new DefaultDataTypes.StringType({}),
    inputComponent: CustomComponent("MailingLocaleSelect").serializeSync(),
    required: true,
  },
]);

const provider = section("provider", "i-ph-plugs-connected", [
  {
    ...field("provider"),
    type: new DefaultDataTypes.StringType({}),
    readonly: true,
  },
  {
    ...field("webhookUrl"),
    type: new DefaultDataTypes.StringType({ copyable: true }),
  },
  {
    ...field("webhookSecret"),
    type: new DefaultDataTypes.SecretType({
      rotateUrl: `${SETTINGS_URL}/webhook-secret/rotate`,
    }),
    required: true,
  },
]);

const retention = section("retention", "i-ph-clock-counter-clockwise", [
  {
    ...field("logRetentionDays"),
    type: new DefaultDataTypes.NumberType({
      min: MIN_RETENTION_DAYS,
      max: MAX_RETENTION_DAYS,
      step: RETENTION_STEP,
    }),
    inputComponent: CustomComponent("MailingRetentionInput").serializeSync(),
    required: true,
  },
]);

const categories = section("categories", "i-ph-tag", [
  { ...field("categories"), type: new TemplateCategoriesType() },
]);

export const mailingSettingsForm = Form({
  sections: [sender, guards, provider, retention, categories],
  sectionNav: "side",
  fieldsOrientation: "horizontal",
  saveMode: "bar",
  fetchUrl: SETTINGS_URL,
  submitUrl: SETTINGS_URL,
  submitUrlMethod: HttpMethod.post,
  successMessage: key("saved"),
}).meta({
  name: "$dms_mailing.permissions.settings_form.name",
  description: "$dms_mailing.permissions.settings_form.description",
  icon: "i-ph-gear-six",
});

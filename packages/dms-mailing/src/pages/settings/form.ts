import { Form, type FormSection } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import type { DataType } from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { z } from "zod";
import { API_BASE_PATH } from "../../constants";
import { TemplateCategoriesType } from "../../data-types";
import { missingVariablesPolicy } from "../../services/settings";
import { MODULE_DEFAULT_SETTINGS } from "../../types";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MIN_WEBHOOK_SECRET_LENGTH,
  WEBHOOK_SECRET_TOO_SHORT,
} from "../../validation/settings.schema";

const RETENTION_STEP = 1;
const SETTINGS_URL = `${API_BASE_PATH}/settings`;
const EMAIL_INPUT_COMPONENT = "dms-input-email";

/** An address input that drops the spaces a paste brings along. */
const trimmedEmailInput = () =>
  new ComponentBuilder(EMAIL_INPUT_COMPONENT)
    .options({ modelModifiers: { trim: true } })
    .serializeSync();

/** `type`, checked in the browser with `validation` instead of its own. */
function checkedWith<T extends DataType>(type: T, validation: z.ZodType): T {
  return Object.assign(type, { getValidation: () => validation });
}

const key = (path: string): string => `$dms_mailing.settings.${path}`;

const field = (id: string) => ({
  id,
  label: key(`fields.${id}.label`),
  description: key(`fields.${id}.description`),
});

/**
 * A field holding a module default offers it: "Module default · Use default"
 * while it holds something else. The retention does not: one click there
 * could shorten it, and lowering it deletes sends, which its input asks to
 * confirm instead. Nor do the categories: putting the default list back
 * would move every template of a custom category.
 */
const moduleDefault = (defaultValue: string) => ({
  defaultValue,
  offersDefault: true,
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
    inputComponent: trimmedEmailInput(),
  },
  {
    ...field("replyTo"),
    type: new DefaultDataTypes.EmailType({}),
    inputComponent: trimmedEmailInput(),
  },
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
    ...moduleDefault(missingVariablesPolicy(MODULE_DEFAULT_SETTINGS)),
  },
  {
    ...field("fallbackLocale"),
    type: new DefaultDataTypes.StringType({}),
    inputComponent: CustomComponent("MailingLocaleSelect").serializeSync(),
    required: true,
    ...moduleDefault(MODULE_DEFAULT_SETTINGS.fallbackLocale),
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
    type: checkedWith(
      new DefaultDataTypes.SecretType({
        rotateUrl: `${SETTINGS_URL}/webhook-secret/rotate`,
      }),
      z.string().min(MIN_WEBHOOK_SECRET_LENGTH, WEBHOOK_SECRET_TOO_SHORT),
    ),
    required: true,
  },
  {
    ...field("webhookStatus"),
    type: new DefaultDataTypes.StringType({}),
    /**
     * Reads its own route and never changes the form's value: it is shown,
     * never saved.
     */
    inputComponent: CustomComponent("MailingWebhookStatus").serializeSync(),
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
  submitUrlMethod: HttpMethod.put,
  successMessage: key("saved"),
}).meta({
  name: "$dms_mailing.permissions.settings_form.name",
  description: "$dms_mailing.permissions.settings_form.description",
  icon: "i-ph-gear-six",
});

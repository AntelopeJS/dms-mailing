import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { z } from "zod";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { NotificationData } from "@antelopejs/interface-dms/notifications";

const stamp = Date.now();
const EDITED_TEST_DATA = '{"edited":true}';
const SEND_TIMEOUT_MS = 1_500;
const POLL_INTERVAL_MS = 50;

const sentVariablesSchema = z.object({
  notification: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string(),
  }),
  preferencesUrl: z.string(),
});

interface TestUser {
  email?: string;
  isValidated?: boolean;
  isMember?: boolean;
}

async function models() {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { UserModel } = await import("@antelopejs/interface-dms/auth/db");
  const { TenantMemberModel } = await import("@antelopejs/interface-dms/db");
  const db = await import("../../db");
  return {
    users: GetModel(UserModel),
    members: GetModel(TenantMemberModel, DEFAULT_TENANT_ID),
    sends: GetModel(db.SendModel, DEFAULT_TENANT_ID),
    templates: GetModel(db.TemplateModel, DEFAULT_TENANT_ID),
    suppressions: GetModel(db.SuppressionModel, DEFAULT_TENANT_ID),
  };
}

async function createUser(user: TestUser = {}): Promise<{
  id: string;
  email: string;
}> {
  const { users, members } = await models();
  const email = user.email ?? `notified-${randomUUID()}@example.test`;
  const [id] = await users.insert({
    email,
    name: "Ana Notified",
    language: "fr-BE",
    isValidated: user.isValidated ?? true,
    owner: false,
  });
  if (user.isMember ?? true) {
    await members.insert({
      userId: id,
      roleIds: [],
      isTenantOwner: false,
      joinedAt: new Date(),
      invitedBy: null,
    });
  }
  return { id, email };
}

function notification(
  overrides: Partial<NotificationData> = {},
): NotificationData {
  return {
    icon: "i-ph-receipt",
    title: `Invoice ${stamp} is due`,
    description: "Pay <b>before</b> Friday",
    linkTo: "/invoices/42",
    tenantId: DEFAULT_TENANT_ID,
    subject: {
      id: "invoice",
      labelKey: "invoice",
      category: { id: "billing", labelKey: "billing", icon: "i-ph-receipt" },
      email: { defaultOn: true },
    },
    ...overrides,
  };
}

async function deliver(userId: string, data: NotificationData) {
  const { deliverNotificationEmail } =
    await import("../../services/notification-email");
  return deliverNotificationEmail(userId, data);
}

async function sendsTo(email: string) {
  const { sends } = await models();
  return sends.getBy("recipientEmail", email);
}

/** Leaves the shared workspace without the template the run added. */
async function removeNotificationTemplate(): Promise<void> {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const db = await import("../../db");
  const { refreshTemplateAttention } =
    await import("../../services/template-attention");
  const { templates } = await models();
  const template = await templates.getBySlug("dms-notification");
  if (template) {
    const versions = GetModel(db.TemplateVersionModel, DEFAULT_TENANT_ID);
    for (const version of await versions.listForTemplate(template._id))
      await versions.delete(version._id);
    await templates.delete(template._id);
  }
  await refreshTemplateAttention(DEFAULT_TENANT_ID);
}

describe("[integration] notification e-mail channel", () => {
  after(removeNotificationTemplate);

  it("mails a notification through the workspace's notification template", async () => {
    const user = await createUser();
    const outcome = await deliver(user.id, notification());
    expect(outcome).to.deep.equal({ outcome: "logged", status: "sent" });

    const rows = await sendsTo(user.email);
    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      templateSlug: "dms-notification",
      source: "dms-mailing:notification",
      locale: "en",
      recipientName: "Ana Notified",
    });
    const variables = sentVariablesSchema.parse(
      JSON.parse(rows[0].json_variables),
    );
    expect(variables.notification).to.deep.equal({
      title: `Invoice ${stamp} is due`,
      description: "Pay <b>before</b> Friday",
      url: "http://127.0.0.1:5019/invoices/42",
    });
    expect(variables.preferencesUrl).to.equal(
      "http://127.0.0.1:5019/settings/user/notifications",
    );

    const { templates } = await models();
    const template = await templates.getBySlug("dms-notification");
    expect(template).to.include({ status: "live" });
  });

  it("logs a suppressed address without sending to it or throwing", async () => {
    const user = await createUser();
    const { suppressions } = await models();
    await suppressions.add({ email: user.email, reason: "hard_bounce" });
    const outcome = await deliver(user.id, notification());
    expect(outcome).to.include({ outcome: "logged", status: "suppressed" });
    const rows = await sendsTo(user.email);
    expect(rows.map((row) => row.status)).to.deep.equal(["suppressed"]);
  });

  it("sends nothing for a notification that names no workspace", async () => {
    const user = await createUser();
    const outcome = await deliver(
      user.id,
      notification({ tenantId: undefined }),
    );
    expect(outcome).to.deep.equal({ outcome: "skipped", reason: "no_tenant" });
    expect(await sendsTo(user.email)).to.have.length(0);
  });

  it("sends nothing to a user who left the workspace", async () => {
    const user = await createUser({ isMember: false });
    const outcome = await deliver(user.id, notification());
    expect(outcome).to.deep.equal({
      outcome: "skipped",
      reason: "not_a_member",
    });
    expect(await sendsTo(user.email)).to.have.length(0);
  });

  it("sends nothing to an address the user never validated", async () => {
    const user = await createUser({ isValidated: false });
    const outcome = await deliver(user.id, notification());
    expect(outcome).to.deep.equal({
      outcome: "skipped",
      reason: "unverified_address",
    });
    expect(await sendsTo(user.email)).to.have.length(0);
  });

  it("sends nothing to an unknown user", async () => {
    const outcome = await deliver(randomUUID(), notification());
    expect(outcome).to.deep.equal({
      outcome: "skipped",
      reason: "unknown_user",
    });
  });

  it("sends nothing when the title is a key only the dashboard translates", async () => {
    const user = await createUser();
    const outcome = await deliver(
      user.id,
      notification({ title: "$shop.notifications.invoice_due" }),
    );
    expect(outcome).to.deep.equal({
      outcome: "skipped",
      reason: "untranslated_text",
    });
    expect(await sendsTo(user.email)).to.have.length(0);
  });

  it("keeps the template its owners edited", async () => {
    const { templates } = await models();
    const before = await templates.getBySlug("dms-notification");
    expect(before).not.to.equal(undefined);
    await templates.update(before?._id ?? "", {
      json_test_data: EDITED_TEST_DATA,
    });
    const user = await createUser();
    await deliver(user.id, notification());
    const after = await templates.getBySlug("dms-notification");
    expect(after?.json_test_data).to.equal(EDITED_TEST_DATA);
  });

  it("mails a notification the DMS sends to a user with e-mail on", async () => {
    const { NotificationCategory, NotificationSubject } =
      await import("@antelopejs/interface-dms/notifications");
    const { SendableNotification } =
      await import("@antelopejs/interface-dms/notifications/sendable");
    const data = notification({ title: `Order ${randomUUID()} shipped` });
    const { id: categoryId, ...category } = data.subject.category;
    NotificationCategory(categoryId, category);
    NotificationSubject(data.subject.id, data.subject);
    const user = await createUser();
    await new SendableNotification(data).toUser(user.id, {
      tenantId: DEFAULT_TENANT_ID,
    });
    const deadline = Date.now() + SEND_TIMEOUT_MS;
    let rows = await sendsTo(user.email);
    while (!rows.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      rows = await sendsTo(user.email);
    }
    expect(rows.map((row) => row.templateSlug)).to.deep.equal([
      "dms-notification",
    ]);
  });
});

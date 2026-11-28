import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SendEventModel, SendModel } from "../../db";
import { suppressAddress } from "../../services/suppressions";
import { declaration, mailing } from "../helpers/declarations";
import { capturedMail } from "../helpers/mail-store";

const stamp = Date.now();
const slug = `idempotent-${stamp}`;
const VARIABLES = { customer: { firstName: "Sofie" } };

/** How many messages the SMTP fixture received for an address. */
function mailsTo(address: string): number {
  return capturedMail().filter((message) =>
    message.to.some((to) => to.includes(address)),
  ).length;
}

async function eventsOf(sendId: string): Promise<number> {
  return (await GetModel(SendEventModel, DEFAULT_TENANT_ID).getBySend(sendId))
    .length;
}

describe("[integration] sends with an idempotency key", () => {
  before(async () => {
    const { DeclareTemplate } = await mailing();
    await DeclareTemplate(declaration(slug));
  });

  it("delivers once under a key and answers the first send to the second call, which a send without a claim would deliver twice", async () => {
    const { SendTemplate } = await mailing();
    const to = `once-${stamp}@example.test`;
    const idempotencyKey = `order-${stamp}:confirmed`;
    const send = () =>
      SendTemplate(slug, {
        tenantId: DEFAULT_TENANT_ID,
        to,
        variables: VARIABLES,
        idempotencyKey,
      });

    const first = await send();
    expect(first.status).to.equal("sent");
    const second = await send();
    expect(second).to.deep.include({
      sendId: first.sendId,
      status: "sent",
      messageId: first.messageId,
    });
    expect(mailsTo(to)).to.equal(1);

    const row = await GetModel(SendModel, DEFAULT_TENANT_ID).get(first.sendId);
    expect(row).to.deep.include({
      idempotencyKey,
      status: "sent",
      stage: "in_progress",
      recipientEmail: to,
    });
    expect(row?.providerMessageId).to.be.a("string");
    expect(row?.latencyMs).to.be.a("number");
    expect(await eventsOf(first.sendId)).to.equal(1);
  });

  it("delivers to the recipients the first call did not reach and keeps the others' outcome", async () => {
    const { SendTemplate } = await mailing();
    const reached = `reached-${stamp}@example.test`;
    const added = `added-${stamp}@example.test`;
    const idempotencyKey = `order-${stamp}:shipped`;
    const first = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: [reached],
      variables: VARIABLES,
      idempotencyKey,
    });
    const second = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: [reached, added],
      variables: VARIABLES,
      idempotencyKey,
    });

    const results = second.results ?? [];
    expect(results.map((result) => result.status)).to.deep.equal([
      "sent",
      "sent",
    ]);
    expect(results[0]?.sendId).to.equal(first.sendId);
    expect(results[1]?.sendId).to.not.equal(first.sendId);
    expect(mailsTo(reached)).to.equal(1);
    expect(mailsTo(added)).to.equal(1);
  });

  it("claims the recipient before the provider answers, so two calls at once under one key send once", async () => {
    const { SendTemplate } = await mailing();
    const to = `race-${stamp}@example.test`;
    const send = () =>
      SendTemplate(slug, {
        tenantId: DEFAULT_TENANT_ID,
        to,
        variables: VARIABLES,
        idempotencyKey: `order-${stamp}:raced`,
      });

    const [left, right] = await Promise.all([send(), send()]);
    expect(right.sendId).to.equal(left.sendId);
    expect([left.status, right.status]).to.include("sent");
    expect(mailsTo(to)).to.equal(1);
  });

  it("logs a suppressed recipient once under its key", async () => {
    const { SendTemplate } = await mailing();
    const to = `blocked-${stamp}@example.test`;
    await suppressAddress(DEFAULT_TENANT_ID, { email: to, reason: "manual" });
    const send = () =>
      SendTemplate(slug, {
        tenantId: DEFAULT_TENANT_ID,
        to,
        variables: VARIABLES,
        idempotencyKey: `order-${stamp}:blocked`,
      });

    const first = await send();
    const second = await send();
    expect(first.status).to.equal("suppressed");
    expect(second.sendId).to.equal(first.sendId);
    expect(await eventsOf(first.sendId)).to.equal(1);
    expect(mailsTo(to)).to.equal(0);
  });

  it("refuses an empty key before anything is sent or logged", async () => {
    const { SendTemplate } = await mailing();
    const to = `empty-key-${stamp}@example.test`;
    const refusal = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to,
      variables: VARIABLES,
      idempotencyKey: "",
    }).catch((error: unknown) => error);

    expect(refusal).to.have.property("code", "invalid_idempotency_key");
    expect(mailsTo(to)).to.equal(0);
    const logged = await GetModel(SendModel, DEFAULT_TENANT_ID).getBy(
      "recipientEmail",
      to,
    );
    expect(logged).to.have.length(0);
  });
});

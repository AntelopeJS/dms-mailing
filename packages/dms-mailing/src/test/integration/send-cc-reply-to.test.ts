import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SendModel } from "../../db";
import { suppressAddress } from "../../services/suppressions";
import { declaration, mailing } from "../helpers/declarations";
import { capturedMail, rawMail } from "../helpers/mail-store";

const stamp = Date.now();
const slug = `cc-reply-to-${stamp}`;
const VARIABLES = { customer: { firstName: "Sofie" } };

const mailTo = (address: string): string =>
  capturedMail()
    .map(rawMail)
    .find((message) => message.includes(address)) ?? "";

describe("[integration] sends with cc and reply-to", () => {
  before(async () => {
    const { DeclareTemplate } = await mailing();
    await DeclareTemplate(declaration(slug));
  });

  it("copies the address, sets the reply-to and logs the copy", async () => {
    const { SendTemplate } = await mailing();
    const to = `to-${stamp}@example.test`;
    const cc = `boss-${stamp}@example.test`;
    const result = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to,
      cc: [cc],
      replyTo: `replies-${stamp}@example.test`,
      variables: VARIABLES,
    });

    expect(result.status).to.equal("sent");
    const raw = mailTo(to);
    expect(raw).to.match(new RegExp(`^Cc:.*${cc}`, "im"));
    expect(raw).to.match(new RegExp(`^Reply-To:.*replies-${stamp}@`, "im"));
    const send = await GetModel(SendModel, DEFAULT_TENANT_ID).get(
      result.sendId,
    );
    expect(JSON.parse(send?.json_cc ?? "null")).to.deep.equal([cc]);
  });

  it("leaves a suppressed address out of the copies", async () => {
    const { SendTemplate } = await mailing();
    const to = `to-suppressed-cc-${stamp}@example.test`;
    const suppressed = `blocked-${stamp}@example.test`;
    const allowed = `allowed-${stamp}@example.test`;
    await suppressAddress(DEFAULT_TENANT_ID, {
      email: suppressed,
      reason: "manual",
    });
    const result = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to,
      cc: [suppressed, allowed],
      variables: VARIABLES,
    });

    expect(result.status).to.equal("sent");
    const raw = mailTo(to);
    expect(raw).to.contain(allowed);
    expect(raw).to.not.contain(suppressed);
    const send = await GetModel(SendModel, DEFAULT_TENANT_ID).get(
      result.sendId,
    );
    expect(JSON.parse(send?.json_cc ?? "null")).to.deep.equal([allowed]);
  });
});

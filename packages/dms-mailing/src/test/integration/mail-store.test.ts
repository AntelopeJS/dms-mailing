import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { declaration, mailing } from "../helpers/declarations";
import { capturedMail, rawMail } from "../helpers/mail-store";

const stamp = Date.now();

describe("[integration] the SMTP fixture's mail store", () => {
  it("keeps each message with its envelope, headers and body where the tests read it", async () => {
    const { DeclareTemplate, SendTemplate } = await mailing();
    const slug = `mail-store-${stamp}`;
    const recipient = `mail-store-${stamp}@example.test`;
    await DeclareTemplate(declaration(slug));
    const sent = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: recipient,
      variables: { customer: { firstName: "Sofie" } },
    });
    expect(sent.status, sent.error).to.equal("sent");

    const kept = capturedMail().filter((message) =>
      message.to.includes(`<${recipient}>`),
    );
    expect(kept.map((message) => message.subject)).to.deep.equal([
      "Your order is ready",
    ]);
    const [message] = kept;
    expect(message?.from).to.equal("<verify@dms-mailing.local>");
    expect(message?.text).to.include("Hello Sofie");
    const raw = message === undefined ? "" : rawMail(message);
    expect(raw).to.match(new RegExp(`^To: ${recipient}$`, "m"));
    expect(raw).to.match(/^Content-Type: multipart\/alternative;/m);
  });
});

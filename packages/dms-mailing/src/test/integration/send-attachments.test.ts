import { createHash } from "node:crypto";
import { expect } from "chai";
import { z } from "zod";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SendModel } from "../../db";
import { suppressAddress } from "../../services/suppressions";
import { declaration, mailing } from "../helpers/declarations";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { smtpMessages } from "../helpers/smtp";

const HTTP_CONFLICT = 409;
const stamp = Date.now();
const slug = `attachments-${stamp}`;
const VARIABLES = { customer: { firstName: "Sofie" } };
/** Unique bytes, so the test finds its own message among the fixture's. */
const PDF = Buffer.from(`%PDF-1.7 invoice ${stamp}`);
const SHA256 = createHash("sha256").update(PDF).digest("hex");

const summarySchema = z.array(
  z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number(),
    sha256: z.string(),
  }),
);

const invoice = {
  filename: "../archive/invoice-001.pdf\r\nX-Injected: yes",
  contentType: "Application/PDF",
  content: PDF,
};

async function loggedAttachments(sendId: string) {
  const send = await GetModel(SendModel, DEFAULT_TENANT_ID).get(sendId);
  return summarySchema.parse(JSON.parse(send?.json_attachments ?? "null"));
}

const EXPECTED_SUMMARY = [
  {
    filename: "invoice-001.pdfX-Injected: yes",
    contentType: "application/pdf",
    size: PDF.byteLength,
    sha256: SHA256,
  },
];

describe("[integration] sends with attachments", () => {
  before(async () => {
    const { DeclareTemplate } = await mailing();
    await DeclareTemplate(declaration(slug));
  });

  it("delivers the file over SMTP and logs its name, size and hash only", async () => {
    const { SendTemplate } = await mailing();
    const result = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: [`first-${stamp}@example.test`, `second-${stamp}@example.test`],
      variables: VARIABLES,
      attachments: [invoice],
    });

    const results = result.results ?? [];
    expect(results.map((entry) => entry.status)).to.deep.equal([
      "sent",
      "sent",
    ]);
    for (const entry of results)
      expect(await loggedAttachments(entry.sendId)).to.deep.equal(
        EXPECTED_SUMMARY,
      );
    const send = await GetModel(SendModel, DEFAULT_TENANT_ID).get(
      result.sendId,
    );
    expect(send?.json_attachments).to.not.contain(PDF.toString("base64"));

    const mine = smtpMessages().filter((message) =>
      message.includes(PDF.toString("base64")),
    );
    expect(mine).to.have.length(2);
    expect(mine[0]).to.match(/Content-Type: application\/pdf/i);
    expect(mine[0]).to.contain("invoice-001.pdf");
    expect(mine[0]).to.not.contain("archive");
    expect(mine[0]).to.not.match(/^X-Injected:/m);
  });

  it("logs the files of a suppressed recipient without sending them", async () => {
    const { SendTemplate } = await mailing();
    const address = `suppressed-${stamp}@example.test`;
    await suppressAddress(DEFAULT_TENANT_ID, {
      email: address,
      reason: "manual",
    });
    const result = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: address,
      variables: VARIABLES,
      attachments: [invoice],
    });

    expect(result.status).to.equal("suppressed");
    expect(await loggedAttachments(result.sendId)).to.deep.equal(
      EXPECTED_SUMMARY,
    );
  });

  it("refuses a file over the ceiling before anything is logged", async () => {
    const { SendTemplate, GetSendCapabilities } = await mailing();
    const { maxAttachmentBytes } = await GetSendCapabilities();
    const address = `too-large-${stamp}@example.test`;
    const refusal = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: address,
      variables: VARIABLES,
      attachments: [
        {
          filename: "huge.bin",
          content: Buffer.alloc(maxAttachmentBytes + 1),
        },
      ],
    }).catch((error: unknown) => error);

    expect(refusal).to.have.property("code", "attachments_too_large");
    const logged = await GetModel(SendModel, DEFAULT_TENANT_ID).getBy(
      "recipientEmail",
      address,
    );
    expect(logged).to.have.length(0);
  });

  it("reports what a send can carry through nodemailer", async () => {
    const { GetSendCapabilities } = await mailing();
    const capabilities = await GetSendCapabilities();
    expect(capabilities.attachments).to.equal(true);
    expect(capabilities.maxAttachments).to.equal(10);
    expect(capabilities.maxAttachmentBytes).to.equal(10 * 1024 * 1024);
  });

  it("refuses to send again a send whose files the log does not keep", async () => {
    const { SendTemplate } = await mailing();
    const sent = await SendTemplate(slug, {
      tenantId: DEFAULT_TENANT_ID,
      to: `replay-${stamp}@example.test`,
      variables: VARIABLES,
      attachments: [invoice],
    });
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);

    const replay = await client.post(
      `/api/mailing/sends/${sent.sendId}/replay`,
      {},
    );

    expect(replay.status, JSON.stringify(replay.data)).to.equal(HTTP_CONFLICT);
    expect(JSON.stringify(replay.data)).to.contain(
      "$dms_mailing.errors.no_replay_with_attachments",
    );
  });
});

import { createHash } from "node:crypto";
import type { SendAttachment } from "@antelopejs/interface-dms-mailing";
import type { ProviderCapabilities } from "@antelopejs/interface-email";
import { expect } from "chai";
import { getConfig, setConfig } from "../../config";
import {
  attachmentsLog,
  checkAttachments,
  safeContentType,
  safeFilename,
  sendCapabilities,
  toEmailAttachments,
} from "../../services/attachments";
import { SendError } from "../../services/send-error";

const PDF = Buffer.from("%PDF-1.7 invoice");
const MIB = 1024 * 1024;

const capabilities = (
  overrides: Partial<ProviderCapabilities> = {},
  features: Record<string, boolean> = {},
): ProviderCapabilities => ({
  name: "smtp",
  features: {
    batch: true,
    templates: true,
    providerTemplates: false,
    scheduling: false,
    openTracking: false,
    clickTracking: false,
    inlineAttachments: true,
    tags: false,
    metadata: false,
    priority: false,
    ...features,
  },
  ...overrides,
});

const invoice = (overrides: Partial<SendAttachment> = {}): SendAttachment => ({
  filename: "invoice-2026-001.pdf",
  contentType: "application/pdf",
  content: PDF,
  ...overrides,
});

function refusalCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof SendError) return error.code;
    throw error;
  }
  return "";
}

describe("[unit] services/attachments file names", () => {
  it("keeps only the last path segment, whatever the separator", () => {
    expect(safeFilename("../../etc/passwd", 0)).to.equal("passwd");
    expect(safeFilename("C:\\archive\\2026\\invoice.pdf", 0)).to.equal(
      "invoice.pdf",
    );
  });

  it("removes line breaks and controls, so a name cannot start a header", () => {
    expect(safeFilename("invoice.pdf\r\nBcc: victim@example.test", 0)).to.equal(
      "invoice.pdfBcc: victim@example.test",
    );
    expect(safeFilename("a\u0000b\u0007c.pdf", 0)).to.equal("abc.pdf");
  });

  it("removes the bidi override that would disguise an extension", () => {
    expect(safeFilename("invoice\u202Efdp.exe", 0)).to.equal("invoicefdp.exe");
  });

  it("refuses a name left empty or reserved", () => {
    expect(refusalCode(() => safeFilename("folder/", 0))).to.equal(
      "invalid_attachment",
    );
    expect(refusalCode(() => safeFilename("\r\n", 0))).to.equal(
      "invalid_attachment",
    );
    expect(refusalCode(() => safeFilename("..", 0))).to.equal(
      "invalid_attachment",
    );
  });

  it("cuts a long name to 200 characters and keeps its extension", () => {
    const name = safeFilename(`${"é".repeat(300)}.pdf`, 0);
    expect(Array.from(name)).to.have.length(200);
    expect(name.endsWith(".pdf")).to.equal(true);
  });
});

describe("[unit] services/attachments content types", () => {
  it("lower-cases the type and drops its parameters", () => {
    expect(
      safeContentType('Application/PDF; name="x"\r\nX-Evil: 1', 0),
    ).to.equal("application/pdf");
  });

  it("falls back to octet-stream when the caller names none", () => {
    expect(safeContentType(undefined, 0)).to.equal("application/octet-stream");
  });

  it("refuses multipart and message types, and anything not type/subtype", () => {
    for (const type of ["multipart/mixed", "message/rfc822", "pdf", "a/b c"])
      expect(refusalCode(() => safeContentType(type, 0))).to.equal(
        "invalid_attachment",
      );
  });
});

describe("[unit] services/attachments checks", () => {
  const initial = getConfig();
  afterEach(() => setConfig(initial));

  it("hashes and sizes each file, and the log keeps no byte of it", () => {
    const [checked] = checkAttachments([invoice()], capabilities());
    const sha256 = createHash("sha256").update(PDF).digest("hex");

    expect(checked).to.include({ size: PDF.byteLength, sha256 });
    expect(JSON.parse(attachmentsLog([checked]) ?? "")).to.deep.equal([
      {
        filename: "invoice-2026-001.pdf",
        contentType: "application/pdf",
        size: PDF.byteLength,
        sha256,
      },
    ]);
  });

  it("hands the provider the bytes, never a path or a URL", () => {
    const sent = toEmailAttachments(checkAttachments([invoice()], null));
    expect(sent).to.deep.equal([
      {
        filename: "invoice-2026-001.pdf",
        contentType: "application/pdf",
        content: PDF,
      },
    ]);
  });

  it("accepts a plain Uint8Array without copying it", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const [checked] = checkAttachments([invoice({ content: bytes })], null);
    expect(checked?.content.buffer).to.equal(bytes.buffer);
  });

  it("refuses a path or a URL passed where the bytes belong", () => {
    const fromPath = invoice();
    Reflect.deleteProperty(fromPath, "content");
    Reflect.set(fromPath, "path", "/etc/passwd");
    const fromText = invoice();
    Reflect.set(fromText, "content", "/etc/passwd");
    for (const attachment of [fromPath, fromText])
      expect(refusalCode(() => checkAttachments([attachment], null))).to.equal(
        "invalid_attachment",
      );
  });

  it("refuses an empty file", () => {
    expect(
      refusalCode(() =>
        checkAttachments([invoice({ content: Buffer.alloc(0) })], null),
      ),
    ).to.equal("invalid_attachment");
  });

  it("refuses files over the configured total, and too many files", () => {
    setConfig({ maxAttachmentBytes: 10, maxAttachments: 2 });
    const big = invoice({ content: Buffer.alloc(11) });
    expect(refusalCode(() => checkAttachments([big], null))).to.equal(
      "attachments_too_large",
    );
    const three = [1, 2, 3].map(() => invoice({ content: Buffer.alloc(1) }));
    expect(refusalCode(() => checkAttachments(three, null))).to.equal(
      "attachments_too_large",
    );
  });

  it("lowers the ceiling to the provider's own limits", () => {
    const file = invoice({ content: Buffer.alloc(100) });
    expect(
      refusalCode(() =>
        checkAttachments([file], capabilities({ maxAttachmentSize: 99 })),
      ),
    ).to.equal("attachments_too_large");
    expect(
      refusalCode(() =>
        checkAttachments([file], capabilities({ maxEmailSize: 120 })),
      ),
    ).to.equal("attachments_too_large");
  });

  it("refuses a send when the provider reports it cannot carry files", () => {
    const refusing = capabilities({}, { attachments: false });
    expect(refusalCode(() => checkAttachments([invoice()], refusing))).to.equal(
      "attachments_unsupported",
    );
    expect(checkAttachments([], refusing)).to.deep.equal([]);
  });
});

describe("[unit] services/attachments capabilities", () => {
  const initial = getConfig();
  afterEach(() => setConfig(initial));

  it("reports the configured limits lowered to the provider's", async () => {
    setConfig({ maxAttachmentBytes: 8 * MIB, maxAttachments: 4 });
    const read = sendCapabilities(() =>
      Promise.resolve(capabilities({ maxAttachmentSize: 2 * MIB })),
    );
    expect(await read).to.deep.equal({
      attachments: true,
      maxAttachments: 4,
      maxAttachmentBytes: 8 * MIB,
      maxAttachmentFileBytes: 2 * MIB,
      provider: "smtp",
    });
  });

  it("reports no attachments for a provider that says it cannot", async () => {
    const read = sendCapabilities(() =>
      Promise.resolve(capabilities({}, { attachments: false })),
    );
    expect((await read).attachments).to.equal(false);
  });

  it("stays optimistic when the provider cannot be read", async () => {
    const read = await sendCapabilities(() => Promise.resolve(null));
    expect(read.attachments).to.equal(true);
    expect(read.provider).to.equal(undefined);
  });
});

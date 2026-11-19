import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The variable naming the folder the SMTP fixture keeps each message in. The
 * test config and the compiled tests load this file as two module instances,
 * so the folder, not a variable of this file, is what they share.
 */
export const MAIL_FOLDER_VARIABLE = "DMS_MAILING_TEST_MAIL_DIR";

/** Set to `1`, the SMTP fixture answers `421` to every connection and command, as a provider that is down would. */
export const SMTP_DOWN_VARIABLE = "DMS_MAILING_TEST_SMTP_DOWN";

/** Who a message came from and went to, as the SMTP commands named them. */
export interface MailEnvelope {
  from: string;
  to: string[];
}

const mailSummary = z.object({
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  links: z.array(z.string()),
  text: z.string(),
  receivedAt: z.string(),
});

/** A message the SMTP fixture kept: its envelope, subject, links, readable text, arrival and its raw `.eml` file. */
export type CapturedMail = z.infer<typeof mailSummary> & { file: string };

const QUOTED_SOFT_BREAK = /=\r?\n/g;
const QUOTED_BYTE = /=([0-9A-F]{2})/g;
const HEX = 16;
const LINK = /https?:\/\/[^\s"'<>]+/g;
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["#39", "'"],
  ["nbsp", " "],
]);

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(QUOTED_SOFT_BREAK, "")
    .replace(QUOTED_BYTE, (_match, byte: string) =>
      String.fromCharCode(Number.parseInt(byte, HEX)),
    );
}

function headerOf(message: string, name: string): string {
  const match = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im").exec(
    message,
  );
  return match?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim() ?? "";
}

function readableText(decoded: string): string {
  return decoded
    .slice(decoded.search(/\r?\n\r?\n/))
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity, name: string) => ENTITIES.get(name) ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keeps one message the SMTP fixture received as `<folder>/NNN.eml`, with its
 * summary in `NNN.json`, the layout the journeys' mail sink wrote.
 */
export function keepMail(
  folder: string,
  envelope: MailEnvelope,
  raw: string,
): void {
  mkdirSync(folder, { recursive: true });
  const index =
    readdirSync(folder).filter((name) => name.endsWith(".eml")).length + 1;
  const base = String(index).padStart(3, "0");
  const decoded = Buffer.from(decodeQuotedPrintable(raw), "latin1").toString(
    "utf8",
  );
  const links = decoded.replaceAll("&amp;", "&").match(LINK) ?? [];
  const summary = {
    from: envelope.from,
    to: envelope.to,
    subject: headerOf(raw, "Subject"),
    links: [...new Set(links)],
    text: readableText(decoded),
    receivedAt: new Date().toISOString(),
  };
  writeFileSync(join(folder, `${base}.eml`), raw);
  writeFileSync(join(folder, `${base}.json`), JSON.stringify(summary));
}

/** The messages the SMTP fixture kept so far, oldest first; none when no fixture keeps mail. */
export function capturedMail(): CapturedMail[] {
  const folder = process.env[MAIL_FOLDER_VARIABLE];
  if (folder === undefined || !existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      ...mailSummary.parse(
        JSON.parse(readFileSync(join(folder, name), "utf8")),
      ),
      file: join(folder, name.replace(/\.json$/, ".eml")),
    }));
}

/** The raw message as the SMTP fixture received it: its headers and its body. */
export function rawMail(message: CapturedMail): string {
  return readFileSync(message.file, "utf8");
}

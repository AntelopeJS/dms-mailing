import { createHash } from "node:crypto";
import type {
  Attachment,
  ProviderCapabilities,
} from "@antelopejs/interface-email";
import type {
  SendAttachment,
  SendCapabilities,
} from "@antelopejs/interface-dms-mailing";
import { getConfig } from "../config";
import { sendAttachmentsSchema } from "../validation/attachments.schema";
import { readCapabilities } from "./provider";
import { SendError } from "./send-error";

/** A file of a send as the send log keeps it: everything but its bytes. */
interface AttachmentSummary {
  filename: string;
  contentType: string;
  size: number;
  /** Hex SHA-256 of the bytes, to match the log against the caller's archive. */
  sha256: string;
}

/** A file the checks accepted, with the bytes the provider receives. */
export interface CheckedAttachment extends AttachmentSummary {
  content: Buffer;
}

/** How many files, and how many bytes, one send may carry. */
interface AttachmentLimits {
  count: number;
  totalBytes: number;
  fileBytes: number;
}

const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
/** Types that would nest a MIME structure or a whole message in the e-mail. */
const REFUSED_TOP_LEVEL_TYPES = new Set(["multipart", "message"]);
const TYPE_PARAMETERS = ";";
const TYPE_SEPARATOR = "/";
const PATH_SEPARATORS = /[\\/]/;
/** Control, formatting (bidi overrides, zero-width) and line-separator characters. */
const UNSAFE_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const WHITESPACE_RUN = /\s+/g;
const RESERVED_NAMES = new Set([".", ".."]);
const MAX_FILENAME_LENGTH = 200;
const MAX_EXTENSION_LENGTH = 16;
const EXTENSION_DOT = ".";
const NO_POSITION = -1;
const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
/** Base64 writes three bytes as four characters. */
const BASE64_RAW_RATIO = 3 / 4;

const invalid = (index: number, reason: string): SendError =>
  new SendError("invalid_attachment", `Attachment ${index}: ${reason}`);

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const graphemesOf = (text: string): string[] =>
  Array.from(GRAPHEMES.segment(text), (part) => part.segment);

/** `name` cut to {@link MAX_FILENAME_LENGTH} characters, its extension kept. */
function shortened(name: string): string {
  const characters = graphemesOf(name);
  if (characters.length <= MAX_FILENAME_LENGTH) return name;
  const dot = name.lastIndexOf(EXTENSION_DOT);
  const extension =
    dot > NO_POSITION && name.length - dot <= MAX_EXTENSION_LENGTH
      ? name.slice(dot)
      : "";
  const stemLength = MAX_FILENAME_LENGTH - graphemesOf(extension).length;
  return characters.slice(0, stemLength).join("") + extension;
}

/**
 * The name a recipient sees: its last path segment, without the characters
 * that could break a header or disguise its extension.
 */
export function safeFilename(name: string, index: number): string {
  const segment = name.split(PATH_SEPARATORS).pop() ?? "";
  const cleaned = segment
    .replace(UNSAFE_NAME_CHARACTERS, "")
    .replace(WHITESPACE_RUN, " ")
    .trim();
  if (!cleaned || RESERVED_NAMES.has(cleaned))
    throw invalid(index, "has no usable file name");
  return shortened(cleaned);
}

/** `type/subtype` in lower case without parameters, or a refusal. */
export function safeContentType(
  type: string | undefined,
  index: number,
): string {
  if (type === undefined) return DEFAULT_CONTENT_TYPE;
  const essence = (type.split(TYPE_PARAMETERS)[0] ?? "").trim().toLowerCase();
  const topLevel = essence.split(TYPE_SEPARATOR)[0] ?? "";
  if (!MIME_TYPE.test(essence) || REFUSED_TOP_LEVEL_TYPES.has(topLevel))
    throw invalid(index, `has a refused content type "${essence}"`);
  return essence;
}

function bytesOf(content: Uint8Array, index: number): Buffer {
  if (content.byteLength === 0) throw invalid(index, "is empty");
  return Buffer.isBuffer(content)
    ? content
    : Buffer.from(content.buffer, content.byteOffset, content.byteLength);
}

function checkedOne(entry: SendAttachment, index: number): CheckedAttachment {
  const content = bytesOf(entry.content, index);
  return {
    filename: safeFilename(entry.filename, index),
    contentType: safeContentType(entry.contentType, index),
    size: content.byteLength,
    sha256: createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING),
    content,
  };
}

/**
 * `input` as the attachments schema reads it. A JavaScript caller that passes
 * a path, a URL or a string where the bytes belong is refused here.
 */
function parsedAttachments(
  input: readonly SendAttachment[] | undefined,
): SendAttachment[] {
  const parsed = sendAttachmentsSchema.safeParse(input);
  if (!parsed.success) {
    const index = parsed.error.issues[0]?.path[0] ?? "";
    throw new SendError(
      "invalid_attachment",
      `Attachment ${index}: needs a file name and its bytes as a Buffer`,
    );
  }
  return parsed.data ?? [];
}

const lowered = (limit: number, providerLimit: number | undefined): number =>
  providerLimit === undefined ? limit : Math.min(limit, providerLimit);

/**
 * The module's ceilings, lowered to what the provider reports: its largest
 * message (of which base64 leaves three quarters to raw bytes) and its
 * largest file.
 */
function attachmentLimits(
  capabilities: ProviderCapabilities | null,
): AttachmentLimits {
  const config = getConfig();
  const emailSize = capabilities?.maxEmailSize;
  const totalBytes = lowered(
    config.maxAttachmentBytes,
    emailSize === undefined
      ? undefined
      : Math.floor(emailSize * BASE64_RAW_RATIO),
  );
  return {
    count: config.maxAttachments,
    totalBytes,
    fileBytes: lowered(totalBytes, capabilities?.maxAttachmentSize),
  };
}

/**
 * Whether the provider says it cannot carry attachments. The email
 * interface's `features` has no such flag yet: a provider that adds one is
 * read, one without it is taken at the interface's word, whose `EmailParams`
 * carries attachments.
 */
function refusesAttachments(capabilities: ProviderCapabilities): boolean {
  const { features } = capabilities;
  return "attachments" in features && features.attachments === false;
}

function assertWithin(
  attachments: CheckedAttachment[],
  limits: AttachmentLimits,
): void {
  if (attachments.length > limits.count)
    throw new SendError(
      "attachments_too_large",
      `${attachments.length} attachments, at most ${limits.count}`,
    );
  const oversized = attachments.find((file) => file.size > limits.fileBytes);
  if (oversized)
    throw new SendError(
      "attachments_too_large",
      `"${oversized.filename}" is ${oversized.size} bytes, at most ${limits.fileBytes}`,
    );
  const total = attachments.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.totalBytes)
    throw new SendError(
      "attachments_too_large",
      `The attachments add up to ${total} bytes, at most ${limits.totalBytes}`,
    );
}

/**
 * The attachments of a send, checked against the module's rules and what the
 * provider reports (`null` when it could not be read): a refusal throws a
 * `SendError`, a file is never left out.
 */
export function checkAttachments(
  input: readonly SendAttachment[] | undefined,
  capabilities: ProviderCapabilities | null,
): CheckedAttachment[] {
  const entries = parsedAttachments(input);
  if (!entries.length) return [];
  if (capabilities && refusesAttachments(capabilities))
    throw new SendError(
      "attachments_unsupported",
      `The e-mail provider "${capabilities.name}" cannot carry attachments`,
    );
  const attachments = entries.map(checkedOne);
  assertWithin(attachments, attachmentLimits(capabilities));
  return attachments;
}

/**
 * The files as the email interface sends them: bytes, never a path or a URL.
 * Absent for a send without any.
 */
export function toEmailAttachments(
  attachments: CheckedAttachment[],
): Attachment[] | undefined {
  if (!attachments.length) return undefined;
  return attachments.map(({ filename, contentType, content }) => ({
    filename,
    contentType,
    content,
  }));
}

/** What the send log keeps of the files; absent for a send without any. */
export function attachmentsLog(
  attachments: CheckedAttachment[],
): string | undefined {
  if (!attachments.length) return undefined;
  const summaries: AttachmentSummary[] = attachments.map(
    ({ filename, contentType, size, sha256 }) => ({
      filename,
      contentType,
      size,
      sha256,
    }),
  );
  return JSON.stringify(summaries);
}

/** What a send can carry today: `GetSendCapabilities`. */
export async function sendCapabilities(
  read: () => Promise<ProviderCapabilities | null> = readCapabilities,
): Promise<SendCapabilities> {
  const capabilities = await read();
  const limits = attachmentLimits(capabilities);
  return {
    attachments: !capabilities || !refusesAttachments(capabilities),
    maxAttachments: limits.count,
    maxAttachmentBytes: limits.totalBytes,
    maxAttachmentFileBytes: limits.fileBytes,
    provider: capabilities?.name,
  };
}

/**
 * The checked attachments of a send, reading the provider's capabilities
 * only when there are some.
 */
export async function attachmentsOfSend(
  input: readonly SendAttachment[] | undefined,
): Promise<CheckedAttachment[]> {
  const capabilities = input?.length ? await readCapabilities() : null;
  return checkAttachments(input, capabilities);
}

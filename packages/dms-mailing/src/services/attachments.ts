import { createHash } from "node:crypto";
import type { BufferAttachment } from "@antelopejs/interface-email";
import type { SendAttachment } from "@antelopejs/interface-dms-mailing";
import { SendError } from "./send-error";

/** Most files one send carries. */
export const MAX_ATTACHMENTS = 10;
/** Most bytes the files of one send add up to: base64 grows them by a third, under the 20 MB most mail servers accept. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const PATH_SEPARATORS = /[\\/]/;
const LINE_BREAKS = /[\r\n]/g;

/**
 * The files as the email interface takes them, each name cut to its last path
 * segment without line breaks; absent for a send without any. Over
 * {@link MAX_ATTACHMENTS} or {@link MAX_ATTACHMENT_BYTES}, it throws
 * `attachments_too_large`.
 */
export function checkAttachments(
  input: readonly SendAttachment[] | undefined,
): BufferAttachment[] | undefined {
  if (!input?.length) return undefined;
  const total = input.reduce((sum, file) => sum + file.content.byteLength, 0);
  if (input.length > MAX_ATTACHMENTS || total > MAX_ATTACHMENT_BYTES)
    throw new SendError(
      "attachments_too_large",
      `${input.length} files of ${total} bytes, at most ${MAX_ATTACHMENTS} files of ${MAX_ATTACHMENT_BYTES} bytes`,
    );
  return input.map(({ filename, contentType, content }) => ({
    filename: (filename.split(PATH_SEPARATORS).pop() ?? "").replace(
      LINE_BREAKS,
      "",
    ),
    contentType,
    content: Buffer.from(content),
  }));
}

/** What the send log keeps of the files: name, type, size and SHA-256, never the bytes. */
export function attachmentsLog(
  files: readonly BufferAttachment[] | undefined,
): string | undefined {
  if (!files) return undefined;
  return JSON.stringify(
    files.map(({ filename, contentType, content }) => ({
      filename,
      contentType,
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
  );
}

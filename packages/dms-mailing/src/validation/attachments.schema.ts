import { z } from "zod";

/**
 * An attachment as a caller hands it to `SendTemplate`, checked at run time
 * too: a JavaScript caller can pass a path or a URL where the bytes belong,
 * and any key but these three is dropped.
 */
const sendAttachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string().optional(),
  content: z.instanceof(Uint8Array),
});

export const sendAttachmentsSchema = z.array(sendAttachmentSchema).optional();

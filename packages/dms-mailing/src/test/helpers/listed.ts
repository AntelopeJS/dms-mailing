import type { AxiosResponse } from "axios";
import { z } from "zod";

const templateRowSchema = z.object({
  _id: z.string(),
  slug: z.string(),
  status: z.string(),
  locales: z.string(),
  hasSends: z.boolean().optional(),
});

const templateListSchema = z.object({ results: z.array(templateRowSchema) });

/** The rows of a templates list answer, each checked to carry its columns. */
export function listedTemplates(list: AxiosResponse) {
  return templateListSchema.parse(list.data).results;
}

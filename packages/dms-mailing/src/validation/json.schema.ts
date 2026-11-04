import { z } from "zod";
import { isJsonObject } from "./json";

/** A JSON object whose every value is JSON data, such as a request body carries. */
export const jsonObjectSchema = z
  .unknown()
  .refine(isJsonObject, "expected a JSON object");

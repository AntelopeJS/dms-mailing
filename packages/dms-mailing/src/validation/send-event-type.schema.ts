import { z } from "zod";
import { SEND_EVENT_TYPES } from "../types";

const [FIRST_EVENT_TYPE, ...OTHER_EVENT_TYPES] = SEND_EVENT_TYPES;

/** A send event's type: one of {@link SEND_EVENT_TYPES}. */
export const sendEventTypeSchema = z.enum([
  FIRST_EVENT_TYPE,
  ...OTHER_EVENT_TYPES,
]);

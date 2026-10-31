import type { assertValidation } from "@antelopejs/interface-api-util";

/** The error handler `assertValidation` takes: it receives what the validator threw. */
export type ValidationErrorHandler = NonNullable<
  Parameters<typeof assertValidation>[2]
>;

import type { ZodError, ZodType, ZodTypeDef } from "zod";

/**
 * Why a call made from code (a declaration, an import) was refused: `code`
 * names the rule, like `SendError` does for a send, and the message says
 * which field broke it.
 */
export class DeclarationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const ISSUE_SEPARATOR = "; ";
const ROOT_PATH = "(root)";

function describeIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || ROOT_PATH}: ${issue.message}`)
    .join(ISSUE_SEPARATOR);
}

/** `input` parsed by `schema`, or a `DeclarationError` under `code`. */
export function parseDeclared<Output, Input>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  input: Input,
  code: string,
  subject: string,
): Output {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new DeclarationError(
    code,
    `Invalid ${subject}: ${describeIssues(parsed.error)}`,
  );
}

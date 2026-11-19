/** One observation a journey recorded. */
export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** A numbered step of a journey and the checks it recorded. */
export interface Step {
  name: string;
  checks: Check[];
}

/** How a journey ended early: `abortedAt` names the critical step whose failure ended it, `error` what it threw. */
export interface JourneyEnd {
  error: string | null;
  abortedAt: string | null;
}

/**
 * A check against the journey's known failures: it fails unlisted (`fail`) or
 * listed (`known`), and passes unlisted (`pass`) or listed (`fixed`).
 */
type CheckVerdict = "pass" | "fail" | "known" | "fixed";

interface JudgedCheck extends Check {
  verdict: CheckVerdict;
  finding?: string;
}

interface JudgedStep {
  name: string;
  checks: JudgedCheck[];
}

export interface JudgedJourney {
  status: "PASS" | "FAIL";
  steps: JudgedStep[];
  error: string | null;
}

/** The error of a journey that the critical step `step` ended. */
export function abortMessage(step: string): string {
  return `critical step ${step} failed`;
}

function judgeCheck(
  check: Check,
  knownFailures: Readonly<Record<string, string>>,
): JudgedCheck {
  if (!Object.hasOwn(knownFailures, check.name)) {
    return { ...check, verdict: check.pass ? "pass" : "fail" };
  }
  const finding = knownFailures[check.name];
  return { ...check, verdict: check.pass ? "fixed" : "known", finding };
}

const isFailing = (check: JudgedCheck): boolean =>
  check.verdict === "fail" || check.verdict === "fixed";

/**
 * Judges the steps a journey recorded against its known failures, as the e2e
 * kit's `journey-judge.mjs` does. `fail` and `fixed` fail the journey, `known`
 * does not. An abort at a critical step whose failed checks are all `known` is
 * the expected end; any other abort or error fails the journey.
 */
export function judge(
  steps: readonly Step[],
  end: JourneyEnd,
  knownFailures: Readonly<Record<string, string>>,
): JudgedJourney {
  const judged = steps.map((step) => ({
    name: step.name,
    checks: step.checks.map((check) => judgeCheck(check, knownFailures)),
  }));
  const expectedAbort = judged.some(
    (step) =>
      step.name === end.abortedAt &&
      step.checks.every((check) => check.verdict !== "fail"),
  );
  const errors = [
    end.abortedAt === null || expectedAbort
      ? null
      : abortMessage(end.abortedAt),
    end.error,
  ].filter((entry) => entry !== null);
  const error = errors.length === 0 ? null : errors.join("\n");
  const failed =
    error !== null || judged.some((step) => step.checks.some(isFailing));
  return { status: failed ? "FAIL" : "PASS", steps: judged, error };
}

function describeCheck(step: JudgedStep, check: JudgedCheck): string {
  const fixed =
    check.verdict === "fixed"
      ? ` (listed as a known failure, now passing: remove it from knownFailures: ${check.finding ?? ""})`
      : "";
  return `${step.name} > ${check.name}${fixed}: ${check.detail}`;
}

/** Every failing or fixed check of a judged journey with its detail, and its error; empty for a journey that passed. */
export function failureReport(judged: JudgedJourney): string {
  const checks = judged.steps.flatMap((step) =>
    step.checks
      .filter(isFailing)
      .map((check) => `  ${describeCheck(step, check)}`),
  );
  return [...checks, ...(judged.error === null ? [] : [judged.error])].join(
    "\n",
  );
}

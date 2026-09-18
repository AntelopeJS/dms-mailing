import type { Condition, ConditionOperator } from "../types";
import { getPath } from "./paths";

type Evaluator = (actual: unknown, expected: string) => boolean;

const asNumber = (value: unknown): number => Number(value);

const EVALUATORS: Record<ConditionOperator, Evaluator> = {
  truthy: (actual) => Boolean(actual),
  falsy: (actual) => !actual,
  eq: (actual, expected) => String(actual) === expected,
  ne: (actual, expected) => String(actual) !== expected,
  gt: (actual, expected) => asNumber(actual) > asNumber(expected),
  lt: (actual, expected) => asNumber(actual) < asNumber(expected),
};

/**
 * An unknown operator hides the block rather than throwing. Every entry point
 * validates the operator against a `z.enum`, so this only guards content stored
 * before an operator existed: a missing block is inspectable in the preview,
 * a TypeError mid-send is a mail nobody receives.
 */
export function evaluateCondition(
  condition: Condition,
  data: Record<string, unknown>,
): boolean {
  const evaluate = EVALUATORS[condition.operator];
  if (!evaluate) return false;
  return evaluate(getPath(data, condition.path), condition.value);
}

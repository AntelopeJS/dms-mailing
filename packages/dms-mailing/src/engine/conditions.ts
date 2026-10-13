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

/** Whether `data` passes the condition a block is shown under. */
export function evaluateCondition(
  condition: Condition,
  data: Record<string, unknown>,
): boolean {
  const evaluate = EVALUATORS[condition.operator];
  return evaluate(getPath(data, condition.path), condition.value);
}

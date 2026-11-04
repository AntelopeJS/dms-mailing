import type {
  TemplateVariables,
  TemplateVariableValue,
} from "@antelopejs/interface-dms-mailing";
import type { Condition, ConditionOperator } from "../types";
import { plainText } from "./formats";
import { getPath } from "./paths";

type Evaluator = (
  actual: TemplateVariableValue | undefined,
  expected: string,
) => boolean;

const EVALUATORS: Record<ConditionOperator, Evaluator> = {
  truthy: (actual) => Boolean(actual),
  falsy: (actual) => !actual,
  eq: (actual, expected) => plainText(actual) === expected,
  ne: (actual, expected) => plainText(actual) !== expected,
  gt: (actual, expected) => Number(actual) > Number(expected),
  lt: (actual, expected) => Number(actual) < Number(expected),
};

/** Whether `data` passes the condition a block is shown under. */
export function evaluateCondition(
  condition: Condition,
  data: TemplateVariables,
): boolean {
  const evaluate = EVALUATORS[condition.operator];
  return evaluate(getPath(data, condition.path), condition.value);
}

import type { Condition, ConditionOperator } from '../types/mailing'

export const OPERATORS: ConditionOperator[] = [
	'truthy',
	'falsy',
	'eq',
	'ne',
	'gt',
	'lt',
]
export const OPERATORS_WITH_VALUE: ConditionOperator[] = [
	'eq',
	'ne',
	'gt',
	'lt',
]

const OPERATOR_LABEL_PREFIX = 'dms_mailing.editor.operators'
const EMPTY_VALUE_PLACEHOLDER = '…'

const quote = (value: string): string =>
	value !== '' && !Number.isNaN(Number(value)) ? value : `"${value}"`

type ConditionCompiler = (condition: Condition) => string

const COMPILERS: Record<ConditionOperator, ConditionCompiler> = {
	truthy: (condition) => `{{#if ${condition.path}}}`,
	falsy: (condition) => `{{#unless ${condition.path}}}`,
	eq: (condition) => `{{#if (eq ${condition.path} ${quote(condition.value)})}}`,
	ne: (condition) =>
		`{{#unless (eq ${condition.path} ${quote(condition.value)})}}`,
	gt: (condition) => `{{#if (gt ${condition.path} ${quote(condition.value)})}}`,
	lt: (condition) => `{{#if (lt ${condition.path} ${quote(condition.value)})}}`,
}

export function compileCondition(condition: Condition): string {
	return COMPILERS[condition.operator](condition)
}

export type OperatorTranslator = (key: string) => string

export function describeCondition(
	condition: Condition,
	t: OperatorTranslator,
): string {
	const label = t(`${OPERATOR_LABEL_PREFIX}.${condition.operator}`)
	if (!OPERATORS_WITH_VALUE.includes(condition.operator))
		return `${condition.path} ${label}`
	return `${condition.path} ${label} ${condition.value || EMPTY_VALUE_PLACEHOLDER}`
}

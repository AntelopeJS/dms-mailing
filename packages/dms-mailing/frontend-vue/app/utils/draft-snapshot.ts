import { BLOCK_TYPES, VARIABLE_TYPES } from '../types/mailing'
import type {
	Block,
	LocaleContent,
	TemplateContent,
	VariableDefinition,
} from '../types/mailing'
import { OPERATORS } from './conditions'
import { isBoolean, isNumber, isRecord, isString } from './guards'

/** What one undo step restores: the content and the declarations. */
export interface DraftSnapshot {
	content: TemplateContent
	variables: VariableDefinition[]
}

const ALIGNS = new Set(['left', 'center', 'right'])
const OPERATOR_NAMES = new Set<string>(OPERATORS)
const BLOCK_TYPE_NAMES = new Set<string>(BLOCK_TYPES)
const VARIABLE_TYPE_NAMES = new Set<string>(VARIABLE_TYPES)

const hasStrings =
	(...keys: string[]) =>
	(value: unknown): boolean =>
		isRecord(value) && keys.every((key) => isString(value[key]))

const hasNumber =
	(key: string) =>
	(value: unknown): boolean =>
		isRecord(value) && isNumber(value[key])

function hasAlign(value: unknown): boolean {
	if (isRecord(value)) return isString(value.align) && ALIGNS.has(value.align)
	return false
}

const allOf =
	(...checks: (typeof hasAlign)[]) =>
	(value: unknown): boolean =>
		isRecord(value) && checks.every((check) => check(value))

function hasOperator(value: unknown): boolean {
	if (isRecord(value))
		return isString(value.operator) && OPERATOR_NAMES.has(value.operator)
	return false
}

const isCondition = allOf(hasStrings('path', 'value'), hasOperator)

function isBlockList(value: unknown): value is Block[] {
	return Array.isArray(value) && value.every(isBlock)
}

function hasBranches(value: unknown): boolean {
	if (isRecord(value))
		return (
			isCondition(value.condition) &&
			isBlockList(value.children) &&
			(value.elseChildren === null || isBlockList(value.elseChildren))
		)
	return false
}

const FIELD_CHECKS = new Map([
	['hero', hasStrings('imageUrl', 'alt')],
	['heading', allOf(hasStrings('text'), hasAlign, hasNumber('size'))],
	['paragraph', allOf(hasStrings('text'), hasAlign)],
	['code', hasStrings('text')],
	['list', hasStrings('source', 'labelPath', 'valuePath')],
	['total', hasStrings('label', 'value')],
	['button', allOf(hasStrings('text', 'href'), hasAlign)],
	['if', hasBranches],
	['divider', allOf()],
	['footer', hasStrings('text', 'unsubscribeLabel', 'preferencesLabel')],
])

/** Whether `value` is a block whose fields, and nested blocks, all hold their types. */
export function isBlock(value: unknown): value is Block {
	return (
		isRecord(value) &&
		isString(value.id) &&
		(value.visibleIf === null || isCondition(value.visibleIf)) &&
		isString(value.type) &&
		BLOCK_TYPE_NAMES.has(value.type) &&
		(FIELD_CHECKS.get(value.type)?.(value) ?? false)
	)
}

function isLocaleContent(value: unknown): value is LocaleContent {
	return (
		isRecord(value) &&
		hasStrings('subject', 'preheader')(value) &&
		isBlockList(value.blocks)
	)
}

function isTemplateContent(value: unknown): value is TemplateContent {
	return (
		isRecord(value) &&
		isRecord(value.locales) &&
		Object.values(value.locales).every(isLocaleContent)
	)
}

function isVariableDefinition(value: unknown): value is VariableDefinition {
	return (
		isRecord(value) &&
		isString(value.path) &&
		isString(value.type) &&
		VARIABLE_TYPE_NAMES.has(value.type) &&
		isBoolean(value.required)
	)
}

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
	return (
		isRecord(value) &&
		isTemplateContent(value.content) &&
		Array.isArray(value.variables) &&
		value.variables.every(isVariableDefinition)
	)
}

/** The snapshot of a draft, as the history stores it. */
export const snapshotOf = (draft: DraftSnapshot): string =>
	JSON.stringify({ content: draft.content, variables: draft.variables })

/** The draft a stored snapshot holds; `null` for one that is not a draft. */
export function parseSnapshot(snapshot: string): DraftSnapshot | null {
	const parsed: unknown = JSON.parse(snapshot)
	return isDraftSnapshot(parsed) ? parsed : null
}

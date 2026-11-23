import { childObject, isJsonObject, ownValue } from './guards'
import type { JsonObject, JsonValue } from './guards'
import { readPath } from './paths'
import type { VariableType } from '../types/mailing'

export interface SnippetVariable {
	path: string
	type: VariableType
}

export interface SendSnippetInput {
	slug: string
	locale: string
	/**
	 * The paths the content uses, declared or only detected, and the system
	 * URLs its footer links need (`utils/system-variables.ts`).
	 */
	variables: SnippetVariable[]
	/** The template's test data: example values where it has them. */
	testData: JsonObject
}

const EXAMPLE_VALUES: Record<VariableType, JsonValue> = {
	string: '…',
	text: '…',
	number: 0,
	money: 0,
	date: '2026-01-31',
	url: 'https://…',
	boolean: true,
	array: [],
}

const ARRAY_SUFFIX = '[]'
const PATH_SEPARATOR = '.'
const INDENT = '  '
const JSON_INDENT = 2
const QUOTED_IDENTIFIER_KEY = /"([A-Z_$][\w$]*)":/gi

/** A list item path (`order.items[].name`) stands for its list. */
function rootVariable(variable: SnippetVariable): SnippetVariable {
	const at = variable.path.indexOf(ARRAY_SUFFIX)
	return at < 0 ? variable : { path: variable.path.slice(0, at), type: 'array' }
}

/** Sets `value` at a dotted path, never over a branch a deeper path built. */
function setPath(tree: JsonObject, path: string, value: JsonValue): void {
	const keys = path.split(PATH_SEPARATOR)
	const leaf = keys.at(-1) ?? path
	const parent = keys.slice(0, -1).reduce(childObject, tree)
	if (!isJsonObject(ownValue(parent, leaf))) parent[leaf] = value
}

/** The variables a send passes, as one object of example values. */
export function exampleVariables(input: SendSnippetInput): JsonObject {
	const tree: JsonObject = {}
	input.variables
		.map(rootVariable)
		.filter((variable) => variable.path)
		.forEach((variable) => {
			const example = readPath(input.testData, variable.path)
			setPath(
				tree,
				variable.path,
				example ?? EXAMPLE_VALUES[variable.type] ?? EXAMPLE_VALUES.string,
			)
		})
	return tree
}

function literal(value: JsonValue): string {
	return JSON.stringify(value, null, JSON_INDENT)
		.replace(QUOTED_IDENTIFIER_KEY, '$1:')
		.split('\n')
		.join(`\n${INDENT}`)
}

/**
 * The `SendTemplate` call that sends this template from code: every
 * parameter the interface requires, and the variables its content uses.
 */
export function sendSnippet(input: SendSnippetInput): string {
	return [
		`await SendTemplate(${JSON.stringify(input.slug)}, {`,
		`${INDENT}tenantId,`,
		`${INDENT}to: customer.email,`,
		`${INDENT}locale: ${JSON.stringify(input.locale)},`,
		`${INDENT}variables: ${literal(exampleVariables(input))},`,
		'});',
	].join('\n')
}

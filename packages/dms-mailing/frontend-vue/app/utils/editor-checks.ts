import type { Block, IfBlock, VariableDefinition } from '../types/mailing'
import { flattenBlocks } from './blocks/tree'
import { evaluateCondition } from './conditions'
import { isPresent, readPath } from './paths'

export type EditorCheckState = 'ok' | 'warn' | 'info'

/** A check before the i18n pass: its key and the values it interpolates. */
export interface EditorCheck {
	id: string
	state: EditorCheckState
	key: string
	params: Record<string, string | number>
}

/** What the checks read: declarations, used paths, test data, blocks. */
export interface CheckInput {
	variables: VariableDefinition[]
	detected: string[]
	data: Record<string, unknown>
	blocks: Block[]
}

const CHECK_KEY_PREFIX = 'dms_mailing.editor.checks'
const WARNING_STATES: EditorCheckState[] = ['warn']

const check = (
	id: string,
	state: EditorCheckState,
	key: string,
	params: Record<string, string | number> = {},
): EditorCheck => ({ id, state, key: `${CHECK_KEY_PREFIX}.${key}`, params })

/** Paths the content uses that no declaration covers. */
export function undeclaredPaths(
	detected: string[],
	variables: VariableDefinition[],
): string[] {
	const declared = new Set(variables.map((variable) => variable.path))
	return detected.filter((path) => !declared.has(path))
}

/** Required declarations the data set does not provide. */
export function missingRequired(
	variables: VariableDefinition[],
	data: Record<string, unknown>,
): string[] {
	return variables
		.filter((variable) => variable.required)
		.map((variable) => variable.path)
		.filter((path) => !isPresent(readPath(data, path)))
}

/** The failed checks the publish review warns about. */
export function publishChecks(input: CheckInput): EditorCheck[] {
	return [
		...undeclaredPaths(input.detected, input.variables).map((path) =>
			check(`undeclared-${path}`, 'warn', 'undeclared', { path }),
		),
		...missingRequired(input.variables, input.data).map((path) =>
			check(`required-${path}`, 'warn', 'required_missing', { path }),
		),
	]
}

function requiredCheck(input: CheckInput): EditorCheck[] {
	const required = input.variables.filter((variable) => variable.required)
	if (!required.length) return []
	const missing = missingRequired(input.variables, input.data)
	if (!missing.length)
		return [
			check('required', 'ok', 'required_covered', { count: required.length }),
		]
	return missing
		.filter((path) => !input.detected.includes(path))
		.map((path) =>
			check(`required-${path}`, 'warn', 'required_missing', { path }),
		)
}

function coverageChecks(input: CheckInput): EditorCheck[] {
	const undeclared = new Set(undeclaredPaths(input.detected, input.variables))
	return input.detected
		.filter((path) => !isPresent(readPath(input.data, path)))
		.map((path) =>
			check(
				`missing-${path}`,
				'warn',
				undeclared.has(path) ? 'missing_undeclared' : 'missing',
				{ path },
			),
		)
}

function conditionChecks(input: CheckInput): EditorCheck[] {
	return flattenBlocks(input.blocks)
		.filter((block): block is IfBlock => block.type === 'if')
		.map((block) => {
			const result = evaluateCondition(block.condition, input.data)
			return check(
				`condition-${block.id}`,
				'info',
				result ? 'condition_true' : 'condition_false',
				{ path: block.condition.path },
			)
		})
}

/** The Test data tab's checks: coverage, then how each condition evaluates. */
export function testDataChecks(input: CheckInput): EditorCheck[] {
	return [
		...requiredCheck(input),
		...coverageChecks(input),
		...conditionChecks(input),
	]
}

/** How many checks need a look: the Test data tab's badge. */
export function openIssueCount(checks: EditorCheck[]): number {
	return checks.filter((entry) => WARNING_STATES.includes(entry.state)).length
}

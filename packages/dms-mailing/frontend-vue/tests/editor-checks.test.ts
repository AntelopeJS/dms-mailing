import { describe, expect, it } from 'vitest'
import {
	missingRequired,
	openIssueCount,
	publishChecks,
	testDataChecks,
	undeclaredPaths,
} from '../app/utils/editor-checks'
import type { Block, VariableDefinition } from '../app/types/mailing'

const VARIABLES: VariableDefinition[] = [
	{ path: 'order.number', type: 'string', required: true },
	{ path: 'order.isFirstOrder', type: 'boolean', required: false },
]

const BLOCKS: Block[] = [
	{
		id: 'if1',
		type: 'if',
		condition: { path: 'order.isFirstOrder', operator: 'truthy', value: '' },
		children: [],
		elseChildren: null,
		visibleIf: null,
	},
]

const INPUT = {
	variables: VARIABLES,
	detected: ['order.number', 'order.isFirstOrder', 'order.trackingUrl'],
	data: { order: { number: '#1', isFirstOrder: false } },
	blocks: BLOCKS,
}

describe('editor checks', () => {
	it('finds undeclared paths and required ones missing from the data', () => {
		expect(undeclaredPaths(INPUT.detected, VARIABLES)).toEqual([
			'order.trackingUrl',
		])
		expect(missingRequired(VARIABLES, {})).toEqual(['order.number'])
		expect(missingRequired(VARIABLES, INPUT.data)).toEqual([])
	})
	it('lists the publish warnings', () => {
		expect(
			publishChecks({ ...INPUT, data: {} }).map((check) => check.key),
		).toEqual([
			'dms_mailing.editor.checks.undeclared',
			'dms_mailing.editor.checks.required_missing',
		])
	})
	it('reports coverage and how each condition evaluates', () => {
		const checks = testDataChecks(INPUT)
		expect(
			checks.map((check) => [check.state, check.key.split('.').at(-1)]),
		).toEqual([
			['ok', 'required_covered'],
			['warn', 'missing_undeclared'],
			['info', 'condition_false'],
		])
		expect(checks[0]?.params).toEqual({ count: 1 })
		expect(openIssueCount(checks)).toBe(1)
	})
	it('flags a required variable the content does not use when the data lacks it', () => {
		const checks = testDataChecks({ ...INPUT, detected: [], data: {} })
		expect(checks.map((check) => check.key.split('.').at(-1))).toEqual([
			'required_missing',
			'condition_false',
		])
	})
})

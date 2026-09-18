import { describe, expect, it } from 'vitest'
import { mergeVariables } from '../app/utils/variables'
import type { VariableDefinition } from '../app/types/mailing'

const DECLARED: VariableDefinition[] = [
	{ path: 'order.total', type: 'money', required: true },
	{ path: 'legacy.path', type: 'string', required: false },
]

describe('mergeVariables', () => {
	it('enriches a detected path with its declaration', () => {
		const merged = mergeVariables(['order.total'], DECLARED)
		expect(merged[0]).toEqual({
			path: 'order.total',
			type: 'money',
			required: true,
			usage: 'declared',
		})
	})

	it('gives a detected path with no declaration a neutral default', () => {
		const merged = mergeVariables(['customer.firstName'], [])
		expect(merged[0]).toEqual({
			path: 'customer.firstName',
			type: 'string',
			required: false,
			usage: 'detected',
		})
	})

	it('lists a declared path the content no longer uses as unused, last', () => {
		const merged = mergeVariables(['order.total'], DECLARED)
		expect(merged.map((entry) => entry.path)).toEqual([
			'order.total',
			'legacy.path',
		])
		expect(merged[1]?.usage).toBe('unused')
	})

	it('answers the declarations alone when nothing is detected', () => {
		expect(mergeVariables([], DECLARED).map((entry) => entry.usage)).toEqual([
			'unused',
			'unused',
		])
	})
})

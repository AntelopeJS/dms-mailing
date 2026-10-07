import { describe, expect, it } from 'vitest'
import {
	OPERATORS_WITH_VALUE,
	compileCondition,
	describeCondition,
	evaluateCondition,
} from '../app/utils/conditions'

describe('conditions', () => {
	it('compiles to the handlebars-like display form', () => {
		expect(
			compileCondition({
				path: 'order.hasGift',
				operator: 'truthy',
				value: '',
			}),
		).toBe('{{#if order.hasGift}}')
		expect(
			compileCondition({ path: 'order.total', operator: 'gt', value: '100' }),
		).toBe('{{#if (gt order.total 100)}}')
		expect(
			compileCondition({ path: 'country', operator: 'eq', value: 'BE' }),
		).toBe('{{#if (eq country "BE")}}')
		expect(compileCondition({ path: 'x', operator: 'falsy', value: '' })).toBe(
			'{{#unless x}}',
		)
	})
	it('describes with translated operator labels', () => {
		expect(
			describeCondition(
				{ path: 'a', operator: 'ne', value: '1' },
				(key) => key.split('.').at(-1) ?? key,
			),
		).toBe('a ne 1')
		expect(OPERATORS_WITH_VALUE).toEqual(['eq', 'ne', 'gt', 'lt'])
	})
})

describe('evaluateCondition', () => {
	const data = { order: { total: 120, country: 'BE', isFirstOrder: false } }
	it('evaluates like the backend engine', () => {
		expect(
			evaluateCondition(
				{ path: 'order.isFirstOrder', operator: 'truthy', value: '' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'order.isFirstOrder', operator: 'falsy', value: '' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.country', operator: 'eq', value: 'BE' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.country', operator: 'ne', value: 'BE' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'order.total', operator: 'gt', value: '100' },
				data,
			),
		).toBe(true)
		expect(
			evaluateCondition(
				{ path: 'order.total', operator: 'lt', value: '100' },
				data,
			),
		).toBe(false)
		expect(
			evaluateCondition(
				{ path: 'missing.path', operator: 'truthy', value: '' },
				data,
			),
		).toBe(false)
	})
})

import { describe, expect, it } from 'vitest'
import {
	OPERATORS_WITH_VALUE,
	compileCondition,
	describeCondition,
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

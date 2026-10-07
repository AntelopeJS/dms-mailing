import { describe, expect, it } from 'vitest'
import {
	interpolateText,
	resolveToken,
	splitRawSegments,
	splitTokens,
} from '../app/utils/tokens'

describe('splitTokens', () => {
	it('splits text into literal and token parts', () => {
		expect(splitTokens('Hi {{ customer.firstName }}!')).toEqual([
			{ kind: 'text', value: 'Hi ' },
			{ kind: 'token', value: 'customer.firstName' },
			{ kind: 'text', value: '!' },
		])
	})
})

describe('token values', () => {
	const data = { customer: { firstName: 'Margaux' }, order: { lines: [1] } }
	it('resolves a token against test data', () => {
		expect(resolveToken('customer.firstName', data)).toEqual({
			isPresent: true,
			text: 'Margaux',
		})
		expect(resolveToken('order.lines', data)).toEqual({
			isPresent: true,
			text: '[1]',
		})
		expect(resolveToken('order.total', data)).toEqual({
			isPresent: false,
			text: 'order.total',
		})
	})
	it('interpolates the tokens it can and keeps the others', () => {
		expect(
			interpolateText('Hi {{ customer.firstName }}, {{order.total}}', data),
		).toBe('Hi Margaux, {{order.total}}')
	})
	it('keeps the raw spelling of each token for the highlight layer', () => {
		expect(splitRawSegments('a {{ x.y }}b')).toEqual([
			{ kind: 'text', raw: 'a ', value: 'a ' },
			{ kind: 'token', raw: '{{ x.y }}', value: 'x.y' },
			{ kind: 'text', raw: 'b', value: 'b' },
		])
	})
})

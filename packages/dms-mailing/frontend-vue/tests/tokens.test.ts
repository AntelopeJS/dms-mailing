import { describe, expect, it } from 'vitest'
import { splitTokens } from '../app/utils/tokens'

describe('splitTokens', () => {
	it('splits text into literal and token parts', () => {
		expect(splitTokens('Hi {{ customer.firstName }}!')).toEqual([
			{ kind: 'text', value: 'Hi ' },
			{ kind: 'token', value: 'customer.firstName' },
			{ kind: 'text', value: '!' },
		])
	})
})

import { describe, expect, it } from 'vitest'
import { dmsTags, knownComponents } from './helpers/component-tags'

describe('the DMS components the layer renders', () => {
	it('names only components the installed DMS or this layer registers', async () => {
		const known = await knownComponents()
		const unknown = (await dmsTags()).filter(
			(use) => !known.has(use.split(': ')[1] ?? ''),
		)
		expect(unknown).toEqual([])
	})
})

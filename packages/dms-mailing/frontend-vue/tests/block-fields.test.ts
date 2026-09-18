import { describe, expect, it } from 'vitest'
import { fieldsFor } from '../app/utils/blocks/fields'

describe('fieldsFor', () => {
	it('lists the editable fields of each block type', () => {
		expect(fieldsFor('button').map((field) => field.key)).toEqual([
			'text',
			'href',
			'align',
		])
		expect(fieldsFor('heading').map((field) => field.key)).toEqual([
			'text',
			'align',
			'size',
		])
		expect(fieldsFor('divider')).toEqual([])
		expect(fieldsFor('list').map((field) => field.kind)).toEqual([
			'text',
			'text',
			'text',
		])
	})
})

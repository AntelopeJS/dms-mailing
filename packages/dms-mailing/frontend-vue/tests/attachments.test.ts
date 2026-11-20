import { describe, expect, it } from 'vitest'
import { formatFileSize, sentAttachments } from '../app/utils/attachments'

const FILE = { filename: 'invoice.pdf', size: 120 }

describe('sentAttachments', () => {
	it('reads the files the send log kept', () => {
		expect(sentAttachments(JSON.stringify([FILE]))).toEqual([FILE])
	})

	it('reads nothing from an absent, broken or foreign value', () => {
		expect(sentAttachments(undefined)).toEqual([])
		expect(sentAttachments('{not json')).toEqual([])
		expect(sentAttachments('{"filename":"a"}')).toEqual([])
		expect(sentAttachments('[{"filename":"a"}]')).toEqual([])
	})
})

describe('formatFileSize', () => {
	it('writes kilobytes, never zero', () => {
		expect(formatFileSize(120, 'en')).toBe('1 kB')
		expect(formatFileSize(2048, 'en')).toBe('2 kB')
	})
})

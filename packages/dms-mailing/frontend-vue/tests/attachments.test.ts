import { describe, expect, it } from 'vitest'
import {
	formatFileSize,
	sentAttachments,
	shortHash,
} from '../app/utils/attachments'

const FILE = {
	filename: 'invoice.pdf',
	contentType: 'application/pdf',
	size: 120,
	sha256: '0123456789abcdef',
}

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
	it('picks the unit that keeps the figure readable', () => {
		expect(formatFileSize(512, 'en')).toBe('512 byte')
		expect(formatFileSize(2048, 'en')).toBe('2 kB')
		expect(formatFileSize(2.5 * 1024 * 1024, 'en')).toBe('2.5 MB')
	})
})

describe('shortHash', () => {
	it('keeps the first twelve characters', () => {
		expect(shortHash(FILE.sha256)).toBe('0123456789ab')
	})
})

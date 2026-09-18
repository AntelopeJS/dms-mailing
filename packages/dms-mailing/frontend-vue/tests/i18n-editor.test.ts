import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/mailing-en-GB.json'
import fr from '../i18n/locales/mailing-fr-FR.json'

function keysOf(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null) return [prefix]
	return Object.entries(value).flatMap(([key, child]) =>
		keysOf(child, prefix ? `${prefix}.${key}` : key),
	)
}

describe('editor locales', () => {
	it('carry the same key set', () => {
		expect(keysOf(fr).sort()).toEqual(keysOf(en).sort())
	})
	it('cover the namespaces the editor uses', () => {
		for (const namespace of ['editor', 'blocks']) {
			expect(en.dms_mailing).toHaveProperty(namespace)
		}
	})
})

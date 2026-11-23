import { describe, expect, it } from 'vitest'
import { localizeStarters, starterNameKey } from '../app/utils/starters'

const FRENCH = new Map([
	['dms_mailing.starters.names.order-confirmed', 'Confirmation de commande'],
])
const translate = (key: string): string | undefined => FRENCH.get(key)

describe('localizeStarters', () => {
	it('names a known starter in the interface language, else as shipped', () => {
		const starters = [
			{ id: 'order-confirmed', name: 'Order confirmation' },
			{ id: 'custom', name: 'Custom starter' },
		].map((starter) => ({
			...starter,
			slug: starter.id,
			category: 'orders',
			locales: ['en', 'fr'],
		}))
		expect(
			localizeStarters(starters, translate).map((starter) => starter.name),
		).toEqual(['Confirmation de commande', 'Custom starter'])
		expect(starterNameKey('custom')).toBe('dms_mailing.starters.names.custom')
	})
})

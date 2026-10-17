import { describe, expect, it } from 'vitest'
import {
	defaultCategoryLabelKey,
	localizeCategories,
	toStoredCategories,
	translationOf,
} from '../app/utils/categories'
import { displayText } from '../app/utils/i18n-text'
import { localizeStarters, starterNameKey } from '../app/utils/starters'

const FRENCH: Record<string, string> = {
	'dms_mailing.categories.defaults.orders': 'Commandes',
	'dms_mailing.categories.defaults.billing': 'Facturation',
	'dms_mailing.starters.names.order-confirmed': 'Confirmation de commande',
	'acme.mails.category': 'Installations',
	'acme.mails.welcome': 'Bienvenue chez Acme',
}
const translate = (key: string): string | undefined => FRENCH[key]

describe('localizeCategories', () => {
	it('translates a shipped category nobody renamed', () => {
		const [orders] = localizeCategories(
			[{ id: 'orders', label: 'Orders', icon: 'i-ph-package' }],
			translate,
		)
		expect(orders).toEqual({
			id: 'orders',
			label: 'Commandes',
			icon: 'i-ph-package',
		})
	})
	it('keeps a label someone wrote, and a category it cannot translate', () => {
		const categories = [
			{ id: 'billing', label: 'Invoices & receipts', icon: 'i-ph-file-text' },
			{ id: 'forms', label: 'Forms', icon: 'i-ph-textbox' },
			{ id: 'news', label: 'News', icon: 'i-ph-newspaper' },
		]
		expect(localizeCategories(categories, translate)).toEqual(categories)
		expect(defaultCategoryLabelKey(categories[2]!)).toBeUndefined()
	})
})

describe('declared i18n keys', () => {
	it('reads a `$` name in the interface language, the bare key when missing', () => {
		expect(displayText('$acme.mails.welcome', translate)).toBe(
			'Bienvenue chez Acme',
		)
		expect(displayText('$acme.mails.unknown', translate)).toBe(
			'acme.mails.unknown',
		)
		expect(displayText('Welcome $5 off', translate)).toBe('Welcome $5 off')
	})

	it('translates a category declared under a key', () => {
		const [declared] = localizeCategories(
			[{ id: 'acme', label: '$acme.mails.category', icon: 'i-ph-sun' }],
			translate,
		)
		expect(declared?.label).toBe('Installations')
	})

	it('stores the key back when the shown translation is left as it is', () => {
		const stored = [
			{ id: 'acme', label: '$acme.mails.category', icon: 'i-ph-sun' },
			{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
		]
		const rows = localizeCategories(stored, translate).map(
			(category, index) => ({
				...category,
				key: category.id,
				isNew: false,
				translated: translationOf(stored[index], category),
			}),
		)
		expect(toStoredCategories(rows)).toEqual(stored)
		rows[1]!.label = 'Achats'
		expect(toStoredCategories(rows)[1]?.label).toBe('Achats')
	})
})

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

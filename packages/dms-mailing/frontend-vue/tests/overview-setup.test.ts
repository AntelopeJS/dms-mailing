import { describe, expect, it } from 'vitest'
import { needsSetup, setupSteps } from '../app/utils/overview-setup'
import { splitCount, translationKeyOf } from '../app/utils/attention'

describe('setupSteps', () => {
	it('marks the first step left as current', () => {
		const steps = setupSteps({
			isProviderConnected: false,
			isSenderSet: true,
			templateCount: 0,
		})
		expect(steps.map((step) => step.state)).toEqual([
			'done',
			'current',
			'done',
			'todo',
		])
		expect(steps.map((step) => step.number)).toEqual([1, 2, 3, 4])
	})

	it('links each step to where it is done', () => {
		const steps = setupSteps({
			isProviderConnected: true,
			isSenderSet: false,
			templateCount: 0,
		})
		expect(steps.find((step) => step.state === 'current')).toMatchObject({
			id: 'sender',
			to: '/modules/mailing/settings#sender',
		})
	})
})

describe('needsSetup', () => {
	it('holds the dashboard back until a provider and a template exist', () => {
		expect(
			needsSetup({
				isProviderConnected: false,
				isSenderSet: true,
				templateCount: 3,
			}),
		).toBe(true)
		expect(
			needsSetup({
				isProviderConnected: true,
				isSenderSet: false,
				templateCount: 0,
			}),
		).toBe(true)
		expect(
			needsSetup({
				isProviderConnected: true,
				isSenderSet: false,
				templateCount: 1,
			}),
		).toBe(false)
	})
})

describe('attention titles', () => {
	it('splits a title around its figure', () => {
		expect(splitCount('3 sends failed today', 3, '3')).toEqual({
			before: '',
			count: '3',
			after: ' sends failed today',
		})
		expect(splitCount('Back in stock is live', undefined, '')).toBeNull()
		expect(splitCount('No figure here', 4, '4')).toBeNull()
	})

	it('reads the i18n key a backend string carries', () => {
		expect(translationKeyOf('$dms_mailing.attention.x')).toBe(
			'dms_mailing.attention.x',
		)
		expect(translationKeyOf('Plain text')).toBeNull()
	})
})

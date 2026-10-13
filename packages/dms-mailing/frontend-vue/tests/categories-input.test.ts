import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import CategoriesInput from '../app/components/CategoriesInput.vue'
import {
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	type Mounted,
} from './helpers/nuxt-globals'
import type { TemplateCategory } from '../app/types/mailing'

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => ({
		categoryUsage: async () => ({ counts: {} }),
	}),
}))

vi.mock('../app/composables/useLocalizedDefaults', () => ({
	useLocalizedDefaults: () => ({
		categories: (list: TemplateCategory[]) => list,
	}),
}))

const CATEGORIES: TemplateCategory[] = [
	{ id: 'orders', label: 'Orders', icon: 'i-ph-package' },
	{ id: 'marketing', label: 'Marketing', icon: 'i-ph-sparkle' },
]
const ROW_ERROR = 'dms_mailing.settings.categories.label_required'

const formErrors = reactive(new Map<string, string>())

interface FormFieldStubProps {
	name: string
	errorPattern?: RegExp
}

function fieldError(props: FormFieldStubProps): string | undefined {
	const match = [...formErrors].find(
		([name]) => name === props.name || props.errorPattern?.test(name),
	)
	return match?.[1]
}

const FormFieldStub = defineComponent({
	props: {
		name: { type: String, required: true },
		errorPattern: { type: RegExp, default: undefined },
	},
	setup:
		(props, { slots }) =>
		() =>
			h('div', { 'data-row': props.name }, [
				slots.default?.(),
				h(
					'div',
					{ 'data-slot': 'error' },
					slots.error?.({ error: fieldError(props) }),
				),
			]),
})

const ButtonStub = defineComponent({
	inheritAttrs: false,
	props: { icon: { type: String, default: '' } },
	setup:
		(props, { attrs }) =>
		() =>
			h('button', { ...attrs, 'data-icon': props.icon }),
})

function mountInput(): Mounted {
	return mount(
		CategoriesInput,
		{ modelValue: CATEGORIES, initialValue: CATEGORIES },
		{
			UFormField: FormFieldStub,
			UButton: ButtonStub,
			UPopover: slotStub('UPopover'),
			DmsEyebrow: slotStub('DmsEyebrow'),
			DmsInputText: slotStub('DmsInputText'),
		},
	)
}

function alerts(host: HTMLElement): HTMLElement[] {
	return [...host.querySelectorAll<HTMLElement>('[role="alert"]')]
}

describe('CategoriesInput', () => {
	let mounted: Mounted | undefined

	beforeEach(() => {
		stubNuxtGlobals()
		formErrors.clear()
	})

	afterEach(() => {
		mounted?.unmount()
		vi.unstubAllGlobals()
	})

	it('leaves the error line of a valid row empty', async () => {
		mounted = mountInput()
		await flush()
		expect(alerts(mounted.host)).toHaveLength(0)
		const lines = mounted.host.querySelectorAll('[data-slot="error"]')
		expect([...lines].every((line) => line.matches(':empty'))).toBe(true)
	})

	it('shows an error under the row it names only', async () => {
		mounted = mountInput()
		formErrors.set('categories.1.label', ROW_ERROR)
		await flush()
		const shown = alerts(mounted.host)
		expect(shown).toHaveLength(1)
		expect(shown[0]?.textContent?.trim()).toBe(ROW_ERROR)
		expect(shown[0]?.closest('[data-row]')?.getAttribute('data-row')).toBe(
			'categories.1.label',
		)
	})

	it('starts a new row with an icon no other row uses', async () => {
		mounted = mountInput()
		await flush()
		const add = mounted.host.querySelector<HTMLElement>(
			'button[label="dms_mailing.settings.categories.add"]',
		)
		add?.click()
		await flush()
		const pickers = mounted.host.querySelectorAll(
			'button[aria-label="dms_mailing.settings.categories.change_icon"]',
		)
		expect(pickers).toHaveLength(CATEGORIES.length + 1)
		expect(pickers[CATEGORIES.length]?.getAttribute('data-icon')).toBe(
			'i-ph-lock',
		)
	})
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onBeforeUnmount, ref } from 'vue'
import OverviewGate from '../app/components/OverviewGate.vue'
import type { SetupFacts } from '../app/utils/overview-setup'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'

const api = { setupFacts: vi.fn() }
const hidesPeriod = ref(false)

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => api,
}))

vi.mock('../app/composables/useOverviewSetup', () => ({
	useSetupHidesPeriod: () => hidesPeriod,
}))

interface ButtonAction {
	label: string
	onClick: () => void
}

const EmptyStateStub = defineComponent({
	props: {
		title: { type: String, default: '' },
		actions: { type: Array, default: () => [] },
	},
	setup: (props) => () =>
		h('div', { 'data-empty-state': '' }, [
			props.title,
			...(props.actions as ButtonAction[]).map((action) =>
				h('button', { onClick: action.onClick }, action.label),
			),
		]),
})

const ButtonStub = defineComponent({
	props: { label: { type: String, default: '' } },
	emits: ['click'],
	setup:
		(props, { emit }) =>
		() =>
			h('button', { onClick: () => emit('click') }, props.label),
})

const ListRowStub = defineComponent({
	props: { title: { type: String, default: '' } },
	setup:
		(props, { slots }) =>
		() =>
			h('div', { 'data-step': props.title }, [
				slots.leading?.(),
				slots.trailing?.(),
			]),
})

const Dashboard = defineComponent({
	setup: () => () => h('div', { 'data-dashboard': '' }),
})

const Gate = defineComponent({
	setup: () => () => h(OverviewGate, null, { default: () => h(Dashboard) }),
})

const GLOBALS = {
	DmsCard: slotStub('DmsCard'),
	DmsEmptyState: EmptyStateStub,
	DmsIconWell: slotStub('DmsIconWell'),
	DmsListRow: ListRowStub,
	UButton: ButtonStub,
	UPopover: slotStub('UPopover'),
	USkeleton: slotStub('USkeleton'),
	UIcon: slotStub('UIcon'),
}

const facts = (overrides: Partial<SetupFacts> = {}): SetupFacts => ({
	isProviderConnected: true,
	isSenderSet: true,
	liveTemplateCount: 1,
	hasTestSend: true,
	...overrides,
})

beforeEach(() => {
	stubNuxtGlobals()
	vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
	api.setupFacts.mockReset()
	hidesPeriod.value = false
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('OverviewGate', () => {
	it('mounts nothing of the dashboard before the facts are known', () => {
		api.setupFacts.mockReturnValue(new Promise(() => undefined))
		const { host } = mount(Gate, {}, GLOBALS)
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		expect(host.querySelector('[data-stub="USkeleton"]')).not.toBeNull()
	})

	it('says the facts failed to load and retries', async () => {
		api.setupFacts.mockRejectedValueOnce(new Error('500'))
		api.setupFacts.mockResolvedValueOnce(facts())
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		host.querySelector<HTMLButtonElement>('[data-empty-state] button')?.click()
		await flush()
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
	})

	it('holds the dashboard and the period back while nothing can be sent', async () => {
		api.setupFacts.mockResolvedValue(facts({ liveTemplateCount: 0 }))
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		expect(host.querySelectorAll('[data-step]')).toHaveLength(4)
		expect(hidesPeriod.value).toBe(true)
	})

	it('lets an unfinished setup be resumed above the dashboard', async () => {
		api.setupFacts.mockResolvedValue(facts({ hasTestSend: false }))
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
		expect(host.querySelector('[data-step]')).toBeNull()
		const resume = [...host.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('dms_mailing.setup.resume'),
		)
		resume?.click()
		await flush()
		expect(host.querySelectorAll('[data-step]')).toHaveLength(4)
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
		expect(hidesPeriod.value).toBe(false)
	})

	it('offers no resume once every step is done', async () => {
		api.setupFacts.mockResolvedValue(facts())
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.textContent).not.toContain('dms_mailing.setup.resume')
	})
})

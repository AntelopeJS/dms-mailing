import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, onBeforeUnmount } from 'vue'
import FunnelCard from '../app/components/FunnelCard.vue'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'

const api = { funnel: vi.fn() }

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => api,
}))

interface EmptyStateAction {
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
			...(props.actions as EmptyStateAction[]).map((action) =>
				h('button', { onClick: action.onClick }, action.label),
			),
		]),
})

const GLOBALS = {
	DmsCard: slotStub('DmsCard'),
	DmsSegmented: slotStub('DmsSegmented'),
	DmsMeter: slotStub('DmsMeter'),
	DmsEmptyState: EmptyStateStub,
	USkeleton: slotStub('USkeleton'),
	UIcon: slotStub('UIcon'),
}

const PERIOD = {
	range: {
		from: new Date('2026-09-01T00:00:00.000Z'),
		to: new Date('2026-09-30T00:00:00.000Z'),
	},
	compareRange: null,
}

type RealtimeHandler = (event: object) => void
let realtimeHandlers: RealtimeHandler[] = []

const funnelStep = (id: string, count: number, isMeasured = true) => ({
	id,
	label: `$dms_mailing.funnel.${id}`,
	count,
	rate: count ? 100 : null,
	isMeasured,
})

beforeEach(() => {
	stubNuxtGlobals()
	vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
	vi.stubGlobal('usePeriodScope', () => computed(() => PERIOD))
	realtimeHandlers = []
	vi.stubGlobal('useRealtimeTopic', (_: string, handler: RealtimeHandler) => {
		realtimeHandlers.push(handler)
	})
	api.funnel.mockReset()
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('FunnelCard', () => {
	it('says the funnel failed to load and offers a retry', async () => {
		api.funnel.mockRejectedValueOnce(new Error('500'))
		api.funnel.mockResolvedValueOnce({ steps: [funnelStep('sent', 3)] })
		const { host } = mount(FunnelCard, {}, GLOBALS)
		await flush()

		const empty = host.querySelector('[data-empty-state]')
		expect(empty?.textContent).toContain('dms_mailing.funnel_card.error_title')
		expect(host.textContent).not.toContain('dms_mailing.funnel_card.no_drop')

		empty?.querySelector('button')?.click()
		await flush()
		expect(api.funnel).toHaveBeenCalledTimes(2)
		expect(host.querySelector('[data-empty-state]')).toBeNull()
		expect(host.querySelectorAll('[data-funnel-step]')).toHaveLength(1)
	})

	it('writes "not tracked" in place of the figures nothing measures', async () => {
		api.funnel.mockResolvedValue({
			steps: [
				funnelStep('sent', 32),
				funnelStep('delivered', 0, false),
				funnelStep('opened', 0, false),
				funnelStep('clicked', 0, false),
				funnelStep('unsubscribed', 0),
			],
		})
		const { host } = mount(FunnelCard, {}, GLOBALS)
		await flush()

		expect(host.querySelectorAll('[data-funnel-untracked]')).toHaveLength(3)
		expect(host.textContent).toContain('dms_mailing.funnel_card.untracked')
	})

	it('reloads on each event of the sends topic', async () => {
		api.funnel.mockResolvedValue({ steps: [funnelStep('sent', 1)] })
		mount(FunnelCard, {}, GLOBALS)
		await flush()
		expect(api.funnel).toHaveBeenCalledTimes(1)

		realtimeHandlers.forEach((handler) => handler({ type: 'insert' }))
		await flush()
		expect(api.funnel).toHaveBeenCalledTimes(2)
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, type App } from 'vue'
import RetentionInput from '../app/components/RetentionInput.vue'
import {
	flush,
	slotStub,
	stubNuxtGlobals,
	type NuxtStubs,
} from './helpers/nuxt-globals'
import type { RetentionPreview } from '../app/types/mailing'

const api = {
	retentionPreview: vi.fn(),
}

vi.mock('../app/composables/useMailingApi', () => ({
	useMailingApi: () => api,
}))

const SAVED_DAYS = 90
const DEBOUNCE_MS = 400

type Validator = () => boolean

interface Harness {
	state: { days: number; initial: number }
	validators: Set<Validator>
	submit: ReturnType<typeof vi.fn>
	host: HTMLElement
	app: App
}

function preview(days: number, count: number): RetentionPreview {
	return { days, count, nextRunAt: new Date().toISOString() }
}

function mountRetention(): Harness {
	const state = reactive({ days: SAVED_DAYS, initial: SAVED_DAYS })
	const validators = new Set<Validator>()
	const submit = vi.fn(async () => undefined)
	vi.stubGlobal('useEnclosingForm', () => ({
		submit,
		addValidator: (validator: Validator) => {
			validators.add(validator)
			return () => validators.delete(validator)
		},
		focusField: async () => undefined,
	}))
	const host = document.createElement('div')
	document.body.appendChild(host)
	const app = createApp({
		setup: () => () =>
			h(RetentionInput, {
				modelValue: state.days,
				initialValue: state.initial,
				'onUpdate:modelValue': (value: number) => (state.days = value),
			}),
	})
	app.component('DmsSegmented', slotStub('DmsSegmented'))
	app.component('UInputNumber', slotStub('UInputNumber'))
	app.component('UAlert', slotStub('UAlert'))
	app.config.warnHandler = () => undefined
	app.mount(host)
	return { state, validators, submit, host, app }
}

function segmented(host: HTMLElement): HTMLElement {
	return host.querySelector('[data-stub="DmsSegmented"]') as HTMLElement
}

describe('RetentionInput', () => {
	let stubs: NuxtStubs
	let harness: Harness | undefined

	beforeEach(() => {
		vi.useFakeTimers()
		stubs = stubNuxtGlobals()
		vi.stubGlobal('computed', computed)
		api.retentionPreview.mockImplementation(async (days: number) =>
			preview(days, days < SAVED_DAYS ? 3 : 0),
		)
	})

	afterEach(() => {
		harness?.app.unmount()
		harness?.host.remove()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('goes back to the preset once a custom value is discarded', async () => {
		harness = mountRetention()
		const { host, state } = harness
		const attrs = () => segmented(host).getAttribute('modelvalue')
		expect(attrs()).toBe(String(SAVED_DAYS))
		state.days = 1
		await flush()
		expect(attrs()).toBe('custom')
		state.days = SAVED_DAYS
		await flush()
		expect(attrs()).toBe(String(SAVED_DAYS))
	})

	it('holds a save deleting sends until it is confirmed', async () => {
		harness = mountRetention()
		harness.state.days = 30
		await nextTick()
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
		await flush()
		const [validator] = [...harness.validators]
		expect(validator?.()).toBe(false)
		await flush()
		expect(stubs.confirmations).toHaveLength(1)
		expect(harness.submit).toHaveBeenCalledTimes(1)
		expect(validator?.()).toBe(true)
	})

	it('lets a save through that deletes nothing', async () => {
		harness = mountRetention()
		harness.state.days = 365
		await nextTick()
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
		await flush()
		const [validator] = [...harness.validators]
		expect(validator?.()).toBe(true)
		expect(stubs.confirmations).toHaveLength(0)
		expect(harness.submit).not.toHaveBeenCalled()
	})
})

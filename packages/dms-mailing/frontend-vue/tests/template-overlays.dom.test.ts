import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTemplateDrawer } from '../app/composables/useTemplateDrawer'
import type { TemplateContent, TemplateRow } from '../app/types/mailing'
import { expectDefined } from './helpers/narrow'
import { inSetup } from './helpers/nuxt-globals'

interface Navigation {
	hasPrev: boolean
	hasNext: boolean
	next: () => void
}

interface OpenOptions {
	templateId?: string
	locale?: string
	content?: TemplateContent
	initialName?: string
	navigation?: Navigation
}

interface OpenCall {
	title: string
	component: { name: string }
	componentOptions: OpenOptions
	componentKey?: string
	direction?: string
	size?: string
}

interface Patch {
	componentKey?: string
	componentOptions?: OpenOptions
}

const drawerCalls: OpenCall[] = []
const modalCalls: OpenCall[] = []
const patches: Patch[] = []
let nextResult: boolean | undefined = undefined

function handle() {
	return {
		result: Promise.resolve(nextResult),
		patch: (patch: Patch) => patches.push(patch),
		close: () => undefined,
	}
}

beforeEach(() => {
	drawerCalls.length = 0
	modalCalls.length = 0
	patches.length = 0
	nextResult = undefined
	vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
	vi.stubGlobal('resolveComponent', (name: string) => ({ name }))
	vi.stubGlobal('useDrawer', () => ({
		open: (options: OpenCall) => {
			drawerCalls.push(options)
			return handle()
		},
	}))
	vi.stubGlobal('useModal', () => ({
		open: (options: OpenCall) => {
			modalCalls.push(options)
			return handle()
		},
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function row(id: string): TemplateRow {
	return {
		_id: id,
		slug: id,
		name: id,
		status: 'live',
		updatedAt: '',
		updatedBy: '',
		attention: '',
	}
}

describe('useTemplateDrawer', () => {
	it('opens the test send with the editor draft and locale', () => {
		const content: TemplateContent = { locales: {} }
		inSetup(useTemplateDrawer).openTestSend('t1', { locale: 'fr', content })
		expect(modalCalls[0]?.component).toEqual({ name: 'MailingTestSendModal' })
		expect(modalCalls[0]?.componentOptions).toEqual({
			templateId: 't1',
			locale: 'fr',
			content,
		})
	})

	it('calls back only when the dialog closes after a change', async () => {
		const onDone = vi.fn()
		inSetup(useTemplateDrawer).openRealSend('t1', { onDone })
		await Promise.resolve()
		await Promise.resolve()
		expect(onDone).not.toHaveBeenCalled()
		nextResult = true
		inSetup(useTemplateDrawer).openNewTemplate({
			initialName: 'Refund',
			onDone,
		})
		await Promise.resolve()
		await Promise.resolve()
		expect(onDone).toHaveBeenCalledTimes(1)
		expect(modalCalls[1]?.componentOptions).toEqual({ initialName: 'Refund' })
	})

	it('opens the details from the right and steps through the rows shown', () => {
		const rows = [row('a'), row('b'), row('c')]
		inSetup(useTemplateDrawer).openDetails(expectDefined(rows[1]), { rows })
		const call = expectDefined(drawerCalls[0])
		expect(call.direction).toBe('right')
		expect(call.component).toEqual({ name: 'MailingTemplateDrawer' })
		const navigation = expectDefined(call.componentOptions.navigation)
		expect(navigation.hasPrev).toBe(true)
		expect(navigation.hasNext).toBe(true)
		navigation.next()
		expect(patches[0]?.componentKey).toBe('c')
		const options = expectDefined(patches[0]?.componentOptions)
		expect(options.templateId).toBe('c')
		expect(expectDefined(options.navigation).hasNext).toBe(false)
	})

	it('opens the details of a bare id without navigation', () => {
		inSetup(useTemplateDrawer).openDetails('x')
		expect(drawerCalls[0]?.componentOptions.templateId).toBe('x')
		expect(drawerCalls[0]?.componentOptions.navigation).toBeUndefined()
	})
})

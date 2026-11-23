import { vi } from 'vitest'
import { useApiErrorPresenter } from '../../../node_modules/@antelopejs/dms/frontend-vue/layers/dms-core/app/composables/useApiErrorPresenter'
import {
	computed,
	createApp,
	h,
	nextTick,
	onMounted,
	reactive,
	ref,
	watch,
	type Component,
} from 'vue'
import { CheckboxStub } from './checkbox-stub'
import { InputStub } from './input-stub'
import { expectDefined } from './narrow'
import { slotStub } from './slot-stub'
import { TagsStub } from './tags-stub'

export { CheckboxStub, InputStub, slotStub, TagsStub }

export interface OverlayCall {
	title: string
	component: Component | { name: string }
	componentOptions?: object
	direction?: string
}

/** A toast a component raised. */
export interface ToastCall {
	title?: string
	description?: string
	color?: string
	icon?: string
	actions?: { label?: string; onClick: () => void }[]
}

/** The first action button of a toast, or a thrown error when it has none. */
export function firstToastAction(toast: ToastCall | undefined): {
	onClick: () => void
} {
	return expectDefined(
		expectDefined(toast, 'a toast').actions?.[0],
		'an action',
	)
}

/** A confirmation a component asked for. */
export interface ConfirmCall {
	title?: string
	description?: string
	color?: string
	icon?: string
	confirmLabel?: string
	cancelLabel?: string
	onConfirm?: () => Promise<void>
}

/** A route a component navigated to. */
export interface NavigationCall {
	path?: string
	query?: Record<string, string>
}

export interface NuxtStubs {
	modalCalls: OverlayCall[]
	drawerCalls: OverlayCall[]
	toasts: ToastCall[]
	navigations: NavigationCall[]
	confirmations: ConfirmCall[]
}

/** A value a translated message interpolates. */
export type TranslateParams = Record<string, string | number | boolean>

/** Interpolates `{name}` params so assertions can read the rendered text. */
export function translate(key: string, params?: TranslateParams): string {
	if (!params) return key
	const values = Object.entries(params)
	return `${key}${values.map(([name, value]) => ` ${name}=${String(value)}`).join('')}`
}

/**
 * Stubs the globals the DMS auto-imports in the app (Vue's API, the i18n,
 * containers, toasts, navigation), and records what the components ask of them.
 */
export function stubNuxtGlobals(email = 'camille@acme.com'): NuxtStubs {
	const stubs: NuxtStubs = {
		modalCalls: [],
		drawerCalls: [],
		toasts: [],
		navigations: [],
		confirmations: [],
	}
	const handle = () => ({
		result: Promise.resolve(undefined),
		patch: () => undefined,
		close: () => undefined,
	})
	Object.entries({
		computed,
		onMounted,
		reactive,
		ref,
		watch,
		h,
		nextTick,
	}).forEach(([name, value]) => vi.stubGlobal(name, value))
	vi.stubGlobal('useI18n', () => ({
		t: translate,
		te: () => false,
		locale: ref('en'),
	}))
	vi.stubGlobal('useTranslation', () => ({
		processApiMessage: (message: string) => message,
		processI18n: (message: string) => message,
	}))
	vi.stubGlobal('useToast', () => ({
		add: (toast: ToastCall) => {
			stubs.toasts.push(toast)
			return { id: stubs.toasts.length }
		},
	}))
	vi.stubGlobal('getPluginI18n', () => ({
		i18n: {
			tm: (key: string) =>
				key === 'error.read_only_demo'
					? 'Read-only demo, changes are not saved'
					: key,
			rt: translate,
		},
	}))
	const presented = ref(new WeakMap())
	vi.stubGlobal('useDmsState', () => presented)
	vi.stubGlobal('useApiErrorPresenter', useApiErrorPresenter)
	vi.stubGlobal('useUniqueLocales', () => ({
		uniqueLocales: ref([
			{ code: 'en', name: 'English' },
			{ code: 'fr', name: 'Français' },
			{ code: 'de', name: 'Deutsch' },
		]),
	}))
	vi.stubGlobal('useCurrentUser', () => ({ user: ref({ email }) }))
	vi.stubGlobal('resolveComponent', (name: string) => ({ name }))
	vi.stubGlobal('useModal', () => ({
		open: (call: OverlayCall) => {
			stubs.modalCalls.push(call)
			return handle()
		},
	}))
	vi.stubGlobal('useDrawer', () => ({
		open: (call: OverlayCall) => {
			stubs.drawerCalls.push(call)
			return handle()
		},
	}))
	vi.stubGlobal('useConfirm', () => ({
		confirm: async (options: ConfirmCall) => {
			stubs.confirmations.push(options)
			return true
		},
	}))
	vi.stubGlobal('navigateDms', async (route: NavigationCall) => {
		stubs.navigations.push(route)
	})
	return stubs
}

/** The props a root component mounts with. */
export type MountProps = NonNullable<Parameters<typeof createApp>[1]>

export interface Mounted {
	host: HTMLElement
	unmount: () => void
}

/** Mounts a component with stand-ins for the given global components. */
export function mount(
	component: Component,
	props: MountProps,
	globals: Record<string, Component> = {},
): Mounted {
	const host = document.createElement('div')
	document.body.appendChild(host)
	const app = createApp(component, props)
	Object.entries(globals).forEach(([name, value]) => app.component(name, value))
	app.config.warnHandler = () => undefined
	app.mount(host)
	return {
		host,
		unmount: () => {
			app.unmount()
			host.remove()
		},
	}
}

/** What `run` returns when a component's setup calls it, as a composable is used. */
export function inSetup<T>(run: () => T): T {
	const results: T[] = []
	const mounted = mount(
		{
			setup: () => {
				results.push(run())
				return () => null
			},
		},
		{},
	)
	mounted.unmount()
	return expectDefined(results[0])
}

/** Lets pending promises and the re-render they cause settle. */
export async function flush(): Promise<void> {
	for (let pass = 0; pass < 5; pass += 1) {
		await Promise.resolve()
		await nextTick()
	}
}

/** Global stand-ins every form test mounts with. */
export const FORM_STUBS = {
	UInput: InputStub,
	DmsInputText: InputStub,
	DmsInputEmail: InputStub,
	UCheckbox: CheckboxStub,
	DmsInputCheckbox: CheckboxStub,
	DmsInputTags: TagsStub,
	UFormField: slotStub('UFormField'),
	DmsFieldRow: slotStub('DmsFieldRow'),
	UFieldGroup: slotStub('UFieldGroup'),
} satisfies Record<string, Component>

/** Types into a native input and lets Vue react. */
export async function typeInto(
	input: HTMLInputElement,
	value: string,
): Promise<void> {
	const field = input
	field.value = value
	field.dispatchEvent(new Event('input'))
	field.dispatchEvent(new Event('change'))
	await flush()
}

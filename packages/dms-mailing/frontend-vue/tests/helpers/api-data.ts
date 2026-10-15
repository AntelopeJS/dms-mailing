import { vi } from 'vitest'
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

/** A backend read a component made through `useApiData`. */
export interface ApiRead {
	url: string
	query: Record<string, unknown>
}

export type ApiBackend = (read: ApiRead) => unknown

interface ApiDataOptions {
	query?: MaybeRefOrGetter<Record<string, unknown> | undefined>
	pick?: string[]
}

export interface ApiDataStub {
	/** Every read made, in order. */
	reads: ApiRead[]
	/** Answers the next reads; a thrown error or a rejection fails them. */
	respond: (backend: ApiBackend) => void
}

function picked(value: unknown, keys: string[] | undefined): unknown {
	if (!keys || !value || typeof value !== 'object') return value
	const source = value as Record<string, unknown>
	return Object.fromEntries(keys.map((key) => [key, source[key]]))
}

/**
 * Stands in for the DMS's `useApiData` (an auto-import the layer's tests do
 * not have): reads the URL, and again whenever it or its query changes, from
 * `respond`'s backend, with the result's `data`, `error`, `status` and
 * `refresh()`. Whether the server renders it and hands it over is the DMS's
 * and the renderer's, proven on the playground.
 */
export function stubApiData(): ApiDataStub {
	const stub: ApiDataStub = {
		reads: [],
		respond: (next) => {
			backend = next
		},
	}
	let backend: ApiBackend = () => ({})
	vi.stubGlobal(
		'useApiData',
		(
			url: MaybeRefOrGetter<string | null | undefined>,
			options: ApiDataOptions = {},
		) => {
			const data = ref<unknown>(null)
			const error = ref<unknown>(null)
			const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
			const request = () => ({
				url: toValue(url),
				query: toValue(options.query) ?? {},
			})
			async function refresh(): Promise<void> {
				const { url: path, query } = request()
				if (!path) return
				const read = { url: path, query }
				stub.reads.push(read)
				status.value = 'pending'
				try {
					data.value = picked(await backend(read), options.pick)
					error.value = null
					status.value = 'success'
				} catch (failure) {
					error.value = failure
					status.value = 'error'
				}
			}
			watch(
				() => JSON.stringify(request()),
				() => void refresh(),
				{
					immediate: true,
				},
			)
			return {
				data,
				error,
				status,
				pending: computed(() => status.value === 'pending'),
				refresh,
				execute: refresh,
				clear: () => {
					data.value = null
				},
			}
		},
	)
	return stub
}

/** The DMS's regional formatter, in the zone the tests run in. */
export function stubRegionalFormat(): void {
	vi.stubGlobal('useRegionalFormat', () => ({
		dateTimeFormat: (options: Intl.DateTimeFormatOptions) =>
			new Intl.DateTimeFormat('en', options),
	}))
}

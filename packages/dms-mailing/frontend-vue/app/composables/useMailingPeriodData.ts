import type { Ref } from 'vue'
import { periodQuery } from '../utils/period'

export interface PeriodDataOptions {
	/** Extra query merged into the period one; a change refetches. */
	extraQuery?: () => Record<string, string>
	/** Refetches on this interval (ms) while mounted; off when absent. */
	refreshEvery?: number
}

export interface PeriodDataState<T> {
	data: Ref<T | null>
	loading: Ref<boolean>
	/** When the data last loaded; drives "updated HH:MM". */
	updatedAt: Ref<Date | null>
	refresh: () => Promise<void>
}

/**
 * How long a scope may stay unregistered before the data loads without a
 * window (the selector hidden by a permission): the backend then answers for
 * its default period.
 */
const MISSING_SCOPE_DELAY_MS = 400

/**
 * Reads a DMS period-selector scope and re-runs `load` whenever the window
 * (or the extra query) changes. The scope registers when the selector mounts,
 * so the first run is driven by the watcher rather than by `onMounted`.
 */
export function useMailingPeriodData<T>(
	scope: string,
	load: (query: Record<string, string>) => Promise<T>,
	options: PeriodDataOptions = {},
): PeriodDataState<T> {
	const period = usePeriodScope(scope)
	const data = ref(null) as Ref<T | null>
	const loading = ref(false)
	const updatedAt = ref<Date | null>(null)
	let fallbackTimer: ReturnType<typeof setTimeout> | undefined
	let pollTimer: ReturnType<typeof setInterval> | undefined

	const query = () => ({
		...(period.value ? periodQuery(period.value) : {}),
		...(options.extraQuery?.() ?? {}),
	})

	async function refresh(): Promise<void> {
		loading.value = true
		try {
			data.value = await load(query())
			updatedAt.value = new Date()
		} catch {
			data.value = null
		} finally {
			loading.value = false
		}
	}

	function onWindow(): void {
		clearTimeout(fallbackTimer)
		if (period.value) {
			void refresh()
			return
		}
		fallbackTimer = setTimeout(() => {
			if (!period.value) void refresh()
		}, MISSING_SCOPE_DELAY_MS)
	}

	watch(
		[period, () => JSON.stringify(options.extraQuery?.() ?? {})],
		onWindow,
		{
			immediate: true,
		},
	)

	onMounted(() => {
		if (options.refreshEvery)
			pollTimer = setInterval(() => void refresh(), options.refreshEvery)
	})

	onBeforeUnmount(() => {
		clearTimeout(fallbackTimer)
		clearInterval(pollTimer)
	})

	return { data, loading, updatedAt, refresh }
}

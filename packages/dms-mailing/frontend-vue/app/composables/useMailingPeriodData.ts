import type { Ref } from 'vue'
import { periodQuery } from '../utils/period'

export interface PeriodDataState<T> {
	data: Ref<T | null>
	loading: Ref<boolean>
	refresh: () => Promise<void>
}

/**
 * Reads a DMS period-selector scope and re-runs `load` whenever the window
 * changes. The scope registers when the selector mounts, so the first run is
 * driven by the watcher rather than by `onMounted`.
 */
export function useMailingPeriodData<T>(
	scope: string,
	load: (query: Record<string, string>) => Promise<T>,
): PeriodDataState<T> {
	const period = usePeriodScope(scope)
	const data = ref(null) as Ref<T | null>
	const loading = ref(false)

	async function refresh(): Promise<void> {
		const state = period.value
		if (!state) return
		loading.value = true
		try {
			data.value = await load(periodQuery(state))
		} catch {
			data.value = null
		} finally {
			loading.value = false
		}
	}

	watch(period, refresh, { immediate: true })

	return { data, loading, refresh }
}

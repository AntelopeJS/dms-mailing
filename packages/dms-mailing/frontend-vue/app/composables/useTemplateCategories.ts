import { useLocalizedDefaults } from './useLocalizedDefaults'
import { useMailingApi } from './useMailingApi'
import type { TemplateCategory } from '../types/mailing'

/**
 * The request in flight: the components mounting together (a table's
 * category cells) share it, a later mount asks again since the settings may
 * have changed meanwhile.
 */
let pending: Promise<TemplateCategory[]> | null = null

/** The tenant's template categories, loaded once mounted. */
export function useTemplateCategories() {
	const api = useMailingApi()
	const localized = useLocalizedDefaults()
	const stored = ref<TemplateCategory[]>([])
	const categories = computed(() => localized.categories(stored.value))

	function listCategories(): Promise<TemplateCategory[]> {
		pending ??= api
			.listCategories()
			.then((response) => response.categories)
			.catch(() => [])
			.finally(() => {
				pending = null
			})
		return pending
	}

	onMounted(async () => {
		stored.value = await listCategories()
	})

	return { categories }
}

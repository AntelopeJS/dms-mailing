import { useStoredCategories } from './useMailingReads'

/**
 * The tenant's template categories, labelled in the interface's language by
 * the server: one read the components showing them share (a table's category
 * cells, the gallery), none when it failed.
 * `isAnswered` turns true once the read has answered, with the categories or
 * a failure.
 */
export function useTemplateCategories() {
	const { data, error } = useStoredCategories()
	const categories = computed(() =>
		error.value ? [] : (data.value?.categories ?? []),
	)
	const isAnswered = computed(() => Boolean(data.value || error.value))
	return { categories, isAnswered }
}

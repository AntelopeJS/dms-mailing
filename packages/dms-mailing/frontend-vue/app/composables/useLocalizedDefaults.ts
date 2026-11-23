import type { StarterSummary } from '../types/mailing'
import { localizeStarters, type OptionalTranslate } from '../utils/starters'

/**
 * The starters the module ships, named in the interface's language. Template
 * names and category labels are localized fields the server reads in the
 * interface's language.
 */
export function useLocalizedDefaults() {
	const i18n = useI18n()
	const translate: OptionalTranslate = (key) =>
		i18n.te(key) ? i18n.t(key) : undefined
	return {
		starters: (list: StarterSummary[]) => localizeStarters(list, translate),
	}
}

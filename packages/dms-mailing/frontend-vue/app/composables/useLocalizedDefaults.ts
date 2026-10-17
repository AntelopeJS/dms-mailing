import type { StarterSummary, TemplateCategory } from '../types/mailing'
import { localizeCategories } from '../utils/categories'
import { displayText, type OptionalTranslate } from '../utils/i18n-text'
import { localizeStarters } from '../utils/starters'

/**
 * What the module ships by default (starters, the first categories), and the
 * names and labels a project declares under `$` i18n keys, in the
 * interface's language, without touching what is stored.
 */
export function useLocalizedDefaults() {
	const { t, te } = useI18n()
	const translate: OptionalTranslate = (key) => (te(key) ? t(key) : undefined)
	return {
		categories: (list: TemplateCategory[]) =>
			localizeCategories(list, translate),
		starters: (list: StarterSummary[]) => localizeStarters(list, translate),
		/** A template's name: a `$` key reads in the interface's language. */
		name: (name: string) => displayText(name, translate),
	}
}

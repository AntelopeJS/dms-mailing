import { computed, type ComputedRef, type Ref } from 'vue'
import type { TemplatePerformance, TemplateRow } from '../../types/mailing'
import { SENDS_PATH } from '../../utils/pages'

/**
 * The figures of a template's drawer and the send log they link to: the
 * drawer's script run that builds them, called where it stood.
 */
export function useDrawerStats(
	template: ComputedRef<TemplateRow | null>,
	performance: Ref<TemplatePerformance | null>,
	t: ReturnType<typeof useI18n>['t'],
	uiLocale: Ref<string>,
) {
	const SENDS_TEMPLATE_KEY = 'template'
	const SENDS_VIEW_KEY = 'view'
	const PROBLEMS_VIEW = 'problems'
	const OPEN_RATE_DIGITS = 1
	const PERCENT = 100

	const formatNumber = (value: number) =>
		new Intl.NumberFormat(uiLocale.value, {
			maximumFractionDigits: OPEN_RATE_DIGITS,
		}).format(value)

	const formatPercent = (value: number) =>
		new Intl.NumberFormat(uiLocale.value, {
			style: 'percent',
			maximumFractionDigits: OPEN_RATE_DIGITS,
		}).format(value / PERCENT)

	function sendLogRoute(view?: string) {
		const templateQuery = { [SENDS_TEMPLATE_KEY]: template.value?.slug ?? '' }
		const query = view
			? { ...templateQuery, [SENDS_VIEW_KEY]: view }
			: templateQuery
		return { path: SENDS_PATH, query }
	}

	function sendLogUrl(view?: string): string {
		const { path, query } = sendLogRoute(view)
		return `${path}?${new URLSearchParams(query).toString()}`
	}

	const hasSends = computed(() => Boolean(performance.value?.sends))

	const stats = computed(() => [
		{
			id: 'sends',
			eyebrow: t('dms_mailing.templates.drawer.stats_sends'),
			value: formatNumber(performance.value?.sends ?? 0),
		},
		{
			id: 'open',
			eyebrow: t('dms_mailing.templates.drawer.stats_open'),
			value: performance.value?.sends
				? formatPercent(performance.value.openRate)
				: '—',
		},
		{
			id: 'problems',
			eyebrow: t('dms_mailing.templates.drawer.stats_problems'),
			value: formatNumber(performance.value?.problems ?? 0),
			detail: performance.value?.problems
				? t('dms_mailing.templates.drawer.problems_detail')
				: undefined,
			detailTone: 'error' as const,
			to: performance.value?.problems ? sendLogUrl(PROBLEMS_VIEW) : undefined,
		},
	])

	return { formatNumber, sendLogRoute, hasSends, stats }
}

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
	/** The send log reads these: `?template=` narrows it, `?view=` opens a tab. */
	const SENDS_TEMPLATE_KEY = 'template'
	const SENDS_VIEW_KEY = 'view'
	const PROBLEMS_VIEW = 'problems'
	const OPEN_RATE_DIGITS = 1
	const PERCENT = 100

	const formatNumber = (value: number) =>
		new Intl.NumberFormat(uiLocale.value, {
			maximumFractionDigits: OPEN_RATE_DIGITS,
		}).format(value)

	/** A rate in percent, written the reader's way ("20.8%", "20,8 %"). */
	const formatPercent = (value: number) =>
		new Intl.NumberFormat(uiLocale.value, {
			style: 'percent',
			maximumFractionDigits: OPEN_RATE_DIGITS,
		}).format(value / PERCENT)

	/** The send log narrowed to this template, on one of its tabs if given. */
	function sendLogRoute(view?: string) {
		return {
			path: SENDS_PATH,
			query: {
				[SENDS_TEMPLATE_KEY]: template.value?.slug ?? '',
				...(view ? { [SENDS_VIEW_KEY]: view } : {}),
			},
		}
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

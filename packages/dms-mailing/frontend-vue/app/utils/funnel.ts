import type { FunnelKind, FunnelStep } from '../types/mailing'

/** The step that leaks out of the funnel rather than going down it. */
export const FUNNEL_LEAK_STEP = 'unsubscribed'

export const FUNNEL_KINDS: FunnelKind[] = ['all', 'transactional', 'marketing']

export interface FunnelDrop {
	from: FunnelStep
	to: FunnelStep
	/** Share of the sends lost between the two steps, in points. */
	points: number
}

const RATE_DECIMALS = 1
const PERCENT = 100

/**
 * The biggest fall between two consecutive steps of the funnel (the leak
 * excluded), measured on the sends lost. `null` when nothing was sent or no
 * step loses anything.
 */
export function biggestDrop(steps: FunnelStep[]): FunnelDrop | null {
	const path = steps.filter((step) => step.id !== FUNNEL_LEAK_STEP)
	const total = path[0]?.count ?? 0
	if (!total) return null
	const drops = path.slice(1).map((step, index) => {
		const from = path[index] as FunnelStep
		return {
			from,
			to: step,
			points: ((from.count - step.count) / total) * PERCENT,
		}
	})
	return drops.reduce<FunnelDrop | null>(
		(best, drop) => (drop.points > (best?.points ?? 0) ? drop : best),
		null,
	)
}

/** A funnel rate as the card prints it: one decimal, none when whole. */
export function formatRate(rate: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: RATE_DECIMALS,
	}).format(rate / PERCENT)
}

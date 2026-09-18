/**
 * The DMS period selector owns the window: `PeriodState` and its `PeriodRange`
 * come from the host layer and reach us through the workspace auto-imports.
 * Declaring a second `PeriodRange` here put two entries of the same name in
 * that registry, and the host's won -- ours was silently ignored.
 */
export type PeriodLike = Pick<PeriodState, 'range' | 'compareRange'>

/**
 * Serialises a period-selector state into the from/to (+ comparison) query the
 * mailing metrics routes read.
 */
export function periodQuery(period: PeriodLike): Record<string, string> {
	const query: Record<string, string> = {
		from: period.range.from.toISOString(),
		to: period.range.to.toISOString(),
	}
	if (period.compareRange) {
		query.compareFrom = period.compareRange.from.toISOString()
		query.compareTo = period.compareRange.to.toISOString()
	}
	return query
}

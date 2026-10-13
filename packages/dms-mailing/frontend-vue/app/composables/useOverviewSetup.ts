import type { Ref } from 'vue'

const HIDES_PERIOD_KEY = 'mailing-setup-hides-period:'

/**
 * Whether the page header should hold its period selector back for `scope`:
 * the setup card stands in for the dashboard, so there is no figure for a
 * period to filter. Shared between the Overview gate, which sets it, and the
 * page header, which reads it.
 */
export function useSetupHidesPeriod(scope: string | undefined): Ref<boolean> {
	return useDmsState<boolean>(`${HIDES_PERIOD_KEY}${scope ?? ''}`, () => false)
}

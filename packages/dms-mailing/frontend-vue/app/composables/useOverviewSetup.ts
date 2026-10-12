import type { Ref } from 'vue'
import { mailingPath } from './useMailingApi'
import type { SetupFacts } from '../utils/overview-setup'

const HIDES_PERIOD_KEY = 'mailing-setup-hides-period:'

/** Reads the facts behind the Overview's first-run checklist. */
export function useOverviewSetupApi() {
	const { $authFetch } = useAuthFetch()
	return {
		setupFacts: () => $authFetch<SetupFacts>(mailingPath('metrics', 'setup')),
	}
}

/**
 * Whether the page header should hold its period selector back for `scope`:
 * the setup card stands in for the dashboard, so there is no figure for a
 * period to filter. Shared between the Overview gate, which sets it, and the
 * page header, which reads it.
 */
export function useSetupHidesPeriod(scope: string | undefined): Ref<boolean> {
	return useDmsState<boolean>(`${HIDES_PERIOD_KEY}${scope ?? ''}`, () => false)
}

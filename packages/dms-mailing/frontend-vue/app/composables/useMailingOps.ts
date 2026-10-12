import { mailingPath } from './useMailingApi'
import type { WebhookStatus, WebhookTestResult } from '../utils/webhook-status'

/** The module's operations routes: the webhook's status and its test event. */
export function useMailingOps() {
	const { $authFetch } = useAuthFetch()
	return {
		webhookStatus: () =>
			$authFetch<WebhookStatus>(mailingPath('settings', 'webhook-status')),
		webhookTest: () =>
			$authFetch<WebhookTestResult>(mailingPath('settings', 'webhook-test'), {
				method: 'POST',
				body: {},
			}),
	}
}

import { toValue, type MaybeRefOrGetter } from 'vue'
import {
	mailingPath,
	type CategoriesResponse,
	type CategoryUsageResponse,
	type StartersResponse,
	type TemplateListResponse,
	type TemplateOverviewResponse,
} from './useMailingApi'
import type { SetupFacts } from '../utils/overview-setup'
import type { WebhookStatus } from '../utils/webhook-status'
import type { ProviderInfo, RetentionPreview } from '../types/mailing'

/**
 * The reads the module's pages render, through `useApiData`: a server render
 * reads them and hands them to the browser with the page, and the components
 * showing one request share it. Writes, and reads made on a click (a drawer,
 * a dialog), go through `useMailingApi`.
 */

/** The e-mail provider the page header names; nothing read while `enabled` is false. */
export function useProviderInfo(
	enabled: MaybeRefOrGetter<boolean>,
): ApiDataResult<ProviderInfo> {
	return useApiData<ProviderInfo>(() =>
		toValue(enabled) ? mailingPath('provider') : null,
	)
}

/** What the overview's setup checklist is made of. */
export function useSetupFacts(): ApiDataResult<SetupFacts> {
	return useApiData<SetupFacts>(mailingPath('metrics', 'setup'))
}

/** The webhook's last event and last refused call. */
export function useWebhookStatus(): ApiDataResult<WebhookStatus> {
	return useApiData<WebhookStatus>(mailingPath('settings', 'webhook-status'))
}

/** What a retention of `days` deletes, and when; nothing read without days. */
export function useRetentionPreview(
	days: MaybeRefOrGetter<number | null>,
): ApiDataResult<RetentionPreview> {
	return useApiData<RetentionPreview>(
		() => (toValue(days) ? mailingPath('settings', 'retention-preview') : null),
		{ query: () => ({ days: String(toValue(days)) }) },
	)
}

/** How many templates each category holds. */
export function useCategoryUsage(): ApiDataResult<CategoryUsageResponse> {
	return useApiData<CategoryUsageResponse>(
		mailingPath('settings', 'category-usage'),
	)
}

/** The tenant's template categories, as stored. */
export function useStoredCategories(): ApiDataResult<CategoriesResponse> {
	return useApiData<CategoriesResponse>(mailingPath('templates', 'categories'))
}

/** Each template's sends and rates, for the gallery's cards. */
export function useTemplatesOverview(): ApiDataResult<TemplateOverviewResponse> {
	return useApiData<TemplateOverviewResponse>(
		mailingPath('templates', 'overview'),
	)
}

/**
 * How many templates the tenant has, whatever the gallery's filters: the
 * list route's total, without its rows.
 */
export function useTemplateTotal(): ApiDataResult<
	Pick<TemplateListResponse, 'total'>
> {
	return useApiData<Pick<TemplateListResponse, 'total'>>(
		mailingPath('tables', 'templates', 'list'),
		{ query: { limit: '1' }, pick: ['total'] },
	)
}

/** The starter templates the module ships. */
export function useStarters(): ApiDataResult<StartersResponse> {
	return useApiData<StartersResponse>(mailingPath('templates', 'starters'))
}

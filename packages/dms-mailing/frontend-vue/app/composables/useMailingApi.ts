import type {
	AttentionItem,
	FunnelStep,
	PreviewResponse,
	ProviderInfo,
	SendDetailResponse,
	TemplateContent,
	TemplateCategory,
	TemplateContentResponse,
	TemplateRow,
	VariableDefinition,
} from '../types/mailing'

const BASE = '/api/mailing'

/** Far above any real tenant's template count; the data-api caps at 100. */
const TEMPLATE_LIST_LIMIT = '100'

/**
 * Joins the module's API segments. Exported on its own so the path shape stays
 * testable without a Nuxt runtime.
 */
export function mailingPath(...segments: string[]): string {
	return [BASE, ...segments].join('/')
}

export interface PreviewInput {
	/** Absent lets the server pick the tenant fallback locale. */
	locale?: string
	content?: TemplateContent
	data?: Record<string, unknown>
}

export interface TestSendInput extends PreviewInput {
	to: string[]
}

/** A real send never carries a content override: it uses the saved template. */
export interface RealSendInput {
	to: string[]
	locale?: string
	data?: Record<string, unknown>
}

export interface SendResult {
	sendId: string
	status: string
	error?: string
}

export interface AttentionResponse {
	items: AttentionItem[]
}

export interface FunnelResponse {
	steps: FunnelStep[]
}

export interface SavedResponse {
	saved: boolean
	detectedVariables: string[]
}

/**
 * The template's own writable fields. All of them, always: the data-api `edit`
 * route replaces the writable set rather than patching it, so a body missing
 * one nulls it in the database.
 */
export interface TemplateDetails {
	name: string
	slug: string
	category?: string
}

export interface CategoriesResponse {
	categories: TemplateCategory[]
}

export interface TemplateListResponse {
	results: TemplateRow[]
	total: number
}

export interface CreateTemplateInput {
	name: string
	slug: string
	category?: string
	/** Absent starts blank; otherwise the template to copy. */
	sourceTemplateId?: string
}

export interface StatusResponse {
	status: string
}

export interface DuplicateResponse {
	id: string
}

export interface VariablesResponse {
	variables: VariableDefinition[]
}

export interface TestDataResponse {
	data: Record<string, unknown>
}

export interface TestSendResponse {
	results: SendResult[]
}

export interface HtmlResponse {
	html: string
}

export interface MailingSettings extends Record<string, unknown> {
	blockOnMissingVariables?: boolean
}

/**
 * The single place that knows the mailing endpoints; every component reads
 * through it so a route change is a one-file edit.
 */
export function useMailingApi() {
	const { $authFetch } = useAuthFetch()
	const post = <T>(path: string, body: object) =>
		$authFetch<T>(path, { method: 'POST', body })

	return {
		provider: () => $authFetch<ProviderInfo>(mailingPath('provider')),
		attention: (query: Record<string, string>) =>
			$authFetch<AttentionResponse>(mailingPath('metrics', 'attention'), {
				query,
			}),
		funnel: (query: Record<string, string>) =>
			$authFetch<FunnelResponse>(mailingPath('metrics', 'funnel'), { query }),
		templateContent: (id: string) =>
			$authFetch<TemplateContentResponse>(
				mailingPath('templates', id, 'content'),
			),
		saveTemplateDetails: (id: string, details: TemplateDetails) =>
			$authFetch<unknown>(mailingPath('tables', 'templates', 'edit'), {
				method: 'PUT',
				query: { id },
				body: details,
			}),
		listCategories: () =>
			$authFetch<CategoriesResponse>(mailingPath('templates', 'categories')),
		listTemplates: () =>
			$authFetch<TemplateListResponse>(
				mailingPath('tables', 'templates', 'list'),
				{ query: { limit: TEMPLATE_LIST_LIMIT, sortKey: 'name' } },
			),
		createTemplate: (input: CreateTemplateInput) =>
			post<string[]>(mailingPath('tables', 'templates', 'new'), input),
		saveContent: (id: string, content: TemplateContent) =>
			post<SavedResponse>(mailingPath('templates', id, 'content'), {
				content,
			}),
		publish: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'publish'), {}),
		unpublish: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'unpublish'), {}),
		archive: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'archive'), {}),
		duplicate: (id: string, slug: string, name: string) =>
			post<DuplicateResponse>(mailingPath('templates', id, 'duplicate'), {
				slug,
				name,
			}),
		saveVariables: (id: string, variables: VariableDefinition[]) =>
			post<VariablesResponse>(mailingPath('templates', id, 'variables'), {
				variables,
			}),
		saveTestData: (id: string, data: Record<string, unknown>) =>
			post<TestDataResponse>(mailingPath('templates', id, 'test-data'), {
				data,
			}),
		preview: (id: string, input: PreviewInput) =>
			post<PreviewResponse>(mailingPath('templates', id, 'preview'), input),
		realSend: (id: string, input: RealSendInput) =>
			post<TestSendResponse>(mailingPath('templates', id, 'send'), input),
		testSend: (id: string, input: TestSendInput) =>
			post<TestSendResponse>(mailingPath('templates', id, 'test-send'), input),
		send: (id: string) =>
			$authFetch<SendDetailResponse>(mailingPath('sends', id)),
		sendHtml: (id: string) =>
			$authFetch<HtmlResponse>(mailingPath('sends', id, 'html')),
		replay: (id: string) =>
			post<SendResult>(mailingPath('sends', id, 'replay'), {}),
		settings: () => $authFetch<MailingSettings>(mailingPath('settings')),
		saveSettings: (settings: MailingSettings) =>
			post<MailingSettings>(mailingPath('settings'), settings),
	}
}

export type MailingApi = ReturnType<typeof useMailingApi>

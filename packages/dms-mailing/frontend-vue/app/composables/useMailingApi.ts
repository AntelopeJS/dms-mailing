import type {
	FunnelStep,
	PreviewResponse,
	PreviewVersion,
	ProviderInfo,
	RetentionPreview,
	SendDetailResponse,
	SendHtmlResponse,
	StarterSummary,
	TemplateChange,
	TemplateContent,
	TemplateCategory,
	TemplateContentResponse,
	TemplatePerformance,
	TemplateRow,
	TemplateStats,
	TemplateVersionSummary,
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
	/** Which content to render when `content` is absent; the draft by default. */
	version?: PreviewVersion
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

export interface FunnelResponse {
	steps: FunnelStep[]
}

export interface SavedResponse {
	saved: boolean
	detectedVariables: string[]
	changes: TemplateChange[]
}

export interface ChangesResponse {
	version: number
	changes: TemplateChange[]
}

export interface PublishResponse {
	status: string
	version: number
	changes: TemplateChange[]
}

export interface VersionsResponse {
	versions: TemplateVersionSummary[]
}

export interface StartersResponse {
	starters: StarterSummary[]
}

export interface TemplateOverviewResponse {
	items: TemplateStats[]
}

export interface CategoryUsageResponse {
	counts: Record<string, number>
}

/**
 * The template's own writable fields. All of them, always: the data-api `edit`
 * route replaces the writable set rather than patching it, so a body missing
 * one nulls it in the database. `null` clears the category on every data-api
 * version, including those that leave an absent key unchanged.
 */
export interface TemplateDetails {
	name: string
	slug: string
	category: string | null
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
	/** A starter template to start from, when no template is copied. */
	starterId?: string
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

export interface StarterPreviewResponse {
	html: string
	locale: string
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
		changes: (id: string) =>
			$authFetch<ChangesResponse>(mailingPath('templates', id, 'changes')),
		versions: (id: string) =>
			$authFetch<VersionsResponse>(mailingPath('templates', id, 'versions')),
		performance: (id: string) =>
			$authFetch<TemplatePerformance>(
				mailingPath('templates', id, 'performance'),
			),
		templatesOverview: () =>
			$authFetch<TemplateOverviewResponse>(
				mailingPath('templates', 'overview'),
			),
		starters: () =>
			$authFetch<StartersResponse>(mailingPath('templates', 'starters')),
		starterPreview: (starterId: string) =>
			$authFetch<StarterPreviewResponse>(
				mailingPath('templates', 'starters', starterId, 'preview'),
			),
		publish: (id: string) =>
			post<PublishResponse>(mailingPath('templates', id, 'publish'), {}),
		discard: (id: string) =>
			post<unknown>(mailingPath('templates', id, 'discard'), {}),
		unpublish: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'unpublish'), {}),
		archive: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'archive'), {}),
		restore: (id: string) =>
			post<StatusResponse>(mailingPath('templates', id, 'restore'), {}),
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
			$authFetch<SendHtmlResponse>(mailingPath('sends', id, 'html')),
		replay: (id: string, to?: string) =>
			post<SendResult>(mailingPath('sends', id, 'replay'), to ? { to } : {}),
		settings: () => $authFetch<MailingSettings>(mailingPath('settings')),
		saveSettings: (settings: MailingSettings) =>
			post<MailingSettings>(mailingPath('settings'), settings),
		retentionPreview: (days: number) =>
			$authFetch<RetentionPreview>(
				mailingPath('settings', 'retention-preview'),
				{ query: { days: String(days) } },
			),
		categoryUsage: () =>
			$authFetch<CategoryUsageResponse>(
				mailingPath('settings', 'category-usage'),
			),
	}
}

export type MailingApi = ReturnType<typeof useMailingApi>

/**
 * Layer-side mirror of the backend mailing contracts.
 *
 * The block model, the resolved e-mail and the HTTP payloads are declared once
 * here so every component and composable reads the same shapes; the source of
 * truth is `src/types/blocks.ts` / `src/engine/resolved.ts` on the backend.
 */

export type ConditionOperator = 'truthy' | 'falsy' | 'eq' | 'ne' | 'gt' | 'lt'

export interface Condition {
	path: string
	operator: ConditionOperator
	value: string
}

export type TextAlign = 'left' | 'center' | 'right'

export type BlockType =
	| 'hero'
	| 'heading'
	| 'paragraph'
	| 'code'
	| 'list'
	| 'total'
	| 'button'
	| 'if'
	| 'divider'
	| 'footer'

export const BLOCK_TYPES: BlockType[] = [
	'hero',
	'heading',
	'paragraph',
	'code',
	'list',
	'total',
	'button',
	'if',
	'divider',
	'footer',
]

export interface BlockBase {
	id: string
	type: BlockType
	visibleIf: Condition | null
}

export interface HeroBlock extends BlockBase {
	type: 'hero'
	imageUrl: string
	alt: string
}

export interface HeadingBlock extends BlockBase {
	type: 'heading'
	text: string
	align: TextAlign
	size: number
}

export interface ParagraphBlock extends BlockBase {
	type: 'paragraph'
	text: string
	align: TextAlign
}

export interface CodeBlock extends BlockBase {
	type: 'code'
	text: string
}

export interface ListBlock extends BlockBase {
	type: 'list'
	source: string
	labelPath: string
	valuePath: string
}

export interface TotalBlock extends BlockBase {
	type: 'total'
	label: string
	value: string
}

export interface ButtonBlock extends BlockBase {
	type: 'button'
	text: string
	href: string
	align: TextAlign
}

export interface IfBlock extends BlockBase {
	type: 'if'
	condition: Condition
	children: Block[]
	elseChildren: Block[] | null
}

export interface DividerBlock extends BlockBase {
	type: 'divider'
}

export interface FooterBlock extends BlockBase {
	type: 'footer'
	text: string
	unsubscribeLabel: string
	preferencesLabel: string
}

export type Block =
	| HeroBlock
	| HeadingBlock
	| ParagraphBlock
	| CodeBlock
	| ListBlock
	| TotalBlock
	| ButtonBlock
	| IfBlock
	| DividerBlock
	| FooterBlock

export interface LocaleContent {
	subject: string
	preheader: string
	blocks: Block[]
}

export interface TemplateContent {
	locales: Record<string, LocaleContent>
}

export type VariableType =
	'string' | 'text' | 'number' | 'money' | 'date' | 'url' | 'boolean' | 'array'

export const VARIABLE_TYPES: VariableType[] = [
	'string',
	'text',
	'number',
	'money',
	'date',
	'url',
	'boolean',
	'array',
]

export interface VariableDefinition {
	path: string
	type: VariableType
	required: boolean
}

export type TemplateStatus = 'draft' | 'live' | 'archived'

export const TEMPLATE_STATUSES: TemplateStatus[] = ['draft', 'live', 'archived']

export interface ResolvedListRow {
	label: string
	value: string
}

export interface ResolvedHero {
	id: string
	type: 'hero'
	imageUrl: string
	alt: string
}

export interface ResolvedHeading {
	id: string
	type: 'heading'
	text: string
	align: TextAlign
	size: number
}

export interface ResolvedParagraph {
	id: string
	type: 'paragraph'
	text: string
	align: TextAlign
}

export interface ResolvedCode {
	id: string
	type: 'code'
	text: string
}

export interface ResolvedList {
	id: string
	type: 'list'
	rows: ResolvedListRow[]
}

export interface ResolvedTotal {
	id: string
	type: 'total'
	label: string
	value: string
}

export interface ResolvedButton {
	id: string
	type: 'button'
	text: string
	href: string
	align: TextAlign
}

export interface ResolvedDivider {
	id: string
	type: 'divider'
}

export interface ResolvedFooter {
	id: string
	type: 'footer'
	text: string
	unsubscribeLabel: string
	preferencesLabel: string
	unsubscribeUrl: string
	preferencesUrl: string
}

export type ResolvedBlock =
	| ResolvedHero
	| ResolvedHeading
	| ResolvedParagraph
	| ResolvedCode
	| ResolvedList
	| ResolvedTotal
	| ResolvedButton
	| ResolvedDivider
	| ResolvedFooter

export interface ResolvedEmail {
	subject: string
	preheader: string
	blocks: ResolvedBlock[]
	missing: string[]
	hiddenBlockIds: string[]
}

export type SendStatus =
	| 'queued'
	| 'sent'
	| 'delivered'
	| 'opened'
	| 'clicked'
	| 'bounced'
	| 'spam'
	| 'failed'
	| 'unsubscribed'

export const SEND_STATUSES: SendStatus[] = [
	'queued',
	'sent',
	'delivered',
	'opened',
	'clicked',
	'bounced',
	'spam',
	'failed',
	'unsubscribed',
]

export type SendEventType = SendStatus

export interface TemplateCategory {
	id: string
	label: string
	icon: string
}

export interface TemplateRow {
	_id: string
	slug: string
	name: string
	/** Absent or empty when the template is uncategorised. */
	category?: string
	status: TemplateStatus
	/** Comma-separated locale codes of the content; blank means unknown. */
	locales?: string
	updatedAt: string
	updatedBy: string
}

export interface TemplateContentResponse {
	template: TemplateRow
	content: TemplateContent
	variables: VariableDefinition[]
	/** Paths the content actually references, across every locale. */
	detectedVariables: string[]
	testData: Record<string, unknown>
	fallbackLocale: string
	categories: TemplateCategory[]
}

export interface PreviewResponse {
	html: string
	subject: string
	locale: string
	missing: string[]
	hiddenBlockIds: string[]
}

export interface SendRow {
	_id: string
	templateId: string
	templateSlug: string
	locale: string
	recipientEmail: string
	recipientName?: string
	status: SendStatus
	provider?: string
	providerMessageId?: string
	latencyMs: number
	error?: string
	source?: string
	json_variables: string
	opens: number
	clicks: number
	createdAt: string
	isTest: boolean
}

export interface SendEventRow {
	_id: string
	sendId: string
	type: SendStatus
	at: string
	json_details: string
}

export interface SendDetailResponse {
	send: SendRow
	events: SendEventRow[]
}

export type AttentionTone = 'warning' | 'error' | 'neutral'

export interface AttentionItem {
	id: string
	tone: AttentionTone
	icon: string
	title: string
	description: string
	to?: string
	params?: Record<string, string | number>
}

export interface FunnelStep {
	id: string
	label: string
	count: number
	rate: number
}

export interface ProviderInfo {
	name: string
	connected: boolean
	features: Record<string, boolean> | null
}

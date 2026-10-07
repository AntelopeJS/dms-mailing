<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import {
	HTTP_CONFLICT,
	apiErrorMessage,
	apiErrorStatus,
} from '../utils/api-error'
import { NO_CATEGORY, fromCategoryOption } from '../utils/categories'
import { slugify, validateName, validateSlug } from '../utils/slug'
import { editorRoute } from '../utils/editor-route'
import type {
	StarterSummary,
	TemplateCategory,
	TemplateRow,
} from '../types/mailing'
import type { CreateTemplateInput } from '../composables/useMailingApi'

interface NewTemplateModalProps {
	initialName?: string
	/** A starter preselected in "Start from". */
	initialStarterId?: string
	onSuccessCallback?: () => void
}

type SourceKind = 'blank' | 'starter' | 'template'

interface SourceChoice {
	kind: SourceKind
	id?: string
}

interface TilePreview {
	starterId?: string
	templateId?: string
}

interface SourceTile {
	key: string
	choice: SourceChoice
	title: string
	subtitle: string
	preview: TilePreview
	pick: () => void
}

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.24
const BLANK_SOURCE: SourceChoice = { kind: 'blank' }

const SOURCE_FIELDS: Record<
	SourceKind,
	(id?: string) => Partial<CreateTemplateInput>
> = {
	blank: () => ({}),
	starter: (id) => ({ starterId: id }),
	template: (id) => ({ sourceTemplateId: id }),
}

const props = defineProps<NewTemplateModalProps>()
const emit = defineEmits<{ success: [created?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { processApiMessage } = useTranslation()

const name = ref(props.initialName ?? '')
const slug = ref(slugify(name.value))
const isSlugEdited = ref(false)
const category = ref(NO_CATEGORY)
const source = ref<SourceChoice>(
	props.initialStarterId
		? { kind: 'starter', id: props.initialStarterId }
		: BLANK_SOURCE,
)
const isSubmitted = ref(false)
const saving = ref(false)
const templates = ref<TemplateRow[]>([])
const starters = ref<StarterSummary[]>([])
const categories = ref<TemplateCategory[]>([])
const refusedSlugs = ref(new Set<string>())

onMounted(async () => {
	const [templateList, starterList, categoryList] = await Promise.all([
		api.listTemplates().catch(() => ({ results: [] as TemplateRow[] })),
		api.starters().catch(() => ({ starters: [] as StarterSummary[] })),
		api.listCategories().catch(() => ({ categories: [] })),
	])
	templates.value = templateList.results
	starters.value = starterList.starters
	categories.value = categoryList.categories
})

watch(name, (value) => {
	if (!isSlugEdited.value) slug.value = slugify(value)
})

const takenSlugs = computed(
	() =>
		new Set([
			...templates.value.map((template) => template.slug),
			...refusedSlugs.value,
		]),
)

const slugIssue = computed(() => validateSlug(slug.value, takenSlugs.value))
const nameIssue = computed(() => validateName(name.value))

const slugError = computed(() =>
	slugIssue.value && (slug.value || isSubmitted.value)
		? t(`dms_mailing.templates.slug_errors.${slugIssue.value}`)
		: false,
)

const nameError = computed(() =>
	nameIssue.value && isSubmitted.value
		? t(`dms_mailing.templates.name_errors.${nameIssue.value}`)
		: false,
)

const canSubmit = computed(
	() => !slugIssue.value && !nameIssue.value && !saving.value,
)

const categoryItems = computed(() => [
	{ label: t('dms_mailing.templates.uncategorised'), value: NO_CATEGORY },
	...categories.value.map((entry) => ({
		label: entry.label,
		value: entry.id,
		icon: entry.icon,
	})),
])

function isKnownCategory(id: string | null | undefined): id is string {
	return Boolean(id) && categories.value.some((entry) => entry.id === id)
}

function adoptCategory(id: string | null | undefined): void {
	if (category.value === NO_CATEGORY && isKnownCategory(id)) category.value = id
}

function isPicked(choice: SourceChoice): boolean {
	return source.value.kind === choice.kind && source.value.id === choice.id
}

function pickStarter(starter: StarterSummary): void {
	source.value = { kind: 'starter', id: starter.id }
	if (!name.value.trim()) name.value = starter.name
	adoptCategory(starter.category)
}

function pickTemplate(template: TemplateRow): void {
	source.value = { kind: 'template', id: template._id }
	adoptCategory(template.category)
}

const tiles = computed<SourceTile[]>(() => [
	{
		key: 'blank',
		choice: BLANK_SOURCE,
		title: t('dms_mailing.templates.start_from.blank'),
		subtitle: t('dms_mailing.templates.start_from.blank_hint'),
		preview: {},
		pick: () => (source.value = BLANK_SOURCE),
	},
	...starters.value.map((starter) => ({
		key: `starter-${starter.id}`,
		choice: { kind: 'starter' as const, id: starter.id },
		title: starter.name,
		subtitle: t('dms_mailing.templates.start_from.starter'),
		preview: { starterId: starter.id },
		pick: () => pickStarter(starter),
	})),
	...templates.value.map((template) => ({
		key: `template-${template._id}`,
		choice: { kind: 'template' as const, id: template._id },
		title: template.name,
		subtitle: template.slug,
		preview: { templateId: template._id },
		pick: () => pickTemplate(template),
	})),
])

function onSlugInput(value: string): void {
	isSlugEdited.value = true
	slug.value = value.trim().toLowerCase()
}

function close(created: boolean): void {
	if (created && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', created)
}

function creationInput(): CreateTemplateInput {
	const chosenCategory = fromCategoryOption(category.value)
	return {
		name: name.value.trim(),
		slug: slug.value,
		...(chosenCategory ? { category: chosenCategory } : {}),
		...SOURCE_FIELDS[source.value.kind](source.value.id),
	}
}

function reportFailure(error: unknown): void {
	if (apiErrorStatus(error) === HTTP_CONFLICT) {
		refusedSlugs.value = new Set([...refusedSlugs.value, slug.value])
		return
	}
	toast.add({
		color: 'error',
		title: processApiMessage(apiErrorMessage(error)),
	})
}

async function submit(): Promise<void> {
	isSubmitted.value = true
	if (!canSubmit.value) return
	saving.value = true
	try {
		const [id] = await api.createTemplate(creationInput())
		close(true)
		if (id) await navigateDms(editorRoute(id))
	} catch (error) {
		reportFailure(error)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<form
		class="flex flex-col gap-5"
		novalidate
		@submit.prevent="submit"
		@keydown.meta.enter.prevent="submit"
		@keydown.ctrl.enter.prevent="submit"
	>
		<UFormField
			:label="t('dms_mailing.templates.cols.name')"
			:error="nameError"
			required
		>
			<UInput
				v-model="name"
				class="w-full"
				autofocus
				:placeholder="t('dms_mailing.new_template.name_placeholder')"
			/>
		</UFormField>

		<UFormField
			:label="t('dms_mailing.templates.cols.slug')"
			:hint="t('dms_mailing.new_template.slug_auto')"
			:help="slugError ? undefined : t('dms_mailing.new_template.slug_help')"
			:error="slugError"
			required
		>
			<UFieldGroup class="w-full">
				<UBadge
					color="neutral"
					variant="outline"
					size="lg"
					class="text-dimmed font-mono"
					label="SendTemplate("
				/>
				<UInput
					:model-value="slug"
					class="w-full"
					:ui="{ base: 'font-mono' }"
					:trailing-icon="slugIssue ? undefined : 'i-ph-check-circle'"
					:aria-invalid="Boolean(slugError)"
					@update:model-value="(value) => onSlugInput(String(value))"
				/>
			</UFieldGroup>
		</UFormField>

		<UFormField :label="t('dms_mailing.templates.cols.category')">
			<USelect
				v-model="category"
				:items="categoryItems"
				value-key="value"
				class="w-full"
			/>
		</UFormField>

		<div class="flex flex-col gap-2">
			<span class="text-highlighted text-sm font-medium">
				{{ t('dms_mailing.templates.start_from.label') }}
			</span>
			<div
				role="radiogroup"
				:aria-label="t('dms_mailing.templates.start_from.label')"
				class="grid max-h-[320px] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3"
			>
				<button
					v-for="tile in tiles"
					:key="tile.key"
					type="button"
					role="radio"
					:aria-checked="isPicked(tile.choice)"
					class="flex min-w-0 flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors"
					:class="
						isPicked(tile.choice)
							? 'border-primary ring-primary/30 ring-2'
							: 'border-default hover:border-accented'
					"
					@click="tile.pick()"
				>
					<span
						v-if="tile.choice.kind === 'blank'"
						class="border-default text-dimmed flex h-[72px] items-center justify-center rounded border border-dashed"
					>
						<UIcon name="i-ph-plus" class="size-5" />
					</span>
					<span
						v-else
						class="bg-elevated/40 pointer-events-none flex h-[72px] justify-center overflow-hidden rounded"
					>
						<MailingTemplatePreviewFrame
							v-bind="tile.preview"
							:width="PREVIEW_WIDTH"
							:scale="PREVIEW_SCALE"
							:label="tile.title"
							lazy
						/>
					</span>
					<span class="text-highlighted truncate text-[12.5px] font-medium">
						{{ tile.title }}
					</span>
					<span class="text-dimmed truncate font-mono text-[11px]">
						{{ tile.subtitle }}
					</span>
				</button>
			</div>
		</div>

		<div class="border-default -mx-1 flex items-center gap-2 border-t pt-4">
			<span class="text-dimmed hidden items-center gap-1 text-xs sm:flex">
				<UKbd value="meta" size="sm" />
				<UKbd value="enter" size="sm" />
				{{ t('dms_mailing.new_template.shortcut') }}
			</span>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				icon="i-ph-arrow-right"
				:label="t('dms_mailing.new_template.submit')"
				:loading="saving"
				:disabled="saving"
			/>
		</div>
	</form>
</template>

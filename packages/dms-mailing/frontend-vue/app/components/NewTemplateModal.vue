<script setup lang="ts">
import { editorRoute } from '../utils/editor-route'
import { fromCategoryOption, NO_CATEGORY } from '../utils/categories'
import type { TemplateCategory, TemplateRow } from '../types/mailing'

interface NewTemplateModalProps {
	onSuccessCallback?: () => void
}

const SLUG_SEPARATOR = '-'
// Not the empty string: Reka's `Select` reserves it for "nothing selected" and
// refuses to open a listbox that offers it. See NO_CATEGORY in utils/categories.
const BLANK_SOURCE = '__blank__'

const props = defineProps<NewTemplateModalProps>()

const emit = defineEmits<{ success: [] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { processApiMessage } = useTranslation()

const name = ref('')
const slug = ref('')
const slugTouched = ref(false)
const category = ref(NO_CATEGORY)
const sourceTemplateId = ref(BLANK_SOURCE)
const saving = ref(false)
const sources = ref<TemplateRow[]>([])
const categories = ref<TemplateCategory[]>([])

const categoryItems = computed(() => [
	{ label: t('dms_mailing.templates.uncategorised'), value: NO_CATEGORY },
	...categories.value.map((entry) => ({
		label: entry.label,
		value: entry.id,
	})),
])

// Blank first, then the tenant's own templates. An empty tenant offers only
// Blank, which is the normal first-run state, not an error.
const sourceItems = computed(() => [
	{ label: t('dms_mailing.templates.start_from.blank'), value: BLANK_SOURCE },
	...sources.value.map((entry) => ({
		label: `${entry.name} · ${entry.slug}`,
		value: entry._id,
	})),
])

function slugify(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
		.replace(/^-+|-+$/g, '')
}

watch(name, (value) => {
	if (!slugTouched.value) slug.value = slugify(value)
})

const canSubmit = computed(
	() => Boolean(name.value.trim() && slug.value.trim()) && !saving.value,
)

onMounted(async () => {
	const [templates, categoryList] = await Promise.all([
		api.listTemplates().catch(() => ({ results: [] })),
		api.listCategories().catch(() => ({ categories: [] })),
	])
	sources.value = templates.results
	categories.value = categoryList.categories
})

async function submit(): Promise<void> {
	if (!canSubmit.value) return
	saving.value = true
	try {
		const [id] = await api.createTemplate({
			name: name.value.trim(),
			slug: slug.value.trim(),
			category: fromCategoryOption(category.value) || undefined,
			sourceTemplateId:
				sourceTemplateId.value === BLANK_SOURCE
					? undefined
					: sourceTemplateId.value,
		})
		props.onSuccessCallback?.()
		emit('success')
		if (id) await navigateDms(editorRoute(id))
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(
				(error as { data?: { message?: string } }).data?.message ?? error,
			),
		})
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<UForm
		:state="{ name, slug, category, sourceTemplateId }"
		class="flex flex-col gap-4"
		@submit="submit"
	>
		<UFormField :label="t('dms_mailing.templates.cols.name')" name="name">
			<UInput v-model="name" class="w-full" autofocus />
		</UFormField>

		<UFormField :label="t('dms_mailing.templates.cols.slug')" name="slug">
			<UInput
				v-model="slug"
				class="w-full font-mono"
				@update:model-value="slugTouched = true"
			/>
		</UFormField>

		<UFormField
			:label="t('dms_mailing.templates.cols.category')"
			name="category"
		>
			<USelect
				v-model="category"
				:items="categoryItems"
				value-key="value"
				class="w-full"
			/>
		</UFormField>

		<UFormField
			:label="t('dms_mailing.templates.start_from.label')"
			name="sourceTemplateId"
		>
			<USelect
				v-model="sourceTemplateId"
				:items="sourceItems"
				value-key="value"
				class="w-full"
			/>
		</UFormField>

		<div class="flex justify-end">
			<UButton
				type="submit"
				icon="i-ph-plus"
				:label="t('dms_mailing.templates.actions.create')"
				:loading="saving"
				:disabled="!canSubmit"
			/>
		</div>
	</UForm>
</template>

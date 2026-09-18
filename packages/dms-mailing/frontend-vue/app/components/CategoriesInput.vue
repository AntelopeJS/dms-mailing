<script setup lang="ts">
import {
	parseCategories,
	serializeCategories,
	slugifyId,
} from '../utils/categories'
import type { TemplateCategory } from '../types/mailing'

interface CategoriesInputProps {
	modelValue?: TemplateCategory[] | string | null
	initialValue?: TemplateCategory[] | string | null
	disabled?: boolean
}

const DEFAULT_ICON = 'i-ph-folder'

const props = withDefaults(defineProps<CategoriesInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()

const categories = ref<TemplateCategory[]>(
	parseCategories(props.modelValue ?? props.initialValue).map((entry) => ({
		...entry,
	})),
)

function onEdit(): void {
	emit('update:modelValue', serializeCategories(categories.value))
}

// The id is stored on every template, so it is derived once at creation and
// never follows a later rename.
function addCategory(): void {
	categories.value.push({ id: '', label: '', icon: DEFAULT_ICON })
	onEdit()
}

function onLabelInput(index: number): void {
	const entry = categories.value[index]
	if (entry && !entry.id) entry.id = slugifyId(entry.label)
	onEdit()
}

function removeCategory(index: number): void {
	categories.value.splice(index, 1)
	onEdit()
}

watch(
	() => props.modelValue,
	(value) => {
		const parsed = parseCategories(value)
		if (serializeCategories(parsed) !== serializeCategories(categories.value)) {
			categories.value = parsed.map((entry) => ({ ...entry }))
		}
	},
)
</script>

<template>
	<div class="flex flex-col gap-2">
		<div
			v-for="(category, index) in categories"
			:key="index"
			class="flex items-center gap-2"
		>
			<UIcon
				:name="category.icon || DEFAULT_ICON"
				class="text-dimmed size-4 shrink-0"
				aria-hidden="true"
			/>
			<UInput
				v-model="category.label"
				:placeholder="t('dms_mailing.settings.categories.label')"
				:disabled="disabled"
				size="sm"
				class="flex-1"
				@update:model-value="onLabelInput(index)"
			/>
			<UInput
				v-model="category.icon"
				:placeholder="DEFAULT_ICON"
				:disabled="disabled"
				size="sm"
				class="w-40 font-mono"
				@update:model-value="onEdit"
			/>
			<code class="text-dimmed w-28 shrink-0 truncate font-mono text-[11px]">
				{{ category.id }}
			</code>
			<UButton
				v-if="!disabled"
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="xs"
				:title="t('dms_mailing.settings.categories.remove')"
				@click="removeCategory(index)"
			/>
		</div>

		<p v-if="!categories.length" class="text-muted text-[12.5px]">
			{{ t('dms_mailing.settings.categories.empty') }}
		</p>

		<UButton
			v-if="!disabled"
			icon="i-ph-plus"
			variant="link"
			size="sm"
			class="self-start"
			:label="t('dms_mailing.settings.categories.add')"
			@click="addCategory"
		/>

		<p class="text-dimmed text-[11.5px]">
			{{ t('dms_mailing.settings.categories.hint') }}
		</p>
	</div>
</template>

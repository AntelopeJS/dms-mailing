<script setup lang="ts">
import { useLocalizedDefaults } from '../composables/useLocalizedDefaults'
import { useMailingApi } from '../composables/useMailingApi'
import {
	DEFAULT_CATEGORY_ICON,
	fromCategoryOption,
	NO_CATEGORY,
	toCategoryOption,
} from '../utils/categories'
import type { TemplateCategory } from '../types/mailing'

interface CategoryInputProps {
	modelValue?: string | null
	initialValue?: string | null
	disabled?: boolean
}

const props = withDefaults(defineProps<CategoryInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const api = useMailingApi()
const { t } = useI18n()

const localized = useLocalizedDefaults()
const storedCategories = ref<TemplateCategory[]>([])
const categories = computed(() => localized.categories(storedCategories.value))
const selected = ref<string>(
	toCategoryOption(props.modelValue ?? props.initialValue),
)

const UNCATEGORISED_ICON = 'i-ph-tray'

const items = computed(() => [
	{
		label: t('dms_mailing.templates.uncategorised'),
		value: NO_CATEGORY,
		icon: UNCATEGORISED_ICON,
	},
	...categories.value.map((entry) => ({
		label: entry.label,
		value: entry.id,
		icon: entry.icon || DEFAULT_CATEGORY_ICON,
	})),
])

watch(
	() => props.modelValue,
	(value) => {
		selected.value = toCategoryOption(value)
	},
)

onMounted(async () => {
	try {
		const response = await api.listCategories()
		storedCategories.value = response.categories
	} catch {
		storedCategories.value = []
	}
})
</script>

<template>
	<DmsSelect
		v-model="selected"
		:items="items"
		value-key="value"
		:deselectable="false"
		:disabled="disabled"
		class="w-full"
		@update:model-value="
			emit('update:modelValue', fromCategoryOption(selected))
		"
	/>
</template>

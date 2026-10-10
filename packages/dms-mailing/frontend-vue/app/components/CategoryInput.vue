<script setup lang="ts">
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

const categories = ref<TemplateCategory[]>([])
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

const selectedIcon = computed(
	() => items.value.find((item) => item.value === selected.value)?.icon,
)

watch(
	() => props.modelValue,
	(value) => {
		selected.value = toCategoryOption(value)
	},
)

onMounted(async () => {
	try {
		const response = await api.listCategories()
		categories.value = response.categories
	} catch {
		categories.value = []
	}
})
</script>

<template>
	<DmsSelect
		v-model="selected"
		:items="items"
		value-key="value"
		:deselectable="false"
		:icon="selectedIcon"
		:disabled="disabled"
		class="w-full"
		@update:model-value="
			emit('update:modelValue', fromCategoryOption(selected))
		"
	/>
</template>

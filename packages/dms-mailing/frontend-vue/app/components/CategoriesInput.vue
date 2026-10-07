<script setup lang="ts">
import draggable from 'vuedraggable'
import { useMailingApi } from '../composables/useMailingApi'
import {
	CATEGORY_ICONS,
	DEFAULT_CATEGORY_ICON,
	formatCategoriesLike,
	parseCategories,
	serializeCategories,
	toStoredCategories,
	type EditableCategory,
} from '../utils/categories'
import type { TemplateCategory } from '../types/mailing'

interface CategoriesInputProps {
	modelValue?: TemplateCategory[] | string | null
	initialValue?: TemplateCategory[] | string | null
	disabled?: boolean
}

const props = withDefaults(defineProps<CategoriesInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: TemplateCategory[] | string]
}>()

const KEY_PREFIX = 'dms_mailing.settings.categories.'
const NEW_ICON = CATEGORY_ICONS[0] ?? DEFAULT_CATEGORY_ICON

const api = useMailingApi()
const { t } = useI18n()

let nextKey = 0
const keyOf = (): string => `category-${nextKey++}`

const source = computed(() => props.modelValue ?? props.initialValue)
const rows = ref<EditableCategory[]>(toRows(source.value))
const usage = ref<Record<string, number>>({})
const pickerOpen = ref<string | null>(null)
let lastEmitted = serializeCategories(toStoredCategories(rows.value))

const key = (
	path: string,
	params: Record<string, unknown> = {},
	plural = 1,
): string => t(`${KEY_PREFIX}${path}`, params, plural)

function toRows(
	value: TemplateCategory[] | string | null | undefined,
): EditableCategory[] {
	return parseCategories(value).map((category) => ({
		...category,
		key: keyOf(),
		isNew: false,
	}))
}

function onEdit(): void {
	const stored = toStoredCategories(rows.value)
	const labelled = rows.value.filter((row) => row.label.trim())
	stored.forEach((category, index) => {
		const row = labelled[index]
		if (row) row.id = category.id
	})
	lastEmitted = serializeCategories(stored)
	emit('update:modelValue', formatCategoriesLike(source.value, stored))
}

function addCategory(): void {
	rows.value.push({
		key: keyOf(),
		id: '',
		label: '',
		icon: NEW_ICON,
		isNew: true,
	})
}

function removeCategory(index: number): void {
	rows.value.splice(index, 1)
	onEdit()
}

function pickIcon(row: EditableCategory, icon: string): void {
	row.icon = icon
	pickerOpen.value = null
	onEdit()
}

function usageLabel(row: EditableCategory): string {
	const count = row.isNew ? 0 : (usage.value[row.id] ?? 0)
	return key('usage', { count }, count)
}

watch(source, (value) => {
	if (serializeCategories(parseCategories(value)) === lastEmitted) return
	rows.value = toRows(value)
	lastEmitted = serializeCategories(toStoredCategories(rows.value))
})

watch(
	() => props.initialValue,
	(value) => {
		const saved = new Set(parseCategories(value).map((category) => category.id))
		rows.value
			.filter((row) => row.isNew && saved.has(row.id))
			.forEach((row) => (row.isNew = false))
	},
)

onMounted(async () => {
	try {
		usage.value = (await api.categoryUsage()).counts
	} catch {
		usage.value = {}
	}
})
</script>

<template>
	<div class="border-default flex flex-col overflow-hidden rounded-lg border">
		<draggable
			v-model="rows"
			item-key="key"
			handle="[data-drag-handle]"
			:disabled="disabled"
			class="divide-default flex flex-col divide-y"
			@end="onEdit"
		>
			<template #item="{ element, index }">
				<div class="flex items-center gap-2.5 px-3 py-2">
					<UIcon
						v-if="!disabled"
						data-drag-handle
						name="i-ph-dots-six-vertical"
						class="text-dimmed size-4 shrink-0 cursor-grab"
						:aria-label="key('drag')"
					/>
					<UPopover
						:open="pickerOpen === element.key"
						@update:open="
							(open: boolean) => (pickerOpen = open ? element.key : null)
						"
					>
						<UButton
							color="neutral"
							variant="outline"
							size="sm"
							square
							:icon="element.icon || DEFAULT_CATEGORY_ICON"
							:disabled="disabled"
							:aria-label="key('change_icon')"
						/>
						<template #content>
							<div class="flex flex-col gap-2 p-2.5">
								<DmsEyebrow :label="key('pick_icon')" />
								<div class="grid grid-cols-8 gap-1">
									<UButton
										v-for="icon in CATEGORY_ICONS"
										:key="icon"
										:icon="icon"
										size="sm"
										square
										:color="icon === element.icon ? 'primary' : 'neutral'"
										:variant="icon === element.icon ? 'soft' : 'ghost'"
										:aria-label="icon"
										:aria-pressed="icon === element.icon"
										@click="pickIcon(element, icon)"
									/>
								</div>
							</div>
						</template>
					</UPopover>
					<UInput
						v-model="element.label"
						:placeholder="t('dms_mailing.settings.categories.label')"
						:disabled="disabled"
						size="sm"
						class="min-w-0 flex-1"
						@update:model-value="onEdit"
					/>
					<span
						class="text-dimmed w-24 shrink-0 text-right font-mono text-[11px]"
					>
						{{ usageLabel(element) }}
					</span>
					<UButton
						v-if="!disabled"
						icon="i-ph-x"
						color="neutral"
						variant="ghost"
						size="xs"
						square
						:aria-label="t('dms_mailing.settings.categories.remove')"
						@click="removeCategory(index)"
					/>
				</div>
			</template>
		</draggable>

		<p v-if="!rows.length" class="text-muted px-4 py-3 text-[12.5px]">
			{{ t('dms_mailing.settings.categories.empty') }}
		</p>

		<div class="border-default flex items-center gap-2 border-t px-3 py-2">
			<UButton
				v-if="!disabled"
				icon="i-ph-plus"
				variant="ghost"
				size="sm"
				:label="t('dms_mailing.settings.categories.add')"
				@click="addCategory"
			/>
			<span class="text-dimmed ms-auto text-[12px]">
				{{ key('drag_hint') }}
			</span>
		</div>
	</div>
</template>

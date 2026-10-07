<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useMailingApi } from '../composables/useMailingApi'
import {
	clampRetention,
	formatClock,
	isWithinADay,
	MAX_RETENTION_DAYS,
	MIN_RETENTION_DAYS,
	RETENTION_CUSTOM,
	RETENTION_PRESETS,
	retentionChoice,
} from '../utils/period'
import type { RetentionPreview } from '../types/mailing'

interface RetentionInputProps {
	modelValue?: number | string | null
	initialValue?: number | string | null
	disabled?: boolean
}

const props = withDefaults(defineProps<RetentionInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const KEY_PREFIX = 'dms_mailing.settings.retention.'
const PREVIEW_DEBOUNCE_MS = 300
const DAYS_PER_YEAR = 365
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
}

const api = useMailingApi()
const { t, locale } = useI18n()

const days = computed<number | null>(() => {
	const raw = Number(props.modelValue ?? props.initialValue)
	return Number.isFinite(raw) && raw > 0 ? raw : null
})

const isCustomPicked = ref(false)
const isCustom = computed(
	() =>
		isCustomPicked.value ||
		(days.value !== null && retentionChoice(days.value) === RETENTION_CUSTOM),
)
const preview = ref<RetentionPreview | null>(null)

const key = (
	path: string,
	params: Record<string, unknown> = {},
	plural = 1,
): string => t(`${KEY_PREFIX}${path}`, params, plural)

const presetLabel = (preset: number): string =>
	preset === DAYS_PER_YEAR
		? key('one_year')
		: key('days', { count: preset }, preset)

const items = computed(() => [
	...RETENTION_PRESETS.map((preset) => ({
		value: String(preset),
		label: presetLabel(preset),
	})),
	{ value: RETENTION_CUSTOM, label: key('custom') },
])

const choice = computed<string>({
	get: () => (isCustom.value ? RETENTION_CUSTOM : String(days.value ?? '')),
	set: (value) => {
		isCustomPicked.value = value === RETENTION_CUSTOM
		if (!isCustomPicked.value) emit('update:modelValue', Number(value))
	},
})

function onCustomInput(value: number | null | undefined): void {
	if (value === null || value === undefined) return
	emit('update:modelValue', clampRetention(value))
}

const previewText = computed(() => {
	const value = preview.value
	if (!value) return ''
	const params = {
		when: isWithinADay(value.nextRunAt, new Date())
			? key('tonight')
			: new Date(value.nextRunAt).toLocaleDateString(locale.value, DATE_FORMAT),
		time: formatClock(value.nextRunAt, locale.value),
		count: new Intl.NumberFormat(locale.value).format(value.count),
		days: value.days,
	}
	return value.count
		? key('preview', params, value.count)
		: key('preview_none', params)
})

const loadPreview = useDebounceFn(async (value: number) => {
	try {
		preview.value = await api.retentionPreview(value)
	} catch {
		preview.value = null
	}
}, PREVIEW_DEBOUNCE_MS)

watch(
	days,
	(value) => {
		if (value) void loadPreview(value)
	},
	{ immediate: true },
)
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<DmsSegmented
				v-model="choice"
				:items="items"
				:disabled="disabled"
				overflow="wrap"
				:aria-label="key('label')"
			/>
			<UInputNumber
				v-if="isCustom"
				:model-value="days ?? undefined"
				:min="MIN_RETENTION_DAYS"
				:max="MAX_RETENTION_DAYS"
				:disabled="disabled"
				size="sm"
				class="w-36"
				@update:model-value="onCustomInput"
			/>
			<span v-if="isCustom" class="text-muted text-[12.5px]">
				{{ key('days_unit') }}
			</span>
		</div>
		<p v-if="previewText" class="text-dimmed text-[12px]">
			{{ previewText }}
		</p>
	</div>
</template>

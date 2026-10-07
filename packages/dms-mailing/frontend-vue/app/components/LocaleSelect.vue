<script setup lang="ts">
interface LocaleSelectProps {
	modelValue?: string | null
	initialValue?: string | null
	disabled?: boolean
}

interface LocaleDefinition {
	code: string
	name?: string
}

interface LocaleOption {
	label: string
	value: string
}

const props = withDefaults(defineProps<LocaleSelectProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const LIST_SEPARATOR = ', '

const { t } = useI18n()
const { uniqueLocales } = useUniqueLocales()

const selected = computed(() => props.modelValue ?? props.initialValue ?? '')

const workspaceLocales = computed<LocaleDefinition[]>(
	() => uniqueLocales.value as LocaleDefinition[],
)

function optionOf(entry: LocaleDefinition): LocaleOption {
	const code = entry.code.toUpperCase()
	return {
		value: entry.code,
		label: entry.name ? `${entry.name} (${code})` : code,
	}
}

const items = computed<LocaleOption[]>(() => {
	const options = workspaceLocales.value.map(optionOf)
	const isKnown = options.some((option) => option.value === selected.value)
	return isKnown || !selected.value
		? options
		: [...options, optionOf({ code: selected.value })]
})

const hint = computed(() =>
	t('dms_mailing.settings.locale.workspace', {
		locales: workspaceLocales.value
			.map((entry) => entry.code.toUpperCase())
			.join(LIST_SEPARATOR),
	}),
)
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<USelect
			:model-value="selected || undefined"
			:items="items"
			value-key="value"
			icon="i-ph-translate"
			:disabled="disabled"
			:placeholder="t('dms_mailing.settings.locale.placeholder')"
			class="w-full max-w-[260px]"
			@update:model-value="(value: string) => emit('update:modelValue', value)"
		/>
		<p v-if="workspaceLocales.length" class="text-dimmed text-[12px]">
			{{ hint }}
		</p>
	</div>
</template>

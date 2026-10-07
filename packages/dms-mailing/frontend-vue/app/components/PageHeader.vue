<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import { presetShortLabelKey } from '../utils/period'
import type { Component } from 'vue'
import type { MailingComponentProps } from '../types/component'
import type { ProviderInfo } from '../types/mailing'

interface PageHeaderProps extends MailingComponentProps {
	periodScope?: string
	presets?: string[]
	defaultPreset?: string
	defaultComparison?: string
	showProvider?: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<PageHeaderProps>(), {
	periodScope: undefined,
	presets: () => [],
	defaultPreset: undefined,
	defaultComparison: undefined,
	showProvider: true,
})

const api = useMailingApi()
const { t } = useI18n()

const StatusPill = resolveComponent('DmsStatusPill') as Component
const PeriodSelector = resolveComponent('DmsPeriodSelector') as Component

const provider = ref<ProviderInfo | null>(null)

const presetLabels = computed(() =>
	Object.fromEntries(
		props.presets.map((preset) => [preset, t(presetShortLabelKey(preset))]),
	),
)

const providerPill = computed(() =>
	provider.value?.connected
		? {
				tone: 'success',
				dot: 'live',
				label: t('dms_mailing.page_header.provider_connected', {
					name: provider.value.name,
				}),
			}
		: {
				tone: 'warning',
				dot: 'static',
				label: t('dms_mailing.page_header.no_provider'),
			},
)

function renderProvider() {
	if (!props.showProvider || !provider.value) return null
	return h(StatusPill, {
		...providerPill.value,
		title: t('dms_mailing.page_header.provider_hint'),
	})
}

function renderPeriod() {
	if (!props.periodScope) return null
	return h(PeriodSelector, {
		id: props.periodScope,
		variant: 'segmented',
		size: 'sm',
		showRangeLabel: false,
		presets: props.presets.length ? props.presets : undefined,
		presetLabels: presetLabels.value,
		defaultPreset: props.defaultPreset,
		defaultComparison: props.defaultComparison,
	})
}

usePageHeaderActions(() => [renderProvider(), renderPeriod()])

onMounted(async () => {
	if (!props.showProvider) return
	try {
		provider.value = await api.provider()
	} catch {
		provider.value = { name: '', connected: false, features: null }
	}
})
</script>

<template>
	<span hidden />
</template>

<script setup lang="ts">
import type { TemplatePerformance } from '../../types/mailing'

/** A figure of the drawer's last 30 days, as `DmsStatGroup` draws it. */
interface DrawerStat {
	id: string
	eyebrow: string
	value: string
	detail?: string
	detailTone?: 'error'
	to?: string
}

/**
 * The performance tab of a template's drawer: the drawer's own bindings,
 * under the names it gives them.
 */
interface TemplateDrawerPerformanceProps {
	stats: DrawerStat[]
	loading: boolean
	hasSends: boolean
	performance: TemplatePerformance | null
	openSendLog: () => void
	formatNumber: (value: number) => string
}

defineProps<TemplateDrawerPerformanceProps>()

const { t } = useI18n()
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<DmsEyebrow :label="t('dms_mailing.templates.drawer.last_30_days')" />
			<UButton
				variant="link"
				size="xs"
				class="p-0"
				:label="t('dms_mailing.templates.drawer.open_send_log')"
				@click="openSendLog"
			/>
		</div>
		<DmsStatGroup
			layout="joined"
			:columns="3"
			:items="stats"
			:loading="loading"
		/>
	</div>
	<div class="flex flex-col gap-1">
		<DmsEyebrow :label="t('dms_mailing.templates.drawer.called_from')" />
		<p
			v-if="!hasSends || !performance?.sources.length"
			class="text-muted text-[12.5px]"
		>
			{{ t('dms_mailing.templates.drawer.no_sources') }}
		</p>
		<DmsListRow
			v-for="source in performance?.sources ?? []"
			:key="source.source"
			icon="i-ph-code"
			size="sm"
			mono
			:title="source.source || t('dms_mailing.templates.drawer.unknown_source')"
			:trailing="
				t(
					'dms_mailing.templates.drawer.sends_count',
					{ count: formatNumber(source.count) },
					source.count,
				)
			"
		/>
	</div>
	<div class="flex flex-col gap-1">
		<DmsEyebrow :label="t('dms_mailing.templates.drawer.fallbacks')" />
		<p v-if="!hasSends" class="text-muted text-[12.5px]">
			{{ t('dms_mailing.templates.drawer.no_sources') }}
		</p>
		<p
			v-else-if="!performance?.fallbacks.length"
			class="text-muted text-[12.5px]"
		>
			{{ t('dms_mailing.templates.drawer.no_fallbacks') }}
		</p>
		<DmsListRow
			v-for="fallback in performance?.fallbacks ?? []"
			:key="`${fallback.requested}-${fallback.used}`"
			icon="i-ph-translate"
			tone="warning"
			size="sm"
			:title="`${fallback.requested.toUpperCase()} → ${fallback.used.toUpperCase()}`"
			:trailing="
				t(
					'dms_mailing.templates.drawer.sends_count',
					{ count: formatNumber(fallback.count) },
					fallback.count,
				)
			"
		/>
	</div>
</template>

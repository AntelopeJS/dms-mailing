<script setup lang="ts">
import type { MailingComponentProps } from '../types/component'
import type { FunnelResponse } from '../composables/useMailingApi'
import type { FunnelStep } from '../types/mailing'

const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'
const UNSUBSCRIBED_STEP_ID = 'unsubscribed'
const RATE_DECIMALS = 1

defineProps<MailingComponentProps>()

const api = useMailingApi()
const { t, locale } = useI18n()
const { processI18n } = useTranslation()

const { data, loading } = useMailingPeriodData<FunnelResponse>(
	OVERVIEW_PERIOD_SCOPE,
	(query) => api.funnel(query),
)

const steps = computed(() => data.value?.steps ?? [])

const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

function stepColor(step: FunnelStep): 'warning' | 'primary' {
	return step.id === UNSUBSCRIBED_STEP_ID ? 'warning' : 'primary'
}

function formatRate(rate: number): string {
	return `${rate.toFixed(RATE_DECIMALS)} %`
}
</script>

<template>
	<DmsCard :padded="false" class="p-5 sm:p-6">
		<h2 class="text-highlighted mb-4 text-sm font-semibold">
			{{ t('dms_mailing.overview.funnel_title') }}
		</h2>

		<USkeleton v-if="loading && !steps.length" class="h-28 w-full" />

		<div v-else class="flex flex-col gap-3">
			<div v-for="step in steps" :key="step.id" class="flex items-center gap-3">
				<span class="text-muted w-28 shrink-0 truncate text-[12.5px]">
					{{ processI18n(step.label) }}
				</span>
				<UProgress
					:model-value="step.rate"
					:color="stepColor(step)"
					size="sm"
					class="flex-1"
				/>
				<span
					class="text-highlighted w-16 shrink-0 text-right text-[12.5px] font-medium tabular-nums"
				>
					{{ numberFormat.format(step.count) }}
				</span>
				<span
					class="text-dimmed w-14 shrink-0 text-right text-[11.5px] tabular-nums"
				>
					{{ formatRate(step.rate) }}
				</span>
			</div>
		</div>
	</DmsCard>
</template>

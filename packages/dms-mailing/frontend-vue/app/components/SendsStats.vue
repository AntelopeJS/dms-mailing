<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import { useMailingPeriodData } from '../composables/useMailingPeriodData'
import type { MailingComponentProps } from '../types/component'
import type { SendStatsResponse } from '../composables/useMailingApi'

interface SendsStatsProps extends MailingComponentProps {
	periodScope?: string
}

const DEFAULT_PERIOD_SCOPE = 'mailing-sends'
const REFRESH_EVERY_MS = 30_000
const STAT_COLUMNS = 5

const props = withDefaults(defineProps<SendsStatsProps>(), {
	periodScope: DEFAULT_PERIOD_SCOPE,
})

const api = useMailingApi()
const { t } = useI18n()
const { processText } = useComposedText()

const { data, loading, refresh } = useMailingPeriodData<SendStatsResponse>(
	props.periodScope,
	(query) => api.sendStats(query),
	{ refreshEvery: REFRESH_EVERY_MS },
)

const items = computed(() =>
	(data.value?.items ?? []).map((item) => ({
		...item,
		eyebrow: processText(item.eyebrow),
		value: processText(item.value),
		detail: item.detail === undefined ? undefined : processText(item.detail),
	})),
)

onMounted(() => onUnmounted(onPageBlocksRefresh(() => void refresh())))
</script>

<template>
	<DmsStatGroup
		layout="joined"
		:columns="STAT_COLUMNS"
		:items="items"
		:loading="loading && !items.length"
		:skeleton-count="STAT_COLUMNS"
		:label="t('dms_mailing.sends.stats.label')"
	/>
</template>

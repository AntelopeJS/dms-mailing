<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import { useMailingPeriodData } from '../composables/useMailingPeriodData'
import { buildSendStatItems, type Translate } from '../utils/send-stats'
import type { MailingComponentProps } from '../types/component'
import type { SendStats } from '../types/mailing'

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
const { t, locale } = useI18n()

const providerName = ref('')

const { data, loading } = useMailingPeriodData<SendStats>(
	props.periodScope,
	(query) => api.sendStats(query),
	{ refreshEvery: REFRESH_EVERY_MS },
)

const translate: Translate = (key, params = {}) =>
	t(key, params, typeof params.count === 'number' ? params.count : 1)

const items = computed(() =>
	data.value
		? buildSendStatItems(data.value, {
				translate,
				locale: locale.value,
				provider: providerName.value,
				now: new Date(),
			})
		: [],
)

onMounted(async () => {
	try {
		const provider = await api.provider()
		providerName.value = provider.name
	} catch {
		providerName.value = ''
	}
})
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

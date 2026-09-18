<script setup lang="ts">
import type { ProviderInfo } from '../types/mailing'

const api = useMailingApi()
const { t } = useI18n()

const provider = ref<ProviderInfo | null>(null)

onMounted(async () => {
	try {
		provider.value = await api.provider()
	} catch {
		provider.value = null
	}
})

const isConnected = computed(() => provider.value?.connected === true)

const label = computed(() =>
	isConnected.value
		? t('dms_mailing.provider.connected', { name: provider.value?.name ?? '' })
		: t('dms_mailing.provider.disconnected'),
)
</script>

<template>
	<UChip
		v-if="provider"
		:color="isConnected ? 'success' : 'warning'"
		size="sm"
		inset
	>
		<UBadge
			:color="isConnected ? 'neutral' : 'warning'"
			variant="subtle"
			:label="label"
		/>
	</UChip>
</template>

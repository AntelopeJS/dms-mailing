<script setup lang="ts">
import { SUPPRESSIONS_PATH } from '../utils/pages'
import { suppressionFilterOf } from '../utils/suppression'

const KEY_PREFIX = 'dms_mailing.suppressions.filter.'

const route = useDmsRoute()
const { t } = useI18n()

/** The address a link from a send narrowed the list to. */
const email = computed(() => suppressionFilterOf(route.query))
</script>

<template>
	<DmsBanner
		v-if="email"
		tone="info"
		size="sm"
		icon="i-ph-funnel"
		:title="t(`${KEY_PREFIX}title`, { email })"
	>
		<template #actions>
			<UButton
				size="xs"
				color="neutral"
				variant="outline"
				icon="i-ph-x"
				:label="t(`${KEY_PREFIX}clear`)"
				@click="navigateDms(SUPPRESSIONS_PATH)"
			/>
		</template>
	</DmsBanner>
</template>

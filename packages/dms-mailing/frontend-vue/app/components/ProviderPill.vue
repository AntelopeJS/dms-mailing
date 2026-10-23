<script setup lang="ts">
import { useProviderInfo } from '../composables/useMailingReads'
import type { MailingComponentProps } from '../types/component'
import type { ProviderInfo } from '../types/mailing'

interface ProviderPillProps extends MailingComponentProps {
	showProvider?: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<ProviderPillProps>(), {
	showProvider: true,
})

const { t } = useI18n()

/** Shown as "no provider" when the read fails. */
const NO_PROVIDER: ProviderInfo = { name: '', connected: false, features: null }

const providerRead = useProviderInfo(() => props.showProvider)
const provider = computed<ProviderInfo | null>(() =>
	providerRead.error.value ? NO_PROVIDER : providerRead.data.value,
)

/** The leading child of the page toolbar: is a provider carrying the mail. */
const pill = computed(() =>
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
</script>

<template>
	<DmsStatusPill
		v-if="props.showProvider && provider"
		v-bind="pill"
		:title="t('dms_mailing.page_header.provider_hint')"
	/>
</template>

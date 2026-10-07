<script setup lang="ts">
interface SendsEmptyProps {
	state?: string
	search?: string
	refresh?: () => void
}

withDefaults(defineProps<SendsEmptyProps>(), {
	state: undefined,
	search: undefined,
	refresh: undefined,
})

const TEMPLATES_PAGE = '/modules/mailing/templates'
const SNIPPET_SLUG = 'order-confirmed'
const SNIPPET_RECIPIENT = 'margaux@northwind.co'

const { t } = useI18n()

const snippet = [
	`await SendTemplate("${SNIPPET_SLUG}", {`,
	`  to: "${SNIPPET_RECIPIENT}",`,
	'  variables: { order },',
	'});',
].join('\n')
</script>

<template>
	<DmsEmptyState
		icon="i-ph-paper-plane-tilt"
		size="lg"
		hatched
		:title="t('dms_mailing.sends.empty_log.title')"
		:description="t('dms_mailing.sends.empty_log.description')"
	>
		<template #actions>
			<div class="flex w-full max-w-[420px] flex-col items-center gap-3">
				<div
					class="bg-default border-default relative w-full rounded-lg border p-3 text-left"
				>
					<pre
						class="text-toned overflow-x-auto font-mono text-[11.5px] leading-relaxed"
						>{{ snippet }}</pre>
					<DmsCopyButton :value="snippet" class="absolute right-1.5 top-1.5" />
				</div>
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-ph-flask"
					:label="t('dms_mailing.sends.empty_log.test_instead')"
					@click="navigateDms(TEMPLATES_PAGE)"
				/>
			</div>
		</template>
	</DmsEmptyState>
</template>

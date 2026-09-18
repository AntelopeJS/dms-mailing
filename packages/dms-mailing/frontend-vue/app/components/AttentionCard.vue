<script setup lang="ts">
import type { MailingComponentProps } from '../types/component'
import type { AttentionResponse } from '../composables/useMailingApi'
import type { AttentionItem, AttentionTone } from '../types/mailing'

const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'

const TONE_CLASSES: Record<AttentionTone, string> = {
	warning: 'bg-warning/10 text-warning',
	error: 'bg-error/10 text-error',
	neutral: 'bg-elevated text-muted',
}

defineProps<MailingComponentProps>()

const api = useMailingApi()
const { t } = useI18n()
const { processI18n } = useTranslation()

const { data, loading } = useMailingPeriodData<AttentionResponse>(
	OVERVIEW_PERIOD_SCOPE,
	(query) => api.attention(query),
)

const items = computed(() => data.value?.items ?? [])

function open(item: AttentionItem): void {
	if (!item.to) return
	navigateDms(item.to)
}
</script>

<template>
	<DmsCard :padded="false" class="p-5 sm:p-6">
		<h2 class="text-highlighted mb-3 text-sm font-semibold">
			{{ t('dms_mailing.overview.attention_title') }}
		</h2>

		<USkeleton v-if="loading && !items.length" class="h-24 w-full" />

		<p v-else-if="!items.length" class="text-muted text-[13px]">
			{{ t('dms_mailing.overview.attention_empty') }}
		</p>

		<div v-else class="flex flex-col gap-1">
			<UButton
				v-for="item in items"
				:key="item.id"
				color="neutral"
				variant="ghost"
				class="items-start gap-3 text-left"
				:disabled="!item.to"
				@click="open(item)"
			>
				<span
					:class="TONE_CLASSES[item.tone]"
					class="grid size-[30px] shrink-0 place-items-center rounded-lg"
				>
					<UIcon :name="item.icon" class="size-4" aria-hidden="true" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="text-toned block text-[13px] font-medium">
						{{ processI18n(item.title, item.params) }}
					</span>
					<span class="text-dimmed mt-0.5 block text-[11.5px]">
						{{ processI18n(item.description, item.params) }}
					</span>
				</span>
				<UIcon
					v-if="item.to"
					name="i-ph-caret-right"
					class="text-dimmed size-4 shrink-0"
					aria-hidden="true"
				/>
			</UButton>
		</div>
	</DmsCard>
</template>

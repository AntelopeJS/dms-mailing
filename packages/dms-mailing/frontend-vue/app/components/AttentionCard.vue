<script setup lang="ts">
import {
	useMailingApi,
	type AttentionResponse,
} from '../composables/useMailingApi'
import { useMailingPeriodData } from '../composables/useMailingPeriodData'
import {
	ATTENTION_WELL_TONES,
	splitCount,
	translationKeyOf,
	type CountedText,
} from '../utils/attention'
import { formatClock } from '../utils/period'
import type { MailingComponentProps } from '../types/component'
import type { AttentionItem } from '../types/mailing'

const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'
const SKELETON_ROWS = 3

defineProps<MailingComponentProps>()

const api = useMailingApi()
const { t, locale } = useI18n()

const { data, loading, updatedAt } = useMailingPeriodData<AttentionResponse>(
	OVERVIEW_PERIOD_SCOPE,
	(query) => api.attention(query),
)

const items = computed(() => data.value?.items ?? [])
const isFirstLoad = computed(() => loading.value && !data.value)

const updatedLabel = computed(() =>
	updatedAt.value
		? t('dms_mailing.attention_card.updated', {
				time: formatClock(updatedAt.value, locale.value),
			})
		: '',
)

function translate(value: string, item: AttentionItem): string {
	const key = translationKeyOf(value)
	if (!key) return value
	const params = { ...item.params, count: item.count ?? item.params?.count }
	const plural = typeof params.count === 'number' ? params.count : 1
	return t(key, params, plural)
}

interface AttentionRow {
	item: AttentionItem
	title: string
	counted: CountedText | null
	description: string
	action: string
}

const rows = computed<AttentionRow[]>(() =>
	items.value.map((item) => {
		const title = translate(item.title, item)
		return {
			item,
			title,
			counted: splitCount(title, item.count, String(item.count ?? '')),
			description: translate(item.description, item),
			action: item.action ? translate(item.action, item) : '',
		}
	}),
)
</script>

<template>
	<DmsCard class="h-full" :padded="false">
		<template #header>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<DmsEyebrow
					as="span"
					tone="muted"
					:label="t('dms_mailing.attention_card.title')"
				/>
				<DmsStatusPill
					v-if="items.length"
					tone="error"
					dot="none"
					size="sm"
					:label="String(items.length)"
				/>
			</div>
		</template>
		<template v-if="updatedLabel" #actions>
			<span class="text-dimmed font-mono text-[11px]">{{ updatedLabel }}</span>
		</template>

		<div v-if="isFirstLoad" class="flex flex-col gap-3 p-5">
			<USkeleton v-for="row in SKELETON_ROWS" :key="row" class="h-12 w-full" />
		</div>

		<DmsEmptyState
			v-else-if="!items.length"
			icon="i-ph-seal-check"
			tone="success"
			:title="t('dms_mailing.attention_card.empty.title')"
			:description="t('dms_mailing.attention_card.empty.description')"
		/>

		<div v-else class="flex flex-col py-1.5">
			<DmsListRow
				v-for="row in rows"
				:key="row.item.id"
				:to="row.item.to"
				:icon="row.item.icon"
				:tone="ATTENTION_WELL_TONES[row.item.tone]"
				icon-size="xs"
				size="sm"
				:interactive="!!row.item.to"
				:description="row.description"
			>
				<template v-if="row.counted">
					{{ row.counted.before }}
					<b class="text-highlighted tabular-nums">{{ row.counted.count }}</b>
					{{ row.counted.after }}
				</template>
				<template v-else>{{ row.title }}</template>
				<template v-if="row.action" #meta>
					<span class="text-primary inline-flex items-center gap-1 font-medium">
						{{ row.action }}
						<UIcon name="i-ph-arrow-right" class="size-3" aria-hidden="true" />
					</span>
				</template>
				<template v-else-if="row.item.to" #trailing>
					<UIcon
						name="i-ph-caret-right"
						class="text-dimmed size-4"
						aria-hidden="true"
					/>
				</template>
			</DmsListRow>
		</div>
	</DmsCard>
</template>

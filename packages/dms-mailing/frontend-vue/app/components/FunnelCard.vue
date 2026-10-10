<script setup lang="ts">
import {
	useMailingApi,
	type FunnelResponse,
} from '../composables/useMailingApi'
import { useMailingPeriodData } from '../composables/useMailingPeriodData'
import {
	biggestDrop,
	formatRate,
	FUNNEL_KINDS,
	FUNNEL_LEAK_STEP,
} from '../utils/funnel'
import type { MailingComponentProps } from '../types/component'
import type { FunnelKind, FunnelStep } from '../types/mailing'

const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'
const SKELETON_ROWS = 5
const KEY_PREFIX = 'dms_mailing.funnel_card.'

defineProps<MailingComponentProps>()

const api = useMailingApi()
const { t, locale } = useI18n()
const { processI18n } = useTranslation()

const kind = ref<FunnelKind>('all')

const { data, loading } = useMailingPeriodData<FunnelResponse>(
	OVERVIEW_PERIOD_SCOPE,
	(query) => api.funnel(query),
	{ extraQuery: () => ({ kind: kind.value }) },
)

const steps = computed(() => data.value?.steps ?? [])
const total = computed(() => steps.value[0]?.count ?? 0)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

const kindItems = computed(() =>
	FUNNEL_KINDS.map((value) => ({
		value,
		label: t(`${KEY_PREFIX}kinds.${value}`),
	})),
)

const stepLabel = (step: FunnelStep): string => processI18n(step.label)

const takeaway = computed(() => {
	const drop = biggestDrop(steps.value)
	if (!drop) return t(`${KEY_PREFIX}no_drop`)
	return t(`${KEY_PREFIX}takeaway`, {
		from: stepLabel(drop.from).toLocaleLowerCase(locale.value),
		to: stepLabel(drop.to).toLocaleLowerCase(locale.value),
	})
})

const isLeak = (step: FunnelStep): boolean => step.id === FUNNEL_LEAK_STEP
</script>

<template>
	<DmsCard class="h-full" :padded="false" :title="t(`${KEY_PREFIX}title`)">
		<template #actions>
			<DmsSegmented
				v-model="kind"
				size="xs"
				:items="kindItems"
				:aria-label="t(`${KEY_PREFIX}kind_label`)"
			/>
		</template>

		<div class="flex flex-col gap-3.5 p-5">
			<template v-if="loading && !steps.length">
				<USkeleton v-for="row in SKELETON_ROWS" :key="row" class="h-5 w-full" />
			</template>
			<template v-else>
				<div
					v-for="step in steps"
					:key="step.id"
					class="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-3"
				>
					<span
						class="truncate text-[12.5px]"
						:class="isLeak(step) ? 'text-warning' : 'text-toned'"
					>
						{{ stepLabel(step) }}
					</span>
					<DmsMeter
						as="span"
						:value="step.count"
						:max="Math.max(total, 1)"
						:tone="isLeak(step) ? 'warning' : 'primary'"
						size="sm"
					/>
					<span
						class="text-highlighted text-right font-mono text-[12.5px] font-semibold tabular-nums"
					>
						{{ numberFormat.format(step.count) }}
					</span>
					<span
						class="text-right font-mono text-[11.5px] tabular-nums"
						:class="isLeak(step) ? 'text-warning' : 'text-dimmed'"
					>
						{{ formatRate(step.rate, locale) }}
					</span>
				</div>
			</template>
		</div>

		<template #footer>
			<span class="text-muted flex items-center gap-2 text-[12.5px]">
				<UIcon
					name="i-ph-info"
					class="text-dimmed size-4 shrink-0"
					aria-hidden="true"
				/>
				{{ takeaway }}
			</span>
		</template>
	</DmsCard>
</template>

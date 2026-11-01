<script setup lang="ts">
import { mailingPath, type FunnelResponse } from '../composables/useMailingApi'
import {
	biggestDrop,
	deltaTone,
	formatDelta,
	formatRate,
	FUNNEL_KINDS,
	FUNNEL_LEAK_STEP,
	funnelTakeaway,
	isCompared,
	isMeasured,
	type FunnelStepReading,
	type FunnelTakeaway,
} from '../utils/funnel'
import type { MailingComponentProps } from '../types/component'
import type { FunnelKind } from '../types/mailing'

const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'
const MAILING_SENDS_TOPIC = 'mailing:sends'
/** The funnel route, its `kind` filled from the card's own switch. */
const FUNNEL_URL = `${mailingPath('metrics', 'funnel')}?kind={{params.kind}}`
const SKELETON_ROWS = 5
const KEY_PREFIX = 'dms_mailing.funnel_card.'
const NOT_TRACKED_KEY = 'dms_mailing.metrics.not_tracked'

/**
 * A row's columns: label, meter, count, rate, and the change while the
 * toolbar compares. Written out whole so Tailwind sees every class.
 */
const ROW_GRID = {
	plain:
		'@md:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_3.5rem] grid-cols-[minmax(0,1fr)_auto_auto]',
	compared:
		'@md:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_3.5rem_4rem] grid-cols-[minmax(0,1fr)_auto_auto_auto]',
}
const METER_SPAN = { plain: 'col-span-3', compared: 'col-span-4' }
const UNTRACKED_SPAN = { plain: 'col-span-2', compared: 'col-span-3' }
const DELTA_TONE_CLASSES: Record<ReturnType<typeof deltaTone>, string> = {
	success: 'text-success',
	error: 'text-error',
	neutral: 'text-dimmed',
}

const TAKEAWAY_KEYS: Record<FunnelTakeaway, string> = {
	empty: `${KEY_PREFIX}no_drop`,
	untracked: `${KEY_PREFIX}untracked`,
	no_loss: `${KEY_PREFIX}no_loss`,
	drop: `${KEY_PREFIX}takeaway`,
}

defineProps<MailingComponentProps>()

const { t, locale } = useI18n()
const { processI18n } = useTranslation()

const kind = ref<FunnelKind>('all')

const {
	data,
	isLoading: loading,
	error,
	refresh,
} = useChartFetch<FunnelResponse>({
	fetchUrl: FUNNEL_URL,
	routeParams: () => ({ kind: kind.value }),
	periodScope: OVERVIEW_PERIOD_SCOPE,
	realtimeTopic: MAILING_SENDS_TOPIC,
})

const steps = computed<FunnelStepReading[]>(() => data.value?.steps ?? [])
const total = computed(() => steps.value[0]?.count ?? 0)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))
const consumeRefusal = useReadOnlyRefusal()
const isRefused = computed(() => consumeRefusal(error.value))
const hasFailed = computed(
	() => !data.value && !!error.value && !isRefused.value,
)

const kindItems = computed(() =>
	FUNNEL_KINDS.map((value) => ({
		value,
		label: t(`${KEY_PREFIX}kinds.${value}`),
	})),
)

const errorActions = computed(() => [
	{
		label: t(`${KEY_PREFIX}retry`),
		icon: 'i-ph-arrows-clockwise',
		color: 'neutral' as const,
		variant: 'outline' as const,
		onClick: () => void refresh(),
	},
])

const stepLabel = (step: FunnelStepReading): string => processI18n(step.label)

const takeaway = computed(() => {
	const drop = biggestDrop(steps.value)
	return t(
		TAKEAWAY_KEYS[funnelTakeaway(steps.value)],
		drop
			? {
					from: stepLabel(drop.from).toLocaleLowerCase(locale.value),
					to: stepLabel(drop.to).toLocaleLowerCase(locale.value),
				}
			: {},
	)
})

const isLeak = (step: FunnelStepReading): boolean =>
	step.id === FUNNEL_LEAK_STEP

/** "No comparison" in the toolbar drops the column rather than leave dashes. */
const layout = computed(() => (isCompared(steps.value) ? 'compared' : 'plain'))

const deltaTitle = (step: FunnelStepReading): string | undefined =>
	step.previousCount === undefined
		? undefined
		: t(`${KEY_PREFIX}compared_count`, {
				value: numberFormat.value.format(step.previousCount),
			})
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

		<DmsEmptyState
			v-if="hasFailed"
			variant="error"
			size="sm"
			:title="t(`${KEY_PREFIX}error_title`)"
			:actions="errorActions"
		/>
		<div v-else-if="!isRefused" class="@container flex flex-col gap-3.5 p-5">
			<template v-if="loading && !steps.length">
				<USkeleton v-for="row in SKELETON_ROWS" :key="row" class="h-5 w-full" />
			</template>
			<template v-else>
				<div
					v-for="step in steps"
					:key="step.id"
					data-funnel-step
					class="grid items-center gap-x-3 gap-y-1.5"
					:class="ROW_GRID[layout]"
				>
					<span
						class="truncate text-[12.5px]"
						:class="isLeak(step) ? 'text-warning' : 'text-toned'"
					>
						{{ stepLabel(step) }}
					</span>
					<DmsMeter
						as="span"
						class="@md:order-none @md:col-span-1 order-last"
						:class="METER_SPAN[layout]"
						:value="isMeasured(step) ? step.count : 0"
						:max="Math.max(total, 1)"
						:tone="isLeak(step) ? 'warning' : 'primary'"
						size="sm"
					/>
					<template v-if="isMeasured(step)">
						<span
							class="text-highlighted @md:min-w-0 min-w-[4.5rem] text-right font-mono text-[12.5px] font-semibold tabular-nums"
						>
							{{ numberFormat.format(step.count) }}
						</span>
						<span
							class="@md:min-w-0 min-w-[3.5rem] text-right font-mono text-[11.5px] tabular-nums"
							:class="isLeak(step) ? 'text-warning' : 'text-dimmed'"
						>
							{{ formatRate(step.rate, locale) }}
						</span>
						<span
							v-if="layout === 'compared'"
							data-funnel-delta
							class="text-right font-mono text-[11.5px] tabular-nums"
							:class="DELTA_TONE_CLASSES[deltaTone(step)]"
							:title="deltaTitle(step)"
						>
							{{ formatDelta(step.delta, locale) }}
						</span>
					</template>
					<span
						v-else
						data-funnel-untracked
						class="text-dimmed text-right text-[11.5px]"
						:class="UNTRACKED_SPAN[layout]"
					>
						{{ t(NOT_TRACKED_KEY) }}
					</span>
				</div>
			</template>
		</div>

		<template v-if="!hasFailed" #footer>
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

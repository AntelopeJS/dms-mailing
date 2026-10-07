<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import { formatClock } from '../utils/period'
import type { MailingComponentProps } from '../types/component'
import type { SendHealth } from '../types/mailing'

defineProps<MailingComponentProps>()

const SETTINGS_PROVIDER_PAGE = '/modules/mailing/settings#provider'
const REFRESH_EVERY_MS = 60_000
const KEY_PREFIX = 'dms_mailing.sends.banner.'

const api = useMailingApi()
const toast = useToast()
const { confirm } = useConfirm()
const { t, locale } = useI18n()

const health = ref<SendHealth | null>(null)
let pollTimer: ReturnType<typeof setInterval> | undefined

const failures = computed(() => health.value?.recentFailures ?? 0)
const isVisible = computed(
	() =>
		!!health.value && (!health.value.providerReachable || failures.value > 0),
)

const providerName = computed(
	() => health.value?.providerName || t(`${KEY_PREFIX}the_provider`),
)

type BannerState = 'missing' | 'unreachable' | 'failing'

const TITLE_KEYS: Record<BannerState, string> = {
	missing: 'missing_title',
	unreachable: 'unreachable_title',
	failing: 'failures_title',
}

const state = computed<BannerState>(() => {
	if (health.value?.providerReachable) return 'failing'
	return health.value?.providerName ? 'unreachable' : 'missing'
})

const title = computed(() =>
	t(`${KEY_PREFIX}${TITLE_KEYS[state.value]}`, {
		provider: providerName.value,
	}),
)

const description = computed(() => {
	if (!failures.value) return t(`${KEY_PREFIX}${state.value}_description`)
	return t(
		`${KEY_PREFIX}failures_description`,
		{
			count: failures.value,
			time: formatClock(health.value?.since ?? new Date(), locale.value),
			provider: providerName.value,
		},
		failures.value,
	)
})

async function load(): Promise<void> {
	try {
		health.value = await api.sendHealth()
	} catch {
		health.value = null
	}
}

async function replayFailed(): Promise<void> {
	const count = failures.value
	await confirm({
		title: t(`${KEY_PREFIX}confirm.title`, { count }, count),
		description: t(`${KEY_PREFIX}confirm.description`, { count }, count),
		color: 'warning',
		icon: 'i-ph-arrow-clockwise',
		confirmLabel: t(`${KEY_PREFIX}confirm.confirm`, { count }, count),
		cancelLabel: t(`${KEY_PREFIX}confirm.cancel`),
		onConfirm: async () => {
			const result = await api.replayFailed(health.value?.since)
			toast.add({
				color: 'success',
				title: t(
					`${KEY_PREFIX}replayed`,
					{ count: result.count },
					result.count,
				),
			})
			await load()
		},
	})
}

onMounted(() => {
	void load()
	pollTimer = setInterval(() => void load(), REFRESH_EVERY_MS)
})

onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<template>
	<DmsBanner
		v-if="isVisible"
		tone="error"
		icon="i-ph-plugs"
		:title="title"
		:description="description"
	>
		<template #actions>
			<UButton
				size="sm"
				color="neutral"
				variant="outline"
				:label="t(`${KEY_PREFIX}settings`)"
				@click="navigateDms(SETTINGS_PROVIDER_PAGE)"
			/>
			<UButton
				v-if="failures > 0"
				size="sm"
				color="error"
				icon="i-ph-arrow-clockwise"
				:label="t(`${KEY_PREFIX}send_again`, { count: failures }, failures)"
				@click="replayFailed"
			/>
		</template>
	</DmsBanner>
</template>

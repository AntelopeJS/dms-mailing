<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { useMailingApi } from '../composables/useMailingApi'
import { describeProblem, problemEventReason } from '../utils/problems'
import {
	formatPayload,
	SEND_STATUS_TONES,
	sendFooterActions,
	shortSendId,
	type SendAction,
	type SendActionId,
} from '../utils/send-actions'
import { formatLatency, isSlowLatency } from '../utils/send-stats'
import { buildTimeline, type TimelineItem } from '../utils/timeline'
import type { Component } from 'vue'
import type { SendDetailResponse, SendRow } from '../types/mailing'

interface RowNavigation {
	hasPrev: boolean
	hasNext: boolean
	prev: () => void
	next: () => void
}

interface SendDrawerProps {
	sendId?: string
	rowData?: SendRow
	onSuccessCallback?: () => void
	navigation?: RowNavigation
}

interface StatTrioItem {
	id: string
	eyebrow: string
	value: string
	detail?: string
	detailTone?: 'warning' | 'error'
}

const EDITOR_PATH = '/modules/mailing/templates'
const RENDERING_MODAL = 'MailingRenderingModal'
const RENDERING_MODAL_SIZE = '3xl'
const FIX_ADDRESS_MODAL = 'MailingFixAddressModal'
const FIX_ADDRESS_MODAL_SIZE = 'md'
const KEY_PREFIX = 'dms_mailing.sends.drawer.'
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
}
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
}

const props = defineProps<SendDrawerProps>()

const api = useMailingApi()
const toast = useToast()
const { confirm } = useConfirm()
const { open: openModal } = useModal()
const { t, locale } = useI18n()
const { copy } = useClipboard()

const KeyValueList = resolveComponent('DmsKeyValueList') as Component

const sendId = computed(() => props.rowData?._id ?? props.sendId ?? '')
const detail = ref<SendDetailResponse | null>(null)
const loading = ref(false)
const sending = ref(false)

const send = computed<SendRow | null>(
	() => detail.value?.send ?? props.rowData ?? null,
)
const key = (path: string, params: Record<string, unknown> = {}): string =>
	t(`${KEY_PREFIX}${path}`, params)

const dateOf = (iso: string, format: Intl.DateTimeFormatOptions): string =>
	new Date(iso).toLocaleString(locale.value, format)

const problem = computed(() =>
	send.value
		? describeProblem(
				{
					...send.value,
					error:
						send.value.error ||
						problemEventReason(detail.value?.events ?? []),
				},
				t('dms_mailing.sends.banner.the_provider'),
			)
		: null,
)
const actions = computed<SendAction[]>(() =>
	send.value ? sendFooterActions(send.value.status) : [],
)
const payload = computed(() => formatPayload(send.value?.json_variables))
const versionLabel = computed(() =>
	send.value?.templateVersion
		? key('version', { version: send.value.templateVersion })
		: key('draft_version'),
)

const timeline = computed(() =>
	send.value ? buildTimeline(detail.value?.events ?? [], send.value) : [],
)

const stats = computed<StatTrioItem[]>(() => {
	const row = send.value
	if (!row) return []
	const isFallback = !!row.requestedLocale && row.requestedLocale !== row.locale
	return [
		{
			id: 'template',
			eyebrow: key('template'),
			value: row.templateSlug,
			detail: versionLabel.value,
		},
		{
			id: 'locale',
			eyebrow: key('locale'),
			value: (row.requestedLocale || row.locale).toUpperCase(),
			detail: isFallback
				? key('fallback_used', { locale: row.locale.toUpperCase() })
				: key('as_requested'),
			detailTone: isFallback ? 'warning' : undefined,
		},
		{
			id: 'latency',
			eyebrow: key('latency'),
			value: formatLatency(row.latencyMs, locale.value),
			detail: isSlowLatency(row.latencyMs)
				? key('slow_latency')
				: key('latency_hint'),
			detailTone: isSlowLatency(row.latencyMs) ? 'error' : undefined,
		},
	]
})

const originTitle = computed(() => {
	const template = detail.value?.template
	const name = template?.name ?? send.value?.templateSlug ?? ''
	return `${name} · ${versionLabel.value}`
})

const editorLink = computed(() =>
	send.value
		? `${EDITOR_PATH}/${send.value.templateId}?locale=${send.value.locale}`
		: undefined,
)

function stepTitle(item: TimelineItem): string {
	return t(item.titleKey, item.titleParams)
}

function stepTime(item: TimelineItem): string {
	return item.at ? dateOf(item.at, TIME_FORMAT) : '—'
}

async function load(): Promise<void> {
	if (!sendId.value) return
	loading.value = true
	try {
		detail.value = await api.send(sendId.value)
	} catch (error) {
		useApiError(error)
	} finally {
		loading.value = false
	}
}

function settle(): void {
	if (props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	void load()
}

async function copyText(value: string, messageKey: string): Promise<void> {
	await copy(value)
	toast.add({ color: 'success', title: key(messageKey) })
}

function openRendering(): void {
	const row = send.value
	if (!row) return
	openModal({
		title: t('dms_mailing.rendering.received_by', {
			name: row.recipientName || row.recipientEmail,
		}),
		component: resolveComponent(RENDERING_MODAL) as Component,
		componentOptions: { rowData: row, sendId: row._id },
		size: RENDERING_MODAL_SIZE,
	})
}

function openFixAddress(): void {
	const row = send.value
	if (!row) return
	const modal = openModal({
		title: t('dms_mailing.sends.fix_address.title'),
		component: resolveComponent(FIX_ADDRESS_MODAL) as Component,
		componentOptions: { rowData: row, version: row.templateVersion ?? 0 },
		size: FIX_ADDRESS_MODAL_SIZE,
	})
	void modal.result.then((result) => {
		if (result) settle()
	})
}

function replayBody() {
	const row = send.value as SendRow
	const lastTry = row.error || t(`dms_mailing.sends.status.${row.status}`)
	return h(KeyValueList, {
		dense: true,
		items: [
			{
				id: 'to',
				label: key('replay.to'),
				value: `${row.recipientName ? `${row.recipientName} · ` : ''}${row.recipientEmail}`,
			},
			{
				id: 'template',
				label: key('replay.template'),
				value: `${row.templateSlug} · ${versionLabel.value} · ${row.locale.toUpperCase()}`,
				type: 'mono',
			},
			{
				id: 'last',
				label: key('replay.last_try'),
				value: lastTry,
				tone: 'error',
			},
		],
	})
}

async function replay(): Promise<void> {
	sending.value = true
	try {
		await api.replay(sendId.value)
		toast.add({
			color: 'success',
			title: t('dms_mailing.sends.actions.sent_again'),
		})
		settle()
	} finally {
		sending.value = false
	}
}

function confirmSendAgain(): void {
	const row = send.value
	if (!row) return
	void confirm({
		title: t('dms_mailing.sends.confirm.replay_title'),
		description: t('dms_mailing.sends.confirm.replay_description', {
			recipientEmail: row.recipientEmail,
		}),
		color: 'warning',
		icon: 'i-ph-arrow-clockwise',
		confirmIcon: 'i-ph-arrow-clockwise',
		confirmLabel: t('dms_mailing.sends.confirm.replay_confirm'),
		cancelLabel: key('replay.cancel'),
		body: replayBody,
		onConfirm: replay,
	})
}

const ACTION_HANDLERS: Record<SendActionId, () => void> = {
	rendering: openRendering,
	copy_address: () =>
		void copyText(send.value?.recipientEmail ?? '', 'address_copied'),
	fix_address: openFixAddress,
	send_again: confirmSendAgain,
}

const copyLink = () => void copyText(window.location.href, 'link_copied')
const copyPayload = () => void copyText(payload.value, 'json_copied')

onMounted(load)
</script>

<template>
	<div class="flex min-h-full flex-col">
		<USkeleton v-if="loading && !send" class="m-5 h-64" />

		<template v-else-if="send">
			<header
				class="border-default flex flex-col gap-1.5 border-b px-5 pb-4 pt-1"
			>
				<div class="flex items-center gap-1">
					<DmsEyebrow
						class="min-w-0 flex-1"
						truncate
						:label="key('eyebrow', { id: shortSendId(send._id) })"
					/>
					<template v-if="navigation">
						<UButton
							icon="i-ph-caret-up"
							color="neutral"
							variant="ghost"
							size="sm"
							:disabled="!navigation.hasPrev"
							:aria-label="key('previous')"
							@click="navigation.prev()"
						/>
						<UButton
							icon="i-ph-caret-down"
							color="neutral"
							variant="ghost"
							size="sm"
							:disabled="!navigation.hasNext"
							:aria-label="key('next')"
							@click="navigation.next()"
						/>
					</template>
					<UButton
						icon="i-ph-link"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="key('copy_link')"
						@click="copyLink"
					/>
				</div>
				<h3
					class="text-highlighted flex flex-wrap items-center gap-2 text-lg font-semibold"
				>
					<span class="min-w-0 truncate">
						{{ send.recipientName || send.recipientEmail }}
					</span>
					<DmsStatusPill
						:tone="SEND_STATUS_TONES[send.status]"
						:label="t(`dms_mailing.sends.status.${send.status}`)"
					/>
					<DmsStatusPill
						v-if="send.isTest"
						tone="warning"
						dot="none"
						size="sm"
						uppercase
						:label="key('test')"
					/>
				</h3>
				<p class="text-muted truncate text-[12.5px]">
					<span class="font-mono">{{ send.recipientEmail }}</span>
					· {{ dateOf(send.createdAt, DATE_FORMAT) }}
				</p>
			</header>

			<div class="flex flex-1 flex-col gap-6 p-5">
				<section class="flex flex-col gap-3">
					<DmsStatGroup layout="joined" :columns="3" :items="stats" />
					<DmsBanner
						v-if="problem"
						:tone="send.status === 'spam' ? 'warning' : 'error'"
						:icon="problem.icon"
						:title="t(problem.titleKey, problem.params)"
						:description="t(problem.descriptionKey, problem.params)"
					/>
				</section>

				<section class="flex flex-col gap-2">
					<DmsEyebrow :label="key('timeline')" />
					<ol class="flex flex-col">
						<li
							v-for="item in timeline"
							:key="item.id"
							:class="item.isPending && 'opacity-50'"
						>
							<DmsActivityItem
								:icon="item.icon"
								:icon-color="item.isPending ? 'neutral' : item.tone"
								:subtitle="
									item.isPending ? key('pending') : item.detail || undefined
								"
								:mono="item.isDetailMono && !item.isPending"
								:trailing="stepTime(item)"
								:interactive="false"
							>
								<span
									:class="
										item.tone === 'error' && !item.isPending
											? 'text-error'
											: undefined
									"
								>
									{{ stepTitle(item) }}
								</span>
							</DmsActivityItem>
						</li>
					</ol>
				</section>

				<section class="flex flex-col gap-2">
					<DmsEyebrow :label="key('origin')" />
					<div
						class="border-default divide-default divide-y overflow-hidden rounded-lg border"
					>
						<DmsListRow
							:to="editorLink"
							icon="i-ph-envelope-simple"
							icon-size="2xs"
							size="sm"
							:title="originTitle"
						>
							<template #trailing>
								<UIcon
									name="i-ph-arrow-square-out"
									class="text-dimmed size-4"
									aria-hidden="true"
								/>
							</template>
						</DmsListRow>
						<DmsListRow
							v-if="send.source"
							icon="i-ph-code"
							icon-size="2xs"
							size="sm"
							:trailing="key('source')"
						>
							<span class="font-mono text-[12.5px]">{{ send.source }}</span>
						</DmsListRow>
					</div>
				</section>

				<section class="flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<DmsEyebrow :label="key('payload')" />
						<UButton
							v-if="payload"
							size="xs"
							variant="link"
							:label="key('copy_json')"
							@click="copyPayload"
						/>
					</div>
					<pre
						class="bg-elevated/50 border-default text-toned max-h-72 overflow-auto rounded-lg border p-3 font-mono text-[11.5px] leading-relaxed"
						>{{ payload || '{}' }}</pre>
				</section>
			</div>

			<footer
				class="bg-default border-default sticky bottom-0 flex items-center gap-2 border-t px-5 py-3"
			>
				<UButton
					v-for="(action, index) in actions"
					:key="action.id"
					:class="index === 1 ? 'ms-auto' : undefined"
					:icon="action.icon"
					:color="action.variant === 'solid' ? 'primary' : 'neutral'"
					:variant="action.variant"
					:label="action.labelKey ? t(action.labelKey) : undefined"
					:aria-label="
						action.labelKey ? undefined : key(`actions.${action.id}`)
					"
					:loading="action.id === 'send_again' && sending"
					@click="ACTION_HANDLERS[action.id]()"
				/>
			</footer>
		</template>
	</div>
</template>

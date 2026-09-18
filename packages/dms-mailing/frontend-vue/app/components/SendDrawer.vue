<script setup lang="ts">
import { buildTimeline, type TimelineTone } from '../utils/timeline'
import type { Component } from 'vue'
import type { SendDetailResponse, SendRow, SendStatus } from '../types/mailing'

interface SendDrawerProps {
	sendId?: string
	rowData?: SendRow
	onSuccessCallback?: () => void
}

const EDITOR_PATH = '/modules/mailing/editor'
const HTML_PREVIEW_COMPONENT = 'DmsMailingHtmlPreviewModal'
const HTML_MODAL_SIZE = 'xl'
const PAYLOAD_INDENT = 2
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
}

const PROBLEM_STATUSES: SendStatus[] = ['bounced', 'spam', 'failed']

const props = defineProps<SendDrawerProps>()

const api = useMailingApi()
const toast = useToast()
const { t, locale: uiLocale } = useI18n()
const { open: openModal } = useModal()

const sendId = computed(() => props.rowData?._id ?? props.sendId ?? '')

const detail = ref<SendDetailResponse | null>(null)
const loading = ref(false)
const replaying = ref(false)

const send = computed(() => detail.value?.send ?? props.rowData ?? null)

const isProblem = computed(() =>
	send.value ? PROBLEM_STATUSES.includes(send.value.status) : false,
)

const TONE_CLASSES: Record<TimelineTone, string> = {
	neutral: 'bg-elevated text-muted',
	primary: 'bg-primary/10 text-primary',
	success: 'bg-success/10 text-success',
	warning: 'bg-warning/10 text-warning',
	error: 'bg-error/10 text-error',
}

const timeline = computed(() =>
	buildTimeline(detail.value?.events ?? []).map((item) => ({
		...item,
		title: t(`dms_mailing.sends.timeline.${item.type}`),
		time: new Date(item.at).toLocaleTimeString(uiLocale.value, TIME_FORMAT),
	})),
)

// The reference header carries exactly three values, not a banner.
const headerValues = computed(() => {
	const row = send.value
	if (!row) return []
	return [
		{
			label: t('dms_mailing.sends.drawer.status'),
			value: t(`dms_mailing.sends.status.${row.status}`),
			tone: isProblem.value ? 'text-error' : 'text-highlighted',
		},
		{
			label: t('dms_mailing.sends.drawer.latency'),
			value: `${row.latencyMs} ms`,
			tone: 'text-highlighted',
		},
		{
			label: t('dms_mailing.sends.drawer.locale'),
			value: row.locale.toUpperCase(),
			tone: 'text-highlighted',
		},
	]
})

const payload = computed(() => {
	const raw = send.value?.json_variables
	if (!raw) return ''
	try {
		return JSON.stringify(JSON.parse(raw), null, PAYLOAD_INDENT)
	} catch {
		return raw
	}
})

const errorTitle = computed(() =>
	send.value?.status === 'bounced'
		? t('dms_mailing.sends.drawer.invalid_address')
		: t('dms_mailing.sends.drawer.transport_error'),
)

async function load(): Promise<void> {
	if (!sendId.value) return
	loading.value = true
	try {
		detail.value = await api.send(sendId.value)
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	} finally {
		loading.value = false
	}
}

async function replay(): Promise<void> {
	replaying.value = true
	try {
		await api.replay(sendId.value)
		toast.add({
			color: 'success',
			title: t('dms_mailing.sends.drawer.replayed'),
		})
		if (props.onSuccessCallback) {
			props.onSuccessCallback()
			return
		}
		await load()
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	} finally {
		replaying.value = false
	}
}

async function viewHtml(): Promise<void> {
	try {
		const { html } = await api.sendHtml(sendId.value)
		openModal({
			title: t('dms_mailing.sends.drawer.view_html'),
			component: resolveComponent(HTML_PREVIEW_COMPONENT) as Component,
			componentOptions: { html },
			size: HTML_MODAL_SIZE,
		})
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	}
}

function openTemplate(): void {
	if (!send.value) return
	navigateDms({
		path: EDITOR_PATH,
		query: { id: send.value.templateId, locale: send.value.locale },
	})
}

onMounted(load)
</script>

<template>
	<div class="flex flex-col gap-4">
		<USkeleton v-if="loading && !send" class="h-64 w-full" />

		<template v-else-if="send">
			<div class="flex flex-col gap-0.5">
				<span class="text-highlighted truncate text-sm font-semibold">
					{{ send.recipientName || send.recipientEmail }}
				</span>
				<span class="text-dimmed truncate font-mono text-[11px]">
					{{ send.recipientEmail }} · {{ send._id }}
				</span>
			</div>

			<div
				class="border-default divide-default grid grid-cols-3 divide-x rounded-lg border"
			>
				<div
					v-for="value in headerValues"
					:key="value.label"
					class="flex flex-col gap-1 px-3 py-2.5"
				>
					<span
						class="text-dimmed font-mono text-[10px] uppercase tracking-widest"
					>
						{{ value.label }}
					</span>
					<span class="truncate text-[13px] font-semibold" :class="value.tone">
						{{ value.value }}
					</span>
				</div>
			</div>

			<DmsBanner
				v-if="send.error"
				color="error"
				icon="i-ph-warning"
				:title="errorTitle"
				:description="send.error"
			/>

			<section class="flex flex-col gap-2">
				<h3 class="text-dimmed font-mono text-[10px] uppercase tracking-widest">
					{{ t('dms_mailing.sends.drawer.timeline') }}
				</h3>
				<ol class="flex flex-col">
					<li
						v-for="(item, index) in timeline"
						:key="item.id"
						class="relative flex items-start gap-3 pb-3 last:pb-0"
					>
						<span
							v-if="index < timeline.length - 1"
							class="bg-default absolute bottom-0 left-[11px] top-6 w-px"
							aria-hidden="true"
						/>
						<span
							:class="TONE_CLASSES[item.tone]"
							class="relative z-10 grid size-[22px] shrink-0 place-items-center rounded-full"
						>
							<UIcon :name="item.icon" class="size-3" aria-hidden="true" />
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span
								class="truncate text-[12.5px] font-medium"
								:class="item.tone === 'error' ? 'text-error' : 'text-toned'"
							>
								{{ item.title }}
							</span>
							<span
								v-if="item.description"
								class="text-dimmed truncate text-[11px]"
							>
								{{ item.description }}
							</span>
						</span>
						<span class="text-dimmed shrink-0 font-mono text-[11px]">
							{{ item.time }}
						</span>
					</li>
				</ol>
			</section>

			<section class="flex flex-col gap-1">
				<h3 class="text-dimmed font-mono text-[10px] uppercase tracking-widest">
					{{ t('dms_mailing.sends.drawer.template') }}
				</h3>
				<button
					type="button"
					class="hover:bg-elevated/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
					@click="openTemplate"
				>
					<UIcon
						name="i-ph-envelope-simple"
						class="text-dimmed size-3.5 shrink-0"
					/>
					<span class="text-toned min-w-0 flex-1 truncate text-[12.5px]">
						{{ send.templateSlug }}
					</span>
					<UIcon
						name="i-ph-arrow-square-out"
						class="text-dimmed size-3.5 shrink-0"
					/>
				</button>
				<div v-if="send.source" class="flex items-center gap-2 px-2 py-1.5">
					<UIcon name="i-ph-code" class="text-dimmed size-3.5 shrink-0" />
					<span
						class="text-dimmed min-w-0 flex-1 truncate font-mono text-[11.5px]"
					>
						{{ send.source }}
					</span>
				</div>
			</section>

			<section class="flex flex-col gap-2">
				<h3 class="text-dimmed font-mono text-[10px] uppercase tracking-widest">
					{{ t('dms_mailing.sends.drawer.payload') }}
				</h3>
				<div class="bg-elevated/50 relative rounded-lg p-2.5">
					<pre
						class="text-toned overflow-x-auto font-mono text-[11px] leading-relaxed"
						>{{ payload }}</pre>
					<DmsCopyButton :value="payload" class="absolute right-1 top-1" />
				</div>
			</section>

			<div class="flex items-center gap-2">
				<UButton
					class="flex-1 justify-center"
					icon="i-ph-arrow-clockwise"
					:label="t('dms_mailing.sends.drawer.replay')"
					:loading="replaying"
					@click="replay"
				/>
				<UButton
					icon="i-ph-eye"
					color="neutral"
					variant="ghost"
					:title="t('dms_mailing.sends.drawer.view_html')"
					@click="viewHtml"
				/>
			</div>
		</template>
	</div>
</template>

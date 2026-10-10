<script setup lang="ts">
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import { useMailingApi } from '../composables/useMailingApi'
import type { SendResult } from '../composables/useMailingApi'
import { useTemplateDrawer } from '../composables/useTemplateDrawer'
import { apiErrorMessage } from '../utils/api-error'
import { firstName, formatCardDate } from '../utils/gallery'
import { localeChipClass, missingLocales } from '../utils/locales'
import {
	isSendableRecipients,
	localeOptions,
	type NamedLocale,
} from '../utils/recipients'
import { variablesCovered } from '../utils/template-attention'
import { editorRoute } from '../utils/editor-route'
import type {
	TemplateContentResponse,
	TemplateRow,
	TemplateStatus,
} from '../types/mailing'

interface RealSendModalProps {
	rowData?: TemplateRow
	templateId?: string
	onSuccessCallback?: () => void
}

type DataChoice = 'names' | 'test'

type CheckState = 'ok' | 'warn'

interface ReadinessCheck {
	id: string
	label: string
	state: CheckState
}

const DATA_CHOICES: DataChoice[] = ['names', 'test']

const props = defineProps<RealSendModalProps>()
const emit = defineEmits<{ success: [sent?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t, locale: uiLocale } = useI18n()
const { processApiMessage } = useTranslation()
const { uniqueLocales } = useUniqueLocales()
const overlays = useTemplateDrawer()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')
const detail = ref<TemplateContentResponse | null>(null)
const loading = ref(true)
const recipients = ref<string[]>([])
const locale = ref('')
const dataChoice = ref<DataChoice>('names')
const subject = ref('')
const isSubjectLoading = ref(false)
const isAcknowledged = ref(false)
const sending = ref(false)

onMounted(async () => {
	if (!templateId.value) return
	try {
		detail.value = await api.templateContent(templateId.value)
		locale.value = detail.value.fallbackLocale
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		loading.value = false
	}
})

const template = computed(() => detail.value?.template ?? props.rowData ?? null)
const status = computed<TemplateStatus | undefined>(
	() => template.value?.status,
)
const isLive = computed(() => status.value === 'live')
const sentContent = computed(
	() => detail.value?.publishedContent ?? detail.value?.content,
)
const sentLocales = computed(() =>
	Object.keys(sentContent.value?.locales ?? {}),
)
const workspaceCodes = computed(() =>
	uniqueLocales.value.map((entry) => entry.code),
)
const absentLocales = computed(() =>
	missingLocales(sentLocales.value, workspaceCodes.value),
)

async function loadSubject(): Promise<void> {
	if (!isLive.value || !locale.value) return
	isSubjectLoading.value = true
	try {
		const preview = await api.preview(templateId.value, {
			locale: locale.value,
			version: 'published',
		})
		subject.value = preview.subject
	} catch {
		subject.value = ''
	} finally {
		isSubjectLoading.value = false
	}
}

watch([locale, isLive], () => void loadSubject())
watch(
	() => recipients.value.length,
	() => (isAcknowledged.value = false),
)

const localeItems = computed(() =>
	localeOptions(sentLocales.value, uniqueLocales.value as NamedLocale[]),
)

const dataItems = computed(() =>
	DATA_CHOICES.map((choice) => ({
		label: t(`dms_mailing.real_send.data_${choice}`),
		value: choice,
	})),
)

const DATA_SETS: Record<DataChoice, () => Record<string, unknown> | undefined> =
	{
		names: () => undefined,
		test: () => detail.value?.testData ?? {},
	}

const dataPaths = computed(() =>
	(detail.value?.variables ?? []).map((entry) => entry.path).join(', '),
)

const sender = computed(() => {
	const from = detail.value?.sender
	return from ? `${from.name} <${from.email}>` : ''
})

const publishedOn = computed(() =>
	formatCardDate(template.value?.publishedAt, new Date(), uiLocale.value),
)

const canSend = computed(
	() =>
		isLive.value &&
		isAcknowledged.value &&
		isSendableRecipients(recipients.value) &&
		!sending.value,
)

const refusal = computed(() =>
	t(`dms_mailing.real_send.refused_${status.value ?? 'draft'}`),
)

const checks = computed<ReadinessCheck[]>(() => {
	const row = template.value
	const response = detail.value
	if (!row || !response) return []
	const covered = variablesCovered(
		response.variables,
		response.detectedVariables,
		response.testData,
	)
	return [
		{
			id: 'status',
			state: 'warn',
			label: t('dms_mailing.real_send.check_status', {
				status: t(`dms_mailing.templates.status.${row.status}`),
				date: formatCardDate(row.updatedAt, new Date(), uiLocale.value),
				name: firstName(row.updatedBy) || row.updatedBy,
			}),
		},
		{
			id: 'variables',
			state: covered ? 'ok' : 'warn',
			label: t(
				`dms_mailing.real_send.check_variables_${covered ? 'ok' : 'warn'}`,
			),
		},
		{
			id: 'locales',
			state: absentLocales.value.length ? 'warn' : 'ok',
			label: absentLocales.value.length
				? t('dms_mailing.real_send.check_locales_warn', {
						missing: absentLocales.value
							.map((code) => code.toUpperCase())
							.join(', '),
						fallback: response.fallbackLocale.toUpperCase(),
					})
				: t('dms_mailing.real_send.check_locales_ok'),
		},
	]
})

function close(sent: boolean): void {
	if (sent && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', sent)
}

function sendTestInstead(): void {
	close(false)
	overlays.openTestSend(templateId.value)
}

function reviewAndPublish(): void {
	close(false)
	void navigateDms(editorRoute(templateId.value))
}

function report(results: SendResult[], to: string[]): void {
	results
		.filter((result) => result.error)
		.forEach((result) =>
			toast.add({
				color: 'error',
				title: to[results.indexOf(result)] ?? result.sendId,
				description: processApiMessage(result.error),
			}),
		)
	const sent = results.filter((result) => !result.error).length
	if (!sent) return
	toast.add({
		color: 'success',
		icon: 'i-ph-paper-plane-right',
		title: t('dms_mailing.real_send.sent', { count: sent }, sent),
	})
}

async function submit(): Promise<void> {
	if (!canSend.value) return
	sending.value = true
	const to = [...recipients.value]
	try {
		const response = await api.realSend(templateId.value, {
			to,
			locale: locale.value || undefined,
			data: DATA_SETS[dataChoice.value](),
		})
		report(response.results, to)
		close(true)
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		sending.value = false
	}
}
</script>

<template>
	<div v-if="loading && !template" class="flex flex-col gap-3">
		<USkeleton class="h-16 w-full" />
		<USkeleton class="h-24 w-full" />
	</div>

	<form
		v-else-if="isLive"
		class="flex flex-col gap-4"
		novalidate
		@submit.prevent="submit"
	>
		<DmsBanner
			tone="error"
			icon="i-ph-paper-plane-right"
			:title="
				t('dms_mailing.real_send.heading', { name: template?.name ?? '' })
			"
			:description="t('dms_mailing.real_send.warning')"
		/>

		<FormRows has-required>
			<MailingRecipientsField
				v-model="recipients"
				:hint="t('dms_mailing.real_send.recipients_hint')"
			/>

			<FormFieldRow :label="t('dms_mailing.test_send.locale')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="locale"
						:items="localeItems"
						value-key="value"
						:deselectable="false"
						class="w-full"
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow :label="t('dms_mailing.test_send.data')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="dataChoice"
						:items="dataItems"
						value-key="value"
						:deselectable="false"
						icon="i-ph-database"
						class="w-full"
					/>
				</template>
			</FormFieldRow>
		</FormRows>

		<div class="border-default rounded-lg border px-3">
			<DmsKeyValueList
				dense
				:items="[
					{ id: 'from', label: t('dms_mailing.real_send.from'), value: sender },
					{
						id: 'subject',
						label: t('dms_mailing.real_send.subject'),
						value: subject,
						loading: isSubjectLoading,
					},
					{ id: 'version', label: t('dms_mailing.real_send.version') },
					{ id: 'data', label: t('dms_mailing.test_send.data') },
				]"
			>
				<template #value="{ item, formatted }">
					<span
						v-if="item.id === 'version'"
						class="flex flex-wrap items-center gap-1.5"
					>
						<span class="font-mono">v{{ detail?.version ?? 0 }}</span>
						<span v-if="publishedOn">
							·
							{{
								t('dms_mailing.real_send.published_on', { date: publishedOn })
							}}
						</span>
						<span
							v-for="code in sentLocales"
							:key="code"
							:class="localeChipClass(true)"
						>
							{{ code }}
						</span>
					</span>
					<span v-else-if="item.id === 'data'">
						{{ t(`dms_mailing.real_send.data_${dataChoice}`) }}
						<span
							v-if="dataChoice === 'test' && dataPaths"
							class="text-muted font-mono"
						>
							· {{ dataPaths }}
						</span>
					</span>
					<span v-else>{{ formatted }}</span>
				</template>
			</DmsKeyValueList>
		</div>

		<UCheckbox
			v-model="isAcknowledged"
			:disabled="!recipients.length"
			:label="
				t(
					'dms_mailing.real_send.acknowledge',
					{ count: recipients.length },
					recipients.length,
				)
			"
		/>

		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				color="error"
				icon="i-ph-paper-plane-right"
				:label="
					t(
						'dms_mailing.real_send.submit',
						{ count: recipients.length },
						recipients.length,
					)
				"
				:loading="sending"
				:disabled="!canSend"
			/>
		</div>
	</form>

	<div v-else class="flex flex-col gap-4">
		<DmsBanner
			tone="warning"
			icon="i-ph-paper-plane-right"
			:title="
				t('dms_mailing.real_send.refused_title', { name: template?.name ?? '' })
			"
			:description="refusal"
		/>
		<DmsCheckList :items="checks" />
		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				icon="i-ph-flask"
				:label="t('dms_mailing.real_send.test_instead')"
				@click="sendTestInstead"
			/>
			<UButton
				icon="i-ph-rocket-launch"
				:label="t('dms_mailing.real_send.review_publish')"
				@click="reviewAndPublish"
			/>
		</div>
	</div>
</template>

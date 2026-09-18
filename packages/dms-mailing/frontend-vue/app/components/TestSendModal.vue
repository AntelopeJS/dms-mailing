<script setup lang="ts">
import type { SendResult } from '../composables/useMailingApi'
import type {
	TemplateContent,
	TemplateRow,
	TemplateStatus,
} from '../types/mailing'

interface TestSendModalProps {
	templateId?: string
	rowData?: TemplateRow
	locale?: string
	content?: TemplateContent
	data?: Record<string, unknown>
	/** `real` reaches actual recipients and counts in the business figures. */
	mode?: SendMode
	onSuccessCallback?: () => void
}

type SendMode = 'test' | 'real'

const REAL_MODE: SendMode = 'real'
const LIVE_STATUS: TemplateStatus = 'live'

const MAX_RECIPIENTS = 5
const RECIPIENT_SEPARATOR = ','

const props = defineProps<TestSendModalProps>()

const emit = defineEmits<{ success: [] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { user } = useCurrentUser()
const { uniqueLocales } = useUniqueLocales()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')

const localeItems = computed(() =>
	uniqueLocales.value.map((entry) => ({
		label: entry.name ?? entry.code,
		value: entry.code,
	})),
)

const isReal = computed(() => props.mode === REAL_MODE)
const isDraft = computed(
	() => Boolean(props.rowData) && props.rowData?.status !== LIVE_STATUS,
)
const confirmed = ref(false)

const recipients = ref<string>(isReal.value ? '' : (user.value?.email ?? ''))
const locale = ref<string>(props.locale ?? localeItems.value[0]?.value ?? '')
const sending = ref(false)

const addresses = computed(() =>
	recipients.value
		.split(RECIPIENT_SEPARATOR)
		.map((address) => address.trim())
		.filter(Boolean)
		.slice(0, MAX_RECIPIENTS),
)

const canSend = computed(
	() =>
		addresses.value.length > 0 &&
		!sending.value &&
		!isDraft.value &&
		(!isReal.value || confirmed.value),
)

function report(result: SendResult, index: number): void {
	toast.add({
		color: result.error ? 'error' : 'success',
		title: addresses.value[index] ?? result.sendId,
		description: result.error ?? t(`dms_mailing.sends.status.${result.status}`),
	})
}

async function submit(): Promise<void> {
	if (!canSend.value || !templateId.value) return
	sending.value = true
	try {
		const response = isReal.value
			? await api.realSend(templateId.value, {
					to: addresses.value,
					locale: locale.value,
					data: props.data,
				})
			: await api.testSend(templateId.value, {
					to: addresses.value,
					locale: locale.value,
					content: props.content,
					data: props.data,
				})
		response.results.forEach(report)
		props.onSuccessCallback?.()
		emit('success')
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	} finally {
		sending.value = false
	}
}
</script>

<template>
	<UForm
		:state="{ recipients, locale }"
		class="flex flex-col gap-4"
		@submit="submit"
	>
		<DmsBanner
			v-if="isDraft"
			color="warning"
			icon="i-ph-warning"
			:title="t('dms_mailing.errors.template_not_live')"
			:description="t('dms_mailing.templates.send_modal.draft_hint')"
		/>

		<DmsBanner
			v-else-if="isReal"
			color="error"
			icon="i-ph-paper-plane-tilt"
			:title="t('dms_mailing.templates.send_modal.real_title')"
			:description="t('dms_mailing.templates.send_modal.real_hint')"
		/>

		<UFormField
			:label="t('dms_mailing.editor.test_send_modal.recipients')"
			name="recipients"
		>
			<UInput v-model="recipients" class="w-full" autofocus />
		</UFormField>

		<UFormField :label="t('dms_mailing.sends.cols.locale')" name="locale">
			<USelect v-model="locale" :items="localeItems" class="w-full" />
		</UFormField>

		<UCheckbox
			v-if="isReal && !isDraft"
			v-model="confirmed"
			:label="t('dms_mailing.templates.send_modal.confirm')"
		/>

		<div class="flex justify-end">
			<UButton
				type="submit"
				:color="isReal ? 'error' : 'primary'"
				:label="
					isReal
						? t('dms_mailing.templates.send_modal.send')
						: t('dms_mailing.editor.test_send_modal.send')
				"
				icon="i-ph-paper-plane-tilt"
				:loading="sending"
				:disabled="!canSend"
			/>
		</div>
	</UForm>
</template>

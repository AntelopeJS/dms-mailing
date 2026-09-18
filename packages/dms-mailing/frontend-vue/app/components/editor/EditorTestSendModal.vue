<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { parseTestData } from '../../utils/testData'

const RECIPIENT_SEPARATOR = /[\s,;]+/

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { editor, api, templateId, testData } = useEditorContext()

const recipients = ref('')
const sending = ref(false)

const addresses = computed(() =>
	recipients.value.split(RECIPIENT_SEPARATOR).filter(Boolean),
)

async function send(): Promise<void> {
	sending.value = true
	try {
		await api.testSend(templateId, {
			to: addresses.value,
			locale: editor.locale,
			content: editor.content,
			data: parseTestData(testData.value) ?? undefined,
		})
		toast.add({
			title: t('dms_mailing.editor.test_send_modal.sent'),
			color: 'success',
		})
		open.value = false
	} finally {
		sending.value = false
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="t('dms_mailing.editor.test_send_modal.title')"
	>
		<template #body>
			<UFormField :label="t('dms_mailing.editor.test_send_modal.recipients')">
				<UInput
					v-model="recipients"
					class="w-full"
					placeholder="a@example.com, b@example.com"
				/>
			</UFormField>
		</template>
		<template #footer>
			<UButton
				icon="i-ph-paper-plane-tilt"
				:loading="sending"
				:disabled="addresses.length === 0"
				@click="send()"
			>
				{{ t('dms_mailing.editor.test_send_modal.send') }}
			</UButton>
		</template>
	</UModal>
</template>

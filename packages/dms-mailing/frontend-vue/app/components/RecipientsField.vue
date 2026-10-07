<script setup lang="ts">
import { MAX_RECIPIENTS } from '../utils/recipients'

interface RecipientsFieldProps {
	/** Line under the chips, before the counter. */
	hint: string
	id?: string
}

withDefaults(defineProps<RecipientsFieldProps>(), { id: 'recipients' })

const recipients = defineModel<string[]>({ required: true })

const { t } = useI18n()
</script>

<template>
	<UFormField :label="t('dms_mailing.test_send.recipients')" :name="id">
		<DmsInputTags
			:id="id"
			v-model="recipients"
			item-type="email"
			:max="MAX_RECIPIENTS"
			:placeholder="t('dms_mailing.test_send.add_address')"
		/>
		<div
			class="text-dimmed mt-1.5 flex items-center justify-between font-mono text-[11px]"
		>
			<span>{{ hint }}</span>
			<span
				:class="recipients.length >= MAX_RECIPIENTS ? 'text-warning' : ''"
				aria-live="polite"
			>
				{{ recipients.length }} / {{ MAX_RECIPIENTS }}
			</span>
		</div>
	</UFormField>
</template>

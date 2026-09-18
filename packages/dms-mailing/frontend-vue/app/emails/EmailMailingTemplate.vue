<script setup lang="ts">
import EmailLayout from '#dms-layout/app/emails/components/EmailLayout.vue'
import MailingBlocks from './components/MailingBlocks.vue'
import type { ResolvedEmail } from '../types/mailing'

interface Props {
	locale: string
	email: ResolvedEmail
}

defineProps<Props>()
</script>

<template>
	<EmailLayout :title="email.subject" :lang="locale">
		<EPreview v-if="email.preheader">{{ email.preheader }}</EPreview>

		<MailingBlocks :blocks="email.blocks" />

		<template #footer>
			<MailingBlocks :blocks="email.blocks" footer-only />
		</template>
	</EmailLayout>
</template>

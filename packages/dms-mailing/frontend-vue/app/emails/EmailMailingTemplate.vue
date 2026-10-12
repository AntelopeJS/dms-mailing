<script setup lang="ts">
import { emailStyles } from '#dms-layout/app/emails/components/index'
import MailingBlocks from './components/MailingBlocks.vue'
import type { ResolvedEmail } from '../types/mailing'
import { brandingLogoUrl } from '../utils/email-logo'
import type { EmailBrandingConfig } from '../utils/email-logo'

interface Props {
	locale: string
	email: ResolvedEmail
}

const VIEWPORT = 'width=device-width, initial-scale=1'

defineProps<Props>()

const logoUrl = brandingLogoUrl(
	useDmsAppConfig() as EmailBrandingConfig,
	useDmsRuntimeConfig().public.dms?.clientBaseUrl ?? '',
)
</script>

<template>
	<EHtml :lang="locale">
		<EHead>
			<meta name="viewport" :content="VIEWPORT" />
			<title>{{ email.subject }}</title>
		</EHead>
		<EBody :style="emailStyles.main">
			<EPreview v-if="email.preheader">{{ email.preheader }}</EPreview>
			<EContainer :style="emailStyles.container">
				<ESection :style="emailStyles.card">
					<ESection v-if="logoUrl" :style="emailStyles.logo">
						<EImg :src="logoUrl" alt="" :style="emailStyles.logoImage" />
					</ESection>
					<MailingBlocks :blocks="email.blocks" />
					<MailingBlocks :blocks="email.blocks" footer-only />
				</ESection>
			</EContainer>
		</EBody>
	</EHtml>
</template>

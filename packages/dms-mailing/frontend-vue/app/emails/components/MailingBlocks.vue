<script setup lang="ts">
import { computed } from 'vue'
import EmailButton from '#dms-layout/app/emails/components/EmailButton.vue'
import EmailOTP from '#dms-layout/app/emails/components/EmailOTP.vue'
import { emailStyles } from '#dms-layout/app/emails/components/index'
import type {
	ResolvedBlock,
	ResolvedHeading,
	ResolvedParagraph,
} from '../../types/mailing'

const FOOTER_TYPE = 'footer'

const heroStyle = { width: '100%', borderRadius: '8px', marginBottom: '20px' }
const totalStyle = { ...emailStyles.text, fontWeight: '600' }
const rowLabelStyle = { ...emailStyles.text, margin: '0' }
const rowValueStyle = {
	...emailStyles.text,
	margin: '0',
	textAlign: 'right' as const,
}

interface Props {
	blocks: ResolvedBlock[]
	footerOnly?: boolean
}

const props = defineProps<Props>()

const visibleBlocks = computed(() =>
	props.blocks.filter((block) =>
		props.footerOnly ? block.type === FOOTER_TYPE : block.type !== FOOTER_TYPE,
	),
)

const headingStyle = (block: ResolvedHeading) => ({
	...emailStyles.heading,
	textAlign: block.align,
	fontSize: `${block.size}px`,
})

const paragraphStyle = (block: ResolvedParagraph) => ({
	...emailStyles.text,
	textAlign: block.align,
})
</script>

<template>
	<template v-for="block in visibleBlocks" :key="block.id">
		<EImg
			v-if="block.type === 'hero'"
			:src="block.imageUrl"
			:alt="block.alt"
			:style="heroStyle"
		/>

		<EHeading
			v-else-if="block.type === 'heading'"
			as="h1"
			:style="headingStyle(block)"
		>
			{{ block.text }}
		</EHeading>

		<EText
			v-else-if="block.type === 'paragraph'"
			:style="paragraphStyle(block)"
		>
			{{ block.text }}
		</EText>

		<EmailOTP v-else-if="block.type === 'code'" :code="block.text" />

		<ESection v-else-if="block.type === 'list'">
			<ERow v-for="(row, index) in block.rows" :key="index">
				<EColumn>
					<EText :style="rowLabelStyle">{{ row.label }}</EText>
				</EColumn>
				<EColumn align="right">
					<EText :style="rowValueStyle">{{ row.value }}</EText>
				</EColumn>
			</ERow>
		</ESection>

		<ESection v-else-if="block.type === 'total'">
			<ERow>
				<EColumn>
					<EText :style="totalStyle">{{ block.label }}</EText>
				</EColumn>
				<EColumn align="right">
					<EText :style="totalStyle">{{ block.value }}</EText>
				</EColumn>
			</ERow>
		</ESection>

		<ESection
			v-else-if="block.type === 'button'"
			:style="{ textAlign: block.align }"
		>
			<EmailButton :href="block.href">{{ block.text }}</EmailButton>
		</ESection>

		<EHr v-else-if="block.type === 'divider'" :style="emailStyles.divider" />

		<EText v-else-if="block.type === 'footer'" :style="emailStyles.footer">
			{{ block.text }}
			<br />
			<ELink v-if="block.unsubscribeUrl" :href="block.unsubscribeUrl">
				{{ block.unsubscribeLabel }}
			</ELink>
			·
			<ELink v-if="block.preferencesUrl" :href="block.preferencesUrl">
				{{ block.preferencesLabel }}
			</ELink>
		</EText>
	</template>
</template>

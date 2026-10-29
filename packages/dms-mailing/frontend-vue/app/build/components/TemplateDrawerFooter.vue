<script setup lang="ts">
import type { TemplateOverlays } from '../../composables/useTemplateDrawer'
import type { TemplateRow } from '../../types/mailing'

/**
 * The footer of a template's drawer, its test, duplicate and edit actions:
 * the drawer's own bindings, under the names it gives them.
 */
interface TemplateDrawerFooterProps {
	templateId: string
	locale: string
	template: TemplateRow
	overlays: TemplateOverlays
	openEditor: (targetLocale?: string) => void
}

defineProps<TemplateDrawerFooterProps>()

const { t } = useI18n()
</script>

<template>
	<DmsContainerFooter data-template-footer>
		<UButton
			icon="i-ph-flask"
			color="neutral"
			variant="ghost"
			:label="t('dms_mailing.templates.card.test')"
			@click="overlays.openTestSend(templateId, { locale })"
		/>
		<UButton
			class="ml-auto"
			icon="i-ph-copy"
			color="neutral"
			variant="outline"
			:label="t('dms_mailing.templates.actions.duplicate')"
			@click="overlays.openDuplicate(templateId, { rowData: template })"
		/>
		<UButton
			icon="i-ph-pencil-simple"
			:label="t('dms_mailing.templates.actions.open_editor')"
			@click="openEditor(locale)"
		/>
	</DmsContainerFooter>
</template>

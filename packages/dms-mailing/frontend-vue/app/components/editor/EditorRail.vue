<script setup lang="ts">
import { computed } from 'vue'
import type { RailTab } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'

const TABS: RailTab[] = ['blocks', 'settings', 'template', 'data']

const { t } = useI18n()
const { editor } = useEditorContext()

const items = computed(() =>
	TABS.map((value) => ({
		value,
		label: t(`dms_mailing.editor.tabs.${value}`),
	})),
)

const tab = computed({
	get: () => editor.tab,
	set: (value: string | number) => (editor.tab = value as RailTab),
})
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="border-default flex items-center gap-2 border-b p-2">
			<UTabs
				v-model="tab"
				:items="items"
				:content="false"
				size="xs"
				class="min-w-0 flex-1"
			/>
			<UButton
				icon="i-ph-x"
				size="xs"
				variant="ghost"
				color="neutral"
				:aria-label="t('dms_mailing.editor.toggle_rail')"
				@click="editor.railOpen = false"
			/>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			<DmsMailingEditorPalette v-if="editor.tab === 'blocks'" />
			<DmsMailingEditorDataPanel v-else-if="editor.tab === 'data'" />
			<DmsMailingEditorTemplateSettings v-else-if="editor.tab === 'template'" />
			<DmsMailingEditorSubjectSettings v-else-if="editor.subjectSelected" />
			<DmsMailingEditorBlockSettings
				v-else-if="editor.selected"
				:block="editor.selected"
			/>
			<p v-else class="text-muted px-1 py-6 text-center text-xs">
				{{ t('dms_mailing.editor.settings_hint') }}
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PreviewResponse } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { parseTestData } from '../../utils/testData'

const DESKTOP_WIDTH = 600
const MOBILE_WIDTH = 380
const MOBILE_DEVICE = 'mobile'

const { t } = useI18n()
const { editor, templateId, testData, preview } = useEditorContext()

const width = computed(() =>
	editor.device === MOBILE_DEVICE ? MOBILE_WIDTH : DESKTOP_WIDTH,
)
const previewData = computed(() => parseTestData(testData.value) ?? undefined)

function onResolved(response: PreviewResponse): void {
	preview.value = response
}
</script>

<template>
	<div
		class="bg-elevated/60 min-w-0 flex-1 overflow-y-auto p-6"
		@click="editor.select(null)"
	>
		<div
			class="mx-auto transition-all duration-200"
			:style="{ width: `${width}px` }"
		>
			<div
				class="border-default bg-default mb-3 overflow-hidden rounded-lg border text-sm"
			>
				<button
					type="button"
					class="border-default flex w-full items-center gap-2 border-b px-3 py-2 text-left transition"
					:class="{ 'ring-primary ring-2 ring-inset': editor.subjectSelected }"
					@click.stop="editor.selectSubject()"
				>
					<span class="text-muted w-20 shrink-0 text-xs">
						{{ t('dms_mailing.editor.subject') }}
					</span>
					<DmsMailingTokenText
						:text="editor.current?.subject"
						class="truncate font-medium"
					/>
				</button>
				<div class="flex items-center gap-2 px-3 py-2">
					<span class="text-muted w-20 shrink-0 text-xs">
						{{ t('dms_mailing.editor.preheader') }}
					</span>
					<DmsMailingTokenText
						:text="editor.current?.preheader"
						class="text-muted truncate"
					/>
				</div>
			</div>

			<DmsMailingTemplatePreviewFrame
				v-if="editor.previewMode"
				class="border-default rounded-lg border shadow"
				:template-id="templateId"
				:locale="editor.locale"
				:content="editor.content"
				:data="previewData"
				:width="width"
				@resolved="onResolved"
			/>

			<div
				v-else
				class="rounded-lg bg-white p-6 shadow"
				@click.stop="editor.select(null)"
			>
				<DmsMailingEditorBlockList
					v-if="editor.current"
					:list="editor.current.blocks"
				/>
				<button
					type="button"
					class="hover:border-primary hover:text-primary mt-3 w-full rounded-md border border-dashed border-gray-300 py-2 text-xs text-gray-400 transition"
					@click.stop="editor.tab = 'blocks'"
				>
					+ {{ t('dms_mailing.editor.add_block') }}
				</button>
			</div>
		</div>
	</div>
</template>

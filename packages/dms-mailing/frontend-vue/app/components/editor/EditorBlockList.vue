<script setup lang="ts">
import draggable from 'vuedraggable'
import type { Block } from '../../types/mailing'
import type { InsertTarget } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'
import { DRAG_GROUP, DRAG_HANDLE } from '../../utils/blocks'
import EditorBlock from './EditorBlock.vue'

interface Props {
	list: Block[]
	target?: InsertTarget
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor } = useEditorContext()
</script>

<template>
	<div>
		<draggable
			:list="props.list"
			:group="DRAG_GROUP"
			:handle="DRAG_HANDLE"
			item-key="id"
			ghost-class="opacity-30"
			@change="editor.touch()"
		>
			<template #item="{ element, index }">
				<EditorBlock :block="element" :index="index" :list="props.list" />
			</template>
		</draggable>

		<button
			v-if="props.list.length === 0"
			type="button"
			class="hover:border-primary hover:text-primary w-full rounded-md border border-dashed border-gray-300 py-3 text-xs text-gray-400 transition"
			@click.stop="editor.addBlock('paragraph', props.target)"
		>
			+ {{ t('dms_mailing.editor.condition.add_here') }}
		</button>
	</div>
</template>

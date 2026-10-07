<script setup lang="ts">
import draggable from 'vuedraggable'
import type { Block } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { DRAG_GROUP, DRAG_HANDLE } from '../../utils/blocks'
import EditorBlock from './EditorBlock.vue'
import EditorInsertPoint from './EditorInsertPoint.vue'

interface Props {
	list: Block[]
}

const props = defineProps<Props>()

const { editor } = useEditorContext()
</script>

<template>
	<draggable
		:list="props.list"
		:group="DRAG_GROUP"
		:handle="DRAG_HANDLE"
		item-key="id"
		ghost-class="opacity-30"
		class="flex flex-col"
		@change="editor.touch()"
	>
		<template #item="{ element, index }">
			<div>
				<EditorInsertPoint :list="props.list" :index="index" />
				<EditorBlock :block="element" :index="index" :list="props.list" />
			</div>
		</template>
		<template #footer>
			<EditorInsertPoint
				:list="props.list"
				:index="props.list.length"
				:is-empty="props.list.length === 0"
			/>
		</template>
	</draggable>
</template>

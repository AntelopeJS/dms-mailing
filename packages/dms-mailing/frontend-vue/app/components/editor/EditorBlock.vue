<script setup lang="ts">
import { computed, resolveComponent } from 'vue'
import type { Block } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	BLOCK_COMPONENT_NAMES,
	duplicateBlock,
	moveBlock,
	removeBlock,
} from '../../utils/blocks'

interface Props {
	block: Block
	index: number
	list: Block[]
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor } = useEditorContext()

const selected = computed(() => editor.selected?.id === props.block.id)
const renderer = computed(() =>
	resolveComponent(BLOCK_COMPONENT_NAMES[props.block.type]),
)
const isLast = computed(() => props.index === props.list.length - 1)

function move(direction: -1 | 1): void {
	if (moveBlock(props.list, props.block.id, direction)) editor.touch()
}

function duplicate(): void {
	if (duplicateBlock(props.list, props.block.id)) editor.touch()
}

function remove(): void {
	if (selected.value) editor.select(null)
	if (removeBlock(props.list, props.block.id)) editor.touch()
}
</script>

<template>
	<div
		class="group relative rounded-md px-1 py-0.5 transition"
		:class="
			selected ? 'ring-primary ring-2' : 'hover:ring-primary/40 hover:ring-1'
		"
		@click.stop="editor.select(props.block.id)"
	>
		<div
			class="pointer-events-none absolute -top-2.5 left-2 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
			:class="{ 'opacity-100': selected }"
		>
			<span
				class="bg-primary text-inverted rounded px-1.5 py-0.5 text-[10px] font-medium"
			>
				{{ t(`dms_mailing.blocks.${props.block.type}`) }}
			</span>
			<UBadge
				v-if="props.block.visibleIf"
				size="sm"
				color="warning"
				variant="subtle"
				class="font-mono"
			>
				if {{ props.block.visibleIf.path }}
			</UBadge>
		</div>

		<div
			class="border-default bg-default absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 rounded-md border p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100"
			:class="{ 'opacity-100': selected }"
		>
			<UButton
				class="mailing-drag-handle cursor-grab"
				icon="i-ph-dots-six-vertical"
				size="xs"
				variant="ghost"
				color="neutral"
				:aria-label="t('dms_mailing.editor.actions.drag')"
			/>
			<UButton
				icon="i-ph-arrow-up"
				size="xs"
				variant="ghost"
				color="neutral"
				:disabled="props.index === 0"
				:aria-label="t('dms_mailing.editor.actions.move_up')"
				@click.stop="move(-1)"
			/>
			<UButton
				icon="i-ph-arrow-down"
				size="xs"
				variant="ghost"
				color="neutral"
				:disabled="isLast"
				:aria-label="t('dms_mailing.editor.actions.move_down')"
				@click.stop="move(1)"
			/>
			<UButton
				icon="i-ph-copy"
				size="xs"
				variant="ghost"
				color="neutral"
				:aria-label="t('dms_mailing.editor.actions.duplicate')"
				@click.stop="duplicate()"
			/>
			<UButton
				icon="i-ph-trash"
				size="xs"
				variant="ghost"
				color="error"
				:aria-label="t('dms_mailing.editor.actions.delete')"
				@click.stop="remove()"
			/>
		</div>

		<component :is="renderer" :block="props.block" />
	</div>
</template>

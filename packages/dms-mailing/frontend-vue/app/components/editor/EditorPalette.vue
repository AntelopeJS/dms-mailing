<script setup lang="ts">
import draggable from 'vuedraggable'
import type { BlockType } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	BLOCK_PALETTE,
	LOGIC_PALETTE,
	PALETTE_GROUP,
	cloneFromPalette,
} from '../../utils/blocks'

const { t } = useI18n()
const { editor } = useEditorContext()

const groups = [
	{ id: 'content', entries: BLOCK_PALETTE },
	{ id: 'logic', entries: LOGIC_PALETTE },
]

function add(type: BlockType): void {
	if (!editor.current) return
	editor.addBlock(type)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<section v-for="group in groups" :key="group.id">
			<p
				class="text-muted mb-2 text-[11px] font-semibold uppercase tracking-wide"
			>
				{{ t(`dms_mailing.editor.groups.${group.id}`) }}
			</p>
			<draggable
				:list="group.entries"
				:group="PALETTE_GROUP"
				:clone="cloneFromPalette"
				:sort="false"
				item-key="type"
				class="grid grid-cols-2 gap-2"
			>
				<template #item="{ element }">
					<button
						type="button"
						class="border-default bg-default hover:border-primary hover:text-primary flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
						:disabled="!editor.current"
						@click="add(element.type)"
					>
						<UIcon :name="element.icon" class="size-4 shrink-0" />
						<span class="truncate">
							{{ t(`dms_mailing.blocks.${element.type}`) }}
						</span>
					</button>
				</template>
			</draggable>
		</section>

		<p class="text-muted text-[11px]">
			{{ t('dms_mailing.editor.palette.hint') }}
		</p>
	</div>
</template>

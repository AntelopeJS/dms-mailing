<script setup lang="ts">
import draggable from 'vuedraggable'
import {
	PALETTE_GROUP,
	cloneFromPalette,
	paletteLabelKey,
} from '../../utils/blocks'
import type { PaletteEntry } from '../../utils/blocks'

interface Props {
	title: string
	entries: PaletteEntry[]
	disabled?: boolean
}

defineProps<Props>()
const emit = defineEmits<{ add: [PaletteEntry] }>()

const { t } = useI18n()
</script>

<template>
	<section>
		<DmsEyebrow :label="title" class="mb-2 block" />
		<draggable
			:list="entries"
			:group="PALETTE_GROUP"
			:clone="cloneFromPalette"
			:sort="false"
			:disabled="disabled"
			item-key="type"
			class="grid grid-cols-2 gap-1.5"
		>
			<template #item="{ element }">
				<button
					type="button"
					class="border-default bg-default text-toned hover:border-primary/60 hover:text-highlighted group flex h-9 cursor-grab items-center gap-2 rounded-md border px-2.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
					:class="{ 'col-span-2': element.isWide }"
					:disabled="disabled"
					@click="emit('add', element)"
				>
					<UIcon
						:name="element.icon"
						class="size-4 shrink-0"
						:class="
							element.type === 'if'
								? 'text-warning'
								: 'text-dimmed group-hover:text-primary'
						"
					/>
					<span class="truncate">{{ t(paletteLabelKey(element.type)) }}</span>
				</button>
			</template>
		</draggable>
	</section>
</template>

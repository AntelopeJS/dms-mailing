<script setup lang="ts">
import { computed } from 'vue'
import type { HeroBlock } from '../../types/mailing'

const TOKEN_OPEN = '{{'

interface Props {
	block: HeroBlock
}

const props = defineProps<Props>()

const hasImage = computed(
	() =>
		Boolean(props.block.imageUrl) && !props.block.imageUrl.includes(TOKEN_OPEN),
)
</script>

<template>
	<img
		v-if="hasImage"
		:src="block.imageUrl"
		:alt="block.alt"
		class="mb-4 w-full rounded-lg object-cover"
	/>
	<div
		v-else
		class="mb-4 flex h-32 items-center justify-center rounded-lg bg-[repeating-linear-gradient(45deg,#eef0f3_0_7px,#f7f8fa_7px_14px)] text-xs text-gray-400"
	>
		<DmsMailingTokenText :text="block.imageUrl || block.alt" />
	</div>
</template>

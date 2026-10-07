<script setup lang="ts">
import { computed, inject } from 'vue'
import type { HeroBlock } from '../../types/mailing'
import { TOKEN_DATA_KEY, interpolateText } from '../../utils/tokens'

const TOKEN_OPEN = '{{'

interface Props {
	block: HeroBlock
}

const props = defineProps<Props>()
const data = inject(TOKEN_DATA_KEY, null)

const imageUrl = computed(() =>
	data?.value
		? interpolateText(props.block.imageUrl, data.value)
		: props.block.imageUrl,
)
const hasImage = computed(
	() => Boolean(imageUrl.value) && !imageUrl.value.includes(TOKEN_OPEN),
)
</script>

<template>
	<img
		v-if="hasImage"
		:src="imageUrl"
		:alt="block.alt"
		class="mb-4 w-full rounded-lg object-cover"
	/>
	<div
		v-else
		class="mb-4 flex h-32 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400"
	>
		<MailingTokenText :text="block.imageUrl || block.alt" />
	</div>
</template>

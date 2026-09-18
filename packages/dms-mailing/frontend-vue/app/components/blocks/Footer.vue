<script setup lang="ts">
import type { FooterBlock } from '../../types/mailing'

interface Props {
	block: FooterBlock
}

defineProps<Props>()
</script>

<template>
	<div
		class="mt-6 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400"
	>
		<DmsMailingTokenText :text="block.text" />
		<p class="mt-1">
			<span class="underline">{{ block.unsubscribeLabel }}</span>
			·
			<span class="underline">{{ block.preferencesLabel }}</span>
		</p>
	</div>
</template>

<script setup lang="ts">
import type { TotalBlock } from '../../types/mailing'

interface Props {
	block: TotalBlock
}

defineProps<Props>()
</script>

<template>
	<div
		class="mb-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm font-semibold text-gray-900"
	>
		<span>{{ block.label }}</span>
		<DmsMailingTokenText :text="block.value" />
	</div>
</template>

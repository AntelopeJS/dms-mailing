<script setup lang="ts">
import type { ListBlock } from '../../types/mailing'

interface Props {
	block: ListBlock
}

defineProps<Props>()
</script>

<template>
	<div class="mb-4">
		<table class="w-full border-collapse text-sm">
			<tbody>
				<tr
					v-for="row in 2"
					:key="row"
					class="border-b border-gray-100 last:border-0"
				>
					<td class="py-2 text-gray-600">
						<DmsMailingTokenText :text="`{{${block.labelPath}}}`" />
					</td>
					<td class="py-2 text-right font-medium text-gray-900">
						<DmsMailingTokenText :text="`{{${block.valuePath}}}`" />
					</td>
				</tr>
			</tbody>
		</table>
		<p class="mt-1 font-mono text-[10px] text-gray-400">
			#each {{ block.source }}
		</p>
	</div>
</template>

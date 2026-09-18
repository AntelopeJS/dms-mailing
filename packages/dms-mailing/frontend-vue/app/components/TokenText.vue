<script setup lang="ts">
import { computed } from 'vue'
import { splitTokens } from '../utils/tokens'

interface Props {
	text?: string
}

const props = defineProps<Props>()

const parts = computed(() => splitTokens(props.text ?? ''))
</script>

<template>
	<span>
		<template v-for="(part, index) in parts" :key="index">
			<span
				v-if="part.kind === 'token'"
				class="bg-primary/10 text-primary rounded px-1 font-mono text-[.88em]"
			>
				{{ part.value }}
			</span>
			<template v-else>{{ part.value }}</template>
		</template>
	</span>
</template>

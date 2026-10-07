<script setup lang="ts">
import type { ChangeLine } from '../../utils/changes'
import type { PublishReviewChoice } from '../../composables/useEditorActions'

interface Props {
	lines: ChangeLine[]
	warnings: string[]
	nextVersion: number
	currentVersion: number
}

defineProps<Props>()
const emit = defineEmits<{ success: [PublishReviewChoice] }>()

const KEY = 'dms_mailing.editor.publish_review'

const { t } = useI18n()
</script>

<template>
	<div class="flex flex-col gap-4">
		<ul v-if="lines.length" class="flex flex-col gap-2 text-[13px]">
			<li
				v-for="line in lines"
				:key="line.key"
				class="text-toned flex items-center gap-2"
			>
				<UIcon :name="line.icon" class="text-primary size-4 shrink-0" />
				<span>{{ line.text }}</span>
			</li>
		</ul>
		<p v-else class="text-muted text-[13px]">
			{{ t(`${KEY}.no_changes`, { version: currentVersion }) }}
		</p>

		<DmsBanner
			v-if="warnings.length"
			tone="warning"
			icon="i-ph-warning"
			:title="t(`${KEY}.checks`, { count: warnings.length }, warnings.length)"
		>
			<template #description>
				<ul class="flex flex-col gap-1">
					<li v-for="warning in warnings" :key="warning">{{ warning }}</li>
				</ul>
			</template>
		</DmsBanner>

		<div class="border-default -mx-1 flex items-center gap-2 border-t pt-4">
			<UButton
				color="neutral"
				variant="ghost"
				icon="i-ph-flask"
				@click="emit('success', 'test')"
			>
				{{ t(`${KEY}.test_first`) }}
			</UButton>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				@click="emit('success', 'keep')"
			>
				{{ t(`${KEY}.keep_editing`) }}
			</UButton>
			<UButton icon="i-ph-rocket-launch" @click="emit('success', 'publish')">
				{{ t(`${KEY}.confirm`, { version: nextVersion }) }}
			</UButton>
		</div>
	</div>
</template>

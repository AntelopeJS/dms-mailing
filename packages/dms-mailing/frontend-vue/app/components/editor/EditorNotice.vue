<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import type { EditorNotice } from '../../utils/lifecycle'
import { publishedMoment } from '../../utils/lifecycle'

interface Props {
	notice: EditorNotice
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.notice'

const { t, locale } = useI18n()
const { session, actions } = useEditorContext()

const text = computed(() => {
	const { state } = session
	const moment = publishedMoment(
		state.template.publishedAt,
		String(locale.value),
	)
	const count = state.changes.length
	const params = {
		version: state.version,
		count,
		date: moment?.date ?? '',
		time: moment?.time ?? '',
		status: t(`dms_mailing.templates.status.${state.template.status}`),
	}
	return t(`${KEY}.${props.notice.kind}`, params, count)
})
</script>

<template>
	<div
		class="border-primary/30 from-primary/15 via-primary/5 text-toned flex h-[38px] shrink-0 items-center gap-2.5 border-b bg-gradient-to-r to-transparent px-4 text-[12.5px]"
	>
		<UIcon name="i-ph-shield-check" class="text-primary size-4 shrink-0" />
		<span class="min-w-0 truncate">{{ text }}</span>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<UButton
				v-if="notice.canCompare"
				size="xs"
				color="neutral"
				variant="ghost"
				icon="i-ph-columns"
				@click="actions.compare()"
			>
				{{ t(`${KEY}.compare`) }}
			</UButton>
			<UButton
				v-if="notice.canDiscard"
				size="xs"
				color="neutral"
				variant="ghost"
				icon="i-ph-arrow-counter-clockwise"
				@click="actions.discard()"
			>
				{{ t(`${KEY}.discard`) }}
			</UButton>
		</div>
	</div>
</template>

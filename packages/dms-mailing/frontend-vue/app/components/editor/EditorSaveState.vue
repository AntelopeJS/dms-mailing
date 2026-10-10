<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

type SaveView = 'saving' | 'saved' | 'unpublished' | 'error'

const DOT_CLASSES: Record<SaveView, string> = {
	saving: 'bg-dimmed animate-pulse',
	saved: 'bg-success',
	unpublished: 'bg-warning',
	error: 'bg-error',
}
const KEY = 'dms_mailing.editor.save_state'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const view = computed<SaveView>(() => {
	if (session.state.saveStatus === 'error') return 'error'
	if (session.isSaving) return 'saving'
	return session.state.changes.length > 0 ? 'unpublished' : 'saved'
})

const label = computed(() => {
	const count = session.state.changes.length
	return t(`${KEY}.${view.value}`, { count }, count)
})
</script>

<template>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="text-muted flex items-center gap-1.5 rounded px-1.5 font-mono text-[11.5px]"
			:class="
				view === 'error' ? 'text-error hover:underline' : 'cursor-default'
			"
			:title="view === 'error' ? t(`${KEY}.retry`) : t(`${KEY}.hint`)"
			@click="view === 'error' && session.save()"
		>
			<span class="size-1.5 rounded-full" :class="DOT_CLASSES[view]" />
			{{ label }}
		</button>
		<UTooltip :text="t(`${KEY}.undo`)" :kbds="['meta', 'z']">
			<UButton
				icon="i-ph-arrow-counter-clockwise"
				size="sm"
				color="neutral"
				variant="ghost"
				square
				:disabled="!editor.canUndo"
				:aria-label="t(`${KEY}.undo`)"
				@click="editor.undo()"
			/>
		</UTooltip>
		<UTooltip :text="t(`${KEY}.redo`)" :kbds="['shift', 'meta', 'z']">
			<UButton
				icon="i-ph-arrow-clockwise"
				size="sm"
				color="neutral"
				variant="ghost"
				square
				:disabled="!editor.canRedo"
				:aria-label="t(`${KEY}.redo`)"
				@click="editor.redo()"
			/>
		</UTooltip>
	</div>
</template>

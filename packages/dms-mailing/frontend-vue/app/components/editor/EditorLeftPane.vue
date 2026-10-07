<script setup lang="ts">
import { computed } from 'vue'
import type { LeftTab } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'

const KEY = 'dms_mailing.editor.left'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const variableCount = computed(
	() =>
		new Set([
			...session.state.variables.map((variable) => variable.path),
			...session.detected,
		]).size,
)

const items = computed(() => [
	{ value: 'blocks', label: t(`${KEY}.blocks`) },
	{ value: 'outline', label: t(`${KEY}.outline`) },
	{
		value: 'variables',
		label: t(`${KEY}.variables`),
		badge: {
			label: String(variableCount.value),
			color: 'neutral' as const,
			variant: 'subtle' as const,
		},
	},
])

const tab = computed({
	get: () => editor.leftTab,
	set: (value: string | number) => (editor.leftTab = value as LeftTab),
})
</script>

<template>
	<aside class="border-default bg-elevated/30 flex min-h-0 flex-col border-r">
		<UTabs
			v-model="tab"
			:items="items"
			:content="false"
			variant="link"
			size="sm"
			class="border-default shrink-0 border-b px-2"
		/>
		<div class="min-h-0 flex-1 overflow-y-auto p-3.5">
			<MailingEditorPalette v-if="editor.leftTab === 'blocks'" />
			<MailingEditorOutline v-else-if="editor.leftTab === 'outline'" />
			<MailingEditorVariablesPane v-else />
		</div>
		<footer
			class="border-default text-dimmed flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap border-t px-3.5 py-2.5 font-mono text-[11px]"
		>
			<UIcon name="i-ph-keyboard" class="size-3.5 shrink-0" />
			<MailingEditorShortcutHint
				:keys="['meta', 's']"
				:label="t(`${KEY}.shortcut_save`)"
			/>
			<span>·</span>
			<MailingEditorShortcutHint
				:keys="['meta', 'enter']"
				:label="t(`${KEY}.shortcut_publish`)"
			/>
			<span>·</span>
			<MailingEditorShortcutHint
				:keys="['T']"
				:label="t(`${KEY}.shortcut_test`)"
			/>
		</footer>
	</aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block, Condition } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'

interface Props {
	block: Block
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.visibility'
const ALWAYS = 'always'
const ONLY_IF = 'only_if'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const items = computed(() => [
	{ value: ALWAYS, label: t(`${KEY}.always`) },
	{ value: ONLY_IF, label: t(`${KEY}.only_if`) },
])

function firstPath(): string {
	return session.state.variables[0]?.path ?? session.detected[0] ?? ''
}

function setRule(rule: Condition | null): void {
	editor.updateBlock(props.block.id, { visibleIf: rule })
}

const mode = computed({
	get: () => (props.block.visibleIf ? ONLY_IF : ALWAYS),
	set: (value: string | number | undefined) =>
		setRule(
			value === ONLY_IF
				? { path: firstPath(), operator: 'truthy', value: '' }
				: null,
		),
})
</script>

<template>
	<div class="flex flex-col gap-2">
		<p class="text-highlighted text-sm font-medium">{{ t(`${KEY}.label`) }}</p>
		<DmsSegmented
			v-model="mode"
			size="xs"
			:items="items"
			:aria-label="t(`${KEY}.label`)"
			class="self-start"
		/>
		<MailingEditorConditionFields
			v-if="block.visibleIf"
			:condition="block.visibleIf"
			outcome="visibility"
			@update="setRule"
		/>
		<p class="text-muted text-xs">{{ t(`${KEY}.help`) }}</p>
	</div>
</template>

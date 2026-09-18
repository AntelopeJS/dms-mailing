<script setup lang="ts">
import { computed } from 'vue'
import type { Condition, ConditionOperator } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	OPERATORS,
	OPERATORS_WITH_VALUE,
	compileCondition,
} from '../../utils/conditions'
import { collectPaths } from '../../utils/paths'

const CLOSING_TAG = '{{/if}}'

interface Props {
	condition: Condition
}

const props = defineProps<Props>()
const emit = defineEmits<{ update: [Condition] }>()

const { t } = useI18n()
const { editor, variables } = useEditorContext()

const fieldOptions = computed(() =>
	collectPaths(
		variables.value.map((variable) => variable.path),
		editor.current?.blocks ?? [],
		props.condition.path,
	),
)

const operatorItems = computed(() =>
	OPERATORS.map((value) => ({
		value,
		label: t(`dms_mailing.editor.operators.${value}`),
	})),
)

const needsValue = computed(() =>
	OPERATORS_WITH_VALUE.includes(props.condition.operator),
)
const compiled = computed(() => compileCondition(props.condition))

const path = computed({
	get: () => props.condition.path,
	set: (value: string) => emit('update', { ...props.condition, path: value }),
})

const operator = computed({
	get: () => props.condition.operator,
	set: (value: ConditionOperator) =>
		emit('update', { ...props.condition, operator: value }),
})

const value = computed({
	get: () => props.condition.value,
	set: (next: string) => emit('update', { ...props.condition, value: next }),
})
</script>

<template>
	<div class="flex flex-col gap-2">
		<UFormField :label="t('dms_mailing.editor.condition.field')" size="xs">
			<USelectMenu
				v-model="path"
				class="w-full"
				:items="fieldOptions"
				create-item
			/>
		</UFormField>

		<UFormField :label="t('dms_mailing.editor.condition.operator')" size="xs">
			<USelect v-model="operator" class="w-full" :items="operatorItems" />
		</UFormField>

		<UFormField
			v-if="needsValue"
			:label="t('dms_mailing.editor.condition.value')"
			size="xs"
		>
			<UInput v-model="value" class="w-full" />
		</UFormField>

		<pre
			class="bg-elevated text-muted overflow-x-auto rounded-md px-2 py-1.5 font-mono text-[10px]"
			>{{ compiled }} … {{ CLOSING_TAG }}</pre>
	</div>
</template>

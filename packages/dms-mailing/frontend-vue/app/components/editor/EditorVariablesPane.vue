<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VariableDefinition } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { mergeVariables } from '../../utils/variables'
import type { MergedVariable } from '../../utils/variables'

interface VariableDraft {
	original: string | null
	value: VariableDefinition
}

const KEY = 'dms_mailing.editor.variables'
const DEFAULT_TYPE = 'string'

const { t } = useI18n()
const { session } = useEditorContext()

const merged = computed(() =>
	mergeVariables(session.detected, session.state.variables),
)
const draft = ref<VariableDraft | null>(null)
const saving = ref(false)

function open(original: string | null, value: VariableDefinition): void {
	draft.value = { original, value: { ...value } }
}

function startNew(path = ''): void {
	open(null, { path, type: DEFAULT_TYPE, required: false })
}

function edit(variable: MergedVariable): void {
	if (variable.usage === 'detected') return startNew(variable.path)
	open(variable.path, {
		path: variable.path,
		type: variable.type,
		required: variable.required,
	})
}

async function persist(next: VariableDefinition[]): Promise<void> {
	saving.value = true
	try {
		await session.saveVariables(next)
		draft.value = null
	} catch (error) {
		session.reportError(error)
	} finally {
		saving.value = false
	}
}

function save(value: VariableDefinition): Promise<void> {
	const original = draft.value?.original
	const kept = session.state.variables.filter(
		(variable) => variable.path !== original && variable.path !== value.path,
	)
	return persist([...kept, value])
}

function remove(path: string): Promise<void> {
	return persist(
		session.state.variables.filter((variable) => variable.path !== path),
	)
}

function insert(path: string): void {
	session.state.activeField?.insert(path)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<DmsEyebrow :label="t(`${KEY}.insert_hint`)" />

		<p v-if="merged.length === 0" class="text-muted text-xs">
			{{ t(`${KEY}.empty`) }}
		</p>

		<MailingEditorVariableRow
			v-for="variable in merged"
			:key="variable.path"
			:variable="variable"
			@insert="insert(variable.path)"
			@edit="edit(variable)"
			@remove="remove(variable.path)"
		/>

		<MailingEditorVariableForm
			v-if="draft"
			:value="draft.value"
			:is-new="draft.original === null"
			:saving="saving"
			@save="save"
			@cancel="draft = null"
		/>
		<UButton
			v-else
			size="sm"
			color="neutral"
			variant="outline"
			icon="i-ph-plus"
			block
			class="mt-1"
			@click="startNew()"
		>
			{{ t(`${KEY}.declare`) }}
		</UButton>
	</div>
</template>

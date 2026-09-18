<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VariableDefinition, VariableType } from '../../types/mailing'
import { VARIABLE_TYPES } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { collectContentPaths } from '../../utils/paths'
import { mergeVariables } from '../../utils/variables'

const DEFAULT_TYPE: VariableType = 'string'

const emit = defineEmits<{ insert: [string] }>()

const { t } = useI18n()
const { api, editor, templateId, variables, detectedVariables } =
	useEditorContext()

// `detectedVariables` comes from the server and only refreshes on save, so on
// its own it strikes through a path the moment it is wired into a condition.
// Union it with what the editor currently holds: the server list still covers
// what a save has seen, and the live one covers what the author just did.
const detected = computed(() => [
	...new Set([
		...detectedVariables.value,
		...collectContentPaths(editor.content),
	]),
])

const merged = computed(() => mergeVariables(detected.value, variables.value))
const undeclared = computed(() =>
	merged.value
		.filter((entry) => entry.usage === 'detected')
		.map((entry) => entry.path),
)

const declaring = ref(false)
const saving = ref(false)
const draft = ref<VariableDefinition>({
	path: '',
	type: DEFAULT_TYPE,
	required: false,
})

function reset(): void {
	draft.value = { path: '', type: DEFAULT_TYPE, required: false }
	declaring.value = false
}

function startDeclaring(): void {
	draft.value = {
		path: undeclared.value[0] ?? '',
		type: DEFAULT_TYPE,
		required: false,
	}
	declaring.value = true
}

async function declare(): Promise<void> {
	if (!draft.value.path) return
	saving.value = true
	try {
		const next = [...variables.value, { ...draft.value }]
		const response = await api.saveVariables(templateId, next)
		variables.value = response.variables ?? next
		reset()
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<section class="flex flex-col gap-2">
		<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
			{{ t('dms_mailing.editor.groups.variables') }}
		</p>

		<p v-if="merged.length === 0" class="text-muted text-[11px]">
			{{ t('dms_mailing.editor.variables.empty') }}
		</p>

		<button
			v-for="variable in merged"
			:key="variable.path"
			type="button"
			class="border-default hover:border-primary flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition"
			:title="t('dms_mailing.editor.variables.insert')"
			@click="emit('insert', variable.path)"
		>
			<code
				class="min-w-0 flex-1 truncate font-mono text-[11px]"
				:class="variable.usage === 'unused' ? 'text-muted line-through' : ''"
			>
				{{ variable.path }}
			</code>
			<UBadge
				v-if="variable.usage === 'unused'"
				size="sm"
				variant="subtle"
				color="warning"
			>
				{{ t('dms_mailing.editor.variables.unused') }}
			</UBadge>
			<UBadge size="sm" variant="subtle" color="neutral">
				{{ variable.type }}
			</UBadge>
			<UBadge
				v-if="variable.required"
				size="sm"
				variant="subtle"
				color="warning"
			>
				{{ t('dms_mailing.editor.variables.required') }}
			</UBadge>
		</button>

		<UButton
			v-if="!declaring"
			size="xs"
			variant="outline"
			color="neutral"
			icon="i-ph-plus"
			@click="startDeclaring()"
		>
			{{ t('dms_mailing.editor.variables.declare') }}
		</UButton>

		<div
			v-else
			class="border-default flex flex-col gap-2 rounded-md border p-2"
		>
			<UFormField :label="t('dms_mailing.editor.variables.path')" size="xs">
				<UInput
					v-model="draft.path"
					class="w-full"
					placeholder="order.total"
					list="editor-detected-paths"
				/>
				<datalist id="editor-detected-paths">
					<option v-for="path in undeclared" :key="path" :value="path" />
				</datalist>
			</UFormField>
			<UFormField :label="t('dms_mailing.editor.variables.type')" size="xs">
				<USelect v-model="draft.type" class="w-full" :items="VARIABLE_TYPES" />
			</UFormField>
			<UFormField :label="t('dms_mailing.editor.variables.required')" size="xs">
				<USwitch v-model="draft.required" />
			</UFormField>
			<div class="flex items-center gap-2">
				<UButton
					size="xs"
					:loading="saving"
					:disabled="!draft.path"
					@click="declare()"
				>
					{{ t('dms_mailing.editor.variables.add') }}
				</UButton>
				<UButton size="xs" variant="ghost" color="neutral" @click="reset()">
					{{ t('dms_mailing.editor.variables.cancel') }}
				</UButton>
			</div>
		</div>
	</section>
</template>

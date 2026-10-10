<script setup lang="ts">
import { ref } from 'vue'
import type { VariableDefinition } from '../../types/mailing'
import { VARIABLE_TYPES } from '../../types/mailing'

interface Props {
	value: VariableDefinition
	isNew: boolean
	saving?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ save: [VariableDefinition]; cancel: [] }>()

const KEY = 'dms_mailing.editor.variables'
const PATH_PATTERN = /^[A-Za-z0-9_.[\]]+$/

const { t } = useI18n()

const draft = ref<VariableDefinition>({ ...props.value })

function submit(): void {
	const path = draft.value.path.trim()
	if (!PATH_PATTERN.test(path)) return
	emit('save', { ...draft.value, path })
}
</script>

<template>
	<form
		class="border-default bg-default mt-1 flex flex-col gap-2.5 rounded-md border p-2.5"
		@submit.prevent="submit()"
	>
		<UFormField :label="t(`${KEY}.path`)" size="xs">
			<UInput
				v-model="draft.path"
				class="w-full font-mono"
				placeholder="order.total"
				autofocus
			/>
		</UFormField>
		<UFormField :label="t(`${KEY}.type`)" size="xs">
			<USelect v-model="draft.type" class="w-full" :items="VARIABLE_TYPES" />
		</UFormField>
		<USwitch v-model="draft.required" size="sm" :label="t(`${KEY}.required`)" />
		<div class="flex items-center gap-2">
			<UButton
				type="submit"
				size="xs"
				:loading="saving"
				:disabled="!draft.path.trim()"
			>
				{{ isNew ? t(`${KEY}.add`) : t(`${KEY}.save`) }}
			</UButton>
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				@click="emit('cancel')"
			>
				{{ t(`${KEY}.cancel`) }}
			</UButton>
		</div>
	</form>
</template>

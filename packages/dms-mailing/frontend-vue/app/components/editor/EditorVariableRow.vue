<script setup lang="ts">
import type { MergedVariable } from '../../utils/variables'

interface Props {
	variable: MergedVariable
}

defineProps<Props>()
const emit = defineEmits<{ insert: []; edit: []; remove: [] }>()

const KEY = 'dms_mailing.editor.variables'

const { t } = useI18n()
</script>

<template>
	<div
		class="border-default bg-default hover:border-primary/50 group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors"
		:class="{ 'border-warning/50 bg-warning/5': variable.usage === 'detected' }"
	>
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-1 text-left"
			:title="t(`${KEY}.insert`)"
			@click="emit('insert')"
		>
			<code
				class="min-w-0 truncate font-mono text-[11.5px]"
				:class="
					variable.usage === 'unused'
						? 'text-dimmed line-through'
						: 'text-highlighted'
				"
			>
				{{ variable.path }}
			</code>
			<span v-if="variable.required" class="text-warning text-xs">*</span>
		</button>
		<template v-if="variable.usage === 'detected'">
			<DmsStatusPill tone="warning" size="sm" :label="t(`${KEY}.undeclared`)" />
			<UButton size="xs" variant="soft" color="warning" @click="emit('edit')">
				{{ t(`${KEY}.declare_one`) }}
			</UButton>
		</template>
		<template v-else>
			<DmsStatusPill
				v-if="variable.usage === 'unused'"
				tone="neutral"
				size="sm"
				:label="t(`${KEY}.unused`)"
			/>
			<span v-else class="text-dimmed font-mono text-[10.5px]">
				{{ variable.type }}
			</span>
			<UButton
				icon="i-ph-pencil-simple"
				size="xs"
				color="neutral"
				variant="ghost"
				square
				class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
				:aria-label="t(`${KEY}.edit`)"
				@click="emit('edit')"
			/>
			<UButton
				icon="i-ph-trash"
				size="xs"
				color="error"
				variant="ghost"
				square
				class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
				:aria-label="t(`${KEY}.remove`)"
				@click="emit('remove')"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block, Condition, TextAlign } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { fieldsFor } from '../../utils/blocks'
import { collectPaths } from '../../utils/paths'

const MIN_SIZE = 12
const MAX_SIZE = 48
const TEXT_FIELD_KEY = 'text'
const ALIGNMENTS: TextAlign[] = ['left', 'center', 'right']
const ALIGN_ICONS: Record<TextAlign, string> = {
	left: 'i-ph-text-align-left',
	center: 'i-ph-text-align-center',
	right: 'i-ph-text-align-right',
}

interface Props {
	block: Block
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor, variables } = useEditorContext()

const fields = computed(() => fieldsFor(props.block.type))
const values = computed(() => props.block as unknown as Record<string, unknown>)

const alignItems = ALIGNMENTS.map((value) => ({
	value,
	label: value,
	icon: ALIGN_ICONS[value],
}))

function patch(key: string, value: unknown): void {
	editor.updateBlock(props.block.id, { [key]: value } as Partial<Block>)
}

function firstPath(): string {
	return (
		collectPaths(
			variables.value.map((variable) => variable.path),
			editor.current?.blocks ?? [],
		)[0] ?? ''
	)
}

function enableVisibleIf(): void {
	patch('visibleIf', {
		path: firstPath(),
		operator: 'truthy',
		value: '',
	} satisfies Condition)
}

function appendToken(path: string): void {
	const current = values.value[TEXT_FIELD_KEY]
	if (typeof current !== 'string') return
	patch(TEXT_FIELD_KEY, `${current} {{${path}}}`)
}

function remove(): void {
	editor.select(null)
	editor.removeBlockById(props.block.id)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
			{{ t(`dms_mailing.blocks.${props.block.type}`) }}
		</p>

		<UFormField
			v-for="field in fields"
			:key="field.key"
			:label="t(field.label)"
			size="xs"
		>
			<UTextarea
				v-if="field.kind === 'textarea'"
				:model-value="String(values[field.key] ?? '')"
				class="w-full"
				:rows="3"
				@update:model-value="patch(field.key, $event)"
			/>
			<DmsSegmented
				v-else-if="field.kind === 'align'"
				:model-value="String(values[field.key] ?? 'left')"
				:items="alignItems"
				size="xs"
				:aria-label="t(field.label)"
				@update:model-value="patch(field.key, $event)"
			/>
			<USlider
				v-else-if="field.kind === 'size'"
				:model-value="Number(values[field.key] ?? MIN_SIZE)"
				:min="MIN_SIZE"
				:max="MAX_SIZE"
				@update:model-value="patch(field.key, $event)"
			/>
			<UInput
				v-else
				:model-value="String(values[field.key] ?? '')"
				class="w-full"
				@update:model-value="patch(field.key, $event)"
			/>
			<template v-if="field.help" #help>
				{{ t(`dms_mailing.editor.block_settings.${field.help}`) }}
			</template>
		</UFormField>

		<template v-if="props.block.type === 'if'">
			<USeparator />
			<DmsMailingEditorConditionFields
				:condition="props.block.condition"
				@update="patch('condition', $event)"
			/>
			<UButton
				v-if="!props.block.elseChildren"
				size="xs"
				variant="outline"
				color="neutral"
				icon="i-ph-git-fork"
				@click="editor.addElse(props.block.id)"
			>
				{{ t('dms_mailing.editor.condition.add_else') }}
			</UButton>
		</template>

		<USeparator />

		<section class="flex flex-col gap-2">
			<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
				{{ t('dms_mailing.editor.groups.conditional') }}
			</p>
			<template v-if="props.block.visibleIf">
				<DmsMailingEditorConditionFields
					:condition="props.block.visibleIf"
					@update="patch('visibleIf', $event)"
				/>
				<UButton
					size="xs"
					variant="link"
					color="neutral"
					class="self-start"
					@click="patch('visibleIf', null)"
				>
					{{ t('dms_mailing.editor.block_settings.always_show') }}
				</UButton>
			</template>
			<template v-else>
				<UButton
					size="xs"
					variant="outline"
					color="neutral"
					icon="i-ph-funnel"
					@click="enableVisibleIf()"
				>
					{{ t('dms_mailing.editor.block_settings.only_if') }}
				</UButton>
				<p class="text-muted text-[11px]">
					{{ t('dms_mailing.editor.block_settings.conditional_help') }}
				</p>
			</template>
		</section>

		<USeparator />

		<DmsMailingEditorVariables @insert="appendToken" />

		<USeparator />

		<UButton
			color="error"
			variant="soft"
			size="xs"
			icon="i-ph-trash"
			block
			@click="remove()"
		>
			{{ t('dms_mailing.editor.block_settings.delete_block') }}
		</UButton>
	</div>
</template>

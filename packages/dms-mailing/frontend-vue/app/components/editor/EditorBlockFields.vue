<script setup lang="ts">
import { computed } from 'vue'
import type { Block, TextAlign } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { fieldsFor } from '../../utils/blocks'

interface Props {
	block: Block
}

const props = defineProps<Props>()

const MIN_SIZE = 12
const MAX_SIZE = 48
const SETTINGS_KEY = 'dms_mailing.editor.block_settings'
const ALIGNMENTS: TextAlign[] = ['left', 'center', 'right']
const ALIGN_ICONS: Record<TextAlign, string> = {
	left: 'i-ph-text-align-left',
	center: 'i-ph-text-align-center',
	right: 'i-ph-text-align-right',
}
const TOKEN_KINDS = ['tokens', 'token']

const { t } = useI18n()
const { editor, session } = useEditorContext()

const fields = computed(() => fieldsFor(props.block.type))
const values = computed(() => props.block as unknown as Record<string, unknown>)
const pathItems = computed(() =>
	[
		...new Set([
			...session.state.variables.map((variable) => variable.path),
			...session.detected,
		]),
	].sort(),
)

const alignItems = ALIGNMENTS.map((value) => ({
	value,
	label: '',
	icon: ALIGN_ICONS[value],
}))

function text(key: string): string {
	return String(values.value[key] ?? '')
}

function patch(key: string, value: unknown): void {
	editor.updateBlock(props.block.id, { [key]: value } as Partial<Block>)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<UFormField
			v-for="field in fields"
			:key="field.key"
			:label="t(field.label)"
			size="sm"
		>
			<MailingEditorTokenField
				v-if="TOKEN_KINDS.includes(field.kind)"
				:model-value="text(field.key)"
				:is-multiline="field.kind === 'tokens'"
				@update:model-value="patch(field.key, $event)"
			/>
			<DmsSegmented
				v-else-if="field.kind === 'align'"
				:model-value="text(field.key) || ALIGNMENTS[0]"
				:items="alignItems"
				size="xs"
				block
				:aria-label="t(field.label)"
				@update:model-value="patch(field.key, $event)"
			/>
			<div v-else-if="field.kind === 'size'" class="flex items-center gap-3">
				<USlider
					:model-value="Number(values[field.key] ?? MIN_SIZE)"
					:min="MIN_SIZE"
					:max="MAX_SIZE"
					class="flex-1"
					@update:model-value="patch(field.key, $event)"
				/>
				<span class="text-dimmed w-10 text-right font-mono text-[11px]">
					{{ values[field.key] }} px
				</span>
			</div>
			<USelectMenu
				v-else-if="field.kind === 'path'"
				:model-value="text(field.key)"
				:items="pathItems"
				create-item
				class="w-full font-mono"
				icon="i-ph-brackets-curly"
				@update:model-value="patch(field.key, $event)"
				@create="patch(field.key, $event)"
			/>
			<UInput
				v-else
				:model-value="text(field.key)"
				class="w-full"
				@update:model-value="patch(field.key, $event)"
			/>
			<template v-if="field.help || TOKEN_KINDS.includes(field.kind)" #help>
				{{
					field.help
						? t(`${SETTINGS_KEY}.${field.help}`)
						: t('dms_mailing.editor.autocomplete.hint')
				}}
			</template>
		</UFormField>
	</div>
</template>

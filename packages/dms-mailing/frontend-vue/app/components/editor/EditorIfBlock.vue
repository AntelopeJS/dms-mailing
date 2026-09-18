<script setup lang="ts">
import { computed } from 'vue'
import type { IfBlock } from '../../types/mailing'
import type { InsertTarget } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'
import { compileCondition, describeCondition } from '../../utils/conditions'

const SIM_TRUE = 'true'
const SIM_FALSE = 'false'
const CLOSING_TAG = '{{/if}}'
const DIMMED_OPACITY = 0.4

interface Props {
	block: IfBlock
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor, simulation } = useEditorContext()

const description = computed(() =>
	describeCondition(props.block.condition, (key: string) => t(key)),
)
const compiled = computed(() => compileCondition(props.block.condition))

const thenTarget = computed<InsertTarget>(() => ({
	parentId: props.block.id,
	branch: 'children',
}))
const elseTarget = computed<InsertTarget>(() => ({
	parentId: props.block.id,
	branch: 'elseChildren',
}))

const takesThen = computed(() => simulation[props.block.id] !== false)

const simItems = computed(() => [
	{ value: SIM_TRUE, label: t('dms_mailing.editor.condition.simulate_true') },
	{ value: SIM_FALSE, label: t('dms_mailing.editor.condition.simulate_false') },
])

const simulated = computed({
	get: () => (takesThen.value ? SIM_TRUE : SIM_FALSE),
	set: (value: string | number) => {
		simulation[props.block.id] = value === SIM_TRUE
	},
})

const opacityOf = (active: boolean) => ({
	opacity: active ? 1 : DIMMED_OPACITY,
})
</script>

<template>
	<div
		class="my-3 rounded-lg border border-dashed border-purple-400/70 bg-purple-50/50 p-3"
	>
		<div class="mb-2 flex items-center gap-2">
			<UBadge color="secondary" variant="subtle" size="sm">
				{{ t('dms_mailing.editor.condition.if') }}
			</UBadge>
			<code class="min-w-0 truncate font-mono text-[11px] text-purple-700">
				{{ description }}
			</code>
			<DmsSegmented
				v-model="simulated"
				class="ml-auto shrink-0"
				size="xs"
				:items="simItems"
				:aria-label="t('dms_mailing.editor.condition.compiled')"
				@click.stop
			/>
		</div>

		<div :style="opacityOf(takesThen)">
			<DmsMailingEditorBlockList
				:list="props.block.children"
				:target="thenTarget"
			/>
		</div>

		<template v-if="props.block.elseChildren">
			<div class="my-2 flex items-center gap-2">
				<UBadge color="neutral" variant="subtle" size="sm">
					{{ t('dms_mailing.editor.condition.else') }}
				</UBadge>
				<UButton
					class="ml-auto"
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-ph-x"
					@click.stop="editor.removeElse(props.block.id)"
				>
					{{ t('dms_mailing.editor.condition.remove_else') }}
				</UButton>
			</div>
			<div :style="opacityOf(!takesThen)">
				<DmsMailingEditorBlockList
					:list="props.block.elseChildren"
					:target="elseTarget"
				/>
			</div>
		</template>

		<button
			v-else
			type="button"
			class="mt-2 w-full rounded-md border border-dashed border-purple-300 py-2 text-xs text-purple-500 transition hover:border-purple-500 hover:text-purple-700"
			@click.stop="editor.addElse(props.block.id)"
		>
			+ {{ t('dms_mailing.editor.condition.add_else') }}
		</button>

		<code class="mt-2 block font-mono text-[10px] text-purple-400">
			{{ compiled }} … {{ CLOSING_TAG }}
		</code>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { SUBJECT_RECOMMENDED_LENGTH } from '../../utils/lifecycle'

const KEY = 'dms_mailing.editor.envelope'

const { t } = useI18n()
const { editor } = useEditorContext()

const subject = computed(() => editor.current?.subject ?? '')
const preheader = computed(() => editor.current?.preheader ?? '')
const isTooLong = computed(
	() => subject.value.length > SUBJECT_RECOMMENDED_LENGTH,
)

function openEnvelope(): void {
	editor.select(null)
	editor.rightTab = 'template'
}
</script>

<template>
	<div
		class="border-default bg-default shadow-xs mb-3.5 overflow-hidden rounded-md border text-sm"
	>
		<button
			type="button"
			class="hover:bg-elevated/50 flex min-h-[38px] w-full items-center gap-2.5 px-3 text-left"
			@click.stop="openEnvelope()"
		>
			<DmsEyebrow :label="t(`${KEY}.subject`)" class="w-[78px] shrink-0" />
			<MailingTokenText
				v-if="subject"
				:text="subject"
				variant="ui"
				class="text-highlighted min-w-0 truncate"
			/>
			<span v-else class="text-dimmed">{{ t(`${KEY}.subject_empty`) }}</span>
			<span
				class="ml-auto shrink-0 font-mono text-[11px]"
				:class="isTooLong ? 'text-warning' : 'text-dimmed'"
				:title="t(`${KEY}.subject_length`, { max: SUBJECT_RECOMMENDED_LENGTH })"
			>
				{{ subject.length }} / {{ SUBJECT_RECOMMENDED_LENGTH }}
			</span>
		</button>
		<button
			type="button"
			class="border-default hover:bg-elevated/50 flex min-h-[38px] w-full items-center gap-2.5 border-t px-3 text-left"
			@click.stop="openEnvelope()"
		>
			<DmsEyebrow :label="t(`${KEY}.preheader`)" class="w-[78px] shrink-0" />
			<MailingTokenText
				v-if="preheader"
				:text="preheader"
				variant="ui"
				class="text-muted min-w-0 truncate"
			/>
			<span v-else class="text-dimmed">{{ t(`${KEY}.preheader_empty`) }}</span>
		</button>
	</div>
</template>

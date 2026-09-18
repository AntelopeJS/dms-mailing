<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import type { TemplateStatus } from '../../types/mailing'

interface StatusAction {
	action: 'publish' | 'unpublish' | 'archive'
	icon: string
}

/** Status is not a free-form field: each transition has its own side effects. */
const STATUS_ACTIONS: StatusAction[] = [
	{ action: 'publish', icon: 'i-ph-rocket-launch' },
	{ action: 'unpublish', icon: 'i-ph-eye-slash' },
	{ action: 'archive', icon: 'i-ph-archive' },
]

const STATUS_COLOURS: Record<TemplateStatus, 'success' | 'neutral'> = {
	live: 'success',
	draft: 'neutral',
	archived: 'neutral',
}

const { t } = useI18n()
const { editor, template, name, category, runStatusAction } = useEditorContext()

const statusLabel = computed(() =>
	t(`dms_mailing.templates.status.${template.value.status}`),
)

function touchOnEdit(): void {
	editor.touch()
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
			{{ t('dms_mailing.editor.tabs.template') }}
		</p>

		<UFormField :label="t('dms_mailing.templates.cols.name')" size="xs">
			<UInput v-model="name" class="w-full" @update:model-value="touchOnEdit" />
		</UFormField>

		<UFormField :label="t('dms_mailing.templates.cols.slug')" size="xs">
			<UInput :model-value="template.slug" class="w-full font-mono" disabled />
		</UFormField>

		<UFormField :label="t('dms_mailing.templates.cols.category')" size="xs">
			<DmsMailingCategoryInput
				v-model="category"
				@update:model-value="touchOnEdit"
			/>
		</UFormField>

		<USeparator />

		<section class="flex flex-col gap-2">
			<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
				{{ t('dms_mailing.templates.cols.status') }}
			</p>
			<UBadge
				:color="STATUS_COLOURS[template.status]"
				variant="subtle"
				size="sm"
				class="self-start"
				:label="statusLabel"
			/>
			<div class="flex flex-wrap items-center gap-2">
				<UButton
					v-for="entry in STATUS_ACTIONS"
					:key="entry.action"
					size="xs"
					variant="outline"
					color="neutral"
					:icon="entry.icon"
					:label="t(`dms_mailing.templates.actions.${entry.action}`)"
					@click="runStatusAction(entry.action)"
				/>
			</div>
			<p class="text-muted text-[11px]">
				{{ t('dms_mailing.editor.status_hint') }}
			</p>
		</section>
	</div>
</template>

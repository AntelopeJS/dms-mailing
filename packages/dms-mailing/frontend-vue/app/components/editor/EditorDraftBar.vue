<script setup lang="ts">
import { useEditorContext } from '../../composables/useEditorContext'

const { t } = useI18n()
const { editor, template, discard } = useEditorContext()
</script>

<template>
	<div
		class="flex h-10 shrink-0 items-center gap-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/40 px-4 text-[12.5px] dark:border-amber-900/60 dark:from-amber-950/60 dark:to-amber-900/20"
	>
		<span class="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
		<span class="font-medium text-amber-900 dark:text-amber-200">
			{{ t('dms_mailing.editor.unsaved', { count: editor.dirty }) }}
		</span>

		<UBadge variant="subtle" color="neutral" size="sm">
			{{ editor.locale.toUpperCase() }}
		</UBadge>
		<UBadge variant="subtle" color="neutral" size="sm" class="font-mono">
			{{ t('dms_mailing.editor.still_called', { slug: template.slug }) }}
		</UBadge>

		<UButton
			class="ml-auto"
			variant="ghost"
			color="neutral"
			size="xs"
			icon="i-ph-arrow-counter-clockwise"
			@click="discard()"
		>
			{{ t('dms_mailing.editor.discard') }}
		</UButton>
	</div>
</template>

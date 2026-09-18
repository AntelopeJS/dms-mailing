<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

const { t } = useI18n()
const { editor } = useEditorContext()

const subject = computed({
	get: () => editor.current?.subject ?? '',
	set: (value: string) => editor.updateLocale({ subject: value }),
})

const preheader = computed({
	get: () => editor.current?.preheader ?? '',
	set: (value: string) => editor.updateLocale({ preheader: value }),
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
			{{ t('dms_mailing.editor.subject') }}
		</p>

		<UFormField
			:label="t('dms_mailing.editor.subject')"
			:help="t('dms_mailing.editor.subject_help')"
			size="xs"
		>
			<UInput v-model="subject" class="w-full" />
		</UFormField>

		<UFormField :label="t('dms_mailing.editor.preheader')" size="xs">
			<UInput v-model="preheader" class="w-full" />
		</UFormField>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

interface Props {
	fallback: string
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor } = useEditorContext()

const canDuplicate = computed(
	() =>
		props.fallback !== editor.locale &&
		Boolean(editor.content.locales[props.fallback]),
)
</script>

<template>
	<div class="bg-elevated/40 flex flex-1 items-center justify-center p-8">
		<div class="flex max-w-sm flex-col items-center gap-3 text-center">
			<UIcon name="i-ph-globe-hemisphere-west" class="text-muted size-10" />
			<h2 class="text-base font-semibold">
				{{
					t('dms_mailing.editor.missing_locale.title', {
						locale: editor.locale.toUpperCase(),
					})
				}}
			</h2>
			<p class="text-muted text-sm">
				{{
					t('dms_mailing.editor.missing_locale.hint', {
						locale: editor.locale.toUpperCase(),
						fallback: fallback.toUpperCase(),
					})
				}}
			</p>
			<div class="mt-1 flex items-center gap-2">
				<UButton
					v-if="canDuplicate"
					icon="i-ph-copy"
					@click="editor.createLocale(editor.locale, fallback)"
				>
					{{
						t('dms_mailing.editor.missing_locale.duplicate', {
							fallback: fallback.toUpperCase(),
						})
					}}
				</UButton>
				<UButton
					variant="ghost"
					color="neutral"
					@click="editor.createLocale(editor.locale)"
				>
					{{ t('dms_mailing.editor.missing_locale.blank') }}
				</UButton>
			</div>
		</div>
	</div>
</template>

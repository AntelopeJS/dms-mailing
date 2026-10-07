<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

const KEY = 'dms_mailing.editor.missing_locale'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const locale = computed(() => editor.locale.toUpperCase())
const fallback = computed(() => session.state.fallbackLocale)

const affected = computed(() =>
	(session.state.performance?.fallbacks ?? [])
		.filter((entry) => entry.requested === editor.locale)
		.reduce((sum, entry) => sum + entry.count, 0),
)

const canDuplicate = computed(
	() =>
		fallback.value !== editor.locale &&
		Boolean(editor.content.locales[fallback.value]),
)

const description = computed(() => {
	const params = {
		locale: locale.value,
		fallback: fallback.value.toUpperCase(),
		count: affected.value,
	}
	return affected.value > 0
		? t(`${KEY}.affected`, params, affected.value)
		: t(`${KEY}.hint`, params)
})

const actions = computed(() => [
	...(canDuplicate.value
		? [
				{
					label: t(`${KEY}.duplicate`, {
						fallback: fallback.value.toUpperCase(),
					}),
					icon: 'i-ph-copy',
					onClick: () => editor.createLocale(editor.locale, fallback.value),
				},
			]
		: []),
	{
		label: t(`${KEY}.blank`),
		color: 'neutral' as const,
		variant: canDuplicate.value ? ('ghost' as const) : ('solid' as const),
		onClick: () => editor.createLocale(editor.locale),
	},
])
</script>

<template>
	<div class="border-default bg-default shadow-xs mt-10 rounded-lg border">
		<DmsEmptyState
			icon="i-ph-globe-hemisphere-west"
			tone="warning"
			size="lg"
			:title="t(`${KEY}.title_short`, { locale })"
			:description="description"
			:actions="actions"
		/>
	</div>
</template>

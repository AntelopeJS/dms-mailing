<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { canPublish } from '../../utils/lifecycle'

const LIVE_STATUS = 'live'

const { t } = useI18n()
const { editor, session, actions } = useEditorContext()

const isPublishable = computed(() => {
	const { status } = session.state.template
	if (!canPublish(status)) return false
	if (status !== LIVE_STATUS) return true
	return session.state.changes.length > 0 || editor.dirty > 0
})
</script>

<template>
	<header
		class="border-default bg-default flex h-14 shrink-0 items-center gap-2.5 border-b px-3"
	>
		<MailingEditorTitle />
		<span class="border-default h-5 border-l" />
		<MailingEditorLocaleSwitch />
		<MailingEditorViewSwitches />

		<div class="ml-auto flex items-center gap-2">
			<MailingEditorSaveState />
			<span class="border-default h-5 border-l" />
			<UTooltip :text="t('dms_mailing.editor.toolbar.test_hint')" :kbds="['T']">
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-ph-flask"
					@click="actions.test()"
				>
					{{ t('dms_mailing.editor.toolbar.test') }}
				</UButton>
			</UTooltip>
			<UButton
				size="sm"
				icon="i-ph-rocket-launch"
				:disabled="!isPublishable"
				@click="actions.publish()"
			>
				{{ t('dms_mailing.editor.toolbar.publish') }}
				<span class="flex items-center gap-0.5 opacity-80">
					<UKbd value="meta" size="sm" color="primary" variant="solid" />
					<UKbd value="enter" size="sm" color="primary" variant="solid" />
				</span>
			</UButton>
		</div>
	</header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditorDevice } from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'

interface SegmentedItem {
	label: string
	value: string
	icon?: string
}

const TEMPLATES_PATH = '/modules/mailing/templates'
const LIVE_STATUS = 'live'
const MISSING_LOCALE_SUFFIX = ' ·'

const { t } = useI18n()
const { editor, template, name, save, publish, openTestSend } =
	useEditorContext()

const localeItems = computed<SegmentedItem[]>(() =>
	editor.locales.map((code) => ({
		value: code,
		label: editor.missingLocales.includes(code)
			? `${code.toUpperCase()}${MISSING_LOCALE_SUFFIX}`
			: code.toUpperCase(),
	})),
)

const deviceItems = computed<SegmentedItem[]>(() => [
	{
		value: 'desktop',
		label: t('dms_mailing.editor.desktop'),
		icon: 'i-ph-monitor',
	},
	{
		value: 'mobile',
		label: t('dms_mailing.editor.mobile'),
		icon: 'i-ph-device-mobile',
	},
])

const locale = computed({
	get: () => editor.locale,
	set: (code: string) => editor.setLocale(code),
})

const device = computed({
	get: () => editor.device,
	set: (value: string | number) => (editor.device = value as EditorDevice),
})

// The name is not edited here: the Template tab is the one place to rename,
// so the heading is a plain affordance that opens it.
function openTemplateSettings(): void {
	editor.railOpen = true
	editor.tab = 'template'
}
</script>

<template>
	<header
		class="border-default bg-default flex h-14 shrink-0 items-center gap-3 border-b px-4"
	>
		<UButton
			icon="i-ph-arrow-left"
			variant="ghost"
			color="neutral"
			:aria-label="t('dms_mailing.editor.back')"
			@click="navigateDms(TEMPLATES_PATH)"
		/>

		<button
			type="button"
			class="hover:bg-elevated min-w-0 rounded-md px-2 py-1 text-left transition-colors"
			:title="t('dms_mailing.editor.open_template_settings')"
			@click="openTemplateSettings()"
		>
			<p class="truncate text-sm font-semibold">{{ name }}</p>
			<p class="text-muted truncate font-mono text-[11px]">
				{{ template.slug }}
			</p>
		</button>

		<div class="ml-4 flex items-center gap-2">
			<DmsSegmented
				v-model="locale"
				:items="localeItems"
				size="xs"
				:aria-label="t('dms_mailing.editor.title')"
			/>
			<DmsSegmented
				v-model="device"
				:items="deviceItems"
				size="xs"
				:aria-label="t('dms_mailing.editor.desktop')"
			/>
			<UBadge
				:color="editor.previewMode ? 'primary' : 'neutral'"
				variant="subtle"
				size="sm"
				icon="i-ph-database"
			>
				{{
					editor.previewMode
						? t('dms_mailing.editor.preview_mode.data')
						: t('dms_mailing.editor.preview_mode.variables')
				}}
				<UButton
					v-if="editor.previewMode"
					icon="i-ph-x"
					size="xs"
					variant="ghost"
					color="neutral"
					class="-mr-1 p-0"
					:aria-label="t('dms_mailing.editor.preview_mode.back')"
					:title="t('dms_mailing.editor.preview_mode.back')"
					@click="editor.previewMode = false"
				/>
			</UBadge>
		</div>

		<div class="ml-auto flex items-center gap-2">
			<UButton
				icon="i-ph-sidebar-simple"
				variant="ghost"
				color="neutral"
				:aria-label="t('dms_mailing.editor.toggle_rail')"
				@click="editor.railOpen = !editor.railOpen"
			/>
			<UButton
				variant="outline"
				color="neutral"
				icon="i-ph-paper-plane-tilt"
				@click="openTestSend()"
			>
				{{ t('dms_mailing.editor.test_send') }}
			</UButton>
			<UButton
				v-if="template.status !== LIVE_STATUS"
				variant="outline"
				icon="i-ph-rocket-launch"
				@click="publish()"
			>
				{{ t('dms_mailing.editor.publish') }}
			</UButton>
			<UButton
				icon="i-ph-floppy-disk"
				:disabled="editor.dirty === 0"
				@click="save()"
			>
				{{ t('dms_mailing.editor.save') }}
			</UButton>
		</div>
	</header>
</template>

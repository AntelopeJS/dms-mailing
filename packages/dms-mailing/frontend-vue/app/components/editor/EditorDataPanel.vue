<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { parseTestData } from '../../utils/testData'

const SETTINGS_PERMISSION = 'mailing.settings.manage'
const TEXTAREA_ROWS = 12

const { t } = useI18n()
const toast = useToast()
const { hasPermission, refreshIfStale } = usePermissions()
const { editor, api, templateId, testData, preview } = useEditorContext()

const parsed = computed(() => parseTestData(testData.value))
const missing = computed(() => preview.value?.missing ?? [])
const canManageSettings = computed(() => hasPermission(SETTINGS_PERMISSION))

const blockOnMissing = ref(false)
const savingData = ref(false)

const help = computed(() => {
	if (!editor.previewMode) return t('dms_mailing.editor.data.help_off')
	return parsed.value
		? t('dms_mailing.editor.data.help_valid')
		: t('dms_mailing.editor.data.help_invalid')
})

async function loadSettings(): Promise<void> {
	await refreshIfStale()
	if (!canManageSettings.value) return
	const settings = await api.settings()
	blockOnMissing.value = Boolean(settings.blockOnMissingVariables)
}

async function toggleBlockOnMissing(value: boolean): Promise<void> {
	const settings = await api.settings()
	await api.saveSettings({ ...settings, blockOnMissingVariables: value })
	blockOnMissing.value = value
}

// The one action that owns the test-data state: it stores the set and puts the
// preview into data mode. Nothing else turns data mode on.
async function useDataSet(): Promise<void> {
	const data = parsed.value
	if (!data) return
	savingData.value = true
	try {
		await api.saveTestData(templateId, data)
		editor.previewMode = true
		toast.add({ title: t('dms_mailing.editor.data.saved'), color: 'success' })
	} finally {
		savingData.value = false
	}
}

onMounted(loadSettings)
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
			{{ t('dms_mailing.editor.data.title') }}
		</p>

		<UTextarea
			v-model="testData"
			class="w-full font-mono text-[11px]"
			:rows="TEXTAREA_ROWS"
		/>
		<p
			class="text-[11px]"
			:class="editor.previewMode && !parsed ? 'text-error' : 'text-muted'"
		>
			{{ help }}
		</p>

		<UButton
			size="xs"
			icon="i-ph-eye"
			class="self-start"
			:loading="savingData"
			:disabled="!parsed"
			@click="useDataSet()"
		>
			{{ t('dms_mailing.editor.data.use') }}
		</UButton>

		<USeparator />

		<section class="flex flex-col gap-2">
			<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">
				{{ t('dms_mailing.editor.data.controls') }}
			</p>

			<DmsBanner
				v-if="missing.length > 0"
				color="warning"
				icon="i-ph-warning"
				:title="
					t('dms_mailing.editor.data.uncovered', {
						count: missing.length,
						path: missing[0],
					})
				"
			>
				<template #description>
					<ul class="flex flex-col gap-0.5 font-mono text-[11px]">
						<li v-for="path in missing" :key="path">{{ path }}</li>
					</ul>
				</template>
			</DmsBanner>
			<p v-else class="text-muted text-[11px]">
				{{ t('dms_mailing.editor.data.covered') }}
			</p>

			<UFormField
				v-if="canManageSettings"
				:label="t('dms_mailing.editor.data.block_on_missing')"
				size="xs"
			>
				<USwitch
					:model-value="blockOnMissing"
					@update:model-value="toggleBlockOnMissing($event)"
				/>
			</UFormField>
		</section>
	</div>
</template>

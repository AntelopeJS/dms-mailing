<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'

const SETTINGS_PERMISSION = 'modules.mailing.settings'
const KEY = 'dms_mailing.editor.test_data'

const { t } = useI18n()
const { hasPermission, refreshIfStale } = usePermissions()
const { api, session } = useEditorContext()

const isBlocking = ref(false)
const isLoaded = ref(false)
const canManage = computed(() => hasPermission(SETTINGS_PERMISSION))

async function load(): Promise<void> {
	await refreshIfStale()
	if (!canManage.value) return
	const settings = await api.settings().catch(() => null)
	isBlocking.value = Boolean(settings?.blockOnMissingVariables)
	isLoaded.value = Boolean(settings)
}

async function toggle(value: boolean): Promise<void> {
	try {
		await api.saveSettings({ blockOnMissingVariables: value })
		isBlocking.value = value
	} catch (error) {
		session.reportError(error)
	}
}

onMounted(load)
</script>

<template>
	<USwitch
		v-if="isLoaded"
		:model-value="isBlocking"
		:label="t(`${KEY}.block_on_missing`)"
		:description="t(`${KEY}.block_on_missing_help`)"
		@update:model-value="toggle"
	/>
</template>

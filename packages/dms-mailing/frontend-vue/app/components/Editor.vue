<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { TemplateContentResponse } from '../types/mailing'
import { useMailingApi } from '../composables/useMailingApi'

const { t } = useI18n()
const route = useDmsRoute()
const api = useMailingApi()

const templateId = computed(() => String(route.query.id ?? ''))
const requestedLocale = computed(() =>
	route.query.locale ? String(route.query.locale) : null,
)

const loaded = ref<TemplateContentResponse | null>(null)
const loading = ref(true)
const failed = ref(false)

async function load(): Promise<void> {
	loading.value = true
	failed.value = false
	try {
		loaded.value = await api.templateContent(templateId.value)
	} catch {
		failed.value = true
	} finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<div
			v-if="loading"
			class="text-muted flex flex-1 items-center justify-center gap-2 text-sm"
		>
			<UIcon name="i-ph-circle-notch" class="size-4 animate-spin" />
			{{ t('dms_mailing.editor.loading') }}
		</div>

		<div
			v-else-if="failed || !loaded"
			class="flex flex-1 flex-col items-center justify-center gap-3"
		>
			<UIcon name="i-ph-warning-circle" class="text-error size-8" />
			<p class="text-muted text-sm">{{ t('dms_mailing.editor.load_error') }}</p>
			<UButton variant="outline" icon="i-ph-arrow-clockwise" @click="load()">
				{{ t('dms_mailing.editor.back') }}
			</UButton>
		</div>

		<DmsMailingEditorWorkspace
			v-else
			:key="templateId"
			:loaded="loaded"
			:template-id="templateId"
			:requested-locale="requestedLocale"
		/>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { PreviewResponse, TemplateContent } from '../../types/mailing'
import { useMailingApi } from '../../composables/useMailingApi'

interface Props {
	templateId: string
	locale: string
	content: TemplateContent
	data?: Record<string, unknown>
}

interface ComparedSide {
	id: string
	label: string
	preview: PreviewResponse | null
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.compare'
const FRAME_HEIGHT = 'h-[60vh]'

const { t } = useI18n()
const api = useMailingApi()

const sides = ref<ComparedSide[]>([
	{ id: 'published', label: t(`${KEY}.live`), preview: null },
	{ id: 'draft', label: t(`${KEY}.draft`), preview: null },
])
const failed = ref(false)

async function load(): Promise<void> {
	const base = { locale: props.locale, data: props.data }
	try {
		const [published, draft] = await Promise.all([
			api.preview(props.templateId, { ...base, version: 'published' }),
			api.preview(props.templateId, { ...base, content: props.content }),
		])
		sides.value = [
			{ ...sides.value[0]!, preview: published },
			{ ...sides.value[1]!, preview: draft },
		]
	} catch {
		failed.value = true
	}
}

onMounted(load)
</script>

<template>
	<DmsEmptyState
		v-if="failed"
		variant="error"
		size="sm"
		:title="t(`${KEY}.error`)"
	/>
	<div v-else class="grid gap-4 md:grid-cols-2">
		<section
			v-for="side in sides"
			:key="side.id"
			class="flex min-w-0 flex-col gap-2"
		>
			<div class="flex items-center gap-2">
				<DmsEyebrow :label="side.label" />
				<span v-if="side.preview" class="text-muted min-w-0 truncate text-xs">
					{{ side.preview.subject }}
				</span>
			</div>
			<iframe
				v-if="side.preview"
				:srcdoc="side.preview.html"
				sandbox=""
				:title="side.label"
				class="border-default w-full rounded-md border bg-white"
				:class="FRAME_HEIGHT"
			/>
			<USkeleton v-else class="w-full rounded-md" :class="FRAME_HEIGHT" />
		</section>
	</div>
</template>

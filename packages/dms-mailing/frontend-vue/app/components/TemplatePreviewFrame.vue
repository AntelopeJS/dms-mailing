<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { PreviewResponse, TemplateContent } from '../types/mailing'

interface TemplatePreviewFrameProps {
	templateId: string
	/** Absent renders the tenant fallback locale, chosen server-side. */
	locale?: string
	content?: TemplateContent
	data?: Record<string, unknown>
	width: number
	scale?: number
	refreshKey?: number
}

const DEBOUNCE_MS = 300
const FALLBACK_HEIGHT = 480

const props = withDefaults(defineProps<TemplatePreviewFrameProps>(), {
	locale: undefined,
	content: undefined,
	data: undefined,
	scale: 1,
	refreshKey: 0,
})

const emit = defineEmits<{ resolved: [PreviewResponse] }>()

const api = useMailingApi()

const html = ref('')
const loading = ref(false)
const height = ref(FALLBACK_HEIGHT)
const frame = ref<HTMLIFrameElement | null>(null)

async function load(): Promise<void> {
	if (!props.templateId) return
	loading.value = true
	try {
		const preview = await api.preview(props.templateId, {
			locale: props.locale,
			content: props.content,
			data: props.data,
		})
		html.value = preview.html
		emit('resolved', preview)
	} catch {
		html.value = ''
	} finally {
		loading.value = false
	}
}

const reload = useDebounceFn(load, DEBOUNCE_MS)

// srcdoc keeps the frame same-origin, so allow-same-origin is what lets the
// height be measured; scripts stay blocked.
function measure(): void {
	const body = frame.value?.contentDocument?.body
	height.value = body?.scrollHeight || FALLBACK_HEIGHT
}

watch(
	() => [
		props.templateId,
		props.locale,
		props.content,
		props.data,
		props.refreshKey,
	],
	() => reload(),
	{ immediate: true, deep: true },
)

const boxStyle = computed(() => ({
	width: `${props.width * props.scale}px`,
	height: `${height.value * props.scale}px`,
}))

const frameStyle = computed(() => ({
	width: `${props.width}px`,
	height: `${height.value}px`,
	transform: `scale(${props.scale})`,
	transformOrigin: 'top left',
}))
</script>

<template>
	<div class="relative overflow-hidden" :style="boxStyle">
		<USkeleton v-if="loading && !html" class="absolute inset-0 size-full" />
		<iframe
			v-show="html"
			ref="frame"
			:srcdoc="html"
			sandbox="allow-same-origin"
			loading="lazy"
			title="preview"
			class="block border-0 bg-white"
			:style="frameStyle"
			@load="measure"
		/>
	</div>
</template>

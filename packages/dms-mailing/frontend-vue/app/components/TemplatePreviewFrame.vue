<script setup lang="ts">
import { useDebounceFn, useIntersectionObserver } from '@vueuse/core'
import { useMailingApi } from '../composables/useMailingApi'
import type {
	PreviewResponse,
	PreviewVersion,
	TemplateContent,
} from '../types/mailing'

interface TemplatePreviewFrameProps {
	/** The template to render; ignored when `html` or `starterId` is given. */
	templateId?: string
	/** A starter to render, through its own preview endpoint. */
	starterId?: string
	/** Ready-made HTML: nothing is fetched. */
	html?: string
	/** Absent renders the tenant fallback locale, chosen server-side. */
	locale?: string
	/** Which saved content to render when `content` is absent. */
	version?: PreviewVersion
	content?: TemplateContent
	data?: Record<string, unknown>
	width: number
	scale?: number
	refreshKey?: number
	/** Fetches only once the frame scrolls into view (galleries). */
	lazy?: boolean
	/** Accessible name of the frame. */
	label?: string
}

const DEBOUNCE_MS = 300
const FALLBACK_HEIGHT = 480

const props = withDefaults(defineProps<TemplatePreviewFrameProps>(), {
	templateId: undefined,
	starterId: undefined,
	html: undefined,
	locale: undefined,
	version: undefined,
	content: undefined,
	data: undefined,
	scale: 1,
	refreshKey: 0,
	lazy: false,
	label: undefined,
})

const emit = defineEmits<{ resolved: [PreviewResponse] }>()

const api = useMailingApi()

const fetchedHtml = ref('')
const loading = ref(false)
const height = ref(FALLBACK_HEIGHT)
const frame = ref<HTMLIFrameElement | null>(null)
const box = ref<HTMLElement | null>(null)
const isVisible = ref(!props.lazy)

const shownHtml = computed(() => props.html ?? fetchedHtml.value)

useIntersectionObserver(box, ([entry]) => {
	if (entry?.isIntersecting) isVisible.value = true
})

async function fetchStarter(starterId: string): Promise<void> {
	const preview = await api.starterPreview(starterId)
	fetchedHtml.value = preview.html
}

async function fetchTemplate(templateId: string): Promise<void> {
	const preview = await api.preview(templateId, {
		locale: props.locale,
		version: props.content ? undefined : props.version,
		content: props.content,
		data: props.data,
	})
	fetchedHtml.value = preview.html
	emit('resolved', preview)
}

async function load(): Promise<void> {
	if (props.html !== undefined || !isVisible.value) return
	if (!props.starterId && !props.templateId) return
	loading.value = true
	try {
		await (props.starterId
			? fetchStarter(props.starterId)
			: fetchTemplate(props.templateId as string))
	} catch {
		fetchedHtml.value = ''
	} finally {
		loading.value = false
	}
}

const reload = useDebounceFn(load, DEBOUNCE_MS)

function measure(): void {
	const body = frame.value?.contentDocument?.body
	height.value = body?.scrollHeight || FALLBACK_HEIGHT
}

watch(
	() => [
		props.templateId,
		props.starterId,
		props.locale,
		props.version,
		props.content,
		props.data,
		props.refreshKey,
		isVisible.value,
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
	<div ref="box" class="relative overflow-hidden" :style="boxStyle">
		<USkeleton
			v-if="!shownHtml && (loading || !isVisible)"
			class="absolute inset-0 size-full"
		/>
		<iframe
			v-show="shownHtml"
			ref="frame"
			:srcdoc="shownHtml"
			sandbox="allow-same-origin"
			loading="lazy"
			tabindex="-1"
			:title="label ?? 'preview'"
			class="block border-0 bg-white"
			:style="frameStyle"
			@load="measure"
		/>
	</div>
</template>

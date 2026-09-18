<script setup lang="ts">
interface HtmlPreviewModalProps {
	html: string
	height?: number
}

const DEFAULT_HEIGHT = 620

withDefaults(defineProps<HtmlPreviewModalProps>(), { height: DEFAULT_HEIGHT })
</script>

<template>
	<iframe
		:srcdoc="html"
		sandbox="allow-same-origin"
		title="preview"
		class="block w-full border-0 bg-white"
		:style="{ height: `${height}px` }"
	/>
</template>

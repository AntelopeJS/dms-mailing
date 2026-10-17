<script setup lang="ts">
import { useLocalizedDefaults } from '../composables/useLocalizedDefaults'

interface TemplateNameProps {
	/** A template's stored name: a declared `$` i18n key, or text. */
	value?: string | null
}

const props = withDefaults(defineProps<TemplateNameProps>(), {
	value: null,
})

const localized = useLocalizedDefaults()
const name = computed(() => localized.name(props.value ?? ''))
</script>

<template>
	<span class="truncate" :title="name">{{ name }}</span>
</template>

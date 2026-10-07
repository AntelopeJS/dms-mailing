<script setup lang="ts">
import { onMounted, watch } from 'vue'
import type { TemplateContentResponse } from '../../types/mailing'
import { useMailingApi } from '../../composables/useMailingApi'
import { provideEditorContext } from '../../composables/useEditorContext'
import { useEditorActions } from '../../composables/useEditorActions'
import { useEditorSession } from '../../composables/useEditorSession'
import {
	useEditorLeaveGuard,
	useEditorShortcuts,
} from '../../composables/useEditorShortcuts'
import { createEditorState } from '../../composables/useTemplateEditor'

interface Props {
	loaded: TemplateContentResponse
	templateId: string
	reload: () => Promise<void>
}

interface ApiFailure {
	data?: { message?: string }
}

const props = defineProps<Props>()
const locale = defineModel<string | null>('locale', { default: null })
const emit = defineEmits<{ renamed: [string] }>()

const toast = useToast()
const { processApiMessage } = useTranslation()
const { uniqueLocales } = useUniqueLocales()
const api = useMailingApi()

const localeCodes = [
	...new Set([
		...uniqueLocales.value.map((entry) => entry.code),
		...Object.keys(props.loaded.content.locales ?? {}),
	]),
]

const editor = createEditorState(
	props.loaded.content,
	locale.value ?? props.loaded.fallbackLocale,
	localeCodes,
)

function reportFailure(error: unknown): void {
	toast.add({
		color: 'error',
		title: processApiMessage((error as ApiFailure)?.data?.message ?? error),
	})
}

const session = useEditorSession({
	editor,
	api,
	templateId: props.templateId,
	loaded: props.loaded,
	onError: reportFailure,
})

const actions = useEditorActions({
	editor,
	session,
	api,
	templateId: props.templateId,
	reload: props.reload,
	onError: reportFailure,
})

provideEditorContext({
	editor,
	session,
	actions,
	api,
	templateId: props.templateId,
})

useEditorShortcuts(editor, actions)
useEditorLeaveGuard(session)

watch(
	() => editor.locale,
	(code) => (locale.value = code),
)
watch(
	() => session.state.template.name,
	(name) => emit('renamed', name),
)

onMounted(() => void session.loadPerformance())
</script>

<template>
	<div class="bg-default flex h-full min-h-0 flex-1 flex-col">
		<MailingEditorToolbar />
		<MailingEditorNotice v-if="session.notice" :notice="session.notice" />
		<div class="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)_310px]">
			<MailingEditorLeftPane />
			<MailingEditorCanvas />
			<MailingEditorInspector />
		</div>
	</div>
</template>

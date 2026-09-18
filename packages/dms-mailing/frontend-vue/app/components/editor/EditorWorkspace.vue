<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type {
	PreviewResponse,
	TemplateContentResponse,
	TemplateRow,
	TemplateStatus,
	VariableDefinition,
} from '../../types/mailing'
import { provideEditorContext } from '../../composables/useEditorContext'
import { useMailingApi } from '../../composables/useMailingApi'
import { createEditorState } from '../../composables/useTemplateEditor'
import { deepClone } from '../../utils/clone'

interface Props {
	loaded: TemplateContentResponse
	templateId: string
	requestedLocale: string | null
}

const props = defineProps<Props>()

const { t } = useI18n()
const toast = useToast()
const { processApiMessage } = useTranslation()
const { confirm } = useConfirm()
const { uniqueLocales } = useUniqueLocales()
const { registerGuard } = usePageLeaveGuard()
const api = useMailingApi()

const localeCodes = computed(() =>
	uniqueLocales.value.map((locale) => locale.code),
)

const editor = createEditorState(
	props.loaded.content,
	props.requestedLocale ?? props.loaded.fallbackLocale,
	localeCodes.value,
)

const template = ref<TemplateRow>(props.loaded.template)
const name = ref(props.loaded.template.name)
const category = ref(props.loaded.template.category ?? '')
const variables = ref<VariableDefinition[]>(props.loaded.variables ?? [])
const detectedVariables = ref<string[]>(props.loaded.detectedVariables ?? [])
const testData = ref(JSON.stringify(props.loaded.testData ?? {}, null, 2))
const preview = ref<PreviewResponse | null>(null)
const simulation = reactive<Record<string, boolean>>({})
const savedContent = ref(deepClone(props.loaded.content))
const testSendOpen = ref(false)

registerGuard(
	() =>
		editor.dirty === 0 ||
		confirm({
			title: t('dms_mailing.editor.leave_guard'),
			description: t('dms_mailing.editor.unsaved', { count: editor.dirty }),
			confirmColor: 'error',
		}),
)

// The slug travels unchanged: `edit` replaces the writable fields, so omitting
// it would null it.
async function saveDetails(): Promise<void> {
	const trimmed = name.value.trim() || template.value.name
	const next = {
		name: trimmed,
		slug: template.value.slug,
		category: category.value || undefined,
	}
	if (
		next.name === template.value.name &&
		next.category === (template.value.category || undefined)
	) {
		return
	}
	await api.saveTemplateDetails(props.templateId, next)
	template.value = { ...template.value, ...next }
	name.value = trimmed
}

/**
 * Surfaces a rejected call. Save and the status actions used to discard their
 * promise at the click handler, so a duplicate slug, a 403 or a dropped
 * connection left the author with no toast at all — and an editor that still
 * looked saved.
 */
function reportFailure(error: unknown): void {
	toast.add({
		color: 'error',
		title: processApiMessage(
			(error as { data?: { message?: string } }).data?.message ?? error,
		),
	})
}

async function save(): Promise<void> {
	try {
		await saveDetails()
		const { detectedVariables: detected } = await api.saveContent(
			props.templateId,
			deepClone(editor.content),
		)
		detectedVariables.value = detected ?? detectedVariables.value
		savedContent.value = deepClone(editor.content)
		editor.markSaved()
		toast.add({ title: t('dms_mailing.editor.saved'), color: 'success' })
	} catch (error) {
		reportFailure(error)
	}
}

type StatusAction = 'publish' | 'unpublish' | 'archive'

async function runStatusAction(action: StatusAction): Promise<void> {
	const calls = {
		publish: api.publish,
		unpublish: api.unpublish,
		archive: api.archive,
	}
	try {
		const { status } = await calls[action](props.templateId)
		template.value = { ...template.value, status: status as TemplateStatus }
		toast.add({
			title: t(`dms_mailing.templates.actions.${action}`),
			color: 'success',
		})
	} catch (error) {
		reportFailure(error)
	}
}

function publish(): Promise<void> {
	return runStatusAction('publish')
}

async function discard(): Promise<void> {
	const confirmed = await confirm({
		title: t('dms_mailing.editor.discard_title'),
		description: t('dms_mailing.editor.discard_description'),
		confirmColor: 'error',
	})
	if (!confirmed) return
	editor.reset(savedContent.value)
}

provideEditorContext({
	editor,
	api,
	templateId: props.templateId,
	template,
	variables,
	detectedVariables,
	name,
	category,
	runStatusAction,
	testData,
	preview,
	simulation,
	save,
	publish,
	discard,
	openTestSend: () => (testSendOpen.value = true),
})
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<DmsMailingEditorToolbar />
		<DmsMailingEditorDraftBar v-if="editor.dirty > 0" />

		<div class="flex min-h-0 flex-1">
			<DmsMailingEditorMissingLocale
				v-if="!editor.current"
				:fallback="loaded.fallbackLocale"
			/>
			<DmsMailingEditorCanvas v-else />

			<aside
				v-if="editor.railOpen"
				class="border-default bg-default flex w-[340px] shrink-0 flex-col overflow-y-auto border-l"
			>
				<DmsMailingEditorRail />
			</aside>
		</div>

		<DmsMailingEditorTestSendModal v-model:open="testSendOpen" />
	</div>
</template>

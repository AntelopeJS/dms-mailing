import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import type {
	TemplateCategory,
	TemplateChange,
	TemplateContent,
	TemplateContentResponse,
	TemplatePerformance,
	TemplateRow,
	VariableDefinition,
} from '../types/mailing'
import type { MailingApi, TemplateDetails } from './useMailingApi'
import type { EditorState } from './useTemplateEditor'
import type { TokenFieldHandle } from './useEditorContext'
import { deepClone } from '../utils/clone'
import { collectContentPaths } from '../utils/paths'
import { parseTestData } from '../utils/testData'
import { noticeFor } from '../utils/lifecycle'

/** The draft is written this long after the last change. */
export const AUTOSAVE_DELAY_MS = 1500

const JSON_INDENT = 2

export type SaveStatus = 'idle' | 'saving' | 'error'

/** Everything the editor knows about the template besides its content. */
export interface SessionState {
	template: TemplateRow
	version: number
	publishedContent: TemplateContent | null
	changes: TemplateChange[]
	variables: VariableDefinition[]
	serverDetected: string[]
	testDataSource: string
	savedTestDataSource: string
	categories: TemplateCategory[]
	fallbackLocale: string
	performance: TemplatePerformance | null
	saveStatus: SaveStatus
	activeField: TokenFieldHandle | null
}

export interface SessionDeps {
	editor: EditorState
	api: MailingApi
	templateId: string
	loaded: TemplateContentResponse
	onError: (error: unknown) => void
}

function createState(loaded: TemplateContentResponse): SessionState {
	const testData = JSON.stringify(loaded.testData ?? {}, null, JSON_INDENT)
	return reactive({
		template: { ...loaded.template },
		version: loaded.version ?? 0,
		publishedContent: loaded.publishedContent ?? null,
		changes: loaded.changes ?? [],
		variables: loaded.variables ?? [],
		serverDetected: loaded.detectedVariables ?? [],
		testDataSource: testData,
		savedTestDataSource: testData,
		categories: loaded.categories ?? [],
		fallbackLocale: loaded.fallbackLocale,
		performance: null,
		saveStatus: 'idle',
		activeField: null,
	}) as SessionState
}

function createViews(state: SessionState, editor: EditorState) {
	return {
		detected: computed(() => [
			...new Set([
				...state.serverDetected,
				...collectContentPaths(editor.content),
			]),
		]),
		testData: computed(() => parseTestData(state.testDataSource)),
		isTestDataDirty: computed(
			() => state.testDataSource !== state.savedTestDataSource,
		),
		isSaving: computed(() => state.saveStatus === 'saving' || editor.dirty > 0),
		notice: computed(() =>
			noticeFor({
				status: state.template.status,
				version: state.version,
				changeCount: state.changes.length,
			}),
		),
	}
}

function createSaver(
	{ editor, api, templateId, onError }: SessionDeps,
	state: SessionState,
) {
	let timer: ReturnType<typeof setTimeout> | null = null
	let inFlight: Promise<boolean> | null = null
	const cancel = (): void => {
		if (timer) clearTimeout(timer)
		timer = null
	}
	async function write(): Promise<boolean> {
		const revision = editor.revision
		state.saveStatus = 'saving'
		try {
			const response = await api.saveContent(
				templateId,
				deepClone(editor.content),
			)
			state.changes = response.changes ?? state.changes
			state.serverDetected = response.detectedVariables ?? state.serverDetected
			editor.markSaved(revision)
			state.saveStatus = 'idle'
			return true
		} catch (error) {
			state.saveStatus = 'error'
			onError(error)
			return false
		}
	}
	async function save(): Promise<boolean> {
		cancel()
		if (inFlight) await inFlight
		if (editor.dirty === 0) return state.saveStatus !== 'error'
		inFlight = write()
		const isSaved = await inFlight
		inFlight = null
		if (isSaved && editor.dirty > 0) schedule()
		return isSaved
	}
	function schedule(): void {
		cancel()
		timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
	}
	watch(
		() => editor.revision,
		() => (editor.dirty > 0 ? schedule() : undefined),
	)
	onBeforeUnmount(() => {
		if (editor.dirty > 0) void save()
		cancel()
	})
	return { save, cancel, settle: () => inFlight ?? Promise.resolve(true) }
}

function createRecordActions(
	{ api, templateId }: SessionDeps,
	state: SessionState,
) {
	return {
		async saveDetails(patch: Partial<TemplateDetails>): Promise<void> {
			const details: TemplateDetails = {
				name: state.template.name,
				slug: state.template.slug,
				category: state.template.category || null,
				...patch,
			}
			await api.saveTemplateDetails(templateId, details)
			state.template = { ...state.template, ...details }
		},
		async saveVariables(variables: VariableDefinition[]): Promise<void> {
			const response = await api.saveVariables(templateId, variables)
			state.variables = response.variables ?? variables
		},
		async saveTestData(): Promise<boolean> {
			const data = parseTestData(state.testDataSource)
			if (!data) return false
			await api.saveTestData(templateId, data)
			state.savedTestDataSource = state.testDataSource
			return true
		},
		resetTestData(): void {
			state.testDataSource = state.savedTestDataSource
		},
		async loadPerformance(): Promise<void> {
			state.performance = await api.performance(templateId).catch(() => null)
		},
	}
}

/**
 * The editor's link to the server: the template record, autosave of the
 * draft, variables, test data and performance. Publishing, discarding and the
 * dialogs live in `useEditorActions`.
 */
export function useEditorSession(deps: SessionDeps) {
	const state = createState(deps.loaded)
	return reactive({
		state,
		reportError: deps.onError,
		...createViews(state, deps.editor),
		...createSaver(deps, state),
		...createRecordActions(deps, state),
	})
}

export type EditorSession = ReturnType<typeof useEditorSession>

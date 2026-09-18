import { inject, provide } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import type {
	PreviewResponse,
	TemplateRow,
	VariableDefinition,
} from '../types/mailing'
import type { MailingApi } from './useMailingApi'
import type { EditorState } from './useTemplateEditor'

export interface EditorContext {
	editor: EditorState
	api: MailingApi
	templateId: string
	template: Ref<TemplateRow>
	variables: Ref<VariableDefinition[]>
	detectedVariables: Ref<string[]>
	name: Ref<string>
	category: Ref<string>
	runStatusAction: (
		action: 'publish' | 'unpublish' | 'archive',
	) => Promise<void>
	testData: Ref<string>
	preview: Ref<PreviewResponse | null>
	simulation: Record<string, boolean>
	save: () => Promise<void>
	publish: () => Promise<void>
	discard: () => Promise<void>
	openTestSend: () => void
}

const EDITOR_KEY: InjectionKey<EditorContext> = Symbol('dms-mailing-editor')
const MISSING_CONTEXT =
	'useEditorContext() must be called inside DmsMailingEditor'

export function provideEditorContext(context: EditorContext): void {
	provide(EDITOR_KEY, context)
}

export function useEditorContext(): EditorContext {
	const context = inject(EDITOR_KEY, null)
	if (!context) throw new Error(MISSING_CONTEXT)
	return context
}

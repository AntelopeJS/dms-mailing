import { onBeforeUnmount, onMounted } from 'vue'
import type { EditorActions } from './useEditorActions'
import type { EditorSession } from './useEditorSession'
import type { EditorState } from './useTemplateEditor'
import type { EditorShortcut } from '../utils/shortcuts'
import { isTypingTarget, matchShortcut } from '../utils/shortcuts'
import { TEMPLATES_PATH } from '../utils/editor-route'

const OPEN_DIALOG_SELECTOR =
	'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

type ShortcutHandlers = Record<EditorShortcut, () => void>

function handlersFor(
	editor: EditorState,
	actions: EditorActions,
): ShortcutHandlers {
	const withSelection = (run: (id: string) => void) => () => {
		if (editor.selectedId) run(editor.selectedId)
	}
	return {
		save: () => void actions.save(),
		publish: () => void actions.publish(),
		test: actions.test,
		search: editor.requestSearch,
		delete: withSelection(editor.removeBlockById),
		duplicate: withSelection(editor.duplicateBlockById),
		undo: editor.undo,
		redo: editor.redo,
		escape: () =>
			editor.selectedId
				? editor.select(null)
				: void navigateDms(TEMPLATES_PATH),
	}
}

/**
 * The editor's keyboard (ML-08): ⌘S, ⌘↵, T, /, ⌫, ⌘D, ⌘Z, Esc. Nothing fires
 * while a dialog is open, and single keys leave text fields alone.
 */
export function useEditorShortcuts(
	editor: EditorState,
	actions: EditorActions,
): void {
	const handlers = handlersFor(editor, actions)
	function onKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || document.querySelector(OPEN_DIALOG_SELECTOR))
			return
		const shortcut = matchShortcut(event, isTypingTarget(event.target))
		if (!shortcut) return
		event.preventDefault()
		handlers[shortcut]()
	}
	onMounted(() => window.addEventListener('keydown', onKeydown))
	onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}

/**
 * Leaving the page with a draft not yet written saves it first; only a failed
 * save asks before leaving.
 */
export function useEditorLeaveGuard(session: EditorSession): void {
	if (typeof usePageLeaveGuard !== 'function') return
	const { t } = useI18n()
	const { confirm } = useConfirm()
	const { registerGuard } = usePageLeaveGuard()
	registerGuard(async () => {
		if (!session.isSaving) return true
		if (await session.save()) return true
		return confirm({
			title: t('dms_mailing.editor.leave_guard'),
			description: t('dms_mailing.editor.save_state.leave_failed'),
			color: 'error',
		})
	})
}

import type { Component } from 'vue'
import type { MailingApi } from './useMailingApi'
import type { EditorSession } from './useEditorSession'
import type { EditorState } from './useTemplateEditor'
import { useTemplateDrawer } from './useTemplateDrawer'
import type { TemplateOverlays } from './useTemplateDrawer'
import { describeChanges } from '../utils/changes'
import { deepClone } from '../utils/clone'
import { publishChecks } from '../utils/editor-checks'
import type { LifecycleAction } from '../utils/lifecycle'
import { canPublish } from '../utils/lifecycle'

const PUBLISH_REVIEW_COMPONENT = 'MailingEditorPublishReview'
const COMPARE_COMPONENT = 'MailingEditorCompare'
const PUBLISH_ICON = 'i-ph-rocket-launch'
const DISCARD_ICON = 'i-ph-arrow-counter-clockwise'
const COMPARE_ICON = 'i-ph-columns'
const REVIEW_SIZE = 'lg'
const COMPARE_SIZE = 'full'
const KEY = 'dms_mailing.editor'

/** What the publish review resolves with, from its footer buttons. */
export type PublishReviewChoice = 'publish' | 'test' | 'keep'

export interface ActionDeps {
	editor: EditorState
	session: EditorSession
	api: MailingApi
	templateId: string
	reload: () => Promise<void>
	onError: (error: unknown) => void
}

interface ActionTools {
	t: ReturnType<typeof useI18n>['t']
	toast: ReturnType<typeof useToast>
	modal: ReturnType<typeof useModal>
	confirm: ReturnType<typeof useConfirm>['confirm']
}

function createTestAction(
	{ editor, session, templateId }: ActionDeps,
	openTestSend: TemplateOverlays['openTestSend'],
) {
	return (): void =>
		openTestSend(templateId, {
			locale: editor.locale,
			content: deepClone(editor.content),
			data: session.testData ?? undefined,
		})
}

function publishTitle(deps: ActionDeps, tools: ActionTools): string {
	const { state } = deps.session
	const name = state.template.name
	if (state.version === 0)
		return tools.t(`${KEY}.publish_review.title_first`, { name })
	const count = state.changes.length
	return tools.t(`${KEY}.publish_review.title`, { count, name }, count)
}

function publishDescription(deps: ActionDeps, tools: ActionTools): string {
	const { state } = deps.session
	const params = {
		slug: state.template.slug,
		next: state.version + 1,
		version: state.version,
	}
	return state.version === 0
		? tools.t(`${KEY}.publish_review.description_first`, params)
		: tools.t(`${KEY}.publish_review.description`, params)
}

function reviewOptions(deps: ActionDeps, tools: ActionTools) {
	const { state } = deps.session
	const translate = (key: string, params?: Record<string, string>) =>
		tools.t(key, params ?? {})
	const checks = publishChecks({
		variables: state.variables,
		detected: deps.session.detected,
		data: deps.session.testData ?? {},
		blocks: [],
	})
	return {
		lines: describeChanges(
			state.changes,
			{ draft: deps.editor.content, published: state.publishedContent },
			translate,
		),
		warnings: checks.map((entry) => tools.t(entry.key, entry.params)),
		nextVersion: state.version + 1,
		currentVersion: state.version,
	}
}

async function runPublish(deps: ActionDeps, tools: ActionTools): Promise<void> {
	try {
		const { version } = await deps.api.publish(deps.templateId)
		tools.toast.add({
			color: 'success',
			title: tools.t(`${KEY}.publish_review.done`, { version }),
		})
		await deps.reload()
	} catch (error) {
		deps.onError(error)
	}
}

async function refreshChanges(deps: ActionDeps): Promise<void> {
	const response = await deps.api.changes(deps.templateId).catch(() => null)
	if (response) deps.session.state.changes = response.changes
}

function createPublishAction(
	deps: ActionDeps,
	tools: ActionTools,
	test: () => void,
) {
	const component = resolveComponent(PUBLISH_REVIEW_COMPONENT) as Component
	return async (): Promise<void> => {
		if (!canPublish(deps.session.state.template.status)) return
		if (!(await deps.session.save())) return
		await refreshChanges(deps)
		const choice = await tools.modal.open<PublishReviewChoice>({
			title: publishTitle(deps, tools),
			description: publishDescription(deps, tools),
			icon: PUBLISH_ICON,
			component,
			componentOptions: reviewOptions(deps, tools),
			size: REVIEW_SIZE,
		}).result
		const handlers: Record<PublishReviewChoice, () => unknown> = {
			publish: () => runPublish(deps, tools),
			test,
			keep: () => undefined,
		}
		if (choice) await handlers[choice]()
	}
}

function createDiscardAction(deps: ActionDeps, tools: ActionTools) {
	return async (): Promise<void> => {
		const { state } = deps.session
		const count = state.changes.length
		deps.session.cancel()
		await deps.session.settle()
		const confirmed = await tools.confirm({
			title: tools.t(`${KEY}.discard_dialog.title`),
			description: tools.t(
				`${KEY}.discard_dialog.description`,
				{ count, version: state.version },
				count,
			),
			color: 'error',
			icon: DISCARD_ICON,
			confirmLabel: tools.t(`${KEY}.discard_dialog.confirm`, { count }, count),
			cancelLabel: tools.t(`${KEY}.discard_dialog.cancel`),
			onConfirm: async () => {
				await deps.api.discard(deps.templateId)
			},
		})
		if (!confirmed) return void deps.session.save()
		deps.editor.markSaved()
		await deps.reload()
	}
}

function createCompareAction(deps: ActionDeps, tools: ActionTools) {
	const component = resolveComponent(COMPARE_COMPONENT) as Component
	return (): void =>
		void tools.modal.open({
			title: tools.t(`${KEY}.compare.title`),
			description: tools.t(`${KEY}.compare.description`, {
				version: deps.session.state.version,
			}),
			icon: COMPARE_ICON,
			component,
			componentOptions: {
				templateId: deps.templateId,
				locale: deps.editor.locale,
				content: deepClone(deps.editor.content),
				data: deps.session.testData ?? undefined,
			},
			size: COMPARE_SIZE,
		})
}

const LIFECYCLE_ICONS: Record<LifecycleAction, string> = {
	unpublish: 'i-ph-eye-slash',
	archive: 'i-ph-archive',
	restore: 'i-ph-arrow-u-up-left',
}
const CONFIRMED_LIFECYCLE: LifecycleAction[] = ['unpublish', 'archive']

async function confirmLifecycle(
	action: LifecycleAction,
	deps: ActionDeps,
	tools: ActionTools,
): Promise<boolean> {
	if (!CONFIRMED_LIFECYCLE.includes(action)) return true
	const slug = deps.session.state.template.slug
	return tools.confirm({
		title: tools.t(`${KEY}.lifecycle.${action}_title`),
		description: tools.t(`${KEY}.lifecycle.refuse_warning`, { slug }),
		color: 'warning',
		icon: LIFECYCLE_ICONS[action],
		confirmLabel: tools.t(`${KEY}.lifecycle.${action}`),
	})
}

function createLifecycleAction(deps: ActionDeps, tools: ActionTools) {
	const calls = {
		unpublish: deps.api.unpublish,
		archive: deps.api.archive,
		restore: deps.api.restore,
	}
	return async (action: LifecycleAction): Promise<void> => {
		if (!(await confirmLifecycle(action, deps, tools))) return
		try {
			const { status } = await calls[action](deps.templateId)
			const { state } = deps.session
			state.template = {
				...state.template,
				status: status as typeof state.template.status,
			}
			tools.toast.add({
				color: 'success',
				title: tools.t(`${KEY}.lifecycle.${action}_done`),
			})
		} catch (error) {
			deps.onError(error)
		}
	}
}

/**
 * The editor's dialogs and their server calls: publish review, discard,
 * compare with live, test send and a manual save. Call it in a component's
 * setup: it reads the DMS container composables.
 */
export function useEditorActions(deps: ActionDeps) {
	const tools: ActionTools = {
		t: useI18n().t,
		toast: useToast(),
		modal: useModal(),
		confirm: useConfirm().confirm,
	}
	const test = createTestAction(deps, useTemplateDrawer().openTestSend)
	return {
		test,
		publish: createPublishAction(deps, tools, test),
		discard: createDiscardAction(deps, tools),
		compare: createCompareAction(deps, tools),
		async save(): Promise<void> {
			if (await deps.session.save())
				tools.toast.add({
					color: 'success',
					title: tools.t(`${KEY}.save_state.saved_toast`),
				})
		},
		runLifecycle: createLifecycleAction(deps, tools),
	}
}

export type EditorActions = ReturnType<typeof useEditorActions>

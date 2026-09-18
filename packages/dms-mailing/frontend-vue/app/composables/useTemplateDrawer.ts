import type { Component } from 'vue'
import type { TemplateContent, TemplateRow } from '../types/mailing'

/**
 * How a DMS row action reaches these containers (verified against
 * `@antelopejs/interface-dms/base/types/action-target` and
 * `useTableViewRowActions.ts`):
 *
 * - the declared target is
 *   `{ type: 'drawer' | 'modal', component: CustomComponent('DmsMailingX'), title?, description?, size? }`;
 *   there is no `event` target type — the set is
 *   `drawer | modal | page | external | api | exportJob`.
 * - the DMS opens the container itself and mounts the component with
 *   `{ ...target.component.options, pageId, componentId, containerId, rowData, onSuccessCallback }`,
 *   where `rowData` is the full row and `onSuccessCallback` closes the
 *   container and refreshes the table view.
 *
 * The same components are opened from our own surfaces (the gallery) through
 * `useDrawer()` / `useModal()` with an explicit id instead of `rowData`.
 */
const TEMPLATE_DRAWER_COMPONENT = 'DmsMailingTemplateDrawer'
const TEST_SEND_MODAL_COMPONENT = 'DmsMailingTestSendModal'
const DRAWER_DIRECTION = 'right'
const TEST_SEND_MODAL_SIZE = 'md'

export interface TemplateDrawerHandle {
	open: (templateId: string) => void
}

export function useTemplateDrawer(): TemplateDrawerHandle {
	const { open } = useDrawer()
	const { t } = useI18n()
	const component = resolveComponent(TEMPLATE_DRAWER_COMPONENT) as Component

	return {
		open: (templateId: string) =>
			void open({
				title: t('dms_mailing.templates.actions.details'),
				component,
				componentOptions: { templateId },
				direction: DRAWER_DIRECTION,
			}),
	}
}

export interface TestSendModalHandle {
	open: (
		templateId: string,
		locale?: string,
		content?: TemplateContent,
		data?: Record<string, unknown>,
	) => void
}

export interface RealSendModalHandle {
	open: (templateId: string, rowData: TemplateRow, locale?: string) => void
}

/** The real-send modal: same component, `real` mode, its own title. */
export function useRealSendModal(): RealSendModalHandle {
	const { open } = useModal()
	const { t } = useI18n()
	const component = resolveComponent(TEST_SEND_MODAL_COMPONENT) as Component

	return {
		open: (templateId, rowData, locale) =>
			void open({
				title: t('dms_mailing.templates.send_modal.title'),
				component,
				componentOptions: { templateId, rowData, locale, mode: 'real' },
				size: TEST_SEND_MODAL_SIZE,
			}),
	}
}

export function useTestSendModal(): TestSendModalHandle {
	const { open } = useModal()
	const { t } = useI18n()
	const component = resolveComponent(TEST_SEND_MODAL_COMPONENT) as Component

	return {
		open: (templateId, locale, content, data) =>
			void open({
				title: t('dms_mailing.editor.test_send_modal.title'),
				component,
				componentOptions: { templateId, locale, content, data },
				size: TEST_SEND_MODAL_SIZE,
			}),
	}
}

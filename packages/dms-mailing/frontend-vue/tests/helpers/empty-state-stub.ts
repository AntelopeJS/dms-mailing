import { defineComponent, h } from 'vue'

/** An action `DmsEmptyState` offers as a button. */
export interface EmptyStateAction {
	label: string
	onClick: () => void
}

interface EmptyStateProps {
	title?: string
	actions?: EmptyStateAction[]
}

/** `DmsEmptyState`: its title, then one button per action. */
export const EmptyStateStub = defineComponent(
	(props: EmptyStateProps) => () =>
		h('div', { 'data-empty-state': '' }, [
			props.title ?? '',
			...(props.actions ?? []).map((action) =>
				h('button', { onClick: action.onClick }, action.label),
			),
		]),
	{ props: { title: String, actions: Array } },
)

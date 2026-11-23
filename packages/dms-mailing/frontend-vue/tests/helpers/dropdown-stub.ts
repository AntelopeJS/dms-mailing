import { defineComponent, type Component } from 'vue'

/** An entry of a dropdown menu the component under test offers. */
export interface MenuItem {
	label: string
	onSelect: () => void
}

interface DropdownProps {
	items?: MenuItem[][]
}

/** `UDropdownMenu`: renders nothing, and hands every render its groups to `onItems`. */
export function dropdownStub(
	onItems: (groups: MenuItem[][]) => void,
): Component {
	return defineComponent(
		(props: DropdownProps) => () => {
			onItems(props.items ?? [])
			return null
		},
		{ props: { items: Array } },
	)
}

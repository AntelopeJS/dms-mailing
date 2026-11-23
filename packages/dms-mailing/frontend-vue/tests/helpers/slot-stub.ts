import { defineComponent, h, type Component } from 'vue'

/** A stand-in for a global component that renders every slot it gets. */
export function slotStub(name: string): Component {
	return defineComponent({
		name,
		inheritAttrs: false,
		setup:
			(_, { slots, attrs }) =>
			() =>
				h(
					'div',
					{ 'data-stub': name, ...attrs },
					Object.values(slots).flatMap((slot) => slot?.() ?? []),
				),
	})
}

import { defineComponent, h } from 'vue'

/** `UButton`: a native button that keeps its attributes and shows its icon. */
export const IconButtonStub = defineComponent({
	inheritAttrs: false,
	props: { icon: { type: String, default: '' } },
	setup:
		(props, { attrs }) =>
		() =>
			h('button', { ...attrs, 'data-icon': props.icon }),
})

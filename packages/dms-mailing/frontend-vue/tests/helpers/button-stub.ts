import { defineComponent, h } from 'vue'

/** `UButton`: a native button showing `label` that emits `click`. */
export const ButtonStub = defineComponent({
	props: { label: { type: String, default: '' } },
	emits: ['click'],
	setup:
		(props, { emit }) =>
		() =>
			h('button', { onClick: () => emit('click') }, props.label),
})

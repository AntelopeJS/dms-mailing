import { defineComponent, h } from 'vue'
import { targetInput } from './narrow'

/** `UInput`: a native input bound to `modelValue`. */
export const InputStub = defineComponent({
	props: { modelValue: { type: [String, Number], default: '' } },
	emits: ['update:modelValue'],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h('input', {
				...attrs,
				value: props.modelValue,
				onInput: (event: Event) =>
					emit('update:modelValue', targetInput(event).value),
			}),
})

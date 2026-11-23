import { defineComponent, h } from 'vue'
import { targetInput } from './narrow'

/** `UCheckbox`: a native checkbox bound to `modelValue`. */
export const CheckboxStub = defineComponent({
	props: { modelValue: Boolean, label: { type: String, default: '' } },
	emits: ['update:modelValue'],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h('label', [
				h('input', {
					...attrs,
					type: 'checkbox',
					checked: props.modelValue,
					onChange: (event: Event) =>
						emit('update:modelValue', targetInput(event).checked),
				}),
				props.label,
			]),
})

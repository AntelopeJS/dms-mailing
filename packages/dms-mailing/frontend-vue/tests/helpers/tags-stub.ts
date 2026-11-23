import { defineComponent, h } from 'vue'
import { targetInput } from './narrow'

interface TagsProps {
	modelValue?: string[]
}

/** `DmsInputTags`: a text input that adds the typed address on change. */
export const TagsStub = defineComponent(
	(
		props: TagsProps,
		{ emit }: { emit: (event: 'update:modelValue', tags: string[]) => void },
	) => {
		return () => {
			const tags = props.modelValue ?? []
			return h('input', {
				'data-tags': tags.join(','),
				onChange: (event: Event) =>
					emit('update:modelValue', [...tags, targetInput(event).value]),
			})
		}
	},
	{ props: { modelValue: Array }, emits: ['update:modelValue'] },
)

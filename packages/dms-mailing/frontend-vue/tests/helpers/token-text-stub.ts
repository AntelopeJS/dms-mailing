import { defineComponent, h } from 'vue'

/** `MailingTokenText`: its text in a span. */
export const TokenTextStub = defineComponent({
	props: { text: { type: String, default: '' } },
	setup: (props) => () => h('span', props.text),
})

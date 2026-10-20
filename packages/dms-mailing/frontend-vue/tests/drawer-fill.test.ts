// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import {
	drawerFillHeight,
	useDrawerFill,
} from '../app/composables/useDrawerFill'
import { flush } from './helpers/nuxt-globals'

const BODY_HEIGHT = 700
const BODY_PADDING_BOTTOM = 16

/** A DMS drawer body of a fixed height, as jsdom lays nothing out. */
function drawerBody(height = BODY_HEIGHT): HTMLElement {
	const body = document.createElement('div')
	body.dataset.slot = 'body'
	body.style.paddingBottom = `${BODY_PADDING_BOTTOM}px`
	Object.defineProperty(body, 'clientHeight', { value: height })
	document.body.appendChild(body)
	return body
}

const Filled = defineComponent({
	setup() {
		const root = ref<HTMLElement | null>(null)
		const minHeight = useDrawerFill(root)
		return () => h('div', { ref: root, style: { minHeight: minHeight.value } })
	},
})

describe('drawer fill', () => {
	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('fills the body content box, less its padding', () => {
		const body = drawerBody()
		const root = document.createElement('div')
		body.appendChild(root)
		expect(drawerFillHeight(body, root)).toBe(BODY_HEIGHT - BODY_PADDING_BOTTOM)
	})

	it('gives the component the body height so its footer sits at the bottom', async () => {
		const host = document.createElement('div')
		drawerBody().appendChild(host)
		createApp(Filled).mount(host)
		await flush()
		const root = host.firstElementChild as HTMLElement
		expect(root.style.minHeight).toBe(`${BODY_HEIGHT - BODY_PADDING_BOTTOM}px`)
	})

	it('leaves the height alone outside a drawer', async () => {
		const host = document.createElement('div')
		document.body.appendChild(host)
		createApp(Filled).mount(host)
		await flush()
		expect((host.firstElementChild as HTMLElement).style.minHeight).toBe('')
	})
})

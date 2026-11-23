import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VariablePath from '../app/components/VariablePath.vue'
import { mount, stubNuxtGlobals } from './helpers/nuxt-globals'

/**
 * Mounts the component on a path.
 * @vitest-environment jsdom
 */
const mountPath = (path: string) => mount(VariablePath, { path })

describe('VariablePath', () => {
	beforeEach(() => {
		stubNuxtGlobals()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reads as the path, with a wrap point after each dot only', () => {
		const { host, unmount } = mountPath('order.number')
		const code = host.querySelector('code')
		expect(code?.textContent).toBe('order.number')
		expect(code?.querySelectorAll('wbr')).toHaveLength(2)
		expect(code?.className).not.toContain('break-all')
		unmount()
	})
})

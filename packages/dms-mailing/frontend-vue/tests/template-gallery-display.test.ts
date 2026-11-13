// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import setup from '../app/plugins/template-gallery-display'

interface DisplayRegistration {
	id: string
	component: Component
}

type PluginSetup = () => void

vi.hoisted(() => {
	vi.stubGlobal('defineDmsPlugin', (pluginSetup: PluginSetup) => pluginSetup)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('template gallery display plugin', () => {
	it('registers the gallery under the mailing namespace without a DOM', () => {
		const registrations: DisplayRegistration[] = []
		vi.stubGlobal(
			'registerTableViewDisplay',
			(registration: DisplayRegistration) => registrations.push(registration),
		)
		setup()
		expect(registrations.map((registration) => registration.id)).toEqual([
			'mailing:gallery',
		])
	})
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import '../app/plugins/template-gallery-display'
import { expectDefined } from './helpers/narrow'

interface DisplayRegistration {
	id: string
	component: Component
}

type PluginSetup = () => void

const plugins = vi.hoisted(() => {
	const setups: PluginSetup[] = []
	vi.stubGlobal('defineDmsPlugin', (pluginSetup: PluginSetup) => {
		setups.push(pluginSetup)
		return pluginSetup
	})
	return setups
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
		expectDefined(plugins[0], 'the registered plugin')()
		expect(registrations.map((registration) => registration.id)).toEqual([
			'mailing:gallery',
		])
	})
})

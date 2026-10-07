// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VNode } from 'vue'

interface RegisteredType {
	id: string
	formatter: { default: (...args: unknown[]) => VNode }
}

type PluginSetup = () => void

const registered: RegisteredType[] = []

beforeEach(() => {
	registered.length = 0
	vi.stubGlobal('defineDmsPlugin', (setup: PluginSetup) => setup)
	vi.stubGlobal('useDataTypes', () => ({
		registerDataType: (type: RegisteredType) => registered.push(type),
	}))
	vi.stubGlobal('useUniqueLocales', () => ({
		uniqueLocales: { value: [{ code: 'en' }, { code: 'fr' }, { code: 'de' }] },
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

function texts(node: VNode): string[] {
	if (typeof node.children === 'string') return [node.children]
	if (!Array.isArray(node.children)) return []
	return (node.children as (VNode | string)[]).flatMap((child) =>
		typeof child === 'string' ? [child] : texts(child),
	)
}

describe('column displays plugin', () => {
	it('registers both backend displays without a DOM', async () => {
		const { default: setup } = await import('../app/plugins/column-displays')
		;(setup as unknown as PluginSetup)()
		expect(registered.map((type) => type.id)).toEqual([
			'mailing:locale-chips',
			'mailing:locale-fallback',
		])
	})

	it('draws the locale chips with the missing workspace ones dashed', async () => {
		const { default: setup } = await import('../app/plugins/column-displays')
		;(setup as unknown as PluginSetup)()
		const cell = registered[0]!.formatter.default('en,fr', 'en')
		const chips = cell.children as VNode[]
		expect(chips.map((chip) => chip.children)).toEqual(['en', 'fr', 'de'])
		expect(String(chips[2]!.props?.class)).toContain('border-dashed')
		expect(String(chips[0]!.props?.class)).not.toContain('border-dashed')
	})

	it('draws a fallback as the asked locale leading to the used one', async () => {
		const { renderLocaleFallback } =
			await import('../app/plugins/column-displays')
		const options = { requestedField: 'requestedLocale' }
		const fallback = renderLocaleFallback('en', options, {
			requestedLocale: 'de',
		})
		expect(texts(fallback)).toEqual(['de →', 'en'])
		const same = renderLocaleFallback('en', options, { requestedLocale: 'en' })
		expect(texts(same)).toEqual(['en'])
		const unknown = renderLocaleFallback('', options, {})
		expect(texts(unknown)).toEqual(['—'])
	})

	it('draws a dash for a row without locale information', async () => {
		const { renderLocaleChips } = await import('../app/plugins/column-displays')
		expect(texts(renderLocaleChips('', ['en']))).toEqual(['—'])
		expect(texts(renderLocaleChips(undefined, ['en']))).toEqual(['—'])
	})
})

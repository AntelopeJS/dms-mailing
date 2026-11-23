import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isVNode, type VNode } from 'vue'
import { z } from 'zod'
import CategoryLabel from '../app/components/CategoryLabel.vue'
import {
	renderCategory,
	renderLocaleChips,
} from '../app/plugins/column-displays'
import { expectDefined } from './helpers/narrow'

interface RegisteredType {
	id: string
	formatter: { default: (...args: unknown[]) => VNode }
}

type PluginSetup = () => void

const registered: RegisteredType[] = []

const plugins = vi.hoisted(() => {
	const setups: PluginSetup[] = []
	vi.stubGlobal('defineDmsPlugin', (pluginSetup: PluginSetup) => {
		setups.push(pluginSetup)
		return pluginSetup
	})
	return setups
})

function runPlugin(): void {
	expectDefined(plugins[0], 'the registered plugin')()
}

beforeEach(() => {
	registered.length = 0
	vi.stubGlobal('useDataTypes', () => ({
		registerDataType: (type: RegisteredType) => registered.push(type),
	}))
	vi.stubGlobal('useUniqueLocales', () => ({
		uniqueLocales: { value: [{ code: 'en' }, { code: 'fr' }, { code: 'de' }] },
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function childNodes(node: VNode): VNode[] {
	const { children } = node
	if (!Array.isArray(children)) throw new Error('expected child nodes')
	return children.map((child) => {
		if (!isVNode(child)) throw new Error('expected only child nodes')
		return child
	})
}

function texts(node: VNode): string[] {
	const text = z.string().safeParse(node.children)
	if (text.success) return [text.data]
	if (!Array.isArray(node.children)) return []
	return node.children.flatMap((child) => {
		if (isVNode(child)) return texts(child)
		const part = z.string().safeParse(child)
		return part.success ? [part.data] : []
	})
}

describe('column displays plugin', () => {
	it('registers the locale chips and category displays without a DOM', () => {
		runPlugin()
		expect(registered.map((type) => type.id)).toEqual([
			'mailing:locale-chips',
			'mailing:category',
		])
	})

	it('draws a category through its label component', () => {
		const cell = renderCategory('orders')
		expect(cell.type).toBe(CategoryLabel)
		expect(cell.props).toEqual({ value: 'orders' })
		expect(renderCategory(undefined).props).toEqual({ value: null })
	})

	it('draws the locale chips with the missing workspace ones dashed', () => {
		runPlugin()
		const cell = expectDefined(registered[0]).formatter.default('en,fr', 'en')
		const chips = childNodes(cell)
		expect(chips.map((chip) => chip.children)).toEqual(['en', 'fr', 'de'])
		expect(String(expectDefined(chips[2]).props?.class)).toContain(
			'border-dashed',
		)
		expect(String(expectDefined(chips[0]).props?.class)).not.toContain(
			'border-dashed',
		)
	})

	it('draws a dash for a row without locale information', () => {
		expect(texts(renderLocaleChips('', ['en']))).toEqual(['—'])
		expect(texts(renderLocaleChips(undefined, ['en']))).toEqual(['—'])
	})
})

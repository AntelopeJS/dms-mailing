// @vitest-environment jsdom
/**
 * The drag and drop of the categories, the canvas blocks and the palette:
 * SortableJS moves the dragged element in the DOM, the list puts it back and
 * changes its array, and Vue renders the new order. The drags are replayed as
 * SortableJS reports them, DOM moves included.
 */
import Sortable from 'sortablejs'
import {
	createApp,
	defineComponent,
	h,
	nextTick,
	reactive,
	ref,
	type App,
} from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSortableList } from '../app/composables/useSortableList'

type Options = Record<string, unknown>

interface Item {
	id: string
}

let app: App | undefined

afterEach(() => {
	app?.unmount()
	app = undefined
})

const List = defineComponent({
	props: {
		items: { type: Array as () => Item[], required: true },
		options: { type: Object, default: () => ({}) },
	},
	setup(props) {
		const root = ref<HTMLElement | null>(null)
		useSortableList(root, () => props.items, props.options)
		return () =>
			h(
				'div',
				{ ref: root },
				props.items.map((item) =>
					h('p', { key: item.id, 'data-id': item.id }, item.id),
				),
			)
	},
})

/**
 * Mounts the lists and returns the SortableJS instance VueUse created on each
 * list element. SortableJS needs a pointer to drag with: the tests call the
 * handlers of its options as it calls them, DOM moves included.
 */
function mountLists(lists: { items: Item[]; options: Options }[]): Sortable[] {
	const host = document.createElement('div')
	document.body.append(host)
	app = createApp({
		render: () => lists.map((list) => h(List, list)),
	})
	app.mount(host)
	return [...host.children].map((element) => {
		const sortable = element instanceof HTMLElement && Sortable.get(element)
		if (!sortable) throw new Error('no SortableJS instance on a list')
		return sortable
	})
}

const ids = (items: Item[]) => items.map((item) => item.id)
const domIds = (sortable: Sortable) =>
	[...sortable.el.children].map((child) => child.getAttribute('data-id'))
function call(sortable: Sortable, name: string, event: unknown): void {
	const handler: unknown = Reflect.get(sortable.options, name)
	if (typeof handler !== 'function') throw new Error(`no ${name} handler`)
	handler(event)
}

/** Asks the group SortableJS built from the list's options, as a drag does. */
function groupCheck(
	sortable: Sortable,
	name: 'checkPull' | 'checkPut',
	to: Sortable,
	from: Sortable,
): unknown {
	const check: unknown = Reflect.get(Object(sortable.options.group), name)
	if (typeof check !== 'function') throw new Error(`no ${name} in the group`)
	return check(to, from)
}

describe('useSortableList', () => {
	it('reorders a list in place and renders the new order', async () => {
		const items = reactive([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
		const changes: unknown[] = []
		const ended = vi.fn()
		const sortables = mountLists([
			{
				items,
				options: { onChange: (c: unknown) => changes.push(c), onEnd: ended },
			},
		])
		const [list] = sortables
		const item = list!.el.children[0] as HTMLElement
		call(list!, 'onStart', { item, oldIndex: 0 })
		// SortableJS has moved the element already when it reports the update.
		list!.el.append(item)
		call(list!, 'onUpdate', { item, oldIndex: 0, newIndex: 2 })
		call(list!, 'onEnd', {})
		await nextTick()
		expect(ids(items)).toEqual(['b', 'c', 'a'])
		expect(domIds(list!)).toEqual(['b', 'c', 'a'])
		expect(changes).toEqual([
			{ moved: { element: { id: 'a' }, oldIndex: 0, newIndex: 2 } },
		])
		expect(ended).toHaveBeenCalledOnce()
	})

	it('moves an item to another list of its group', async () => {
		const source = reactive([{ id: 'a' }, { id: 'b' }])
		const target = reactive([{ id: 'x' }])
		const sourceChanges: unknown[] = []
		const targetChanges: unknown[] = []
		const sortables = mountLists([
			{
				items: source,
				options: {
					group: 'g',
					onChange: (c: unknown) => sourceChanges.push(c),
				},
			},
			{
				items: target,
				options: {
					group: 'g',
					onChange: (c: unknown) => targetChanges.push(c),
				},
			},
		])
		const [from, to] = sortables
		const item = from!.el.children[1] as HTMLElement
		call(from!, 'onStart', { item, oldIndex: 1 })
		to!.el.prepend(item)
		// SortableJS reports the add on the target first, then the remove.
		call(to!, 'onAdd', { item, newIndex: 0 })
		call(from!, 'onRemove', { item, oldIndex: 1 })
		call(from!, 'onEnd', {})
		await nextTick()
		expect(ids(source)).toEqual(['a'])
		expect(ids(target)).toEqual(['b', 'x'])
		expect(domIds(from!)).toEqual(['a'])
		expect(domIds(to!)).toEqual(['b', 'x'])
		expect(sourceChanges).toEqual([
			{ removed: { element: { id: 'b' }, oldIndex: 1 } },
		])
		expect(targetChanges).toEqual([
			{ added: { element: { id: 'b' }, newIndex: 0 } },
		])
	})

	it('hands a copy to the other list and keeps its own item (pull: clone)', async () => {
		const palette = reactive([{ id: 'tile' }])
		const canvas = reactive<Item[]>([])
		const group = { name: 'g', pull: 'clone', put: false }
		const sortables = mountLists([
			{
				items: palette,
				options: {
					group,
					sort: false,
					clone: (item: Item) => ({ id: `${item.id}-copy` }),
				},
			},
			{ items: canvas, options: { group: { name: 'g' } } },
		])
		const [from, to] = sortables
		expect(Reflect.get(Object(from!.options.group), 'name')).toBe('g')
		expect(groupCheck(from!, 'checkPull', to!, from!)).toBe('clone')
		expect(groupCheck(from!, 'checkPut', from!, to!)).toBe(false)
		expect(from!.options.sort).toBe(false)
		const item = from!.el.children[0] as HTMLElement
		call(from!, 'onStart', { item, oldIndex: 0 })
		// SortableJS leaves a stand-in where the tile was and drags the tile.
		const stand = item.cloneNode(true) as HTMLElement
		from!.el.insertBefore(stand, item)
		to!.el.append(item)
		call(to!, 'onAdd', { item, newIndex: 0 })
		call(from!, 'onRemove', {
			item,
			clone: stand,
			oldIndex: 0,
			pullMode: 'clone',
		})
		call(from!, 'onEnd', {})
		await nextTick()
		expect(ids(palette)).toEqual(['tile'])
		expect(ids(canvas)).toEqual(['tile-copy'])
		expect(domIds(from!)).toEqual(['tile'])
		expect(domIds(to!)).toEqual(['tile-copy'])
	})

	it('passes the handle, the item selector and a disabled state it follows', async () => {
		const disabled = ref(false)
		const sortables = mountLists([
			{
				items: reactive([{ id: 'a' }]),
				options: {
					handle: '[data-drag-handle]',
					draggable: '>[data-drag-item]',
					ghostClass: 'opacity-30',
					disabled: () => disabled.value,
				},
			},
		])
		const [list] = sortables
		expect(list!.options).toMatchObject({
			handle: '[data-drag-handle]',
			draggable: '>[data-drag-item]',
			ghostClass: 'opacity-30',
			disabled: false,
			sort: true,
		})
		disabled.value = true
		await nextTick()
		expect(list!.options.disabled).toBe(true)
	})

	it('leaves SortableJS its defaults for what the list does not set', () => {
		const sortables = mountLists([
			{ items: reactive([{ id: 'a' }]), options: {} },
		])
		const [list] = sortables
		const bare = new Sortable(document.createElement('div'))
		// A key present with `undefined` would replace the default: an
		// undefined `draggable` makes no child an item, and nothing drags.
		for (const name of ['handle', 'draggable', 'ghostClass'] as const)
			expect(list!.options[name]).toBe(bare.options[name])
		expect(list!.options.draggable).toBe('>*')
		expect(Reflect.get(Object(list!.options.group), 'name')).toBe(
			Reflect.get(Object(bare.options.group), 'name'),
		)
		bare.destroy()
	})
})

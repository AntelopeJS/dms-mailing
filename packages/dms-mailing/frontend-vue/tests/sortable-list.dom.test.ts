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
import {
	useSortableList,
	type SortableListChange,
	type SortableListOptions,
} from '../app/composables/useSortableList'
import { isRecord, isString } from '../app/utils/guards'
import { elementAs, expectDefined } from './helpers/narrow'
import {
	builtGroup,
	callHandler,
	dragEvent,
	groupCheck,
	pair,
} from './helpers/sortable-drag'

interface Item {
	id: string
}

const isItem = (value: unknown): value is Item =>
	isRecord(value) && isString(value.id)

interface ListProps {
	items: Item[]
	options: SortableListOptions<Item>
}

let app: App | undefined

afterEach(() => {
	app?.unmount()
	app = undefined
})

const List = defineComponent(
	(props: ListProps) => {
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
	{ props: { items: { type: Array, required: true }, options: Object } },
)

/**
 * The drag and drop of the categories, the canvas blocks and the palette:
 * SortableJS moves the dragged element in the DOM, the list puts it back and
 * changes its array, and Vue renders the new order. The drags are replayed as
 * SortableJS reports them, DOM moves included.
 *
 * Mounts the lists and returns the SortableJS instance VueUse created on each
 * list element. SortableJS needs a pointer to drag with: the tests call the
 * handlers of its options as it calls them.
 */
function mountLists(lists: ListProps[]): Sortable[] {
	const host = document.createElement('div')
	document.body.append(host)
	app = createApp(() => lists.map((list) => h(List, list)))
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
const firstItemOf = (sortable: Sortable, index: number) =>
	elementAs(sortable.el.children[index] ?? null, HTMLElement)

/** SortableJS has already moved the element when it reports the update. */
function dropWithinList(list: Sortable, item: HTMLElement): void {
	list.el.append(item)
	callHandler(list, 'onUpdate', dragEvent(item, { oldIndex: 0, newIndex: 2 }))
}

describe('useSortableList reordering', () => {
	it('reorders a list in place and renders the new order', async () => {
		const items = reactive([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
		const changes: SortableListChange<Item>[] = []
		const ended = vi.fn()
		const [list] = mountLists([
			{
				items,
				options: {
					onChange: (change) => changes.push(change),
					onEnd: ended,
				},
			},
		])
		const sortable = expectDefined(list)
		const item = firstItemOf(sortable, 0)
		callHandler(sortable, 'onStart', dragEvent(item, { oldIndex: 0 }))
		dropWithinList(sortable, item)
		callHandler(sortable, 'onEnd', dragEvent(item))
		await nextTick()
		expect(ids(items)).toEqual(['b', 'c', 'a'])
		expect(domIds(sortable)).toEqual(['b', 'c', 'a'])
		expect(changes).toEqual([
			{ moved: { element: { id: 'a' }, oldIndex: 0, newIndex: 2 } },
		])
		expect(ended).toHaveBeenCalledOnce()
	})
})

describe('useSortableList between lists', () => {
	it('moves an item to another list of its group', async () => {
		const source = reactive([{ id: 'a' }, { id: 'b' }])
		const target = reactive([{ id: 'x' }])
		const sourceChanges: SortableListChange<Item>[] = []
		const targetChanges: SortableListChange<Item>[] = []
		const [from, to] = pair(
			mountLists([
				{
					items: source,
					options: {
						group: 'g',
						onChange: (change) => sourceChanges.push(change),
					},
				},
				{
					items: target,
					options: {
						group: 'g',
						accepts: isItem,
						onChange: (change) => targetChanges.push(change),
					},
				},
			]),
		)
		const item = firstItemOf(from, 1)
		callHandler(from, 'onStart', dragEvent(item, { oldIndex: 1 }))
		to.el.prepend(item)
		callHandler(to, 'onAdd', dragEvent(item, { newIndex: 0 }))
		callHandler(from, 'onRemove', dragEvent(item, { oldIndex: 1 }))
		callHandler(from, 'onEnd', dragEvent(item))
		await nextTick()
		expect(ids(source)).toEqual(['a'])
		expect(ids(target)).toEqual(['b', 'x'])
		expect(domIds(from)).toEqual(['a'])
		expect(domIds(to)).toEqual(['b', 'x'])
		expect(sourceChanges).toEqual([
			{ removed: { element: { id: 'b' }, oldIndex: 1 } },
		])
		expect(targetChanges).toEqual([
			{ added: { element: { id: 'b' }, newIndex: 0 } },
		])
	})

	it('leaves a list unchanged when it does not accept what lands on it', async () => {
		const source = reactive([{ id: 'a' }])
		const target = reactive<Item[]>([])
		const added = vi.fn()
		const [from, to] = pair(
			mountLists([
				{ items: source, options: { group: 'g' } },
				{
					items: target,
					options: {
						group: 'g',
						accepts: (value): value is Item =>
							isItem(value) && value.id !== 'a',
						onChange: added,
					},
				},
			]),
		)
		const item = firstItemOf(from, 0)
		callHandler(from, 'onStart', dragEvent(item, { oldIndex: 0 }))
		callHandler(to, 'onAdd', dragEvent(item, { newIndex: 0 }))
		callHandler(from, 'onEnd', dragEvent(item))
		await nextTick()
		expect(ids(target)).toEqual([])
		expect(added).not.toHaveBeenCalled()
	})

	it('hands a copy to the other list and keeps its own item (pull: clone)', async () => {
		const palette = reactive([{ id: 'tile' }])
		const canvas = reactive<Item[]>([])
		const group = { name: 'g', pull: 'clone', put: false } as const
		const [from, to] = pair(
			mountLists([
				{
					items: palette,
					options: {
						group,
						sort: false,
						clone: (item) => ({ id: `${item.id}-copy` }),
					},
				},
				{ items: canvas, options: { group: { name: 'g' }, accepts: isItem } },
			]),
		)
		expect(builtGroup(from).name).toBe('g')
		expect(groupCheck(from, 'checkPull', to, from)).toBe('clone')
		expect(groupCheck(from, 'checkPut', from, to)).toBe(false)
		expect(from.options.sort).toBe(false)
		const item = firstItemOf(from, 0)
		callHandler(from, 'onStart', dragEvent(item, { oldIndex: 0 }))
		const stand = elementAs(item.cloneNode(true), HTMLElement)
		from.el.insertBefore(stand, item)
		to.el.append(item)
		callHandler(to, 'onAdd', dragEvent(item, { newIndex: 0 }))
		callHandler(
			from,
			'onRemove',
			dragEvent(item, { clone: stand, oldIndex: 0, pullMode: 'clone' }),
		)
		callHandler(from, 'onEnd', dragEvent(item))
		await nextTick()
		expect(ids(palette)).toEqual(['tile'])
		expect(ids(canvas)).toEqual(['tile-copy'])
		expect(domIds(from)).toEqual(['tile'])
		expect(domIds(to)).toEqual(['tile-copy'])
	})
})

describe('useSortableList options', () => {
	it('passes the handle, the item selector and a disabled state it follows', async () => {
		const disabled = ref(false)
		const [list] = mountLists([
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
		const sortable = expectDefined(list)
		expect(sortable.options).toMatchObject({
			handle: '[data-drag-handle]',
			draggable: '>[data-drag-item]',
			ghostClass: 'opacity-30',
			disabled: false,
			sort: true,
		})
		disabled.value = true
		await nextTick()
		expect(sortable.options.disabled).toBe(true)
	})

	it('leaves SortableJS its defaults, as a key present with undefined would replace the default and nothing would drag', () => {
		const [list] = mountLists([{ items: reactive([{ id: 'a' }]), options: {} }])
		const sortable = expectDefined(list)
		const bare = new Sortable(document.createElement('div'))
		for (const name of ['handle', 'draggable', 'ghostClass'] as const)
			expect(sortable.options[name]).toBe(bare.options[name])
		expect(sortable.options.draggable).toBe('>*')
		expect(builtGroup(sortable).name).toBe(builtGroup(bare).name)
		bare.destroy()
	})
})

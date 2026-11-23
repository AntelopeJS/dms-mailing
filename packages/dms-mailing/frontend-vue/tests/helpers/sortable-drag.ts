import type Sortable from 'sortablejs'
import { expectDefined } from './narrow'

/** The SortableJS handlers a drag calls, in the order it calls them. */
export type DragHandler =
	'onStart' | 'onUpdate' | 'onAdd' | 'onRemove' | 'onEnd'

/** What a test says of a drag event; the rest is filled in from the item. */
interface DragParts {
	oldIndex?: number
	newIndex?: number
	clone?: HTMLElement
	pullMode?: boolean | 'clone'
}

/** An event as SortableJS reports a drag of `item`. */
class DragEventStub extends Event implements Sortable.SortableEvent {
	declare target: HTMLElement
	clone: HTMLElement
	from: HTMLElement
	to: HTMLElement
	items: HTMLElement[]
	oldDraggableIndex: number | undefined
	newDraggableIndex: number | undefined
	oldIndicies: Sortable.SortableEvent['oldIndicies'] = []
	newIndicies: Sortable.SortableEvent['newIndicies'] = []
	swapItem: HTMLElement | null = null

	constructor(
		readonly item: HTMLElement,
		readonly oldIndex: number | undefined,
		readonly newIndex: number | undefined,
		readonly pullMode: boolean | 'clone' | undefined,
		clone: HTMLElement,
	) {
		super('sortable')
		Object.defineProperty(this, 'target', { value: item })
		this.clone = clone
		this.from = item
		this.to = item
		this.items = [item]
		this.oldDraggableIndex = oldIndex
		this.newDraggableIndex = newIndex
	}
}

/** The event SortableJS reports for a drag of `item`. */
export function dragEvent(
	item: HTMLElement,
	parts: DragParts = {},
): Sortable.SortableEvent {
	return new DragEventStub(
		item,
		parts.oldIndex,
		parts.newIndex,
		parts.pullMode,
		parts.clone ?? item,
	)
}

/** Calls the handler SortableJS keeps in the options of `sortable`. */
export function callHandler(
	sortable: Sortable,
	name: DragHandler,
	event: Sortable.SortableEvent,
): void {
	const handler = sortable.options[name]
	if (!handler) throw new Error(`no ${name} handler`)
	handler(event)
}

/** Asks the group SortableJS built from the list's options, as a drag does. */
export function groupCheck(
	sortable: Sortable,
	name: 'checkPull' | 'checkPut',
	to: Sortable,
	from: Sortable,
): boolean | string | string[] {
	const check = builtGroup(sortable)[name]
	if (!check) throw new Error(`no ${name} in the group`)
	return check(to, from, from.el, dragEvent(from.el))
}

/** The group SortableJS built from the list's options. */
export function builtGroup(sortable: Sortable): Sortable.GroupOptions {
	const { group } = sortable.options
	if (!isGroupOptions(group)) throw new Error('no group options on the list')
	return group
}

function isGroupOptions(
	group: string | Sortable.GroupOptions | undefined,
): group is Sortable.GroupOptions {
	return Object(group) === group
}

/** The first two lists of a mounted pair. */
export function pair(sortables: Sortable[]): [Sortable, Sortable] {
	const [first, second] = sortables
	return [
		expectDefined(first, 'a first list'),
		expectDefined(second, 'a second list'),
	]
}

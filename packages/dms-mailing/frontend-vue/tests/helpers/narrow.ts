/** The value, or a thrown error naming what was missing. */
export function expectDefined<T>(
	value: T | null | undefined,
	what = 'value',
): T {
	if (value === null || value === undefined)
		throw new Error(`expected ${what} to be defined`)
	return value
}

/** An element the DOM handed back, checked as the given element class. */
export function elementAs<T extends Element>(
	found: Node | null,
	kind: new () => T,
): T {
	if (!(found instanceof kind)) throw new Error(`expected a ${kind.name}`)
	return found
}

/** The first element matching `selector`, as the given element class. */
export function query<T extends Element>(
	root: ParentNode,
	selector: string,
	kind: new () => T,
): T {
	const found = root.querySelector(selector)
	if (!(found instanceof kind))
		throw new Error(`expected ${selector} to match a ${kind.name}`)
	return found
}

/** Every element matching `selector`, each checked as the given element class. */
export function queryAll<T extends Element>(
	root: ParentNode,
	selector: string,
	kind: new () => T,
): T[] {
	return [...root.querySelectorAll(selector)].map((found) => {
		if (!(found instanceof kind))
			throw new Error(`expected ${selector} to match only ${kind.name}s`)
		return found
	})
}

/** An element's value read as an event target of a native input. */
export function targetInput(event: Event): HTMLInputElement {
	const { target } = event
	if (!(target instanceof HTMLInputElement))
		throw new Error('expected the event to come from an input')
	return target
}

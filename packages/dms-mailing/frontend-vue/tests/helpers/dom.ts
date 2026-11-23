import { expectDefined, query, queryAll } from './narrow'

/** Submits the form of the mounted component. */
export function submitForm(host: HTMLElement): void {
	query(host, 'form', HTMLFormElement).dispatchEvent(new Event('submit'))
}

/** Every native input of the mounted component. */
export function inputsOf(host: HTMLElement): HTMLInputElement[] {
	return queryAll(host, 'input', HTMLInputElement)
}

/** The input at `index` of the mounted component. */
export function inputAt(host: HTMLElement, index: number): HTMLInputElement {
	return expectDefined(inputsOf(host)[index], `input ${index}`)
}

/** The first element matching `selector` whose text contains `text`. */
export function elementWithText(
	host: ParentNode,
	selector: string,
	text: string,
): HTMLElement {
	return expectDefined(
		queryAll(host, selector, HTMLElement).find((candidate) =>
			candidate.textContent?.includes(text),
		),
		`${selector} containing "${text}"`,
	)
}

/** The first element matching `selector` whose attribute `name` is `value`. */
export function elementWithAttribute(
	host: ParentNode,
	selector: string,
	name: string,
	value: string,
): HTMLElement {
	return expectDefined(
		queryAll(host, selector, HTMLElement).find(
			(candidate) => candidate.getAttribute(name) === value,
		),
		`${selector} with ${name}="${value}"`,
	)
}

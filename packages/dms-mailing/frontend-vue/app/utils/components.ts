import type { Component } from 'vue'
import { isString } from './guards'

/** The globally registered component `name`; throws where none is registered. */
export function resolveRegistered(name: string): Component {
	const component = resolveComponent(name)
	if (isString(component))
		throw new Error(`Component ${name} is not registered`)
	return component
}

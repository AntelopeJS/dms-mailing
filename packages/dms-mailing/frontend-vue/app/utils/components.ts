import { getCurrentInstance, type Component } from 'vue'
import { isString } from './guards'

/**
 * The globally registered component `name`, resolved from a component's
 * setup: outside it Vue has no instance to resolve against and answers the
 * name itself, so an event handler uses what setup resolved. Throws outside
 * setup and where no component is registered under `name`.
 */
export function resolveRegistered(name: string): Component {
	if (!getCurrentInstance())
		throw new Error(`Component ${name} is resolved outside a component's setup`)
	const component = resolveComponent(name)
	if (isString(component))
		throw new Error(`Component ${name} is not registered`)
	return component
}

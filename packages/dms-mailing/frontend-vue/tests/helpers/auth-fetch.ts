import { vi } from 'vitest'

/** A request a component made through the DMS's `$authFetch`. */
export interface AuthFetchCall {
	path: string
	method: string
	body: unknown
}

export type AuthFetchBackend = (call: AuthFetchCall) => unknown

export interface AuthFetchStub {
	/** Every request made, in order. */
	calls: AuthFetchCall[]
	/** Answers the next requests; a thrown error or a rejection fails them. */
	respond: (backend: AuthFetchBackend) => void
}

interface AuthFetchOptions {
	method?: string
	body?: unknown
}

/**
 * Stands in for the DMS's `useAuthFetch` (an auto-import the layer's tests do
 * not have), the transport `useMailingApi` writes through: records every
 * request and answers it from `respond`'s backend, as an already settled
 * promise. Until `respond` is called, every request fails.
 */
export function stubAuthFetch(): AuthFetchStub {
	let backend: AuthFetchBackend = ({ method, path }) => {
		throw new Error(`unexpected request ${method} ${path}`)
	}
	const stub: AuthFetchStub = {
		calls: [],
		respond: (next) => {
			backend = next
		},
	}
	vi.stubGlobal('useAuthFetch', () => ({
		$authFetch: (path: string, options: AuthFetchOptions = {}) => {
			const call = {
				path,
				method: options.method ?? 'GET',
				body: options.body,
			}
			stub.calls.push(call)
			try {
				return Promise.resolve(backend(call))
			} catch (failure) {
				return Promise.reject(failure)
			}
		},
	}))
	return stub
}

/**
 * The write routes of the mailing API, as a component's tests mock them: a
 * route under a template gets the template id, then the body sent; the
 * others get the body.
 */
export type MailingWriteMocks = Partial<
	Record<TemplateWrite, (id: string, body: unknown) => unknown> &
		Record<ModuleWrite, (body: unknown) => unknown>
>

type TemplateWrite =
	| 'preview'
	| 'testSend'
	| 'realSend'
	| 'publish'
	| 'unpublish'
	| 'archive'
	| 'restore'
	| 'duplicate'
	| 'saveVariables'
	| 'saveTemplateDetails'

type ModuleWrite = 'createTemplate' | 'webhookTest'

/** Method and path suffix, under `/api/mailing/templates/:id`, of each write. */
const TEMPLATE_WRITES: Array<[string, string, TemplateWrite]> = [
	['POST', 'preview', 'preview'],
	['POST', 'test-send', 'testSend'],
	['POST', 'send', 'realSend'],
	['POST', 'publish', 'publish'],
	['POST', 'unpublish', 'unpublish'],
	['POST', 'archive', 'archive'],
	['POST', 'restore', 'restore'],
	['POST', 'duplicate', 'duplicate'],
	['POST', 'variables', 'saveVariables'],
	['PUT', 'details', 'saveTemplateDetails'],
]

/** Method and path of each write outside a template. */
const MODULE_WRITES: Array<[string, string, ModuleWrite]> = [
	['POST', '/api/mailing/tables/templates/new', 'createTemplate'],
	['POST', '/api/mailing/settings/webhook-test', 'webhookTest'],
]

const TEMPLATE_PATH = /^\/api\/mailing\/templates\/([^/]+)\/([^/]+)$/

/**
 * A backend answering the writes a component makes with the test's mocks of
 * them. A write with no route or no mock fails, as calling a method the
 * component was not given would.
 */
export function mailingWrites(mocks: MailingWriteMocks): AuthFetchBackend {
	return ({ path, method, body }) => {
		const [, id, suffix] = TEMPLATE_PATH.exec(path) ?? []
		for (const [verb, routeSuffix, name] of TEMPLATE_WRITES) {
			const mock = mocks[name]
			if (verb === method && suffix === routeSuffix && id && mock)
				return mock(id, body)
		}
		for (const [verb, routePath, name] of MODULE_WRITES) {
			const mock = mocks[name]
			if (verb === method && path === routePath && mock) return mock(body)
		}
		throw new Error(`unexpected request ${method} ${path}`)
	}
}

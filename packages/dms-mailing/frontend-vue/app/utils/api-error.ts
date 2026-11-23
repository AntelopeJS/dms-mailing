import { isNumber, isPrimitive, isRecord, isString } from './guards'

/** What a failed `$authFetch` call carries, as far as the module reads it. */
export interface FetchFailure {
	statusCode?: number
	status?: number
	data?: unknown
	message?: string
}

export const HTTP_CONFLICT = 409

function isOptional<T>(
	value: unknown,
	isType: (candidate: unknown) => candidate is T,
): value is T | undefined {
	return value === undefined || isType(value)
}

function isFetchFailure(error: unknown): error is FetchFailure {
	return (
		isRecord(error) &&
		isOptional(error.statusCode, isNumber) &&
		isOptional(error.status, isNumber) &&
		isOptional(error.message, isString)
	)
}

/** The HTTP status of a failed call; 0 for a network failure. */
export function apiErrorStatus(error: unknown): number {
	return isFetchFailure(error) ? (error.statusCode ?? error.status ?? 0) : 0
}

const OBJECT_TEXT = '[object Object]'

function dataMessage(data: unknown): string | undefined {
	if (isRecord(data)) return isString(data.message) ? data.message : undefined
	if (isString(data)) return data || undefined
	return undefined
}

/**
 * The message a failed call answers: the backend's i18n key (`$dms_mailing…`)
 * when it sent one, else the error's own text, for `processApiMessage`.
 */
export function apiErrorMessage(error: unknown): string {
	if (isFetchFailure(error))
		return dataMessage(error.data) ?? error.message ?? OBJECT_TEXT
	return isPrimitive(error) ? String(error) : OBJECT_TEXT
}

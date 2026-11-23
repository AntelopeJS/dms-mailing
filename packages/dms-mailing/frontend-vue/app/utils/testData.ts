import { isJsonObjectValue } from './guards'
import type { JsonObject } from './guards'

export function parseTestData(source: string): JsonObject | null {
	try {
		const parsed: unknown = JSON.parse(source)
		return isJsonObjectValue(parsed) ? parsed : null
	} catch {
		return null
	}
}

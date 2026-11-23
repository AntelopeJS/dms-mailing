import type { Block } from '../../types/mailing'
import { isString } from '../guards'

/** The string-valued fields of a block, by name. */
export function stringFields(block: Block): Map<string, string> {
	return new Map(
		Object.entries(block).filter((entry): entry is [string, string] =>
			isString(entry[1]),
		),
	)
}

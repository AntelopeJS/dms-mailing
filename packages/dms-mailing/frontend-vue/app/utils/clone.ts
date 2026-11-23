import type {
	Block,
	Condition,
	LocaleContent,
	TemplateContent,
	VariableDefinition,
} from '../types/mailing'
import { isJsonObject } from './guards'
import type { JsonValue } from './guards'

/** A copy of `condition`. */
const cloneCondition = (condition: Condition): Condition => ({ ...condition })

/**
 * A copy of `block` and of every block nested in it. Like every copy here, it
 * rebuilds each object and list, so it shares no reference and no reactive
 * proxy with the original.
 */
export function cloneBlock(block: Block): Block {
	const visibleIf = block.visibleIf && cloneCondition(block.visibleIf)
	if (block.type !== 'if') return { ...block, visibleIf }
	return {
		...block,
		visibleIf,
		condition: cloneCondition(block.condition),
		children: block.children.map(cloneBlock),
		elseChildren: block.elseChildren?.map(cloneBlock) ?? null,
	}
}

/** A copy of one locale's content. */
export const cloneLocale = (locale: LocaleContent): LocaleContent => ({
	...locale,
	blocks: locale.blocks.map(cloneBlock),
})

/** A copy of a template's content, every locale included. */
export const cloneContent = (content: TemplateContent): TemplateContent => ({
	...content,
	locales: Object.fromEntries(
		Object.entries(content.locales).map(([code, locale]) => [
			code,
			cloneLocale(locale),
		]),
	),
})

/** A copy of a template's variable declarations. */
export const cloneVariables = (
	variables: VariableDefinition[],
): VariableDefinition[] => variables.map((variable) => ({ ...variable }))

/** A copy of a JSON value. */
export function cloneJson(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(cloneJson)
	if (!isJsonObject(value)) return value
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, cloneJson(item)]),
	)
}

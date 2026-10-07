import type {
	Block,
	TemplateChange,
	TemplateChangeKind,
	TemplateContent,
} from '../types/mailing'
import { blockLabelKey } from './blocks/factory'
import { findBlock } from './blocks/tree'

/** One line of the publish review: "EN · Paragraph changed". */
export interface ChangeLine {
	key: string
	icon: string
	text: string
}

export type ChangeTranslator = (
	key: string,
	params?: Record<string, string>,
) => string

/** Contents a change can name its block from: the draft, then the live one. */
export interface ChangeSources {
	draft: TemplateContent
	published: TemplateContent | null
}

const CHANGE_KEY_PREFIX = 'dms_mailing.editor.changes'
const LOCALE_SEPARATOR = ' · '
const DETAIL_SEPARATOR = ' '

const CHANGE_ICONS: Record<TemplateChangeKind, string> = {
	locale_added: 'i-ph-plus-circle',
	locale_removed: 'i-ph-minus-circle',
	subject: 'i-ph-pencil-simple',
	preheader: 'i-ph-pencil-simple',
	block_added: 'i-ph-plus-circle',
	block_removed: 'i-ph-minus-circle',
	block_changed: 'i-ph-pencil-simple',
	blocks_reordered: 'i-ph-arrows-down-up',
}

function blockOf(change: TemplateChange, sources: ChangeSources): Block | null {
	if (!change.blockId) return null
	const contents = [sources.draft, sources.published]
	for (const content of contents) {
		const blocks = content?.locales[change.locale]?.blocks
		const found = blocks ? findBlock(blocks, change.blockId) : null
		if (found) return found
	}
	return null
}

function blockName(
	change: TemplateChange,
	sources: ChangeSources,
	t: ChangeTranslator,
): string {
	if (!change.blockType) return ''
	const label = t(blockLabelKey(change.blockType))
	const block = blockOf(change, sources)
	return block?.type === 'if'
		? `${label}${DETAIL_SEPARATOR}${block.condition.path}`
		: label
}

/**
 * The publish review's reading of the server's change list, one line per
 * change, prefixed with its locale.
 */
export function describeChanges(
	changes: TemplateChange[],
	sources: ChangeSources,
	t: ChangeTranslator,
): ChangeLine[] {
	return changes.map((change, index) => {
		const sentence = t(`${CHANGE_KEY_PREFIX}.${change.kind}`, {
			block: blockName(change, sources, t),
		})
		return {
			key: `${change.locale}-${change.kind}-${change.blockId ?? index}`,
			icon: CHANGE_ICONS[change.kind],
			text: `${change.locale.toUpperCase()}${LOCALE_SEPARATOR}${sentence}`,
		}
	})
}

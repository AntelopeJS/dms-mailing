import { h, type VNode } from 'vue'
import {
	LOCALE_CHIP_CLASS,
	LOCALE_CHIP_MISSING_CLASS,
	localeChipClass,
	localeChips,
	localeFallback,
} from '../utils/locales'

export const LOCALE_CHIPS_DISPLAY_ID = 'mailing:locale-chips'
export const LOCALE_FALLBACK_DISPLAY_ID = 'mailing:locale-fallback'

const EMPTY_CELL = '—'
const CHIP_ROW_CLASS = 'inline-flex items-center gap-1'
const FALLBACK_ARROW = '→'

/** Options of the `mailing:locale-fallback` display (backend `LocaleFallbackDisplayOptions`). */
export interface LocaleFallbackOptions {
	/** Row field holding the locale the caller asked for. */
	requestedField?: string
}

type Row = Record<string, unknown> | undefined

interface WorkspaceLocale {
	code: string
}

const emptyCell = () => h('span', { class: 'text-dimmed' }, EMPTY_CELL)

/**
 * A template's locales as mono chips, the workspace locales it lacks drawn
 * dashed in the warning tone, like the gallery card.
 */
export function renderLocaleChips(
	value: unknown,
	workspaceCodes: string[],
): VNode {
	const chips = localeChips(
		typeof value === 'string' ? value : '',
		workspaceCodes,
	)
	if (!chips.length) return emptyCell()
	return h(
		'span',
		{ class: CHIP_ROW_CLASS },
		chips.map((chip) =>
			h('span', { class: localeChipClass(chip.present) }, chip.code),
		),
	)
}

/**
 * The locale a send was rendered in; when the caller asked for another one,
 * the asked one leads with an arrow in the warning tone: `DE → EN`.
 */
export function renderLocaleFallback(
	value: unknown,
	options: unknown,
	row: Row,
): VNode {
	const field = (options as LocaleFallbackOptions | undefined)?.requestedField
	const fallback = localeFallback(value, field ? row?.[field] : undefined)
	if (!fallback.used) return emptyCell()
	if (!fallback.isFallback) {
		return h('span', { class: localeChipClass(true) }, fallback.used)
	}
	return h(
		'span',
		{
			class: CHIP_ROW_CLASS,
			title: `${fallback.requested} ${FALLBACK_ARROW} ${fallback.used}`,
		},
		[
			h(
				'span',
				{ class: `${LOCALE_CHIP_CLASS} ${LOCALE_CHIP_MISSING_CLASS}` },
				[`${fallback.requested} ${FALLBACK_ARROW}`],
			),
			h('span', { class: localeChipClass(true) }, fallback.used),
		],
	)
}

function workspaceCodes(): string[] {
	const { uniqueLocales } = useUniqueLocales()
	return uniqueLocales.value.map((entry: WorkspaceLocale) => entry.code)
}

/**
 * Frontend renderers of the backend column displays `mailing:locale-chips`
 * and `mailing:locale-fallback` (`src/data/displays.ts`).
 */
export default defineDmsPlugin(() => {
	const { registerDataType } = useDataTypes()
	registerDataType({
		id: LOCALE_CHIPS_DISPLAY_ID,
		formatter: {
			default: (value: unknown) => renderLocaleChips(value, workspaceCodes()),
		},
	})
	registerDataType({
		id: LOCALE_FALLBACK_DISPLAY_ID,
		formatter: {
			default: (
				value: unknown,
				_locale: string,
				options?: unknown,
				row?: Row,
			) => renderLocaleFallback(value, options, row),
		},
	})
})

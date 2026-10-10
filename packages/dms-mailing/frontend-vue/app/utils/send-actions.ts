import type { SendStatus } from '../types/mailing'

export type SendActionId =
	'rendering' | 'copy_address' | 'fix_address' | 'send_again'

export type SendActionVariant = 'ghost' | 'outline' | 'solid'

export interface SendAction {
	id: SendActionId
	variant: SendActionVariant
	/** i18n key of the button label; absent for an icon-only button. */
	labelKey?: string
	icon: string
}

const KEY_PREFIX = 'dms_mailing.sends.drawer.actions.'
const SHORT_ID_LENGTH = 8

const RENDERING: SendAction = {
	id: 'rendering',
	variant: 'ghost',
	labelKey: `${KEY_PREFIX}rendering`,
	icon: 'i-ph-eye',
}

const COPY_ADDRESS: SendAction = {
	id: 'copy_address',
	variant: 'outline',
	icon: 'i-ph-copy',
}

const FIX_ADDRESS: SendAction = {
	id: 'fix_address',
	variant: 'solid',
	labelKey: `${KEY_PREFIX}fix_address`,
	icon: 'i-ph-user-circle',
}

const sendAgain = (variant: SendActionVariant): SendAction => ({
	id: 'send_again',
	variant,
	labelKey: `${KEY_PREFIX}send_again`,
	icon: 'i-ph-arrow-clockwise',
})

const SEE_RECEIVED: SendAction = {
	...RENDERING,
	variant: 'outline',
	labelKey: `${KEY_PREFIX}see_received`,
}

/** Footer of a send that went through: repeating it is possible but quiet. */
const DEFAULT_ACTIONS: SendAction[] = [sendAgain('ghost'), SEE_RECEIVED]

/**
 * The drawer footer by status (ML-03): a bounce asks for a corrected address
 * since sending it again would bounce again, a spam report is never answered
 * with another e-mail, a provider failure is sent again as the main action.
 */
const ACTIONS_BY_STATUS: Partial<Record<SendStatus, SendAction[]>> = {
	bounced: [RENDERING, COPY_ADDRESS, FIX_ADDRESS],
	spam: [RENDERING, COPY_ADDRESS],
	failed: [RENDERING, sendAgain('solid')],
}

/** The footer buttons of a send's drawer, in display order. */
export function sendFooterActions(status: SendStatus): SendAction[] {
	return ACTIONS_BY_STATUS[status] ?? DEFAULT_ACTIONS
}

/** The short id the drawer's eyebrow shows ("SEND · 8f2a8c1e"). */
export function shortSendId(id: string): string {
	return id.slice(-SHORT_ID_LENGTH)
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Why a corrected address cannot be used, as an i18n key: empty, not an
 * e-mail, or the address that already failed. `null` when it can.
 */
export function correctedAddressError(
	value: string,
	previous: string,
): string | null {
	const address = value.trim()
	const rules: [boolean, string][] = [
		[!address, 'dms_mailing.sends.fix_address.errors.required'],
		[
			!EMAIL_PATTERN.test(address),
			'dms_mailing.sends.fix_address.errors.invalid',
		],
		[
			address.toLowerCase() === previous.trim().toLowerCase(),
			'dms_mailing.sends.fix_address.errors.same',
		],
	]
	return rules.find(([failed]) => failed)?.[1] ?? null
}

const PAYLOAD_INDENT = 2

/** The variables a send carried, pretty-printed; the raw text when unparsable. */
export function formatPayload(raw: string | undefined): string {
	if (!raw) return ''
	try {
		return JSON.stringify(JSON.parse(raw), null, PAYLOAD_INDENT)
	} catch {
		return raw
	}
}

export type SendTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

/** The tone of a send's status pill, the same in the log and the drawer. */
export const SEND_STATUS_TONES: Record<SendStatus, SendTone> = {
	queued: 'neutral',
	sent: 'info',
	delivered: 'success',
	opened: 'info',
	clicked: 'info',
	bounced: 'error',
	spam: 'warning',
	failed: 'error',
	unsubscribed: 'warning',
}

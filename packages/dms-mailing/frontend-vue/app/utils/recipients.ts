/** A manual send reaches at most this many addresses; a list needs an automation. */
export const MAX_RECIPIENTS = 5

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailAddress(value: string): boolean {
	return EMAIL_PATTERN.test(value.trim())
}

/** Whether a recipient list can be sent: not empty, not over the cap, all addresses. */
export function isSendableRecipients(recipients: string[]): boolean {
	return (
		recipients.length > 0 &&
		recipients.length <= MAX_RECIPIENTS &&
		recipients.every(isEmailAddress)
	)
}

/** One locale of a select, labelled with its workspace name when known. */
export interface LocaleOption {
	label: string
	value: string
}

export interface NamedLocale {
	code: string
	name?: string
}

/** Select items for `codes`, named after the workspace locales ("Français (FR)"). */
export function localeOptions(
	codes: string[],
	workspace: NamedLocale[],
): LocaleOption[] {
	const names = new Map(workspace.map((entry) => [entry.code, entry.name]))
	return codes.map((code) => {
		const name = names.get(code)
		const upper = code.toUpperCase()
		return { label: name ? `${name} (${upper})` : upper, value: code }
	})
}

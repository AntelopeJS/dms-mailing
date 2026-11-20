/** A file a send carried, as the send log keeps it: never its bytes. */
export interface SentAttachment {
	filename: string
	size: number
}

const KILOBYTE = 1024

const isSentAttachment = (value: unknown): value is SentAttachment =>
	typeof value === 'object' &&
	value !== null &&
	'filename' in value &&
	typeof value.filename === 'string' &&
	'size' in value &&
	typeof value.size === 'number'

/** The files of a send's `json_attachments`; none when absent or unreadable. */
export function sentAttachments(json: string | undefined): SentAttachment[] {
	if (!json) return []
	try {
		const parsed: unknown = JSON.parse(json)
		return Array.isArray(parsed) ? parsed.filter(isSentAttachment) : []
	} catch {
		return []
	}
}

/** `size` in kilobytes, at least one: "120 kB", "2,048 kB". */
export const formatFileSize = (size: number, locale: string): string =>
	new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: 'kilobyte',
		unitDisplay: 'short',
		maximumFractionDigits: 0,
	}).format(Math.max(1, Math.round(size / KILOBYTE)))

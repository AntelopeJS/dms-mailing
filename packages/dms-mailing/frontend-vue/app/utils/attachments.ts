/** A file a send carried, as the send log keeps it: never its bytes. */
export interface SentAttachment {
	filename: string
	contentType: string
	size: number
	sha256: string
}

const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * KILOBYTE
const SHORT_HASH_LENGTH = 12

function isSentAttachment(value: unknown): value is SentAttachment {
	if (typeof value !== 'object' || value === null) return false
	const entry = value as Record<string, unknown>
	return (
		typeof entry.filename === 'string' &&
		typeof entry.contentType === 'string' &&
		typeof entry.size === 'number' &&
		typeof entry.sha256 === 'string'
	)
}

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

/** `size` in the largest unit that keeps it above one: "120 kB", "2.4 MB". */
export function formatFileSize(size: number, locale: string): string {
	const [value, unit] =
		size >= MEGABYTE
			? [size / MEGABYTE, 'megabyte']
			: size >= KILOBYTE
				? [size / KILOBYTE, 'kilobyte']
				: [size, 'byte']
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit,
		unitDisplay: 'short',
		maximumFractionDigits: 1,
	}).format(value)
}

/** The start of a file's SHA-256, enough to match it against an archive by eye. */
export const shortHash = (sha256: string): string =>
	sha256.slice(0, SHORT_HASH_LENGTH)

/**
 * The logo an e-mail can carry, shared by the e-mail template and the editor
 * canvas so both show the same header. A recipient's mail client fetches it
 * from the internet, so it needs an absolute public URL; Gmail and Outlook
 * also refuse SVG. Anything else is left out rather than drawn broken.
 */

const ROOT_PATH = '/'
const WEB_PROTOCOLS = ['http:', 'https:']
const BLOCKED_EXTENSION = /\.svg(?:[?#]|$)/i
const LOCAL_HOSTS = ['localhost', '0.0.0.0', '[::1]']
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal']
const PRIVATE_ADDRESSES = [
	/^127\./,
	/^10\./,
	/^192\.168\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^169\.254\./,
]

/** The DMS app config the logo is read from. */
export interface EmailBrandingConfig {
	branding?: {
		logo?: {
			default?: {
				light?: string
			}
		}
	}
}

function absoluteUrl(path: string, baseUrl: string): URL | null {
	const source = path.startsWith(ROOT_PATH) ? `${baseUrl}${path}` : path
	try {
		return new URL(source)
	} catch {
		return null
	}
}

/** Whether a mail client out on the internet can reach `host`. */
export function isPublicHost(host: string): boolean {
	const name = host.toLowerCase()
	if (LOCAL_HOSTS.includes(name)) return false
	if (LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false
	return !PRIVATE_ADDRESSES.some((pattern) => pattern.test(name))
}

/**
 * The logo's URL as an e-mail may use it, or `''` when the logo is an SVG or
 * the DMS has no public address (`clientBaseUrl` on localhost).
 */
export function emailLogoUrl(
	logoPath: string | undefined,
	clientBaseUrl: string,
): string {
	if (!logoPath || BLOCKED_EXTENSION.test(logoPath)) return ''
	const url = absoluteUrl(logoPath, clientBaseUrl)
	if (!url || !WEB_PROTOCOLS.includes(url.protocol)) return ''
	return isPublicHost(url.hostname) ? url.href : ''
}

/** The e-mail logo of a DMS app config. */
export function brandingLogoUrl(
	config: EmailBrandingConfig,
	clientBaseUrl: string,
): string {
	return emailLogoUrl(config.branding?.logo?.default?.light, clientBaseUrl)
}

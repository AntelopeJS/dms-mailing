import { describe, expect, it } from 'vitest'
import {
	brandingLogoUrl,
	emailLogoUrl,
	isPublicHost,
} from '../app/utils/email-logo'

describe('emailLogoUrl', () => {
	it('prefixes a root path with the public DMS address', () => {
		expect(emailLogoUrl('/brand/logo.png', 'https://dms.acme.com')).toBe(
			'https://dms.acme.com/brand/logo.png',
		)
	})

	it('keeps an absolute public URL', () => {
		expect(emailLogoUrl('https://cdn.acme.com/logo.png', '')).toBe(
			'https://cdn.acme.com/logo.png',
		)
	})

	it('leaves the logo out without a public address', () => {
		expect(emailLogoUrl('/brand/logo.png', 'http://localhost:3012')).toBe('')
		expect(emailLogoUrl('/brand/logo.png', 'http://127.0.0.3:3012')).toBe('')
		expect(emailLogoUrl('/brand/logo.png', '')).toBe('')
	})

	it('leaves out an SVG logo, which Gmail and Outlook refuse', () => {
		expect(emailLogoUrl('/logo/light.svg', 'https://dms.acme.com')).toBe('')
		expect(
			emailLogoUrl('https://cdn.acme.com/logo.svg?v=2', 'https://x.test'),
		).toBe('')
	})

	it('reads the light logo of the DMS branding', () => {
		expect(
			brandingLogoUrl(
				{ branding: { logo: { default: { light: '/l.png' } } } },
				'https://dms.acme.com',
			),
		).toBe('https://dms.acme.com/l.png')
		expect(brandingLogoUrl({}, 'https://dms.acme.com')).toBe('')
	})
})

describe('isPublicHost', () => {
	it('tells private and local hosts apart', () => {
		expect(isPublicHost('dms.acme.com')).toBe(true)
		expect(isPublicHost('10.0.0.4')).toBe(false)
		expect(isPublicHost('192.168.1.10')).toBe(false)
		expect(isPublicHost('172.20.0.1')).toBe(false)
		expect(isPublicHost('172.32.0.1')).toBe(true)
		expect(isPublicHost('mailing.local')).toBe(false)
	})
})

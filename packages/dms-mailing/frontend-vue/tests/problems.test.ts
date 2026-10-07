import { describe, expect, it } from 'vitest'
import {
	describeProblem,
	problemEventReason,
	type ProblemSend,
} from '../app/utils/problems'

const send = (patch: Partial<ProblemSend>): ProblemSend => ({
	status: 'bounced',
	error: '',
	recipientEmail: 'procurement@stark.com',
	provider: 'Brevo',
	...patch,
})

describe('describeProblem', () => {
	it('has nothing to say about a send that went through', () => {
		expect(describeProblem(send({ status: 'delivered' }))).toBeNull()
		expect(describeProblem(send({ status: 'queued' }))).toBeNull()
	})

	it.each([
		['550 5.1.1 Mailbox does not exist', 'address_missing'],
		['User unknown', 'address_missing'],
		['452 4.2.2 Mailbox full', 'mailbox_full'],
		['552 Quota exceeded', 'mailbox_full'],
		['554 5.7.1 Message rejected as spam', 'rejected_spam'],
		['421 Try again later', 'rejected'],
	])('reads the bounce "%s" as %s', (error, kind) => {
		expect(describeProblem(send({ error }))?.kind).toBe(kind)
	})

	it('reads a provider timeout as safe to send again', () => {
		const problem = describeProblem(
			send({ status: 'failed', error: 'Provider timeout after 30 s' }),
		)
		expect(problem).toMatchObject({
			kind: 'provider_timeout',
			icon: 'i-ph-plugs',
			titleKey: 'dms_mailing.sends.problems.provider_timeout.title',
			params: { provider: 'Brevo' },
		})
	})

	it('falls back on a generic provider error', () => {
		expect(
			describeProblem(send({ status: 'failed', error: 'Invalid API key' }))
				?.kind,
		).toBe('provider_error')
	})

	it('reports a spam complaint', () => {
		expect(describeProblem(send({ status: 'spam' }))?.kind).toBe('spam_report')
	})

	it('names the domain and the fallback provider', () => {
		const problem = describeProblem(
			send({ provider: undefined, error: '550' }),
			'The provider',
		)
		expect(problem?.params).toMatchObject({
			domain: 'stark.com',
			provider: 'The provider',
		})
	})
})

describe('problemEventReason', () => {
	const event = (type: string, details: object) =>
		({
			_id: type,
			sendId: 's',
			type,
			at: '2026-10-07T10:00:00Z',
			json_details: JSON.stringify(details),
		}) as never

	it('reads the reason of the latest problem event', () => {
		expect(
			problemEventReason([
				event('sent', {}),
				event('bounced', { reason: '550 5.1.1 Mailbox does not exist' }),
			]),
		).toBe('550 5.1.1 Mailbox does not exist')
	})

	it('answers an empty string without a problem event', () => {
		expect(problemEventReason([event('delivered', { reason: 'x' })])).toBe('')
	})
})

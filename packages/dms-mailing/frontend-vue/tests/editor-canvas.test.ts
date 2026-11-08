// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import EditorCanvas from '../app/components/editor/EditorCanvas.vue'
import { useEditorActions } from '../app/composables/useEditorActions'
import { provideEditorContext } from '../app/composables/useEditorContext'
import { useEditorSession } from '../app/composables/useEditorSession'
import { useMailingApi } from '../app/composables/useMailingApi'
import { useEditorReads } from '../app/composables/useMailingReads'
import { createEditorState } from '../app/composables/useTemplateEditor'
import type {
	TemplateContent,
	TemplateContentResponse,
} from '../app/types/mailing'
import { stubApiData } from './helpers/api-data'
import { stubAuthFetch } from './helpers/auth-fetch'
import { mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'
import type { Mounted } from './helpers/nuxt-globals'

const CLIENT_BASE_URL = 'https://dms.acme.com'
const DEFAULT_SVG = '/logo.svg'
const DEFAULT_PNG = 'https://cdn.acme.com/logo.png'
const EMAIL_PNG = 'https://cdn.acme.com/email-logo.png'
const DARK_PNG = 'https://cdn.acme.com/email-logo-dark.png'

const CONTENT: TemplateContent = {
	locales: { en: { subject: 'Hi', preheader: '', blocks: [] } },
}

const LOADED: TemplateContentResponse = {
	template: {
		_id: 't1',
		slug: 'welcome',
		name: 'Welcome',
		status: 'draft',
		updatedAt: '2026-10-01T10:00:00Z',
		updatedBy: 'camille',
		attention: '',
	},
	content: CONTENT,
	publishedContent: null,
	hasDraft: true,
	version: 0,
	revision: 1,
	changes: [],
	variables: [],
	detectedVariables: [],
	testData: {},
	fallbackLocale: 'en',
	blockOnMissingVariables: false,
	categories: [],
	sender: { name: '', email: '', replyTo: '' },
}

interface LogoBranding {
	default?: { light?: string }
	email?: { light?: string; dark?: string }
}

/** The canvas inside an editor built as the workspace builds it. */
const CanvasInEditor = defineComponent({
	setup() {
		const editor = createEditorState(CONTENT, 'en', ['en'])
		const api = useMailingApi()
		const reads = useEditorReads('t1')
		const deps = { editor, api, reads, templateId: 't1', onError: () => {} }
		const session = useEditorSession({ ...deps, loaded: LOADED })
		const actions = useEditorActions({
			...deps,
			session,
			reload: async () => {},
		})
		provideEditorContext({ editor, session, actions, api, templateId: 't1' })
		return () => h(EditorCanvas)
	},
})

let mounted: Mounted | null = null

/** The logo the canvas header shows under `logo`, or null when it shows none. */
function canvasLogo(logo: LogoBranding): string | null {
	vi.stubGlobal('useDmsAppConfig', () => ({ branding: { logo } }))
	mounted = mount(
		CanvasInEditor,
		{},
		{
			UAlert: slotStub('UAlert'),
			MailingEditorEnvelope: slotStub('MailingEditorEnvelope'),
			MailingEditorMissingLocale: slotStub('MailingEditorMissingLocale'),
			MailingEditorBlockList: slotStub('MailingEditorBlockList'),
		},
	)
	return mounted.host.querySelector('img')?.getAttribute('src') ?? null
}

beforeEach(() => {
	stubNuxtGlobals()
	stubApiData()
	stubAuthFetch()
	vi.stubGlobal('useDmsRuntimeConfig', () => ({
		public: { dms: { clientBaseUrl: CLIENT_BASE_URL } },
	}))
})

afterEach(() => {
	mounted?.unmount()
	mounted = null
	vi.unstubAllGlobals()
})

describe('editor canvas logo header', () => {
	it('shows the e-mail logo over an SVG default logo, as the sent e-mail does', () => {
		expect(
			canvasLogo({
				default: { light: DEFAULT_SVG },
				email: { light: EMAIL_PNG },
			}),
		).toBe(EMAIL_PNG)
	})
	it('prefers the light e-mail logo over a public default logo and the dark one', () => {
		expect(
			canvasLogo({
				default: { light: DEFAULT_PNG },
				email: { light: EMAIL_PNG, dark: DARK_PNG },
			}),
		).toBe(EMAIL_PNG)
	})
	it('falls back to the default logo when no e-mail logo is set', () => {
		expect(canvasLogo({ default: { light: DEFAULT_PNG } })).toBe(DEFAULT_PNG)
	})
	it('shows no logo when the chosen one is an SVG a mail client refuses', () => {
		expect(canvasLogo({ default: { light: DEFAULT_SVG } })).toBeNull()
	})
	it('does not fall back to the default logo when the e-mail logo is refused', () => {
		expect(
			canvasLogo({
				default: { light: DEFAULT_PNG },
				email: { light: DEFAULT_SVG },
			}),
		).toBeNull()
	})
})

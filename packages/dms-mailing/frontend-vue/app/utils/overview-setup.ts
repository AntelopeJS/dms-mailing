export type SetupStepId = 'install' | 'provider' | 'sender' | 'template'

export type SetupStepState = 'done' | 'current' | 'todo'

export interface SetupFacts {
	isProviderConnected: boolean
	isSenderSet: boolean
	templateCount: number
}

export interface SetupStepDefinition {
	id: SetupStepId
	/** Where the step is done. */
	to: string
	isDone: (facts: SetupFacts) => boolean
}

export interface SetupStep {
	id: SetupStepId
	number: number
	to: string
	state: SetupStepState
}

const SETTINGS_PAGE = '/modules/mailing/settings'
const TEMPLATES_PAGE = '/modules/mailing/templates'

export const SETUP_STEPS: SetupStepDefinition[] = [
	{ id: 'install', to: SETTINGS_PAGE, isDone: () => true },
	{
		id: 'provider',
		to: `${SETTINGS_PAGE}#provider`,
		isDone: (facts) => facts.isProviderConnected,
	},
	{
		id: 'sender',
		to: `${SETTINGS_PAGE}#sender`,
		isDone: (facts) => facts.isSenderSet,
	},
	{
		id: 'template',
		to: TEMPLATES_PAGE,
		isDone: (facts) => facts.templateCount > 0,
	},
]

/**
 * The first-run checklist: each step done or not from what the workspace
 * holds, the first one left marked current.
 */
export function setupSteps(facts: SetupFacts): SetupStep[] {
	const done = SETUP_STEPS.map((step) => step.isDone(facts))
	const current = done.indexOf(false)
	return SETUP_STEPS.map((step, index) => ({
		id: step.id,
		number: index + 1,
		to: step.to,
		state: done[index] ? 'done' : index === current ? 'current' : 'todo',
	}))
}

/** The dashboard only makes sense once e-mail can leave and has a template. */
export function needsSetup(facts: SetupFacts): boolean {
	return !facts.isProviderConnected || facts.templateCount === 0
}

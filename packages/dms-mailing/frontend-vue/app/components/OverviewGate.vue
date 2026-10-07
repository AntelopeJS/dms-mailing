<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import {
	needsSetup,
	setupSteps,
	type SetupFacts,
	type SetupStep,
	type SetupStepState,
} from '../utils/overview-setup'
import type { Component } from 'vue'
import type { MailingComponentProps } from '../types/component'

defineProps<MailingComponentProps>()

const NEW_TEMPLATE_MODAL = 'MailingNewTemplateModal'
const NEW_TEMPLATE_MODAL_SIZE = 'lg'
const KEY_PREFIX = 'dms_mailing.setup.'

const STEP_MARKER_CLASSES: Record<SetupStepState, string> = {
	done: 'bg-success/10 text-success ring-success/30',
	current: 'bg-primary text-inverted ring-primary',
	todo: 'bg-elevated text-muted ring-default',
}

const STEP_BUTTON_VARIANTS: Record<SetupStepState, 'solid' | 'outline'> = {
	done: 'outline',
	current: 'solid',
	todo: 'outline',
}

const api = useMailingApi()
const { t } = useI18n()
const { open: openModal } = useModal()

const facts = ref<SetupFacts | null>(null)

const steps = computed<SetupStep[]>(() =>
	facts.value ? setupSteps(facts.value) : [],
)
const showsSetup = computed(() => !!facts.value && needsSetup(facts.value))

const key = (path: string): string => t(`${KEY_PREFIX}${path}`)

async function readSenderSet(): Promise<boolean> {
	try {
		const settings = await api.settings()
		return typeof settings.senderEmail === 'string' && !!settings.senderEmail
	} catch {
		return false
	}
}

async function load(): Promise<void> {
	try {
		const [provider, templates, isSenderSet] = await Promise.all([
			api.provider(),
			api.listTemplates(),
			readSenderSet(),
		])
		facts.value = {
			isProviderConnected: provider.connected,
			isSenderSet,
			templateCount: templates.total ?? templates.results.length,
		}
	} catch {
		facts.value = null
	}
}

function createTemplate(): void {
	const modal = openModal({
		title: t('dms_mailing.setup.create_template'),
		component: resolveComponent(NEW_TEMPLATE_MODAL) as Component,
		size: NEW_TEMPLATE_MODAL_SIZE,
	})
	void modal.result.then(load, load)
}

onMounted(load)
</script>

<template>
	<DmsCard v-if="showsSetup" :padded="false">
		<div
			class="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
		>
			<div class="flex flex-col items-start gap-3">
				<DmsIconWell icon="i-ph-envelope-simple" tone="primary" size="xl" />
				<h3 class="text-highlighted text-lg font-semibold">
					{{ key('title') }}
				</h3>
				<p class="text-muted max-w-[52ch] text-[13.5px] leading-relaxed">
					{{ key('description') }}
				</p>
				<div class="mt-1.5 flex flex-wrap items-center gap-2">
					<UButton
						icon="i-ph-plus"
						:label="key('create_template')"
						@click="createTemplate"
					/>
					<UPopover>
						<UButton
							color="neutral"
							variant="ghost"
							:label="key('how_it_works')"
						/>
						<template #content>
							<div class="flex max-w-80 flex-col gap-2 p-4 text-[13px]">
								<p class="text-highlighted font-semibold">
									{{ key('how_it_works') }}
								</p>
								<p class="text-muted leading-relaxed">
									{{ key('how_it_works_body') }}
								</p>
							</div>
						</template>
					</UPopover>
				</div>
			</div>

			<ol class="flex flex-col gap-1">
				<li v-for="step in steps" :key="step.id">
					<DmsListRow
						as="div"
						:title="key(`steps.${step.id}.title`)"
						:description="key(`steps.${step.id}.description`)"
						:current="step.state === 'current'"
					>
						<template #leading>
							<span
								:class="STEP_MARKER_CLASSES[step.state]"
								class="grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold ring"
							>
								<UIcon
									v-if="step.state === 'done'"
									name="i-ph-check"
									class="size-3.5"
									aria-hidden="true"
								/>
								<template v-else>{{ step.number }}</template>
							</span>
						</template>
						<template v-if="step.state !== 'done'" #trailing>
							<UButton
								size="sm"
								:variant="STEP_BUTTON_VARIANTS[step.state]"
								:color="step.state === 'current' ? 'primary' : 'neutral'"
								:label="key(`steps.${step.id}.action`)"
								@click="navigateDms(step.to)"
							/>
						</template>
					</DmsListRow>
				</li>
			</ol>
		</div>
	</DmsCard>

	<div v-else class="flex flex-col gap-4">
		<slot />
	</div>
</template>

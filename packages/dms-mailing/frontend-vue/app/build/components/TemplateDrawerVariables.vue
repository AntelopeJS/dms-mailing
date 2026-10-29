<script setup lang="ts">
import type { MergedVariable } from '../../utils/variables'
import type { SystemVariable } from '../../utils/system-variables'
import { variableTypeLabelKey } from '../../utils/variable-types'

/**
 * The variables tab of a template's drawer: the drawer's own bindings, under
 * the names it gives them.
 */
interface TemplateDrawerVariablesProps {
	variables: MergedVariable[]
	isLive: boolean
	hasDraftDeclarations: boolean
	systemVars: SystemVariable[]
	snippet: string
	declareVariable: (path: string) => Promise<void>
	openEditor: (targetLocale?: string) => void
}

defineProps<TemplateDrawerVariablesProps>()

const { t } = useI18n()
</script>

<template>
	<div class="flex flex-col gap-1">
		<DmsEyebrow :label="t('dms_mailing.templates.drawer.declared_detected')" />
		<p v-if="!variables.length" class="text-muted text-[12.5px]">
			{{ t('dms_mailing.templates.drawer.no_variables') }}
		</p>
		<div
			v-for="variable in variables"
			:key="variable.path"
			class="border-default flex min-h-9 items-center gap-2 border-b last:border-b-0"
		>
			<code
				class="truncate font-mono text-[12px]"
				:class="variable.usage === 'unused' ? 'text-dimmed' : 'text-toned'"
			>
				{{ variable.path }}
			</code>
			<span
				v-if="variable.required && variable.usage !== 'detected'"
				class="text-error"
				:title="t('dms_mailing.templates.drawer.required')"
			>
				*
			</span>
			<DmsStatusPill
				v-if="variable.usage === 'detected'"
				tone="warning"
				size="sm"
				dot="none"
				:label="t('dms_mailing.templates.drawer.not_declared')"
			/>
			<DmsStatusPill
				v-if="variable.usage === 'unused'"
				tone="neutral"
				size="sm"
				dot="none"
				:label="t('dms_mailing.templates.drawer.unused')"
			/>
			<UButton
				v-if="variable.usage === 'detected' && !isLive"
				class="ml-auto"
				color="neutral"
				variant="ghost"
				size="xs"
				:label="t('dms_mailing.templates.drawer.declare')"
				@click="declareVariable(variable.path)"
			/>
			<span
				v-else-if="variable.usage !== 'detected'"
				class="text-dimmed ml-auto font-mono text-[11px]"
			>
				{{ t(variableTypeLabelKey(variable.type)) }}
			</span>
		</div>
	</div>
	<DmsBanner
		v-if="hasDraftDeclarations"
		tone="info"
		size="sm"
		icon="i-ph-brackets-curly"
		:title="t('dms_mailing.templates.drawer.draft_declarations')"
		:description="
			t('dms_mailing.templates.drawer.draft_declarations_description')
		"
	>
		<template #actions>
			<UButton
				color="neutral"
				variant="outline"
				size="xs"
				:label="t('dms_mailing.templates.actions.open_editor')"
				@click="openEditor()"
			/>
		</template>
	</DmsBanner>
	<MailingSystemVariables :variables="systemVars" />
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center justify-between">
			<DmsEyebrow :label="t('dms_mailing.templates.drawer.call_from_code')" />
			<DmsCopyButton :value="snippet" />
		</div>
		<pre
			class="bg-elevated text-toned overflow-x-auto rounded-md p-3 font-mono text-[11.5px] leading-relaxed"
			>{{ snippet }}</pre>
	</div>
</template>

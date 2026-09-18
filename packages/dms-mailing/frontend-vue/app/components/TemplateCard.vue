<script setup lang="ts">
import { localeBadges } from '../utils/locales'
import type { TemplateRow, TemplateStatus } from '../types/mailing'

interface TemplateCardProps {
	template: TemplateRow
	selected?: boolean
}

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.45
const LIVE_STATUS: TemplateStatus = 'live'

const props = defineProps<TemplateCardProps>()

const emit = defineEmits<{
	open: []
	details: []
	'test-send': []
	'open-locale': [code: string]
}>()

const { t } = useI18n()
const { uniqueLocales } = useUniqueLocales()

const statusLabel = computed(() =>
	t(`dms_mailing.templates.status.${props.template.status}`),
)

const badges = computed(() =>
	localeBadges(
		props.template.locales,
		uniqueLocales.value.map((entry) => entry.code),
	),
)

function badgeLabel(code: string, present: boolean): string {
	const key = present ? 'edit_locale' : 'add_locale'
	return t(`dms_mailing.templates.card.${key}`, {
		locale: code.toUpperCase(),
	})
}
</script>

<template>
	<DmsCard
		:padded="false"
		interactive
		:class="selected ? 'ring-primary/40 ring-2' : ''"
		class="group overflow-hidden"
		@click="emit('open')"
	>
		<div class="bg-elevated/40 relative h-[158px] overflow-hidden">
			<div class="pointer-events-none">
				<DmsMailingTemplatePreviewFrame
					:template-id="template._id"
					:width="PREVIEW_WIDTH"
					:scale="PREVIEW_SCALE"
				/>
			</div>
			<div
				class="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<UButton
					icon="i-ph-pencil-simple"
					:label="t('dms_mailing.templates.actions.edit')"
					size="sm"
					@click.stop="emit('open')"
				/>
				<UButton
					icon="i-ph-paper-plane-tilt"
					color="neutral"
					variant="ghost"
					size="sm"
					:title="t('dms_mailing.templates.actions.test_send')"
					@click.stop="emit('test-send')"
				/>
				<UButton
					icon="i-ph-info"
					color="neutral"
					variant="ghost"
					size="sm"
					:title="t('dms_mailing.templates.actions.details')"
					@click.stop="emit('details')"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-1 p-4">
			<div class="flex items-center gap-2">
				<h3 class="text-highlighted truncate text-[13.5px] font-semibold">
					{{ template.name }}
				</h3>
				<UBadge
					v-if="template.status !== LIVE_STATUS"
					:label="statusLabel"
					color="neutral"
					variant="subtle"
					size="sm"
				/>
			</div>
			<span class="text-dimmed truncate font-mono text-[11.5px]">
				{{ template.slug }}
			</span>
			<div class="mt-1 flex items-center gap-2">
				<div v-if="badges.length" class="flex items-center gap-1">
					<button
						v-for="badge in badges"
						:key="badge.code"
						type="button"
						:title="badgeLabel(badge.code, badge.present)"
						:aria-label="badgeLabel(badge.code, badge.present)"
						class="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase transition-colors"
						:class="
							badge.present
								? 'bg-elevated text-toned hover:bg-accented'
								: 'text-warning border-warning/50 hover:bg-warning/10 border border-dashed'
						"
						@click.stop="emit('open-locale', badge.code)"
					>
						{{ badge.code }}
					</button>
				</div>
			</div>
		</div>
	</DmsCard>
</template>

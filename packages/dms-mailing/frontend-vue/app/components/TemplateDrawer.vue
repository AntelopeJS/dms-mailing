<script setup lang="ts">
import { localeCoverage } from '../utils/locales'
import { editorRoute } from '../utils/editor-route'
import { mergeVariables } from '../utils/variables'
import type {
	TemplateContentResponse,
	TemplateRow,
	VariableDefinition,
	VariableType,
} from '../types/mailing'
import { VARIABLE_TYPES } from '../types/mailing'

interface TemplateDrawerProps {
	templateId?: string
	rowData?: TemplateRow
	onSuccessCallback?: () => void
}

type StatusAction = 'publish' | 'unpublish' | 'archive'

const STATUS_DONE_KEYS: Record<StatusAction, string> = {
	publish: 'published',
	unpublish: 'unpublished',
	archive: 'archived',
}

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.53
const MISSING_LOCALE_MARK = ' ·'

const props = defineProps<TemplateDrawerProps>()
const emit = defineEmits<{ success: [] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { uniqueLocales } = useUniqueLocales()
const { open: openTestSendModal } = useTestSendModal()
const { open: openRealSendModal } = useRealSendModal()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')

const detail = ref<TemplateContentResponse | null>(null)
const loading = ref(false)
const locale = ref('')
const isDuplicateOpen = ref(false)
const duplicate = reactive({ slug: '', name: '' })
const newVariable = reactive<VariableDefinition>({
	path: '',
	type: 'string',
	required: false,
})

const template = computed(() => detail.value?.template ?? props.rowData ?? null)

const coverage = computed(() =>
	detail.value
		? localeCoverage(
				Object.keys(detail.value.content.locales),
				uniqueLocales.value.map((entry) => entry.code),
			)
		: [],
)

const localeItems = computed(() =>
	coverage.value.map((entry) => ({
		label:
			entry.code.toUpperCase() + (entry.present ? '' : MISSING_LOCALE_MARK),
		value: entry.code,
	})),
)

const isLocaleMissing = computed(() =>
	coverage.value.some((entry) => entry.code === locale.value && !entry.present),
)

const variables = computed(() =>
	mergeVariables(
		detail.value?.detectedVariables ?? [],
		detail.value?.variables ?? [],
	),
)

// The manual form is for typing a detected path, so it offers the undeclared
// ones first rather than an empty box.
const undeclaredPaths = computed(() =>
	variables.value
		.filter((entry) => entry.usage === 'detected')
		.map((entry) => entry.path),
)

watch(undeclaredPaths, (paths) => {
	if (!newVariable.path) newVariable.path = paths[0] ?? ''
})

const variableTypeItems = VARIABLE_TYPES.map((type: VariableType) => ({
	label: type,
	value: type,
}))

async function load(): Promise<void> {
	if (!templateId.value) return
	loading.value = true
	try {
		const response = await api.templateContent(templateId.value)
		detail.value = response
		locale.value = locale.value || response.fallbackLocale
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	} finally {
		loading.value = false
	}
}

function settle(): void {
	if (props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	void load()
}

function closeContainer(): void {
	if (props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success')
}

async function openEditor(targetLocale?: string): Promise<void> {
	closeContainer()
	await nextTick()
	await navigateDms(editorRoute(templateId.value, targetLocale ?? locale.value))
}

async function runStatusAction(action: StatusAction): Promise<void> {
	const actions = {
		publish: api.publish,
		unpublish: api.unpublish,
		archive: api.archive,
	}
	try {
		await actions[action](templateId.value)
		toast.add({
			color: 'success',
			title: t(`dms_mailing.templates.actions.${STATUS_DONE_KEYS[action]}`),
		})
		settle()
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	}
}

const statusItems = computed(() => [
	(['publish', 'unpublish', 'archive'] as StatusAction[]).map((action) => ({
		label: t(`dms_mailing.templates.actions.${action}`),
		onSelect: () => runStatusAction(action),
	})),
])

async function submitDuplicate(): Promise<void> {
	if (!duplicate.slug || !duplicate.name) return
	try {
		await api.duplicate(templateId.value, duplicate.slug, duplicate.name)
		isDuplicateOpen.value = false
		toast.add({
			color: 'success',
			title: t('dms_mailing.templates.actions.duplicate'),
		})
		settle()
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	}
}

async function addVariable(): Promise<void> {
	if (!newVariable.path || !detail.value) return
	const variables = [...detail.value.variables, { ...newVariable }]
	try {
		await api.saveVariables(templateId.value, variables)
		detail.value.variables = variables
		newVariable.path = ''
		newVariable.required = false
	} catch (error) {
		toast.add({ color: 'error', title: String(error) })
	}
}

onMounted(load)
</script>

<template>
	<!-- The width is pinned because the DMS drawer takes no size: `DrawerOptions`
	has none and `UDrawer` sizes itself to its body, so anything that changes the
	body's intrinsic width resizes the whole panel — here the missing-locale
	notice, which exists for some locales and not others. -->
	<div class="flex w-[28rem] max-w-full flex-col gap-5">
		<USkeleton v-if="loading && !detail" class="h-64 w-full" />

		<template v-else-if="template">
			<div class="flex flex-col gap-1">
				<span class="text-highlighted text-sm font-semibold">
					{{ template.name }}
				</span>
				<span class="text-dimmed font-mono text-[11.5px]">
					{{ template.slug }} · {{ template.updatedBy }}
				</span>
			</div>

			<DmsSegmented
				v-if="localeItems.length > 1"
				v-model="locale"
				:items="localeItems"
				size="xs"
				:aria-label="t('dms_mailing.sends.cols.locale')"
			/>

			<div class="border-default relative overflow-hidden rounded-lg border">
				<DmsMailingTemplatePreviewFrame
					:template-id="templateId"
					:locale="locale"
					:width="PREVIEW_WIDTH"
					:scale="PREVIEW_SCALE"
				/>

				<!-- Laid over the preview rather than stacked under it: the
				notice exists for some locales only, and everything below must
				stay where it is when the locale changes. It also sits on the
				thing it describes, since the frame is showing the fallback. -->
				<div v-if="isLocaleMissing" class="absolute inset-x-0 bottom-0 p-1.5">
					<UAlert
						color="warning"
						variant="subtle"
						icon="i-ph-warning"
						:title="
							t('dms_mailing.templates.drawer.missing_locale', {
								locale: locale.toUpperCase(),
								fallback: (detail?.fallbackLocale ?? '').toUpperCase(),
							})
						"
						:ui="{
							root: 'items-center gap-2 rounded-md p-2 backdrop-blur-sm',
							icon: 'size-4 shrink-0',
							wrapper: 'min-w-0',
							title: 'text-[11.5px] leading-snug font-medium',
						}"
					>
						<template #description>
							<UButton
								variant="link"
								size="xs"
								class="p-0 text-[11.5px]"
								:label="
									t('dms_mailing.templates.drawer.create_locale', {
										locale: locale.toUpperCase(),
									})
								"
								@click="openEditor(locale)"
							/>
						</template>
					</UAlert>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<UButton
					class="flex-1 justify-center"
					icon="i-ph-pencil-simple"
					:label="t('dms_mailing.templates.actions.open_editor')"
					@click="openEditor()"
				/>
				<UButton
					icon="i-ph-paper-plane-tilt"
					color="neutral"
					variant="ghost"
					:title="t('dms_mailing.templates.actions.test_send')"
					@click="openTestSendModal(templateId, locale)"
				/>
				<UButton
					v-if="template && template.status === 'live'"
					icon="i-ph-paper-plane-right"
					color="neutral"
					variant="ghost"
					:title="t('dms_mailing.templates.actions.send')"
					@click="template && openRealSendModal(templateId, template, locale)"
				/>
				<UPopover v-model:open="isDuplicateOpen">
					<UButton
						icon="i-ph-copy"
						color="neutral"
						variant="ghost"
						:title="t('dms_mailing.templates.actions.duplicate')"
					/>
					<template #content>
						<div class="flex w-64 flex-col gap-2 p-3">
							<UInput
								v-model="duplicate.slug"
								:placeholder="t('dms_mailing.templates.cols.slug')"
								size="sm"
							/>
							<UInput
								v-model="duplicate.name"
								:placeholder="t('dms_mailing.templates.cols.name')"
								size="sm"
							/>
							<UButton
								size="sm"
								block
								:label="t('dms_mailing.templates.actions.duplicate')"
								:disabled="!duplicate.slug || !duplicate.name"
								@click="submitDuplicate"
							/>
						</div>
					</template>
				</UPopover>
				<UDropdownMenu :items="statusItems" :content="{ align: 'end' }">
					<UButton icon="i-ph-dots-three" color="neutral" variant="ghost" />
				</UDropdownMenu>
			</div>

			<USeparator />

			<div class="flex flex-col gap-2">
				<h3
					class="text-dimmed font-mono text-[10.5px] uppercase tracking-widest"
				>
					{{ t('dms_mailing.templates.drawer.variables') }}
				</h3>
				<div
					v-for="variable in variables"
					:key="variable.path"
					class="flex items-center gap-2"
				>
					<code
						class="flex-1 truncate font-mono text-[12px]"
						:class="
							variable.usage === 'unused'
								? 'text-dimmed line-through'
								: 'text-toned'
						"
					>
						{{ variable.path }}
					</code>
					<UBadge
						v-if="variable.usage === 'unused'"
						:label="t('dms_mailing.templates.drawer.unused')"
						color="warning"
						variant="subtle"
						size="sm"
					/>
					<UBadge
						v-if="variable.required"
						:label="t('dms_mailing.templates.drawer.required')"
						color="neutral"
						variant="subtle"
						size="sm"
					/>
					<span class="text-dimmed text-[11px]">{{ variable.type }}</span>
				</div>
				<p v-if="!variables.length" class="text-muted text-[12.5px]">
					{{ t('dms_mailing.templates.drawer.no_variables') }}
				</p>
				<div class="flex items-center gap-2">
					<UInput
						v-model="newVariable.path"
						:placeholder="t('dms_mailing.templates.drawer.declare_variable')"
						size="sm"
						class="flex-1"
						list="detected-variable-paths"
					/>
					<datalist id="detected-variable-paths">
						<option v-for="path in undeclaredPaths" :key="path" :value="path" />
					</datalist>
					<USelect
						v-model="newVariable.type"
						:items="variableTypeItems"
						size="sm"
						class="w-28"
					/>
					<USwitch v-model="newVariable.required" size="sm" />
					<UButton
						icon="i-ph-plus"
						color="neutral"
						variant="ghost"
						size="sm"
						:disabled="!newVariable.path"
						@click="addVariable"
					/>
				</div>
			</div>
		</template>
	</div>
</template>

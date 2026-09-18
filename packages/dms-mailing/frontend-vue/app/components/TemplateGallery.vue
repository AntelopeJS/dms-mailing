<script setup lang="ts">
import { editorRoute } from '../utils/editor-route'
import { groupByCategory } from '../utils/gallery'
import type { GalleryDisplayContext } from '../types/component'
import type { TemplateCategory, TemplateRow } from '../types/mailing'

interface TemplateGalleryProps {
	context: GalleryDisplayContext<TemplateRow>
}

const FIRST_PAGE = 1

const props = defineProps<TemplateGalleryProps>()

const api = useMailingApi()
const { t } = useI18n()
const { open: openTemplateDrawer } = useTemplateDrawer()
const { open: openTestSendModal } = useTestSendModal()

// Fetched, not read from the page options: the tenant edits them in Settings,
// and a page declaration is serialised once, at registration.
const categories = ref<TemplateCategory[]>([])

onMounted(async () => {
	try {
		const response = await api.listCategories()
		categories.value = response.categories
	} catch {
		categories.value = []
	}
})

const groups = computed(() =>
	groupByCategory(
		props.context.items,
		categories.value,
		t('dms_mailing.templates.uncategorised'),
	),
)

const page = computed({
	get: () => props.context.pagination.pageIndex + FIRST_PAGE,
	set: (value: number) => props.context.pagination.setPage(value - FIRST_PAGE),
})

function openEditor(template: TemplateRow, locale?: string): void {
	void navigateDms(editorRoute(template._id, locale))
}
</script>

<template>
	<div class="flex flex-col gap-6 p-4">
		<USkeleton v-if="context.loading && !groups.length" class="h-64 w-full" />

		<div
			v-else-if="!groups.length"
			class="flex flex-col items-center gap-3 py-16 text-center"
		>
			<UIcon name="i-ph-envelope-simple" class="text-dimmed size-8" />
			<h3 class="text-highlighted text-sm font-semibold">
				{{ t('dms_mailing.templates.empty.title') }}
			</h3>
			<p class="text-muted text-[13px]">
				{{ t('dms_mailing.templates.empty.hint') }}
			</p>
			<UButton
				color="neutral"
				variant="ghost"
				size="sm"
				:label="t('dms_mailing.templates.empty.reset')"
				@click="context.refresh()"
			/>
		</div>

		<div v-else class="flex flex-col gap-6">
			<div v-for="group in groups" :key="group.category.id">
				<div class="mb-3 flex items-center gap-2">
					<UIcon :name="group.category.icon" class="text-dimmed size-4" />
					<h2 class="text-highlighted text-[13px] font-semibold">
						{{ group.category.label }}
					</h2>
					<span class="text-dimmed font-mono text-[11.5px]">
						{{ group.items.length }}
					</span>
					<span class="bg-default ml-2 h-px flex-1" />
				</div>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4">
					<DmsMailingTemplateCard
						v-for="template in group.items"
						:key="template._id"
						:template="template"
						@open="openEditor(template)"
						@open-locale="(code: string) => openEditor(template, code)"
						@details="openTemplateDrawer(template._id)"
						@test-send="openTestSendModal(template._id)"
					/>
				</div>
			</div>
		</div>

		<div
			v-if="context.pagination.total > context.pagination.pageSize"
			class="flex justify-end"
		>
			<UPagination
				v-model:page="page"
				:items-per-page="context.pagination.pageSize"
				:total="context.pagination.total"
			/>
		</div>
	</div>
</template>

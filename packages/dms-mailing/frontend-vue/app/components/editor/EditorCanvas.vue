<script setup lang="ts">
import { computed, provide } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { TOKEN_DATA_KEY } from '../../utils/tokens'
import type { TokenData } from '../../utils/tokens'

const DEVICE_WIDTHS: Record<string, number> = {
	desktop: 600,
	mobile: 380,
}

const { editor, session } = useEditorContext()

const width = computed(() => `${DEVICE_WIDTHS[editor.device]}px`)
const tokenData = computed<TokenData>(() =>
	editor.isDataMode ? (session.testData ?? {}) : null,
)

provide(TOKEN_DATA_KEY, tokenData)
</script>

<template>
	<main
		class="min-h-0 min-w-0 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--ui-text-highlighted)_7%,transparent)_1px,transparent_0)] bg-[length:18px_18px] px-6 pb-16 pt-7"
		@click="editor.select(null)"
	>
		<div
			class="mx-auto max-w-full transition-[width] duration-200"
			:style="{ width }"
		>
			<MailingEditorMissingLocale v-if="!editor.current" />
			<template v-else>
				<MailingEditorEnvelope />
				<div
					class="rounded-lg bg-white px-9 py-8 text-gray-900 shadow-xl"
					@click.stop="editor.select(null)"
				>
					<MailingEditorBlockList :list="editor.current.blocks" />
				</div>
			</template>
		</div>
	</main>
</template>

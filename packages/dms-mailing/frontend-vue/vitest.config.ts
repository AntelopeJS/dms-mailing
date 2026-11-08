import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'#dms-layout': fileURLToPath(
				new URL(
					'../node_modules/@antelopejs/dms/frontend-vue/layers/dms-layout',
					import.meta.url,
				),
			),
		},
	},
	test: {
		// Most suites need no DOM, and setting jsdom up per file is the bulk of
		// the run; the files that mount components opt in with a
		// `// @vitest-environment jsdom` header.
		environment: 'node',
		include: ['tests/**/*.test.ts'],
	},
})

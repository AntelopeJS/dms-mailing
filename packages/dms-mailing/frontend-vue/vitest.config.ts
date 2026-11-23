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
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['tests/**/*.test.ts'],
					exclude: ['tests/**/*.dom.test.ts'],
					typecheck: {
						enabled: true,
						include: ['tests/**/*.test-d.ts'],
						tsconfig: 'tsconfig.typecheck.json',
					},
				},
			},
			{
				extends: true,
				test: {
					name: 'dom',
					environment: 'jsdom',
					include: ['tests/**/*.dom.test.ts'],
				},
			},
		],
	},
})

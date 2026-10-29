import antiSlop from '@antelopejs/tooling-configs/oxc/anti-slop'
import guardrails from '@antelopejs/tooling-configs/oxc/guardrails'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default [
	{ ignores: ['node_modules/**'] },
	...vue.configs['flat/essential'],
	{
		files: ['**/*.ts', '**/*.vue'],
		languageOptions: { parserOptions: { parser: ts.parser } },
		rules: { 'vue/multi-word-component-names': 'off' },
	},
	{ files: ['**/*.ts'], languageOptions: { parser: ts.parser } },
	{
		files: ['tests/**/*.ts'],
		plugins: { antelopejs: guardrails, 'anti-slop': antiSlop },
		rules: {
			'antelopejs/no-fs-read-in-tests': 'error',
			'antelopejs/no-constant-value-assertion': 'error',
			'antelopejs/no-typeof-function-only-test': 'error',
			'antelopejs/no-self-import-in-tests': 'error',
			'anti-slop/no-module-mocking': 'error',
		},
	},
]

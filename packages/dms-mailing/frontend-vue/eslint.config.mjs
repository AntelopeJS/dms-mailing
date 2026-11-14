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
			'no-restricted-syntax': [
				'error',
				{
					selector:
						'CallExpression:matches([callee.name=/^(it|test)$/], [callee.object.name=/^(it|test)$/], [callee.callee.object.name=/^(it|test)$/]) ImportExpression',
					message:
						'Import the module under test statically at the top of the file: a dynamic import inside a test body counts the module load in the test timeout.',
				},
			],
		},
	},
]

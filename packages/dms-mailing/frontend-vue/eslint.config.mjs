import { antelopeNuxtConfig } from '@antelopejs/tooling-configs/eslint'

export default antelopeNuxtConfig({
	typeAware: { tsconfigRootDir: import.meta.dirname },
})
	.prepend({ ignores: ['.dms-types/**'] })
	.append({
		files: ['tests/**/*.ts'],
		rules: {
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
	})

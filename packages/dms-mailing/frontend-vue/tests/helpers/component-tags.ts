import { readdir, readFile } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAYER_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DMS_LAYERS = fileURLToPath(
	new URL(
		'../../../node_modules/@antelopejs/dms/frontend-vue/layers',
		import.meta.url,
	),
)
const DMS_TAG = /<\/?(Dms[A-Z][\w]*|dms-[a-z][\w-]*)(?=[\s/>])/g

async function vueFiles(root: string): Promise<string[]> {
	const paths = await readdir(root, { recursive: true, encoding: 'utf8' })
	return paths
		.filter((path) => path.endsWith('.vue') && !path.includes('node_modules'))
		.map((path) => join(root, path))
}

function pascal(tag: string): string {
	return tag
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')
}

/** Names a component directory registers under `prefix`: the prefix and each file's base name, as `dms.frontend.ts` registers them. */
function registered(prefix: string, files: string[]): string[] {
	return files.map((file) => `${prefix}${basename(file, '.vue')}`)
}

/** Every component the installed DMS layers and this layer's `app/components` register. */
export async function knownComponents(): Promise<Set<string>> {
	const dms = await vueFiles(DMS_LAYERS)
	const own = await vueFiles(join(LAYER_ROOT, 'app', 'components'))
	return new Set([
		...registered(
			'Dms',
			dms.filter((file) => file.includes(`${sep}app${sep}components${sep}`)),
		),
		...registered('Mailing', own),
	])
}

/** Every `Dms*` or `dms-*` tag of this layer's `.vue` files, as `file: Name`, in Pascal case. */
export async function dmsTags(): Promise<string[]> {
	const files = await vueFiles(join(LAYER_ROOT, 'app'))
	const sources = await Promise.all(
		files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })),
	)
	return sources.flatMap(({ file, text }) =>
		Array.from(
			text.matchAll(DMS_TAG),
			(match) => `${file.slice(LAYER_ROOT.length)}: ${pascal(match[1] ?? '')}`,
		),
	)
}

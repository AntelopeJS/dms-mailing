import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms/frontend-module'
import templateGallery from './app/plugins/template-gallery-display.client'

interface VueModule {
	default: Component
}

const components = import.meta.glob<VueModule>('./app/components/**/*.vue')

const frontendModule: DmsFrontendModule = {
	setup(sdk) {
		Object.entries(components)
			.sort()
			.forEach(([path, loader]) => {
				const name = path
					.split('/')
					.at(-1)!
					.replace(/\.vue$/, '')
				const prefix = path.includes('/components/blocks/')
					? 'DmsMailingBlock'
					: 'DmsMailing'
				sdk.registerComponent(`${prefix}${name}`, defineAsyncComponent(loader))
			})
		sdk.registerPlugin(templateGallery, { clientOnly: true })
	},
}

export default frontendModule

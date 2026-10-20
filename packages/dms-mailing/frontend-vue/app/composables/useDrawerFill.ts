import { useResizeObserver } from '@vueuse/core'
import { onMounted, ref, type Ref } from 'vue'

/** The scrolling body of the DMS drawer (the Nuxt UI drawer's body slot). */
const DRAWER_BODY_SELECTOR = "[data-slot='body']"

/**
 * The height, in pixels, a drawer component needs to fill the drawer body:
 * its content box, less what sits above the component inside it.
 */
export function drawerFillHeight(body: HTMLElement, root: HTMLElement): number {
	const style = getComputedStyle(body)
	const paddingTop = parseFloat(style.paddingTop) || 0
	const paddingBottom = parseFloat(style.paddingBottom) || 0
	const offset =
		root.getBoundingClientRect().top -
		body.getBoundingClientRect().top +
		body.scrollTop -
		paddingTop
	return Math.max(
		0,
		body.clientHeight - paddingTop - paddingBottom - Math.max(0, offset),
	)
}

/**
 * Keeps a drawer component at least as tall as the drawer body, so its
 * footer (`mt-auto`, sticky) sits at the bottom of the drawer even when the
 * content is a little shorter. The DMS body hugs its content (the container
 * around the component is a block), so CSS alone cannot stretch it.
 *
 * @returns the `min-height` to bind on the component's root, undefined
 * outside a drawer.
 */
export function useDrawerFill(
	root: Ref<HTMLElement | null>,
): Ref<string | undefined> {
	const body = ref<HTMLElement | null>(null)
	const minHeight = ref<string>()

	const update = (): void => {
		if (!body.value || !root.value) return
		minHeight.value = `${drawerFillHeight(body.value, root.value)}px`
	}

	onMounted(() => {
		body.value = root.value?.closest<HTMLElement>(DRAWER_BODY_SELECTOR) ?? null
		update()
	})
	useResizeObserver(body, update)

	return minHeight
}

/**
 * The footer of a drawer component: pushed to the bottom of the component
 * (which `useDrawerFill` keeps as tall as the drawer body), it sticks to the
 * bottom of the scrolling body and reaches over its bottom padding to sit
 * flush with the edge, as a form footer does in a container (the DMS
 * `FORM_SURFACE_CLASSES.container` foot).
 */
export const DRAWER_FOOTER_CLASS =
	'border-default bg-default sticky bottom-[calc(var(--dms-form-foot-pb,0px)*-1)] z-10 mt-auto -mx-[var(--dms-form-foot-px,0px)] -mb-[var(--dms-form-foot-pb,0px)] flex items-center gap-2 border-t px-[var(--dms-form-foot-px,0px)] pt-3 pb-[var(--dms-form-foot-pb,12px)]'

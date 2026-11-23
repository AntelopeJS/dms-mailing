import type { Ref } from 'vue'
import { describe, expectTypeOf, it } from 'vitest'
import { useSortableList } from '../app/composables/useSortableList'

/**
 * The item of the list the type test checks: `ajs dms verify-source`
 * type-checks the layer against the installed `@vueuse/integrations`, so the
 * composable has to compile against its `useSortable` overloads, which take
 * the list as a `MaybeRef`, not a getter.
 */
interface ListItem {
	id: string
}

describe('useSortableList', () => {
	it('takes the list as a getter and compiles against useSortable', () => {
		expectTypeOf(useSortableList<ListItem>)
			.parameter(1)
			.toEqualTypeOf<() => ListItem[]>()
		expectTypeOf(useSortableList<ListItem>)
			.parameter(0)
			.toEqualTypeOf<Ref<HTMLElement | null>>()
	})
})

/**
 * `ajs dms verify-source` type-checks the layer against the installed
 * `@vueuse/integrations`: the composable has to compile against its
 * `useSortable` overloads, which take the list as a `MaybeRef`, not a getter.
 */
import type { Ref } from 'vue'
import { describe, expectTypeOf, it } from 'vitest'
import { useSortableList } from '../app/composables/useSortableList'

describe('useSortableList', () => {
	it('takes the list as a getter and compiles against useSortable', () => {
		expectTypeOf(useSortableList<{ id: string }>)
			.parameter(1)
			.toEqualTypeOf<() => { id: string }[]>()
		expectTypeOf(useSortableList<{ id: string }>)
			.parameter(0)
			.toEqualTypeOf<Ref<HTMLElement | null>>()
	})
})

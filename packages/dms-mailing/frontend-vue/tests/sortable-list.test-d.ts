import type { Ref } from 'vue'
import { describe, expectTypeOf, it } from 'vitest'
import { useSortableList } from '../app/composables/useSortableList'

/** The item of the list the type test checks. */
interface ListItem {
	id: string
}

describe('useSortableList', () => {
	it('takes the list as a getter, though useSortable takes a MaybeRef, as ajs dms verify-source type-checks it', () => {
		expectTypeOf(useSortableList<ListItem>)
			.parameter(1)
			.toEqualTypeOf<() => ListItem[]>()
		expectTypeOf(useSortableList<ListItem>)
			.parameter(0)
			.toEqualTypeOf<Ref<HTMLElement | null>>()
	})
})

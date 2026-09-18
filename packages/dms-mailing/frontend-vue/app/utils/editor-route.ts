export const EDITOR_PATH = '/modules/mailing/editor'

export interface EditorRouteQuery extends Record<string, string | undefined> {
	id: string
	locale?: string
}

export interface EditorRoute {
	path: string
	query: EditorRouteQuery
}

export function editorRoute(templateId: string, locale?: string): EditorRoute {
	return {
		path: EDITOR_PATH,
		query: locale ? { id: templateId, locale } : { id: templateId },
	}
}

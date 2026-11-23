/** A response body a mocked backend answers with. */
export type ApiAnswer =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly ApiAnswer[]
	| ApiRecord

/** A JSON object in a mocked backend's answer or request. */
export interface ApiRecord {
	readonly [key: string]: ApiAnswer
}

/** What a mocked backend returns: its answer, settled or not. */
export type ApiReply = ApiAnswer | Promise<ApiAnswer>

/** Whether an answer is a JSON object rather than a scalar or an array. */
export function isApiRecord(answer: ApiAnswer): answer is ApiRecord {
	return Object(answer) === answer && !Array.isArray(answer)
}

/** A response body a mocked backend answers with. */
export type ApiAnswer = string | number | boolean | null | undefined | object

/** What a mocked backend returns: its answer, settled or not. */
export type ApiReply = ApiAnswer | Promise<ApiAnswer>

/** A value of a request's query string. */
export type QueryValue = string | number | boolean | readonly string[]

/** A request's query string. */
export type ApiQuery = Record<string, QueryValue>

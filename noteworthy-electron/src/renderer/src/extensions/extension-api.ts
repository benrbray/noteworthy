
export type TagSearchResult = {
	/** tag name **/
	result: string,
	/** tag name, split into named chunks to reflect alignment with a query **/
	resultEmphasized: { text: string, emph?: boolean }[];
}

export interface NoteworthyExtensionApi {
	fuzzyTagSearch(query: string): Promise<TagSearchResult[]>
}

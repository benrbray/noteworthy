import { Suspense, createSignal, For, useTransition, createResource, Match, createResourceState } from "solid-js";
import { LoadingSpinner } from "./loading";
import { ITagSearchResult, IFileSearchResult } from "@main/plugins/crossref-plugin";

interface ITagSearchProps {
	getSearchResults: (query:string)=>Promise<(ITagSearchResult|IFileSearchResult)[]>;
	handleTagClick: (event:MouseEvent)=>void;
	handleFileClick: (event:MouseEvent)=>void;
}

export const TagSearch = (props:ITagSearchProps) => {
	const [searchResults, loadResults] = createResourceState<{files:(ITagSearchResult|IFileSearchResult)[]}>({ files: [] });

	const onChange = async (val: Event & {target: HTMLInputElement} ) => {
		loadResults({ files: props.getSearchResults(val.target.value) });
	}

	return (
		<div id="tab_tags" class="tab-contents">
			<input onInput={onChange } placeholder="Search Tags..." />
			<div id="tag_results">
				<Suspense fallback={<LoadingSpinner />}>
					<For each={searchResults.files}>
					{ entry => {
						if(entry.type == "tag-result"){
							return (<div class="list-item search-result" 
									data-tag={entry.result} 
									onClick={props.handleTagClick}
									innerHTML={entry.resultEmphasized} />)
						} else if(entry.type == "file-result"){
							return (<div class="list-item search-result" 
									data-filehash={entry.file.hash} 
									title={entry.file.path}
									onClick={props.handleFileClick}
									innerHTML={entry.file.name} />)
						}
					}}
					</For>
				</Suspense>
			</div>
		</div>
	);
}
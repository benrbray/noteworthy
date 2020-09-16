import { Suspense, createSignal, For, useTransition, createResource, Match, createResourceState } from "solid-js";
import { LoadingSpinner } from "./loading";
import { ITagSearchResult } from "@main/plugins/crossref-plugin";

interface ITagSearchProps {
	getSearchResults: (query:string)=>Promise<ITagSearchResult[]>;
	handleClick: (event:MouseEvent)=>void;
}

export const TagSearch = (props:ITagSearchProps) => {
	const [searchResults, loadResults] = createResourceState<{files:ITagSearchResult[]}>({ files: [] });

	const onChange = async (val: Event & {target: HTMLInputElement} ) => {
		loadResults({ files: props.getSearchResults(val.target.value) });
	}

	return (
		<div id="tab_tags" class="tab-contents">
			<input onInput={onChange } placeholder="Search Tags..." />
			<div id="tag_results">
				<Suspense fallback={<LoadingSpinner />}>
					<For each={searchResults.files}>
					{ entry => (
						<div class="list-item search-result" 
							 data-tag={entry.result} 
							 onClick={props.handleClick}
							 innerHTML={entry.resultEmphasized} />
					)}
					</For>
				</Suspense>
			</div>
		</div>
	);
}
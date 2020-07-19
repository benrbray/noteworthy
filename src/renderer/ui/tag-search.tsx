import { Suspense, createSignal, For, useTransition, createResource, Match, createResourceState } from "solid-js";
import { IFileMeta } from "@common/fileio";
import { LoadingSpinner } from "./loading";

interface ITagSearchProps {
	getSearchResults: (query:string)=>Promise<IFileMeta[]>;
	handleClick: (event:MouseEvent)=>void;
}

export const TagSearch = (props:ITagSearchProps) => {
	const [searchResults, loadResults] = createResourceState<{files:IFileMeta[]}>({ files: [] });

	const onChange = async (val: Event & {target: HTMLInputElement} ) => {
		loadResults({ files: props.getSearchResults(val.target.value) });
	}

	return (
		<div id="tab_tags">
			<input onInput={onChange } />
			<div id="tag_results">
				<Suspense fallback={<LoadingSpinner />}>
					<For each={searchResults.files}>
					{ entry => (
						<div class="file" data-filehash={entry.hash} onClick={props.handleClick}>{entry.name}</div>
					)}
					</For>
				</Suspense>
			</div>
		</div>
	);
}
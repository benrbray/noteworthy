import { Suspense, For, createResource, JSX } from "solid-js";
import { Loading } from "./loading";
import { ITagSearchResult, IFileSearchResult } from "@main/plugins/crossref-plugin";

interface ITagSearchProps {
	getSearchResults: (query:string)=>Promise<(ITagSearchResult|IFileSearchResult)[]>;
	handleTagClick: (event:MouseEvent)=>void;
	handleFileClick: (event:MouseEvent)=>void;
}

export const TagSearch = (props:ITagSearchProps) => {
	const [results, setResults] = createResource<{files:(ITagSearchResult|IFileSearchResult)[]}>(
		(k, getPrev) => ({ files: [] })
	);

	const onChange: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = async (val) => {
		setResults.mutate({ files: await props.getSearchResults(val.currentTarget.value) });
	}

	return (
		<div id="tab_tags" class="tab-contents">
			<input onInput={onChange} placeholder="Search Tags..." />
			<div id="tag_results">
				<Suspense fallback={<Loading />}>
					<For each={results()?.files || []}>
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
						} else {
              return undefined;
            }
					}}
					</For>
				</Suspense>
			</div>
		</div>
	);
}

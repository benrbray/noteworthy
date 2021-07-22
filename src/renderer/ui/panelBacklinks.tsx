import { Suspense, For, createResource, JSX } from "solid-js";
import { MainIpcHandlers } from "@main/MainIPC";
import { IFileMeta } from "@common/files";

interface PanelBacklinksProps {
	proxy: MainIpcHandlers;
	hash: string|null;
	fileName: string|null;
	handleFileClick: (event:MouseEvent)=>void;
}

export const PanelBacklinks = (props: PanelBacklinksProps) => {

	const [backlinks] = createResource<{data: IFileMeta[] }, typeof props>(
		() => props,
		async (pr, getPrev) => {
			if(!pr.hash) { return { data: [] }; }
			return { data: await pr.proxy.tag.backlinkSearch(pr.hash) };
		}
	)
	
	return (<div id="panel-info" class="panel">
		<div class="panel-header">{`backlinks for ${props.fileName || "<missing>"}`}</div>
		<div class="panel-content">
			<Suspense fallback={<div>loading...</div>}>
				<ul class="file-list">
					<For each={backlinks()?.data || []}>
						{backlink => (
							<li class="file" onClick={props.handleFileClick} data-fileHash={backlink.hash}>
								<span class="file-name">{backlink.name}</span>
								<span class="file-path">{backlink.path}</span>
							</li>
						)}
					</For>
				</ul>
			</Suspense>
		</div>
	</div>);
}
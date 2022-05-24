import { Suspense, For, createResource, JSX } from "solid-js";
import { MainIpcHandlers } from "@main/MainIPC";
import { IFileMeta } from "@common/files";

interface PanelBacklinksProps {
	proxy: MainIpcHandlers;
	hash: string|null;
	fileName: string|null;
	handleFileClick: (event:MouseEvent)=>void;
}

interface BacklinksData {
	//data: IFileMeta[]
	data: { citation: string | null, meta: IFileMeta }[];
}

export const PanelBacklinks = (props: PanelBacklinksProps) => {

	const [backlinks] = createResource<BacklinksData, typeof props>(
		() => props,
		async (pr, getPrev) => {
			if(!pr.hash) { return { data: [] }; }

			const search = await pr.proxy.tag.backlinkSearch(pr.hash);
			const result = await Promise.all(search.map(async (meta) => {
					const citation = await pr.proxy.citations.getCitationForHash(meta.hash);
					return { citation, meta };
				}
			))

			console.log("backlinks\n", JSON.stringify(result, undefined, 2));

			return { data: result }
		}
	)
	
	return (<div id="panel-info" class="panel">
		<div class="panel-header">{`backlinks for ${props.fileName || "<missing>"}`}</div>
		<div class="panel-content">
			<Suspense fallback={<div>loading...</div>}>
				<ul class="file-list">
					<For each={backlinks()?.data || []}>
						{backlink => (
							<li class="file" onClick={props.handleFileClick} data-fileHash={backlink.meta.hash}>
								<span class="file-name">{backlink.meta.name}</span>
								<span class="file-cite">{backlink.citation || "<>"}</span>
								<span class="file-path">{backlink.meta.path}</span>
							</li>
						)}
					</For>
				</ul>
			</Suspense>
		</div>
	</div>);
}